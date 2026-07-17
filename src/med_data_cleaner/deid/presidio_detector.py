from __future__ import annotations

import os
import re
from typing import Any

from med_data_cleaner.deid.models import Detection, DetectorStatus
from med_data_cleaner.deid.policy import normalize_entity_type

CLINICAL_HEADER_ALLOWLIST = frozenset(
    {
        "A1C",
        "BMP",
        "CBC",
        "CMP",
        "CT",
        "DOB",
        "ECG",
        "ED",
        "EKG",
        "ER",
        "HIPAA",
        "HPI",
        "ICU",
        "MRI",
        "MRN",
        "NPI",
        "PHI",
        "PMH",
        "PSH",
        "ROS",
        "SSN",
    }
)
GEOGRAPHIC_SUFFIX_PATTERN = re.compile(
    r"^[ \t]+(?:avenue|ave\.?|boulevard|blvd\.?|court|ct\.?|drive|dr\.?|highway|hwy\.?|"
    r"island|lane|ln\.?|parkway|pkwy\.?|road|rd\.?|street|st\.?)\b",
    re.IGNORECASE,
)
MEDICATION_CONTEXT_PATTERN = re.compile(
    r"(?:\b(?:takes?|taking|uses?|using|continue(?:d|s)?|prescribed|given|administered)[ \t]+|"
    r"\b(?:is|was|started|remains|continued)[ \t]+on[ \t]+|"
    r"\btreated[ \t]+with[ \t]+)$",
    re.IGNORECASE,
)
NATIONAL_CHAIN_TERMS = frozenset(
    {"COSTCO", "CVS", "KROGER", "MEIJER", "RITE AID", "WALGREENS", "WALMART"}
)
GENERIC_CHAIN_CONTEXT_PATTERN = re.compile(
    r"(?:\b(?:go(?:es|ing)?|went|shops?|shopped|shopping|visits?|visited|visiting)"
    r"[ \t]+(?:to|at)[ \t]+|\b(?:fills?|filled|filling)[ \t]+(?:at|with)[ \t]+|"
    r"\bpharmacy(?:[ \t]+is)?[ \t]+(?:at[ \t]+)?)$",
    re.IGNORECASE,
)


class PresidioDetector:
    """Presidio adapter that never downloads a model and fails closed when one is missing."""

    def __init__(self, model_name: str | None = None, score_threshold: float = 0.35) -> None:
        self.model_name = model_name or os.environ.get("MDC_SPACY_MODEL", "en_core_web_lg")
        self.score_threshold = score_threshold
        self._engine: Any | None = None
        self._status = self._build_engine()

    @property
    def status(self) -> DetectorStatus:
        return self._status

    def _build_engine(self) -> DetectorStatus:
        try:
            import spacy
            import tldextract
            from presidio_analyzer import AnalyzerEngine
            from presidio_analyzer.nlp_engine import NlpEngineProvider
        except ImportError:
            return DetectorStatus(
                name="presidio-local-ner",
                ready=False,
                required=True,
                detail="Presidio or spaCy is not installed; export is blocked",
            )

        # Presidio's email recognizer calls tldextract. Its default singleton may attempt to
        # refresh the public-suffix list over HTTPS. Replace it with the bundled snapshot so a
        # clinical-text scan cannot initiate a network request or write a shared user cache.
        tldextract.extract = tldextract.TLDExtract(
            cache_dir=None,
            suffix_list_urls=(),
            fallback_to_snapshot=True,
        )

        if not spacy.util.is_package(self.model_name):
            return DetectorStatus(
                name="presidio-local-ner",
                ready=False,
                required=True,
                detail=f"Local spaCy model '{self.model_name}' is not installed; export is blocked",
            )

        try:
            configuration = {
                "nlp_engine_name": "spacy",
                "models": [{"lang_code": "en", "model_name": self.model_name}],
            }
            provider = NlpEngineProvider(nlp_configuration=configuration)
            nlp_engine = provider.create_engine()
            self._engine = AnalyzerEngine(nlp_engine=nlp_engine, supported_languages=["en"])
        except Exception:
            self._engine = None
            return DetectorStatus(
                name="presidio-local-ner",
                ready=False,
                required=True,
                detail="The local Presidio engine could not initialize; export is blocked",
            )

        return DetectorStatus(
            name="presidio-local-ner",
            ready=True,
            required=True,
            detail=f"Presidio with local model '{self.model_name}' ready",
        )

    def detect(self, text: str) -> list[Detection]:
        if self._engine is None:
            return []

        results = self._engine.analyze(
            text=text,
            language="en",
            score_threshold=self.score_threshold,
            return_decision_process=True,
        )
        detections: list[Detection] = []
        for result in results:
            if result.entity_type == "NRP":
                # spaCy's NORP/Presidio's NRP label describes nationalities and affiliations, not
                # a unique identifier. Short clinical headers such as DOB and MRN are also common
                # false positives for this class.
                continue
            explanation = getattr(result, "analysis_explanation", None)
            recognizer = getattr(explanation, "recognizer", None) or "presidio"
            raw_span = text[result.start : result.end]
            # General-purpose NER occasionally joins a name to the following all-caps clinical
            # header across a newline. Split those spans so identifiers are still removed without
            # destroying structural labels such as DOB and MRN.
            for segment_match in re.finditer(r"[^\r\n]+", raw_span):
                segment = segment_match.group()
                leading = len(segment) - len(segment.lstrip())
                trailing = len(segment.rstrip())
                segment_start = result.start + segment_match.start() + leading
                segment_end = result.start + segment_match.start() + trailing
                if segment_end <= segment_start:
                    continue
                detected_text = text[segment_start:segment_end]
                if detected_text.upper() in CLINICAL_HEADER_ALLOWLIST:
                    continue
                if result.entity_type in {"LOCATION", "ORGANIZATION"}:
                    prefix = text[max(0, segment_start - 60) : segment_start]
                    suffix = text[segment_end : min(len(text), segment_end + 24)]
                    if (
                        detected_text.upper() in NATIONAL_CHAIN_TERMS
                        and GENERIC_CHAIN_CONTEXT_PATTERN.search(prefix)
                    ):
                        # A chain brand alone is not a geographic subdivision. A specific branch
                        # address is still detected separately, and employer contexts are not
                        # exempted by this rule.
                        continue
                    if MEDICATION_CONTEXT_PATTERN.search(prefix) and not (
                        GEOGRAPHIC_SUFFIX_PATTERN.match(suffix)
                    ):
                        # General-purpose NER often mistakes brand-name medications for places.
                        # Strong medication cues preserve the clinical term. Street/island suffixes
                        # prevent this exception from hiding an address or geographic name.
                        continue
                if result.entity_type == "DATE_TIME" and re.fullmatch(
                    r"(?:19|20)\d{2}", detected_text
                ):
                    # Safe Harbor permits year-only dates except where they imply age over 89. The
                    # deterministic age recognizer handles that separate rule.
                    continue
                if result.entity_type == "DATE_TIME" and re.fullmatch(
                    r"\d{1,3}[ \t]+(?:years?|yrs?)(?:[ \t-]+old)?",
                    detected_text,
                    re.IGNORECASE,
                ):
                    # Ages 89 and younger may remain under Safe Harbor. Ages over 89 are handled
                    # by dedicated deterministic recognizers, including line-broken variants.
                    continue
                detections.append(
                    Detection(
                        start=segment_start,
                        end=segment_end,
                        entity_type=normalize_entity_type(result.entity_type),
                        score=float(result.score),
                        recognizers=(f"presidio:{recognizer}",),
                        explanation="Matched by the local Presidio analyzer",
                    )
                )
        return detections
