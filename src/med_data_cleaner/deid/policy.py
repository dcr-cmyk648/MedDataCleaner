from __future__ import annotations

import json
from functools import lru_cache
from importlib.resources import files
from typing import Any


@lru_cache(maxsize=1)
def load_policy() -> dict[str, Any]:
    policy_path = files("med_data_cleaner.deid.policies").joinpath("hipaa_safe_harbor_text_v1.json")
    return json.loads(policy_path.read_text(encoding="utf-8"))


POLICY_ID = "hipaa-safe-harbor-text-v1"

PLACEHOLDER_LABELS = {
    "PERSON": "PERSON",
    "PROVIDER": "PROVIDER",
    "LOCATION": "LOCATION",
    "ADDRESS": "ADDRESS",
    "ZIP_CODE": "ZIP_CODE",
    "DATE": "DATE",
    "AGE_OVER_89": "AGE_OVER_89",
    "PHONE_NUMBER": "PHONE_NUMBER",
    "FAX_NUMBER": "FAX_NUMBER",
    "EMAIL_ADDRESS": "EMAIL_ADDRESS",
    "US_SSN": "US_SSN",
    "MEDICAL_RECORD_NUMBER": "MEDICAL_RECORD_NUMBER",
    "HEALTH_PLAN_ID": "HEALTH_PLAN_ID",
    "ACCOUNT_NUMBER": "ACCOUNT_NUMBER",
    "LICENSE_NUMBER": "LICENSE_NUMBER",
    "VEHICLE_ID": "VEHICLE_ID",
    "DEVICE_ID": "DEVICE_ID",
    "URL": "URL",
    "IP_ADDRESS": "IP_ADDRESS",
    "BIOMETRIC_ID": "BIOMETRIC_ID",
    "UNIQUE_ID": "UNIQUE_ID",
}

ALLOWED_MANUAL_ENTITY_TYPES = tuple(PLACEHOLDER_LABELS)

PRESIDIO_ENTITY_MAP = {
    "PERSON": "PERSON",
    "LOCATION": "LOCATION",
    "ORGANIZATION": "LOCATION",
    "FACILITY": "LOCATION",
    "DATE_TIME": "DATE",
    "PHONE_NUMBER": "PHONE_NUMBER",
    "EMAIL_ADDRESS": "EMAIL_ADDRESS",
    "US_SSN": "US_SSN",
    "MEDICAL_LICENSE": "LICENSE_NUMBER",
    "US_DRIVER_LICENSE": "LICENSE_NUMBER",
    "US_PASSPORT": "UNIQUE_ID",
    "US_ITIN": "UNIQUE_ID",
    "US_BANK_NUMBER": "ACCOUNT_NUMBER",
    "CREDIT_CARD": "ACCOUNT_NUMBER",
    "IBAN_CODE": "ACCOUNT_NUMBER",
    "URL": "URL",
    "IP_ADDRESS": "IP_ADDRESS",
}

# Higher values win the label when two recognizers return overlapping spans. The union of the
# offsets is always removed regardless of which label wins.
ENTITY_PRIORITY = {
    "MEDICAL_RECORD_NUMBER": 100,
    "HEALTH_PLAN_ID": 99,
    "US_SSN": 98,
    "ACCOUNT_NUMBER": 97,
    "LICENSE_NUMBER": 96,
    "VEHICLE_ID": 95,
    "DEVICE_ID": 94,
    "EMAIL_ADDRESS": 93,
    "URL": 92,
    "IP_ADDRESS": 91,
    "PHONE_NUMBER": 90,
    "FAX_NUMBER": 90,
    "ADDRESS": 85,
    "ZIP_CODE": 84,
    "PROVIDER": 81,
    "PERSON": 80,
    "LOCATION": 79,
    "AGE_OVER_89": 75,
    "DATE": 70,
    "BIOMETRIC_ID": 65,
    "UNIQUE_ID": 60,
}


def normalize_entity_type(entity_type: str) -> str:
    normalized = PRESIDIO_ENTITY_MAP.get(entity_type, entity_type)
    return normalized if normalized in PLACEHOLDER_LABELS else "UNIQUE_ID"
