import assert from "node:assert/strict";
import test from "node:test";

import {
  applySessionPreferences,
  buildReviewedPreview,
  canRememberClinicalKeep,
  findingPreferenceKey,
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

test("builds an instant reviewed preview without rerunning a detector", () => {
  const text = "Farxiga and Dr. Maya Hart";
  const medication = finding("auto-0001", 0, 7);
  const provider = finding("auto-0002", 16, 25, "PROVIDER");
  const exclusions = new Set(["auto-0001"]);

  const preview = buildReviewedPreview(text, [medication, provider], exclusions);

  assert.equal(preview.cleanedText, "Farxiga and Dr. [PROVIDER_1]");
  assert.equal(preview.appliedCount, 1);
});

test("reuses explicit review choices only for the same in-memory finding signature", () => {
  const text = "Farxiga then Detroit";
  const medication = finding("auto-0001", 0, 7);
  const location = finding("auto-0002", 13, 20);
  const preferences = new Map([[findingPreferenceKey(text, medication), false]]);
  const exclusions = new Set();

  const applied = applySessionPreferences(
    text,
    [medication, location],
    preferences,
    exclusions,
  );

  assert.equal(applied, 1);
  assert.deepEqual(exclusions, new Set(["auto-0001"]));
});

test("remembers only generic-model location keeps, never identifier keeps", () => {
  const location = finding("auto-0001", 0, 7);
  const provider = finding("auto-0002", 8, 17, "PROVIDER");
  const deterministicLocation = {
    ...finding("auto-0003", 18, 25),
    recognizers: ["labeled-facility-name"],
  };

  assert.equal(canRememberClinicalKeep(location), true);
  assert.equal(canRememberClinicalKeep(provider), false);
  assert.equal(canRememberClinicalKeep(deterministicLocation), false);

  const text = "Farxiga Maya Hart Detroit";
  const preferences = new Map([
    [findingPreferenceKey(text, location), false],
    [findingPreferenceKey(text, provider), false],
    [findingPreferenceKey(text, deterministicLocation), false],
  ]);
  const exclusions = new Set();

  assert.equal(
    applySessionPreferences(
      text,
      [location, provider, deterministicLocation],
      preferences,
      exclusions,
    ),
    1,
  );
  assert.deepEqual(exclusions, new Set(["auto-0001"]));
});
