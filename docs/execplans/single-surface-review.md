# Single-Surface Browser Review

## Goal

Redesign the GitHub Pages browser edition so a reviewer pastes a note into one large document
surface, scans it with visible in-button progress, reviews every detected PHI candidate in place,
confirms the full note was reviewed for missed PHI, and then copies or exports the verified
de-identified text. The two-column source/result workspace must be replaced without weakening the
existing local-only and fail-closed safety properties.

## Requirements

- Scope changes to the browser edition under `browser/`; do not change the installed Python UI.
- Present one large visual document surface:
  - before scanning, a native editable textarea accepts pasted clinical text;
  - after scanning, the same-sized area becomes a read-only annotated rendering of the original;
  - after review is complete, an in-surface toggle can show the de-identified preview without
    introducing a second side-by-side box;
  - an Edit note action returns to input mode and invalidates scan results and review decisions.
- During analysis, display determinate progress inside the Scan and clean button using the existing
  worker progress events and accessible progress/status semantics.
- After analysis, render the scan control as a lit Ready for review status.
- Give each automatic finding an explicit tri-state lifecycle: undecided, redact, or keep.
  No automatic finding may count as resolved until the reviewer explicitly chooses 1 or 2 for the
  current note.
- Support mouse selection of a highlighted finding plus keyboard review:
  Tab/Shift+Tab and arrow navigation, 1 to redact, and 2 to keep. A decision advances to the next
  unresolved finding when possible.
- Preserve the consolidated Detected spans list below the document and synchronize it with the
  active inline highlight.
- Preserve manual missed-PHI marking. Manual findings are deliberate reviewer redactions and do
  not require a second 1/2 decision.
- Keep in-memory model-only location memory, if retained, as a suggestion only. A reused suggestion
  must not change the output or satisfy the explicit decision gate without confirmation.
- Require both of the following before output actions can enable:
  - every automatic finding has an explicit current-note decision;
  - the reviewer checks a final confirmation that the complete note was reviewed for missed PHI.
- Keep both Copy de-identified text and Export de-identified .txt actions.
- Keep the existing detector/residual `export_allowed` gate, required-update gate, final worker
  recomputation, and equality check before clipboard or file output.
- Keep the note browser-local with no browser persistence, telemetry, or note-content network
  requests.
- Give visual states text/icon semantics in addition to color and retain usable responsive and
  keyboard behavior.

## Constraints and non-goals

- Do not use an editable `contenteditable` surface; DOM editing and newline normalization would
  make source offsets and final verification fragile.
- Do not try to style substrings inside a native textarea; use a native textarea in input mode and
  a semantic read-only rendered surface in review mode.
- Do not change detector heuristics, entity policy, model assets, placeholder formats, or Python
  server behavior unless a discovered correctness issue makes a narrowly scoped change necessary.
- Do not add persistent learning or new cross-origin resources.
- Do not deploy or publish changes as part of this task.
- Preserve unrelated working-tree changes if any appear.

## Relevant repository state

- Work began from a clean `main` branch tracking `origin/main` at commit `341c09b`.
- `browser/index.html` currently has a two-column Source and Result workspace, a duplicate
  highlighted preview, a generic final review checkbox, and the bottom Detected spans list.
- `browser/src/app.js` currently tracks automatic exclusions and `reviewedFindingIds`, but output
  is gated by the generic checkbox rather than explicit completion of every finding.
- `browser/src/review.js` builds an immediate preview from exclusions and currently applies
  remembered model-location keep choices automatically.
- `browser/src/pipeline.js` already returns stable source offsets, typed-placeholder output,
  residual findings, and `export_allowed`; it likely requires no change.
- `browser/src/worker.js` already emits analysis progress from 0 through 1; it likely requires no
  change.
- Existing browser unit tests had 64 passes and one pre-existing line-ending-sensitive failure in
  `browser/tests/privacy.test.js` when checking `.github/workflows/pages.yml` on Windows.

## Decisions already made

- Apply the redesign only to the GitHub Pages browser edition.
- Retain a final full-note confirmation for missed PHI.
- Keep the annotated original in the single surface and offer a cleaned-preview toggle there after
  review completion.
- Keep `.txt` export alongside clipboard copy.
- Continue using typed placeholders such as `[PERSON_1]` for decision 1.
- Keep the original text locked during review; editing requires an explicit mode change and resets
  review state.
- Automatic findings require explicit current-note confirmation even when an in-memory prior
  choice can be suggested.

## Milestones

### Milestone 1: Explicit decision-domain foundation

Ownership: `browser/src/review.js`, `browser/tests/review.test.js`.

- Add UI-neutral helpers for explicit automatic-finding decisions and completeness.
- Change session-memory reuse into non-binding suggestions rather than automatic exclusions.
- Preserve immediate cleaned-preview construction for explicit redact/keep choices and manual
  findings.
- Cover all-decided, partially decided, zero-finding, suggestion, and preview behavior in unit
  tests.

Acceptance: helpers make it impossible for a suggestion to satisfy the explicit decision gate or
change output; unit tests pass.

Validation: `npm.cmd run browser:test` (the known CRLF-sensitive privacy assertion may remain until
the validation milestone).

### Milestone 2: Single-surface interaction and visual state machine

Ownership: `browser/index.html`, `browser/src/app.js`, `browser/src/styles.css`, plus narrowly
related source-inspection tests in `browser/tests/privacy.test.js`.

- Replace the two panels with the agreed single input/review/preview surface.
- Wire explicit decisions, active inline highlights, synchronized list cards, navigation, manual
  span controls, edit/reset behavior, full-note confirmation, and output gating.
- Add in-button scan progress and Ready for review state.
- Add the cleaned-preview toggle and preserve accessible status announcements.

Acceptance: one document surface is visible at a time; every output gate and keyboard/mouse flow
matches the Requirements; privacy source checks cover the new structure.

Validation: `npm.cmd run browser:test`; `npm.cmd run browser:build`.

This milestone is executed sequentially after a failed first attempt:

- Milestone 2A owns readable semantic markup and integrated single-surface styling in
  `browser/index.html` and `browser/src/styles.css`.
- Milestone 2B owns the controller/state-machine migration in `browser/src/app.js` and the related
  source-inspection assertions in `browser/tests/privacy.test.js`.

The split keeps the large controller rewrite bounded and reviewable. The application may be
temporarily inconsistent between 2A and 2B and must not be accepted or shipped in that state.

### Milestone 3: Browser integration coverage and documentation

Ownership: `browser/tests/browser-smoke.mjs`, `browser/tests/privacy.test.js`, relevant browser
documentation under `docs/` if behavior descriptions require updates.

- Update the smoke flow for explicit per-finding decisions, full-note confirmation, annotated and
  cleaned modes, progress/readiness, copy, export gating, editing invalidation, and update blocking.
- Add or adjust regression coverage for zero findings, manual findings, final verification, and
  privacy constraints where practical.
- Make the pre-existing Pages workflow source assertion line-ending agnostic so Windows validation
  can be clean.
- Update browser-edition user guidance for the new workflow.

Acceptance: tests and documentation describe the shipped behavior, and the complete validation
set is green on this computer.

Validation: `npm.cmd run browser:test`; `npm.cmd run browser:build`; run the browser smoke test with
a locally served production build and an available Chrome/Chromium executable.

### Milestone 3A: Windows local-build portability

Ownership: `package.json`, `browser/vite.config.js`, and a narrowly related build/config test if
needed.

- Make the documented asset-preparation command invoke the available Python interpreter on this
  Windows computer without breaking the Ubuntu Pages build.
- Convert the Vite browser root URL to a filesystem path so a checkout directory containing spaces
  resolves correctly on Windows.
- Keep dependency versions, asset verification, output layout, and deployment behavior unchanged.

Acceptance: the unmodified `npm.cmd run browser:build` command succeeds from this checkout path and
the production browser smoke remains green.

### Milestone 4: Sol integration and acceptance

- Review actual diffs and worker validation after every milestone.
- Check the state transitions, safety gates, keyboard semantics, privacy invariants, responsive
  styling, and final copy/export verification.
- Make only tiny integration corrections directly; return nontrivial corrections to Terra.
- Run final unit/build/smoke validation and inspect the final working tree.

## File or module ownership

- Milestone 1 Terra: `browser/src/review.js`, `browser/tests/review.test.js`.
- Milestone 2 Terra: `browser/index.html`, `browser/src/app.js`, `browser/src/styles.css`, and
  narrowly related `browser/tests/privacy.test.js` assertions.
- Milestone 3 Terra: `browser/tests/browser-smoke.mjs`, `browser/tests/privacy.test.js`, and relevant
  documentation.
- Milestone 3A Terra: `package.json`, `browser/vite.config.js`, and a narrowly related test.
- Sol: this ExecPlan, cross-milestone review, integration decisions, and final acceptance.

Workers share the working tree and must not revert unrelated edits or edit outside their assigned
ownership without first reporting a discovered dependency.

## Acceptance criteria

- Only one large document surface is presented instead of side-by-side Source and Result boxes.
- Scan progress is visible within the Scan and clean control and accurately follows worker events.
- Scan completion visibly transitions to Ready for review.
- Every automatic candidate begins undecided and requires an explicit 1/redact or 2/keep action.
- Inline highlights, keyboard navigation, click navigation, and bottom cards stay synchronized.
- Copy and export remain disabled until all automatic candidates are decided, residual export is
  allowed, the full-note confirmation is checked, no update is required, and no work is running.
- A cleaned preview is available in the same surface after review completion.
- Editing or clearing the note invalidates all scan-specific output authorization.
- Clipboard and exported content use the final verified typed-placeholder result.
- Existing local-only, CSP, update, and no-persistence protections remain intact.
- Automated unit, build, privacy, and browser smoke validation pass.

## Validation

- `npm.cmd run browser:test`
- `npm.cmd run browser:build`
- Serve the production build locally and run `npm.cmd run browser:smoke` with
  `MDC_BROWSER_URL` and `MDC_CHROME_PATH` set for this Windows computer.
- Inspect `git diff --check`, `git status --short`, and the focused diffs after each milestone.

## Progress

- [x] User-approved interaction and safety decisions captured.
- [x] Repository and current browser flow inspected; working tree initially clean.
- [x] Milestone 1 delegated, implemented, validated, and reviewed.
- [x] Milestone 2A markup/styling delegated, implemented, validated, and reviewed.
- [x] Milestone 2B controller delegated, implemented, validated, and reviewed.
- [x] Milestone 3 delegated, implemented, validated, and reviewed.
- [x] Milestone 3A Windows local-build portability delegated, implemented, validated, and reviewed.
- [x] Milestone 4 final integration and acceptance complete.

## Discoveries

- The existing worker already provides determinate analysis progress, avoiding a worker protocol
  redesign.
- A native textarea cannot render per-span highlighting; a visual mode swap is required.
- The existing `reviewedFindingIds` collection records decisions, but the current export gate does
  not require it to cover all automatic findings.
- The current session preference mechanism directly keeps reused model-only locations. That must
  become suggestion-only to honor explicit review.
- The existing final verification reruns analysis before output and must remain intact.
- Milestone 1 introduced explicit `redact`/`keep` decisions, completeness checking, and
  suggestion-only session reuse in `browser/src/review.js`. Undecided automatic findings remain
  redacted in the preview but do not satisfy completion.
- Sol independently confirmed the five focused review tests pass. The full browser unit suite is
  66/67 on Windows, with only the already-known CRLF-sensitive Pages workflow assertion failing.
- The first Milestone 2 Terra attempt delivered useful design discoveries but failed during a
  requested readability rewrite and restored `browser/src/app.js` to its baseline rather than
  leave unsafe partial controller logic. Its compressed partial HTML/CSS/test changes are not
  accepted and may be rewritten by the retry workers. Milestone 2 is now split into 2A and 2B.
- Milestone 2A established the readable one-surface HTML/CSS contract. A formatting-only Spark
  pass introduced a missing CSS brace; per the Spark fallback rule, one Terra reassignment repaired
  and audited it. Sol independently confirmed balanced structure, required IDs exactly once, clean
  diff checks, and removal of obsolete duplicate-output selectors.
- Milestone 2B migrated the browser controller to the accepted DOM contract, including progress,
  explicit decisions, focus-safe synchronized navigation, output gating, final verification, and
  edit invalidation. Sol independently reviewed the corrected state transitions and confirmed the
  full browser unit/privacy suite passes: 67 tests, 0 failures, with a clean diff check.
- Milestone 3 updated the production smoke and browser guide. The first live smoke exposed a strict
  Playwright multi-match wait; the same Terra worker corrected it and then passed the full live
  Chrome flow with 18 same-origin asset requests. Sol reviewed the diff and made one tiny timeout
  argument correction so the progress observation uses the intended 180-second allowance.
- Production validation exposed two baseline Windows portability failures unrelated to the UI:
  `python3` resolves to an unusable Windows Store alias while `python` is installed, and Vite's
  URL `.pathname` leaves the space in `Kyle Kent` percent-encoded. An explicit `browser` CLI root
  proved the application itself built successfully and isolated the narrow portability fix.
- Milestone 3A uses the installed `python` first with a `python3` fallback and converts the Vite
  file URL with `fileURLToPath`. Sol reviewed the diff and confirmed the exact standard Windows
  build succeeds cleanly from the spaced checkout path.
- Final acceptance passed 67/67 browser unit/privacy tests and a production Chrome smoke with 18
  same-origin asset requests. Sol also visually inspected desktop and 430-pixel layouts and
  exercised arrow navigation, one Keep choice, four Redact choices, same-surface preview, and the
  enabled output gate. Final diff checks found no whitespace errors, obsolete duplicate-surface
  IDs, note-persistence APIs, or mojibake markers.

## Exact next action

No implementation work remains. Hand the validated working tree back to the user without deploying
or publishing it.
