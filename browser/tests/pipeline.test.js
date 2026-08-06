import assert from "node:assert/strict";
import test from "node:test";

import { deidentify, mergeOverlaps } from "../src/pipeline.js";

const readyEmptyNer = {
  ready: true,
  async detect() {
    return [];
  },
};

test("replaces deterministic findings with stable typed placeholders", async () => {
  const text = "Patient name: Jane Doe. MRN: AB-12345. Call 313-555-0199 twice: 313-555-0199.";
  const result = await deidentify({ text, nerDetector: readyEmptyNer });

  assert.equal(
    result.cleaned_text,
    "Patient name: [PERSON_1]. MRN: [MEDICAL_RECORD_NUMBER_1]. Call [PHONE_NUMBER_1] twice: [PHONE_NUMBER_1].",
  );
  assert.equal(result.export_allowed, true);
  assert.deepEqual(result.residual_findings, []);
});

test("matches the malformed synthetic regression output", async () => {
  const text =
    "The patient is a 4\n" +
    "3 year old male with a history of schizoaffective disorder and polysubstance use " +
    "disorder who presents for dialysis. He is on Zyprexa. He was most recently " +
    "hospitalized 4....13.26. He lives in Kals-amazoo, Michigan with his mother Ma/rtha. " +
    "He likes to go to Walgreens to hang out. He will sometimes use Depakote. His zip code " +
    "is 4444....{2]. His pharmacy is at -192480{{2234 farmington]]]lane in North//ville";
  const result = await deidentify({ text, nerDetector: readyEmptyNer });

  assert.equal(
    result.cleaned_text,
    "The patient is a 4\n" +
      "3 year old male with a history of schizoaffective disorder and polysubstance use " +
      "disorder who presents for dialysis. He is on Zyprexa. He was most recently " +
      "hospitalized [DATE_1]. He lives in [LOCATION_1], Michigan with his mother [PERSON_1]. " +
      "He likes to go to Walgreens to hang out. He will sometimes use Depakote. His zip code " +
      "is [ZIP_CODE_1]. His pharmacy is at [ADDRESS_1] in [LOCATION_2]",
  );
  assert.equal(result.export_allowed, true);
});

test("uses provider placeholders while preserving referral purpose", async () => {
  const text =
    "Patient: Jessa Wren. Refer to Dr. Maya Hart for fistulogram on 08/20/2026.";
  const result = await deidentify({ text, nerDetector: readyEmptyNer });

  assert.equal(
    result.cleaned_text,
    "Patient: [PERSON_1]. Refer to [PROVIDER_1] for fistulogram on [DATE_1].",
  );
  assert.equal(result.export_allowed, true);
});

test("uses local NER results for unlabelled names and locations", async () => {
  const text = "Jordan Example arrived from Testville.";
  const detector = {
    ready: true,
    async detect(value) {
      const detections = [];
      for (const [needle, entityType] of [
        ["Jordan Example", "PERSON"],
        ["Testville", "LOCATION"],
      ]) {
        const start = value.indexOf(needle);
        if (start >= 0) {
          detections.push({
            start,
            end: start + needle.length,
            entityType,
            score: 0.95,
            recognizers: ["synthetic-browser-ner"],
          });
        }
      }
      return detections;
    },
  };
  const result = await deidentify({ text, nerDetector: detector });

  assert.equal(result.cleaned_text, "[PERSON_1] arrived from [LOCATION_1].");
  assert.equal(result.export_allowed, true);
});

test("blocks export when the required browser model is unavailable", async () => {
  const result = await deidentify({
    text: "No obvious identifiers in this synthetic sentence.",
    nerDetector: null,
  });

  assert.equal(result.export_allowed, false);
  assert.match(result.export_block_reasons[0], /required local detector/i);
});

test("preserves human exclusions and manual findings", async () => {
  const text = "Documentation example: test@example.com and nickname Nightingale.";
  const initial = await deidentify({ text, nerDetector: readyEmptyNer });
  const email = initial.findings.find((finding) => finding.entity_type === "EMAIL_ADDRESS");
  const nicknameStart = text.indexOf("Nightingale");
  const reviewed = await deidentify({
    text,
    excludedFindingIds: [email.finding_id],
    manualFindings: [
      { start: nicknameStart, end: nicknameStart + "Nightingale".length, entity_type: "PERSON" },
    ],
    nerDetector: readyEmptyNer,
  });

  assert.match(reviewed.cleaned_text, /test@example\.com/);
  assert.match(reviewed.cleaned_text, /\[PERSON_1\]/);
  assert.equal(reviewed.export_allowed, true);
});

test("unions overlaps and keeps the higher-priority entity label", () => {
  const merged = mergeOverlaps([
    { start: 0, end: 4, entityType: "PERSON", score: 0.9, recognizers: ["person"] },
    { start: 0, end: 8, entityType: "ADDRESS", score: 0.7, recognizers: ["address"] },
  ]);

  assert.deepEqual(merged, [
    {
      start: 0,
      end: 8,
      entityType: "ADDRESS",
      score: 0.9,
      recognizers: ["address", "person"],
    },
  ]);
});

test("prefers a contextual facility rule over a conflicting generic-model person label", () => {
  const merged = mergeOverlaps([
    {
      start: 0,
      end: 23,
      entityType: "LOCATION",
      score: 0.96,
      recognizers: ["labeled-facility-name"],
    },
    {
      start: 0,
      end: 23,
      entityType: "PERSON",
      score: 0.99,
      recognizers: ["browser-onnx:distilbert-ner"],
    },
  ]);

  assert.equal(merged[0].entityType, "LOCATION");
});
