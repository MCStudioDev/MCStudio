import { translateIngredientToArabic, translateIngredientToEnglish } from "@/lib/arabicRecipeLocalization";

export type RecipeLanguage = "English" | "Arabic";

export interface BilingualIngredient {
  canonical: string;
  en: string;
  ar: string;
}

// This is deliberately deterministic. Gemini must never be asked to translate
// an ingredient label because a mistranslation changes a recipe contract.
const CORE_DICTIONARY: Record<string, BilingualIngredient> = {
  chicken: { canonical: "chicken", en: "Chicken", ar: "دجاج" },
  "thai basil": { canonical: "thai basil", en: "Thai basil", ar: "ريحان تايلندي" },
  oregano: { canonical: "oregano", en: "Oregano", ar: "زعتر بري" },
  basil: { canonical: "basil", en: "Basil", ar: "ريحان" },
  "fish sauce": { canonical: "fish sauce", en: "Fish sauce", ar: "صوص السمك" },
  "oyster sauce": { canonical: "oyster sauce", en: "Oyster sauce", ar: "صوص المحار" },
  "bell pepper": { canonical: "bell pepper", en: "Bell pepper", ar: "فلفل رومي" },
  "ground beef": { canonical: "ground beef", en: "Ground beef", ar: "لحم بقري مفروم" },
  shrimp: { canonical: "shrimp", en: "Shrimp", ar: "جمبري" },
  rice: { canonical: "rice", en: "Rice", ar: "أرز" },
  garlic: { canonical: "garlic", en: "Garlic", ar: "ثوم" },
  onion: { canonical: "onion", en: "Onion", ar: "بصل" },
  tomato: { canonical: "tomato", en: "Tomato", ar: "طماطم" }
};

export function getBilingualIngredient(value: string): BilingualIngredient {
  const canonical = value.trim().toLowerCase();
  const known = CORE_DICTIONARY[canonical];
  if (known) return known;

  // Existing taxonomy-backed translation is the extensible dictionary layer.
  const en = translateIngredientToEnglish(value).trim() || value.trim();
  const ar = translateIngredientToArabic(en).trim();
  return { canonical: en.toLowerCase(), en, ar: ar || en };
}

export function formatIngredientFromDictionary(value: string, language: RecipeLanguage) {
  const ingredient = getBilingualIngredient(value);
  return language === "Arabic" ? ingredient.ar : ingredient.en;
}
