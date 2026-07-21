import assert from "node:assert/strict";
import test from "node:test";

import { PATTERNS, detectWithRules } from "../src/rules.js";

function detectedValues(text) {
  const values = new Map();
  for (const detection of detectWithRules(text)) {
    const entries = values.get(detection.entityType) ?? new Set();
    entries.add(text.slice(detection.start, detection.end));
    values.set(detection.entityType, entries);
  }
  return values;
}

test("ports every deterministic desktop recognizer", () => {
  assert.equal(PATTERNS.length, 37);
});

test("detects common synthetic note identifiers", () => {
  const text = `Patient name: Jane Doe
DOB: 03/04/1942
MRN: AB-12345
Phone: (313) 555-0199
Fax: 313-555-0188
Email: jane.doe@example.com
Address: 123 Main Street, Detroit, MI 48201
She is 92 years old.
NPI: 1234567890
History also describes a 93 y/o relative.
`;
  const values = detectedValues(text);

  assert(values.get("PERSON").has("Jane Doe"));
  assert(values.get("DATE").has("03/04/1942"));
  assert(values.get("MEDICAL_RECORD_NUMBER").has("AB-12345"));
  assert(values.get("PHONE_NUMBER").has("(313) 555-0199"));
  assert(values.get("FAX_NUMBER").has("313-555-0188"));
  assert(values.get("EMAIL_ADDRESS").has("jane.doe@example.com"));
  assert([...values.get("ADDRESS")].some((value) => value.startsWith("123 Main Street")));
  assert(values.get("AGE_OVER_89").has("92"));
  assert(values.get("AGE_OVER_89").has("93"));
  assert(values.get("UNIQUE_ID").has("1234567890"));
});

test("does not detect typed placeholders", () => {
  assert.deepEqual(detectWithRules("Seen on [DATE_1] by [PERSON_1]. Call [PHONE_NUMBER_1]."), []);
});

test("detects the reported malformed date, city, name, zip, address, and split city", () => {
  const text =
    "Hospitalized 4....13.26. Lives in Kals-amazoo, Michigan with his mother Ma/rtha. " +
    "A relative is 9\n2 years old. His zip code is 4444....{2]. His pharmacy is at " +
    "-192480{{2234 farmington]]]lane in North//ville";
  const values = detectedValues(text);

  assert(values.get("DATE").has("4....13.26"));
  assert(values.get("LOCATION").has("Kals-amazoo"));
  assert(values.get("PERSON").has("Ma/rtha"));
  assert(values.get("AGE_OVER_89").has("9\n2"));
  assert(values.get("ZIP_CODE").has("4444....{2]"));
  assert(values.get("ADDRESS").has("-192480{{2234 farmington]]]lane"));
  assert(values.get("LOCATION").has("North//ville"));
});

test("detects OCR-corrupted headers and a ZIP immediately after a state", () => {
  const text =
    "PATlENT N4ME: DEV0N OAKLEY      MEDlCAL REC0RD N0: OCR-88I7Z\n" +
    "H0ME: 88 Examp1e Orchard Rd.,To1edo,OH 43604\n" +
    "Hgb10.1|ferritin312|K5.7|PTH690";
  const values = detectedValues(text);

  assert(values.get("PERSON").has("DEV0N OAKLEY"));
  assert(values.get("MEDICAL_RECORD_NUMBER").has("OCR-88I7Z"));
  assert(values.get("ZIP_CODE").has("43604"));
  assert.deepEqual(
    [...values.keys()].sort(),
    ["ADDRESS", "MEDICAL_RECORD_NUMBER", "PERSON", "ZIP_CODE"],
  );
});

test("detects a concatenated camel-case facility without removing the dialysis term", () => {
  const text =
    "Admitted5/28/26anddischarged06-02-2026toresumeHDatCopperMoonDialysis. " +
    "Hemodialysis remains clinically necessary.";
  const values = detectedValues(text);

  assert(values.get("LOCATION").has("CopperMoonDialysis"));
  assert(!values.get("LOCATION").has("Hemodialysis"));
});

test("handles compact chart labels, facility labels, identifiers with is, and sentence punctuation", () => {
  const text =
    "Wife Tessa Rook joined the call. Pt=ROOK,KELLAN|unit=North Star Dialysis Annex|" +
    "Patient says the pharmacy at 404 Placeholder Parkway, Lansing MI, did not receive it. " +
    "The laboratory accession number is LAB-8810-RK. Follow-up at kellan.rook@example.test.";
  const values = detectedValues(text);

  assert(values.get("PERSON").has("Tessa Rook"));
  assert(!values.get("PERSON").has("Tessa Rook joined the"));
  assert(values.get("PERSON").has("ROOK,KELLAN"));
  assert(values.get("LOCATION").has("North Star Dialysis Annex"));
  assert(values.get("ADDRESS").has("404 Placeholder Parkway, Lansing MI"));
  assert(values.get("UNIQUE_ID").has("LAB-8810-RK"));
  assert(values.get("EMAIL_ADDRESS").has("kellan.rook@example.test"));
});

test("allows sentence punctuation after an IP and does not treat platelets as a plate label", () => {
  const text =
    "Workstation IP 192.0.2.44. Portal https://example.test/chart/TEST-1. Platelets 221 K/uL.";
  const values = detectedValues(text);

  assert(values.get("IP_ADDRESS").has("192.0.2.44"));
  assert(values.get("URL").has("https://example.test/chart/TEST-1"));
  assert(!values.has("VEHICLE_ID"));
});

test("stops a tolerant email at sentence punctuation before a Portal label", () => {
  const text = "Email jessa+wren@example.test. Portal https://example.test/chart/TEST-31.";
  const values = detectedValues(text);

  assert(values.get("EMAIL_ADDRESS").has("jessa+wren@example.test"));
  assert(!values.get("EMAIL_ADDRESS").has("jessa+wren@example.test. Portal"));
  assert(values.get("URL").has("https://example.test/chart/TEST-31"));
});

test("detects reported random OCR insertions without fragmenting labeled names", () => {
  const text =
    "Patient Name: Maribel\nQuince\n" +
    "DOB: 02\n/14/1978    MRN: TEST-HD-10482\n" +
    "Address: 104 Fictional Harbor Way, Grand Rapids, MI 4950/3\n" +
    "Attending: Dr. Rowan Vale    NPI: 00000000<>00\n" +
    "Date of service: July 8, 20>26\n" +
    "Labs: hemoglobin 10.4, ferritin 488, potassium 4.9, PTH 438.";
  const values = detectedValues(text);

  assert(values.get("PERSON").has("Maribel\nQuince"));
  assert(values.get("PERSON").has("Dr. Rowan Vale"));
  assert(values.get("DATE").has("02\n/14/1978"));
  assert(values.get("DATE").has("July 8, 20>26"));
  assert(values.get("ZIP_CODE").has("4950/3"));
  assert(values.get("UNIQUE_ID").has("00000000<>00"));
  assert(!values.get("PERSON").has("Labs"));
});

test("detects line-broken and noisy labeled identifiers across general medical notes", () => {
  const text =
    "Caregiver:: Mara Quill\n" +
    "MRN:: GEN]]-00481\nEncounter ID: VISIT-\n99104\n" +
    "Phone: 202-\n555-0101\n" +
    "Facility: Maple\nLantern Hospital\n" +
    "Oncologist: Dr.\nIvo March\n" +
    "Device ID: PM{{-77004\n" +
    "The patient was evaluated after a motor-vehicle collision.";
  const values = detectedValues(text);

  assert(values.get("PERSON").has("Mara Quill"));
  assert(values.get("PERSON").has("Dr.\nIvo March"));
  assert(values.get("MEDICAL_RECORD_NUMBER").has("GEN]]-00481"));
  assert(values.get("UNIQUE_ID").has("VISIT-\n99104"));
  assert(values.get("PHONE_NUMBER").has("202-\n555-0101"));
  assert(values.get("LOCATION").has("Maple\nLantern Hospital"));
  assert(values.get("DEVICE_ID").has("PM{{-77004"));
  assert(!values.has("VEHICLE_ID"));
});

test("handles OCR names and ISO dates without treating clinical values as ages or lines as addresses", () => {
  const text =
    "Patient Name: Miko 1ark\nPsychiatrist: Dr. 0ren Birch\n" +
    "Spouse: Jalen B1rch\nProcedure date: 20>26-05-19\n" +
    "Repeat date: 2026\n-05-20\nAnother date: 2026__05__21\n" +
    "One-hour glucose challenge was 116 mg/dL.\n" +
    "Study date: March 6, 2026\nCT abdomen and pelvis with IV contrast.";
  const values = detectedValues(text);

  assert(values.get("PERSON").has("Miko 1ark"));
  assert(values.get("PERSON").has("Dr. 0ren Birch"));
  assert(values.get("PERSON").has("Jalen B1rch"));
  assert(values.get("DATE").has("20>26-05-19"));
  assert(values.get("DATE").has("2026\n-05-20"));
  assert(values.get("DATE").has("2026__05__21"));
  assert(!values.get("AGE_OVER_89")?.has("116"));
  assert(!values.get("ADDRESS")?.has("2026\nCT"));
});

test("does not absorb structural labels or clinical prose around names and street abbreviations", () => {
  const text =
    "Pat1ent: Hana B1rch  D0B: 02/11/1976\n" +
    "Attending: Dr. Ivo March  NPI: 0000000000\n" +
    "Physician: Dr. Aria Stone\nPresented with substernal chest pain.\n" +
    "Continue cefazolin 2 g IV every 8 hours through the planned stop date.";
  const values = detectedValues(text);

  assert(values.get("PERSON").has("Dr. Ivo March"));
  assert(values.get("PERSON").has("Dr. Aria Stone"));
  assert(
    ![...values.get("PERSON")].some(
      (value) => value.includes("D0B") || value.includes("NPI") || value.includes("Presented"),
    ),
  );
  assert(![...(values.get("ADDRESS") ?? [])].some((value) => value.includes("stop date")));
});

test("detects reported punctuation and line segmentation inside labeled identifiers", () => {
  const text =
    "MRN: TES!\nT-HD-10482\n" +
    "Emergency contact: Tomas Quince, husband, 202-5>55-0105\n" +
    "NPI: 000%00000<>00\nDate of service: July 8, 202>6";
  const values = detectedValues(text);

  assert(values.get("MEDICAL_RECORD_NUMBER").has("TES!\nT-HD-10482"));
  assert(values.get("PHONE_NUMBER").has("202-5>55-0105"));
  assert(values.get("UNIQUE_ID").has("000%00000<>00"));
  assert(values.get("DATE").has("July 8, 202>6"));
});

test("detects a matrix of corrupted four-digit years without consuming clinical values", () => {
  const years = ["20%26", "20\n26", "202&6", "202>6", "20 26", "202\u200b6", "202\u00ad6"];
  const text = `${years.join(" ")} Potassium 4.9 mmol/L; treatment time 210 minutes.`;
  const values = detectedValues(text);

  for (const year of years) assert(values.get("DATE").has(year));
  assert(!values.get("DATE").has("210"));
});

test("detects a punctuation-corrupted facility after a narrative preposition", () => {
  const text = "Seen at Har%bor Test Emergency Center for troponin testing.";
  const values = detectedValues(text);

  assert(values.get("LOCATION").has("Har%bor Test Emergency Center"));
  assert(!values.get("LOCATION").has("troponin"));
});
