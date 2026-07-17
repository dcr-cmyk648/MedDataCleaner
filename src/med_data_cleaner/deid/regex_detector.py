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
NAME_TOKEN = r"(?-i:(?:[A-Z][A-Za-z'\u2019/\-]+|[A-Z]\.))"
NAME_VALUE = (
    rf"(?:{NAME_TOKEN},[ \t]*{NAME_TOKEN}(?:[ \t]+{NAME_TOKEN})?|"
    rf"{NAME_TOKEN}(?:[ \t]+{NAME_TOKEN}){{0,3}})"
)
ID_VALUE = r"[A-Z0-9][A-Z0-9._/\-]{3,}"
PHONE_VALUE = (
    r"(?:\+?1[ .\-]?)?(?:\(\d{3}\)|\d{3})[ .\-]\d{3}[ .\-]\d{4}"
    r"(?:\s*(?:x|ext\.?)[ ]?\d{1,6})?"
)
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


def _compile(pattern: str) -> re.Pattern[str]:
    return re.compile(pattern, re.IGNORECASE | re.MULTILINE)


PATTERNS: tuple[PatternSpec, ...] = (
    PatternSpec(
        "labeled-name",
        "PERSON",
        _compile(
            rf"\b(?:patient(?:\s+name)?|name|provider|physician|doctor|attending|"
            rf"referring\s+provider|mother|father|spouse|emergency\s+contact)"
            rf"\s*[:=\-]\s*(?P<value>{NAME_VALUE})"
        ),
        0.96,
    ),
    PatternSpec(
        "titled-clinician-name",
        "PERSON",
        _compile(rf"\b(?:Dr|Doctor|Provider|Physician)\.?\s+(?P<value>{NAME_VALUE})"),
        0.91,
    ),
    PatternSpec(
        "relationship-name",
        "PERSON",
        _compile(
            rf"\b(?:(?:his|her|their)[ \t]+)?(?:mother|father|sister|brother|wife|husband|"
            rf"spouse|son|daughter|guardian|caregiver)[ \t]+(?P<value>{NAME_VALUE})"
        ),
        0.95,
    ),
    PatternSpec(
        "email-address",
        "EMAIL_ADDRESS",
        _compile(
            r"(?P<value>(?<![\w.+\-])[A-Z0-9._%+\-]+@(?:[A-Z0-9\-]+\.)+[A-Z]{2,63}(?![\w.\-]))"
        ),
        0.99,
    ),
    PatternSpec(
        "web-url",
        "URL",
        _compile(r"(?P<value>\b(?:https?://|www\.)[^\s<>{}\[\]()]+)"),
        0.98,
    ),
    PatternSpec(
        "ipv4-address",
        "IP_ADDRESS",
        _compile(
            r"(?P<value>(?<![\d.])(?:25[0-5]|2[0-4]\d|1?\d?\d)"
            r"(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\d.]))"
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
            r"(?P<value>(?<!\d)(?:19|20)\d{2}[\-/](?:0?[1-9]|1[0-2])"
            r"[\-/](?:0?[1-9]|[12]\d|3[01])(?!\d))"
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
            r"(?P<value>(?<!\d)(?:0?[1-9]|1[0-2])[./_\-]{1,6}"
            r"(?:0?[1-9]|[12]\d|3[01])[./_\-]{1,6}(?:(?:19|20)?\d{2})(?!\d))"
        ),
        0.95,
    ),
    PatternSpec(
        "month-name-date-with-year",
        "DATE",
        _compile(
            rf"(?P<value>\b(?:{MONTH})\.?\s+\d{{1,2}}(?:st|nd|rd|th)?"
            rf"(?:,\s*|\s+)(?:19|20)\d{{2}}\b)"
        ),
        0.97,
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
            r"\b(?:age(?:d)?|(?:is|was))\s*[:=]?\s*"
            r"(?P<value>(?:9\d|1[01]\d|120))\s*(?:years?|yrs?|y/?o)?\b"
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
            rf"\b(?:MRN|medical\s+record(?:\s+(?:number|no\.?))?|chart(?:\s+(?:number|no\.?))?|"
            rf"patient\s+id(?:entifier)?)\s*[:#=\-]?\s*(?P<value>{ID_VALUE})\b"
        ),
        0.99,
    ),
    PatternSpec(
        "health-plan-identifier",
        "HEALTH_PLAN_ID",
        _compile(
            rf"\b(?:member|subscriber|beneficiary|health\s+plan|insurance)"
            rf"(?:\s+(?:id|identifier|number|no\.?))\s*[:#=\-]?\s*(?P<value>{ID_VALUE})\b"
        ),
        0.98,
    ),
    PatternSpec(
        "account-number",
        "ACCOUNT_NUMBER",
        _compile(
            rf"\b(?:account|acct|billing)(?:\s+(?:id|number|no\.?))?"
            rf"\s*[:#=\-]\s*(?P<value>{ID_VALUE})\b"
        ),
        0.97,
    ),
    PatternSpec(
        "license-or-certificate-number",
        "LICENSE_NUMBER",
        _compile(
            rf"\b(?:medical\s+license|license|certificate|DEA)"
            rf"(?:\s+(?:id|number|no\.?))?\s*[:#=\-]\s*(?P<value>{ID_VALUE})\b"
        ),
        0.97,
    ),
    PatternSpec(
        "provider-identifier",
        "UNIQUE_ID",
        _compile(r"\bNPI\s*[:#=\-]?\s*(?P<value>\d{10})\b"),
        0.99,
    ),
    PatternSpec(
        "device-serial-number",
        "DEVICE_ID",
        _compile(
            rf"\b(?:device|implant|pacemaker|pump|serial)"
            rf"(?:\s+(?:id|identifier|serial|number|no\.?))?"
            rf"\s*[:#=\-]\s*(?P<value>{ID_VALUE})\b"
        ),
        0.96,
    ),
    PatternSpec(
        "vehicle-identifier",
        "VEHICLE_ID",
        _compile(
            rf"\b(?:VIN|vehicle|license\s+plate|plate)"
            rf"(?:\s+(?:id|identifier|number|no\.?))?"
            rf"\s*[:#=\-]?\s*(?P<value>{ID_VALUE})\b"
        ),
        0.97,
    ),
    PatternSpec(
        "other-contextual-identifier",
        "UNIQUE_ID",
        _compile(
            rf"\b(?:claim|case|encounter|visit|accession|order|specimen)"
            rf"(?:\s+(?:id|identifier|number|no\.?))"
            rf"\s*[:#=\-]?\s*(?P<value>{ID_VALUE})\b"
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
            r"(?P<value>\b\d{1,6}\s+(?:[A-Z0-9][\w.'\u2019\-]*\s+){0,7}"
            r"(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|"
            r"Lane|Ln\.?|Court|Ct\.?|Parkway|Pkwy\.?|Highway|Hwy\.?|Way)"
            r"(?:\s+(?:Apt|Apartment|Suite|Unit|#)\s*[A-Z0-9\-]+)?"
            r"(?:,\s*[A-Z][A-Za-z.' \-]+)?(?:,\s*[A-Z]{2})?"
            r"(?:\s+\d{5}(?:-\d{4})?)?)"
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
