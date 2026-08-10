import assert from "node:assert/strict";
import test from "node:test";

import {
  CROSS_SPECIALTY_TEST_PACK_FILE,
  buildCrossSpecialtyTestPack,
  selectCrossSpecialtyTestCases,
} from "../test-pack.js";
import { PROFILES } from "./fixtures/corruption-generator.js";

test("builds a broad paste-ready cross-specialty test pack", async () => {
  const fixtures = await selectCrossSpecialtyTestCases();
  const specialties = new Set(fixtures.map((fixture) => fixture.specialty));
  const profiles = new Set(fixtures.map((fixture) => fixture.profile));
  const pack = await buildCrossSpecialtyTestPack();

  assert.equal(CROSS_SPECIALTY_TEST_PACK_FILE, "test-data/synthetic-cross-specialty-notes.txt");
  assert.equal(fixtures.length, 21);
  assert.equal(specialties.size, 21);
  assert(specialties.has("general medicine"));
  assert(specialties.has("emergency medicine"));
  assert(specialties.has("cardiology"));
  assert(specialties.has("oncology"));
  assert(specialties.has("psychiatry"));
  assert(specialties.has("pediatrics"));
  assert(specialties.has("obstetrics"));
  assert(specialties.has("radiology"));
  assert(specialties.has("pathology"));
  assert(specialties.has("neurology"));
  assert(specialties.has("infectious disease"));
  assert(specialties.has("nephrology / dialysis"));
  for (const profile of PROFILES) assert(profiles.has(profile));

  assert.equal((pack.match(/^CASE MED-/gm) ?? []).length, 21);
  assert.match(pack, /contains no\s+real patient records/i);
  assert.doesNotMatch(pack, /\{\{[^}]+\}\}/);
  for (const fixture of fixtures) assert(pack.includes(fixture.text.trim()));
});
