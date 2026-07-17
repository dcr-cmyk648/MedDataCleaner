# Threat model

## Protected asset

The primary protected asset is the raw pasted clinical text and every identifier contained in
it. A secondary protected asset is any mapping between an identifier and a replacement token.

## Trust boundary

The first release has one trusted boundary: a single user's local computer. The cleaner has no
AI-backend integration. A future extraction application must be a separate process that can read
only a reviewed de-identified export.

## In-scope threats

- Accidental transmission through analytics, CDNs, model downloads, crash reporting, or logging
- Another website attempting to call a predictable localhost service
- PHI persisting in browser storage, temporary files, application logs, or filenames
- An automated detector missing an identifier
- A transformation exposing part of an overlapping identifier
- A malformed request causing an error response to echo raw input
- A missing local NER model silently reducing protection

## Controls

- All runtime assets and NLP models are local; there are no outbound application calls.
- The service listens only on loopback, on an ephemeral port, with a per-launch API token and
  strict host validation.
- Raw text is request-scoped and held in memory. The application has no autosave or recent-files
  feature.
- Raw text and matched substrings are never written to application logs or returned as finding
  metadata.
- Overlapping detections are unioned before replacement.
- The transformed output is scanned again before export.
- Export fails closed when a required detector is unavailable or residual findings remain.
- A human review confirmation is required for every export.

## Important residual risks

- A user or operating system can still retain clipboard history, browser process memory, swap, or
  screenshots. Those controls are outside this application's boundary.
- No automated detector has perfect recall, especially for misspellings, unusual local codes,
  indirect identifiers, and narrative combinations that make a person recognizable.
- HIPAA Safe Harbor also requires no actual knowledge that the remaining information can identify
  a person. Software cannot make that organizational determination.
- A compromised computer, browser, Python runtime, dependency, or locally installed extension can
  access data shown to the user.
- Exact compliance requirements can depend on data, recipient, contracts, state law, and
  organizational policy.

## Out-of-scope inputs

The MVP must reject or avoid claiming protection for images, face photographs, biometric media,
audio, DICOM files, PDFs, office documents, rich-text attachments, and structured exports. Those
formats require metadata stripping, OCR or pixel redaction, and format-specific validation.
