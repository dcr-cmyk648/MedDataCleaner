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


def test_preserves_pulmonary_measurements_that_resemble_corrupted_dates() -> None:
    text = "Spirometry shows FEV1 1.62 L. Hospitalized4....13.26 for testing."

    values = detected_values(text)

    assert "1 1.62" not in values["DATE"]
    assert "4....13.26" in values["DATE"]


def test_detects_names_after_cross_specialty_clinician_labels() -> None:
    labels = (
        "Endocrinologist",
        "Pulmonologist",
        "Gastroenterologist",
        "Rheumatologist",
        "Dermatologist",
        "Ophthalmologist",
        "Orthopedic surgeon",
        "Urologist",
    )
    names = ("Arlo", "Bela", "Cato", "Dara", "Esme", "Faye", "Galen", "Hana")
    text = "\n".join(f"{label}: Dr. {names[index]} Clinician" for index, label in enumerate(labels))

    values = detected_values(text)

    for name in names:
        assert f"Dr. {name} Clinician" in values["PROVIDER"]


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


def test_detects_ocr_corrupted_headers_and_zip_after_state() -> None:
    text = (
        "PATlENT N4ME: DEV0N OAKLEY      MEDlCAL REC0RD N0: OCR-88I7Z\n"
        "H0ME: 88 Examp1e Orchard Rd.,To1edo,OH 43604\n"
        "Hgb10.1|ferritin312|K5.7|PTH690"
    )

    values = detected_values(text)

    assert "DEV0N OAKLEY" in values["PERSON"]
    assert "OCR-88I7Z" in values["MEDICAL_RECORD_NUMBER"]
    assert "43604" in values["ZIP_CODE"]
    assert set(values) <= {"PERSON", "MEDICAL_RECORD_NUMBER", "ADDRESS", "ZIP_CODE"}


def test_detects_concatenated_camel_case_facility_without_removing_dialysis_term() -> None:
    text = (
        "Admitted5/28/26anddischarged06-02-2026toresumeHDatCopperMoonDialysis. "
        "Hemodialysis remains clinically necessary."
    )

    values = detected_values(text)

    assert "CopperMoonDialysis" in values["LOCATION"]
    assert "Hemodialysis" not in values["LOCATION"]


def test_handles_compact_labels_facility_identifier_is_and_email_punctuation() -> None:
    text = (
        "Wife Tessa Rook joined the call. Pt=ROOK,KELLAN|unit=North Star Dialysis Annex|"
        "Patient says the pharmacy at 404 Placeholder Parkway, Lansing MI, did not receive it. "
        "The laboratory accession number is LAB-8810-RK. "
        "Follow-up at kellan.rook@example.test."
    )

    values = detected_values(text)

    assert "Tessa Rook" in values["PERSON"]
    assert "Tessa Rook joined the" not in values["PERSON"]
    assert "ROOK,KELLAN" in values["PERSON"]
    assert "North Star Dialysis Annex" in values["LOCATION"]
    assert "404 Placeholder Parkway, Lansing MI" in values["ADDRESS"]
    assert "LAB-8810-RK" in values["UNIQUE_ID"]
    assert "kellan.rook@example.test" in values["EMAIL_ADDRESS"]


def test_ip_allows_sentence_period_and_platelets_is_not_a_vehicle_label() -> None:
    text = (
        "Workstation IP 192.0.2.44. Portal https://example.test/chart/TEST-1. Platelets 221 K/uL."
    )

    values = detected_values(text)

    assert "192.0.2.44" in values["IP_ADDRESS"]
    assert "https://example.test/chart/TEST-1" in values["URL"]
    assert "VEHICLE_ID" not in values


def test_tolerant_email_stops_at_sentence_punctuation_before_portal_label() -> None:
    text = "Email jessa+wren@example.test. Portal https://example.test/chart/TEST-31."

    values = detected_values(text)

    assert "jessa+wren@example.test" in values["EMAIL_ADDRESS"]
    assert "jessa+wren@example.test. Portal" not in values["EMAIL_ADDRESS"]
    assert "https://example.test/chart/TEST-31" in values["URL"]


def test_detects_reported_random_ocr_insertions_without_fragmenting_labeled_names() -> None:
    text = (
        "Patient Name: Maribel\nQuince\n"
        "DOB: 02\n/14/1978    MRN: TEST-HD-10482\n"
        "Address: 104 Fictional Harbor Way, Grand Rapids, MI 4950/3\n"
        "Attending: Dr. Rowan Vale    NPI: 00000000<>00\n"
        "Date of service: July 8, 20>26\n"
        "Labs: hemoglobin 10.4, ferritin 488, potassium 4.9, PTH 438."
    )

    values = detected_values(text)

    assert "Maribel\nQuince" in values["PERSON"]
    assert "Dr. Rowan Vale" in values["PROVIDER"]
    assert "02\n/14/1978" in values["DATE"]
    assert "July 8, 20>26" in values["DATE"]
    assert "4950/3" in values["ZIP_CODE"]
    assert "00000000<>00" in values["UNIQUE_ID"]
    assert "Labs" not in values.get("PERSON", set())


def test_detects_line_broken_and_noisy_identifiers_across_general_notes() -> None:
    text = (
        "Caregiver:: Mara Quill\n"
        "MRN:: GEN]]-00481\nEncounter ID: VISIT-\n99104\n"
        "Phone: 202-\n555-0101\n"
        "Facility: Maple\nLantern Hospital\n"
        "Oncologist: Dr.\nIvo March\n"
        "Device ID: PM{{-77004\n"
        "The patient was evaluated after a motor-vehicle collision."
    )

    values = detected_values(text)

    assert "Mara Quill" in values["PERSON"]
    assert "Dr.\nIvo March" in values["PROVIDER"]
    assert "GEN]]-00481" in values["MEDICAL_RECORD_NUMBER"]
    assert "VISIT-\n99104" in values["UNIQUE_ID"]
    assert "202-\n555-0101" in values["PHONE_NUMBER"]
    assert "Maple\nLantern Hospital" in values["LOCATION"]
    assert "PM{{-77004" in values["DEVICE_ID"]
    assert "VEHICLE_ID" not in values


def test_handles_ocr_names_iso_dates_and_clinical_numbers_without_cross_line_address() -> None:
    text = (
        "Patient Name: Miko 1ark\nPsychiatrist: Dr. 0ren Birch\n"
        "Spouse: Jalen B1rch\nProcedure date: 20>26-05-19\n"
        "Repeat date: 2026\n-05-20\nAnother date: 2026__05__21\n"
        "One-hour glucose challenge was 116 mg/dL.\n"
        "Study date: March 6, 2026\nCT abdomen and pelvis with IV contrast."
    )

    values = detected_values(text)

    assert "Miko 1ark" in values["PERSON"]
    assert "Dr. 0ren Birch" in values["PROVIDER"]
    assert "Jalen B1rch" in values["PERSON"]
    assert "20>26-05-19" in values["DATE"]
    assert "2026\n-05-20" in values["DATE"]
    assert "2026__05__21" in values["DATE"]
    assert "116" not in values.get("AGE_OVER_89", set())
    assert "2026\nCT" not in values.get("ADDRESS", set())


def test_does_not_absorb_labels_or_prose_around_names_and_street_abbreviations() -> None:
    text = (
        "Pat1ent: Hana B1rch  D0B: 02/11/1976\n"
        "Attending: Dr. Ivo March  NPI: 0000000000\n"
        "Physician: Dr. Aria Stone\nPresented with substernal chest pain.\n"
        "Continue cefazolin 2 g IV every 8 hours through the planned stop date."
    )

    values = detected_values(text)

    assert "Dr. Ivo March" in values["PROVIDER"]
    assert "Dr. Aria Stone" in values["PROVIDER"]
    assert not any(
        "D0B" in value or "NPI" in value or "Presented" in value for value in values["PROVIDER"]
    )
    assert not any("stop date" in value for value in values.get("ADDRESS", set()))


def test_detects_reported_punctuation_and_line_segmentation_inside_identifiers() -> None:
    text = (
        "MRN: TES!\nT-HD-10482\n"
        "Emergency contact: Tomas Quince, husband, 202-5>55-0105\n"
        "NPI: 000%00000<>00\nDate of service: July 8, 202>6"
    )

    values = detected_values(text)

    assert "TES!\nT-HD-10482" in values["MEDICAL_RECORD_NUMBER"]
    assert "202-5>55-0105" in values["PHONE_NUMBER"]
    assert "000%00000<>00" in values["UNIQUE_ID"]
    assert "July 8, 202>6" in values["DATE"]


def test_detects_corrupted_year_matrix_without_consuming_clinical_values() -> None:
    years = ["20%26", "20\n26", "202&6", "202>6", "20 26", "202\u200b6", "202\u00ad6"]
    text = f"{' '.join(years)} Potassium 4.9 mmol/L; treatment time 210 minutes."

    values = detected_values(text)

    for year in years:
        assert year in values["DATE"]
    assert "210" not in values["DATE"]


def test_detects_punctuation_corrupted_facility_after_narrative_preposition() -> None:
    text = "Seen at Har%bor Test Emergency Center for troponin testing."

    values = detected_values(text)

    assert "Har%bor Test Emergency Center" in values["LOCATION"]
    assert "troponin" not in values["LOCATION"]


def test_preserves_copied_lab_rows_and_relative_plan_timing() -> None:
    text = (
        "LAB RESULTS\n"
        "Hemoglobin | TSAT | Albumin | Calcium | Phosphorus\n"
        "10.2 | 21 | 3.7 | 8.7 | 5.4\n"
        "Chloride | Sodium | Potassium | Bicarbonate\n"
        "101 | 137 | 4.8 | 23\n"
        "PLAN\nRecheck labs in 2 weeks and again next month. "
        "Refer to Dr. Maya Hart for fistulogram."
    )

    values = detected_values(text)

    assert not values.get("PHONE_NUMBER")
    assert not values.get("DATE")
    assert not values.get("ADDRESS")
    assert "Dr. Maya Hart" in values["PROVIDER"]


def test_uses_provider_category_without_weakening_patient_name_detection() -> None:
    text = "Patient: Jessa Wren\nAttending: Dr. Rowan Vale\nRefer to Dr. Maya Hart for fistulogram."

    values = detected_values(text)

    assert "Jessa Wren" in values["PERSON"]
    assert "Dr. Rowan Vale" in values["PROVIDER"]
    assert "Dr. Maya Hart" in values["PROVIDER"]
