import { mergeOverlaps } from "./pipeline.js";
import { PLACEHOLDER_LABELS, normalizeEntityType } from "./policy.js";

const GENERIC_MODEL_RECOGNIZER = "browser-onnx:distilbert-ner";

export const AUTOMATIC_REVIEW_DECISIONS = Object.freeze({
  REDACT: "redact",
  KEEP: "keep",
});

function isAutomaticFinding(finding) {
  return finding.source === "automatic";
}

function isAutomaticReviewDecision(decision) {
  return (
    decision === AUTOMATIC_REVIEW_DECISIONS.REDACT ||
    decision === AUTOMATIC_REVIEW_DECISIONS.KEEP
  );
}

/**
 * Creates the per-note decision store. This must be newly created whenever a
 * note is edited or scanned again: decisions never carry over between notes.
 */
export function createAutomaticFindingDecisions() {
  return new Map();
}

/**
 * Records an explicit reviewer decision for one automatic finding.
 *
 * Manual and residual findings are deliberate redactions, not review choices,
 * so they are intentionally ignored here.
 */
export function recordAutomaticFindingDecision(decisions, finding, decision) {
  if (!isAutomaticFinding(finding)) return false;
  if (!isAutomaticReviewDecision(decision)) {
    throw new TypeError(`Unknown automatic finding decision: ${decision}`);
  }
  decisions.set(finding.finding_id, decision);
  return true;
}

/**
 * Returns an explicit current-note decision, or null when the finding remains
 * unresolved. Values in a decision map for non-automatic findings never count.
 */
export function automaticFindingDecision(finding, decisions) {
  if (!isAutomaticFinding(finding)) return null;
  const decision = decisions?.get?.(finding.finding_id);
  return isAutomaticReviewDecision(decision) ? decision : null;
}

/**
 * A scan is review-complete only when every automatic finding has an explicit
 * current-note decision. With no automatic findings, no 1/2 review is needed.
 */
export function areAutomaticFindingsDecided(findings, decisions) {
  return findings
    .filter(isAutomaticFinding)
    .every((finding) => automaticFindingDecision(finding, decisions) !== null);
}

export function canRememberClinicalKeep(finding) {
  return (
    finding.source === "automatic" &&
    finding.entity_type === "LOCATION" &&
    finding.recognizers.includes(GENERIC_MODEL_RECOGNIZER)
  );
}

export function findingPreferenceKey(text, finding) {
  const value = text
    .slice(finding.start, finding.end)
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");
  const recognizers = [...finding.recognizers].sort().join(",");
  return `${finding.entity_type}\0${recognizers}\0${value}`;
}

export function sessionKeepSuggestionIds(text, findings, preferences) {
  const suggestions = new Set();
  for (const finding of findings) {
    if (!canRememberClinicalKeep(finding)) continue;
    const preference = preferences.get(findingPreferenceKey(text, finding));
    if (preference !== false) continue;
    suggestions.add(finding.finding_id);
  }
  return suggestions;
}

/**
 * @deprecated Use sessionKeepSuggestionIds. Kept temporarily so an older UI
 * can render a suggestion count while it is migrated to explicit decisions.
 * It deliberately does not mutate exclusions or affect preview output.
 */
export function applySessionPreferences(text, findings, preferences) {
  return sessionKeepSuggestionIds(text, findings, preferences).size;
}

export function buildReviewedPreview(text, findings, decisions) {
  const selectedFindings = findings.filter(
    (finding) =>
      !isAutomaticFinding(finding) ||
      automaticFindingDecision(finding, decisions) !== AUTOMATIC_REVIEW_DECISIONS.KEEP,
  );
  const detections = mergeOverlaps(
    selectedFindings.map((finding) => ({
      start: finding.start,
      end: finding.end,
      entityType: finding.entity_type,
      score: finding.score,
      recognizers: finding.recognizers,
    })),
  );
  const counters = new Map();
  const valueTokens = new Map();
  const replacements = [];

  for (const detection of detections) {
    const label = PLACEHOLDER_LABELS[normalizeEntityType(detection.entityType)];
    const valueKey = `${label}\0${text.slice(detection.start, detection.end).toLocaleLowerCase()}`;
    let replacement = valueTokens.get(valueKey);
    if (!replacement) {
      const counter = (counters.get(label) ?? 0) + 1;
      counters.set(label, counter);
      replacement = `[${label}_${counter}]`;
      valueTokens.set(valueKey, replacement);
    }
    replacements.push({ start: detection.start, end: detection.end, value: replacement });
  }

  let cleanedText = text;
  for (const replacement of replacements.reverse()) {
    cleanedText =
      cleanedText.slice(0, replacement.start) +
      replacement.value +
      cleanedText.slice(replacement.end);
  }

  return { cleanedText, appliedCount: selectedFindings.length };
}
