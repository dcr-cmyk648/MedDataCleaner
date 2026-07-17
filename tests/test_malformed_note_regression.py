from __future__ import annotations

import pytest

from med_data_cleaner.deid.pipeline import DeidentificationPipeline


def test_user_reported_malformed_synthetic_note() -> None:
    pipeline = DeidentificationPipeline()
    if not pipeline.engine_ready:
        pytest.skip("The local Presidio model is not installed")

    source = (
        "The patient is a 4\n"
        "3 year old male with a history of schizoaffective disorder and polysubstance use "
        "disorder who presents for dialysis. He is on Zyprexa. He was most recently "
        "hospitalized 4....13.26. He lives in Kals-amazoo, Michigan with his mother Ma/rtha."
    )

    result = pipeline.deidentify(source)

    assert result.cleaned_text == (
        "The patient is a 4\n"
        "3 year old male with a history of schizoaffective disorder and polysubstance use "
        "disorder who presents for dialysis. He is on Zyprexa. He was most recently "
        "hospitalized [DATE_1]. He lives in [LOCATION_1], [LOCATION_2] with his mother "
        "[PERSON_1]."
    )
    assert result.export_allowed is True
    assert result.residual_findings == ()


def test_user_reported_corrupted_zip_pharmacy_address_and_city() -> None:
    pipeline = DeidentificationPipeline()
    if not pipeline.engine_ready:
        pytest.skip("The local Presidio model is not installed")

    source = (
        "The patient is a 4\n"
        "3 year old male with a history of schizoaffective disorder and polysubstance use "
        "disorder who presents for dialysis. He is on Zyprexa. He was most recently "
        "hospitalized 4....13.26. He lives in Kals-amazoo, Michigan with his mother Ma/rtha. "
        "He likes to go to Walgreens to hang out. He will sometimes use Depakote. His zip code "
        "is 4444....{2]. His pharmacy is at -192480{{2234 farmington]]]lane in North//ville"
    )

    result = pipeline.deidentify(source)

    assert result.cleaned_text == (
        "The patient is a 4\n"
        "3 year old male with a history of schizoaffective disorder and polysubstance use "
        "disorder who presents for dialysis. He is on Zyprexa. He was most recently "
        "hospitalized [DATE_1]. He lives in [LOCATION_1], [LOCATION_2] with his mother "
        "[PERSON_1]. He likes to go to Walgreens to hang out. He will sometimes use Depakote. "
        "His zip code is [ZIP_CODE_1]. His pharmacy is at [ADDRESS_1] in [LOCATION_3]"
    )
    assert result.export_allowed is True
    assert result.residual_findings == ()
