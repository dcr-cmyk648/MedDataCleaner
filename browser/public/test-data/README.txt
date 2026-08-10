MED DATA CLEANER — SYNTHETIC CROSS-SPECIALTY TEST PACK
=======================================================

This directory contains invented clinical text for software testing. It contains no real patient
records and must not be treated as medical advice. Names, facilities, addresses, identifiers,
dates, contact details, and clinical combinations were created for this project. Reserved or
deliberately invalid values are used where practical, including example.test domains, 555-01xx
telephone numbers, TEST-NET IP addresses, and invalid 000-prefix Social Security numbers.

FILES
-----

synthetic-cross-specialty-notes.txt
  Twenty-one paste-ready cases spanning general medicine, emergency medicine, cardiology,
  oncology, psychiatry, surgery, pediatrics, obstetrics, radiology, pathology, neurology,
  infectious disease, endocrinology, pulmonology, gastroenterology, rheumatology, dermatology,
  ophthalmology, orthopedics, urology, and nephrology/dialysis. The cases rotate through clean,
  OCR-like, line-wrap/layout, noisy-EMR, and identifier-segmentation formats.

HOW TO USE THE PACK
-------------------

1. Open synthetic-cross-specialty-notes.txt.
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
- Broad clinical narratives across twenty-one specialties
- Diagnoses, procedures, imaging, pathology, medications, laboratory values, measurements,
  symptoms, consultations, follow-up plans, and negative findings
- Negative-control clinical values that should remain useful after de-identification

The downloadable text file is generated at build time from the same synthetic fixtures used by
the browser regression suite, so the public examples and tested cases do not drift apart.
