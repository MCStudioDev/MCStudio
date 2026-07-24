import { FOOD_DICTIONARY, normalizeDictionaryLookupKey, type FoodDictionaryTerm } from "@/food/FoodDictionary";
import type { LocalizedRecipeVariant, Recipe } from "@/lib/types";

export type LocalizationLanguage = "en" | "ar";
export type LocalizationDictionaryKind = "ingredient" | "dish" | "verb" | "unit" | "equipment" | "cuisine";

export interface CanonicalIngredientTerm {
  id: string;
  englishName: string;
  arabicName: string;
  aliases: string[];
  singularForms: string[];
  pluralForms: string[];
  category?: string;
}

export interface CanonicalDishTerm {
  id: string;
  englishTitle: string;
  arabicTitle: string;
  cuisine: string;
  aliases: string[];
  transliterationAllowed: boolean;
}

export interface CanonicalTerm {
  id: string;
  kind: LocalizationDictionaryKind;
  english: string;
  arabic: string;
  aliases: string[];
}

export interface ArabicValidationIssue {
  field: string;
  value: string;
  term: string;
  approvedArabic: string;
  kind: LocalizationDictionaryKind;
}

export interface ArabicValidationResult {
  valid: boolean;
  issues: ArabicValidationIssue[];
}

interface TermEntry {
  kind: LocalizationDictionaryKind;
  id: string;
  english: string;
  arabic: string;
  aliases: string[];
}

const TRANSLITERATION_ALLOWED_DISH_IDS = new Set([
  "adana-kebab",
  "biryani",
  "butter-chicken",
  "chicken-tikka-masala",
  "hyderabadi-biryani",
  "manti",
  "pad-krapow-gai",
  "paella-valenciana",
  "palak-paneer",
  "tavuk-sote"
]);

export class LocalizationService {
  private readonly termEntries: TermEntry[];
  private readonly englishLookup = new Map<string, TermEntry>();
  private readonly arabicLookup = new Map<string, TermEntry>();

  constructor() {
    this.termEntries = [
      ...this.buildIngredientEntries(),
      ...this.buildTermEntries("dish", FOOD_DICTIONARY.dishNames, (term) => ({
        id: slugify(term.en),
        english: term.en,
        arabic: term.ar,
        aliases: term.aliases ?? []
      })),
      ...this.buildTermEntries("verb", FOOD_DICTIONARY.cookingVerbs),
      ...this.buildTermEntries("unit", FOOD_DICTIONARY.units),
      ...this.buildTermEntries("equipment", FOOD_DICTIONARY.kitchenTools),
      ...this.buildTermEntries("cuisine", FOOD_DICTIONARY.cuisines)
    ];

    for (const entry of this.termEntries) {
      this.indexEnglish(entry.english, entry);
      this.indexArabic(entry.arabic, entry);
      entry.aliases.forEach((alias) => {
        if (containsArabic(alias)) {
          this.indexArabic(alias, entry);
        } else {
          this.indexEnglish(alias, entry);
        }
      });
    }
  }

  getIngredientDictionary(): CanonicalIngredientTerm[] {
    return FOOD_DICTIONARY.ingredients.map((ingredient) => ({
      id: ingredient.id,
      englishName: ingredient.canonicalEnglishName,
      arabicName: ingredient.canonicalArabicName,
      aliases: ingredient.aliases,
      singularForms: [ingredient.canonicalEnglishName],
      pluralForms: ingredient.pluralForms,
      category: ingredient.category
    }));
  }

  getDishDictionary(): CanonicalDishTerm[] {
    return FOOD_DICTIONARY.dishNames.map((dish) => {
      const id = slugify(dish.en);
      return {
        id,
        englishTitle: dish.en,
        arabicTitle: dish.ar,
        cuisine: inferDishCuisine(dish.en),
        aliases: dish.aliases ?? [],
        transliterationAllowed: TRANSLITERATION_ALLOWED_DISH_IDS.has(id)
      };
    });
  }

  getCookingVerbDictionary() {
    return this.getTermsByKind("verb");
  }

  getMeasurementDictionary() {
    return this.getTermsByKind("unit");
  }

  getKitchenEquipmentDictionary() {
    return this.getTermsByKind("equipment");
  }

  normalizeIngredient(value: string, language: LocalizationLanguage) {
    return this.normalizeCulinaryText(value, language, ["ingredient", "unit"]);
  }

  normalizeDishTitle(value: string, language: LocalizationLanguage) {
    return this.normalizeCulinaryText(value, language, ["dish", "ingredient", "cuisine"]);
  }

  normalizeCookingStep(value: string, language: LocalizationLanguage) {
    return this.normalizeCulinaryText(value, language, ["dish", "ingredient", "verb", "unit", "equipment", "cuisine"]);
  }

  normalizeCulinaryText(
    value: string,
    language: LocalizationLanguage,
    kinds: LocalizationDictionaryKind[] = ["dish", "ingredient", "verb", "unit", "equipment", "cuisine"]
  ) {
    const exactTerm = this.findExactTerm(value, kinds);
    if (exactTerm) {
      return language === "ar" ? exactTerm.arabic : exactTerm.english;
    }

    const target = language === "ar" ? "arabic" : "english";
    const replacements = this.termEntries
      .filter((entry) => kinds.includes(entry.kind))
      .flatMap((entry) => {
        const replacement = target === "arabic" ? entry.arabic : entry.english;
        return [entry.english, entry.arabic, ...entry.aliases].map((source) => ({ source, replacement }));
      })
      .filter((entry) => entry.source.trim() && entry.source !== entry.replacement)
      .filter((entry) => !isSelfExpandingArabicReplacement(entry.source, entry.replacement, language))
      .sort((left, right) => right.source.length - left.source.length);

    let normalized = value.trim();
    for (const entry of replacements) {
      normalized = replaceKnownTerm(normalized, entry.source, entry.replacement);
    }

    return normalizeSpacing(normalized, language);
  }

  normalizeRecipe(recipe: Recipe, language: LocalizationLanguage): Recipe {
    const normalized: Recipe = {
      ...recipe,
      name: this.normalizeDishTitle(recipe.name, language),
      cuisine: this.normalizeCulinaryText(recipe.cuisine, language, ["cuisine"]),
      ingredients: recipe.ingredients.map((ingredient) => this.normalizeIngredient(ingredient, language)).filter(Boolean),
      missing_ingredients: recipe.missing_ingredients.map((ingredient) => this.normalizeIngredient(ingredient, language)).filter(Boolean),
      steps: recipe.steps.map((step) => this.normalizeCookingStep(step, language)).filter(Boolean),
      cook_time: this.normalizeCookTime(recipe.cook_time, language),
      difficulty: this.normalizeDifficulty(recipe.difficulty, language),
      preference_hits: recipe.preference_hits?.map((hit) => this.normalizeCulinaryText(hit, language)) ?? recipe.preference_hits,
      localized: this.normalizeLocalizedVariants(recipe.localized)
    };

    if (normalized.dish_intent) {
      normalized.dish_intent = {
        ...normalized.dish_intent,
        dish_name: this.normalizeDishTitle(normalized.dish_intent.dish_name, language),
        cuisine: this.normalizeCulinaryText(normalized.dish_intent.cuisine, language, ["cuisine"]),
        cooking_method: normalized.dish_intent.cooking_method
          ? this.normalizeCulinaryText(normalized.dish_intent.cooking_method, language, ["verb"])
          : normalized.dish_intent.cooking_method
      };
    }

    return normalized;
  }

  validateArabicRecipe(recipe: Recipe): ArabicValidationResult {
    const fields: Array<[string, string]> = [
      ["name", recipe.name],
      ["cuisine", recipe.cuisine],
      ...recipe.ingredients.map((value, index) => [`ingredients.${index}`, value] as [string, string]),
      ...recipe.missing_ingredients.map((value, index) => [`missing_ingredients.${index}`, value] as [string, string]),
      ...recipe.steps.map((value, index) => [`steps.${index}`, value] as [string, string]),
      ["cook_time", recipe.cook_time],
      ["difficulty", recipe.difficulty],
      ...(recipe.preference_hits ?? []).map((value, index) => [`preference_hits.${index}`, value] as [string, string])
    ];

    const issues = fields.flatMap(([field, value]) => this.validateArabicText(value, field).issues);
    return { valid: issues.length === 0, issues };
  }

  validateArabicText(value: string, field = "text"): ArabicValidationResult {
    if (!value || !containsLatin(value)) return { valid: true, issues: [] };

    const issues: ArabicValidationIssue[] = [];
    const validationTerms = this.termEntries
      .flatMap((entry) =>
        [entry.english, ...entry.aliases]
          .filter((term) => term && !containsArabic(term))
          .map((term) => ({ entry, term }))
      )
      .sort((left, right) => right.term.length - left.term.length);

    for (const { entry, term } of validationTerms) {
        if (termAppears(value, term)) {
          issues.push({
            field,
            value,
            term,
            approvedArabic: entry.arabic,
            kind: entry.kind
          });
        }
    }

    return { valid: issues.length === 0, issues };
  }

  private getTermsByKind(kind: LocalizationDictionaryKind): CanonicalTerm[] {
    return this.termEntries
      .filter((entry) => entry.kind === kind)
      .map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        english: entry.english,
        arabic: entry.arabic,
        aliases: entry.aliases
      }));
  }

  private buildIngredientEntries(): TermEntry[] {
    return FOOD_DICTIONARY.ingredients.map((ingredient) => ({
      kind: "ingredient",
      id: ingredient.id,
      english: ingredient.canonicalEnglishName,
      arabic: ingredient.canonicalArabicName,
      aliases: [
        ...ingredient.aliases,
        ...ingredient.synonyms,
        ...ingredient.pluralForms,
        ...ingredient.ocrMistakes,
        ...ingredient.spellingMistakes
      ]
    }));
  }

  private buildTermEntries(
    kind: LocalizationDictionaryKind,
    terms: FoodDictionaryTerm[],
    mapper: (term: FoodDictionaryTerm) => Omit<TermEntry, "kind"> = (term) => ({
      id: slugify(term.en),
      english: term.en,
      arabic: term.ar,
      aliases: term.aliases ?? []
    })
  ): TermEntry[] {
    return terms.map((term) => ({ kind, ...mapper(term) }));
  }

  private indexEnglish(value: string, entry: TermEntry) {
    const key = normalizeDictionaryLookupKey(value);
    if (key) this.englishLookup.set(key, entry);
  }

  private indexArabic(value: string, entry: TermEntry) {
    const key = normalizeDictionaryLookupKey(value);
    if (key) this.arabicLookup.set(key, entry);
  }

  private findExactTerm(value: string, kinds: LocalizationDictionaryKind[]) {
    const key = normalizeDictionaryLookupKey(value);
    if (!key) return null;

    const lookupEntry = containsArabic(value) ? this.arabicLookup.get(key) : this.englishLookup.get(key);
    if (lookupEntry && kinds.includes(lookupEntry.kind)) return lookupEntry;

    return (
      this.termEntries.find((entry) => {
        if (!kinds.includes(entry.kind)) return false;
        return [entry.english, entry.arabic, ...entry.aliases].some((term) => normalizeDictionaryLookupKey(term) === key);
      }) ?? null
    );
  }

  private normalizeLocalizedVariants(localized: Recipe["localized"]): Recipe["localized"] {
    if (!localized) return localized;
    return {
      ...localized,
      English: localized.English ? this.normalizeLocalizedVariant(localized.English, "en") : undefined,
      Arabic: localized.Arabic ? this.normalizeLocalizedVariant(localized.Arabic, "ar") : undefined
    };
  }

  private normalizeLocalizedVariant(
    variant: LocalizedRecipeVariant,
    language: LocalizationLanguage
  ): LocalizedRecipeVariant {
    return {
      ...variant,
      name: this.normalizeDishTitle(variant.name, language),
      cuisine: this.normalizeCulinaryText(variant.cuisine, language, ["cuisine"]),
      ingredients: variant.ingredients.map((ingredient) => this.normalizeIngredient(ingredient, language)).filter(Boolean),
      missing_ingredients: variant.missing_ingredients.map((ingredient) => this.normalizeIngredient(ingredient, language)).filter(Boolean),
      steps: variant.steps.map((step) => this.normalizeCookingStep(step, language)).filter(Boolean),
      cook_time: this.normalizeCookTime(variant.cook_time, language),
      difficulty: this.normalizeDifficulty(variant.difficulty, language),
      preference_hits: variant.preference_hits?.map((hit) => this.normalizeCulinaryText(hit, language))
    };
  }

  private normalizeCookTime(value: string, language: LocalizationLanguage) {
    if (language === "ar") {
      return value
        .replace(/\bmins?\b/gi, "\u062f\u0642\u064a\u0642\u0629")
        .replace(/\bminutes?\b/gi, "\u062f\u0642\u064a\u0642\u0629")
        .replace(/\bhours?\b/gi, "\u0633\u0627\u0639\u0629");
    }

    return value
      .replace(/\u062f\u0642\u0627\u0626\u0642|\u062f\u0642\u064a\u0642\u0629/g, "mins")
      .replace(/\u0633\u0627\u0639\u0627\u062a|\u0633\u0627\u0639\u0629/g, "hours");
  }

  private normalizeDifficulty(value: string, language: LocalizationLanguage) {
    if (language === "ar") {
      return value
        .replace(/\beasy\b/gi, "\u0633\u0647\u0644")
        .replace(/\bmedium\b/gi, "\u0645\u062a\u0648\u0633\u0637")
        .replace(/\bhard\b/gi, "\u0635\u0639\u0628");
    }

    return value
      .replace(/\u0633\u0647\u0644/g, "Easy")
      .replace(/\u0645\u062a\u0648\u0633\u0637/g, "Medium")
      .replace(/\u0635\u0639\u0628/g, "Hard");
  }
}

export const localizationService = new LocalizationService();

export function normalizeRecipeThroughLocalizationService(recipe: Recipe, language: LocalizationLanguage) {
  return localizationService.normalizeRecipe(recipe, language);
}

export function validateArabicRecipeLocalization(recipe: Recipe) {
  return localizationService.validateArabicRecipe(recipe);
}

function replaceKnownTerm(value: string, source: string, replacement: string) {
  if (!source || source === replacement) return value;
  const escaped = escapeRegExp(source.trim());
  if (!escaped) return value;
  return value.replace(new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`, "giu"), (_match, prefix) => {
    return `${prefix}${replacement}`;
  });
}

function termAppears(value: string, term: string) {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}(?=$|[^\\p{L}\\p{N}])`, "iu").test(value);
}

function normalizeSpacing(value: string, language: LocalizationLanguage) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return language === "ar" ? normalized.replace(/,/g, "\u060c") : normalized;
}

function isSelfExpandingArabicReplacement(source: string, replacement: string, language: LocalizationLanguage) {
  if (language !== "ar" || !containsArabic(source) || !containsArabic(replacement)) return false;
  const sourceKey = normalizeDictionaryLookupKey(source);
  const replacementKey = normalizeDictionaryLookupKey(replacement);
  return Boolean(sourceKey && replacementKey && sourceKey !== replacementKey && replacementKey.includes(sourceKey));
}

function inferDishCuisine(title: string) {
  const normalized = title.toLowerCase();
  if (/\b(hawawshi|koshary|molokhia|alexandrian|egyptian)\b/.test(normalized)) return "Egyptian";
  if (/\b(tavuk|adana|manti)\b/.test(normalized)) return "Turkish";
  if (/\b(pad|gai|thai)\b/.test(normalized)) return "Thai";
  if (/\b(tikka|biryani|paneer|butter chicken)\b/.test(normalized)) return "Indian";
  if (/\b(cacciatore|parmesan|carbonara|puttanesca)\b/.test(normalized)) return "Italian";
  if (/\b(taco|veracruz|rancheros|fajita)\b/.test(normalized)) return "Mexican";
  return "Global";
}

function containsArabic(value: string) {
  return /[\u0600-\u06ff]/u.test(value);
}

function containsLatin(value: string) {
  return /[A-Za-z]/.test(value);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
