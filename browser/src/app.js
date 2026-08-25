import "./styles.css";
import {
  AUTOMATIC_REVIEW_DECISIONS,
  areAutomaticFindingsDecided,
  automaticFindingDecision,
  buildReviewedPreview,
  canRememberClinicalKeep,
  createAutomaticFindingDecisions,
  findingPreferenceKey,
  recordAutomaticFindingDecision,
  sessionKeepSuggestionIds,
} from "./review.js";

const CURRENT_VERSION = __MDC_VERSION__;
const APPLICATION_VERSION = __MDC_APP_VERSION__;
const BUILD_UPDATED_AT = __MDC_UPDATED_AT__;
const UPDATE_CHECK_INTERVAL_MS = 60 * 1_000;
const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });

const elements = {
  addSelectionButton: document.querySelector("#addSelectionButton"),
  characterCount: document.querySelector("#characterCount"),
  clearButton: document.querySelector("#clearButton"),
  copyButton: document.querySelector("#copyButton"),
  documentStatus: document.querySelector("#documentStatus"),
  editNoteButton: document.querySelector("#editNoteButton"),
  engineBadge: document.querySelector("#engineBadge"),
  exportButton: document.querySelector("#exportButton"),
  exportGate: document.querySelector("#exportGate"),
  exportMessage: document.querySelector("#exportMessage"),
  findingCount: document.querySelector("#findingCount"),
  findingsList: document.querySelector("#findingsList"),
  forgetChoicesButton: document.querySelector("#forgetChoicesButton"),
  inputText: document.querySelector("#inputText"),
  keepButton: document.querySelector("#keepButton"),
  manualCategory: document.querySelector("#manualCategory"),
  nextFindingButton: document.querySelector("#nextFindingButton"),
  policyLabel: document.querySelector("#policyLabel"),
  previousFindingButton: document.querySelector("#previousFindingButton"),
  redactButton: document.querySelector("#redactButton"),
  reviewCheckbox: document.querySelector("#reviewCheckbox"),
  reviewNavigator: document.querySelector("#reviewNavigator"),
  reviewPosition: document.querySelector("#reviewPosition"),
  reviewSurface: document.querySelector("#reviewSurface"),
  scanButton: document.querySelector("#scanButton"),
  scanButtonLabel: document.querySelector("#scanButtonLabel"),
  scanProgress: document.querySelector("#scanProgress"),
  sessionChoices: document.querySelector("#sessionChoices"),
  showOriginalButton: document.querySelector("#showOriginalButton"),
  showPreviewButton: document.querySelector("#showPreviewButton"),
  updateButton: document.querySelector("#updateButton"),
  updateNotice: document.querySelector("#updateNotice"),
  updatedLabel: document.querySelector("#updatedLabel"),
  versionLabel: document.querySelector("#versionLabel"),
};

const state = {
  activeFindingIndex: 0,
  analysis: null,
  decisions: createAutomaticFindingDecisions(),
  manualFindings: [],
  mode: "input",
  modelReady: false,
  nextRequestId: 1,
  operation: null,
  processing: false,
  progress: 0,
  requests: new Map(),
  reviewPreferences: new Map(),
  sourceText: "",
  suggestionIds: new Set(),
  updateRequired: false,
  updateVersion: null,
  workerInitialized: false,
};

function automaticFindings() {
  return state.analysis?.findings.filter((finding) => finding.source === "automatic") ?? [];
}

function decisionsComplete() {
  return areAutomaticFindingsDecided(automaticFindings(), state.decisions);
}

function excludedFindingIds() {
  return automaticFindings()
    .filter((finding) =>
      automaticFindingDecision(finding, state.decisions) === AUTOMATIC_REVIEW_DECISIONS.KEEP)
    .map((finding) => finding.finding_id);
}

function currentFinding() {
  return automaticFindings()[state.activeFindingIndex] ?? null;
}

function createEmptyState(message) {
  const paragraph = document.createElement("p");
  paragraph.className = "empty-state";
  paragraph.textContent = message;
  return paragraph;
}

function formatEntityType(entityType) {
  return entityType.replaceAll("_", " ");
}

function outputReady() {
  return Boolean(
    state.analysis?.export_allowed &&
      decisionsComplete() &&
      elements.reviewCheckbox.checked &&
      !state.processing &&
      !state.updateRequired,
  );
}

function setProgress(percent) {
  state.progress = Math.max(0, Math.min(100, Math.round(percent)));
  elements.scanProgress.style.width = `${state.progress}%`;
  if (state.processing) {
    elements.scanProgress.removeAttribute("aria-hidden");
    elements.scanProgress.setAttribute("role", "progressbar");
    elements.scanProgress.setAttribute("aria-valuemin", "0");
    elements.scanProgress.setAttribute("aria-valuemax", "100");
    elements.scanProgress.setAttribute("aria-valuenow", String(state.progress));
    elements.scanProgress.setAttribute(
      "aria-label",
      state.operation === "verify" ? "Verification progress" : "Scan progress",
    );
  } else {
    elements.scanProgress.setAttribute("aria-hidden", "true");
    for (const attribute of ["role", "aria-label", "aria-valuemin", "aria-valuemax", "aria-valuenow"]) {
      elements.scanProgress.removeAttribute(attribute);
    }
  }
}

function renderScanButton() {
  const hasText = Boolean(elements.inputText.value.trim());
  elements.scanButton.classList.toggle("ready-for-review", Boolean(state.analysis && !state.processing));
  if (state.processing) {
    const prefix = state.operation === "verify" ? "Verifying output" : "Scanning locally";
    elements.scanButtonLabel.textContent = `${prefix} · ${state.progress}%`;
    elements.documentStatus.textContent = `${prefix} · ${state.progress}%`;
    elements.scanButton.disabled = true;
  } else if (state.analysis) {
    elements.scanButtonLabel.textContent = "Ready for review";
    elements.scanButton.disabled = true;
  } else {
    elements.scanButtonLabel.textContent = "Scan and clean";
    elements.scanButton.disabled = !hasText || !state.workerInitialized || state.updateRequired;
  }
  setProgress(state.progress);
}

function selectedReviewSpan() {
  if (state.mode !== "review") return null;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!elements.reviewSurface.contains(range.commonAncestorContainer)) return null;
  const offsets = [range.startContainer, range.endContainer].map((container, offset) => {
    const prefix = document.createRange();
    prefix.selectNodeContents(elements.reviewSurface);
    prefix.setEnd(container, offset === 0 ? range.startOffset : range.endOffset);
    return prefix.toString().length;
  });
  const [start, end] = offsets;
  if (start >= end || end > elements.inputText.value.length) return null;
  return { start, end };
}

function updateControls() {
  const count = automaticFindings().length;
  const canConfirm = Boolean(state.analysis?.export_allowed && decisionsComplete() && !state.processing && !state.updateRequired);
  elements.clearButton.disabled = state.processing;
  elements.editNoteButton.disabled = !state.analysis || state.processing;
  elements.showPreviewButton.disabled = !state.analysis || !decisionsComplete() || state.processing;
  elements.showOriginalButton.disabled = !state.analysis || state.mode !== "preview" || state.processing;
  elements.manualCategory.disabled = !state.analysis || state.mode !== "review" || state.processing || state.updateRequired;
  elements.addSelectionButton.disabled = !state.analysis || state.mode !== "review" || state.processing || state.updateRequired || !selectedReviewSpan();
  elements.previousFindingButton.disabled = state.processing || !count || state.activeFindingIndex === 0;
  elements.nextFindingButton.disabled = state.processing || !count || state.activeFindingIndex >= count - 1;
  elements.redactButton.disabled = state.processing || !currentFinding();
  elements.keepButton.disabled = state.processing || !currentFinding();
  elements.forgetChoicesButton.disabled = state.reviewPreferences.size === 0;
  elements.reviewCheckbox.disabled = !canConfirm;
  elements.copyButton.disabled = !outputReady();
  elements.exportButton.disabled = !outputReady();
  elements.exportGate.className = `export-gate ${outputReady() ? "ready" : "blocked"}`;
  renderScanButton();
}

function findingStatus(finding) {
  const decision = automaticFindingDecision(finding, state.decisions);
  if (decision === AUTOMATIC_REVIEW_DECISIONS.REDACT) return "Redact";
  if (decision === AUTOMATIC_REVIEW_DECISIONS.KEEP) return "Keep";
  return state.suggestionIds.has(finding.finding_id) ? "Undecided · keep suggested" : "Undecided";
}

function overlaps(left, right) {
  return left.start < right.end && right.start < left.end;
}

function renderSurface() {
  const showReview = Boolean(state.analysis && state.mode !== "input");
  elements.inputText.classList.toggle("hidden", showReview);
  elements.reviewSurface.classList.toggle("hidden", !showReview);
  elements.reviewSurface.classList.toggle("cleaned-preview", state.mode === "preview");
  elements.reviewSurface.setAttribute("aria-label", state.mode === "preview" ? "De-identified text preview" : "Annotated original clinical note");
  if (!showReview) return;
  if (state.mode === "preview") {
    elements.reviewSurface.textContent = state.analysis.cleaned_text;
    return;
  }

  const text = elements.inputText.value;
  const automatic = automaticFindings();
  const manual = state.analysis.findings.filter(
    (finding) => finding.source === "manual" && !automatic.some((candidate) => overlaps(finding, candidate)),
  );
  const spans = [...automatic, ...manual].sort((left, right) => left.start - right.start || left.end - right.end);
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const finding of spans) {
    if (finding.start < cursor || finding.end > text.length) continue;
    fragment.append(document.createTextNode(text.slice(cursor, finding.start)));
    const mark = document.createElement("mark");
    mark.className = "phi-highlight";
    mark.textContent = text.slice(finding.start, finding.end);
    if (finding.source === "manual") {
      mark.classList.add("manual");
      mark.setAttribute("aria-label", `${formatEntityType(finding.entity_type)}: Manual redact`);
    } else {
      const index = automatic.findIndex((candidate) => candidate.finding_id === finding.finding_id);
      const status = findingStatus(finding);
      const manualOverlap = state.analysis.findings.some(
        (candidate) => candidate.source === "manual" && overlaps(candidate, finding),
      );
      mark.classList.add(status === "Redact" ? "redact" : status === "Keep" ? "keep" : "undecided");
      if (status.startsWith("Undecided") && state.suggestionIds.has(finding.finding_id)) mark.classList.add("suggested");
      if (manualOverlap) mark.classList.add("manual-overlap");
      mark.tabIndex = 0;
      mark.dataset.findingIndex = String(index);
      mark.classList.toggle("active", index === state.activeFindingIndex);
      if (index === state.activeFindingIndex) mark.setAttribute("aria-current", "true");
      mark.setAttribute("aria-label", `${formatEntityType(finding.entity_type)}: ${status}${manualOverlap ? "; manual redact overlaps this finding" : ""}`);
      mark.addEventListener("click", () => setActiveFinding(index, true, "mark"));
      mark.addEventListener("focus", () => setActiveFinding(index));
    }
    fragment.append(mark);
    cursor = finding.end;
  }
  fragment.append(document.createTextNode(text.slice(cursor)));
  elements.reviewSurface.replaceChildren(fragment);
}

function renderReviewNavigator() {
  const findings = automaticFindings();
  if (!findings.length) {
    elements.reviewNavigator.classList.add("hidden");
    return;
  }
  state.activeFindingIndex = Math.min(state.activeFindingIndex, findings.length - 1);
  const decided = findings.filter((finding) => automaticFindingDecision(finding, state.decisions)).length;
  elements.reviewNavigator.classList.remove("hidden");
  elements.reviewPosition.textContent = `Finding ${state.activeFindingIndex + 1} of ${findings.length} · ${decided} decided`;
  elements.sessionChoices.textContent = `${state.reviewPreferences.size} model-location keep choice${state.reviewPreferences.size === 1 ? "" : "s"} remembered; suggestions still need confirmation.`;
}

function renderFindings() {
  if (!state.analysis?.findings.length) {
    elements.findingsList.replaceChildren(createEmptyState("No likely identifiers were detected."));
    elements.reviewNavigator.classList.add("hidden");
    return;
  }
  if (automaticFindings().length === 0) elements.reviewNavigator.classList.add("hidden");
  const fragment = document.createDocumentFragment();
  let automaticIndex = 0;
  for (const finding of state.analysis.findings) {
    const card = document.createElement("article");
    const content = document.createElement("div");
    const type = document.createElement("div");
    const value = document.createElement("div");
    const meta = document.createElement("div");
    const badge = document.createElement("span");
    card.className = "finding-card";
    type.className = "finding-type";
    value.className = "finding-value";
    meta.className = "finding-meta";
    badge.className = "decision-badge";
    type.textContent = formatEntityType(finding.entity_type);
    value.textContent = elements.inputText.value.slice(finding.start, finding.end);
    meta.textContent = `${Math.round(finding.score * 100)}% · ${finding.recognizers.join(", ")}`;
    content.append(type, value, meta);
    if (finding.source === "automatic") {
      const index = automaticIndex++;
      const status = findingStatus(finding);
      card.classList.add(
        "automatic",
        status === "Redact"
          ? "redact"
          : status === "Keep"
            ? "keep"
            : state.suggestionIds.has(finding.finding_id)
              ? "suggested"
              : "undecided",
      );
      card.classList.toggle("active", index === state.activeFindingIndex);
      card.tabIndex = 0;
      if (index === state.activeFindingIndex) card.setAttribute("aria-current", "true");
      card.setAttribute("aria-label", `${formatEntityType(finding.entity_type)}: ${status}`);
      card.addEventListener("click", () => setActiveFinding(index, true, "card"));
      card.addEventListener("focus", () => setActiveFinding(index));
      badge.textContent = status;
      card.append(content, badge);
    } else {
      card.classList.add("manual");
      card.setAttribute("aria-label", `${formatEntityType(finding.entity_type)}: Manual redact`);
      badge.textContent = "Manual redact";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-manual";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => removeManualFinding(finding));
      card.append(content, badge, remove);
    }
    fragment.append(card);
  }
  elements.findingsList.replaceChildren(fragment);
  renderReviewNavigator();
}

function renderOutputGate() {
  if (state.updateRequired) elements.exportMessage.textContent = "A safety update is required before export or copy.";
  else if (state.processing) {
    elements.exportMessage.textContent = state.operation === "verify"
      ? "Final verification is running locally before output."
      : "Local scan is running before review can continue.";
  }
  else if (!state.analysis) elements.exportMessage.textContent = "Run the local scan before exporting or copying.";
  else if (!state.analysis.export_allowed) elements.exportMessage.textContent = state.analysis.export_block_reasons.join(" ");
  else if (!decisionsComplete()) elements.exportMessage.textContent = "Decide Redact or Keep for every detected span before output.";
  else if (!elements.reviewCheckbox.checked) elements.exportMessage.textContent = "Confirm that you reviewed the complete note for missed PHI.";
  else elements.exportMessage.textContent = "Review complete. Copy or export the verified de-identified text.";
}

function populateCategories(categories) {
  elements.manualCategory.replaceChildren();
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = formatEntityType(category);
    elements.manualCategory.append(option);
  }
}

function renderAnalysis() {
  if (!state.analysis) return;
  const preview = buildReviewedPreview(elements.inputText.value, state.analysis.findings, state.decisions);
  state.analysis.cleaned_text = preview.cleanedText;
  state.analysis.applied_count = preview.appliedCount;
  elements.findingCount.textContent = `${preview.appliedCount} replaced · ${automaticFindings().length} detected`;
  elements.policyLabel.textContent = state.analysis.policy_id;
  renderSurface();
  renderFindings();
  populateCategories(state.analysis.manual_entity_types);
  renderOutputGate();
  updateControls();
}

function updateActiveFindingElements() {
  const index = state.activeFindingIndex;
  const marks = elements.reviewSurface.querySelectorAll("[data-finding-index]");
  const cards = elements.findingsList.querySelectorAll(".finding-card.automatic");
  for (const mark of marks) {
    const active = Number(mark.dataset.findingIndex) === index;
    mark.classList.toggle("active", active);
    if (active) mark.setAttribute("aria-current", "true");
    else mark.removeAttribute("aria-current");
  }
  for (const [cardIndex, card] of cards.entries()) {
    const active = cardIndex === index;
    card.classList.toggle("active", active);
    if (active) card.setAttribute("aria-current", "true");
    else card.removeAttribute("aria-current");
  }
}

function setActiveFinding(index, focus = false, targetType = "mark") {
  const findings = automaticFindings();
  if (!findings.length) return;
  state.activeFindingIndex = Math.max(0, Math.min(index, findings.length - 1));
  updateActiveFindingElements();
  renderReviewNavigator();
  updateControls();
  if (focus) {
    const mark = elements.reviewSurface.querySelector(`[data-finding-index="${state.activeFindingIndex}"]`);
    const card = elements.findingsList.querySelectorAll(".finding-card.automatic")[state.activeFindingIndex];
    const target = targetType === "card" ? card ?? mark : mark ?? card;
    target?.focus();
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function setFindingDecision(finding, decision, advance = true) {
  if (!finding || state.processing || state.updateRequired) return;
  if (state.mode === "preview") state.mode = "review";
  recordAutomaticFindingDecision(state.decisions, finding, decision);
  const key = findingPreferenceKey(elements.inputText.value, finding);
  if (decision === AUTOMATIC_REVIEW_DECISIONS.KEEP && canRememberClinicalKeep(finding)) {
    state.reviewPreferences.set(key, false);
  } else if (decision === AUTOMATIC_REVIEW_DECISIONS.REDACT) {
    state.reviewPreferences.delete(key);
    for (const candidate of automaticFindings()) {
      if (findingPreferenceKey(elements.inputText.value, candidate) === key) {
        state.suggestionIds.delete(candidate.finding_id);
      }
    }
  }
  elements.reviewCheckbox.checked = false;
  if (advance) {
    const findings = automaticFindings();
    const unresolved = Array.from({ length: findings.length }, (_unused, offset) =>
      (state.activeFindingIndex + offset + 1) % findings.length,
    ).find((index) => !automaticFindingDecision(findings[index], state.decisions));
    if (unresolved !== undefined) state.activeFindingIndex = unresolved;
    else elements.documentStatus.textContent = decisionsComplete()
      ? "All detected findings are decided. Review the complete note for missed PHI."
      : "Finding decided. Choose the next unresolved finding.";
  }
  renderAnalysis();
  if (advance) requestAnimationFrame(() => setActiveFinding(state.activeFindingIndex, true));
}

function setProcessing(processing, operation = null) {
  state.processing = processing;
  state.operation = processing ? operation : null;
  state.progress = 0;
  renderOutputGate();
  updateControls();
}

function analyzeInWorker(operation) {
  const id = state.nextRequestId++;
  return new Promise((resolve, reject) => {
    state.requests.set(id, { resolve, reject, operation });
    worker.postMessage({
      type: "analyze",
      id,
      text: elements.inputText.value,
      excludedFindingIds: excludedFindingIds(),
      manualFindings: state.manualFindings,
    });
  });
}

async function runAnalysis(resetForNewText = true) {
  const text = elements.inputText.value;
  if (!text.trim() || state.processing || state.updateRequired) return;
  if (resetForNewText && text !== state.sourceText) {
    state.manualFindings = [];
    state.decisions = createAutomaticFindingDecisions();
    state.suggestionIds = new Set();
    elements.reviewCheckbox.checked = false;
  }
  state.sourceText = text;
  setProcessing(true, "scan");
  let completionMessage = null;
  let failureMessage = null;
  try {
    state.analysis = await analyzeInWorker("scan");
    state.suggestionIds = sessionKeepSuggestionIds(text, state.analysis.findings, state.reviewPreferences);
    state.activeFindingIndex = Math.min(state.activeFindingIndex, Math.max(automaticFindings().length - 1, 0));
    state.mode = "review";
    completionMessage = state.analysis.export_allowed
      ? "Local scan complete; review each detected finding."
      : "Local scan complete; export remains blocked.";
  } catch (error) {
    failureMessage = error.message;
  } finally {
    setProcessing(false);
    renderAnalysis();
    elements.documentStatus.textContent = failureMessage ?? completionMessage ?? elements.documentStatus.textContent;
  }
}

function removeManualFinding(finding) {
  state.manualFindings = state.manualFindings.filter(
    (manual) => !(manual.start === finding.start && manual.end === finding.end && manual.entity_type === finding.entity_type),
  );
  elements.reviewCheckbox.checked = false;
  runAnalysis(false);
}

function addManualSelection() {
  const span = selectedReviewSpan();
  if (!state.analysis || !span || state.processing || state.updateRequired) {
    elements.documentStatus.textContent = "Select a span in the annotated original text first.";
    return;
  }
  state.manualFindings.push({ ...span, entity_type: elements.manualCategory.value });
  elements.reviewCheckbox.checked = false;
  runAnalysis(false);
}

async function useVerifiedOutput(action) {
  if (!outputReady()) return;
  setProcessing(true, "verify");
  try {
    const verified = await analyzeInWorker("verify");
    if (!verified.export_allowed || verified.cleaned_text !== state.analysis.cleaned_text) {
      state.analysis = verified;
      state.decisions = createAutomaticFindingDecisions();
      state.suggestionIds = sessionKeepSuggestionIds(elements.inputText.value, verified.findings, state.reviewPreferences);
      state.mode = "review";
      elements.reviewCheckbox.checked = false;
      elements.documentStatus.textContent = "The result changed during final verification; review it again.";
      renderAnalysis();
      return;
    }
    await action(verified.cleaned_text);
  } catch (error) {
    elements.documentStatus.textContent = error.message;
  } finally {
    setProcessing(false);
    renderAnalysis();
  }
}

async function copyText() {
  await useVerifiedOutput(async (cleanedText) => {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable in this browser.");
    await navigator.clipboard.writeText(cleanedText);
    elements.documentStatus.textContent = "De-identified text copied to the device clipboard.";
  });
}

async function exportText() {
  await useVerifiedOutput((cleanedText) => {
    const blob = new Blob([cleanedText], { type: "text/plain;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "deidentified.txt";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
    elements.documentStatus.textContent = "De-identified text exported to this device.";
  });
}

function resetReviewState() {
  state.analysis = null;
  state.sourceText = "";
  state.manualFindings = [];
  state.decisions = createAutomaticFindingDecisions();
  state.suggestionIds = new Set();
  state.activeFindingIndex = 0;
  state.mode = "input";
  elements.reviewCheckbox.checked = false;
  elements.findingCount.textContent = "Not scanned";
  elements.findingsList.replaceChildren(createEmptyState("No scan results yet."));
  elements.reviewNavigator.classList.add("hidden");
  elements.reviewSurface.replaceChildren();
  renderSurface();
  renderOutputGate();
  updateControls();
}

function clearText(statusMessage = "Text cleared from browser memory.") {
  elements.inputText.value = "";
  elements.characterCount.textContent = "0 characters";
  resetReviewState();
  elements.documentStatus.textContent = statusMessage;
  elements.inputText.focus();
}

function editNote() {
  const text = elements.inputText.value;
  resetReviewState();
  elements.inputText.value = text;
  elements.characterCount.textContent = `${text.length.toLocaleString()} characters`;
  elements.documentStatus.textContent = "Editing the note clears scan results and review decisions.";
  elements.inputText.focus();
}

function requireUpdate(version) {
  if (!version || version === CURRENT_VERSION || state.updateRequired) return;
  state.updateRequired = true;
  state.updateVersion = version;
  elements.updateNotice.classList.remove("hidden");
  elements.reviewCheckbox.checked = false;
  elements.exportMessage.textContent = "A safety update is required before export or copy.";
  elements.documentStatus.textContent = "Update required. Clear this note to load the new version.";
  renderOutputGate();
  updateControls();
  if (!elements.inputText.value) updateApplication(version);
}

function updateApplication(version = "latest") {
  clearText("Updating the application…");
  const destination = new URL(window.location.href);
  destination.searchParams.set("version", version);
  destination.searchParams.set("refresh", Date.now().toString(36));
  window.location.replace(destination);
}

async function checkForUpdate() {
  try {
    const manifestUrl = new URL("version.json", document.baseURI);
    manifestUrl.searchParams.set("cacheBust", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const response = await fetch(manifestUrl, {
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (response.ok) requireUpdate((await response.json()).version);
  } catch (_error) {
    // Update checks never include note content and temporary failures are retried.
  }
}

function formatBuildTimestamp(value) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "unknown time";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(timestamp);
}

function reviewKeyboardEvent(event) {
  if (
    state.processing ||
    state.updateRequired ||
    state.mode === "input" ||
    automaticFindings().length === 0
  ) {
    return;
  }
  const target = event.target;
  const allowed =
    elements.reviewSurface.contains(target) ||
    elements.reviewNavigator.contains(target) ||
    target.closest?.(".finding-card.automatic");
  if (!allowed) return;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    setActiveFinding(state.activeFindingIndex - 1, true);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    setActiveFinding(state.activeFindingIndex + 1, true);
  } else if (event.key === "1") {
    event.preventDefault();
    setFindingDecision(currentFinding(), AUTOMATIC_REVIEW_DECISIONS.REDACT);
  } else if (event.key === "2") {
    event.preventDefault();
    setFindingDecision(currentFinding(), AUTOMATIC_REVIEW_DECISIONS.KEEP);
  }
}

worker.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.type === "model-progress") {
    const percent = Math.min(100, Math.max(0, Math.round(message.progress * 100)));
    elements.engineBadge.textContent = `Loading local model · ${percent}%`;
    return;
  }
  if (message?.type === "initialized") {
    state.workerInitialized = true;
    state.modelReady = Boolean(message.ready);
    elements.engineBadge.className = `status-badge ${state.modelReady ? "ready" : "blocked"}`;
    elements.engineBadge.textContent = state.modelReady ? "Browser-local engine ready" : "Export blocked · model unavailable";
    elements.documentStatus.textContent = state.modelReady ? "Paste synthetic plain text to begin." : "The deterministic scan is available, but export is blocked without the local model.";
    updateControls();
    return;
  }
  if (message?.type === "analysis-progress") {
    const pending = state.requests.get(message.id);
    if (!pending || pending.operation !== state.operation) return;
    setProgress(message.progress * 100);
    renderScanButton();
    return;
  }
  if (message?.type === "analysis-result" || message?.type === "analysis-error") {
    const pending = state.requests.get(message.id);
    if (!pending) return;
    state.requests.delete(message.id);
    if (message.type === "analysis-result") pending.resolve(message.result);
    else pending.reject(new Error(message.message));
  }
});

worker.addEventListener("error", () => {
  state.workerInitialized = true;
  state.modelReady = false;
  elements.engineBadge.className = "status-badge blocked";
  elements.engineBadge.textContent = "Browser-local engine unavailable";
  elements.documentStatus.textContent = "The local browser engine could not start.";
  for (const pending of state.requests.values()) pending.reject(new Error("The local browser operation could not be completed."));
  state.requests.clear();
  updateControls();
});

elements.inputText.addEventListener("input", () => {
  elements.characterCount.textContent = `${elements.inputText.value.length.toLocaleString()} characters`;
  updateControls();
});
elements.reviewSurface.addEventListener("mouseup", updateControls);
elements.reviewSurface.addEventListener("keyup", updateControls);
document.addEventListener("keydown", reviewKeyboardEvent);
elements.scanButton.addEventListener("click", () => runAnalysis(true));
elements.clearButton.addEventListener("click", () => clearText());
elements.editNoteButton.addEventListener("click", editNote);
elements.showPreviewButton.addEventListener("click", () => {
  state.mode = "preview";
  renderAnalysis();
});
elements.showOriginalButton.addEventListener("click", () => {
  state.mode = "review";
  renderAnalysis();
});
elements.previousFindingButton.addEventListener("click", () => {
  setActiveFinding(state.activeFindingIndex - 1, true);
});
elements.nextFindingButton.addEventListener("click", () => {
  setActiveFinding(state.activeFindingIndex + 1, true);
});
elements.redactButton.addEventListener("click", () => {
  setFindingDecision(currentFinding(), AUTOMATIC_REVIEW_DECISIONS.REDACT);
});
elements.keepButton.addEventListener("click", () => {
  setFindingDecision(currentFinding(), AUTOMATIC_REVIEW_DECISIONS.KEEP);
});
elements.forgetChoicesButton.addEventListener("click", () => {
  state.reviewPreferences.clear();
  state.suggestionIds = new Set();
  renderAnalysis();
});
elements.reviewCheckbox.addEventListener("change", () => {
  renderOutputGate();
  updateControls();
});
elements.addSelectionButton.addEventListener("click", addManualSelection);
elements.copyButton.addEventListener("click", copyText);
elements.exportButton.addEventListener("click", exportText);
elements.updateButton.addEventListener("click", () => {
  updateApplication(state.updateVersion ?? "latest");
});
window.addEventListener("pageshow", checkForUpdate);
window.addEventListener("online", checkForUpdate);
setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);

const shortBuild = CURRENT_VERSION === "development" ? CURRENT_VERSION : CURRENT_VERSION.slice(0, 7);
elements.versionLabel.textContent = `Version ${APPLICATION_VERSION} · Build ${shortBuild}`;
elements.updatedLabel.textContent = `Last updated ${formatBuildTimestamp(BUILD_UPDATED_AT)}`;
resetReviewState();
worker.postMessage({ type: "initialize", baseUrl: document.baseURI });
checkForUpdate();
