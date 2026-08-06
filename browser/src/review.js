import { mergeOverlaps } from "./pipeline.js";
import { PLACEHOLDER_LABELS, normalizeEntityType } from "./policy.js";

const GENERIC_MODEL_RECOGNIZER = "browser-onnx:distilbert-ner";

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

export function applySessionPreferences(text, findings, preferences, exclusions) {
  let appliedCount = 0;
  for (const finding of findings) {
    if (!canRememberClinicalKeep(finding)) continue;
    const preference = preferences.get(findingPreferenceKey(text, finding));
    if (preference !== false) continue;
    exclusions.add(finding.finding_id);
    appliedCount += 1;
  }
  return appliedCount;
}

export function buildReviewedPreview(text, findings, exclusions) {
  const selectedFindings = findings.filter(
    (finding) => finding.source !== "automatic" || !exclusions.has(finding.finding_id),
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
