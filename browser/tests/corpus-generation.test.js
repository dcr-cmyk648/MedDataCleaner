import assert from "node:assert/strict";
import test from "node:test";

import {
  BALANCED_GATE_CASES,
  compileBalancedCase,
} from "./fixtures/balanced-gate-corpus.js";
import { PROFILES, generateGeneralMedicalCases } from "./fixtures/corruption-generator.js";

const EXPECTED_SPECIALTIES = new Set([
  "cardiology",
  "dermatology",
  "emergency medicine",
  "endocrinology",
  "gastroenterology",
  "general medicine",
  "infectious disease",
  "neurology",
  "obstetrics",
  "oncology",
  "ophthalmology",
  "orthopedics",
  "pathology",
  "pediatrics",
  "psychiatry",
  "pulmonology",
  "radiology",
  "rheumatology",
  "surgery",
  "urology",
]);

test("generates deterministic broad-specialty corruption cases with annotations", async () => {
  const first = await generateGeneralMedicalCases();
  const second = await generateGeneralMedicalCases();
  const generatedSpecialties = new Set(first.map((fixture) => fixture.specialty));

  assert.deepEqual(first, second);
  assert.equal(first.length, EXPECTED_SPECIALTIES.size * PROFILES.length);
  assert.deepEqual(generatedSpecialties, EXPECTED_SPECIALTIES);
  for (const specialty of EXPECTED_SPECIALTIES) {
    assert.deepEqual(
      new Set(
        first
          .filter((fixture) => fixture.specialty === specialty)
          .map((fixture) => fixture.profile),
      ),
      new Set(PROFILES),
    );
  }
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

test("balanced gate cases fully partition identifier and retained source spans", () => {
  assert(BALANCED_GATE_CASES.length >= 15);
  for (const fixture of BALANCED_GATE_CASES) {
    const spans = [...fixture.remove_spans, ...fixture.retain_spans].sort(
      (left, right) => left.start - right.start,
    );
    assert.equal(spans[0].start, 0, fixture.id);
    assert.equal(spans.at(-1).end, fixture.text.length, fixture.id);
    for (const [index, span] of spans.entries()) {
      assert.equal(fixture.text.slice(span.start, span.end), span.value, fixture.id);
      if (index > 0) assert.equal(spans[index - 1].end, span.start, fixture.id);
    }
    assert(fixture.remove_spans.every((span) => span.entity_type));
    assert(fixture.retain_spans.every((span) => span.value.length > 0));
  }

  const repeated = compileBalancedCase({
    id: "parser-repeated-values",
    specialty: "test",
    template: "Keep [[PERSON::Same Name]] between [[PERSON::Same Name]] values.",
  });
  assert.deepEqual(
    repeated.remove_spans.map(({ start, end, value }) => ({ start, end, value })),
    [
      { start: 5, end: 14, value: "Same Name" },
      { start: 23, end: 32, value: "Same Name" },
    ],
  );
});
