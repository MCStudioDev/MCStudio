import { normalizeIngredients } from "@/services/ingredientNormalizationService";
import { findUnverifiedCompositeProtein } from "@/lib/compositeProteinSafety";
import { translateIngredientToArabic, translateIngredientToEnglish } from "@/lib/arabicRecipeLocalization";
import { findArabicFood } from "./foodCatalog";

export function westernDigits(text: string) {
  const fractions: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75 };
  return text.replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= "۰" ? 0x6f0 : 0x660))).replace(/٫/g, ".")
    .replace(/(\d+)?\s*([½¼¾])/g, (_match, whole: string | undefined, fraction: string) => String(Number(whole ?? 0) + fractions[fraction]));
}
export function normalizeArabicMeasure(text: string) {
  return westernDigits(text).replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/ملعقة\s+كبيرة/g, "tbsp").replace(/ملعقة\s+صغيرة/g, "tsp")
    .replace(/كيلوغرام|كيلوجرام|كيلو\b/g, "kg").replace(/غرام|جرام|جم(?=\s|$)/g, "g")
    .replace(/أكواب|اكواب|كوب/g, "cup").replace(/حبات|حبة/g, "piece")
    .replace(/فصوص|فص/g, "clove").replace(/ملليلتر|مليلتر/g, "ml")
    .replace(/عبوة|علبة/g, "can")
    .replace(/\bgrams?\b/gi, "g").replace(/\bkilograms?\b/gi, "kg")
    .replace(/\btablespoons?\b/gi, "tbsp").replace(/\bteaspoons?\b/gi, "tsp")
    .replace(/\b(cup|piece|clove|can)s\b/gi, "$1");
}
export async function normalizeArabicInputs(values: string[]) {
  const original = values.flatMap(value => value.split(/[,،;؛\n]+/u)).map(value => value.trim()).filter(Boolean);
  const canonical: string[] = [];
  const unclear: Array<{ index: number; text: string }> = [];
  for (const [index, text] of original.entries()) {
    const prepared = normalizeArabicMeasure(text).replace(/^\s*((?:\d+\s+)?\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s*(?:g|kg|ml|cup|piece|clove|can|tbsp|tsp)\s+/i, "");
    if (findUnverifiedCompositeProtein({ ingredients: [text, prepared] })) { unclear.push({ index, text }); continue; }
    const food = findArabicFood(prepared);
    if (food) { canonical.push(food.en); continue; }
    // The legacy English localization table maps فول to generic canned beans.
    // Preserve its specific identity here without changing that shared table.
    if (/^(?:فول|الفول|fava beans?|broad beans?)$/i.test(prepared.trim())) {
      canonical.push("fava beans");
      continue;
    }
    if (/^(?:vegetable (?:broth|stock)|مرق(?:ة)? (?:ال)?خضار|مرق(?:ة)? (?:ال)?خضروات)$/i.test(prepared.trim())) {
      canonical.push("vegetable broth");
      continue;
    }
    const english = translateIngredientToEnglish(prepared);
    const result = await normalizeIngredients([english], { allowRemoteAliases: false });
    const arabic = translateIngredientToArabic(english);
    const dictionaryRecognized = /[A-Za-z]/.test(english) && !/[\u0600-\u06ff]/.test(english)
      && /[\u0600-\u06ff]/.test(arabic) && !/[A-Za-z]/.test(arabic) && translateIngredientToEnglish(arabic).toLowerCase() === english.toLowerCase();
    if ((result.unmapped.length && !dictionaryRecognized) || !result.normalized.length || findUnverifiedCompositeProtein({ ingredients: [text, prepared] })) {
      unclear.push({ index, text });
    } else canonical.push(...result.normalized);
  }
  return { original, canonical: [...new Set(canonical)], unclear };
}
