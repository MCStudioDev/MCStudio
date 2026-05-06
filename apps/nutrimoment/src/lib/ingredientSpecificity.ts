export type IngredientForm = "ground" | "organ" | "whole" | "cut" | "generic";

export interface IngredientSpecificityProfile {
  family: string;
  form: IngredientForm;
  normalized: string;
}

const ARABIC_GROUND_MEAT_PATTERNS = [
  /\u0644\u062d\u0645(?:[\u0629\u0647])?\s+\u0645\u0641\u0631\u0648\u0645(?:[\u0629\u0647])?/u,
  /\u0627\u0644\u0644\u062d\u0645(?:[\u0629\u0647])?\s+\u0627\u0644\u0645\u0641\u0631\u0648\u0645(?:[\u0629\u0647])?/u,
  /\u0644\u062d\u0645(?:[\u0629\u0647])?\s+\u0645\u0641\u0631\u0648\u0645(?:[\u0629\u0647])?\s+\u0628\u0642\u0631\u064a/u
];

const ARABIC_LIVER_PATTERNS = [
  /\u0643\u0628\u062f\u0629/u,
  /\u0643\u0628\u062f\u0647/u,
  /\u0643\u0628\u062f/u
];

const GROUND_MEAT_PATTERNS = [
  /\bground\s+(?:beef|meat|lamb|turkey|chicken)\b/i,
  /\bminced\s+(?:beef|meat|lamb|turkey|chicken)\b/i,
  /\b(?:beef|lamb|turkey|chicken)\s+mince\b/i,
  /\bmince(?:d)?\s+meat\b/i
];

const LIVER_PATTERNS = [
  /\bliver\b/i,
  /\bbeef\s+liver\b/i,
  /\bchicken\s+liver\b/i,
  /\bkebda\b/i,
  /\bkibda\b/i,
  /\bciger(?:i)?\b/i
];

const CUT_MEAT_PATTERNS = [
  /\b(?:beef|lamb|chicken|meat)\s+(?:cubes|chunks|strips|slices|steak|stew)\b/i,
  /\b(?:cubed|chunked|sliced|stew)\s+(?:beef|lamb|chicken|meat)\b/i
];

const GENERIC_MEAT_FAMILIES = new Set(["beef", "meat", "lamb", "chicken", "turkey"]);
const GROUND_MEAT_FAMILIES = new Set(["ground beef", "ground meat", "minced beef", "minced meat", "beef mince", "lamb mince"]);
const ORGAN_MEAT_FAMILIES = new Set(["liver", "beef liver", "chicken liver"]);

export function normalizeSpecificIngredientName(value: string) {
  const normalized = normalizeIngredientSpecificityText(value);
  if (!normalized) return "";

  if (ARABIC_LIVER_PATTERNS.some((pattern) => pattern.test(value)) || LIVER_PATTERNS.some((pattern) => pattern.test(normalized))) {
    if (/\u062f\u062c\u0627\u062c|\u0641\u0631\u0627\u062e/u.test(value)) return "chicken liver";
    if (/\u0628\u0642\u0631\u064a|\u0639\u062c\u0644/u.test(value)) return "beef liver";
    if (/\bchicken\b/i.test(normalized)) return "chicken liver";
    if (/\bbeef\b/i.test(normalized)) return "beef liver";
    return "liver";
  }

  if (ARABIC_GROUND_MEAT_PATTERNS.some((pattern) => pattern.test(value)) || GROUND_MEAT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    if (/\b(chicken|turkey)\b/i.test(normalized)) return "ground chicken";
    if (/\blamb\b/i.test(normalized)) return "ground lamb";
    return "ground beef";
  }

  if (/\bground\s+meat\b|\bminced\s+meat\b|\bmince\s+meat\b/i.test(normalized)) {
    return "ground meat";
  }

  return normalized;
}

export function getIngredientSpecificityProfile(value: string): IngredientSpecificityProfile {
  const normalized = normalizeSpecificIngredientName(value);

  if (isGroundMeatIngredient(normalized)) {
    return {
      family: getGroundMeatFamily(normalized),
      form: "ground",
      normalized
    };
  }

  if (isOrganMeatIngredient(normalized)) {
    return {
      family: getOrganMeatFamily(normalized),
      form: "organ",
      normalized
    };
  }

  if (CUT_MEAT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      family: getGenericMeatFamily(normalized),
      form: "cut",
      normalized
    };
  }

  return {
    family: getGenericMeatFamily(normalized),
    form: "generic",
    normalized
  };
}

export function canAvailableIngredientSatisfyRecipeIngredient(recipeIngredient: string, availableIngredient: string) {
  const required = getIngredientSpecificityProfile(recipeIngredient);
  const available = getIngredientSpecificityProfile(availableIngredient);
  if (!required.normalized || !available.normalized) return false;

  if (required.normalized === available.normalized) return true;

  if (required.form === "ground") {
    if (available.form !== "ground") return false;
    if (required.family === "meat") return isMeatFamily(available.family);
    return required.family === available.family || available.family === "meat";
  }

  if (required.form === "organ") {
    if (available.form !== "organ") return false;
    if (required.family === "liver") return available.family === "liver" || available.family.endsWith(" liver");
    return required.family === available.family || available.family === "liver";
  }

  if (available.form === "organ" && isGenericMeatRequirement(required)) {
    return false;
  }

  if (available.form === "ground" && isGenericMeatRequirement(required)) {
    return false;
  }

  if (required.form === "cut" && available.form !== "cut") {
    return false;
  }

  return isLooseIngredientTextMatch(required.normalized, available.normalized);
}

export function isGroundMeatIngredient(value: string) {
  const normalized = normalizeIngredientSpecificityText(value);
  return GROUND_MEAT_FAMILIES.has(normalized) || GROUND_MEAT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isOrganMeatIngredient(value: string) {
  const normalized = normalizeIngredientSpecificityText(value);
  return ORGAN_MEAT_FAMILIES.has(normalized) || LIVER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isLooseIngredientTextMatch(required: string, available: string) {
  return (
    (required.length >= 4 && available.includes(required)) ||
    (available.length >= 4 && required.includes(available))
  );
}

function isGenericMeatRequirement(profile: IngredientSpecificityProfile) {
  return profile.form === "generic" && GENERIC_MEAT_FAMILIES.has(profile.normalized);
}

function getGroundMeatFamily(value: string) {
  if (/\bchicken\b/i.test(value)) return "chicken";
  if (/\bturkey\b/i.test(value)) return "turkey";
  if (/\blamb\b/i.test(value)) return "lamb";
  if (/\bbeef\b/i.test(value)) return "beef";
  return "meat";
}

function getOrganMeatFamily(value: string) {
  if (/\bchicken\b/i.test(value)) return "chicken liver";
  if (/\bbeef\b/i.test(value)) return "beef liver";
  return "liver";
}

function getGenericMeatFamily(value: string) {
  if (/\bchicken\b/i.test(value)) return "chicken";
  if (/\bturkey\b/i.test(value)) return "turkey";
  if (/\blamb\b/i.test(value)) return "lamb";
  if (/\bbeef\b/i.test(value)) return "beef";
  if (/\bmeat\b/i.test(value)) return "meat";
  return value;
}

function isMeatFamily(value: string) {
  return GENERIC_MEAT_FAMILIES.has(value);
}

function normalizeIngredientSpecificityText(value: string) {
  return value
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
