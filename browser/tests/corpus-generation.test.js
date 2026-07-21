import assert from "node:assert/strict";
import test from "node:test";

import { PROFILES, generateGeneralMedicalCases } from "./fixtures/corruption-generator.js";

test("generates deterministic broad-specialty corruption cases with annotations", async () => {
  const first = await generateGeneralMedicalCases();
  const second = await generateGeneralMedicalCases();

  assert.deepEqual(first, second);
  assert.equal(first.length, 12 * PROFILES.length);
  assert.equal(new Set(first.map((fixture) => fixture.specialty)).size, 12);
  assert(first.every((fixture) => fixture.must_remove.length > 0));
  assert(first.every((fixture) => fixture.must_preserve.length > 0));
  assert(first.some((fixture) => fixture.text.includes("<>")));
  assert(first.some((fixture) => fixture.text.includes("\n/")));
  assert(first.some((fixture) => fixture.text.includes(":{{")));
  assert(first.some((fixture) => fixture.text.includes("!\n")));
  assert(first.some((fixture) => fixture.text.includes("\u200b")));
  assert(first.some((fixture) => fixture.text.includes("\u00ad")));
  assert(first.some((fixture) => /202-5>55-\d{4}/.test(fixture.text)));
  assert(first.some((fixture) => /(?:19|20)(?:%|\n| |\u200b|\u00ad)\d{2}/.test(fixture.text)));
});
