import { readFile } from "node:fs/promises";

const PROFILES = ["baseline", "ocr", "layout", "noisy-emr", "segmentation"];
const GENERIC_LOCATION_WORDS = new Set([
  "BEHAVIORAL",
  "CANCER",
  "CENTER",
  "CLINIC",
  "DERMATOLOGY",
  "DIGESTIVE",
  "ENDOCRINE",
  "EMERGENCY",
  "EYE",
  "HEART",
  "HOSPITAL",
  "IMAGING",
  "KIDNEY",
  "MEDICAL",
  "ORTHOPEDIC",
  "PAVILION",
  "PULMONARY",
  "RHEUMATOLOGY",
  "SURGICAL",
  "TEST",
  "UROLOGY",
]);
const GENERIC_ID_PARTS = new Set([
  "ACC",
  "CARD",
  "DERM",
  "ED",
  "ENC",
  "ENDO",
  "GEN",
  "GI",
  "ID",
  "MESH",
  "MRN",
  "NEUR",
  "NEURO",
  "ONC",
  "OPH",
  "ORD",
  "ORTH",
  "PATH",
  "PED",
  "PM",
  "PORT",
  "PULM",
  "RAD",
  "RHEU",
  "RHEUM",
  "SPC",
  "SURG",
  "TEST",
  "URO",
  "VISIT",
]);
const GENERIC_PERSON_PARTS = new Set(["DOCTOR", "DR", "PHYSICIAN", "PROVIDER"]);
const STRUCTURAL_TERMS = ["D0B", "H0ME", "NPI", "PATlENT N4ME", "Pat1ent"];

function stringSeed(value) {
  let seed = 2166136261;
  for (const character of value) {
    seed ^= character.codePointAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function mulberry32(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function choose(random, values) {
  return values[Math.floor(random() * values.length)];
}

function replaceFirstConfusable(value, random) {
  const candidates = [];
  for (const [index, character] of [...value].entries()) {
    if (/[aA]/.test(character)) candidates.push([index, "4"]);
    if (/[iIlL]/.test(character)) candidates.push([index, "1"]);
    if (/[oO]/.test(character)) candidates.push([index, "0"]);
  }
  if (!candidates.length) return value;
  const [index, replacement] = choose(random, candidates);
  return value.slice(0, index) + replacement + value.slice(index + 1);
}

function insertBeforeLastDigits(value, marker, digitCount = 1) {
  const digits = [...value.matchAll(/\d/g)];
  if (digits.length <= digitCount) return value;
  const index = digits.at(-digitCount).index;
  return value.slice(0, index) + marker + value.slice(index);
}

function insertInsideFirstWord(value, marker) {
  const prefixMatch = /^(?:(?:Dr\.?|Doctor|Provider|Physician)\s+)/.exec(value);
  const prefix = prefixMatch?.[0] ?? "";
  const word = /^[A-Za-z0-9]+/.exec(value.slice(prefix.length))?.[0];
  if (!word || word.length < 3) return value;
  const index = prefix.length + Math.max(1, Math.floor(word.length / 2));
  return value.slice(0, index) + marker + value.slice(index);
}

function segmentYear(value, random) {
  const variants = [
    (_century, third, fourth) => `20%${third}${fourth}`,
    (_century, third, fourth) => `20\n${third}${fourth}`,
    (century, third, fourth) => `${century}${third}&${fourth}`,
    (century, third, fourth) => `${century}${third}>${fourth}`,
    (_century, third, fourth) => `20 ${third}${fourth}`,
    (century, third, fourth) => `${century}${third}\u200b${fourth}`,
    (century, third, fourth) => `${century}${third}\u00ad${fourth}`,
  ];
  return value.replace(/(19|20)(\d)(\d)/, (_match, century, third, fourth) => {
    const variant = choose(random, variants);
    const corrupted = variant(century, third, fourth);
    return century === "19" && corrupted.startsWith("20")
      ? `19${corrupted.slice(2)}`
      : corrupted;
  });
}

function segmentIdentifier(value) {
  const prefix = /^([A-Z]{2,})(?=[./_-])/.exec(value)?.[1];
  if (!prefix) return insertBeforeLastDigits(value, "!\n", 2);
  const index = Math.max(1, prefix.length - 1);
  return `${prefix.slice(0, index)}!\n${value.slice(index)}`;
}

function isNameEntity(entityType) {
  return entityType === "PERSON" || entityType === "PROVIDER";
}

function corruptIdentifier(identifier, profile, random) {
  const { entity_type: entityType, kind, value } = identifier;
  if (profile === "baseline") return value;

  if (profile === "segmentation") {
    if (isNameEntity(entityType)) {
      return insertInsideFirstWord(value, choose(random, ["\u200b", "\u00ad", "!", "%"]));
    }
    if (entityType === "DATE") return segmentYear(value, random);
    if (kind === "npi") return value.replace(/^(\d{3})(\d{5})(\d{2})$/, "$1%$2<>$3");
    if (entityType === "PHONE_NUMBER") {
      return value.replace(/^(\d{3})-(\d)(\d{2})-(\d{4})$/, "$1-$2>$3-$4");
    }
    if (/_(?:ID|NUMBER)$/.test(entityType) || entityType === "UNIQUE_ID") {
      return segmentIdentifier(value);
    }
    if (entityType === "ZIP_CODE") {
      return insertBeforeLastDigits(value, choose(random, ["%", "\u200b", "\u00ad"]));
    }
    if (entityType === "EMAIL_ADDRESS") {
      return value.replace("@", " \u200b@\n").replace(".", "\u00ad.");
    }
    if (entityType === "LOCATION") {
      return insertInsideFirstWord(value, choose(random, ["\u200b", "\u00ad", "!", "%"]));
    }
    if (entityType === "ADDRESS") {
      return value
        .replace(/(\d{4})(\d)(?!.*\d)/, "$1\u200b$2")
        .replace(/,\s+/, ",\n");
    }
    return value;
  }

  if (profile === "ocr") {
    if (isNameEntity(entityType)) return replaceFirstConfusable(value, random);
    if (entityType === "DATE") {
      return value.replace(/(19|20)(\d{2})/, (_match, century, year) => `${century}>${year}`);
    }
    if (entityType === "ZIP_CODE") return insertBeforeLastDigits(value, "/");
    if (kind === "npi") return insertBeforeLastDigits(value, "<>", 2);
    if (/_(?:ID|NUMBER)$/.test(entityType) || entityType === "UNIQUE_ID") {
      return value.replace(/([A-Z])-(?=[A-Z0-9])/, "$1/");
    }
    if (entityType === "PHONE_NUMBER") return value.replaceAll("-", ".");
    return value;
  }

  if (profile === "layout") {
    if (isNameEntity(entityType) || entityType === "LOCATION") {
      return value.replace(/\s+/, "\n");
    }
    if (entityType === "DATE") return value.replace(/([./-])/, "\n$1");
    if (entityType === "ZIP_CODE") return insertBeforeLastDigits(value, "/");
    if (kind === "npi") return insertBeforeLastDigits(value, "<>", 2);
    if (entityType === "PHONE_NUMBER") return value.replace(/([.-])/, "$1\n");
    if (/_(?:ID|NUMBER)$/.test(entityType) || entityType === "UNIQUE_ID") {
      return value.replace(/([./_-])/, "$1\n");
    }
    if (entityType === "ADDRESS") return value.replace(/,\s+/, ",\n");
    return value;
  }

  if (isNameEntity(entityType)) {
    const prefixMatch = /^(?:(?:Dr\.?|Doctor|Provider|Physician)\s+)/.exec(value);
    const prefix = prefixMatch?.[0] ?? "";
    const words = value.slice(prefix.length).split(" ");
    const first = words[0];
    const index = Math.max(1, Math.floor(first.length / 2));
    words[0] = `${first.slice(0, index)}${choose(random, ["/", "-", "’"])}${first.slice(index)}`;
    return prefix + words.join(" ");
  }
  if (entityType === "DATE") {
    return value.replace(/[./-]/g, () => choose(random, ["....", "__", "<>-", "/./"]));
  }
  if (entityType === "ZIP_CODE") return insertBeforeLastDigits(value, "....{");
  if (kind === "npi") return insertBeforeLastDigits(value, "{{}}", 2);
  if (entityType === "PHONE_NUMBER") return value.replaceAll("-", " - ");
  if (/_(?:ID|NUMBER)$/.test(entityType) || entityType === "UNIQUE_ID") {
    return value.replace(/([./_-])/, `${choose(random, ["{{", "//", "]]", ".."])}$1`);
  }
  if (entityType === "ADDRESS") return value.replace(/,\s+/, ",//");
  return value;
}

function mutateLabels(text, profile, random) {
  if (profile === "ocr") {
    return text
      .replaceAll("Patient Name", "PATlENT N4ME")
      .replaceAll("Patient", "Pat1ent")
      .replaceAll("DOB", "D0B")
      .replaceAll("Address", "H0ME")
      .replaceAll("Medical Record", "MEDlCAL REC0RD");
  }
  if (profile === "layout") {
    return text.replace(/ {2,}/g, "\n").replaceAll("  ", "\n");
  }
  if (profile === "noisy-emr") {
    return text
      .replace(/:\s*/g, () => choose(random, [":: ", ":{{ ", "--- ", ":.. "]))
      .replace(/\n(?=[A-Z][A-Z ]+\n|[A-Z][A-Za-z ]+:)/g, " | ");
  }
  if (profile === "segmentation") {
    return text.replaceAll("  ", " | ");
  }
  return text;
}

function meaningfulParts(identifier, mutatedValue) {
  const entityType = identifier.entity_type;
  if (isNameEntity(entityType)) {
    return mutatedValue.split(/\s+/).filter((part) => {
      const normalized = part.replace(/\W/g, "").toUpperCase();
      return normalized.length >= 3 && !GENERIC_PERSON_PARTS.has(normalized);
    });
  }
  if (entityType === "LOCATION") {
    return mutatedValue
      .split(/\s+/)
      .filter(
        (part) =>
          part.replace(/\W/g, "").length >= 4 &&
          !GENERIC_LOCATION_WORDS.has(part.replace(/\W/g, "").toUpperCase()),
      );
  }
  if (entityType === "ADDRESS") {
    return mutatedValue
      .split(/[\s,]+/)
      .filter((part) => /Fictional|Placeholder/i.test(part) || /^\d{5}$/.test(part));
  }
  if (entityType === "PHONE_NUMBER") {
    const digits = mutatedValue.replace(/\D/g, "");
    return digits.length >= 4 ? [digits.slice(-4)] : [];
  }
  if (entityType === "ZIP_CODE") {
    const parts = mutatedValue.split(/\D+/).filter((part) => part.length >= 3);
    return parts;
  }
  if (entityType.includes("ID") || entityType.includes("NUMBER")) {
    return mutatedValue.split(/[^A-Za-z0-9]+/).filter((part) => {
      const normalized = part.toUpperCase();
      return (
        (/^\d+$/.test(part) && part.length >= 4) ||
        (part.length >= 4 && !GENERIC_ID_PARTS.has(normalized))
      );
    });
  }
  return [];
}

function expandSeed(seed, profile) {
  const random = mulberry32(stringSeed(`${seed.id}:${profile}:med-data-cleaner`));
  let text = seed.text;
  const mustRemove = [];
  const placeholderTypes = new Set();

  for (const identifier of seed.identifiers) {
    const mutatedValue = corruptIdentifier(identifier, profile, random);
    text = text.replaceAll(identifier.token, mutatedValue);
    mustRemove.push(mutatedValue, ...meaningfulParts(identifier, mutatedValue));
    placeholderTypes.add(identifier.entity_type);
  }
  text = mutateLabels(text, profile, random);
  const structuralTerms = STRUCTURAL_TERMS.filter((term) => text.includes(term));

  return {
    id: `generated-${seed.id}-${profile}`,
    source: "generated-general-medical",
    specialty: seed.specialty,
    profile,
    text,
    must_remove: [...new Set(mustRemove)].filter(Boolean),
    must_preserve: [...new Set([...seed.must_preserve, ...structuralTerms])],
    placeholder_types: [...placeholderTypes],
  };
}

export async function generateGeneralMedicalCases() {
  const fixtureUrl = new URL("./general-medical-seeds.json", import.meta.url);
  const seeds = JSON.parse(await readFile(fixtureUrl, "utf8"));
  return seeds.flatMap((seed) => PROFILES.map((profile) => expandSeed(seed, profile)));
}

export { PROFILES };
