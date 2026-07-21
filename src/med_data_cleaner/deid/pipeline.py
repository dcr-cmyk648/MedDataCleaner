from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from med_data_cleaner.deid.models import (
    DeidentificationResult,
    Detection,
    Detector,
    DetectorStatus,
    Finding,
    ManualFinding,
    PipelineInputError,
)
from med_data_cleaner.deid.policy import (
    ALLOWED_MANUAL_ENTITY_TYPES,
    ENTITY_PRIORITY,
    PLACEHOLDER_LABELS,
    POLICY_ID,
    normalize_entity_type,
)
from med_data_cleaner.deid.presidio_detector import PresidioDetector
from med_data_cleaner.deid.regex_detector import PLACEHOLDER_PATTERN, RegexDetector

MAX_TEXT_LENGTH = 500_000
CONTEXTUAL_TYPE_RECOGNIZERS = {
    "LOCATION": frozenset({"concatenated-facility-name", "labeled-facility-name"}),
    "PERSON": frozenset({"labeled-name", "relationship-name", "titled-clinician-name"}),
    "UNIQUE_ID": frozenset({"other-contextual-identifier", "provider-identifier"}),
}


def _detection_rank(item: Detection) -> tuple[bool, int, float]:
    contextual = CONTEXTUAL_TYPE_RECOGNIZERS.get(item.entity_type, frozenset())
    return (
        any(recognizer in contextual for recognizer in item.recognizers),
        ENTITY_PRIORITY.get(item.entity_type, 0),
        item.score,
    )


@dataclass(frozen=True, slots=True)
class Replacement:
    start: int
    end: int
    value: str


class DeidentificationPipeline:
    def __init__(
        self,
        detectors: Sequence[Detector] | None = None,
        *,
        max_text_length: int = MAX_TEXT_LENGTH,
    ) -> None:
        self.detectors: tuple[Detector, ...] = tuple(
            detectors if detectors is not None else (RegexDetector(), PresidioDetector())
        )
        self.max_text_length = max_text_length

    @property
    def detector_statuses(self) -> tuple[DetectorStatus, ...]:
        return tuple(detector.status for detector in self.detectors)

    @property
    def engine_ready(self) -> bool:
        return all(status.ready for status in self.detector_statuses if status.required)

    def deidentify(
        self,
        text: str,
        *,
        excluded_finding_ids: Iterable[str] = (),
        manual_findings: Iterable[ManualFinding] = (),
    ) -> DeidentificationResult:
        self._validate_text(text)
        exclusions = frozenset(excluded_finding_ids)
        manual = tuple(manual_findings)
        self._validate_manual_findings(text, manual)

        automatic_detections = self._merge_overlaps(self._detect_all(text))
        automatic_findings = tuple(
            Finding(
                finding_id=f"auto-{index:04d}",
                start=detection.start,
                end=detection.end,
                entity_type=detection.entity_type,
                score=detection.score,
                recognizers=detection.recognizers,
                selected=f"auto-{index:04d}" not in exclusions,
            )
            for index, detection in enumerate(automatic_detections, start=1)
        )

        selected_detections = [
            detection
            for detection, finding in zip(automatic_detections, automatic_findings, strict=True)
            if finding.selected
        ]
        manual_detections = [
            Detection(
                start=finding.start,
                end=finding.end,
                entity_type=normalize_entity_type(finding.entity_type),
                score=1.0,
                recognizers=("human-review",),
                explanation="Added during local human review",
            )
            for finding in manual
        ]
        manual_public_findings = tuple(
            Finding(
                finding_id=f"manual-{index:04d}",
                start=detection.start,
                end=detection.end,
                entity_type=detection.entity_type,
                score=detection.score,
                recognizers=detection.recognizers,
                selected=True,
                source="manual",
            )
            for index, detection in enumerate(manual_detections, start=1)
        )

        applied = self._merge_overlaps([*selected_detections, *manual_detections])
        cleaned_text, replacements = self._replace(text, applied)

        exemptions = self._map_excluded_spans(
            automatic_findings=automatic_findings,
            replacements=replacements,
        )
        residual_detections = self._merge_overlaps(self._detect_all(cleaned_text))
        residual_detections = [
            detection
            for detection in residual_detections
            if not self._inside_placeholder(cleaned_text, detection)
            and not self._is_reviewed_exemption(detection, exemptions)
        ]
        residual_findings = tuple(
            Finding(
                finding_id=f"residual-{index:04d}",
                start=detection.start,
                end=detection.end,
                entity_type=detection.entity_type,
                score=detection.score,
                recognizers=detection.recognizers,
                selected=False,
                source="residual",
            )
            for index, detection in enumerate(residual_detections, start=1)
        )

        block_reasons: list[str] = []
        if not self.engine_ready:
            block_reasons.append("A required local detector is unavailable.")
        if residual_findings:
            block_reasons.append("The cleaned text still contains unresolved findings.")

        return DeidentificationResult(
            cleaned_text=cleaned_text,
            findings=(*automatic_findings, *manual_public_findings),
            residual_findings=residual_findings,
            detector_statuses=self.detector_statuses,
            policy_id=POLICY_ID,
            export_allowed=not block_reasons,
            export_block_reasons=tuple(block_reasons),
        )

    def _validate_text(self, text: str) -> None:
        if not isinstance(text, str) or not text.strip():
            raise PipelineInputError("Text is required")
        if len(text) > self.max_text_length:
            raise PipelineInputError("Text exceeds the local processing limit")
        if "\x00" in text:
            raise PipelineInputError("Text contains an unsupported null character")

    @staticmethod
    def _validate_manual_findings(text: str, findings: Sequence[ManualFinding]) -> None:
        if len(findings) > 1_000:
            raise PipelineInputError("Too many manual findings")
        for finding in findings:
            if finding.entity_type not in ALLOWED_MANUAL_ENTITY_TYPES:
                raise PipelineInputError("Manual finding category is invalid")
            if finding.start < 0 or finding.end <= finding.start or finding.end > len(text):
                raise PipelineInputError("Manual finding offsets are invalid")

    def _detect_all(self, text: str) -> list[Detection]:
        detections: list[Detection] = []
        for detector in self.detectors:
            if detector.status.ready:
                detections.extend(detector.detect(text))
        return [
            detection
            for detection in detections
            if 0 <= detection.start < detection.end <= len(text)
        ]

    @staticmethod
    def _merge_overlaps(detections: Iterable[Detection]) -> list[Detection]:
        ordered = sorted(
            detections,
            key=lambda item: (item.start, item.end, -item.score, item.entity_type),
        )
        if not ordered:
            return []

        merged: list[Detection] = []
        current = ordered[0]
        for candidate in ordered[1:]:
            if candidate.start >= current.end:
                merged.append(current)
                current = candidate
                continue

            current_rank = _detection_rank(current)
            candidate_rank = _detection_rank(candidate)
            winning_type = (
                candidate.entity_type if candidate_rank > current_rank else current.entity_type
            )
            current = Detection(
                start=min(current.start, candidate.start),
                end=max(current.end, candidate.end),
                entity_type=winning_type,
                score=max(current.score, candidate.score),
                recognizers=tuple(sorted(set(current.recognizers + candidate.recognizers))),
                explanation="Combined overlapping local detections",
            )
        merged.append(current)
        return merged

    @staticmethod
    def _replace(text: str, detections: Sequence[Detection]) -> tuple[str, tuple[Replacement, ...]]:
        counters: dict[str, int] = defaultdict(int)
        value_tokens: dict[tuple[str, str], str] = {}
        replacements: list[Replacement] = []

        for detection in detections:
            label = PLACEHOLDER_LABELS[normalize_entity_type(detection.entity_type)]
            transient_value_key = (label, text[detection.start : detection.end].casefold())
            replacement_value = value_tokens.get(transient_value_key)
            if replacement_value is None:
                counters[label] += 1
                replacement_value = f"[{label}_{counters[label]}]"
                value_tokens[transient_value_key] = replacement_value
            replacements.append(
                Replacement(
                    start=detection.start,
                    end=detection.end,
                    value=replacement_value,
                )
            )

        cleaned = text
        for replacement in reversed(replacements):
            cleaned = cleaned[: replacement.start] + replacement.value + cleaned[replacement.end :]
        return cleaned, tuple(replacements)

    @staticmethod
    def _map_original_span(
        start: int,
        end: int,
        replacements: Sequence[Replacement],
    ) -> tuple[int, int] | None:
        delta = 0
        for replacement in replacements:
            if replacement.end <= start:
                delta += len(replacement.value) - (replacement.end - replacement.start)
                continue
            if replacement.start >= end:
                break
            return None
        return start + delta, end + delta

    @classmethod
    def _map_excluded_spans(
        cls,
        *,
        automatic_findings: Sequence[Finding],
        replacements: Sequence[Replacement],
    ) -> tuple[tuple[int, int, str], ...]:
        exemptions: list[tuple[int, int, str]] = []
        for finding in automatic_findings:
            if finding.selected:
                continue
            mapped = cls._map_original_span(finding.start, finding.end, replacements)
            if mapped is not None:
                exemptions.append((mapped[0], mapped[1], finding.entity_type))
        return tuple(exemptions)

    @staticmethod
    def _is_reviewed_exemption(
        detection: Detection,
        exemptions: Sequence[tuple[int, int, str]],
    ) -> bool:
        return any(
            detection.start >= start
            and detection.end <= end
            and detection.entity_type == entity_type
            for start, end, entity_type in exemptions
        )

    @staticmethod
    def _inside_placeholder(text: str, detection: Detection) -> bool:
        return any(
            detection.start >= match.start() and detection.end <= match.end()
            for match in PLACEHOLDER_PATTERN.finditer(text)
        )
