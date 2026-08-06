import assert from "node:assert/strict";
import test from "node:test";

import { alignNerResults, chunkText, groupNerResults, mapNerResults } from "../src/ner.js";

test("chunks long text with overlap while preserving source offsets", () => {
  const text = `${"word ".repeat(400)}finished`;
  const chunks = chunkText(text, 300, 40);

  assert(chunks.length > 2);
  assert.equal(chunks[0].start, 0);
  assert.equal(chunks.at(-1).end, text.length);
  for (const chunk of chunks) {
    assert.equal(chunk.text, text.slice(chunk.start, chunk.end));
  }
  for (let index = 1; index < chunks.length; index += 1) {
    assert(chunks[index].start < chunks[index - 1].end);
  }
});

test("aligns Transformers.js grouped entities back to original text", () => {
  const text = "Sarah met Sarah in New York.";
  const aligned = alignNerResults(text, [
    { entity_group: "PER", score: 0.99, word: "Sarah" },
    { entity_group: "PER", score: 0.98, word: "Sarah" },
    { entity_group: "LOC", score: 0.97, word: "New York" },
  ]);

  assert.deepEqual(
    aligned.map(({ start, end }) => text.slice(start, end)),
    ["Sarah", "Sarah", "New York"],
  );
});

test("combines adjacent BIO tokens into one source span", () => {
  const text = "Jordan Example arrived from Northville.";
  const aligned = alignNerResults(text, [
    { entity: "B-PER", score: 0.99, word: "Jordan" },
    { entity: "I-PER", score: 0.97, word: "Example" },
    { entity: "B-LOC", score: 0.98, word: "North" },
    { entity: "I-LOC", score: 0.96, word: "##ville" },
  ]);
  const grouped = groupNerResults(text, aligned);

  assert.deepEqual(
    grouped.map(({ entity_group, start, end }) => [entity_group, text.slice(start, end)]),
    [
      ["PER", "Jordan Example"],
      ["LOC", "Northville"],
    ],
  );
});

test("maps names and locations but ignores medication and generic chain contexts", () => {
  const text = "Sarah is on Zyprexa. She goes to Walgreens and lives in Detroit.";
  const results = alignNerResults(text, [
    { entity_group: "PER", score: 0.99, word: "Sarah" },
    { entity_group: "LOC", score: 0.9, word: "Zyprexa" },
    { entity_group: "ORG", score: 0.9, word: "Walgreens" },
    { entity_group: "LOC", score: 0.99, word: "Detroit" },
  ]);
  const detections = mapNerResults(text, 0, results);

  assert.deepEqual(
    detections.map((detection) => [detection.entityType, text.slice(detection.start, detection.end)]),
    [
      ["PERSON", "Sarah"],
      ["LOCATION", "Detroit"],
    ],
  );
});

test("expands and filters subword fragments for medications and generic chains", () => {
  const text = "He is on Zyprexa. He goes to Walgreens.";
  const medicationStart = text.indexOf("Zyprexa");
  const chainStart = text.indexOf("Walgreens");
  const detections = mapNerResults(text, 0, [
    {
      entity: "B-LOC",
      score: 0.9,
      word: "y",
      start: medicationStart + 1,
      end: medicationStart + 2,
    },
    {
      entity: "I-LOC",
      score: 0.9,
      word: "prexa",
      start: medicationStart + 2,
      end: medicationStart + 7,
    },
    {
      entity: "B-ORG",
      score: 0.9,
      word: "Wal",
      start: chainStart,
      end: chainStart + 3,
    },
    {
      entity: "I-ORG",
      score: 0.9,
      word: "greens",
      start: chainStart + 3,
      end: chainStart + 9,
    },
  ]);

  assert.deepEqual(detections, []);
});

test("ignores model labels that are not safe-harbor identifiers", () => {
  const text = "Dialysis remains necessary.";
  const detections = mapNerResults(text, 0, [
    { entity_group: "MISC", score: 0.99, word: "Dialysis", start: 0, end: 8 },
  ]);

  assert.deepEqual(detections, []);
});

test("preserves echocardiogram when the general model calls it a location", () => {
  const text = "Echocardiogram reported EF 48%.";
  const detections = mapNerResults(text, 0, [
    { entity_group: "LOC", score: 0.99, word: "Echocardiogram", start: 0, end: 15 },
  ]);

  assert.deepEqual(detections, []);
});

test("preserves clinical labels and rejects an over-expanded run-on location", () => {
  const clinicalText = "Patient Potassium PTH URR Workstation Kt/V Portal";
  const clinicalResults = ["Patient", "Potassium", "PTH", "URR", "Workstation", "Kt/V", "Portal"].map(
    (word) => ({
      entity_group: "LOC",
      score: 0.99,
      word,
      start: clinicalText.indexOf(word),
      end: clinicalText.indexOf(word) + word.length,
    }),
  );
  assert.deepEqual(mapNerResults(clinicalText, 0, clinicalResults), []);

  const runOn =
    "Admitted5/28/26forvolumeoverloadanddischarged06-02-2026toresumeHDatCopperMoonDialysis";
  assert.deepEqual(
    mapNerResults(runOn, 0, [
      { entity_group: "LOC", score: 0.99, word: runOn, start: 0, end: runOn.length },
    ]),
    [],
  );
});

test("removes a person while preserving an attached clinical header", () => {
  const text = "Priya Norr. MRN PD-2044-QZ";
  const detections = mapNerResults(text, 0, [
    { entity_group: "PER", score: 0.99, word: "Priya Norr. MRN", start: 0, end: 15 },
  ]);

  assert.equal(text.slice(detections[0].start, detections[0].end), "Priya Norr");
});

test("preserves a leading structural header attached to a model span", () => {
  const text = "Portal https://patient.example.test/chart/TEST-31";
  const detections = mapNerResults(text, 0, [
    { entity_group: "LOC", score: 0.99, word: text, start: 0, end: text.length },
  ]);

  assert.equal(
    text.slice(detections[0].start, detections[0].end),
    "https://patient.example.test/chart/TEST-31",
  );
});

test("preserves general-medical section headers when the model calls them locations", () => {
  const headers = [
    "MONTHLY",
    "EMERGENCY",
    "ONCOLOGY",
    "PEDIATRIC",
    "RADIOLOGY",
    "PATHOLOGY",
    "NEUROLOGY",
    "INFECTIOUS",
    "SURGICAL",
    "POSTOPERATIVE",
    "SURGEON",
    "MOOD",
    "MOTHER",
    "EEG",
    "D0B",
    "FACILITY",
    "H0ME",
    "CONTINUE",
  ];
  const text = headers.join(" ");
  const results = headers.map((word) => ({
    entity_group: "LOC",
    score: 0.99,
    word,
    start: text.indexOf(word),
    end: text.indexOf(word) + word.length,
  }));

  assert.deepEqual(mapNerResults(text, 0, results), []);
});

test("preserves multiword general-medical headings", () => {
  const text = "PEDIATRIC CLINIC NOTE";
  const detections = mapNerResults(text, 0, [
    { entity_group: "LOC", score: 0.99, word: "PEDIATRIC CLINIC", start: 0, end: 16 },
  ]);

  assert.deepEqual(detections, []);
});

test("preserves clinical terms that the general model mislabels as people", () => {
  const terms = [
    "Methicillin-sensitive",
    "creatinine",
    "total",
    "triamcinolone",
    "vitamin and",
  ];
  const text = terms.join(" | ");
  const results = terms.map((word) => ({
    entity_group: "PER",
    score: 0.99,
    word,
    start: text.indexOf(word),
    end: text.indexOf(word) + word.length,
  }));

  assert.deepEqual(mapNerResults(text, 0, results), []);
});

test("preserves Crohn only in a clinical disease context", () => {
  const clinicalText = "Ileocolonic Crohn disease is in remission.";
  const clinicalStart = clinicalText.indexOf("Crohn");
  assert.deepEqual(
    mapNerResults(clinicalText, 0, [
      {
        entity_group: "PER",
        score: 0.99,
        word: "Crohn",
        start: clinicalStart,
        end: clinicalStart + "Crohn".length,
      },
    ]),
    [],
  );

  const nameText = "Crohn presented for follow-up.";
  const detections = mapNerResults(nameText, 0, [
    {
      entity_group: "PER",
      score: 0.99,
      word: "Crohn",
      start: 0,
      end: "Crohn".length,
    },
  ]);
  assert.equal(nameText.slice(detections[0].start, detections[0].end), "Crohn");
});

test("preserves Foley only as a catheter term", () => {
  const clinicalText = "Remove Foley catheter after ambulation.";
  const clinicalStart = clinicalText.indexOf("Foley");
  assert.deepEqual(
    mapNerResults(clinicalText, 0, [
      {
        entity_group: "PER",
        score: 0.99,
        word: "Foley",
        start: clinicalStart,
        end: clinicalStart + "Foley".length,
      },
    ]),
    [],
  );

  const nameText = "Foley called about the appointment.";
  const nameDetection = mapNerResults(nameText, 0, [
    {
      entity_group: "PER",
      score: 0.99,
      word: "Foley",
      start: 0,
      end: "Foley".length,
    },
  ]);
  assert.equal(nameText.slice(nameDetection[0].start, nameDetection[0].end), "Foley");
});

test("preserves cross-specialty headers and clinician roles", () => {
  const terms = [
    "DERMATOLOGY",
    "Differential",
    "ENDOCRINOLOGY",
    "Gastroenterologist",
    "OPHTHALMOLOGY",
    "ORTHOPEDIC",
    "PULMONOLOGY",
    "RHEUMATOLOGY",
    "UROLOGY",
  ];
  const text = terms.join(" | ");
  const results = terms.map((word) => ({
    entity_group: "LOC",
    score: 0.99,
    word,
    start: text.indexOf(word),
    end: text.indexOf(word) + word.length,
  }));

  assert.deepEqual(mapNerResults(text, 0, results), []);
});

test("preserves reported medications and lab terms only in clinical contexts", () => {
  const clinicalText =
    "MEDICATION LIST\nTylenol\nFarxiga\nErgocalciferol UT\nTresiba\nImdur\nLokelma\n" +
    "LAB RESULTS\nHemoglobin | TSAT | Albumin | Calcium | Phosphorus\n" +
    "Chloride | Sodium | Potassium | Bicarbonate";
  const terms = [
    "Tylenol",
    "Farxiga",
    "Ergocalciferol",
    "UT",
    "Tresiba",
    "Imdur",
    "Lokelma",
    "Hemoglobin",
    "TSAT",
    "Albumin",
    "Calcium",
    "Phosphorus",
    "Chloride",
    "Sodium",
    "Potassium",
    "Bicarbonate",
  ];
  const results = terms.map((word) => ({
    entity_group: "LOC",
    score: 0.99,
    word,
    start: clinicalText.indexOf(word),
    end: clinicalText.indexOf(word) + word.length,
  }));

  assert.deepEqual(mapNerResults(clinicalText, 0, results), []);

  const geographicText = "The patient lives in Chloride, Arizona.";
  const start = geographicText.indexOf("Chloride");
  const geographic = mapNerResults(geographicText, 0, [
    {
      entity_group: "LOC",
      score: 0.99,
      word: "Chloride",
      start,
      end: start + "Chloride".length,
    },
  ]);
  assert.equal(geographicText.slice(geographic[0].start, geographic[0].end), "Chloride");
});
