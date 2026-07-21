MED DATA CLEANER — SYNTHETIC DIALYSIS TEST PACK
================================================

This directory contains invented clinical text for software testing. It contains no real patient
records and must not be treated as medical advice. Names, facilities, addresses, identifiers,
dates, contact details, and clinical combinations were created for this project. Reserved or
deliberately invalid values are used where practical, including example.test domains, 555-01xx
telephone numbers, TEST-NET IP addresses, and invalid 000-prefix Social Security numbers.

FILES
-----

synthetic-dialysis-notes.txt
  Nine paste-ready cases. Cases range from cleanly formatted notes to OCR damage, broken words,
  unusual punctuation, run-on text, duplicated notes, and conflicting layouts.

HOW TO USE THE PACK
-------------------

1. Open synthetic-dialysis-notes.txt.
2. Copy one case at a time, excluding the CASE separator if desired.
3. Paste it into Med Data Cleaner and run the scan.
4. Confirm that identifying material is removed and clinically relevant material remains.
5. Record misses, incorrect removals, and ambiguous findings by case ID.

The pack is intentionally adversarial. Some corruptions may expose known detector gaps; that is
the purpose of the data. A passing result on this pack does not establish HIPAA compliance or
approval for real PHI.

COVERAGE
--------

- Names of patients, relatives, clinicians, caregivers, and facilities
- Dates, including corrupted punctuation and broken whitespace
- Ages over 89
- Street addresses, cities, states, and ZIP codes
- Telephone, fax, email, URL, and IP address
- MRN, member, account, claim, accession, order, provider, license, device, and vehicle IDs
- Hemodialysis and peritoneal-dialysis narratives
- Adequacy, access, weights, blood pressure, anemia, mineral metabolism, medications,
  hospitalization, transplant status, symptoms, and treatment plans
- Negative-control clinical values that should remain useful after de-identification

PUBLIC CLINICAL REFERENCES USED TO CHOOSE TOPICS
------------------------------------------------

No wording or patient data was copied from these sources. They were used only to choose realistic
categories for newly written synthetic notes.

CMS, ESRD Quality Incentive Program — Measuring Quality
https://www.cms.gov/medicare/quality/end-stage-renal-disease-esrd-quality-incentive-program/measuring-quality

NIDDK, Hemodialysis
https://www.niddk.nih.gov/health-information/kidney-disease/kidney-failure/hemodialysis

National Kidney Foundation, Key points about dialysis for kidney failure
https://www.kidney.org/key-points-about-dialysis-kidney-failure

KDIGO, Anemia in CKD
https://kdigo.org/guidelines/anemia-in-ckd/

Generated for Med Data Cleaner on 2026-07-21.
