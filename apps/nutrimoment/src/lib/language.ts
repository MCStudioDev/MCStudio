import type { Language } from "./types";

export const PILOT_UI_LANGUAGES = ["en", "ar"] as const;
export const PILOT_LANGUAGE_STORAGE_KEY = "nutrimoment.pilot.language";

const ARABIC_REGIONS = new Set([
  "AE",
  "BH",
  "DJ",
  "DZ",
  "EG",
  "EH",
  "ER",
  "IQ",
  "JO",
  "KM",
  "KW",
  "LB",
  "LY",
  "MA",
  "MR",
  "OM",
  "PS",
  "QA",
  "SA",
  "SD",
  "SO",
  "SS",
  "SY",
  "TD",
  "TN",
  "YE"
]);

export type PilotRecipeLanguage = "English" | "Arabic";

export function isPilotLanguage(value: unknown): value is Language {
  return value === "en" || value === "ar";
}

export function normalizePilotLanguage(value: unknown, fallback: Language = "en"): Language {
  return isPilotLanguage(value) ? value : fallback;
}

export function normalizeRecipeLanguage(value: unknown, fallback: PilotRecipeLanguage = "English"): PilotRecipeLanguage {
  if (value === "Arabic" || value === "ar") return "Arabic";
  if (value === "English" || value === "en") return "English";
  return fallback;
}

export function recipeLanguageFromUiLanguage(language: Language): PilotRecipeLanguage {
  return language === "ar" ? "Arabic" : "English";
}

export function persistPilotLanguage(language: Language) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PILOT_LANGUAGE_STORAGE_KEY, language);
}

export function getStoredPilotLanguage(): Language | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(PILOT_LANGUAGE_STORAGE_KEY);
  return isPilotLanguage(stored) ? stored : null;
}

export function detectPilotLanguage(locales: readonly string[] = []): Language {
  for (const locale of locales) {
    if (!locale) continue;
    const normalized = locale.trim();
    if (!normalized) continue;

    if (normalized.toLowerCase().startsWith("ar")) {
      return "ar";
    }

    const region = normalized.split("-")[1]?.toUpperCase();
    if (region && ARABIC_REGIONS.has(region)) {
      return "ar";
    }
  }

  return "en";
}

export function getBrowserPilotLanguage(): Language {
  if (typeof navigator === "undefined") return "en";
  const locales = navigator.languages?.length ? navigator.languages : [navigator.language];
  return detectPilotLanguage(locales.filter(Boolean));
}

export function getStoredOrDetectedPilotLanguage(): Language {
  return getStoredPilotLanguage() ?? getBrowserPilotLanguage();
}
