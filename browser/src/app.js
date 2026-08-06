import "./styles.css";
import {
  applySessionPreferences,
  buildReviewedPreview,
  canRememberClinicalKeep,
  findingPreferenceKey,
} from "./review.js";

const CURRENT_VERSION = __MDC_VERSION__;
const APPLICATION_VERSION = __MDC_APP_VERSION__;
const BUILD_UPDATED_AT = __MDC_UPDATED_AT__;
const UPDATE_CHECK_INTERVAL_MS = 60 * 1_000;
const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });

const elements = {
  addSelectionButton: document.querySelector("#addSelectionButton"),
  characterCount: document.querySelector("#characterCount"),
  cleanedOutput: document.querySelector("#cleanedOutput"),
  clearButton: document.querySelector("#clearButton"),
  copyButton: document.querySelector("#copyButton"),
  documentStatus: document.querySelector("#documentStatus"),
  engineBadge: document.querySelector("#engineBadge"),
  exportButton: document.querySelector("#exportButton"),
  exportGate: document.querySelector("#exportGate"),
  exportMessage: document.querySelector("#exportMessage"),
  findingCount: document.querySelector("#findingCount"),
  findingsList: document.querySelector("#findingsList"),
  forgetChoicesButton: document.querySelector("#forgetChoicesButton"),
  highlightOutput: document.querySelector("#highlightOutput"),
  inputText: document.querySelector("#inputText"),
  keepButton: document.querySelector("#keepButton"),
  manualCategory: document.querySelector("#manualCategory"),
  nextFindingButton: document.querySelector("#nextFindingButton"),
  policyLabel: document.querySelector("#policyLabel"),
  previousFindingButton: document.querySelector("#previousFindingButton"),
  redactButton: document.querySelector("#redactButton"),
  reviewNavigator: document.querySelector("#reviewNavigator"),
  reviewPosition: document.querySelector("#reviewPosition"),
  sessionChoices: document.querySelector("#sessionChoices"),
  reviewCheckbox: document.querySelector("#reviewCheckbox"),
  scanButton: document.querySelector("#scanButton"),
  updateButton: document.querySelector("#updateButton"),
  updateNotice: document.querySelector("#updateNotice"),
  updatedLabel: document.querySelector("#updatedLabel"),
  versionLabel: document.querySelector("#versionLabel"),
};

const state = {
  analysis: null,
  sourceText: "",
  exclusions: new Set(),
  manualFindings: [],
  processing: false,
  workerInitialized: false,
  modelReady: false,
  updateRequired: false,
  updateVersion: null,
  nextRequestId: 1,
  requests: new Map(),
  activeFindingIndex: 0,
  reviewPreferences: new Map(),
  reviewedFindingIds: new Set(),
  preferenceHitCount: 0,
};

function createEmptyState(message) {
  const paragraph = document.createElement("p");
  paragraph.className = "empty-state";
  paragraph.textContent = message;
  return paragraph;
}

function formatEntityType(entityType) {
  return entityType.replaceAll("_", " ");
}

function updateControls() {
  const hasText = Boolean(elements.inputText.value.trim());
  const automaticCount =
    state.analysis?.findings.filter((finding) => finding.source === "automatic").length ?? 0;
  elements.scanButton.disabled =
    state.processing || !state.workerInitialized || !hasText || state.updateRequired;
  elements.clearButton.disabled = state.processing;
  elements.addSelectionButton.disabled =
    state.processing || !state.analysis || state.updateRequired;
  elements.manualCategory.disabled = state.processing || !state.analysis || state.updateRequired;
  elements.exportButton.disabled = !(
    state.analysis?.export_allowed &&
    elements.reviewCheckbox.checked &&
    !state.processing &&
    !state.updateRequired
  );
  elements.copyButton.disabled = elements.exportButton.disabled;
  elements.previousFindingButton.disabled =
    state.processing || automaticCount === 0 || state.activeFindingIndex === 0;
  elements.nextFindingButton.disabled =
    state.processing ||
    automaticCount === 0 ||
    state.activeFindingIndex >= automaticCount - 1;
  elements.redactButton.disabled = state.processing || automaticCount === 0;
  elements.keepButton.disabled = state.processing || automaticCount === 0;
  elements.forgetChoicesButton.disabled = state.reviewPreferences.size === 0;
}

function setProcessing(processing) {
  state.processing = processing;
  updateControls();
  if (processing) elements.documentStatus.textContent = "Running local browser detectors…";
}

function resetReviewState() {
  state.analysis = null;
  state.sourceText = "";
  state.exclusions.clear();
  state.manualFindings = [];
  state.activeFindingIndex = 0;
  state.reviewedFindingIds.clear();
  state.preferenceHitCount = 0;
  elements.cleanedOutput.textContent = "The cleaned text will appear here.";
  elements.cleanedOutput.classList.add("muted");
  elements.highlightOutput.textContent = "Findings will be highlighted here.";
  elements.highlightOutput.classList.add("muted");
  elements.findingCount.textContent = "Not scanned";
  elements.findingsList.replaceChildren(createEmptyState("No scan results yet."));
  elements.reviewNavigator.classList.add("hidden");
  elements.reviewCheckbox.checked = false;
  elements.reviewCheckbox.disabled = true;
  elements.exportGate.className = "export-gate blocked";
  elements.exportMessage.textContent = "Run the local scan before exporting or copying.";
  updateControls();
}

function automaticFindings() {
  return state.analysis?.findings.filter((finding) => finding.source === "automatic") ?? [];
}

function syncReviewedPreview() {
  if (!state.analysis) return;
  for (const finding of state.analysis.findings) {
    if (finding.source === "automatic") {
      finding.selected = !state.exclusions.has(finding.finding_id);
    }
  }
  const preview = buildReviewedPreview(
    elements.inputText.value,
    state.analysis.findings,
    state.exclusions,
  );
  state.analysis.cleaned_text = preview.cleanedText;
  state.analysis.applied_count = preview.appliedCount;
}

function renderReviewNavigator() {
  const findings = automaticFindings();
  if (!findings.length) {
    elements.reviewNavigator.classList.add("hidden");
    return;
  }
  state.activeFindingIndex = Math.min(state.activeFindingIndex, findings.length - 1);
  elements.reviewNavigator.classList.remove("hidden");
  elements.reviewPosition.textContent =
    `Finding ${state.activeFindingIndex + 1} of ${findings.length} · ` +
    `${state.reviewedFindingIds.size} decided`;
  const learned = state.preferenceHitCount
    ? ` · ${state.preferenceHitCount} reused in this scan`
    : "";
  elements.sessionChoices.textContent =
    `${state.reviewPreferences.size} model-location keep choice${
      state.reviewPreferences.size === 1 ? "" : "s"
    } remembered${learned}`;
}

function setActiveFinding(index, focus = false) {
  const findings = automaticFindings();
  if (!findings.length) return;
  state.activeFindingIndex = Math.max(0, Math.min(index, findings.length - 1));
  const cards = elements.findingsList.querySelectorAll(".finding-card.automatic");
  for (const [cardIndex, card] of cards.entries()) {
    card.classList.toggle("active", cardIndex === state.activeFindingIndex);
  }
  renderReviewNavigator();
  updateControls();
  if (focus) {
    const activeCard = cards[state.activeFindingIndex];
    activeCard?.focus();
    activeCard?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function setFindingDecision(finding, selected, advance = true) {
  if (!finding || finding.source !== "automatic" || state.processing) return;
  const key = findingPreferenceKey(elements.inputText.value, finding);
  const remembered = !selected && canRememberClinicalKeep(finding);
  if (remembered) state.reviewPreferences.set(key, false);
  else state.reviewPreferences.delete(key);
  for (const candidate of automaticFindings()) {
    if (findingPreferenceKey(elements.inputText.value, candidate) !== key) continue;
    if (selected) state.exclusions.delete(candidate.finding_id);
    else state.exclusions.add(candidate.finding_id);
    state.reviewedFindingIds.add(candidate.finding_id);
  }
  elements.reviewCheckbox.checked = false;
  if (advance) {
    state.activeFindingIndex = Math.min(
      state.activeFindingIndex + 1,
      Math.max(automaticFindings().length - 1, 0),
    );
  }
  syncReviewedPreview();
  renderAnalysis();
  elements.documentStatus.textContent = selected
    ? "Marked for de-identification. De-identification remains the default."
    : remembered
      ? "Marked as clinical text to keep. This exact model-only location term is remembered in this tab."
      : "Marked as clinical text to keep for this note only. Identifier choices are never learned.";
  requestAnimationFrame(() => setActiveFinding(state.activeFindingIndex, true));
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

function renderHighlight(findings) {
  const text = elements.inputText.value;
  const ordered = [...findings].sort((left, right) => left.start - right.start || right.end - left.end);
  const fragment = document.createDocumentFragment();
  let cursor = 0;

  for (const finding of ordered) {
    if (finding.start < cursor || finding.end > text.length) continue;
    fragment.append(document.createTextNode(text.slice(cursor, finding.start)));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(finding.start, finding.end);
    mark.title = `${formatEntityType(finding.entity_type)} · ${Math.round(finding.score * 100)}%`;
    if (!finding.selected) mark.classList.add("excluded");
    fragment.append(mark);
    cursor = finding.end;
  }
  fragment.append(document.createTextNode(text.slice(cursor)));
  elements.highlightOutput.replaceChildren(fragment);
  elements.highlightOutput.classList.remove("muted");
}

function renderFindings(findings) {
  if (!findings.length) {
    elements.findingsList.replaceChildren(createEmptyState("No likely identifiers were detected."));
    return;
  }

  const fragment = document.createDocumentFragment();
  let automaticIndex = 0;
  for (const finding of findings) {
    const card = document.createElement("article");
    card.className = `finding-card${finding.selected ? "" : " excluded"}`;

    if (finding.source === "automatic") {
      const findingIndex = automaticIndex;
      automaticIndex += 1;
      card.classList.add("automatic");
      card.classList.toggle("active", findingIndex === state.activeFindingIndex);
      card.classList.toggle("reviewed", state.reviewedFindingIds.has(finding.finding_id));
      card.tabIndex = 0;
      card.addEventListener("click", () => setActiveFinding(findingIndex));
      card.addEventListener("focus", () => setActiveFinding(findingIndex));
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.tabIndex = -1;
      checkbox.checked = finding.selected;
      checkbox.setAttribute("aria-label", `Replace ${formatEntityType(finding.entity_type)} finding`);
      checkbox.addEventListener("change", () => {
        state.activeFindingIndex = findingIndex;
        setFindingDecision(finding, checkbox.checked, false);
      });
      card.append(checkbox);
    } else {
      const indicator = document.createElement("span");
      indicator.textContent = "+";
      indicator.setAttribute("aria-hidden", "true");
      card.append(indicator);
    }

    const content = document.createElement("div");
    const type = document.createElement("div");
    type.className = "finding-type";
    type.textContent = `${formatEntityType(finding.entity_type)}${
      finding.source === "manual" ? " · MANUAL" : ""
    }`;
    const value = document.createElement("div");
    value.className = "finding-value";
    value.textContent = elements.inputText.value.slice(finding.start, finding.end);
    const meta = document.createElement("div");
    meta.className = "finding-meta";
    meta.textContent = `${Math.round(finding.score * 100)}% · ${finding.recognizers.join(", ")}`;
    content.append(type, value, meta);
    card.append(content);

    if (finding.source === "manual") {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-manual";
      remove.textContent = "Remove";
      remove.addEventListener("click", async () => {
        const manualIndex = Number.parseInt(finding.finding_id.split("-")[1], 10) - 1;
        state.manualFindings.splice(manualIndex, 1);
        elements.reviewCheckbox.checked = false;
        await runAnalysis(false);
      });
      card.append(remove);
    } else {
      card.append(document.createElement("span"));
    }
    fragment.append(card);
  }
  elements.findingsList.replaceChildren(fragment);
  renderReviewNavigator();
}

function renderAnalysis() {
  const analysis = state.analysis;
  if (!analysis) return;

  elements.cleanedOutput.textContent = analysis.cleaned_text;
  elements.cleanedOutput.classList.remove("muted");
  renderHighlight(analysis.findings);
  renderFindings(analysis.findings);
  populateCategories(analysis.manual_entity_types);
  elements.findingCount.textContent = `${analysis.applied_count} replaced · ${
    analysis.findings.filter((finding) => finding.source === "automatic").length
  } detected`;
  elements.policyLabel.textContent = analysis.policy_id;

  elements.exportGate.className = `export-gate ${analysis.export_allowed ? "ready" : "blocked"}`;
  if (analysis.export_allowed && !state.updateRequired) {
    elements.exportMessage.textContent =
      "Residual scan passed. Complete the human review to export or copy.";
    elements.reviewCheckbox.disabled = false;
  } else {
    elements.exportMessage.textContent = state.updateRequired
      ? "A safety update is required before export or copy."
      : analysis.export_block_reasons.join(" ");
    elements.reviewCheckbox.checked = false;
    elements.reviewCheckbox.disabled = true;
  }
  elements.documentStatus.textContent = analysis.export_allowed
    ? state.preferenceHitCount
      ? `Local scan complete; ${state.preferenceHitCount} learned keep choices reused. Review is still required.`
      : "Local scan complete; review is still required."
    : "Local scan complete; export remains blocked.";
  updateControls();
}

function analyzeInWorker() {
  const id = state.nextRequestId;
  state.nextRequestId += 1;
  return new Promise((resolve, reject) => {
    state.requests.set(id, { resolve, reject });
    worker.postMessage({
      type: "analyze",
      id,
      text: elements.inputText.value,
      excludedFindingIds: [...state.exclusions],
      manualFindings: state.manualFindings,
    });
  });
}

async function runAnalysis(resetIfTextChanged = true) {
  const text = elements.inputText.value;
  if (!text.trim() || state.processing || state.updateRequired) return;
  if (resetIfTextChanged && text !== state.sourceText) {
    state.exclusions.clear();
    state.manualFindings = [];
    elements.reviewCheckbox.checked = false;
  }
  state.sourceText = text;
  setProcessing(true);
  try {
    state.analysis = await analyzeInWorker();
    state.reviewedFindingIds.clear();
    state.preferenceHitCount = applySessionPreferences(
      text,
      state.analysis.findings,
      state.reviewPreferences,
      state.exclusions,
    );
    for (const finding of state.analysis.findings) {
      if (
        finding.source === "automatic" &&
        state.reviewPreferences.has(findingPreferenceKey(text, finding))
      ) {
        state.reviewedFindingIds.add(finding.finding_id);
      }
    }
    state.activeFindingIndex = 0;
    syncReviewedPreview();
    renderAnalysis();
  } catch (error) {
    elements.documentStatus.textContent = error.message;
  } finally {
    setProcessing(false);
  }
}

function reviewedOutputAllowed() {
  return Boolean(
    state.analysis?.export_allowed &&
      elements.reviewCheckbox.checked &&
      !state.processing &&
      !state.updateRequired,
  );
}

async function useVerifiedOutput(action) {
  if (!reviewedOutputAllowed()) return;
  setProcessing(true);
  try {
    const verified = await analyzeInWorker();
    if (!verified.export_allowed || verified.cleaned_text !== state.analysis.cleaned_text) {
      state.analysis = verified;
      elements.reviewCheckbox.checked = false;
      renderAnalysis();
      elements.documentStatus.textContent = "The result changed during final verification; review it again.";
      return;
    }

    await action(verified.cleaned_text);
  } catch (error) {
    elements.documentStatus.textContent = error.message;
  } finally {
    setProcessing(false);
  }
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

async function copyText() {
  await useVerifiedOutput(async (cleanedText) => {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard access is unavailable in this browser.");
    }
    await navigator.clipboard.writeText(cleanedText);
    elements.documentStatus.textContent = "De-identified text copied to the device clipboard.";
  });
}

function addManualSelection() {
  const start = elements.inputText.selectionStart;
  const end = elements.inputText.selectionEnd;
  if (!state.analysis || start === end) {
    elements.documentStatus.textContent = "Select a span in the original text first.";
    return;
  }
  state.manualFindings.push({ start, end, entity_type: elements.manualCategory.value });
  elements.reviewCheckbox.checked = false;
  runAnalysis(false);
}

function clearText(statusMessage = "Text cleared from browser memory.") {
  elements.inputText.value = "";
  elements.characterCount.textContent = "0 characters";
  resetReviewState();
  elements.documentStatus.textContent = statusMessage;
  elements.inputText.focus();
}

function requireUpdate(newVersion) {
  if (!newVersion || newVersion === CURRENT_VERSION || state.updateRequired) return;
  state.updateRequired = true;
  state.updateVersion = newVersion;
  elements.updateNotice.classList.remove("hidden");
  elements.reviewCheckbox.checked = false;
  elements.reviewCheckbox.disabled = true;
  elements.exportMessage.textContent = "A safety update is required before export or copy.";
  elements.documentStatus.textContent = "Update required. Clear this note to load the new version.";
  updateControls();

  if (!elements.inputText.value) updateApplication(newVersion);
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
    manifestUrl.searchParams.set(
      "cacheBust",
      `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const response = await fetch(manifestUrl, {
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) return;
    const manifest = await response.json();
    requireUpdate(manifest.version);
  } catch (_error) {
    // A temporary update-check failure does not expose note data and is retried later.
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
    elements.engineBadge.textContent = state.modelReady
      ? "Browser-local engine ready"
      : "Export blocked · model unavailable";
    elements.documentStatus.textContent = state.modelReady
      ? "Paste synthetic plain text to begin."
      : "The deterministic scan is available, but export is blocked without the local model.";
    updateControls();
    return;
  }
  if (message?.type === "analysis-progress") {
    elements.documentStatus.textContent = `Running local browser detectors · ${Math.round(
      message.progress * 100,
    )}%`;
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
  for (const pending of state.requests.values()) {
    pending.reject(new Error("The local browser operation could not be completed."));
  }
  state.requests.clear();
  updateControls();
});

elements.inputText.addEventListener("input", () => {
  elements.characterCount.textContent = `${elements.inputText.value.length.toLocaleString()} characters`;
  if (state.analysis && elements.inputText.value !== state.sourceText) {
    resetReviewState();
    elements.documentStatus.textContent = "Text changed. Run a new scan.";
  }
  updateControls();
});
elements.scanButton.addEventListener("click", () => runAnalysis(true));
elements.clearButton.addEventListener("click", () => clearText());
elements.reviewCheckbox.addEventListener("change", updateControls);
elements.exportButton.addEventListener("click", exportText);
elements.copyButton.addEventListener("click", copyText);
elements.addSelectionButton.addEventListener("click", addManualSelection);
elements.updateButton.addEventListener("click", () =>
  updateApplication(state.updateVersion ?? "latest"),
);
elements.previousFindingButton.addEventListener("click", () =>
  setActiveFinding(state.activeFindingIndex - 1, true),
);
elements.nextFindingButton.addEventListener("click", () =>
  setActiveFinding(state.activeFindingIndex + 1, true),
);
elements.redactButton.addEventListener("click", () =>
  setFindingDecision(automaticFindings()[state.activeFindingIndex], true),
);
elements.keepButton.addEventListener("click", () =>
  setFindingDecision(automaticFindings()[state.activeFindingIndex], false),
);
elements.forgetChoicesButton.addEventListener("click", () => {
  state.reviewPreferences.clear();
  state.preferenceHitCount = 0;
  renderReviewNavigator();
  elements.documentStatus.textContent =
    "Learned model-location keep choices forgotten. Current note decisions were not changed.";
  updateControls();
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return;
  }
  if (!automaticFindings().length || state.processing || state.updateRequired) return;
  if (event.key === "1") {
    event.preventDefault();
    setFindingDecision(automaticFindings()[state.activeFindingIndex], true);
  } else if (event.key === "2") {
    event.preventDefault();
    setFindingDecision(automaticFindings()[state.activeFindingIndex], false);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    setActiveFinding(state.activeFindingIndex - 1, true);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    setActiveFinding(state.activeFindingIndex + 1, true);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkForUpdate();
});
window.addEventListener("pageshow", checkForUpdate);
window.addEventListener("online", checkForUpdate);
window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);

resetReviewState();
const shortBuild = CURRENT_VERSION === "development" ? CURRENT_VERSION : CURRENT_VERSION.slice(0, 7);
elements.versionLabel.textContent = `Version ${APPLICATION_VERSION} · Build ${shortBuild}`;
elements.updatedLabel.textContent = `Last updated ${formatBuildTimestamp(BUILD_UPDATED_AT)}`;
worker.postMessage({ type: "initialize", baseUrl: document.baseURI });
checkForUpdate();
