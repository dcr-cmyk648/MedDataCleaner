import "./styles.css";

const CURRENT_VERSION = __MDC_VERSION__;
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
  highlightOutput: document.querySelector("#highlightOutput"),
  inputText: document.querySelector("#inputText"),
  manualCategory: document.querySelector("#manualCategory"),
  policyLabel: document.querySelector("#policyLabel"),
  reviewCheckbox: document.querySelector("#reviewCheckbox"),
  scanButton: document.querySelector("#scanButton"),
  updateButton: document.querySelector("#updateButton"),
  updateNotice: document.querySelector("#updateNotice"),
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
  nextRequestId: 1,
  requests: new Map(),
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
  elements.cleanedOutput.textContent = "The cleaned text will appear here.";
  elements.cleanedOutput.classList.add("muted");
  elements.highlightOutput.textContent = "Findings will be highlighted here.";
  elements.highlightOutput.classList.add("muted");
  elements.findingCount.textContent = "Not scanned";
  elements.findingsList.replaceChildren(createEmptyState("No scan results yet."));
  elements.reviewCheckbox.checked = false;
  elements.reviewCheckbox.disabled = true;
  elements.exportGate.className = "export-gate blocked";
  elements.exportMessage.textContent = "Run the local scan before exporting or copying.";
  updateControls();
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
  for (const finding of findings) {
    const card = document.createElement("article");
    card.className = `finding-card${finding.selected ? "" : " excluded"}`;

    if (finding.source === "automatic") {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = finding.selected;
      checkbox.setAttribute("aria-label", `Replace ${formatEntityType(finding.entity_type)} finding`);
      checkbox.addEventListener("change", async () => {
        if (checkbox.checked) state.exclusions.delete(finding.finding_id);
        else state.exclusions.add(finding.finding_id);
        elements.reviewCheckbox.checked = false;
        await runAnalysis(false);
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
    ? "Local scan complete; review is still required."
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
  window.location.replace(destination);
}

async function checkForUpdate() {
  try {
    const manifestUrl = new URL("version.json", document.baseURI);
    manifestUrl.searchParams.set("request", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
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
elements.updateButton.addEventListener("click", () => updateApplication());

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkForUpdate();
});
window.setInterval(checkForUpdate, 5 * 60 * 1_000);

resetReviewState();
elements.versionLabel.textContent = `Version ${CURRENT_VERSION}`;
worker.postMessage({ type: "initialize", baseUrl: document.baseURI });
checkForUpdate();
