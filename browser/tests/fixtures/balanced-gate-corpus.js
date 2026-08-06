const REMOVAL = /\[\[([A-Z][A-Z0-9_]*)::([\s\S]*?)\]\]/g;

export function compileBalancedCase({ id, specialty, template }) {
  let text = "";
  let cursor = 0;
  const removeSpans = [];
  const retainSpans = [];

  function appendRetained(value) {
    if (!value) return;
    const start = text.length;
    text += value;
    retainSpans.push({ start, end: text.length, value });
  }

  for (const match of template.matchAll(REMOVAL)) {
    appendRetained(template.slice(cursor, match.index));
    const value = match[2];
    const start = text.length;
    text += value;
    removeSpans.push({
      start,
      end: text.length,
      value,
      entity_type: match[1],
    });
    cursor = match.index + match[0].length;
  }
  appendRetained(template.slice(cursor));

  return Object.freeze({
    id: `balanced-${id}`,
    source: "fully-annotated-balanced-gate",
    specialty,
    text,
    remove_spans: Object.freeze(removeSpans),
    retain_spans: Object.freeze(retainSpans),
    must_remove: Object.freeze(removeSpans.map((span) => span.value)),
    must_preserve: Object.freeze(
      retainSpans.map((span) => span.value).filter((value) => value.trim()),
    ),
    placeholder_types: Object.freeze([
      ...new Set(removeSpans.map((span) => span.entity_type)),
    ]),
  });
}

const LONG_CLINICAL_FILLER =
  "The patient reports stable appetite, unchanged dialysis tolerance, no chest pain, no " +
  "dyspnea, and no access bleeding. Hemoglobin is 10.4 g/dL, potassium is 4.9 mmol/L, " +
  "phosphorus is 5.6 mg/dL, albumin is 3.8 g/dL, and delivered Kt/V is 1.47. ".repeat(6);

const CASES = [
  {
    id: "safe-harbor-direct-identifiers",
    specialty: "general medicine",
    template:
      "PATIENT DEMOGRAPHICS\n" +
      "Patient legal name: [[PERSON::Maribel Quince]]\n" +
      "Initials: [[PERSON::M.Q.]]  Alias: [[PERSON::Bree Quince]]\n" +
      "DOB: [[DATE::02/14/1978]]  Age: [[AGE_OVER_89::94]] years old\n" +
      "Home: [[ADDRESS::104 Fictional Harbor Way]], [[LOCATION::Grand Rapids]], MI " +
      "[[ZIP_CODE::49503]]\n" +
      "Telephone: [[PHONE_NUMBER::202-555-0104]]  Fax: [[FAX_NUMBER::202-555-0106]]\n" +
      "Email: [[EMAIL_ADDRESS::maribel.quince@example.test]]\n" +
      "SSN: [[US_SSN::123-45-6789]]  MRN: [[MEDICAL_RECORD_NUMBER::TEST-HD-10482]]\n" +
      "Member ID: [[HEALTH_PLAN_ID::PLAN-ZZ-9001]]  Account: " +
      "[[ACCOUNT_NUMBER::ACCT-441199]]\n" +
      "Driver license: [[LICENSE_NUMBER::MI-Q-20481]]  Plate: " +
      "[[VEHICLE_ID::TEST-771]]\n" +
      "Pacemaker serial: [[DEVICE_ID::DVC-TEST-8802]]\n" +
      "Portal: [[URL::https://patient.example.test/chart/TEST-31]]\n" +
      "Workstation IPv4: [[IP_ADDRESS::192.0.2.44]]  IPv6: " +
      "[[IP_ADDRESS::2001:db8:85a3::8a2e:370:7334]]\n" +
      "Voiceprint ID: [[BIOMETRIC_ID::VOICE-8821-Z]]  Study subject ID: " +
      "[[UNIQUE_ID::SUBJ-26-88104]]\n" +
      "Employer: [[EMPLOYER::Copper Kite Manufacturing LLC]]\n" +
      "Clinical summary: heart failure with EF 35%; continue carvedilol 25 mg twice daily.",
  },
  {
    id: "corrupted-direct-identifiers",
    specialty: "dialysis",
    template:
      "SCANNED NOTE / OCR CONFIDENCE LOW\n" +
      "PATlENT N4ME: [[PERSON::DEV0N OAKLEY]]  MEDlCAL REC0RD N0: " +
      "[[MEDICAL_RECORD_NUMBER::OCR-88I7Z]]\n" +
      "D0B=[[DATE::0 2/14/19>78]]  SSN=[[US_SSN::123-4>5-6789]]\n" +
      "TEL [[PHONE_NUMBER::202-5>55-0104]]  FAX [[FAX_NUMBER::202.555.0106]]\n" +
      "EMAIL [[EMAIL_ADDRESS::devon.oakley @ example.test]]\n" +
      "MEMBER ID [[HEALTH_PLAN_ID::PL!\nAN-ZZ-9001]]  STUDY ID " +
      "[[UNIQUE_ID::SUB!\nJ-26-88104]]\n" +
      "H0ME: [[ADDRESS::88 Examp1e Orchard Rd]]., [[LOCATION::To1edo]], OH " +
      "[[ZIP_CODE::4360/4]]\n" +
      "Labs: Hgb 10.1 g/dL | TSAT 19% | ferritin 312 | K 5.7 | PTH 690.",
  },
  {
    id: "lowercase-household-and-employer-names",
    specialty: "primary care",
    template:
      "patient name: [[PERSON::maribel quince]]\n" +
      "nickname: [[PERSON::bree]]\n" +
      "mother [[PERSON::ma/rtha quill]] and roommate [[PERSON::jade moss]] joined.\n" +
      "employer: [[EMPLOYER::north wind fabrication]]\n" +
      "She takes lisinopril 10 mg daily and reports no medication adverse effects.",
  },
  {
    id: "date-versus-fraction-and-score",
    specialty: "oncology",
    template:
      "Date of service: [[DATE::08/06/2026]]. Year-only cohort: 2026.\n" +
      "Two of twelve cores were positive (2/12); pain score 2/10; Gleason 3+4=7; " +
      "three of twelve nodes involved (3/12); FEV1/FVC 0.56; Kt/V 1.47.\n" +
      "Recheck in 2 weeks and again next month. Biopsy planned for [[DATE::September 4, 2026]].",
  },
  {
    id: "allowed-state-and-age-boundaries",
    specialty: "nephrology",
    template:
      "The 89-year-old patient lives in [[LOCATION::Kalamazoo]], Michigan and previously " +
      "lived in [[LOCATION::Toledo]], Ohio. County: [[LOCATION::Washtenaw]]. Precinct: " +
      "[[LOCATION::Burns Township Precinct 4]]. State for stratification: Michigan. " +
      "The patient turns [[AGE_OVER_89::90]] after [[DATE::November 3, 2026]].",
  },
  {
    id: "clinical-eponyms-and-device-terms",
    specialty: "cross-specialty",
    template:
      "Patient: [[PERSON::Aster Voss]]. Diagnoses include Parkinson disease, Hodgkin " +
      "lymphoma, Crohn disease, Graves disease, Hashimoto thyroiditis, Wilson disease, " +
      "and Bell palsy. Devices and procedures include a Foley catheter, Hickman line, " +
      "Broviac catheter, Swan-Ganz catheter, Jackson-Pratt drain, Whipple procedure, and " +
      "Broca aphasia testing. Mayo score is 2. No device serial number was documented.",
  },
  {
    id: "medications-labs-and-national-chains",
    specialty: "endocrinology",
    template:
      "Patient: [[PERSON::Liora Finch]].\nMEDICATION LIST\n" +
      "Tylenol 650 mg as needed\nFarxiga 10 mg daily\nTresiba 18 units nightly\n" +
      "Imdur 30 mg daily\nLokelma 10 g on nondialysis days\nZyprexa 5 mg nightly\n" +
      "Depakote 500 mg twice daily\nsodium zirconium cyclosilicate 10 g daily\n" +
      "metoprolol succinate 50 mg daily\ninsulin glargine 18 units nightly\n" +
      "She fills prescriptions at Walgreens and buys groceries at Meijer.\nLAB RESULTS\n" +
      "Hemoglobin 10.2 | Chloride 101 | Sodium 137 | Potassium 4.8 | Bicarbonate 23.",
  },
  {
    id: "clinical-number-table-negative-control",
    specialty: "dialysis",
    template:
      "HEMODIALYSIS FLOWSHEET\nBFR 400 mL/min | DFR 700 mL/min | UF 2.7 L\n" +
      "preBP 166/91 | postBP 136/76 | weight 94.1 kg | EDW 94.3 kg\n" +
      "Hgb 10.2 | TSAT 22% | ferritin 390 | K 5.0 | CO2 22 | Ca 9.2\n" +
      "Phos 6.3 | PTH 580 | albumin 3.6 | platelets 221 K/uL\n" +
      "Pathology: 2/12 cores positive; stage pT2N0; ICD-10 N18.6; CPT 90960.",
  },
  {
    id: "provider-referral-boundaries",
    specialty: "vascular surgery",
    template:
      "Patient: [[PERSON::Jessa Wren]]. Refer to Dr. [[PROVIDER::Maya Hart]] for " +
      "fistulogram on [[DATE::08/20/2026]]. Referral purpose: evaluate prolonged " +
      "post-dialysis bleeding. Preserve cohort year 2026 and procedure context. " +
      "Attending: [[PROVIDER::Rowan Vale]], MD.",
  },
  {
    id: "facility-versus-clinical-organization",
    specialty: "dialysis",
    template:
      "Patient: [[PERSON::Niko Vale]]. Facility: [[LOCATION::Blue Heron Dialysis Pavilion]]. " +
      "Transfer from [[LOCATION::Copper Moon Hospital]] to [[LOCATION::North Star Dialysis]]. " +
      "The patient shops at Costco, fills at CVS, and uses a St. Jude mechanical valve. " +
      "Continue hemodialysis for 210 minutes.",
  },
  {
    id: "run-on-and-adjacent-boundaries",
    specialty: "hospital medicine",
    template:
      "Admitted[[DATE::5/28/26]]forvolumeoverloadanddischarged[[DATE::06-02-2026]]" +
      "toresumeHDat[[LOCATION::CopperMoonDialysis]]. AttendingDr." +
      "[[PROVIDER::MayaHart]]documentedEF48%andweight69.8kg. Clinical prose around every " +
      "placeholder must remain byte-for-byte intact.",
  },
  {
    id: "expanded-unique-code-labels",
    specialty: "research and transfusion",
    template:
      "Patient: [[PERSON::Oona Birch]]. Research participant ID: " +
      "[[UNIQUE_ID::PART-8810-RK]]. Study ID: [[UNIQUE_ID::STUDY-26-441]]. Trial record: " +
      "[[UNIQUE_ID::TRIAL-90018]]. Registry number: [[UNIQUE_ID::REG-7710]]. " +
      "Authorization code: [[UNIQUE_ID::AUTH-ZZ-1820]]. Blood product unit ID: " +
      "[[DEVICE_ID::W3826-26-001122]]. Diagnosis code N18.6 and CPT 90960 must remain.",
  },
  {
    id: "clinical-name-homographs",
    specialty: "general medicine",
    template:
      "Patient: [[PERSON::Rose Brown]]. Brown sputum resolved, oxygen saturation rose to " +
      "96%, and Will continue therapy. May continue acetaminophen. The patient drinks " +
      "Dr. Pepper occasionally. Black tarry stool, White blood cell count, and Green " +
      "drainage are clinical descriptions, not names.",
  },
  {
    id: "chunk-boundary-identifiers",
    specialty: "long nephrology note",
    template:
      `${LONG_CLINICAL_FILLER}Patient Name: [[PERSON::Zara Mendel]]  MRN: ` +
      "[[MEDICAL_RECORD_NUMBER::LONG-88104-Z]]. " +
      `${LONG_CLINICAL_FILLER}Callback [[PHONE_NUMBER::202-555-0199]].`,
  },
  {
    id: "repeated-identity-consistency",
    specialty: "care coordination",
    template:
      "Patient [[PERSON::Rowan Pike]] arrived with spouse [[PERSON::Talia Pike]]. " +
      "[[PERSON::Talia Pike]] confirmed that [[PERSON::Rowan Pike]] takes carvedilol " +
      "12.5 mg twice daily. The same source identity should receive the same typed token.",
  },
];

export const BALANCED_GATE_CASES = Object.freeze(CASES.map(compileBalancedCase));
