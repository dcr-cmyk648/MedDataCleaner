import {
  ENTITY_PRIORITY,
  MANUAL_ENTITY_TYPES,
  MAX_TEXT_LENGTH,
  PLACEHOLDER_LABELS,
  POLICY_ID,
  normalizeEntityType,
} from "./policy.js";
import { detectWithRules, isInsidePlaceholder } from "./rules.js";

const CONTEXTUAL_TYPE_RECOGNIZERS = Object.freeze({
  LOCATION: new Set([
    "concatenated-facility-name",
    "contextual-facility-name",
    "labeled-facility-name",
  ]),
  PERSON: new Set(["labeled-name", "relationship-name", "titled-clinician-name"]),
  UNIQUE_ID: new Set(["other-contextual-identifier", "provider-identifier"]),
});

function detectionRank(detection) {
  const contextualRecognizers = CONTEXTUAL_TYPE_RECOGNIZERS[detection.entityType];
  const contextual = contextualRecognizers
    ? detection.recognizers.some((recognizer) => contextualRecognizers.has(recognizer))
    : false;
  return [Number(contextual), ENTITY_PRIORITY[detection.entityType] ?? 0, detection.score];
}

function isHigherRank(candidateRank, currentRank) {
  return candidateRank.some(
    (value, index) =>
      value > currentRank[index] &&
      candidateRank.slice(0, index).every((earlier, earlierIndex) => earlier === currentRank[earlierIndex]),
  );
}

function validateInput(text, manualFindings) {
  if (typeof text !== "string" || !text.trim()) throw new Error("Text is required.");
  if (text.length > MAX_TEXT_LENGTH) throw new Error("Text exceeds the local processing limit.");
  if (text.includes("\0")) throw new Error("Text contains an unsupported null character.");
  if (!Array.isArray(manualFindings) || manualFindings.length > 1_000) {
    throw new Error("Manual review data is invalid.");
  }
  for (const finding of manualFindings) {
    if (!MANUAL_ENTITY_TYPES.includes(finding.entity_type)) {
      throw new Error("Manual review data is invalid.");
    }
    if (
      !Number.isInteger(finding.start) ||
      !Number.isInteger(finding.end) ||
      finding.start < 0 ||
      finding.end <= finding.start ||
      finding.end > text.length
    ) {
      throw new Error("Manual review data is invalid.");
    }
  }
}

export function mergeOverlaps(detections) {
  const ordered = [...detections].sort(
    (left, right) =>
      left.start - right.start ||
      left.end - right.end ||
      right.score - left.score ||
      left.entityType.localeCompare(right.entityType),
  );
  if (!ordered.length) return [];

  const merged = [];
  let current = ordered[0];
  for (const candidate of ordered.slice(1)) {
    if (candidate.start >= current.end) {
      merged.push(current);
      current = candidate;
      continue;
    }

    const currentRank = detectionRank(current);
    const candidateRank = detectionRank(candidate);
    const candidateWins = isHigherRank(candidateRank, currentRank);
    current = {
      start: Math.min(current.start, candidate.start),
      end: Math.max(current.end, candidate.end),
      entityType: candidateWins ? candidate.entityType : current.entityType,
      score: Math.max(current.score, candidate.score),
      recognizers: [...new Set([...current.recognizers, ...candidate.recognizers])].sort(),
    };
  }
  merged.push(current);
  return merged;
}

function replaceDetections(text, detections) {
  const counters = new Map();
  const valueTokens = new Map();
  const replacements = [];

  for (const detection of detections) {
    const label = PLACEHOLDER_LABELS[normalizeEntityType(detection.entityType)];
    const valueKey = `${label}\0${text.slice(detection.start, detection.end).toLocaleLowerCase()}`;
    let replacementValue = valueTokens.get(valueKey);
    if (!replacementValue) {
      const counter = (counters.get(label) ?? 0) + 1;
      counters.set(label, counter);
      replacementValue = `[${label}_${counter}]`;
      valueTokens.set(valueKey, replacementValue);
    }
    replacements.push({ start: detection.start, end: detection.end, value: replacementValue });
  }

  let cleanedText = text;
  for (const replacement of [...replacements].reverse()) {
    cleanedText =
      cleanedText.slice(0, replacement.start) +
      replacement.value +
      cleanedText.slice(replacement.end);
  }
  return { cleanedText, replacements };
}

function mapOriginalSpan(start, end, replacements) {
  let delta = 0;
  for (const replacement of replacements) {
    if (replacement.end <= start) {
      delta += replacement.value.length - (replacement.end - replacement.start);
      continue;
    }
    if (replacement.start >= end) break;
    return null;
  }
  return [start + delta, end + delta];
}

function mapExcludedSpans(findings, replacements) {
  const exemptions = [];
  for (const finding of findings) {
    if (finding.selected) continue;
    const mapped = mapOriginalSpan(finding.start, finding.end, replacements);
    if (mapped) exemptions.push([mapped[0], mapped[1], finding.entity_type]);
  }
  return exemptions;
}

function isReviewedExemption(detection, exemptions) {
  return exemptions.some(
    ([start, end, entityType]) =>
      detection.start >= start && detection.end <= end && detection.entityType === entityType,
  );
}

async function detectAll(text, nerDetector, progressCallback) {
  const detections = detectWithRules(text);
  if (nerDetector?.ready) {
    detections.push(...(await nerDetector.detect(text, progressCallback)));
  }
  return detections.filter(
    (detection) =>
      detection.start >= 0 &&
      detection.end > detection.start &&
      detection.end <= text.length &&
      !isInsidePlaceholder(text, detection),
  );
}

function publicFinding(detection, findingId, selected, source = "automatic") {
  return {
    finding_id: findingId,
    start: detection.start,
    end: detection.end,
    entity_type: normalizeEntityType(detection.entityType),
    score: Number(detection.score.toFixed(4)),
    recognizers: detection.recognizers,
    selected,
    source,
  };
}

export async function deidentify({
  text,
  excludedFindingIds = [],
  manualFindings = [],
  nerDetector = null,
  progressCallback = () => {},
}) {
  validateInput(text, manualFindings);
  const exclusions = new Set(excludedFindingIds);
  const automaticDetections = mergeOverlaps(
    await detectAll(text, nerDetector, (progress) => progressCallback(progress * 0.5)),
  );
  const automaticFindings = automaticDetections.map((detection, index) => {
    const findingId = `auto-${String(index + 1).padStart(4, "0")}`;
    return publicFinding(detection, findingId, !exclusions.has(findingId));
  });

  const selectedDetections = automaticDetections.filter(
    (_detection, index) => automaticFindings[index].selected,
  );
  const manualDetections = manualFindings.map((finding) => ({
    start: finding.start,
    end: finding.end,
    entityType: normalizeEntityType(finding.entity_type),
    score: 1,
    recognizers: ["human-review"],
  }));
  const manualPublicFindings = manualDetections.map((detection, index) =>
    publicFinding(detection, `manual-${String(index + 1).padStart(4, "0")}`, true, "manual"),
  );

  const applied = mergeOverlaps([...selectedDetections, ...manualDetections]);
  const { cleanedText, replacements } = replaceDetections(text, applied);
  const exemptions = mapExcludedSpans(automaticFindings, replacements);
  let residualDetections = mergeOverlaps(
    await detectAll(cleanedText, nerDetector, (progress) => progressCallback(0.5 + progress * 0.5)),
  );
  residualDetections = residualDetections.filter(
    (detection) =>
      !isInsidePlaceholder(cleanedText, detection) &&
      !isReviewedExemption(detection, exemptions),
  );
  const residualFindings = residualDetections.map((detection, index) =>
    publicFinding(detection, `residual-${String(index + 1).padStart(4, "0")}`, false, "residual"),
  );

  const detectorStatuses = [
    {
      name: "deterministic-rules",
      ready: true,
      required: true,
      detail: "Browser deterministic recognizers ready",
    },
    {
      name: "browser-local-ner",
      ready: Boolean(nerDetector?.ready),
      required: true,
      detail: nerDetector?.ready
        ? "Pinned DistilBERT ONNX model ready in browser memory"
        : "Required browser NER model is unavailable; export is blocked",
    },
  ];
  const blockReasons = [];
  if (detectorStatuses.some((status) => status.required && !status.ready)) {
    blockReasons.push("A required local detector is unavailable.");
  }
  if (residualFindings.length) {
    blockReasons.push("The cleaned text still contains unresolved findings.");
  }

  const findings = [...automaticFindings, ...manualPublicFindings];
  return {
    cleaned_text: cleanedText,
    findings,
    residual_findings: residualFindings,
    detector_statuses: detectorStatuses,
    policy_id: POLICY_ID,
    applied_count: findings.filter((finding) => finding.selected).length,
    export_allowed: blockReasons.length === 0,
    export_block_reasons: blockReasons,
    manual_entity_types: MANUAL_ENTITY_TYPES,
  };
}
