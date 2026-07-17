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
- OCR-like substitutions and broken whitespace
- Multiple people and repeated identifiers within one note
- Clinical values that resemble identifiers and should not be removed

Every production miss becomes a minimized synthetic regression test. Real PHI must never be added
to the repository or its issue tracker.

## Release gate

An organizational owner should approve category-specific thresholds and a documented review
workflow. A qualified privacy or compliance reviewer must determine whether Safe Harbor or Expert
Determination is the applicable release method.
