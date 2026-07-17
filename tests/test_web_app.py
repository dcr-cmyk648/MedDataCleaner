from __future__ import annotations

from conftest import StaticDetector
from fastapi.testclient import TestClient

from med_data_cleaner.deid.models import Detection
from med_data_cleaner.deid.pipeline import DeidentificationPipeline
from med_data_cleaner.deid.regex_detector import RegexDetector
from med_data_cleaner.web.app import create_app

TOKEN = "unit-test-local-token"


def client_for(pipeline: DeidentificationPipeline) -> TestClient:
    return TestClient(create_app(pipeline, api_token=TOKEN))


def auth_headers() -> dict[str, str]:
    return {"X-Med-Data-Cleaner-Token": TOKEN}


def test_api_requires_per_launch_token() -> None:
    client = client_for(DeidentificationPipeline(detectors=(RegexDetector(),)))

    response = client.get("/api/status")

    assert response.status_code == 403


def test_deidentify_response_does_not_return_matched_value_as_metadata() -> None:
    client = client_for(DeidentificationPipeline(detectors=(RegexDetector(),)))
    secret_email = "jane.doe@example.com"

    response = client.post(
        "/api/deidentify",
        headers=auth_headers(),
        json={"text": f"Email: {secret_email}"},
    )

    assert response.status_code == 200
    payload = response.json()
    finding_metadata = str(payload["findings"])
    assert secret_email not in finding_metadata
    assert secret_email not in payload["cleaned_text"]


def test_validation_error_does_not_echo_raw_input() -> None:
    client = client_for(DeidentificationPipeline(detectors=(RegexDetector(),)))
    raw_value = "raw.patient.identifier@example.com"

    response = client.post(
        "/api/deidentify",
        headers=auth_headers(),
        json={"text": raw_value, "manual_findings": [{"start": "bad", "end": 3}]},
    )

    assert response.status_code == 422
    assert raw_value not in response.text


def test_export_requires_review_confirmation() -> None:
    client = client_for(DeidentificationPipeline(detectors=(RegexDetector(),)))

    response = client.post(
        "/api/export",
        headers=auth_headers(),
        json={"text": "Patient name: Jane Doe", "review_confirmed": False},
    )

    assert response.status_code == 409


def test_export_returns_only_cleaned_plain_text_after_review() -> None:
    client = client_for(DeidentificationPipeline(detectors=(RegexDetector(),)))

    response = client.post(
        "/api/export",
        headers=auth_headers(),
        json={"text": "Patient name: Jane Doe", "review_confirmed": True},
    )

    assert response.status_code == 200
    assert response.text == "Patient name: [PERSON_1]"
    assert response.headers["content-disposition"] == 'attachment; filename="deidentified.txt"'
    assert response.headers["cache-control"].startswith("no-store")


def test_export_fails_closed_when_required_detector_is_unavailable() -> None:
    unavailable = StaticDetector(detections=[], ready=False)
    client = client_for(DeidentificationPipeline(detectors=(RegexDetector(), unavailable)))

    response = client.post(
        "/api/export",
        headers=auth_headers(),
        json={"text": "Clinical note without obvious PHI.", "review_confirmed": True},
    )

    assert response.status_code == 409


def test_security_headers_are_present() -> None:
    client = client_for(DeidentificationPipeline(detectors=(RegexDetector(),)))

    response = client.get("/")

    assert response.status_code == 200
    assert response.headers["x-frame-options"] == "DENY"
    assert "default-src 'self'" in response.headers["content-security-policy"]
    assert TOKEN in response.text


def test_residual_detection_blocks_export() -> None:
    class SecondPassDetector(StaticDetector):
        def detect(self, text: str) -> list[Detection]:
            if "[PERSON_1]" in text:
                start = text.index("unresolved")
                return [Detection(start, start + 10, "UNIQUE_ID", 0.9, ("second-pass",))]
            return [Detection(0, 4, "PERSON", 0.9, ("first-pass",))]

    pipeline = DeidentificationPipeline(detectors=(SecondPassDetector(detections=[]),))
    client = client_for(pipeline)

    response = client.post(
        "/api/export",
        headers=auth_headers(),
        json={"text": "Jane unresolved", "review_confirmed": True},
    )

    assert response.status_code == 409
