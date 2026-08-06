from __future__ import annotations

import socket

import pytest

from med_data_cleaner.deid.presidio_detector import (
    PresidioDetector,
    _is_clinical_header,
    _is_clinical_ner_exclusion,
)


def test_clinical_context_guards_are_narrow() -> None:
    assert _is_clinical_header("Facility")
    assert _is_clinical_ner_exclusion("Foley", " catheter after ambulation")
    assert not _is_clinical_ner_exclusion("Foley", " called about the appointment")


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


def test_presidio_does_not_remove_echocardiogram_as_a_location() -> None:
    detector = PresidioDetector(model_name="en_core_web_lg")
    if not detector.status.ready:
        pytest.skip("The optional integration model is not installed")

    text = "Echocardiogram reported EF 48%."
    detections = detector.detect(text)
    detected_values = {text[item.start : item.end] for item in detections}

    assert "Echocardiogram" not in detected_values


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


def test_presidio_preserves_general_medical_section_headers() -> None:
    detector = PresidioDetector(model_name="en_core_web_lg")
    if not detector.status.ready:
        pytest.skip("The optional integration model is not installed")

    text = (
        "MONTHLY EMERGENCY ONCOLOGY PEDIATRIC RADIOLOGY PATHOLOGY NEUROLOGY "
        "INFECTIOUS SURGICAL POSTOPERATIVE SURGEON MOOD MOTHER EEG D0B H0ME CONTINUE"
    )
    detections = detector.detect(text)
    detected_values = {text[item.start : item.end] for item in detections}

    assert detected_values.isdisjoint(text.split())
