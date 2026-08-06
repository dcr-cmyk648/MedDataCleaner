from __future__ import annotations

import pytest
from conftest import StaticDetector

from med_data_cleaner.deid.models import Detection, ManualFinding, PipelineInputError
from med_data_cleaner.deid.pipeline import DeidentificationPipeline


def test_replaces_findings_with_typed_tokens(regex_pipeline: DeidentificationPipeline) -> None:
    text = "Patient name: Jane Doe. MRN: AB-12345. Call 313-555-0199."

    result = regex_pipeline.deidentify(text)

    assert "Jane Doe" not in result.cleaned_text
    assert "AB-12345" not in result.cleaned_text
    assert "313-555-0199" not in result.cleaned_text
    assert "[PERSON_1]" in result.cleaned_text
    assert "[MEDICAL_RECORD_NUMBER_1]" in result.cleaned_text
    assert "[PHONE_NUMBER_1]" in result.cleaned_text
    assert result.export_allowed is True
    assert result.residual_findings == ()


def test_uses_provider_placeholders_while_preserving_referral_purpose(
    regex_pipeline: DeidentificationPipeline,
) -> None:
    text = "Patient: Jessa Wren. Refer to Dr. Maya Hart for fistulogram on 08/20/2026."

    result = regex_pipeline.deidentify(text)

    assert (
        result.cleaned_text
        == "Patient: [PERSON_1]. Refer to [PROVIDER_1] for fistulogram on [DATE_1]."
    )
    assert result.export_allowed is True


def test_repeated_values_receive_the_same_document_local_token(
    regex_pipeline: DeidentificationPipeline,
) -> None:
    text = "Call 313-555-0199. The callback number remains 313-555-0199."

    result = regex_pipeline.deidentify(text)

    assert result.cleaned_text.count("[PHONE_NUMBER_1]") == 2
    assert "[PHONE_NUMBER_2]" not in result.cleaned_text


def test_overlapping_detections_are_unioned_before_replacement() -> None:
    text = "Jane Doe arrived."
    detector = StaticDetector(
        detections=[
            Detection(0, 4, "PERSON", 0.8, ("first-name",)),
            Detection(0, 8, "PERSON", 0.7, ("full-name",)),
        ]
    )
    pipeline = DeidentificationPipeline(detectors=(detector,))

    result = pipeline.deidentify(text)

    assert result.cleaned_text == "[PERSON_1] arrived."
    assert len(result.findings) == 1
    assert set(result.findings[0].recognizers) == {"first-name", "full-name"}


def test_human_exclusion_is_preserved_through_residual_scan(
    regex_pipeline: DeidentificationPipeline,
) -> None:
    text = "Documentation example: test@example.com"
    initial = regex_pipeline.deidentify(text)
    email = next(finding for finding in initial.findings if finding.entity_type == "EMAIL_ADDRESS")

    reviewed = regex_pipeline.deidentify(text, excluded_finding_ids=[email.finding_id])

    assert "test@example.com" in reviewed.cleaned_text
    assert reviewed.export_allowed is True
    assert reviewed.residual_findings == ()
    assert next(f for f in reviewed.findings if f.finding_id == email.finding_id).selected is False


def test_manual_span_is_replaced(regex_pipeline: DeidentificationPipeline) -> None:
    text = "The local nickname is Nightingale."
    start = text.index("Nightingale")

    result = regex_pipeline.deidentify(
        text,
        manual_findings=[ManualFinding(start, start + len("Nightingale"), "PERSON")],
    )

    assert result.cleaned_text == "The local nickname is [PERSON_1]."
    assert any(finding.source == "manual" for finding in result.findings)


def test_unavailable_required_detector_blocks_export(
    regex_pipeline: DeidentificationPipeline,
) -> None:
    unavailable = StaticDetector(detections=[], ready=False, name="missing-local-ner")
    pipeline = DeidentificationPipeline(detectors=(*regex_pipeline.detectors, unavailable))

    result = pipeline.deidentify("No obvious identifiers in this sentence.")

    assert result.export_allowed is False
    assert "required local detector" in result.export_block_reasons[0]


@pytest.mark.parametrize(
    "text,manual",
    [
        ("", []),
        ("SENSITIVE_SENTINEL", [ManualFinding(-1, 2, "PERSON")]),
        ("SENSITIVE_SENTINEL", [ManualFinding(0, 99, "PERSON")]),
        ("SENSITIVE_SENTINEL", [ManualFinding(0, 2, "NOT_A_CATEGORY")]),
    ],
)
def test_invalid_inputs_fail_without_embedding_input_in_error(
    regex_pipeline: DeidentificationPipeline,
    text: str,
    manual: list[ManualFinding],
) -> None:
    with pytest.raises(PipelineInputError) as error:
        regex_pipeline.deidentify(text, manual_findings=manual)

    if text:
        assert text not in str(error.value)
