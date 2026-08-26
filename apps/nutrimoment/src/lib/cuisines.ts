export const CUISINE_OPTIONS = [
  "Any",
  "Egyptian",
  "Italian",
  "Middle Eastern",
  "Mediterranean",
  "Indian",
  "Mexican",
  "American",
  "Asian",
  "Thai",
  "Turkish"
] as const;

const ARABIC_CUISINE_LABELS: Record<string, string> = {
  American: "أمريكي",
  Any: "أي مطبخ",
  Asian: "آسيوي",
  Egyptian: "مصري",
  Global: "عالمي",
  Indian: "هندي",
  Italian: "إيطالي",
  "Italian-American": "إيطالي أمريكي",
  "Latin American": "لاتيني",
  Mediterranean: "متوسطي",
  Mexican: "مكسيكي",
  "Middle Eastern": "شرق أوسطي",
  Thai: "تايلندي",
  Turkish: "تركي",
  Unknown: "غير محدد"
};

const CUISINE_GROUPS: Record<string, string[]> = {
  any: ["any"],
  egyptian: ["egyptian", "middleeastern", "mediterranean", "arabic"],
  italian: ["italian"],
  middleeastern: ["middleeastern", "egyptian", "mediterranean", "levantine", "arabic", "turkish"],
  mediterranean: ["mediterranean", "middleeastern", "egyptian", "greek", "levantine", "turkish"],
  indian: ["indian"],
  mexican: ["mexican"],
  american: ["american"],
  asian: ["asian", "thai", "japanese", "chinese", "korean", "vietnamese"],
  thai: ["thai", "asian"],
  turkish: ["turkish", "middleeastern", "mediterranean"]
};

const CUISINE_LABELS_BY_KEY: Record<string, string> = {
  american: "American",
  any: "Any",
  arabic: "Middle Eastern",
  asian: "Asian",
  chinese: "Asian",
  egyptian: "Egyptian",
  global: "Global",
  greek: "Mediterranean",
  indian: "Indian",
  italian: "Italian",
  japanese: "Asian",
  korean: "Asian",
  levantine: "Middle Eastern",
  mediterranean: "Mediterranean",
  mexican: "Mexican",
  middleeastern: "Middle Eastern",
  thai: "Thai",
  turkish: "Turkish",
  vietnamese: "Asian"
};

const CUISINE_ALIASES: Record<string, string[]> = {
  american: ["american", "usa", "u.s.", "us", "أمريكي", "امريكي", "أمريكية", "امريكية"],
  any: ["any", "any cuisine", "أي مطبخ", "اي مطبخ", "أي", "اي"],
  arabic: ["arabic", "arab", "عربي", "عربية"],
  asian: ["asian", "asia", "آسيوي", "اسيوي", "آسيوية", "اسيوية", "شرق آسيوي", "شرق اسيوي"],
  chinese: ["chinese", "china", "صيني", "صينية", "الصين"],
  egyptian: ["egyptian", "egypt", "alexandrian egyptian", "alexandrian", "مصري", "مصرية", "مصر", "إسكندراني", "اسكندراني", "إسكندرية", "اسكندرية"],
  global: ["global", "world", "international", "عالمي", "عالمية"],
  greek: ["greek", "greece", "يوناني", "يونانية"],
  indian: ["indian", "india", "هندي", "هندية", "الهند"],
  italian: ["italian", "italy", "إيطالي", "ايطالي", "إيطالية", "ايطالية"],
  japanese: ["japanese", "japan", "ياباني", "يابانية", "اليابان"],
  korean: ["korean", "korea", "كوري", "كورية", "كوريا"],
  levantine: ["levantine", "levant", "shami", "شامي", "شامية", "لبناني", "لبنانية", "سوري", "سورية", "سوريه"],
  mediterranean: ["mediterranean", "med", "متوسطي", "متوسطية", "البحر المتوسط", "بحر متوسط"],
  mexican: ["mexican", "mexico", "مكسيكي", "مكسيكية"],
  middleeastern: ["middle eastern", "middle-east", "middleeast", "شرق أوسطي", "شرق اوسطى", "شرق اوسطي", "الشرق الأوسط", "الشرق الاوسط"],
  thai: ["thai", "thailand", "تايلندي", "تايلندية", "تايلاند"],
  turkish: ["turkish", "turkey", "تركي", "تركية", "تركيا"],
  vietnamese: ["vietnamese", "vietnam", "فيتنامي", "فيتنامية", "فيتنام"]
};

const CUISINE_ALIAS_ENTRIES = Object.entries(CUISINE_ALIASES)
  .flatMap(([key, aliases]) => [key, ...aliases].map((alias) => ({ key, aliasKey: normalizeAliasKey(alias) })))
  .filter((entry) => entry.aliasKey)
  .sort((a, b) => b.aliasKey.length - a.aliasKey.length);

const CUISINE_ALIAS_LOOKUP = new Map(CUISINE_ALIAS_ENTRIES.map((entry) => [entry.aliasKey, entry.key]));

export function cuisineMatchesPreference(recipeCuisine: string, preferredCuisine: string) {
  if (!preferredCuisine || preferredCuisine === "Any") return true;

  const recipeKey = normalizeCuisineKey(recipeCuisine);
  const preferredKey = normalizeCuisineKey(preferredCuisine);
  const acceptedKeys = CUISINE_GROUPS[preferredKey] ?? [preferredKey];

  return acceptedKeys.includes(recipeKey);
}

export function filterRecipesByCuisinePreference<T extends { cuisine?: string }>(
  recipes: T[],
  preferredCuisine?: string
) {
  if (!preferredCuisine || preferredCuisine === "Any") return recipes;
  return recipes.filter((recipe) => cuisineMatchesPreference(recipe.cuisine ?? "", preferredCuisine));
}

export function buildCuisineUnderfillMessage(input: {
  preferredCuisine: string;
  requestedCount: number;
  returnedCount: number;
}) {
  if (input.returnedCount <= 0) {
    return `No validated ${input.preferredCuisine} recipes were available for these ingredients. Other cuisines were not substituted.`;
  }

  return `Showing ${input.returnedCount} of ${input.requestedCount} validated ${input.preferredCuisine} recipes. Other cuisines were excluded because there were not enough compliant matches.`;
}

export function normalizeCuisineLabel(value: string) {
  if (!value) return "Any";
  const normalized = normalizeCuisineKey(value);
  return CUISINE_LABELS_BY_KEY[normalized] ?? value;
}

export function getCuisineDisplayLabel(value: string | undefined | null, language?: string) {
  const normalized = normalizeCuisineLabel(value ?? "Any");
  if (language !== "ar") return normalized;
  return ARABIC_CUISINE_LABELS[normalized] ?? normalized;
}

function normalizeCuisineKey(value: string) {
  const aliasKey = normalizeAliasKey(value);
  const exactMatch = CUISINE_ALIAS_LOOKUP.get(aliasKey);
  if (exactMatch) return exactMatch;

  const fuzzyMatch = CUISINE_ALIAS_ENTRIES.find((entry) => {
    if (entry.aliasKey.length < 4) return false;
    return aliasKey.includes(entry.aliasKey);
  });

  return fuzzyMatch?.key ?? aliasKey.replace(/[^a-z]/g, "");
}

function normalizeAliasKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[\u0622\u0623\u0625]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/[^a-z\u0600-\u06FF]+/g, "");
}
