from __future__ import annotations

from dataclasses import dataclass

import pytest

from med_data_cleaner.deid.models import Detection, DetectorStatus
from med_data_cleaner.deid.pipeline import DeidentificationPipeline
from med_data_cleaner.deid.regex_detector import RegexDetector


@dataclass
class StaticDetector:
    detections: list[Detection]
    ready: bool = True
    required: bool = True
    name: str = "test-detector"

    @property
    def status(self) -> DetectorStatus:
        return DetectorStatus(
            name=self.name,
            ready=self.ready,
            required=self.required,
            detail="Synthetic test detector",
        )

    def detect(self, _text: str) -> list[Detection]:
        return list(self.detections) if self.ready else []


@pytest.fixture
def regex_pipeline() -> DeidentificationPipeline:
    return DeidentificationPipeline(detectors=(RegexDetector(),))
