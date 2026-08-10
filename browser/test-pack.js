import { readFile } from "node:fs/promises";

import {
  PROFILES,
  generateGeneralMedicalCases,
} from "./tests/fixtures/corruption-generator.js";

export const CROSS_SPECIALTY_TEST_PACK_FILE =
  "test-data/synthetic-cross-specialty-notes.txt";

const DIALYSIS_CASE_ID = "peritoneal-dialysis-clinical-values";

function titleCase(value) {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

export async function selectCrossSpecialtyTestCases() {
  const generatedCases = await generateGeneralMedicalCases();
  const specialties = generatedCases
    .filter((fixture) => fixture.profile === "baseline")
    .map((fixture) => fixture.specialty);
  const selected = specialties.map((specialty, index) => {
    const profile = PROFILES[index % PROFILES.length];
    return generatedCases.find(
      (fixture) => fixture.specialty === specialty && fixture.profile === profile,
    );
  });

  const focusedCases = JSON.parse(
    await readFile(
      new URL("./tests/fixtures/adversarial-corpus.json", import.meta.url),
      "utf8",
    ),
  );
  const dialysisCase = focusedCases.find((fixture) => fixture.id === DIALYSIS_CASE_ID);
  if (!dialysisCase || selected.some((fixture) => !fixture)) {
    throw new Error("The synthetic cross-specialty test pack source is incomplete.");
  }

  return [
    ...selected,
    {
      ...dialysisCase,
      specialty: "nephrology / dialysis",
      profile: "focused regression",
    },
  ];
}

export async function buildCrossSpecialtyTestPack() {
  const fixtures = await selectCrossSpecialtyTestCases();
  const separator = "=".repeat(78);
  const header = [
    "MED DATA CLEANER — SYNTHETIC CROSS-SPECIALTY TEST PACK",
    separator,
    "",
    "IMPORTANT: Every name, facility, address, identifier, date, contact detail,",
    "and clinical combination below is invented for testing. This file contains no",
    "real patient records and is not medical advice.",
    "",
    `This pack contains ${fixtures.length} paste-ready cases spanning ${fixtures.length}`,
    "medical specialties. Formatting rotates through clean text, OCR-like corruption,",
    "line-wrap/layout damage, noisy EMR punctuation, and identifier segmentation.",
    "Use one CASE at a time unless deliberately testing a long multi-note paste.",
    "",
  ];
  const cases = fixtures.flatMap((fixture, index) => [
    separator,
    `CASE MED-${String(index + 1).padStart(3, "0")}`,
    `SPECIALTY: ${titleCase(fixture.specialty)}`,
    `FORMAT PROFILE: ${titleCase(fixture.profile)}`,
    separator,
    fixture.text.trim(),
    "",
  ]);

  return `${[...header, ...cases, separator, "END OF PACK", separator].join("\n")}\n`;
}
