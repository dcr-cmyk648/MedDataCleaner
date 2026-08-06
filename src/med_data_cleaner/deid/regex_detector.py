from __future__ import annotations

import re
from dataclasses import dataclass

from med_data_cleaner.deid.models import Detection, DetectorStatus


@dataclass(frozen=True, slots=True)
class PatternSpec:
    name: str
    entity_type: str
    pattern: re.Pattern[str]
    score: float
    value_group: str | None = "value"


MONTH = (
    r"Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|"
    r"Nov(?:ember)?|Dec(?:ember)?"
)
NAME_TOKEN = r"(?-i:(?:[A-Z014][A-Za-z014'\u2019/\-<>%&!\u00ad\u200b]+|[A-Z]\.))"
NAME_SEPARATOR = r"[ \t]{1,3}(?![ \t])"
CLINICIAN_LABEL = (
    r"provider|physician|doctor|attending|referring\s+provider|surgeon|oncologist|"
    r"psychiatrist|pediatrician|obstetrician|radiologist|pathologist|neurologist|"
    r"nephrologist|consultant|endocrinologist|pulmonologist|gastroenterologist|"
    r"rheumatologist|dermatologist|ophthalmologist|orthopedic\s+surgeon|orthopedist|urologist"
)
NAME_HEADER = (
    r"DOB|D0B|MRN|NPI|Address|H0ME|Phone|Fax|Email|Facility|Attending|Date|Encounter|Patient|"
    r"Pat1ent|PATlENT|Name|N4ME|"
    r"Provider|Physician|Doctor|Emergency|Member|Account|Visit|Claim|Order|Specimen|Device|"
    r"Caregiver|Guardian|Partner|Surgeon|Oncologist|Psychiatrist|Pediatrician|Obstetrician|"
    r"Radiologist|Pathologist|Neurologist|Nephrologist|Consultant|Endocrinologist|Pulmonologist|"
    r"Gastroenterologist|Rheumatologist|Dermatologist|Ophthalmologist|Orthopedic|Orthopedist|"
    r"Urologist|"
    r"Labs?|Medications?|Assessment|Plan|"
    r"History|Diagnosis|Mother|Father|Spouse|Callback|Home|Study|Procedure|Collection|Treatment"
    r"|Presented|Refer|Referred|Referral"
)
LABELED_NAME_SEPARATOR = rf"[ \t]{{1,3}}(?![ \t])(?!(?:{NAME_HEADER})\b)"
LABELED_CORE_NAME_VALUE = (
    rf"(?:{NAME_TOKEN},[ \t]{{0,3}}{NAME_TOKEN}"
    rf"(?:{LABELED_NAME_SEPARATOR}{NAME_TOKEN})?|"
    rf"{NAME_TOKEN}(?:{LABELED_NAME_SEPARATOR}{NAME_TOKEN}){{0,3}})"
)
CLINICIAN_PREFIX = r"(?:(?:Dr|Doctor|Provider|Physician)\.?[ \t\r\n]+)?"
LABELED_NAME_BODY = (
    rf"{LABELED_CORE_NAME_VALUE}"
    rf"(?:[ \t]*\r?\n[ \t]*(?!(?:{NAME_HEADER})\b){LABELED_CORE_NAME_VALUE}"
    rf"(?![ \t]+[a-z]))?"
)
LABELED_NAME_VALUE = rf"{CLINICIAN_PREFIX}{LABELED_NAME_BODY}"
FACILITY_TOKEN = r"(?-i:[A-Z][A-Za-z0-9'\u2019/\-<>%&!\u00ad\u200b]*)"
FACILITY_VALUE = rf"{FACILITY_TOKEN}(?:{NAME_SEPARATOR}{FACILITY_TOKEN}){{0,7}}"
FACILITY_DESIGNATOR = (
    r"(?-i:(?:Dialysis|Clinic|Center|Hospital|Pavilion|Medical|Imaging|Unit|Annex))"
)
CONTEXTUAL_FACILITY_VALUE = rf"(?:{FACILITY_TOKEN}{NAME_SEPARATOR}){{1,7}}{FACILITY_DESIGNATOR}"
LABELED_FACILITY_VALUE = (
    rf"{FACILITY_VALUE}"
    rf"(?:[ \t]*\r?\n[ \t]*(?!(?:{NAME_HEADER})\b){FACILITY_VALUE})?"
)
ID_VALUE = (
    r"[A-Z0-9](?:(?:[._/\-<>%&!|?@~^+]\r?\n(?=[A-Z0-9]))|"
    r"[A-Z0-9._/\-{}\[\]<>%&!|?@~^+\u00ad\u200b]){2,}[A-Z0-9]"
)
REQUIRED_LABEL_DELIMITER = r"[ \t]*(?:[:#=\-{}\[\].<>]{1,8})[ \t]*"
OPTIONAL_LABEL_DELIMITER = r"[ \t]*(?:[:#=\-{}\[\].<>]{1,8}[ \t]*)?"
PHONE_SEPARATOR = r"[ \t\r\n./\-]{1,5}"
STANDARD_PHONE_VALUE = (
    rf"(?:\+?1[ .\-]?)?(?:\(\d{{3}}\)|\d{{3}}){PHONE_SEPARATOR}"
    rf"\d{{3}}{PHONE_SEPARATOR}\d{{4}}"
    r"(?:\s*(?:x|ext\.?)[ ]?\d{1,6})?"
)
OCR_PHONE_GAP = r"[ \t\r\n./_{}\[\]()<>%&!|?@~^+\-\u00ad\u200b]"
OCR_PHONE_INTRA_GAP = rf"{OCR_PHONE_GAP}{{0,3}}"
OCR_PHONE_GROUP_GAP = rf"{OCR_PHONE_GAP}{{1,5}}"
OCR_PHONE_VALUE = (
    rf"(?:\+?1{OCR_PHONE_GROUP_GAP})?"
    rf"\d{OCR_PHONE_INTRA_GAP}\d{OCR_PHONE_INTRA_GAP}\d{OCR_PHONE_GROUP_GAP}"
    rf"\d{OCR_PHONE_INTRA_GAP}\d{OCR_PHONE_INTRA_GAP}\d{OCR_PHONE_GROUP_GAP}"
    rf"\d{OCR_PHONE_INTRA_GAP}\d{OCR_PHONE_INTRA_GAP}\d{OCR_PHONE_INTRA_GAP}\d"
    r"(?:\s*(?:x|ext\.?)[ ]?\d{1,6})?"
)
PHONE_VALUE = rf"(?:{STANDARD_PHONE_VALUE}|{OCR_PHONE_VALUE})"
EMAIL_GAP = r"[ \t\r\n\u00ad\u200b]{0,3}"
EMAIL_DOT_GAP = r"[\r\n\u00ad\u200b]{0,3}"
US_STATE = (
    r"Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|"
    r"Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|"
    r"Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|"
    r"New[ \t]+Hampshire|New[ \t]+Jersey|New[ \t]+Mexico|New[ \t]+York|North[ \t]+Carolina|"
    r"North[ \t]+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode[ \t]+Island|"
    r"South[ \t]+Carolina|South[ \t]+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|"
    r"Washington|West[ \t]+Virginia|Wisconsin|Wyoming|"
    r"AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|"
    r"MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY"
)
LOCATION_TOKEN = r"[A-Za-z][A-Za-z'\u2019./\-]*"
OCR_NOISE = r"[ \t\r\n./_{}\[\]()<>%&!|?@~^+\-\u00ad\u200b]"
OCR_STRONG_YEAR_BREAK = r"[ \t\r\n<>%&!|?@~^+\u00ad\u200b]"
OCR_DIGIT_GAP = rf"{OCR_NOISE}{{0,4}}"
OCR_STRONG_GAP = rf"{OCR_NOISE}{{0,3}}{OCR_STRONG_YEAR_BREAK}{OCR_NOISE}{{0,3}}"
OCR_YEAR4 = (
    rf"(?:1{OCR_DIGIT_GAP}9{OCR_DIGIT_GAP}\d{OCR_DIGIT_GAP}\d|"
    rf"2{OCR_DIGIT_GAP}0{OCR_DIGIT_GAP}\d{OCR_DIGIT_GAP}\d)"
)
OCR_CORRUPTED_YEAR4 = (
    rf"(?:1{OCR_STRONG_GAP}9{OCR_DIGIT_GAP}\d{OCR_DIGIT_GAP}\d|"
    rf"1{OCR_DIGIT_GAP}9{OCR_STRONG_GAP}\d{OCR_DIGIT_GAP}\d|"
    rf"1{OCR_DIGIT_GAP}9{OCR_DIGIT_GAP}\d{OCR_STRONG_GAP}\d|"
    rf"2{OCR_STRONG_GAP}0{OCR_DIGIT_GAP}\d{OCR_DIGIT_GAP}\d|"
    rf"2{OCR_DIGIT_GAP}0{OCR_STRONG_GAP}\d{OCR_DIGIT_GAP}\d|"
    rf"2{OCR_DIGIT_GAP}0{OCR_DIGIT_GAP}\d{OCR_STRONG_GAP}\d)"
)
OCR_YEAR = rf"(?:{OCR_YEAR4}|\d{{2}})"
OCR_ZIP5 = rf"(?:\d{OCR_DIGIT_GAP}){{4}}\d"
OCR_NPI = rf"(?:\d{OCR_DIGIT_GAP}){{9}}\d"


def _compile(pattern: str) -> re.Pattern[str]:
    return re.compile(pattern, re.IGNORECASE | re.MULTILINE)


PATTERNS: tuple[PatternSpec, ...] = (
    PatternSpec(
        "labeled-name",
        "PERSON",
        _compile(
            rf"\b(?:pat[iIl1]ent(?:\s+n[a4]me)?|pt|n[a4]me|mother|father|spouse|"
            rf"emergency\s+contact|caregiver|guardian|partner)"
            rf"{REQUIRED_LABEL_DELIMITER}(?P<value>{LABELED_NAME_VALUE})"
        ),
        0.96,
    ),
    PatternSpec(
        "labeled-provider-name",
        "PROVIDER",
        _compile(
            rf"\b(?:{CLINICIAN_LABEL})"
            rf"{REQUIRED_LABEL_DELIMITER}(?P<value>{LABELED_NAME_VALUE})"
        ),
        0.97,
    ),
    PatternSpec(
        "titled-clinician-name",
        "PROVIDER",
        _compile(
            rf"\b(?:Dr|Doctor|Provider|Physician)\.?\s+"
            rf"(?P<value>{LABELED_CORE_NAME_VALUE})"
        ),
        0.91,
    ),
    PatternSpec(
        "referral-provider-name",
        "PROVIDER",
        _compile(
            rf"\b(?:refer(?:red)?\s+(?:to|with)|referral\s+to|"
            rf"consult(?:ed)?\s+(?:with|by))\s+"
            rf"(?P<value>{LABELED_NAME_VALUE})"
        ),
        0.94,
    ),
    PatternSpec(
        "relationship-name",
        "PERSON",
        _compile(
            rf"\b(?:(?:his|her|their)[ \t]+)?(?:mother|father|sister|brother|wife|husband|"
            rf"spouse|son|daughter|guardian|caregiver)[ \t]+"
            rf"(?P<value>{LABELED_CORE_NAME_VALUE})"
        ),
        0.95,
    ),
    PatternSpec(
        "concatenated-facility-name",
        "LOCATION",
        _compile(
            r"(?-i:(?:[Aa]t|[Tt]o|[Ff]rom))"
            r"(?P<value>(?-i:(?:[A-Z][a-z0-9'\u2019\-]{1,24}){2,}"
            r"(?:Dialysis|Clinic|Center|Hospital|Pavilion|Unit|Annex)))\b"
        ),
        0.95,
    ),
    PatternSpec(
        "contextual-facility-name",
        "LOCATION",
        _compile(rf"\b(?:at|from|to)[ \t]+(?P<value>{CONTEXTUAL_FACILITY_VALUE})\b"),
        0.95,
    ),
    PatternSpec(
        "labeled-facility-name",
        "LOCATION",
        _compile(
            rf"\b(?:unit|facility|dialysis\s+(?:unit|center|facility))"
            rf"{REQUIRED_LABEL_DELIMITER}(?P<value>{LABELED_FACILITY_VALUE})"
        ),
        0.96,
    ),
    PatternSpec(
        "email-address",
        "EMAIL_ADDRESS",
        _compile(
            rf"(?P<value>(?<![\w.+\-])[A-Z0-9._%+\-\u00ad\u200b]+{EMAIL_GAP}"
            rf"@{EMAIL_GAP}(?:[A-Z0-9\-\u00ad\u200b]+{EMAIL_DOT_GAP}\."
            rf"{EMAIL_DOT_GAP})+"
            rf"[A-Z\u00ad\u200b]{{2,63}}(?![\w\-]))"
        ),
        0.99,
    ),
    PatternSpec(
        "web-url",
        "URL",
        _compile(r"(?P<value>\b(?:https?://|www\.)[^\s<>{}\[\]()]+(?<![.,;:!?]))"),
        0.98,
    ),
    PatternSpec(
        "ipv4-address",
        "IP_ADDRESS",
        _compile(
            r"(?P<value>(?<![\d.])(?:25[0-5]|2[0-4]\d|1?\d?\d)"
            r"(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?!\d|\.\d))"
        ),
        0.99,
    ),
    PatternSpec(
        "social-security-number",
        "US_SSN",
        _compile(r"(?P<value>(?<!\d)\d{3}[ \-]?\d{2}[ \-]?\d{4}(?!\d))"),
        0.99,
    ),
    PatternSpec(
        "fax-number",
        "FAX_NUMBER",
        _compile(rf"\b(?:fax|facsimile)\s*[:=\-]?\s*(?P<value>{PHONE_VALUE})"),
        0.99,
    ),
    PatternSpec(
        "phone-number",
        "PHONE_NUMBER",
        _compile(rf"(?P<value>(?<!\d){PHONE_VALUE}(?!\d))"),
        0.96,
    ),
    PatternSpec(
        "iso-date",
        "DATE",
        _compile(
            rf"(?P<value>(?<!\d){OCR_YEAR4}"
            rf"{OCR_NOISE}{{1,8}}(?:0?[1-9]|1[0-2]){OCR_NOISE}{{1,8}}"
            rf"(?:0?[1-9]|[12]\d|3[01])(?!\d))"
        ),
        0.97,
    ),
    PatternSpec(
        "numeric-date",
        "DATE",
        _compile(
            r"(?P<value>(?<!\d)(?:0?[1-9]|1[0-2])[/.\-]"
            r"(?:0?[1-9]|[12]\d|3[01])[/.\-](?:(?:19|20)?\d{2})(?!\d))"
        ),
        0.96,
    ),
    PatternSpec(
        "punctuation-corrupted-date",
        "DATE",
        _compile(
            rf"(?P<value>(?<!\d)(?:0?[1-9]|1[0-2]){OCR_NOISE}{{1,8}}"
            rf"(?:0?[1-9]|[12]\d|3[01]){OCR_NOISE}{{1,8}}{OCR_YEAR}(?!\d))"
        ),
        0.95,
    ),
    PatternSpec(
        "month-name-date-with-year",
        "DATE",
        _compile(
            rf"(?P<value>\b(?:{MONTH})\.?\s+\d{{1,2}}(?:st|nd|rd|th)?"
            rf"(?:,\s*|\s+){OCR_YEAR4}\b)"
        ),
        0.97,
    ),
    PatternSpec(
        "corrupted-year",
        "DATE",
        _compile(rf"(?P<value>(?<!\d){OCR_CORRUPTED_YEAR4}(?!\d))"),
        0.94,
    ),
    PatternSpec(
        "month-name-date",
        "DATE",
        _compile(rf"(?P<value>\b(?:{MONTH})\.?\s+\d{{1,2}}(?:st|nd|rd|th)?\b)"),
        0.90,
    ),
    PatternSpec(
        "age-over-89",
        "AGE_OVER_89",
        _compile(
            r"\bage(?:d)?\s*[:=]?\s*(?P<value>(?:9\d|1[01]\d|120))"
            r"\s*(?:years?|yrs?|y/?o)?\b"
        ),
        0.98,
    ),
    PatternSpec(
        "hyphenated-age-over-89",
        "AGE_OVER_89",
        _compile(r"\b(?P<value>(?:9\d|1[01]\d|120))(?=\s*[- ]?years?[- ]old\b)"),
        0.98,
    ),
    PatternSpec(
        "standalone-age-over-89",
        "AGE_OVER_89",
        _compile(r"\b(?P<value>(?:9\d|1[01]\d|120))(?=\s*(?:years?|yrs?|y/?o)\b)"),
        0.97,
    ),
    PatternSpec(
        "line-broken-age-over-89",
        "AGE_OVER_89",
        _compile(
            r"\b(?P<value>(?:9[ \t\r\n]+\d|1[ \t\r\n]+[01][ \t\r\n]*\d|"
            r"1[ \t\r\n]+2[ \t\r\n]*0))(?=\s*(?:years?|yrs?|y/?o)\b)"
        ),
        0.98,
    ),
    PatternSpec(
        "medical-record-number",
        "MEDICAL_RECORD_NUMBER",
        _compile(
            rf"\b(?:MRN|med[iIl1]cal\s+rec[o0]rd(?:\s+(?:number|n[o0]\.?))?|"
            rf"chart(?:\s+(?:number|no\.?))?|"
            rf"patient\s+id(?:entifier)?){OPTIONAL_LABEL_DELIMITER}(?P<value>{ID_VALUE})\b"
        ),
        0.99,
    ),
    PatternSpec(
        "health-plan-identifier",
        "HEALTH_PLAN_ID",
        _compile(
            rf"\b(?:member|subscriber|beneficiary|health\s+plan|insurance)"
            rf"(?:\s+(?:id|identifier|number|no\.?)){OPTIONAL_LABEL_DELIMITER}"
            rf"(?P<value>{ID_VALUE})\b"
        ),
        0.98,
    ),
    PatternSpec(
        "account-number",
        "ACCOUNT_NUMBER",
        _compile(
            rf"\b(?:account|acct|billing)(?:\s+(?:id|number|no\.?))?"
            rf"{REQUIRED_LABEL_DELIMITER}(?P<value>{ID_VALUE})\b"
        ),
        0.97,
    ),
    PatternSpec(
        "license-or-certificate-number",
        "LICENSE_NUMBER",
        _compile(
            rf"\b(?:medical\s+license|license|certificate|DEA)"
            rf"(?:\s+(?:id|number|no\.?))?{REQUIRED_LABEL_DELIMITER}"
            rf"(?P<value>{ID_VALUE})\b"
        ),
        0.97,
    ),
    PatternSpec(
        "provider-identifier",
        "UNIQUE_ID",
        _compile(rf"\bNPI{OPTIONAL_LABEL_DELIMITER}(?P<value>{OCR_NPI})(?!\d)"),
        0.99,
    ),
    PatternSpec(
        "device-serial-number",
        "DEVICE_ID",
        _compile(
            rf"\b(?:device|implant|pacemaker|pump|serial)"
            rf"(?:\s+(?:id|identifier|serial|number|no\.?))?"
            rf"{REQUIRED_LABEL_DELIMITER}(?P<value>{ID_VALUE})\b"
        ),
        0.96,
    ),
    PatternSpec(
        "vehicle-identifier",
        "VEHICLE_ID",
        _compile(
            rf"\b(?:VIN(?:\s+(?:id|identifier|number|no\.?))?|"
            rf"(?:license\s+plate|plate)(?:\s+(?:id|identifier|number|no\.?))?|"
            rf"vehicle\s+(?:id|identifier|number|no\.?))"
            rf"\b{OPTIONAL_LABEL_DELIMITER}(?P<value>{ID_VALUE})\b"
        ),
        0.97,
    ),
    PatternSpec(
        "other-contextual-identifier",
        "UNIQUE_ID",
        _compile(
            rf"\b(?:claim|case|encounter|visit|accession|order|specimen)"
            rf"(?:\s+(?:id|identifier|number|no\.?))"
            rf"\s*(?:is\s+)?{OPTIONAL_LABEL_DELIMITER}(?P<value>{ID_VALUE})\b"
        ),
        0.94,
    ),
    PatternSpec(
        "postal-code",
        "ZIP_CODE",
        _compile(
            r"\b(?:ZIP(?:\s+code)?|postal\s+code)\s*(?:is\s+)?[:=\-]?\s*"
            r"(?P<value>\d{5}(?:-\d{4})?)\b"
        ),
        0.98,
    ),
    PatternSpec(
        "corrupted-postal-code",
        "ZIP_CODE",
        _compile(
            r"\b(?:ZIP(?:\s+code)?|postal\s+code)\s*(?:is\s+)?[:=\-]?\s*"
            r"(?P<value>(?:\d[ \t./_{}\[\]()<>\-]*){4}\d[}\])]?)(?!\d)"
        ),
        0.99,
    ),
    PatternSpec(
        "postal-code-after-state",
        "ZIP_CODE",
        _compile(
            rf",[ \t]*(?:{US_STATE})[ \t]+(?P<value>{OCR_ZIP5}(?:[ \t]*-[ \t]*\d{{4}})?)"
            rf"(?!\d)"
        ),
        0.98,
    ),
    PatternSpec(
        "residence-city-before-state",
        "LOCATION",
        _compile(
            rf"\b(?:lives?|resides?)[ \t]+(?:at|in)[ \t]+"
            rf"(?P<value>{LOCATION_TOKEN}(?:[ \t]+{LOCATION_TOKEN}){{0,4}})"
            rf"(?=[ \t]*,[ \t]*(?:{US_STATE})\b)"
        ),
        0.96,
    ),
    PatternSpec(
        "separator-corrupted-location",
        "LOCATION",
        _compile(
            r"\b(?:in|from|near|at)[ \t]+"
            r"(?P<value>[A-Z][A-Za-z'\u2019\-]*(?:[/\\]{2,}[A-Za-z'\u2019\-]+)+)\b"
        ),
        0.94,
    ),
    PatternSpec(
        "corrupted-street-address",
        "ADDRESS",
        _compile(
            r"(?P<value>(?<!\w)[#\-]?\d[\d{}\[\]()./\\_\-]{0,30}[ \t]+"
            r"(?:[A-Za-z][A-Za-z'\u2019.\-]*[ \t]+){0,6}"
            r"[A-Za-z][A-Za-z'\u2019.\-]*[\]})\[({./\\_\-]{1,8}"
            r"(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|"
            r"Lane|Ln\.?|Court|Ct\.?|Parkway|Pkwy\.?|Highway|Hwy\.?|Way)\b)"
        ),
        0.97,
    ),
    PatternSpec(
        "street-address",
        "ADDRESS",
        _compile(
            r"(?P<value>\b\d{1,6}[ \t]+"
            r"(?:[A-Z0-9][\w.'\u2019\-]*[ \t]+){0,7}"
            r"(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|"
            r"Lane|Ln\.?|Court|Ct\.?|Parkway|Pkwy\.?|Highway|Hwy\.?|Way)\b"
            r"(?:[ \t]+(?:Apt|Apartment|Suite|Unit|#)[ \t]*[A-Z0-9\-]+)?"
            r"(?:,[ \t]*[A-Z][A-Za-z.' \-]+)?(?:,[ \t]*[A-Z]{2}\b)?"
            r"(?:[ \t]+\d{5}(?:-\d{4})?)?)"
        ),
        0.95,
    ),
)


PLACEHOLDER_PATTERN = re.compile(r"\[[A-Z][A-Z0-9_]*_\d+\]")


class RegexDetector:
    @property
    def status(self) -> DetectorStatus:
        return DetectorStatus(
            name="deterministic-rules",
            ready=True,
            required=True,
            detail=f"{len(PATTERNS)} local pattern recognizers ready",
        )

    def detect(self, text: str) -> list[Detection]:
        placeholders = tuple(
            (match.start(), match.end()) for match in PLACEHOLDER_PATTERN.finditer(text)
        )
        detections: list[Detection] = []

        for spec in PATTERNS:
            for match in spec.pattern.finditer(text):
                if spec.value_group and match.groupdict().get(spec.value_group) is not None:
                    start, end = match.span(spec.value_group)
                else:
                    start, end = match.span()

                if any(start >= left and end <= right for left, right in placeholders):
                    continue
                line_start = text.rfind("\n", 0, start) + 1
                line_end = text.find("\n", end)
                if line_end < 0:
                    line_end = len(text)
                tabular_candidates = (text[start:end], text[line_start:line_end])
                tabular_clinical_numbers = any(
                    len(cells := [cell.strip() for cell in re.split(r"[|\t]", candidate)]) >= 3
                    and all(re.fullmatch(r"[-+]?\d{1,4}(?:[.,]\d{1,4})?%?", cell) for cell in cells)
                    and re.search(r"(?:19|20)\d{2}", candidate) is None
                    for candidate in tabular_candidates
                )
                phone_context = re.search(
                    r"\b(?:phone|telephone|tel|callback|fax|facsimile|contact)\D{0,18}$",
                    text[max(0, start - 80) : start],
                    re.IGNORECASE,
                )
                if tabular_clinical_numbers and (
                    spec.entity_type == "DATE"
                    or (spec.entity_type == "PHONE_NUMBER" and phone_context is None)
                ):
                    continue
                if spec.entity_type == "ADDRESS" and re.match(
                    r"\d{1,3}[ \t]+(?:minutes?|hours?|days?|weeks?|months?|years?)\b",
                    text[start:end],
                    re.IGNORECASE,
                ):
                    continue
                if (
                    spec.name == "punctuation-corrupted-date"
                    and start > 0
                    and text[start - 1].isalpha()
                    and re.match(r"\d{1,2}[ \t\r\n]+\d{1,2}[./-]\d{2}\b", text[start:end])
                    and not re.search(
                        r"(?:DOB|D0B|DATE|DATED|ADMITTED|DISCHARGED|HOSPITALIZED|SEEN)$",
                        text[max(0, start - 16) : start],
                        re.IGNORECASE,
                    )
                ):
                    continue

                detections.append(
                    Detection(
                        start=start,
                        end=end,
                        entity_type=spec.entity_type,
                        score=spec.score,
                        recognizers=(spec.name,),
                        explanation="Matched a local deterministic recognizer",
                    )
                )

        return detections
