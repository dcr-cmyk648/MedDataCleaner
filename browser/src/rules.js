const MONTH =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|" +
  "Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
const NAME_TOKEN = "(?:[A-Z014][A-Za-z014'’/\\-<>%&!\\u00AD\\u200B]+|[A-Z]\\.)";
const NAME_SEPARATOR = "[ \\t]{1,3}(?![ \\t])";
const PATIENT_LABEL = "[Pp][Aa][Tt][iIl1][Ee][Nn][Tt]";
const NAME_LABEL = "[Nn][Aa4][Mm][Ee]";
const RELATIONSHIP_LABEL =
  "(?:[Mm]other|[Ff]ather|[Ss]ister|[Bb]rother|[Ww]ife|[Hh]usband|[Ss]pouse|" +
  "[Ss]on|[Dd]aughter|[Gg]uardian|[Cc]aregiver)";
const POSSESSIVE_LABEL = "(?:[Hh]is|[Hh]er|[Tt]heir)";
const CLINICIAN_LABEL =
  "(?:[Pp]rovider|[Pp]hysician|[Dd]octor|[Aa]ttending|[Rr]eferring[ \\t]+[Pp]rovider|" +
  "[Ss]urgeon|[Oo]ncologist|[Pp]sychiatrist|[Pp]ediatrician|[Oo]bstetrician|" +
  "[Rr]adiologist|[Pp]athologist|[Nn]eurologist|[Nn]ephrologist|[Cc]onsultant|" +
  "[Ee]ndocrinologist|[Pp]ulmonologist|[Gg]astroenterologist|[Rr]heumatologist|" +
  "[Dd]ermatologist|[Oo]phthalmologist|[Oo]rthopedic[ \\t]+[Ss]urgeon|" +
  "[Oo]rthopedist|[Uu]rologist)";
const NAME_HEADER =
  "(?:DOB|D0B|MRN|NPI|Address|H0ME|Phone|Fax|Email|Facility|Attending|Date|Encounter|Patient|" +
  "Pat1ent|PATlENT|Name|N4ME|" +
  "Provider|Physician|Doctor|Emergency|Member|Account|Visit|Claim|Order|Specimen|Device|" +
  "Caregiver|Guardian|Partner|Surgeon|Oncologist|Psychiatrist|Pediatrician|Obstetrician|" +
  "Radiologist|Pathologist|Neurologist|Nephrologist|Consultant|Endocrinologist|Pulmonologist|" +
  "Gastroenterologist|Rheumatologist|Dermatologist|Ophthalmologist|Orthopedic|Orthopedist|" +
  "Urologist|" +
  "Labs?|Medications?|Assessment|Plan|" +
  "History|Diagnosis|Mother|Father|Spouse|Callback|Home|Study|Procedure|Collection|" +
  "Treatment|Presented|Refer|Referred|Referral)";
const LABELED_NAME_SEPARATOR = `[ \\t]{1,3}(?![ \\t])(?!${NAME_HEADER}\\b)`;
const LABELED_CORE_NAME_VALUE =
  `(?:${NAME_TOKEN},[ \\t]{0,3}${NAME_TOKEN}` +
  `(?:${LABELED_NAME_SEPARATOR}${NAME_TOKEN})?|` +
  `${NAME_TOKEN}(?:${LABELED_NAME_SEPARATOR}${NAME_TOKEN}){0,3})`;
const CLINICIAN_PREFIX = "(?:(?:Dr|Doctor|Provider|Physician)\\.?[ \\t\\r\\n]+)?";
const LABELED_NAME_BODY =
  `${LABELED_CORE_NAME_VALUE}` +
  `(?:[ \\t]*\\r?\\n[ \\t]*(?!${NAME_HEADER}\\b)${LABELED_CORE_NAME_VALUE}` +
  `(?![ \\t]+[a-z]))?`;
const LABELED_NAME_VALUE = `${CLINICIAN_PREFIX}${LABELED_NAME_BODY}`;
const FACILITY_TOKEN = "[A-Z][A-Za-z0-9'’/\\-<>%&!\\u00AD\\u200B]*";
const FACILITY_VALUE = `${FACILITY_TOKEN}(?:${NAME_SEPARATOR}${FACILITY_TOKEN}){0,7}`;
const FACILITY_DESIGNATOR =
  "(?:Dialysis|Clinic|Center|Hospital|Pavilion|Medical|Imaging|Unit|Annex)";
const CONTEXTUAL_FACILITY_VALUE =
  `(?:${FACILITY_TOKEN}${NAME_SEPARATOR}){1,7}${FACILITY_DESIGNATOR}`;
const LABELED_FACILITY_VALUE =
  `${FACILITY_VALUE}` +
  `(?:[ \\t]*\\r?\\n[ \\t]*(?!${NAME_HEADER}\\b)${FACILITY_VALUE})?`;
const ID_VALUE =
  "[A-Z0-9](?:(?:[._/\\-<>%&!|?@~^+]\\r?\\n(?=[A-Z0-9]))|" +
  "[A-Z0-9._/\\-{}\\[\\]<>%&!|?@~^+\\u00AD\\u200B]){2,}[A-Z0-9]";
const REQUIRED_LABEL_DELIMITER = "[ \\t]*(?:[:#=\\-{}\\[\\].<>]{1,8})[ \\t]*";
const OPTIONAL_LABEL_DELIMITER = "[ \\t]*(?:[:#=\\-{}\\[\\].<>]{1,8}[ \\t]*)?";
const PHONE_SEPARATOR = "[ \\t\\r\\n./\\-]{1,5}";
const STANDARD_PHONE_VALUE =
  `(?:\\+?1[ .\\-]?)?(?:\\(\\d{3}\\)|\\d{3})${PHONE_SEPARATOR}` +
  `\\d{3}${PHONE_SEPARATOR}\\d{4}` +
  "(?:\\s*(?:x|ext\\.?)[ ]?\\d{1,6})?";
const OCR_PHONE_GAP = "[ \\t\\r\\n./_{}\\[\\]()<>%&!|?@~^+\\-\\u00AD\\u200B]";
const OCR_PHONE_INTRA_GAP = `${OCR_PHONE_GAP}{0,3}`;
const OCR_PHONE_GROUP_GAP = `${OCR_PHONE_GAP}{1,5}`;
const OCR_PHONE_VALUE =
  `(?:\\+?1${OCR_PHONE_GROUP_GAP})?` +
  `\\d${OCR_PHONE_INTRA_GAP}\\d${OCR_PHONE_INTRA_GAP}\\d${OCR_PHONE_GROUP_GAP}` +
  `\\d${OCR_PHONE_INTRA_GAP}\\d${OCR_PHONE_INTRA_GAP}\\d${OCR_PHONE_GROUP_GAP}` +
  `\\d${OCR_PHONE_INTRA_GAP}\\d${OCR_PHONE_INTRA_GAP}\\d${OCR_PHONE_INTRA_GAP}\\d` +
  "(?:\\s*(?:x|ext\\.?)[ ]?\\d{1,6})?";
const PHONE_VALUE = `(?:${STANDARD_PHONE_VALUE}|${OCR_PHONE_VALUE})`;
const EMAIL_GAP = "[ \\t\\r\\n\\u00AD\\u200B]{0,3}";
const EMAIL_DOT_GAP = "[\\r\\n\\u00AD\\u200B]{0,3}";
const US_STATE =
  "Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|" +
  "Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|" +
  "Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|" +
  "New[ \\t]+Hampshire|New[ \\t]+Jersey|New[ \\t]+Mexico|New[ \\t]+York|" +
  "North[ \\t]+Carolina|North[ \\t]+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|" +
  "Rhode[ \\t]+Island|South[ \\t]+Carolina|South[ \\t]+Dakota|Tennessee|Texas|Utah|" +
  "Vermont|Virginia|Washington|West[ \\t]+Virginia|Wisconsin|Wyoming|" +
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|" +
  "MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY";
const LOCATION_TOKEN = "[A-Za-z][A-Za-z'’./\\-]*";
const OCR_NOISE = "[ \\t\\r\\n./_{}\\[\\]()<>%&!|?@~^+\\-\\u00AD\\u200B]";
const OCR_STRONG_YEAR_BREAK = "[ \\t\\r\\n<>%&!|?@~^+\\u00AD\\u200B]";
const OCR_DIGIT_GAP = `${OCR_NOISE}{0,4}`;
const OCR_STRONG_GAP = `${OCR_NOISE}{0,3}${OCR_STRONG_YEAR_BREAK}${OCR_NOISE}{0,3}`;
const OCR_YEAR4 =
  `(?:1${OCR_DIGIT_GAP}9${OCR_DIGIT_GAP}\\d${OCR_DIGIT_GAP}\\d|` +
  `2${OCR_DIGIT_GAP}0${OCR_DIGIT_GAP}\\d${OCR_DIGIT_GAP}\\d)`;
const OCR_CORRUPTED_YEAR4 =
  `(?:1${OCR_STRONG_GAP}9${OCR_DIGIT_GAP}\\d${OCR_DIGIT_GAP}\\d|` +
  `1${OCR_DIGIT_GAP}9${OCR_STRONG_GAP}\\d${OCR_DIGIT_GAP}\\d|` +
  `1${OCR_DIGIT_GAP}9${OCR_DIGIT_GAP}\\d${OCR_STRONG_GAP}\\d|` +
  `2${OCR_STRONG_GAP}0${OCR_DIGIT_GAP}\\d${OCR_DIGIT_GAP}\\d|` +
  `2${OCR_DIGIT_GAP}0${OCR_STRONG_GAP}\\d${OCR_DIGIT_GAP}\\d|` +
  `2${OCR_DIGIT_GAP}0${OCR_DIGIT_GAP}\\d${OCR_STRONG_GAP}\\d)`;
const OCR_YEAR = `(?:${OCR_YEAR4}|\\d{2})`;
const OCR_ZIP5 = `(?:\\d${OCR_DIGIT_GAP}){4}\\d`;
const OCR_NPI = `(?:\\d${OCR_DIGIT_GAP}){9}\\d`;
function pattern(name, entityType, source, score, flags = "gim") {
  return Object.freeze({ name, entityType, regex: new RegExp(source, flags), score });
}

export const PATTERNS = Object.freeze([
  pattern(
    "labeled-name",
    "PERSON",
    `\\b(?:${PATIENT_LABEL}(?:[ \\t]+${NAME_LABEL})?|[Pp][Tt]|${NAME_LABEL}|` +
      `[Mm]other|[Ff]ather|[Ss]pouse|[Ee]mergency[ \\t]+[Cc]ontact|[Cc]aregiver|` +
      `[Gg]uardian|[Pp]artner)` +
      `${REQUIRED_LABEL_DELIMITER}(?<value>${LABELED_NAME_VALUE})`,
    0.96,
    "gm",
  ),
  pattern(
    "labeled-provider-name",
    "PROVIDER",
    `\\b${CLINICIAN_LABEL}${REQUIRED_LABEL_DELIMITER}(?<value>${LABELED_NAME_VALUE})`,
    0.97,
    "gm",
  ),
  pattern(
    "titled-clinician-name",
    "PROVIDER",
    `\\b(?:Dr|Doctor|Provider|Physician)\\.?[ \\t\\r\\n]+` +
      `(?<value>${LABELED_CORE_NAME_VALUE})`,
    0.91,
    "gm",
  ),
  pattern(
    "referral-provider-name",
    "PROVIDER",
    `\\b(?:[Rr]efer(?:red)?[ \\t]+(?:to|with)|[Rr]eferral[ \\t]+to|` +
      `[Cc]onsult(?:ed)?[ \\t]+(?:with|by))` +
      `[ \\t]+(?<value>${LABELED_NAME_VALUE})`,
    0.94,
    "gm",
  ),
  pattern(
    "relationship-name",
    "PERSON",
    `\\b(?:${POSSESSIVE_LABEL}[ \\t]+)?${RELATIONSHIP_LABEL}[ \\t]+` +
      `(?<value>${LABELED_CORE_NAME_VALUE})`,
    0.95,
    "gm",
  ),
  pattern(
    "concatenated-facility-name",
    "LOCATION",
    "(?:[Aa]t|[Tt]o|[Ff]rom)(?<value>(?:[A-Z][a-z0-9'’\\-]{1,24}){2,}" +
      "(?:Dialysis|Clinic|Center|Hospital|Pavilion|Unit|Annex))\\b",
    0.95,
    "gm",
  ),
  pattern(
    "contextual-facility-name",
    "LOCATION",
    `\\b(?:at|from|to)[ \\t]+(?<value>${CONTEXTUAL_FACILITY_VALUE})\\b`,
    0.95,
    "gm",
  ),
  pattern(
    "labeled-facility-name",
    "LOCATION",
    `\\b(?:[Uu][Nn][Ii][Tt]|[Ff]acility|[Dd]ialysis[ \\t]+(?:[Uu]nit|[Cc]enter|[Ff]acility))` +
      `${REQUIRED_LABEL_DELIMITER}(?<value>${LABELED_FACILITY_VALUE})`,
    0.96,
    "gm",
  ),
  pattern(
    "email-address",
    "EMAIL_ADDRESS",
    `(?<value>(?<![\\w.+\\-])[A-Z0-9._%+\\-\\u00AD\\u200B]+${EMAIL_GAP}@${EMAIL_GAP}` +
      `(?:[A-Z0-9\\-\\u00AD\\u200B]+${EMAIL_DOT_GAP}\\.${EMAIL_DOT_GAP})+` +
      `[A-Z\\u00AD\\u200B]{2,63}(?![\\w\\-]))`,
    0.99,
  ),
  pattern(
    "web-url",
    "URL",
    String.raw`(?<value>\b(?:https?://|www\.)[^\s<>{}\[\]()]+(?<![.,;:!?]))`,
    0.98,
  ),
  pattern(
    "ipv4-address",
    "IP_ADDRESS",
    "(?<value>(?<![\\d.])(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)){3}(?!\\d|\\.\\d))",
    0.99,
  ),
  pattern(
    "social-security-number",
    "US_SSN",
    "(?<value>(?<!\\d)\\d{3}[ \\-]?\\d{2}[ \\-]?\\d{4}(?!\\d))",
    0.99,
  ),
  pattern(
    "fax-number",
    "FAX_NUMBER",
    `\\b(?:fax|facsimile)\\s*[:=\\-]?\\s*(?<value>${PHONE_VALUE})`,
    0.99,
  ),
  pattern("phone-number", "PHONE_NUMBER", `(?<value>(?<!\\d)${PHONE_VALUE}(?!\\d))`, 0.96),
  pattern(
    "iso-date",
    "DATE",
    `(?<value>(?<!\\d)${OCR_YEAR4}${OCR_NOISE}{1,8}` +
      `(?:0?[1-9]|1[0-2])${OCR_NOISE}{1,8}(?:0?[1-9]|[12]\\d|3[01])(?!\\d))`,
    0.97,
  ),
  pattern(
    "numeric-date",
    "DATE",
    String.raw`(?<value>(?<!\d)(?:0?[1-9]|1[0-2])[/\.\-](?:0?[1-9]|[12]\d|3[01])[/\.\-](?:(?:19|20)?\d{2})(?!\d))`,
    0.96,
  ),
  pattern(
    "punctuation-corrupted-date",
    "DATE",
    `(?<value>(?<!\\d)(?:0?[1-9]|1[0-2])${OCR_NOISE}{1,8}` +
      `(?:0?[1-9]|[12]\\d|3[01])${OCR_NOISE}{1,8}${OCR_YEAR}(?!\\d))`,
    0.95,
  ),
  pattern(
    "month-name-date-with-year",
    "DATE",
    `(?<value>\\b(?:${MONTH})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?` +
      `(?:,\\s*|\\s+)${OCR_YEAR4}\\b)`,
    0.97,
  ),
  pattern(
    "corrupted-year",
    "DATE",
    `(?<value>(?<!\\d)${OCR_CORRUPTED_YEAR4}(?!\\d))`,
    0.94,
  ),
  pattern(
    "month-name-date",
    "DATE",
    `(?<value>\\b(?:${MONTH})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b)`,
    0.9,
  ),
  pattern(
    "age-over-89",
    "AGE_OVER_89",
    "\\bage(?:d)?\\s*[:=]?\\s*(?<value>(?:9\\d|1[01]\\d|120))\\s*(?:years?|yrs?|y/?o)?\\b",
    0.98,
  ),
  pattern(
    "hyphenated-age-over-89",
    "AGE_OVER_89",
    "\\b(?<value>(?:9\\d|1[01]\\d|120))(?=\\s*[- ]?years?[- ]old\\b)",
    0.98,
  ),
  pattern(
    "standalone-age-over-89",
    "AGE_OVER_89",
    "\\b(?<value>(?:9\\d|1[01]\\d|120))(?=\\s*(?:years?|yrs?|y/?o)\\b)",
    0.97,
  ),
  pattern(
    "line-broken-age-over-89",
    "AGE_OVER_89",
    "\\b(?<value>(?:9[ \\t\\r\\n]+\\d|1[ \\t\\r\\n]+[01][ \\t\\r\\n]*\\d|1[ \\t\\r\\n]+2[ \\t\\r\\n]*0))(?=\\s*(?:years?|yrs?|y/?o)\\b)",
    0.98,
  ),
  pattern(
    "medical-record-number",
    "MEDICAL_RECORD_NUMBER",
    `\\b(?:MRN|med[iIl1]cal\\s+rec[oO0]rd(?:\\s+(?:number|n[oO0]\\.?))?|` +
      `chart(?:\\s+(?:number|no\\.?))?|` +
      `patient\\s+id(?:entifier)?)${OPTIONAL_LABEL_DELIMITER}(?<value>${ID_VALUE})\\b`,
    0.99,
  ),
  pattern(
    "health-plan-identifier",
    "HEALTH_PLAN_ID",
    `\\b(?:member|subscriber|beneficiary|health\\s+plan|insurance)(?:\\s+(?:id|identifier|number|no\\.?))` +
      `${OPTIONAL_LABEL_DELIMITER}(?<value>${ID_VALUE})\\b`,
    0.98,
  ),
  pattern(
    "account-number",
    "ACCOUNT_NUMBER",
    `\\b(?:account|acct|billing)(?:\\s+(?:id|number|no\\.?))?${REQUIRED_LABEL_DELIMITER}` +
      `(?<value>${ID_VALUE})\\b`,
    0.97,
  ),
  pattern(
    "license-or-certificate-number",
    "LICENSE_NUMBER",
    `\\b(?:medical\\s+license|license|certificate|DEA)(?:\\s+(?:id|number|no\\.?))?` +
      `${REQUIRED_LABEL_DELIMITER}(?<value>${ID_VALUE})\\b`,
    0.97,
  ),
  pattern(
    "provider-identifier",
    "UNIQUE_ID",
    `\\bNPI${OPTIONAL_LABEL_DELIMITER}(?<value>${OCR_NPI})(?!\\d)`,
    0.99,
  ),
  pattern(
    "device-serial-number",
    "DEVICE_ID",
    `\\b(?:device|implant|pacemaker|pump|serial)(?:\\s+(?:id|identifier|serial|number|no\\.?))?` +
      `${REQUIRED_LABEL_DELIMITER}(?<value>${ID_VALUE})\\b`,
    0.96,
  ),
  pattern(
    "vehicle-identifier",
    "VEHICLE_ID",
    `\\b(?:VIN(?:\\s+(?:id|identifier|number|no\\.?))?|` +
      `(?:license\\s+plate|plate)(?:\\s+(?:id|identifier|number|no\\.?))?|` +
      `vehicle\\s+(?:id|identifier|number|no\\.?))` +
      `\\b${OPTIONAL_LABEL_DELIMITER}(?<value>${ID_VALUE})\\b`,
    0.97,
  ),
  pattern(
    "other-contextual-identifier",
    "UNIQUE_ID",
    `\\b(?:claim|case|encounter|visit|accession|order|specimen)(?:\\s+(?:id|identifier|number|no\\.?))` +
      `\\s*(?:is\\s+)?${OPTIONAL_LABEL_DELIMITER}(?<value>${ID_VALUE})\\b`,
    0.94,
  ),
  pattern(
    "postal-code",
    "ZIP_CODE",
    "\\b(?:ZIP(?:\\s+code)?|postal\\s+code)\\s*(?:is\\s+)?[:=\\-]?\\s*(?<value>\\d{5}(?:-\\d{4})?)\\b",
    0.98,
  ),
  pattern(
    "corrupted-postal-code",
    "ZIP_CODE",
    "\\b(?:ZIP(?:\\s+code)?|postal\\s+code)\\s*(?:is\\s+)?[:=\\-]?\\s*(?<value>(?:\\d[ \\t./_{}\\[\\]()<>\\-]*){4}\\d[}\\])]?)(?!\\d)",
    0.99,
  ),
  pattern(
    "postal-code-after-state",
    "ZIP_CODE",
    `,[ \\t]*(?:${US_STATE})[ \\t]+(?<value>${OCR_ZIP5}` +
      `(?:[ \\t]*-[ \\t]*\\d{4})?)(?!\\d)`,
    0.98,
  ),
  pattern(
    "residence-city-before-state",
    "LOCATION",
    `\\b(?:lives?|resides?)[ \\t]+(?:at|in)[ \\t]+(?<value>${LOCATION_TOKEN}` +
      `(?:[ \\t]+${LOCATION_TOKEN}){0,4})(?=[ \\t]*,[ \\t]*(?:${US_STATE})\\b)`,
    0.96,
  ),
  pattern(
    "separator-corrupted-location",
    "LOCATION",
    "\\b(?:in|from|near|at)[ \\t]+(?<value>[A-Z][A-Za-z'’\\-]*(?:[/\\\\]{2,}[A-Za-z'’\\-]+)+)\\b",
    0.94,
  ),
  pattern(
    "corrupted-street-address",
    "ADDRESS",
    "(?<value>(?<!\\w)[#\\-]?\\d[\\d{}\\[\\]()./\\\\_\\-]{0,30}[ \\t]+" +
      "(?:[A-Za-z][A-Za-z'’.\\-]*[ \\t]+){0,6}[A-Za-z][A-Za-z'’.\\-]*[\\]})[({./\\\\_\\-]{1,8}" +
      "(?:Street|St\\.?|Avenue|Ave\\.?|Road|Rd\\.?|Boulevard|Blvd\\.?|Drive|Dr\\.?|Lane|Ln\\.?|" +
      "Court|Ct\\.?|Parkway|Pkwy\\.?|Highway|Hwy\\.?|Way)\\b)",
    0.97,
  ),
  pattern(
    "street-address",
    "ADDRESS",
    "(?<value>\\b\\d{1,6}[ \\t]+(?:[A-Z0-9][A-Za-z0-9_.'’\\-]*[ \\t]+){0,7}" +
      "(?:Street|St\\.?|Avenue|Ave\\.?|Road|Rd\\.?|Boulevard|Blvd\\.?|Drive|Dr\\.?|Lane|Ln\\.?|" +
      "Court|Ct\\.?|Parkway|Pkwy\\.?|Highway|Hwy\\.?|Way)\\b" +
      "(?:[ \\t]+(?:Apt|Apartment|Suite|Unit|#)[ \\t]*[A-Z0-9\\-]+)?" +
      "(?:,[ \\t]*[A-Z][A-Za-z.' \\-]+)?(?:,[ \\t]*[A-Z]{2}\\b)?" +
      "(?:[ \\t]+\\d{5}(?:-\\d{4})?)?)",
    0.95,
  ),
]);

const PLACEHOLDER_SOURCE = "\\[[A-Z][A-Z0-9_]*_\\d+\\]";

export function placeholderSpans(text) {
  return Array.from(text.matchAll(new RegExp(PLACEHOLDER_SOURCE, "g")), (match) => [
    match.index,
    match.index + match[0].length,
  ]);
}

export function isInsidePlaceholder(text, detection) {
  return placeholderSpans(text).some(
    ([start, end]) => detection.start >= start && detection.end <= end,
  );
}

function isTabularClinicalNumberSequence(value) {
  const cells = value.split(/[|\t]/).map((cell) => cell.trim());
  return (
    cells.length >= 3 &&
    cells.every((cell) => /^[-+]?\d{1,4}(?:[.,]\d{1,4})?%?$/.test(cell)) &&
    !/(?:19|20)\d{2}/.test(value)
  );
}

function isInTabularClinicalNumberRow(text, start, end) {
  const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const nextNewline = text.indexOf("\n", end);
  const lineEnd = nextNewline < 0 ? text.length : nextNewline;
  return isTabularClinicalNumberSequence(text.slice(lineStart, lineEnd));
}

function hasPhoneContext(text, start) {
  return /\b(?:phone|telephone|tel|callback|fax|facsimile|contact)\D{0,18}$/i.test(
    text.slice(Math.max(0, start - 80), start),
  );
}

function isRelativeTimePhraseMisreadAsAddress(value) {
  return /^\d{1,3}[ \t]+(?:minutes?|hours?|days?|weeks?|months?|years?)\b/i.test(value);
}

export function detectWithRules(text) {
  const placeholders = placeholderSpans(text);
  const detections = [];

  for (const spec of PATTERNS) {
    spec.regex.lastIndex = 0;
    for (const match of text.matchAll(spec.regex)) {
      const value = match.groups?.value ?? match[0];
      const relativeStart = match[0].indexOf(value);
      const start = match.index + Math.max(relativeStart, 0);
      const end = start + value.length;
      if (placeholders.some(([left, right]) => start >= left && end <= right)) continue;
      if (
        (isTabularClinicalNumberSequence(value) ||
          isInTabularClinicalNumberRow(text, start, end)) &&
        (spec.entityType === "DATE" ||
          (spec.entityType === "PHONE_NUMBER" && !hasPhoneContext(text, start)))
      ) {
        continue;
      }
      if (spec.entityType === "ADDRESS" && isRelativeTimePhraseMisreadAsAddress(value)) {
        continue;
      }
      if (
        spec.name === "punctuation-corrupted-date" &&
        /[A-Za-z]$/.test(text.slice(Math.max(0, start - 1), start)) &&
        /^\d{1,2}[ \t\r\n]+\d{1,2}[./-]\d{2}\b/.test(value) &&
        !/(?:DOB|D0B|DATE|DATED|ADMITTED|DISCHARGED|HOSPITALIZED|SEEN)$/i.test(
          text.slice(Math.max(0, start - 16), start),
        )
      ) {
        continue;
      }
      detections.push({
        start,
        end,
        entityType: spec.entityType,
        score: spec.score,
        recognizers: [spec.name],
      });
    }
  }
  return detections;
}
