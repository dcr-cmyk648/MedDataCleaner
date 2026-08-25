import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTOMATIC_REVIEW_DECISIONS,
  applySessionPreferences,
  areAutomaticFindingsDecided,
  automaticFindingDecision,
  buildReviewedPreview,
  canRememberClinicalKeep,
  createAutomaticFindingDecisions,
  findingPreferenceKey,
  recordAutomaticFindingDecision,
  sessionKeepSuggestionIds,
} from "../src/review.js";

function finding(id, start, end, entityType = "LOCATION") {
  return {
    finding_id: id,
    start,
    end,
    entity_type: entityType,
    score: 0.8,
    recognizers: ["browser-onnx:distilbert-ner"],
    selected: true,
    source: "automatic",
  };
}

test("builds an instant preview from explicit decisions without rerunning a detector", () => {
  const text = "Farxiga and Dr. Maya Hart";
  const medication = finding("auto-0001", 0, 7);
  const provider = finding("auto-0002", 16, 25, "PROVIDER");
  const decisions = createAutomaticFindingDecisions();
  recordAutomaticFindingDecision(
    decisions,
    medication,
    AUTOMATIC_REVIEW_DECISIONS.KEEP,
  );
  recordAutomaticFindingDecision(
    decisions,
    provider,
    AUTOMATIC_REVIEW_DECISIONS.REDACT,
  );

  const preview = buildReviewedPreview(text, [medication, provider], decisions);

  assert.equal(preview.cleanedText, "Farxiga and Dr. [PROVIDER_1]");
  assert.equal(preview.appliedCount, 1);
});

test("undecided automatic findings have safe preview redaction but are incomplete", () => {
  const text = "Maya Hart in Detroit";
  const provider = finding("auto-0001", 0, 9, "PROVIDER");
  const location = finding("auto-0002", 13, 20);
  const decisions = createAutomaticFindingDecisions();

  recordAutomaticFindingDecision(
    decisions,
    provider,
    AUTOMATIC_REVIEW_DECISIONS.KEEP,
  );

  const preview = buildReviewedPreview(text, [provider, location], decisions);

  assert.equal(preview.cleanedText, "Maya Hart in [LOCATION_1]");
  assert.equal(areAutomaticFindingsDecided([provider, location], decisions), false);
  assert.equal(automaticFindingDecision(location, decisions), null);
});

test("all automatic findings must be explicitly decided, while zero automatic findings are complete", () => {
  const automatic = finding("auto-0001", 0, 7);
  const manual = { ...finding("manual-0001", 8, 12, "PERSON"), source: "manual" };
  const residual = { ...finding("residual-0001", 13, 20), source: "residual" };
  const decisions = createAutomaticFindingDecisions();

  assert.equal(areAutomaticFindingsDecided([], decisions), true);
  assert.equal(areAutomaticFindingsDecided([manual, residual], decisions), true);
  assert.equal(areAutomaticFindingsDecided([automatic, manual], decisions), false);

  recordAutomaticFindingDecision(
    decisions,
    automatic,
    AUTOMATIC_REVIEW_DECISIONS.REDACT,
  );

  assert.equal(areAutomaticFindingsDecided([automatic, manual, residual], decisions), true);
  assert.equal(recordAutomaticFindingDecision(decisions, manual, "keep"), false);
  assert.equal(automaticFindingDecision(manual, decisions), null);
});

test("remembered model-only location keeps are non-binding suggestions", () => {
  const location = finding("auto-0001", 0, 7);
  const provider = finding("auto-0002", 8, 17, "PROVIDER");
  const deterministicLocation = {
    ...finding("auto-0003", 18, 30),
    recognizers: ["labeled-facility-name"],
  };

  assert.equal(canRememberClinicalKeep(location), true);
  assert.equal(canRememberClinicalKeep(provider), false);
  assert.equal(canRememberClinicalKeep(deterministicLocation), false);

  const text = "Detroit Maya Hart Metro Center";
  const preferences = new Map([
    [findingPreferenceKey(text, location), false],
    [findingPreferenceKey(text, provider), false],
    [findingPreferenceKey(text, deterministicLocation), false],
  ]);

  const suggestions = sessionKeepSuggestionIds(
    text,
    [location, provider, deterministicLocation],
    preferences,
  );

  assert.deepEqual(suggestions, new Set(["auto-0001"]));
  assert.equal(areAutomaticFindingsDecided([location], createAutomaticFindingDecisions()), false);
  assert.equal(
    buildReviewedPreview(text, [location], createAutomaticFindingDecisions()).cleanedText,
    "[LOCATION_1] Maya Hart Metro Center",
  );
  assert.equal(applySessionPreferences(text, [location], preferences), 1);
});

test("manual findings are always applied and keep typed placeholders stable across overlaps", () => {
  const text = "Dr. Maya Hart saw Maya Hart";
  const provider = finding("auto-0001", 4, 13, "PROVIDER");
  const overlappingManual = {
    ...finding("manual-0001", 0, 13, "PROVIDER"),
    source: "manual",
  };
  const repeatedManual = {
    ...finding("manual-0002", 18, 27, "PROVIDER"),
    source: "manual",
  };
  const decisions = createAutomaticFindingDecisions();

  recordAutomaticFindingDecision(
    decisions,
    provider,
    AUTOMATIC_REVIEW_DECISIONS.KEEP,
  );
  const preview = buildReviewedPreview(text, [provider, overlappingManual, repeatedManual], decisions);

  assert.equal(preview.cleanedText, "[PROVIDER_1] saw [PROVIDER_2]");
  assert.equal(preview.appliedCount, 2);
});
