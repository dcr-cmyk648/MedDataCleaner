"use strict";

const token = document.querySelector('meta[name="med-data-cleaner-token"]').content;

const elements = {
  addSelectionButton: document.querySelector("#addSelectionButton"),
  characterCount: document.querySelector("#characterCount"),
  cleanedOutput: document.querySelector("#cleanedOutput"),
  clearButton: document.querySelector("#clearButton"),
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
};

const state = {
  analysis: null,
  sourceText: "",
  exclusions: new Set(),
  manualFindings: [],
  processing: false,
};

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("X-Med-Data-Cleaner-Token", token);
  if (options.body) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...options, headers, cache: "no-store" });
  if (!response.ok) {
    let message = "The local operation could not be completed.";
    try {
      const error = await response.json();
      if (typeof error.detail === "string") message = error.detail;
    } catch (_ignored) {
      // Keep the generic error. Never echo a raw response into the page.
    }
    throw new Error(message);
  }
  return response;
}

function requestBody() {
  return {
    text: elements.inputText.value,
    excluded_finding_ids: Array.from(state.exclusions),
    manual_findings: state.manualFindings,
  };
}

function setProcessing(processing) {
  state.processing = processing;
  elements.scanButton.disabled = processing || !elements.inputText.value.trim();
  elements.clearButton.disabled = processing;
  elements.addSelectionButton.disabled = processing || !state.analysis;
  elements.manualCategory.disabled = processing || !state.analysis;
  updateExportButton();
  if (processing) elements.documentStatus.textContent = "Running local detectors…";
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
  elements.exportButton.disabled = true;
  elements.exportGate.className = "export-gate blocked";
  elements.exportMessage.textContent = "Run the local scan before exporting.";
  elements.manualCategory.disabled = true;
  elements.addSelectionButton.disabled = true;
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
  const ordered = [...findings].sort((a, b) => a.start - b.start || b.end - a.end);
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
      const spacer = document.createElement("span");
      card.append(spacer);
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
  elements.manualCategory.disabled = false;
  elements.addSelectionButton.disabled = false;

  const automaticCount = analysis.findings.filter((finding) => finding.source === "automatic").length;
  elements.findingCount.textContent = `${analysis.applied_count} replaced · ${automaticCount} detected`;
  elements.policyLabel.textContent = analysis.policy_id;

  elements.exportGate.className = `export-gate ${analysis.export_allowed ? "ready" : "blocked"}`;
  if (analysis.export_allowed) {
    elements.exportMessage.textContent = "Residual scan passed. Complete the human review to export.";
    elements.reviewCheckbox.disabled = false;
  } else {
    elements.exportMessage.textContent = analysis.export_block_reasons.join(" ");
    elements.reviewCheckbox.checked = false;
    elements.reviewCheckbox.disabled = true;
  }
  updateExportButton();
  elements.documentStatus.textContent = analysis.export_allowed
    ? "Local scan complete; review is still required."
    : "Local scan complete; export remains blocked.";
}

async function runAnalysis(resetIfTextChanged = true) {
  const text = elements.inputText.value;
  if (!text.trim() || state.processing) return;

  if (resetIfTextChanged && text !== state.sourceText) {
    state.exclusions.clear();
    state.manualFindings = [];
    elements.reviewCheckbox.checked = false;
  }
  state.sourceText = text;
  setProcessing(true);
  try {
    const response = await api("/api/deidentify", {
      method: "POST",
      body: JSON.stringify(requestBody()),
    });
    state.analysis = await response.json();
    renderAnalysis();
  } catch (error) {
    elements.documentStatus.textContent = error.message;
  } finally {
    setProcessing(false);
  }
}

function updateExportButton() {
  elements.exportButton.disabled = !(
    state.analysis?.export_allowed && elements.reviewCheckbox.checked && !state.processing
  );
}

async function exportText() {
  if (!state.analysis?.export_allowed || !elements.reviewCheckbox.checked) return;
  setProcessing(true);
  try {
    const response = await api("/api/export", {
      method: "POST",
      body: JSON.stringify({ ...requestBody(), review_confirmed: true }),
    });
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "deidentified.txt";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
    elements.documentStatus.textContent = "De-identified text exported locally.";
  } catch (error) {
    elements.documentStatus.textContent = error.message;
  } finally {
    setProcessing(false);
    updateExportButton();
  }
}

function addManualSelection() {
  const start = elements.inputText.selectionStart;
  const end = elements.inputText.selectionEnd;
  if (!state.analysis || start === end) {
    elements.documentStatus.textContent = "Select a span in the original text first.";
    return;
  }
  state.manualFindings.push({
    start,
    end,
    entity_type: elements.manualCategory.value,
  });
  elements.reviewCheckbox.checked = false;
  runAnalysis(false);
}

async function loadStatus() {
  try {
    const response = await api("/api/status");
    const status = await response.json();
    elements.engineBadge.className = `status-badge ${status.engine_ready ? "ready" : "blocked"}`;
    elements.engineBadge.textContent = status.engine_ready
      ? "Local engine ready"
      : "Export blocked · model unavailable";
    elements.engineBadge.title = status.detector_statuses
      .map((detector) => detector.detail)
      .join("\n");
    elements.inputText.maxLength = status.max_text_length;
    elements.policyLabel.textContent = status.policy_id;
  } catch (_error) {
    elements.engineBadge.className = "status-badge blocked";
    elements.engineBadge.textContent = "Local engine unavailable";
  }
}

elements.inputText.addEventListener("input", () => {
  elements.characterCount.textContent = `${elements.inputText.value.length.toLocaleString()} characters`;
  elements.scanButton.disabled = !elements.inputText.value.trim() || state.processing;
  if (state.analysis && elements.inputText.value !== state.sourceText) {
    resetReviewState();
    elements.documentStatus.textContent = "Text changed. Run a new scan.";
  }
});
elements.scanButton.addEventListener("click", () => runAnalysis(true));
elements.clearButton.addEventListener("click", () => {
  elements.inputText.value = "";
  elements.characterCount.textContent = "0 characters";
  resetReviewState();
  elements.scanButton.disabled = true;
  elements.documentStatus.textContent = "Text cleared from the application.";
  elements.inputText.focus();
});
elements.reviewCheckbox.addEventListener("change", updateExportButton);
elements.exportButton.addEventListener("click", exportText);
elements.addSelectionButton.addEventListener("click", addManualSelection);

resetReviewState();
elements.scanButton.disabled = true;
loadStatus();
