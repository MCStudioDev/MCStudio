import { OFFLINE_INGREDIENT_ALIASES } from "@/data/offline/aliases";
import { OFFLINE_INGREDIENT_TAXONOMY } from "@/data/offline/ingredientTaxonomy";
import { FOOD_DICTIONARY } from "@/food/FoodDictionary";
import { expandIngredientFamilies } from "@/lib/ingredientFamilies";

export interface IngredientProfile {
  id: string;
  canonicalEnglishName: string;
  canonicalArabicName: string;
  aliases: string[];
  synonyms: string[];
  pluralForms: string[];
  ocrMistakes: string[];
  spellingMistakes: string[];
  category?: string;
}

type IngredientProfileInput =
  Omit<IngredientProfile, "synonyms" | "pluralForms" | "ocrMistakes" | "spellingMistakes"> &
  Partial<Pick<IngredientProfile, "synonyms" | "pluralForms" | "ocrMistakes" | "spellingMistakes">>;

export interface WeightedIngredientAlias {
  ingredientId: string;
  term: string;
  weight: number;
}

export interface NormalizedIngredient {
  raw: string;
  id: string;
  normalized: string;
  canonicalEnglishName: string;
  canonicalArabicName: string;
  aliases: WeightedIngredientAlias[];
  category?: string;
}

export interface IngredientSearchPlan {
  normalized: NormalizedIngredient[];
  ingredientIds: string[];
  canonicalEnglishNames: string[];
  aliases: WeightedIngredientAlias[];
  searchTerms: string[];
}

const HIGH_FREQUENCY_PROFILES: IngredientProfile[] = FOOD_DICTIONARY.ingredients.map(profile);

const PROFILE_BY_ID = new Map<string, IngredientProfile>();
const PROFILE_BY_ALIAS = new Map<string, IngredientProfile>();

for (const ingredient of [...HIGH_FREQUENCY_PROFILES, ...buildProfilesFromTaxonomy()]) {
  if (!PROFILE_BY_ID.has(ingredient.id)) {
    PROFILE_BY_ID.set(ingredient.id, ingredient);
  } else {
    const existing = PROFILE_BY_ID.get(ingredient.id);
    if (existing) PROFILE_BY_ID.set(ingredient.id, mergeProfiles(existing, ingredient));
  }
}

for (const profile of PROFILE_BY_ID.values()) {
  for (const alias of getProfileTerms(profile)) {
    const key = normalizeIngredientText(alias);
    if (!PROFILE_BY_ALIAS.has(key)) PROFILE_BY_ALIAS.set(key, profile);
  }
}

export class IngredientNormalizer {
  normalize(ingredients: string[]): NormalizedIngredient[] {
    return ingredients
      .map((raw) => this.normalizeOne(raw))
      .filter((ingredient): ingredient is NormalizedIngredient => Boolean(ingredient));
  }

  normalizeOne(raw: string): NormalizedIngredient | null {
    const normalizedText = normalizeIngredientText(raw);
    if (!normalizedText) return null;

    const profile = findProfile(normalizedText);
    if (!profile) {
      const fallbackId = toIngredientId(normalizedText);
      return {
        raw,
        id: fallbackId,
        normalized: fallbackId,
        canonicalEnglishName: normalizedText,
        canonicalArabicName: normalizedText,
        aliases: [{
          ingredientId: fallbackId,
          term: normalizedText,
          weight: 100
        }]
      };
    }

    return {
      raw,
      id: profile.id,
      normalized: profile.id,
      canonicalEnglishName: profile.canonicalEnglishName,
      canonicalArabicName: profile.canonicalArabicName,
      aliases: this.expandAliasesForProfile(profile),
      category: profile.category
    };
  }

  expand(ingredients: string[]) {
    return this.buildSearchPlan(ingredients).searchTerms;
  }

  expandAliases(ingredients: string[]): WeightedIngredientAlias[] {
    return this.buildSearchPlan(ingredients).aliases;
  }

  buildSearchPlan(ingredients: string[]): IngredientSearchPlan {
    const normalized = this.normalize(ingredients);
    const aliasesByTerm = new Map<string, WeightedIngredientAlias>();

    for (const ingredient of normalized) {
      for (const alias of ingredient.aliases) {
        const current = aliasesByTerm.get(alias.term);
        if (!current || alias.weight > current.weight) aliasesByTerm.set(alias.term, alias);
      }
    }

    const aliases = Array.from(aliasesByTerm.values())
      .sort((left, right) => right.weight - left.weight || left.term.localeCompare(right.term));
    const canonicalEnglishNames = Array.from(new Set(normalized.map((ingredient) => ingredient.canonicalEnglishName)));
    const ingredientIds = Array.from(new Set(normalized.map((ingredient) => ingredient.id)));

    return {
      normalized,
      ingredientIds,
      canonicalEnglishNames,
      aliases,
      searchTerms: Array.from(new Set([
        ...canonicalEnglishNames,
        ...ingredientIds.map((id) => id.replace(/_/g, " ")),
        ...aliases.map((alias) => alias.term),
        ...expandIngredientFamilies([...canonicalEnglishNames, ...aliases.map((alias) => alias.term)])
      ])).filter(Boolean)
    };
  }

  expandAliasesForProfile(profile: IngredientProfile): WeightedIngredientAlias[] {
    const weighted = new Map<string, WeightedIngredientAlias>();
    const addTerms = (terms: string[], startWeight: number, step = 2) => {
      terms.forEach((term, index) => {
        const normalizedTerm = normalizeIngredientText(term);
        if (!normalizedTerm) return;
        const alias = {
          ingredientId: profile.id,
          term: normalizedTerm,
          weight: Math.max(70, startWeight - index * step)
        };
        const current = weighted.get(normalizedTerm);
        if (!current || alias.weight > current.weight) weighted.set(normalizedTerm, alias);
      });
    };

    addTerms([profile.canonicalEnglishName], 100, 0);
    addTerms(profile.aliases, 98);
    addTerms(profile.synonyms, 94);
    addTerms(profile.pluralForms, 92);
    addTerms(profile.ocrMistakes, 88);
    addTerms(profile.spellingMistakes, 86);
    addTerms([profile.canonicalArabicName], 98, 0);

    return Array.from(weighted.values())
      .sort((left, right) => right.weight - left.weight || left.term.localeCompare(right.term));
  }

  resolve(value: string): IngredientProfile | null {
    return findProfile(normalizeIngredientText(value));
  }
}

export function getIngredientProfileById(id: string) {
  return PROFILE_BY_ID.get(id) ?? null;
}

export function getIngredientProfileForTerm(value: string) {
  return findProfile(normalizeIngredientText(value));
}

export function getIngredientProfileForExactTerm(value: string) {
  return PROFILE_BY_ALIAS.get(normalizeIngredientText(value)) ?? null;
}

export function normalizeIngredientText(value: string) {
  const normalized = value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[\u0622\u0623\u0625]/g, "\u0627")
    .replace(/\u0649/g, "\u064a")
    .replace(/\u0629/g, "\u0647")
    .replace(/[_-]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized
    .replace(/\bbreasts\b/g, "breast")
    .replace(/\bthighs\b/g, "thigh")
    .replace(/\btomatoes\b/g, "tomato")
    .replace(/\bpotatoes\b/g, "potato")
    .replace(/\beggs\b/g, "egg")
    .replace(/\bonions\b/g, "onion")
    .replace(/\bpeppers\b/g, "pepper")
    .replace(/\s+/g, " ")
    .trim();
}

function profile(input: IngredientProfileInput): IngredientProfile {
  return {
    ...input,
    aliases: dedupe(input.aliases),
    synonyms: dedupe(input.synonyms ?? []),
    pluralForms: dedupe(input.pluralForms ?? []),
    ocrMistakes: dedupe(input.ocrMistakes ?? []),
    spellingMistakes: dedupe(input.spellingMistakes ?? [])
  };
}

function buildProfilesFromTaxonomy(): IngredientProfile[] {
  const customIds = new Set(HIGH_FREQUENCY_PROFILES.map((item) => item.id));
  const taxonomyProfiles = OFFLINE_INGREDIENT_TAXONOMY.map((ingredient) => {
    const englishVariants = ingredient.variants
      .filter((variant) => variant.locale === "en")
      .flatMap((variant) => variant.values);
    const arabicVariants = ingredient.variants
      .filter((variant) => variant.locale === "ar")
      .flatMap((variant) => variant.values);

    return profile({
      id: toIngredientId(ingredient.canonical),
      canonicalEnglishName: normalizeIngredientText(ingredient.canonical),
      canonicalArabicName: arabicVariants[0] ?? normalizeIngredientText(ingredient.canonical),
      aliases: [...englishVariants, ...arabicVariants],
      synonyms: [],
      pluralForms: [],
      ocrMistakes: [],
      spellingMistakes: ingredient.misspellings ?? [],
      category: ingredient.category
    });
  });
  const aliasProfiles = OFFLINE_INGREDIENT_ALIASES.map((alias) =>
    profile({
      id: toIngredientId(alias.canonical),
      canonicalEnglishName: normalizeIngredientText(alias.canonical),
      canonicalArabicName: alias.synonyms.find((value) => /[\u0600-\u06ff]/.test(value)) ?? normalizeIngredientText(alias.canonical),
      aliases: [alias.raw, alias.canonical, ...alias.synonyms],
      synonyms: alias.synonyms,
      pluralForms: [],
      ocrMistakes: [],
      spellingMistakes: alias.misspellings,
      category: alias.category
    })
  );

  return [...taxonomyProfiles, ...aliasProfiles].filter((item) => !customIds.has(item.id));
}

function findProfile(normalizedText: string) {
  const direct = PROFILE_BY_ALIAS.get(normalizedText);
  if (direct) return direct;

  const familyExpanded = expandIngredientFamilies([normalizedText]);
  for (const candidate of familyExpanded) {
    const profile = PROFILE_BY_ALIAS.get(normalizeIngredientText(candidate));
    if (profile) return profile;
  }

  for (const [alias, profile] of PROFILE_BY_ALIAS.entries()) {
    if (alias.length < 4) continue;
    if (normalizedText.includes(alias) || alias.includes(normalizedText)) {
      return profile;
    }
  }

  return null;
}

function getProfileTerms(profile: IngredientProfile) {
  return dedupe([
    profile.id,
    profile.id.replace(/_/g, " "),
    profile.canonicalEnglishName,
    profile.canonicalArabicName,
    ...profile.aliases,
    ...profile.synonyms,
    ...profile.pluralForms,
    ...profile.ocrMistakes,
    ...profile.spellingMistakes
  ]);
}

function mergeProfiles(left: IngredientProfile, right: IngredientProfile): IngredientProfile {
  return profile({
    ...left,
    aliases: [...left.aliases, ...right.aliases],
    synonyms: [...left.synonyms, ...right.synonyms],
    pluralForms: [...left.pluralForms, ...right.pluralForms],
    ocrMistakes: [...left.ocrMistakes, ...right.ocrMistakes],
    spellingMistakes: [...left.spellingMistakes, ...right.spellingMistakes],
    category: left.category ?? right.category
  });
}

function toIngredientId(value: string) {
  return normalizeIngredientText(value).replace(/\s+/g, "_");
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map(normalizeIngredientText).filter(Boolean)));
}
