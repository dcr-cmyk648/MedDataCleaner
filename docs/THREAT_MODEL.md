# Threat model

## Protected asset

The primary protected asset is the raw pasted clinical text and every identifier contained in
it. A secondary protected asset is any mapping between an identifier and a replacement token.

## Trust boundary

The first release has one trusted boundary: a single user's local computer. The cleaner has no
AI-backend integration. A future extraction application must be a separate process that can read
only a reviewed de-identified export.

The experimental browser edition retains the single-device processing boundary but downloads its
static executable assets from GitHub Pages. GitHub receives requests for application, model,
WebAssembly, and version files; it must never receive pasted or cleaned note text. The browser
edition is a separate validation target and is restricted to synthetic data until its release gate
is satisfied.

## In-scope threats

- Accidental transmission through analytics, CDNs, model downloads, crash reporting, or logging
- Another website attempting to call a predictable localhost service
- PHI persisting in browser storage, temporary files, application logs, or filenames
- An automated detector missing an identifier
- A transformation exposing part of an overlapping identifier
- A malformed request causing an error response to echo raw input
- A missing local NER model silently reducing protection
- A compromised Pages deployment, repository, dependency, or workflow serving code that transmits
  pasted text
- Browser caching or storage accidentally persisting note content
- A stale browser tab continuing to export after a safety update

## Controls

- All runtime assets and NLP models are local; there are no outbound application calls.
- The service listens only on loopback, on an ephemeral port, with a per-launch API token and
  strict host validation.
- Raw text is request-scoped and held in memory. The application has no autosave or recent-files
  feature.
- Raw text and matched substrings are never written to application logs or returned as finding
  metadata.
- Labeled deterministic detections set exact replacement boundaries when a broader generic-model
  candidate overlaps them; other overlaps are unioned using identifier-category priority.
- The transformed output is scanned again before export.
- Export fails closed when a required detector is unavailable or residual findings remain.
- A human review confirmation is required for every file export or clipboard copy.
- Browser runtime assets are bundled and served from the same origin; remote model loading,
  analytics, telemetry, note-content storage, and service workers are disabled.
- Browser model inputs and outputs remain inside a dedicated worker. Model source revisions and
  checksums are pinned, and deployment actions are pinned to immutable commits.
- Hashed assets plus an uncached version manifest block new work and export from stale tabs.
- Browser output is recomputed after review before an in-memory download or clipboard write is
  created.

## Important residual risks

- A user or operating system can still retain clipboard history, browser process memory, swap, or
  screenshots. Those controls are outside this application's boundary.
- No automated detector has perfect recall, especially for misspellings, unusual local codes,
  indirect identifiers, and narrative combinations that make a person recognizable.
- HIPAA Safe Harbor also requires no actual knowledge that the remaining information can identify
  a person. Software cannot make that organizational determination.
- A compromised computer, browser, Python runtime, dependency, or locally installed extension can
  access data shown to the user.
- GitHub Pages controls its hosting infrastructure and request logs. The design keeps notes out of
  request bodies and URLs, but GitHub still observes ordinary static-asset request metadata.
- GitHub Pages cannot supply every response header used by the loopback server. The browser edition
  uses an HTML Content Security Policy, but some protections require response headers.
- A compromised repository account, `main` branch, workflow, or dependency could change future
  code delivered to users. Branch protection and repository access governance are operational
  requirements outside this codebase.
- Exact compliance requirements can depend on data, recipient, contracts, state law, and
  organizational policy.

## Out-of-scope inputs

The MVP must reject or avoid claiming protection for images, face photographs, biometric media,
audio, DICOM files, PDFs, office documents, rich-text attachments, and structured exports. Those
formats require metadata stripping, OCR or pixel redaction, and format-specific validation.
