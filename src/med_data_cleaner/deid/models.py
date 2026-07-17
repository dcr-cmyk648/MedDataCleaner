from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


class PipelineInputError(ValueError):
    """Raised for invalid input without embedding the sensitive input in the message."""


@dataclass(frozen=True, slots=True)
class DetectorStatus:
    name: str
    ready: bool
    required: bool = True
    detail: str = ""


@dataclass(frozen=True, slots=True)
class Detection:
    start: int
    end: int
    entity_type: str
    score: float
    recognizers: tuple[str, ...]
    explanation: str = ""

    def __post_init__(self) -> None:
        if self.start < 0 or self.end <= self.start:
            raise ValueError("Detection offsets are invalid")
        if not 0 <= self.score <= 1:
            raise ValueError("Detection score must be between zero and one")
        if not self.recognizers:
            raise ValueError("A detection must identify at least one recognizer")


@dataclass(frozen=True, slots=True)
class Finding:
    finding_id: str
    start: int
    end: int
    entity_type: str
    score: float
    recognizers: tuple[str, ...]
    selected: bool = True
    source: str = "automatic"


@dataclass(frozen=True, slots=True)
class ManualFinding:
    start: int
    end: int
    entity_type: str


@dataclass(frozen=True, slots=True)
class DeidentificationResult:
    cleaned_text: str
    findings: tuple[Finding, ...]
    residual_findings: tuple[Finding, ...]
    detector_statuses: tuple[DetectorStatus, ...]
    policy_id: str
    export_allowed: bool
    export_block_reasons: tuple[str, ...] = field(default_factory=tuple)

    @property
    def applied_count(self) -> int:
        return sum(1 for finding in self.findings if finding.selected)


class Detector(Protocol):
    @property
    def status(self) -> DetectorStatus: ...

    def detect(self, text: str) -> list[Detection]: ...
