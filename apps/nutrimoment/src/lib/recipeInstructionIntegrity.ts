import type { LocalizedRecipeVariant, Recipe } from "@/lib/types";

type RecipeLike = Pick<Recipe, "name" | "ingredients" | "missing_ingredients" | "steps" | "dish_intent">;

type TitleIngredientRule = {
  arabic: string;
  english: string;
  patterns: RegExp[];
};

type TitleTechniqueRule = {
  ingredientPatterns: RegExp[];
  missingIngredientArabic: string;
  missingIngredientEnglish: string;
  stepArabic: string;
  stepEnglish: string;
  stepPatterns: RegExp[];
  titlePatterns: RegExp[];
};

const TITLE_INGREDIENT_RULES: TitleIngredientRule[] = [
  rule("ginger", "زنجبيل", [/\bginger\b/i, /زنجبيل/u]),
  rule("spinach", "سبانخ", [/\bspinach\b/i, /سبانخ/u]),
  rule("garlic", "ثوم", [/\bgarlic\b/i, /ثوم/u]),
  rule("onion", "بصل", [/\bonions?\b/i, /بصل/u]),
  rule("tomato", "طماطم", [/\btomatoes?\b/i, /طماطم|بندورة/u]),
  rule("mushrooms", "مشروم", [/\bmushrooms?\b/i, /مشروم|فطر/u]),
  rule("broccoli", "بروكلي", [/\bbroccoli\b/i, /بروكلي/u]),
  rule("zucchini", "كوسة", [/\bzucchini\b/i, /كوسة/u]),
  rule("eggplant", "باذنجان", [/\beggplant\b/i, /باذنجان/u]),
  rule("bell pepper", "فلفل رومي", [/\bbell peppers?\b/i, /فلفل رومي/u]),
  rule("lemon", "ليمون", [/\blemon\b/i, /ليمون/u]),
  rule("lime", "لايم", [/\blime\b/i, /لايم/u]),
  rule("basil", "ريحان", [/\bbasil\b/i, /ريحان/u]),
  rule("cilantro", "كزبرة", [/\bcilantro\b|\bcoriander\b/i, /كزبرة/u]),
  rule("parsley", "بقدونس", [/\bparsley\b/i, /بقدونس/u]),
  rule("mint", "نعناع", [/\bmint\b/i, /نعناع/u]),
  rule("potato", "بطاطس", [/\bpotatoes?\b/i, /بطاطس|بطاطا/u]),
  rule("carrot", "جزر", [/\bcarrots?\b/i, /جزر/u]),
  rule("rice", "أرز", [/\brice\b/i, /أرز|رز/u]),
  rule("quinoa", "كينوا", [/\bquinoa\b/i, /كينوا/u]),
  rule("lentils", "عدس", [/\blentils?\b/i, /عدس/u]),
  rule("chickpeas", "حمص", [/\bchickpeas?\b/i, /حمص/u]),
  rule("tofu", "توفو", [/\btofu\b/i, /توفو/u]),
  rule("chicken", "دجاج", [/\bchicken\b/i, /دجاج|فراخ/u]),
  rule("beef", "لحم بقري", [/\bbeef\b/i, /لحم بقري/u]),
  rule("shrimp", "جمبري", [/\bshrimp\b|\bprawns?\b/i, /جمبري|روبيان/u]),
  rule("fish", "سمك", [/\bfish\b/i, /سمك/u]),
  rule("salmon", "سلمون", [/\bsalmon\b/i, /سلمون/u]),
  rule("tuna", "تونة", [/\btuna\b/i, /تونة/u]),
  rule("cheese", "جبن", [/\bcheese\b/i, /جبن/u]),
  rule("yogurt", "زبادي", [/\byogurts?\b/i, /زبادي|لبن/u])
];

const TITLE_TECHNIQUE_RULES: TitleTechniqueRule[] = [
  {
    ingredientPatterns: [
      /\bbread\s*crumbs?\b/i,
      /\bbreadcrumbs?\b/i,
      /\bpanko\b/i,
      /\bflour\b/i,
      /\bcornmeal\b/i,
      /\bcrushed\s+(?:oats|crackers|cereal)\b/i,
      /\u0628\u0642\u0633\u0645\u0627\u0637|\u0628\u0627\u0646\u0643\u0648|\u062f\u0642\u064a\u0642/u
    ],
    missingIngredientArabic: "\u0628\u0642\u0633\u0645\u0627\u0637",
    missingIngredientEnglish: "breadcrumbs",
    stepArabic: "\u062c\u0641\u0641 \u0627\u0644\u062f\u062c\u0627\u062c \u0623\u0648 \u0627\u0644\u0645\u0643\u0648\u0646 \u0627\u0644\u0631\u0626\u064a\u0633\u064a\u060c \u062b\u0645 \u063a\u0637\u0647 \u0628\u0637\u0628\u0642\u0629 \u062e\u0641\u064a\u0641\u0629 \u0645\u0646 \u0627\u0644\u0628\u0642\u0633\u0645\u0627\u0637 \u0648\u0627\u0636\u063a\u0637 \u0628\u0644\u0637\u0641 \u062d\u062a\u0649 \u062a\u062b\u0628\u062a \u0627\u0644\u062a\u063a\u0637\u064a\u0629 \u0642\u0628\u0644 \u0627\u0644\u0637\u0647\u064a.",
    stepEnglish: "Pat the chicken or main ingredient dry, then coat it in a thin, even layer of breadcrumbs and press gently so the breading sticks before cooking.",
    stepPatterns: [
      /\b(bread|breaded|breadcrumb|breadcrumbs|panko|crumb|crusted|coat|coated|dredge|dredged)\b/i,
      /\u0628\u0642\u0633\u0645\u0627\u0637|\u0628\u0627\u0646\u0643\u0648|\u063a\u0637|\u062a\u063a\u0637\u064a/u
    ],
    titlePatterns: [
      /\b(breaded|bread-crumbed|breadcrumb-crusted|bread\s*crumb\s*crusted|panko-crusted|panko\s+crusted|crumbed|crumb-crusted)\b/i,
      /\u0628\u0627\u0646\u064a\u0647|\u0628\u0642\u0633\u0645\u0627\u0637|\u0645\u063a\u0637\u0649\s+\u0628\u0627\u0644\u0628\u0642\u0633\u0645\u0627\u0637/u
    ]
  }
];

export function ensureRecipeInstructionIntegrity(recipe: Recipe): Recipe {
  return {
    ...repairRecipeLike(recipe),
    localized: recipe.localized
      ? {
          ...recipe.localized,
          English: recipe.localized.English ? repairRecipeLike(recipe.localized.English) : undefined,
          Arabic: recipe.localized.Arabic ? repairRecipeLike(recipe.localized.Arabic) : undefined
        }
      : recipe.localized
  };
}

function repairRecipeLike<T extends RecipeLike | LocalizedRecipeVariant>(recipe: T): T {
  const titleSource = [
    recipe.name,
    recipe.dish_intent?.dish_name,
    ...(recipe.dish_intent?.visual_keywords ?? [])
  ].join(" ");
  const missingTitleIngredients = TITLE_INGREDIENT_RULES.filter((entry) =>
    entry.patterns.some((pattern) => pattern.test(titleSource))
  );
  const missingTitleTechniques = TITLE_TECHNIQUE_RULES.filter((entry) =>
    entry.titlePatterns.some((pattern) => pattern.test(titleSource))
  );
  if (!missingTitleIngredients.length && !missingTitleTechniques.length) return recipe;

  const language = hasArabicText(titleSource) ? "Arabic" : "English";
  let missingIngredients = [...recipe.missing_ingredients];
  let steps = [...recipe.steps];

  for (const ingredient of missingTitleIngredients) {
    if (!containsRuleText([...recipe.ingredients, ...missingIngredients], ingredient)) {
      missingIngredients = [...missingIngredients, displayIngredient(ingredient, language)];
    }
    if (!containsRuleText(steps, ingredient)) {
      steps = [...steps, buildIngredientUseStep(ingredient, language)];
    }
  }

  for (const technique of missingTitleTechniques) {
    if (!containsAnyPattern([...recipe.ingredients, ...missingIngredients], technique.ingredientPatterns)) {
      missingIngredients = [
        ...missingIngredients,
        language === "Arabic" ? technique.missingIngredientArabic : technique.missingIngredientEnglish
      ];
    }
    if (!containsAnyPattern(steps, technique.stepPatterns)) {
      steps = [...steps, language === "Arabic" ? technique.stepArabic : technique.stepEnglish];
    }
  }

  return {
    ...recipe,
    missing_ingredients: dedupeRecipeText(missingIngredients),
    steps: dedupeRecipeText(steps)
  };
}

function rule(english: string, arabic: string, patterns: RegExp[]): TitleIngredientRule {
  return { arabic, english, patterns };
}

function containsRuleText(values: string[], ingredient: TitleIngredientRule) {
  return values.some((value) => ingredient.patterns.some((pattern) => pattern.test(value)));
}

function containsAnyPattern(values: string[], patterns: RegExp[]) {
  return values.some((value) => patterns.some((pattern) => pattern.test(value)));
}

function displayIngredient(ingredient: TitleIngredientRule, language: "Arabic" | "English") {
  return language === "Arabic" ? ingredient.arabic : ingredient.english;
}

function buildIngredientUseStep(ingredient: TitleIngredientRule, language: "Arabic" | "English") {
  if (language === "Arabic") {
    return `أضف ${ingredient.arabic} كما هو مذكور في اسم الطبق واطهه حتى يظهر طعمه بوضوح في الوصفة.`;
  }

  return `Add the ${ingredient.english} named in the dish title and cook until its flavor is clearly part of the recipe.`;
}

function dedupeRecipeText(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasArabicText(value: string) {
  return /[\u0600-\u06ff]/u.test(value);
}
