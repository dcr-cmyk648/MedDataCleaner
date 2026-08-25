# Experimental browser edition

The browser edition is a static GitHub Pages application that runs both deterministic
recognizers and named-entity recognition inside the user's browser. It is intended to remove the
Python installation and manual-update burden without moving pasted clinical text to a server.

> [!WARNING]
> Use synthetic test data only. The browser detector has not yet demonstrated parity with the
> installed Presidio/spaCy edition and is not approved for real PHI. Neither edition certifies
> HIPAA compliance.

## Data boundary

GitHub Pages serves versioned HTML, JavaScript, CSS, tokenizer, ONNX, and WebAssembly files. After
those static files arrive, the note is processed in a dedicated browser worker. Pasted and cleaned
text is never placed in an HTTP request, URL, log, cookie, local storage, session storage,
IndexedDB, Cache API, or service worker by this application.

The only intentional runtime requests are same-origin `GET` requests for:

- Hashed application assets
- The pinned model and tokenizer files under `models/`
- The pinned WebAssembly runtime under `wasm/`
- `version.json`, which contains only the deployed Git revision

The model and runtime are application assets, not patient data. After review, the result can be
created as an in-memory browser `Blob` and downloaded with the fixed filename `deidentified.txt`,
or explicitly written to the device clipboard. Both actions repeat the local residual scan first
and remain blocked until every detected candidate has an explicit decision and the reviewer makes
a final confirmation that the full note was reviewed for missed PHI.

Browser and operating-system features remain outside this boundary. Clipboard history, browser
extensions, screenshots, process memory, swap, downloaded files, and a compromised device can
still expose text.

## Detection design

The browser pipeline ports the desktop deterministic recognizers and orchestration behavior:

- Input limits and validation
- Exact deterministic boundaries for labeled identifiers, even when the generic model proposes a
  broader overlapping span
- Identifier-category priority and overlap union when neither candidate has a more trustworthy
  deterministic boundary
- Stable document-local typed placeholders
- Human exclusions and manually selected spans
- A second residual scan
- Fail-closed export when a required detector is unavailable or residual findings remain
- Mandatory review confirmation and final recomputation before download

The named-entity layer uses the Apache-2.0 `dslim/distilbert-NER` model through a pinned ONNX
conversion. It recognizes people, locations, and organizations. The browser adapter retains the
desktop medication-context, clinical-header, and generic-chain filters. It also protects common
clinical eponyms, device terms, laboratory labels, medication contexts, credentials, and
descriptive words that the news-trained model can mistake for names or locations. State names,
state abbreviations, and year-only values remain available; cities, sub-state geography, ZIP
codes, and date elements finer than a year are replaced. Provider names are replaced by default,
while titles, credentials, referral purpose, procedure context, and year-only cohort information
remain available for review. The model is only a candidate replacement for the desktop spaCy
layer: it was trained on news text rather than clinical notes and must be evaluated on the corpus
described in [VALIDATION.md](VALIDATION.md).

The exact model revision and SHA-256 checksums are recorded in
`browser/model-manifest.json`. `scripts/prepare_browser_assets.py` rejects any file whose checksum
does not match. Remote model loading is disabled at runtime, and the page's Content Security
Policy limits connections to the same origin.

## Single-surface human review and tab-only learning

Paste synthetic plain text into the single large document surface and choose **Scan and clean**.
Its label and in-button progress bar show that the local worker is running; when it completes, the
button reads **Ready for review**. The same surface then displays the locked original note with
every automatic candidate highlighted, while the consolidated **Detected spans** list remains below
it.

Select a highlight or its list item, then press `1` to redact it or `2` to keep it as clinical
text. Tab/Shift+Tab and the left/right arrow controls move between candidates. Every automatic
candidate starts undecided and must receive its own current-note decision; a keep suggestion is
never a decision and never changes output. After all automatic candidates are decided, the same
document surface can show a de-identified preview.

If the detector missed a span, select it in the annotated original, choose its category, and use
**Add selected span**. Manual spans are deliberate redactions and cause a local rescan. Before
**Copy de-identified text** and **Export de-identified .txt** become available, the reviewer must
also check the final confirmation that the complete note—not only highlighted spans—was reviewed
for missed PHI. Copy and export each perform a final local, fail-closed recomputation.

Use **Edit note** to return to editable text. This clears the scan, decisions, manual spans, and
output authorization, so the changed note must be scanned and reviewed again.

The app can remember one narrow class of correction while the tab remains open: an exact term that
the generic local model labeled as a location and the reviewer explicitly kept as clinical text.
It never learns a keep decision for a person, provider, date, or other identifier category.
De-identification remains the default. These exact-term choices live only in JavaScript memory;
they are not written to local storage, session storage, IndexedDB, a cookie, a file, or a network
request, and they disappear when the tab closes or the reviewer selects **Forget learned clinical
terms**. A reused finding remains visible and unchecked in the findings list and must be confirmed
again as part of the required review for that note.

## Updates and cache busting

Every production build uses content-hashed JavaScript and CSS filenames. The build also emits a
small `version.json` containing the Git commit ID. An open tab checks an uncached, uniquely queried
copy of that file at startup, every minute, and whenever it is restored or comes online.

When a newer version is detected:

1. New scans and exports are blocked immediately.
2. If no note is present, the app reloads with the new version in its URL.
3. If a note is present, the app requires the user to clear it before reloading. It never stores
   the note to carry it across versions.

This avoids silently losing an active note while preventing an old build from exporting after a
safety update.

## Local development and verification

Node.js 22 or newer is required for browser-edition development. The first build downloads about
66 MB of pinned model data into a gitignored local directory.

```sh
npm install --ignore-scripts
npm run browser:test
npm run browser:build
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist/pages
```

Open `http://127.0.0.1:4173/` and use synthetic text. On a Mac with Google Chrome installed, the
real-model and network-boundary smoke test can be run while that local server is active:

```sh
npm run browser:smoke
```

That test waits for the ONNX model, processes a synthetic note, verifies model and deterministic
placeholders, checks that every request is same-origin, and verifies that pasted text was not sent
as request data.

For a broader local adversarial pass, keep the server running and use:

```sh
npm run browser:corpus
```

The corpus contains synthetic removal and retention annotations. In addition to fixed regressions,
deterministic seeds generate baseline, OCR-confusable, line-wrap, noisy-EMR, and
segmentation-noise variants across twenty clinical specialties: general medicine, emergency
medicine, cardiology, oncology, psychiatry, surgery, pediatrics, obstetrics, radiology, pathology,
neurology, infectious disease, endocrinology, pulmonology, gastroenterology, rheumatology,
dermatology, ophthalmology, orthopedics, and urology. The fifth profile covers inserted
punctuation, intra-identifier line breaks, zero-width spaces, and soft hyphens. The suite combines
100 generated cases, 22 focused regressions, and 15 fully annotated balance cases. In each balance
case, every source character is classified as either an exact identifier span or protected
retention text; a finding that crosses protected text fails even if the cleaned preview happens to
look plausible.

The runner processes all 137 cases through the real browser model in Chrome, fails on a retained
test identifier or lost clinical term, requires exact typed coverage of fully annotated
identifiers, reports residual findings when the fail-closed export gate remains blocked, and
repeats the same network-boundary check. On August 6, 2026, the local release run passed all 2,043
required removals and all 1,227 required retained spans. Those synthetic results are a regression
oracle, not proof of de-identification or a substitute for the governed validation described in
`VALIDATION.md`. New manual misses should be minimized into this corpus before their fixes are
accepted.

The public page also offers a generated, paste-ready cross-specialty test pack. It selects one
case from each of the twenty general-medical specialties above, rotates through all five formatting
profiles, and adds a nephrology/dialysis regression case. The downloadable pack is built directly
from the tested synthetic fixtures rather than maintained as a separate dialysis-only document.

After the machine assertions pass, inspect the cleaned synthetic notes for plausible clinical or
structural data loss. The runner supports `--show-output` for that semantic review, `--concise` for
short failure reports, and `--only=<regular-expression>` for a reproducible subset. Any issue found
during that second review must be added to `must_preserve` or a focused regression test before the
fix is considered complete.

## GitHub Pages deployment

`.github/workflows/pages.yml` runs the browser tests, downloads and verifies the pinned model,
builds the hashed static site, and deploys only after a push to `main` or a manual workflow run.
Workflow actions are pinned to immutable commit SHAs. The workflow does not process notes or have
access to application users' browser memory.

After this implementation is reviewed and merged, a repository administrator must select
**GitHub Actions** under **Settings → Pages → Build and deployment**. Do not enable the public link
for real PHI use until the browser edition passes the validation gate and the applicable
organizational privacy and security review.

GitHub Pages cannot add all of the security response headers used by the loopback FastAPI server.
The static page supplies a restrictive CSP in HTML, but header-only protections such as
`frame-ancestors` remain a documented residual difference.
