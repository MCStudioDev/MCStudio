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
  egyptian: ["egyptian", "middleeastern", "middle eastern", "mediterranean", "arabic"],
  italian: ["italian"],
  middleeastern: ["middleeastern", "middle eastern", "egyptian", "mediterranean", "levantine", "arabic", "turkish"],
  mediterranean: ["mediterranean", "middleeastern", "middle eastern", "egyptian", "greek", "levantine", "turkish"],
  indian: ["indian"],
  mexican: ["mexican"],
  american: ["american"],
  asian: ["asian", "thai", "japanese", "chinese", "korean", "vietnamese"],
  thai: ["thai", "asian"],
  turkish: ["turkish", "middleeastern", "middle eastern", "mediterranean"]
};

export function cuisineMatchesPreference(recipeCuisine: string, preferredCuisine: string) {
  if (!preferredCuisine || preferredCuisine === "Any") return true;

  const recipeKey = normalizeCuisineKey(recipeCuisine);
  const preferredKey = normalizeCuisineKey(preferredCuisine);
  const acceptedKeys = CUISINE_GROUPS[preferredKey] ?? [preferredKey];

  return acceptedKeys.includes(recipeKey);
}

export function normalizeCuisineLabel(value: string) {
  if (!value) return "Any";
  const normalized = normalizeCuisineKey(value);

  switch (normalized) {
    case "egyptian":
      return "Egyptian";
    case "middleeastern":
      return "Middle Eastern";
    case "mediterranean":
      return "Mediterranean";
    case "italian":
      return "Italian";
    case "indian":
      return "Indian";
    case "mexican":
      return "Mexican";
    case "american":
      return "American";
    case "asian":
      return "Asian";
    case "thai":
      return "Thai";
    case "turkish":
      return "Turkish";
    default:
      return value;
  }
}

export function getCuisineDisplayLabel(value: string | undefined | null, language?: string) {
  const normalized = normalizeCuisineLabel(value ?? "Any");
  if (language !== "ar") return normalized;
  return ARABIC_CUISINE_LABELS[normalized] ?? normalized;
}

function normalizeCuisineKey(value: string) {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}
