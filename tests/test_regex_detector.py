from med_data_cleaner.deid.regex_detector import RegexDetector


def detected_values(text: str) -> dict[str, set[str]]:
    values: dict[str, set[str]] = {}
    for detection in RegexDetector().detect(text):
        values.setdefault(detection.entity_type, set()).add(text[detection.start : detection.end])
    return values


def test_detects_common_medical_note_identifiers_without_returning_values() -> None:
    text = """Patient name: Jane Doe
DOB: 03/04/1942
MRN: AB-12345
Phone: (313) 555-0199
Fax: 313-555-0188
Email: jane.doe@example.com
Address: 123 Main Street, Detroit, MI 48201
She is 92 years old.
NPI: 1234567890
History also describes a 93 y/o relative.
"""

    values = detected_values(text)

    assert "Jane Doe" in values["PERSON"]
    assert "03/04/1942" in values["DATE"]
    assert "AB-12345" in values["MEDICAL_RECORD_NUMBER"]
    assert "(313) 555-0199" in values["PHONE_NUMBER"]
    assert "313-555-0188" in values["FAX_NUMBER"]
    assert "jane.doe@example.com" in values["EMAIL_ADDRESS"]
    assert any(value.startswith("123 Main Street") for value in values["ADDRESS"])
    assert "92" in values["AGE_OVER_89"]
    assert "93" in values["AGE_OVER_89"]
    assert "1234567890" in values["UNIQUE_ID"]


def test_does_not_detect_typed_placeholders_as_identifiers() -> None:
    text = "Seen on [DATE_1] by [PERSON_1]. Call [PHONE_NUMBER_1]."

    assert RegexDetector().detect(text) == []


def test_detects_corrupted_date_city_relationship_name_and_line_broken_old_age() -> None:
    text = (
        "Hospitalized 4....13.26. Lives in Kals-amazoo, Michigan with his mother Ma/rtha. "
        "A relative is 9\n2 years old."
    )

    values = detected_values(text)

    assert "4....13.26" in values["DATE"]
    assert "Kals-amazoo" in values["LOCATION"]
    assert "Ma/rtha" in values["PERSON"]
    assert "9\n2" in values["AGE_OVER_89"]


def test_detects_corrupted_zip_address_and_slash_split_city() -> None:
    text = (
        "His zip code is 4444....{2]. His pharmacy is at "
        "-192480{{2234 farmington]]]lane in North//ville"
    )

    values = detected_values(text)

    assert "4444....{2]" in values["ZIP_CODE"]
    assert "-192480{{2234 farmington]]]lane" in values["ADDRESS"]
    assert "North//ville" in values["LOCATION"]
