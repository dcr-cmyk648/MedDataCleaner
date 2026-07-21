const CLINICAL_HEADER_ALLOWLIST = new Set([
  "A1C",
  "ADDRESS",
  "ATTENDING",
  "BMP",
  "CALLBACK",
  "CAREGIVER",
  "CARDIOLOGY",
  "CBC",
  "CLINIC",
  "CMP",
  "CONSULT",
  "CONTACT",
  "CONTINUE",
  "CT",
  "DEPARTMENT",
  "DISEASE",
  "DISCHARGE",
  "DOB",
  "D0B",
  "ECG",
  "EEG",
  "ECHOCARDIOGRAM",
  "ED",
  "EKG",
  "ER",
  "EMERGENCY",
  "FOLLOW-UP",
  "FATHER",
  "GENERAL",
  "GUARDIAN",
  "HIPAA",
  "HOME",
  "H0ME",
  "HUSBAND",
  "HPI",
  "ICU",
  "INFECTIOUS",
  "INFUSION",
  "KT/V",
  "MEDICAL",
  "MEDICINE",
  "MOOD",
  "MOTHER",
  "MONTHLY",
  "MRI",
  "MRN",
  "NPI",
  "N4ME",
  "NEUROLOGY",
  "NOTE",
  "OBSTETRICIAN",
  "ONCOLOGY",
  "ONCOLOGIST",
  "PATIENT",
  "PAT1ENT",
  "PATLENT",
  "PARTNER",
  "PATHOLOGY",
  "PATHOLOGIST",
  "PEDIATRIC",
  "PEDIATRICIAN",
  "PHI",
  "PMH",
  "PORTAL",
  "POTASSIUM",
  "PTH",
  "PSH",
  "PRENATAL",
  "PROCEDURE",
  "PROGRESS",
  "PSYCHIATRY",
  "PSYCHIATRIST",
  "RADIOLOGY",
  "RADIOLOGIST",
  "REPORT",
  "ROS",
  "SSN",
  "SUMMARY",
  "SURGICAL",
  "SURGEON",
  "SURGERY",
  "SPOUSE",
  "STUDY",
  "POSTOPERATIVE",
  "URR",
  "VISIT",
  "WIFE",
  "WORKSTATION",
]);

const CLINICAL_NER_EXCLUSIONS = new Set([
  "CREATININE",
  "METHICILLIN-SENSITIVE",
  "TOTAL",
  "VITAMIN AND",
]);

function isClinicalHeader(value) {
  const words = value
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .map((word) => word.replace(/^[^A-Z0-9]+|[^A-Z0-9/\-]+$/g, ""))
    .filter(Boolean);
  return (
    words.length > 0 &&
    words.length <= 5 &&
    words.every((word) => CLINICAL_HEADER_ALLOWLIST.has(word))
  );
}

function isClinicalNerExclusion(value) {
  return CLINICAL_NER_EXCLUSIONS.has(value.trim().toUpperCase().replace(/\s+/g, " "));
}

const NATIONAL_CHAIN_TERMS = new Set([
  "COSTCO",
  "CVS",
  "KROGER",
  "MEIJER",
  "RITE AID",
  "WALGREENS",
  "WALMART",
]);

const GENERIC_CHAIN_CONTEXT =
  /(?:\b(?:go(?:es|ing)?|went|shops?|shopped|shopping|visits?|visited|visiting)[ \t]+(?:to|at)[ \t]+|\b(?:fills?|filled|filling)[ \t]+(?:at|with)[ \t]+|\bpharmacy(?:[ \t]+is)?[ \t]+(?:at[ \t]+)?)$/i;
const MEDICATION_CONTEXT =
  /(?:\b(?:takes?|taking|uses?|using|continue(?:d|s)?|prescribed|given|administered)[ \t]+|\b(?:is|was|started|remains|continued)[ \t]+on[ \t]+|\btreated[ \t]+with[ \t]+)$/i;
const GEOGRAPHIC_SUFFIX =
  /^[ \t]+(?:avenue|ave\.?|boulevard|blvd\.?|court|ct\.?|drive|dr\.?|highway|hwy\.?|island|lane|ln\.?|parkway|pkwy\.?|road|rd\.?|street|st\.?)\b/i;

export function chunkText(text, maxChunkCharacters = 1_200, overlapCharacters = 160) {
  if (text.length <= maxChunkCharacters) return [{ start: 0, end: text.length, text }];

  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const targetEnd = Math.min(text.length, start + maxChunkCharacters);
    let end = targetEnd;
    if (targetEnd < text.length) {
      const searchFloor = Math.max(start + Math.floor(maxChunkCharacters * 0.7), start + 1);
      for (let cursor = targetEnd; cursor >= searchFloor; cursor -= 1) {
        if (/\s/.test(text[cursor])) {
          end = cursor;
          break;
        }
      }
    }
    if (end <= start) end = targetEnd;
    chunks.push({ start, end, text: text.slice(start, end) });
    if (end >= text.length) break;

    let nextStart = Math.max(start + 1, end - overlapCharacters);
    while (nextStart < end && nextStart > start + 1 && !/\s/.test(text[nextStart - 1])) {
      nextStart += 1;
    }
    start = Math.min(nextStart, end);
  }
  return chunks;
}

function normalizeModelLabel(result) {
  const raw = String(result.entity_group ?? result.entity ?? "").toUpperCase();
  return raw.replace(/^[BI]-/, "");
}

function mapModelLabel(label) {
  if (label === "PER" || label === "PERSON") return "PERSON";
  if (label === "LOC" || label === "LOCATION" || label === "ORG" || label === "ORGANIZATION") {
    return "LOCATION";
  }
  return null;
}

function trimmedSpan(text, start, end) {
  while (start < end && /\s/.test(text[start])) start += 1;
  while (end > start && /\s/.test(text[end - 1])) end -= 1;
  return [start, end];
}

function expandedTokenSpan(text, start, end) {
  const tokenCharacter = /[A-Za-z0-9'’/\\-]/;
  while (start > 0 && tokenCharacter.test(text[start - 1])) start -= 1;
  while (end < text.length && tokenCharacter.test(text[end])) end += 1;
  return [start, end];
}

function removeTrailingClinicalHeader(text, start, end) {
  const detectedText = text.slice(start, end);
  const match = /[.\s]+([A-Za-z0-9/]+)$/.exec(detectedText);
  if (match && CLINICAL_HEADER_ALLOWLIST.has(match[1].toUpperCase())) {
    return trimmedSpan(text, start, start + match.index);
  }
  return [start, end];
}

function removeLeadingClinicalHeader(text, start, end) {
  const detectedText = text.slice(start, end);
  const match = /^([A-Za-z0-9/\-]+)[.\s:]+/.exec(detectedText);
  if (match && CLINICAL_HEADER_ALLOWLIST.has(match[1].toUpperCase())) {
    return trimmedSpan(text, start + match[0].length, end);
  }
  return [start, end];
}

function mergeModelCandidates(text, candidates) {
  const ordered = [...candidates].sort((left, right) => left.start - right.start || left.end - right.end);
  const merged = [];
  for (const candidate of ordered) {
    const previous = merged.at(-1);
    const gap = previous ? text.slice(previous.end, candidate.start) : "";
    if (
      previous &&
      previous.entityType === candidate.entityType &&
      (candidate.start <= previous.end || /^[.'’/\\-]*$/.test(gap))
    ) {
      previous.end = Math.max(previous.end, candidate.end);
      previous.score = Math.max(previous.score, candidate.score);
      continue;
    }
    merged.push({ ...candidate });
  }
  return merged;
}

function compactForAlignment(value) {
  return value.replaceAll("##", "").replace(/\s+/g, "").toLocaleLowerCase();
}

function findCompactSpan(text, value, cursor) {
  const target = compactForAlignment(value);
  if (!target) return null;

  for (let start = cursor; start < text.length; start += 1) {
    if (/\s/.test(text[start])) continue;
    let candidate = "";
    let end = start;
    while (end < text.length && candidate.length < target.length) {
      if (!/\s/.test(text[end])) candidate += text[end].toLocaleLowerCase();
      end += 1;
    }
    if (candidate === target) return [start, end];
  }
  return null;
}

export function alignNerResults(text, results) {
  let cursor = 0;
  return results.flatMap((result) => {
    if (Number.isInteger(result.start) && Number.isInteger(result.end)) {
      cursor = Math.max(cursor, result.end);
      return [result];
    }

    const word = String(result.word ?? "").trim();
    if (!word) return [];
    let start = text.indexOf(word, cursor);
    let end = start < 0 ? -1 : start + word.length;
    if (start < 0) {
      const aligned = findCompactSpan(text, word, cursor);
      if (!aligned) return [];
      [start, end] = aligned;
    }
    cursor = end;
    return [{ ...result, start, end }];
  });
}

function splitBioLabel(result) {
  if (result.entity_group) return ["S", String(result.entity_group).toUpperCase()];
  const label = String(result.entity ?? "").toUpperCase();
  const match = /^(B|I|E|S)-(.+)$/.exec(label);
  return match ? [match[1], match[2]] : ["S", label];
}

export function groupNerResults(text, results) {
  const groups = [];
  for (const result of results) {
    const [prefix, label] = splitBioLabel(result);
    const previous = groups.at(-1);
    const gap = previous ? text.slice(previous.end, result.start) : "";
    const canExtend =
      previous &&
      previous.entity_group === label &&
      (prefix === "I" || prefix === "E") &&
      /^[\s'’./\\-]*$/.test(gap);

    if (canExtend) {
      previous.score_total += Number(result.score);
      previous.token_count += 1;
      previous.score = previous.score_total / previous.token_count;
      previous.end = result.end;
      previous.word = text.slice(previous.start, previous.end);
      continue;
    }

    groups.push({
      entity_group: label,
      score: Number(result.score),
      score_total: Number(result.score),
      token_count: 1,
      word: text.slice(result.start, result.end),
      start: result.start,
      end: result.end,
    });
  }
  return groups.map(({ score_total: _scoreTotal, token_count: _tokenCount, ...group }) => group);
}

export function mapNerResults(text, chunkStart, results, scoreThreshold = 0.35) {
  const candidates = [];
  for (const result of results) {
    const entityType = mapModelLabel(normalizeModelLabel(result));
    const score = Number(result.score);
    if (!entityType || !Number.isFinite(score) || score < scoreThreshold) continue;
    if (!Number.isInteger(result.start) || !Number.isInteger(result.end)) continue;

    const rawStart = chunkStart + result.start;
    const rawEnd = chunkStart + result.end;
    if (rawStart < 0 || rawEnd > text.length || rawEnd <= rawStart) continue;

    for (const segmentMatch of text.slice(rawStart, rawEnd).matchAll(/[^\r\n]+/g)) {
      let start = rawStart + segmentMatch.index;
      let end = start + segmentMatch[0].length;
      [start, end] = trimmedSpan(text, start, end);
      if (end <= start) continue;
      [start, end] = expandedTokenSpan(text, start, end);
      [start, end] = removeLeadingClinicalHeader(text, start, end);
      [start, end] = removeTrailingClinicalHeader(text, start, end);
      if (end <= start) continue;
      candidates.push({
        start,
        end,
        entityType,
        score,
        recognizers: ["browser-onnx:distilbert-ner"],
      });
    }
  }

  return mergeModelCandidates(text, candidates).filter((detection) => {
    const detectedText = text.slice(detection.start, detection.end);
    if (isClinicalHeader(detectedText) || isClinicalNerExclusion(detectedText)) return false;
    if (detection.entityType !== "LOCATION") return true;
    if (detectedText.length > 48 && /\d/.test(detectedText) && /[a-z][A-Z]/.test(detectedText)) {
      // OCR/run-on prose can become one model token. Deterministic recognizers still remove the
      // dates and facility inside it; treating the entire token as a location would destroy the
      // surrounding clinical narrative.
      return false;
    }

    const prefix = text.slice(Math.max(0, detection.start - 60), detection.start);
    const suffix = text.slice(detection.end, Math.min(text.length, detection.end + 24));
    if (
      NATIONAL_CHAIN_TERMS.has(detectedText.toUpperCase()) &&
      GENERIC_CHAIN_CONTEXT.test(prefix)
    ) {
      return false;
    }
    return !(MEDICATION_CONTEXT.test(prefix) && !GEOGRAPHIC_SUFFIX.test(suffix));
  });
}

export class BrowserNerDetector {
  constructor(classifier, { scoreThreshold = 0.35 } = {}) {
    this.classifier = classifier;
    this.scoreThreshold = scoreThreshold;
    this.ready = typeof classifier === "function";
  }

  async detect(text, progressCallback = () => {}) {
    if (!this.ready) return [];
    const chunks = chunkText(text);
    const detections = [];
    for (const [index, chunk] of chunks.entries()) {
      const results = await this.classifier(chunk.text, {
        aggregation_strategy: "simple",
        ignore_labels: ["O"],
      });
      const aligned = alignNerResults(chunk.text, results);
      const grouped = groupNerResults(chunk.text, aligned);
      detections.push(...mapNerResults(text, chunk.start, grouped, this.scoreThreshold));
      progressCallback((index + 1) / chunks.length);
    }
    return detections;
  }
}
