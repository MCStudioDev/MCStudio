import type { RecipeLanguage } from "@/services/ingredientDictionaryService";

const ARABIC_CHARACTER = /[\u0600-\u06FF]/u;

export class LanguageService {
  detect(input: { ingredients: string[]; requestedLanguage?: string; prompt?: string }): RecipeLanguage {
    if (input.requestedLanguage === "Arabic" || input.requestedLanguage === "ar") return "Arabic";
    if (input.requestedLanguage === "English" || input.requestedLanguage === "en") return "English";

    const text = [...input.ingredients, input.prompt ?? ""].join(" ");
    return ARABIC_CHARACTER.test(text) ? "Arabic" : "English";
  }
}
