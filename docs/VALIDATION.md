# Validation plan

The application is not ready for real PHI merely because its unit tests pass. Before operational
use, the detector must be evaluated on representative, properly authorized and annotated text.

## Required measurements

- Recall, precision, and F2 score for every Safe Harbor identifier category
- Macro metrics so common dates and phone numbers do not hide poor performance on rare categories
- Worst-case and percentile latency for expected note sizes
- Residual findings after transformation
- Performance with the packaged model on each supported operating system

Recall is the primary optimization target. False positives remove useful clinical information,
but false negatives can disclose PHI.

## Corpus shape

Start with synthetic notes and then add an appropriately governed validation corpus containing:

- Patient, relative, household-member, employer, and provider names
- Initials, nicknames, possessives, punctuation, misspellings, and all-uppercase headers
- Dates in numeric, ISO, abbreviated, and narrative forms
- Ages over 89 and dates implying such ages
- Addresses, facilities, cities, counties, ZIP codes, URLs, email, phone, fax, and IP addresses
- MRNs, account/member/claim/accession numbers, licenses, serials, plates, and local identifiers
- OCR-like substitutions, inserted punctuation, broken whitespace, and invisible formatting marks
- Multiple people and repeated identifiers within one note
- Clinical values that resemble identifiers and should not be removed
- Copied lab tables, medication lists, relative plan timing, and referral context that must remain
  useful after patient and provider names are replaced with distinct typed placeholders

Every production miss becomes a minimized synthetic regression test. Real PHI must never be added
to the repository or its issue tracker.

The fully annotated browser balance gate is intentionally stricter than substring-only tests. Each
synthetic source character belongs to exactly one of two sets:

- An identifier span that must be fully covered by a selected finding of the expected type
- A retention span that no selected finding may cross

This catches both failure directions: missed identifiers and broad findings that erase clinical
meaning, labels, punctuation, allowed states, year-only cohort information, medication or lab
data, credentials, and referral context. The scope follows the identifier categories and
date/geography distinctions in the
[HHS de-identification guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/de-identification/index.html),
but only an authorized privacy or compliance process can determine whether an actual data release
meets Safe Harbor or Expert Determination requirements.

The browser development corpus also expands synthetic seeds across general medicine, emergency
care, cardiology, oncology, psychiatry, surgery, pediatrics, obstetrics, radiology, pathology,
neurology, infectious disease, endocrinology, pulmonology, gastroenterology, rheumatology,
dermatology, ophthalmology, orthopedics, and urology. A deterministic seed generates baseline,
OCR-confusable, line-wrap, noisy-EMR, and segmentation-noise variants for each of those twenty
specialties. The segmentation profile inserts bounded punctuation, line breaks, zero-width spaces,
and soft hyphens inside names, dates, contact data, facilities, and identifiers. Each generated
case carries identifier-removal, specialist-label, and clinical-preservation assertions so a
failure is reproducible. This generated corpus supplements; it does not replace, the annotated
governed corpus required for release.

The August 6, 2026 local browser release run used the pinned ONNX model and passed:

- 137 of 137 synthetic cases
- 2,043 of 2,043 required identifier removals
- 1,227 of 1,227 required retention assertions
- 78 of 78 exact identifier spans and 93 of 93 protected spans in the 15 fully annotated balance
  cases
- The fail-closed residual scan and same-origin/no-note-transmission network gate

These counts establish a repeatable regression baseline, not performance estimates for real-world
notes.

## Evidence behind the corruption profiles

The synthetic mutations model documented failure classes rather than one-off spelling tricks:

- The NHS CogStack de-identification evaluation simulated character substitutions and whitespace
  insertion and reported a substantial recall decline as corruption increased, with its OCR-like
  condition weaker than clean text: [CogStack evaluation](https://pmc.ncbi.nlm.nih.gov/articles/PMC6020175/).
- An EHR OCR pipeline described predictable false negatives, false positives, substitutions,
  insertions, and deletions that required regex-based postprocessing:
  [EHR OCR pipeline](https://pmc.ncbi.nlm.nih.gov/articles/PMC3392858/).
- Biomedical OCR postprocessing research notes that characters can be mistaken for punctuation,
  changing token boundaries: [MiBio OCR postprocessing](https://pmc.ncbi.nlm.nih.gov/articles/PMC6197712/).
- The Unicode Standard defines zero-width space as a break opportunity and soft hyphen as an
  intraword break control, so both are included as copy/paste boundary hazards:
  [Unicode special and format characters](https://www.unicode.org/versions/Unicode12.1.0/ch23.pdf).

These sources justify the mutation classes, not a claim that the generated corpus represents the
frequency or full distribution of errors from every EMR, scanner, browser, or clipboard path.

## Release gate

An organizational owner should approve category-specific thresholds and a documented review
workflow. A qualified privacy or compliance reviewer must determine whether Safe Harbor or Expert
Determination is the applicable release method.

The browser edition has an additional parity gate. The same annotated corpus must be processed by
the installed Presidio/spaCy edition and the browser ONNX edition, with per-category differences
reviewed rather than hidden inside aggregate scores. Browser release for real data requires:

- Approved minimum recall, precision, and F2 thresholds for every supported identifier category
- No unexplained regression from the installed reference implementation
- Long-note, malformed-text, and cross-browser results on each supported browser and operating
  system
- A verified fail-closed response to missing model or WebAssembly files
- A network-boundary test showing that input and output text never enters a request
- Review of the GitHub Pages code-delivery and repository-governance controls

Until all of those conditions are documented and approved, the Pages site must say that it is an
experimental synthetic-data preview.
