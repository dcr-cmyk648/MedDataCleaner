from __future__ import annotations

import socket

import pytest

from med_data_cleaner.deid.presidio_detector import PresidioDetector


def test_presidio_email_validation_uses_offline_suffix_snapshot(monkeypatch) -> None:
    detector = PresidioDetector(model_name="en_core_web_lg")
    if not detector.status.ready:
        pytest.skip("The optional integration model is not installed")

    def reject_network(*_args, **_kwargs):
        raise AssertionError("A detector attempted network access")

    monkeypatch.setattr(socket, "getaddrinfo", reject_network)

    detections = detector.detect("Contact example.person@example.com")

    assert any(detection.entity_type == "EMAIL_ADDRESS" for detection in detections)


def test_presidio_does_not_remove_clinical_headers_or_year_only_dates() -> None:
    detector = PresidioDetector(model_name="en_core_web_lg")
    if not detector.status.ready:
        pytest.skip("The optional integration model is not installed")

    text = "DOB: 03/04/1942\nMRN: ZX-458921\nSeen in 2026."
    detections = detector.detect(text)
    detected_values = {text[item.start : item.end] for item in detections}

    assert "DOB" not in detected_values
    assert "MRN" not in detected_values
    assert "2026" not in detected_values


def test_presidio_preserves_age_phrases_and_medications_in_strong_clinical_context() -> None:
    detector = PresidioDetector(model_name="en_core_web_lg")
    if not detector.status.ready:
        pytest.skip("The optional integration model is not installed")

    text = "The patient is a 4\n3 year old male. He is on Zyprexa."
    detections = detector.detect(text)
    detected_values = {text[item.start : item.end] for item in detections}

    assert "3 year old" not in detected_values
    assert "Zyprexa" not in detected_values


def test_presidio_preserves_generic_chain_in_visit_context() -> None:
    detector = PresidioDetector(model_name="en_core_web_lg")
    if not detector.status.ready:
        pytest.skip("The optional integration model is not installed")

    text = "He likes to go to Walgreens to hang out."
    detections = detector.detect(text)
    detected_values = {text[item.start : item.end] for item in detections}

    assert "Walgreens" not in detected_values
