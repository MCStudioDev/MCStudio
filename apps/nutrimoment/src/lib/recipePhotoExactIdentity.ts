import { translateCuisineToEnglish, translateRecipeTitleToEnglish } from "@/lib/arabicRecipeLocalization";

export interface RecipePhotoExactIdentityInput {
  cuisine?: string;
  names: Array<string | undefined | null>;
}

const GENERIC_EXACT_NAME_PATTERNS = [
  /^(food|meal|dish|recipe|plate)$/i,
  /^(prepared|plated|assembled|traditional|generic)\s+(food|meal|dish|plate)$/i,
  /^(food|meal|dish|recipe|plate)\s+(prepared|plated|assembled)$/i,
  /^(breakfast|lunch|dinner|snack)$/i,
  /^(chicken|beef|meat|lamb|fish|shrimp|rice|pasta|bread|egg|eggs|vegetables?)$/i,
  /^(chicken|beef|meat|lamb|fish|shrimp|rice|pasta|bread)\s+(plate|meal|dish|food|dinner)$/i,
  /^(egyptian|turkish|italian|american|asian|mediterranean|middle eastern|indian|mexican)$/i
];

const QUERY_NOISE = /\b(prepared food|food plated|prepared|assembled|recipe|dish|meal|food|plate)\b/gi;

export function buildRecipePhotoExactAliases(input: RecipePhotoExactIdentityInput) {
  const cuisineKey = normalizeExactRecipePhotoName(
    input.cuisine && translateCuisineToEnglish(input.cuisine),
    "latin"
  );
  const aliases: string[] = [];

  for (const rawName of input.names) {
    const cleanedName = cleanExactRecipePhotoName(rawName);
    if (!isStrongExactRecipePhotoName(cleanedName)) continue;

    if (containsArabic(cleanedName)) {
      const arabicKey = normalizeExactRecipePhotoName(cleanedName, "arabic");
      if (arabicKey) aliases.push(`exact:ar:${arabicKey}`);

      const translatedName = cleanExactRecipePhotoName(translateRecipeTitleToEnglish(cleanedName));
      const englishKey = normalizeExactRecipePhotoName(translatedName, "latin");
      if (
        isStrongExactRecipePhotoName(translatedName) &&
        englishKey &&
        containsLatin(translatedName) &&
        !containsArabic(translatedName)
      ) {
        aliases.push(`exact:en:${englishKey}`);
        if (cuisineKey) aliases.push(`exact:cuisine:${cuisineKey}:${englishKey}`);
      }

      continue;
    }

    const englishKey = normalizeExactRecipePhotoName(cleanedName, "latin");
    if (!englishKey) continue;
    aliases.push(`exact:en:${englishKey}`);
    if (cuisineKey) aliases.push(`exact:cuisine:${cuisineKey}:${englishKey}`);
  }

  return Array.from(new Set(aliases)).slice(0, 16);
}

export function normalizeExactRecipePhotoHints(values: string[]) {
  return Array.from(
    new Set(
      values
        .map(cleanExactRecipePhotoName)
        .filter(isStrongExactRecipePhotoName)
    )
  ).slice(0, 12);
}

function cleanExactRecipePhotoName(value?: string | null) {
  return (value ?? "")
    .replace(QUERY_NOISE, " ")
    .replace(/[()[\]"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isStrongExactRecipePhotoName(value: string) {
  if (!value) return false;
  const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();
  if (normalized.length < 3) return false;
  if (GENERIC_EXACT_NAME_PATTERNS.some((pattern) => pattern.test(normalized))) return false;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 1 && normalized.length < 5 && !containsArabic(value)) return false;

  return true;
}

function normalizeExactRecipePhotoName(value?: string, script: "arabic" | "latin" = "latin") {
  const cleaned = cleanExactRecipePhotoName(value).toLowerCase();
  if (!cleaned) return "";

  const normalized = cleaned
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(script === "arabic" ? /[^\p{Script=Arabic}\p{N}]+/gu : /[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return normalized;
}

function containsArabic(value: string) {
  return /[\u0600-\u06FF]/.test(value);
}

function containsLatin(value: string) {
  return /[a-z]/i.test(value);
}
