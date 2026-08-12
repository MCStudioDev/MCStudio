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

type TitleDishPromiseRule = {
  requiredIngredients: TitleIngredientRule[];
  requiredStepPatterns: RegExp[];
  stepArabic: string;
  stepEnglish: string;
  titlePatterns: RegExp[];
};

type DishWorkflowRule = {
  requiredIngredients: TitleIngredientRule[];
  stepsArabic: string[];
  stepsEnglish: string[];
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

const TITLE_DISH_PROMISE_RULES: TitleDishPromiseRule[] = [
  {
    requiredIngredients: [
      rule("yogurt", "\u0632\u0628\u0627\u062f\u064a", [/\byogurts?\b/i, /\u0632\u0628\u0627\u062f\u064a|\u0631\u0648\u0628|\u0644\u0628\u0646/u]),
      rule("ginger", "\u0632\u0646\u062c\u0628\u064a\u0644", [/\bginger\b/i, /\u0632\u0646\u062c\u0628\u064a\u0644/u]),
      rule("garlic", "\u062b\u0648\u0645", [/\bgarlic\b/i, /\u062b\u0648\u0645/u]),
      rule("lemon", "\u0644\u064a\u0645\u0648\u0646", [/\blemon\b/i, /\u0644\u064a\u0645\u0648\u0646/u]),
      rule("tandoori spices", "\u0628\u0647\u0627\u0631\u0627\u062a \u062a\u0646\u062f\u0648\u0631\u064a", [
        /\btandoori\s+(?:spice|spices|masala)\b/i,
        /\bgaram\s+masala\b/i,
        /\bcumin\b/i,
        /\bturmeric\b/i,
        /\u0628\u0647\u0627\u0631\u0627\u062a\s+\u062a\u0646\u062f\u0648\u0631\u064a|\u0643\u0645\u0648\u0646|\u0643\u0631\u0643\u0645/u
      ])
    ],
    requiredStepPatterns: [
      /\b(yogurt|tandoori|marinad|masala|broil|grill|oven)\b/i,
      /\u0632\u0628\u0627\u062f\u064a|\u0631\u0648\u0628|\u062a\u0646\u062f\u0648\u0631\u064a|\u062a\u062a\u0628\u064a\u0644|\u0645\u0627\u0631\u064a\u0646\u064a\u062f|\u0641\u0631\u0646|\u0634\u0648\u0627\u064a\u0629/u
    ],
    stepArabic:
      "\u0627\u062e\u0644\u0637 \u0627\u0644\u0632\u0628\u0627\u062f\u064a \u0645\u0639 \u0627\u0644\u062b\u0648\u0645 \u0648\u0627\u0644\u0632\u0646\u062c\u0628\u064a\u0644 \u0648\u0627\u0644\u0644\u064a\u0645\u0648\u0646 \u0648\u0628\u0647\u0627\u0631\u0627\u062a \u0627\u0644\u062a\u0646\u062f\u0648\u0631\u064a\u060c \u062b\u0645 \u0627\u062a\u0631\u0643 \u0627\u0644\u0645\u0643\u0648\u0646 \u0627\u0644\u0631\u0626\u064a\u0633\u064a \u0641\u064a \u0627\u0644\u062a\u062a\u0628\u064a\u0644\u0629 30 \u0625\u0644\u0649 60 \u062f\u0642\u064a\u0642\u0629 \u0648\u0627\u0634\u0648\u0647 \u0641\u064a \u0641\u0631\u0646 \u0633\u0627\u062e\u0646 \u0623\u0648 \u062a\u062d\u062a \u0627\u0644\u0634\u0648\u0627\u064a\u0629 \u062d\u062a\u0649 \u064a\u0646\u0636\u062c \u0648\u064a\u062a\u062d\u0645\u0631.",
    stepEnglish:
      "Mix yogurt with garlic, ginger, lemon juice, and tandoori spices, marinate the main ingredient for 30 to 60 minutes, then roast or broil it in a hot oven until cooked through and charred at the edges.",
    titlePatterns: [/\btandoori\b/i, /\u062a\u0646\u062f\u0648\u0631\u064a/u]
  }
];

const DISH_WORKFLOW_RULES: DishWorkflowRule[] = [
  {
    requiredIngredients: [
      rule("yogurt", "\u0632\u0628\u0627\u062f\u064a", [/\byogurts?\b/i, /\u0632\u0628\u0627\u062f\u064a|\u0631\u0648\u0628|\u0644\u0628\u0646/u]),
      rule("olive oil", "\u0632\u064a\u062a \u0632\u064a\u062a\u0648\u0646", [/\bolive oil\b/i, /\u0632\u064a\u062a \u0632\u064a\u062a\u0648\u0646/u]),
      rule("vinegar", "\u062e\u0644", [/\bvinegar\b/i, /\u062e\u0644/u]),
      rule("lemon", "\u0644\u064a\u0645\u0648\u0646", [/\blemon\b/i, /\u0644\u064a\u0645\u0648\u0646/u]),
      rule("garlic", "\u062b\u0648\u0645", [/\bgarlic\b/i, /\u062b\u0648\u0645/u]),
      rule("shawarma spices", "\u0628\u0647\u0627\u0631\u0627\u062a \u0634\u0627\u0648\u0631\u0645\u0627", [/\bshawarma spice|shawarma spices|paprika|cumin|coriander|curry\b/i, /\u0628\u0647\u0627\u0631\u0627\u062a|\u0628\u0627\u0628\u0631\u064a\u0643\u0627|\u0643\u0627\u0631\u064a|\u0643\u0632\u0628\u0631\u0629/u]),
      rule("onion", "\u0628\u0635\u0644", [/\bonions?\b/i, /\u0628\u0635\u0644/u]),
      rule("tomato", "\u0637\u0645\u0627\u0637\u0645", [/\btomatoes?\b/i, /\u0637\u0645\u0627\u0637\u0645|\u0628\u0646\u062f\u0648\u0631\u0629/u]),
      rule("bell pepper", "\u0641\u0644\u0641\u0644 \u0623\u062e\u0636\u0631", [/\bbell peppers?\b|\bgreen peppers?\b/i, /\u0641\u0644\u0641\u0644/u]),
      rule("flatbread", "\u062e\u0628\u0632 \u0634\u0627\u0648\u0631\u0645\u0627 \u0623\u0648 \u062e\u0628\u0632 \u0633\u0648\u0631\u064a", [/\bflatbread|pita|shawarma bread|saj\b/i, /\u062e\u0628\u0632/u])
    ],
    stepsArabic: [
      "\u0642\u0637\u0639 \u0627\u0644\u062f\u062c\u0627\u062c \u0623\u0648 \u0627\u0644\u0628\u0631\u0648\u062a\u064a\u0646 \u0625\u0644\u0649 \u0634\u0631\u0627\u0626\u062d \u0631\u0641\u064a\u0639\u0629 \u0645\u062a\u0633\u0627\u0648\u064a\u0629 \u062d\u062a\u0649 \u062a\u0646\u0636\u062c \u0628\u0633\u0631\u0639\u0629 \u0648\u062a\u0623\u062e\u0630 \u062a\u062a\u0628\u064a\u0644\u0629 \u0627\u0644\u0634\u0627\u0648\u0631\u0645\u0627 \u062c\u064a\u062f\u0627.",
      "\u0627\u062e\u0644\u0637 \u0627\u0644\u0632\u0628\u0627\u062f\u064a \u0645\u0639 \u0632\u064a\u062a \u0627\u0644\u0632\u064a\u062a\u0648\u0646 \u0648\u0627\u0644\u062e\u0644 \u0648\u0639\u0635\u064a\u0631 \u0627\u0644\u0644\u064a\u0645\u0648\u0646 \u0648\u0627\u0644\u062b\u0648\u0645 \u0648\u0628\u0647\u0627\u0631\u0627\u062a \u0627\u0644\u0634\u0627\u0648\u0631\u0645\u0627 \u0645\u062b\u0644 \u0627\u0644\u0628\u0627\u0628\u0631\u064a\u0643\u0627 \u0648\u0627\u0644\u0643\u0627\u0631\u064a \u0648\u0627\u0644\u0643\u0632\u0628\u0631\u0629 \u0648\u0627\u0644\u0641\u0644\u0641\u0644.",
      "\u0623\u0636\u0641 \u0634\u0631\u0627\u0626\u062d \u0627\u0644\u062f\u062c\u0627\u062c \u0625\u0644\u0649 \u0627\u0644\u062a\u062a\u0628\u064a\u0644\u0629\u060c \u0642\u0644\u0628\u0647\u0627 \u062c\u064a\u062f\u0627\u060c \u062b\u0645 \u0627\u062a\u0631\u0643\u0647\u0627 \u0641\u064a \u0627\u0644\u062b\u0644\u0627\u062c\u0629 30 \u062f\u0642\u064a\u0642\u0629 \u0625\u0644\u0649 \u0633\u0627\u0639\u062a\u064a\u0646 \u062d\u0633\u0628 \u0627\u0644\u0648\u0642\u062a \u0627\u0644\u0645\u062a\u0627\u062d.",
      "\u0633\u062e\u0646 \u0645\u0642\u0644\u0627\u0629 \u0648\u0627\u0633\u0639\u0629 \u0639\u0644\u0649 \u0646\u0627\u0631 \u0639\u0627\u0644\u064a\u0629 \u062c\u062f\u0627\u060c \u0623\u0636\u0641 \u0645\u0644\u0639\u0642\u0629 \u0635\u063a\u064a\u0631\u0629 \u0632\u064a\u062a\u060c \u062b\u0645 \u0627\u0641\u0631\u062f \u0627\u0644\u062f\u062c\u0627\u062c \u0641\u064a \u0637\u0628\u0642\u0629 \u0648\u0627\u062d\u062f\u0629 \u0648\u0644\u0627 \u062a\u0642\u0644\u0628\u0647 \u0641\u0648\u0631\u0627 \u062d\u062a\u0649 \u064a\u0623\u062e\u0630 \u0644\u0648\u0646\u0627.",
      "\u0642\u0644\u0628 \u0627\u0644\u062f\u062c\u0627\u062c 6 \u0625\u0644\u0649 10 \u062f\u0642\u0627\u0626\u0642 \u062d\u062a\u0649 \u064a\u0646\u0636\u062c\u060c \u062b\u0645 \u0623\u0636\u0641 \u0634\u0631\u0627\u0626\u062d \u0627\u0644\u0628\u0635\u0644 \u0648\u0627\u0644\u0641\u0644\u0641\u0644 \u0648\u0627\u0644\u0637\u0645\u0627\u0637\u0645 \u0648\u0642\u0644\u0628 \u062f\u0642\u064a\u0642\u062a\u064a\u0646 \u0641\u0642\u0637 \u062d\u062a\u0649 \u062a\u0630\u0628\u0644 \u0648\u062a\u0628\u0642\u0649 \u0645\u062a\u0645\u0627\u0633\u0643\u0629.",
      "\u0642\u062f\u0645 \u0627\u0644\u0634\u0627\u0648\u0631\u0645\u0627 \u0641\u064a \u062e\u0628\u0632 \u0633\u0648\u0631\u064a \u0623\u0648 \u062e\u0628\u0632 \u0634\u0627\u0648\u0631\u0645\u0627 \u0645\u0639 \u062b\u0648\u0645\u064a\u0629 \u0623\u0648 \u0637\u062d\u064a\u0646\u0629 \u0648\u0645\u062e\u0644\u0644\u060c \u062b\u0645 \u062d\u0645\u0631 \u0627\u0644\u0633\u0627\u0646\u062f\u0648\u062a\u0634 \u0641\u064a \u0645\u0642\u0644\u0627\u0629 \u0628\u0642\u0644\u064a\u0644 \u0645\u0646 \u0627\u0644\u0632\u064a\u062a \u062d\u062a\u0649 \u064a\u0642\u0631\u0645\u0634."
    ],
    stepsEnglish: [
      "Slice the chicken or main protein into thin, even strips so it cooks quickly and absorbs the shawarma marinade.",
      "Mix yogurt with olive oil, vinegar, lemon juice, garlic, and shawarma spices such as paprika, curry, coriander, black pepper, and salt.",
      "Add the chicken strips to the marinade, coat well, then refrigerate for 30 minutes to 2 hours depending on the time available.",
      "Heat a wide skillet over very high heat, add 1 tsp oil, spread the chicken in one layer, and do not stir immediately so it browns instead of steaming.",
      "Cook the chicken 6 to 10 minutes until done, then add sliced onion, bell pepper, and tomato for only 2 minutes so they soften but stay lively.",
      "Serve in shawarma or pita bread with toum, tahini, pickles, or fries when listed, then toast the wrap in a lightly oiled pan until crisp."
    ],
    stepPatterns: [
      /\b(yogurt|marinad|vinegar|shawarma spice|toum|tahini|wrap|pita)\b/i,
      /\u0632\u0628\u0627\u062f\u064a|\u062a\u062a\u0628\u064a\u0644|\u062e\u0644|\u0628\u0647\u0627\u0631\u0627\u062a|\u062b\u0648\u0645\u064a\u0629|\u0637\u062d\u064a\u0646\u0629|\u062e\u0628\u0632/u
    ],
    titlePatterns: [/\b(?:shawarma|shawerma|shwarma)\b/i, /\u0634\u0627\u0648\u0631\u0645\u0627/u]
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
  const language = hasArabicText(titleSource) ? "Arabic" : "English";
  const missingTitleIngredients = TITLE_INGREDIENT_RULES.filter((entry) =>
    entry.patterns.some((pattern) => pattern.test(titleSource))
  );
  const missingTitleTechniques = TITLE_TECHNIQUE_RULES.filter((entry) =>
    entry.titlePatterns.some((pattern) => pattern.test(titleSource))
  );
  const missingDishPromises = TITLE_DISH_PROMISE_RULES.filter((entry) =>
    entry.titlePatterns.some((pattern) => pattern.test(titleSource))
  );
  const workflowRepair = findDishWorkflowRepair(recipe, titleSource, language);
  const needsKoftaFormRepair = titlePromisesKoftaForm(titleSource) && !hasGroundMeatCue([
    ...recipe.ingredients,
    ...recipe.missing_ingredients,
    ...recipe.steps
  ]);
  const needsGrilledMethodRepair =
    titlePromisesGrilledMethod(titleSource) && !stepsUseGrilledMethod(recipe.steps);
  const culinaryRepairs = buildCulinaryLogicRepairs(recipe, titleSource, language);
  if (
    !missingTitleIngredients.length &&
    !missingTitleTechniques.length &&
    !missingDishPromises.length &&
    !workflowRepair &&
    !needsKoftaFormRepair &&
    !needsGrilledMethodRepair &&
    !culinaryRepairs.missingIngredients.length &&
    !culinaryRepairs.steps.length
  ) {
    return recipe;
  }

  let missingIngredients = [...recipe.missing_ingredients];
  let steps = [...recipe.steps];

  if (workflowRepair) {
    for (const ingredient of workflowRepair.requiredIngredients) {
      if (!containsRuleText([...recipe.ingredients, ...missingIngredients], ingredient)) {
        missingIngredients = [...missingIngredients, displayIngredient(ingredient, language)];
      }
    }
    steps = shouldReplaceGenericSteps(steps) ? workflowRepair.steps : [...steps, ...workflowRepair.steps];
  }

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

  for (const promise of missingDishPromises) {
    for (const ingredient of promise.requiredIngredients) {
      if (!containsRuleText([...recipe.ingredients, ...missingIngredients], ingredient)) {
        missingIngredients = [...missingIngredients, displayIngredient(ingredient, language)];
      }
    }
    if (!containsAnyPattern(steps, promise.requiredStepPatterns)) {
      steps = [...steps, language === "Arabic" ? promise.stepArabic : promise.stepEnglish];
    }
  }

  if (needsKoftaFormRepair) {
    const groundIngredient = language === "Arabic" ? "\u0644\u062d\u0645 \u0645\u0641\u0631\u0648\u0645 \u062e\u0634\u0646" : "coarsely ground meat";
    if (!containsAnyPattern([...recipe.ingredients, ...missingIngredients], [/\b(ground|minced|mince)\b/i, /\u0645\u0641\u0631\u0648\u0645/u])) {
      missingIngredients = [...missingIngredients, groundIngredient];
    }
    steps = [
      ...steps,
      language === "Arabic"
        ? "\u0642\u0637\u0639 \u0627\u0644\u0644\u062d\u0645 \u0623\u0648 \u0627\u0644\u0633\u062a\u064a\u0643 \u0625\u0644\u0649 \u0645\u0643\u0639\u0628\u0627\u062a \u0635\u063a\u064a\u0631\u0629\u060c \u062b\u0645 \u0627\u0641\u0631\u0645\u0647 \u0641\u0631\u0645\u0627 \u062e\u0634\u0646\u0627 \u0628\u0627\u0644\u0633\u0643\u064a\u0646 \u0623\u0648 \u0628\u0646\u0628\u0636\u0627\u062a \u0642\u0635\u064a\u0631\u0629 \u0641\u064a \u0645\u062d\u0636\u0631 \u0627\u0644\u0637\u0639\u0627\u0645 \u0642\u0628\u0644 \u062e\u0644\u0637\u0647 \u0645\u0639 \u062a\u0648\u0627\u0628\u0644 \u0627\u0644\u0643\u0641\u062a\u0629."
        : "Cut the steak or intact meat into small cubes, then mince it coarsely with a knife or short pulses in a food processor before mixing it with the kofta seasoning."
    ];
  }

  if (needsGrilledMethodRepair) {
    steps = [
      ...steps,
      language === "Arabic"
        ? "\u0644\u0623\u0646 \u0627\u0644\u0637\u0628\u0642 \u0645\u0634\u0648\u064a\u060c \u0627\u0637\u0647\u0647 \u0639\u0644\u0649 \u0634\u0648\u0627\u064a\u0629 \u0623\u0648 \u0637\u0627\u0633\u0629 \u0634\u0648\u0627\u0621 \u0633\u0627\u062e\u0646\u0629 \u0623\u0648 \u062a\u062d\u062a \u0627\u0644\u0634\u0648\u0627\u064a\u0629 \u0627\u0644\u0639\u0644\u0648\u064a\u0629\u060c \u0645\u0639 \u0627\u0644\u062a\u0642\u0644\u064a\u0628 \u062d\u062a\u0649 \u062a\u0638\u0647\u0631 \u0639\u0644\u0627\u0645\u0627\u062a \u0634\u0648\u0627\u0621 \u0648\u062d\u0648\u0627\u0641 \u0645\u062a\u062d\u0645\u0631\u0629\u060c \u0648\u0644\u0627 \u062a\u0639\u062a\u0645\u062f \u0639\u0644\u0649 \u0627\u0644\u062e\u0628\u0632 \u0641\u064a \u0635\u064a\u0646\u064a\u0629 \u0643\u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u0637\u0647\u064a \u0627\u0644\u0623\u0633\u0627\u0633\u064a\u0629."
        : "Because the dish is named grilled, cook it on a hot grill, grill pan, or under the broiler, turning until grill marks and charred edges appear; do not use baking in a pan as the primary cooking method."
    ];
  }

  missingIngredients = [...missingIngredients, ...culinaryRepairs.missingIngredients];
  steps = [...steps, ...culinaryRepairs.steps];

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

function findDishWorkflowRepair<T extends RecipeLike | LocalizedRecipeVariant>(
  recipe: T,
  titleSource: string,
  language: "Arabic" | "English"
) {
  const rule = DISH_WORKFLOW_RULES.find((entry) => entry.titlePatterns.some((pattern) => pattern.test(titleSource)));
  if (!rule) return null;

  const hasWorkflow = containsAnyPattern(recipe.steps, rule.stepPatterns);
  const needsRequiredIngredient = rule.requiredIngredients.some(
    (ingredient) => !containsRuleText([...recipe.ingredients, ...recipe.missing_ingredients], ingredient)
  );
  if (!needsRequiredIngredient && hasWorkflow && !shouldReplaceGenericSteps(recipe.steps)) return null;

  return {
    requiredIngredients: rule.requiredIngredients,
    steps: language === "Arabic" ? rule.stepsArabic : rule.stepsEnglish
  };
}

function shouldReplaceGenericSteps(steps: string[]) {
  const joined = steps.join(" ");
  const genericHits = [
    /\bprep for\b/i,
    /\bmeasure 1 serving\b/i,
    /\bkeep .* nearby so each addition is ready\b/i,
    /\badd .* first and cook for 4 to 6 minutes\b/i,
    /\badd .* with 2 tbsp water\b/i,
    /\bfold in .* in small handfuls\b/i,
    /\u062d\u0636\u0631\s/u,
    /\u0642\u0633\s+\u062d\u0635\u0629/u,
    /\u0628\u062c\u0627\u0646\u0628\u0643\s+\u062d\u062a\u0649\s+\u062a\u0643\u0648\u0646\s+\u0627\u0644\u0625\u0636\u0627\u0641\u0627\u062a\s+\u062c\u0627\u0647\u0632\u0629/u,
    /\u0623\u0636\u0641\s+.+\s+\u0623\u0648\u0644\u0627\s+\u0648\u0627\u0637\u0647/u,
    /\u0645\u0644\u0639\u0642\u062a\u064a\u0646\s+\u0643\u0628\u064a\u0631\u062a\u064a\u0646\s+\u0645\u0646\s+\u0627\u0644\u0645\u0627\u0621/u
  ].filter((pattern) => pattern.test(joined)).length;
  return genericHits >= 2;
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

function buildCulinaryLogicRepairs<T extends RecipeLike | LocalizedRecipeVariant>(
  recipe: T,
  titleSource: string,
  language: "Arabic" | "English"
) {
  const allText = [
    titleSource,
    ...recipe.ingredients,
    ...recipe.missing_ingredients,
    ...recipe.steps
  ].join(" ");
  const titleText = titleSource.toLowerCase();
  const stepsText = recipe.steps.join(" ").toLowerCase();
  const missingIngredients: string[] = [];
  const steps: string[] = [];

  const addMissing = (english: string, arabic: string) => {
    const value = language === "Arabic" ? arabic : english;
    if (!containsAnyPattern([...recipe.ingredients, ...recipe.missing_ingredients, ...missingIngredients], [new RegExp(escapeRegExp(english), "i"), new RegExp(escapeRegExp(arabic), "u")])) {
      missingIngredients.push(value);
    }
  };
  const addStep = (english: string, arabic: string) => {
    steps.push(language === "Arabic" ? arabic : english);
  };

  if (promisesStewOrBraise(titleText) && hasSlowMeatCue(allText) && !hasLongSimmerCue(stepsText)) {
    addMissing("broth or tomato cooking liquid", "\u0645\u0631\u0642 \u0623\u0648 \u0635\u0644\u0635\u0629 \u0637\u0645\u0627\u0637\u0645 \u0644\u0644\u062a\u0633\u0628\u064a\u0643");
    addStep(
      "For the stew or braise, brown the meat first, then add broth or tomato cooking liquid, cover, and simmer gently for 60 to 120 minutes until the meat is fork-tender; a 4 to 6 minute cook is only a sear, not the full stew.",
      "\u0644\u0644\u064a\u062e\u0646\u0629 \u0623\u0648 \u0627\u0644\u062a\u0633\u0628\u064a\u0643\u060c \u062d\u0645\u0631 \u0627\u0644\u0644\u062d\u0645 \u0623\u0648\u0644\u0627\u060c \u062b\u0645 \u0623\u0636\u0641 \u0627\u0644\u0645\u0631\u0642 \u0623\u0648 \u0635\u0644\u0635\u0629 \u0627\u0644\u0637\u0645\u0627\u0637\u0645\u060c \u063a\u0637 \u0627\u0644\u0642\u062f\u0631 \u0648\u0627\u0637\u0647\u0650 60 \u0625\u0644\u0649 120 \u062f\u0642\u064a\u0642\u0629 \u062d\u062a\u0649 \u064a\u0635\u0628\u062d \u0627\u0644\u0644\u062d\u0645 \u0637\u0631\u064a\u0627\u061b 4 \u0625\u0644\u0649 6 \u062f\u0642\u0627\u0626\u0642 \u062a\u0643\u0641\u064a \u0644\u0644\u062a\u062d\u0645\u064a\u0631 \u0641\u0642\u0637 \u0648\u0644\u064a\u0633\u062a \u0637\u0647\u064a \u0627\u0644\u064a\u062e\u0646\u0629."
    );
  }

  if (promisesStewOrBraise(titleText) && hasSeafoodCue(allText) && !hasSeafoodLateCue(stepsText)) {
    addStep(
      "For a seafood stew, build and simmer the sauce first, then add shrimp or fish only during the final 4 to 7 minutes so it stays tender instead of rubbery or dry.",
      "\u0644\u064a\u062e\u0646\u0629 \u0627\u0644\u0633\u064a \u0641\u0648\u062f\u060c \u0627\u0628\u0646 \u0627\u0644\u0635\u0644\u0635\u0629 \u0648\u0633\u0628\u0643\u0647\u0627 \u0623\u0648\u0644\u0627\u060c \u062b\u0645 \u0623\u0636\u0641 \u0627\u0644\u062c\u0645\u0628\u0631\u064a \u0623\u0648 \u0627\u0644\u0633\u0645\u0643 \u0641\u064a \u0622\u062e\u0631 4 \u0625\u0644\u0649 7 \u062f\u0642\u0627\u0626\u0642 \u0641\u0642\u0637 \u0644\u064a\u0628\u0642\u0649 \u0637\u0631\u064a\u0627."
    );
  }

  if (promisesCurry(titleText) && !containsAnyPattern(recipe.steps, [/\b(curry|masala|spice|bloom|simmer|coconut|tomato)\b/i, /\u0643\u0627\u0631\u064a|\u0645\u0633\u0627\u0644\u0627|\u062a\u0648\u0627\u0628\u0644|\u0628\u0647\u0627\u0631/u])) {
    addMissing("curry spices", "\u0628\u0647\u0627\u0631\u0627\u062a \u0643\u0627\u0631\u064a");
    addStep(
      "For the curry, bloom the curry spices in the oil for 30 to 60 seconds, add the sauce base such as tomato, yogurt, coconut milk, or broth, then simmer until the sauce coats the main ingredient.",
      "\u0644\u0644\u0643\u0627\u0631\u064a\u060c \u062d\u0645\u0635 \u0628\u0647\u0627\u0631\u0627\u062a \u0627\u0644\u0643\u0627\u0631\u064a \u0641\u064a \u0627\u0644\u0632\u064a\u062a 30 \u0625\u0644\u0649 60 \u062b\u0627\u0646\u064a\u0629\u060c \u062b\u0645 \u0623\u0636\u0641 \u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u0635\u0644\u0635\u0629 \u0645\u062b\u0644 \u0627\u0644\u0637\u0645\u0627\u0637\u0645 \u0623\u0648 \u0627\u0644\u0632\u0628\u0627\u062f\u064a \u0623\u0648 \u062d\u0644\u064a\u0628 \u0627\u0644\u062c\u0648\u0632 \u0623\u0648 \u0627\u0644\u0645\u0631\u0642\u060c \u0648\u0633\u0628\u0643\u0647\u0627 \u062d\u062a\u0649 \u062a\u063a\u0637\u064a \u0627\u0644\u0645\u0643\u0648\u0646 \u0627\u0644\u0631\u0626\u064a\u0633\u064a."
    );
  }

  if (promisesFriedOrCrispy(titleText) && !containsAnyPattern(recipe.steps, [/\b(fry|fried|pan-fry|air-fry|crisp|bread|coat|oil)\b/i, /\u0642\u0644\u064a|\u0645\u0642\u0644\u064a|\u0645\u0642\u0631\u0645\u0634|\u063a\u0637/u])) {
    addStep(
      "For the fried or crispy promise, dry the main ingredient, coat or season it as needed, then pan-fry, air-fry, or bake-crisp with measured oil until the outside is crisp and the center is cooked.",
      "\u0644\u0648\u0639\u062f \u0627\u0644\u0642\u0644\u064a \u0623\u0648 \u0627\u0644\u0642\u0631\u0645\u0634\u0629\u060c \u062c\u0641\u0641 \u0627\u0644\u0645\u0643\u0648\u0646 \u0627\u0644\u0631\u0626\u064a\u0633\u064a\u060c \u063a\u0637\u0647 \u0623\u0648 \u062a\u0628\u0644\u0647 \u062d\u0633\u0628 \u0627\u0644\u0648\u0635\u0641\u0629\u060c \u062b\u0645 \u0627\u0642\u0644\u0647 \u0641\u064a \u0645\u0642\u0644\u0627\u0629 \u0623\u0648 \u0642\u0644\u0627\u064a\u0629 \u0647\u0648\u0627\u0626\u064a\u0629 \u0623\u0648 \u0627\u062e\u0628\u0632\u0647 \u0628\u0642\u0644\u064a\u0644 \u0645\u0646 \u0627\u0644\u0632\u064a\u062a \u062d\u062a\u0649 \u064a\u0642\u0631\u0645\u0634 \u0627\u0644\u062e\u0627\u0631\u062c \u0648\u064a\u0646\u0636\u062c \u0627\u0644\u062f\u0627\u062e\u0644."
    );
  }

  if (promisesCreamyOrCheesy(titleText) && !containsAnyPattern([...recipe.ingredients, ...recipe.missing_ingredients], [/\b(cream|milk|yogurt|cheese|parmesan|mozzarella|bechamel)\b/i, /\u0643\u0631\u064a\u0645\u0629|\u062d\u0644\u064a\u0628|\u0632\u0628\u0627\u062f\u064a|\u062c\u0628\u0646|\u0628\u0634\u0627\u0645\u064a\u0644/u])) {
    addMissing(titleText.includes("chees") ? "cheese" : "milk or yogurt for creamy sauce", titleText.includes("chees") ? "\u062c\u0628\u0646" : "\u062d\u0644\u064a\u0628 \u0623\u0648 \u0632\u0628\u0627\u062f\u064a \u0644\u0635\u0644\u0635\u0629 \u0643\u0631\u064a\u0645\u064a\u0629");
    addStep(
      "For the creamy or cheesy finish, whisk the dairy or healthy substitute into the sauce off high heat, then warm gently until glossy and coating the food without splitting.",
      "\u0644\u0644\u0642\u0648\u0627\u0645 \u0627\u0644\u0643\u0631\u064a\u0645\u064a \u0623\u0648 \u0627\u0644\u062c\u0628\u0646\u064a\u060c \u0627\u062e\u0641\u0642 \u0627\u0644\u0623\u0644\u0628\u0627\u0646 \u0623\u0648 \u0627\u0644\u0628\u062f\u064a\u0644 \u0627\u0644\u0635\u062d\u064a \u0641\u064a \u0627\u0644\u0635\u0644\u0635\u0629 \u0628\u0639\u064a\u062f\u0627 \u0639\u0646 \u0627\u0644\u0646\u0627\u0631 \u0627\u0644\u0639\u0627\u0644\u064a\u0629\u060c \u062b\u0645 \u0633\u062e\u0646\u0647\u0627 \u0628\u0647\u062f\u0648\u0621 \u062d\u062a\u0649 \u062a\u0635\u0628\u062d \u0644\u0627\u0645\u0639\u0629 \u0648\u062a\u063a\u0637\u064a \u0627\u0644\u0637\u0639\u0627\u0645 \u0628\u062f\u0648\u0646 \u0623\u0646 \u062a\u0646\u0641\u0635\u0644."
    );
  }

  if (promisesStuffed(titleText) && !containsAnyPattern(recipe.steps, [/\b(hollow|stuff|fill|filling|roll)\b/i, /\u0627\u062d\u0634|\u062d\u0634\u0648|\u0645\u062d\u0634\u064a|\u0644\u0641/u])) {
    addStep(
      "For the stuffed dish, hollow, split, or flatten the wrapper/vegetable, prepare the filling separately, pack it firmly without tearing, then bake, simmer, or grill until the filling is cooked through.",
      "\u0644\u0644\u0637\u0628\u0642 \u0627\u0644\u0645\u062d\u0634\u064a\u060c \u0641\u0631\u063a \u0623\u0648 \u0627\u0634\u0642\u0642 \u0623\u0648 \u0627\u0641\u0631\u062f \u0627\u0644\u063a\u0644\u0627\u0641 \u0623\u0648 \u0627\u0644\u062e\u0636\u0627\u0631\u060c \u062d\u0636\u0631 \u0627\u0644\u062d\u0634\u0648\u0629 \u0645\u0646\u0641\u0635\u0644\u0629\u060c \u0627\u062d\u0634\u0647\u0627 \u0628\u062b\u0628\u0627\u062a \u062f\u0648\u0646 \u062a\u0645\u0632\u064a\u0642\u060c \u062b\u0645 \u0627\u062e\u0628\u0632 \u0623\u0648 \u0633\u0628\u0643 \u0623\u0648 \u0627\u0634\u0648 \u062d\u062a\u0649 \u062a\u0646\u0636\u062c \u0627\u0644\u062d\u0634\u0648\u0629."
    );
  }

  if (promisesBbqOrSmoked(titleText) && !containsAnyPattern(recipe.steps, [/\b(bbq|barbecue|smoke|smoked|char|glaze|sauce)\b/i, /\u0628\u0627\u0631\u0628\u064a\u0643\u064a\u0648|\u0645\u062f\u062e\u0646|\u062a\u062f\u062e\u064a\u0646|\u0635\u0644\u0635\u0629/u])) {
    addMissing("BBQ sauce or smoky spice rub", "\u0635\u0644\u0635\u0629 \u0628\u0627\u0631\u0628\u064a\u0643\u064a\u0648 \u0623\u0648 \u062e\u0644\u0637\u0629 \u062a\u0648\u0627\u0628\u0644 \u0645\u062f\u062e\u0646\u0629");
    addStep(
      "For the BBQ or smoked identity, coat the main ingredient with a smoky spice rub or BBQ sauce, cook over grill heat or under the broiler, and brush again near the end until sticky and lightly charred.",
      "\u0644\u0647\u0648\u064a\u0629 \u0627\u0644\u0628\u0627\u0631\u0628\u064a\u0643\u064a\u0648 \u0623\u0648 \u0627\u0644\u062a\u062f\u062e\u064a\u0646\u060c \u063a\u0637 \u0627\u0644\u0645\u0643\u0648\u0646 \u0627\u0644\u0631\u0626\u064a\u0633\u064a \u0628\u062e\u0644\u0637\u0629 \u062a\u0648\u0627\u0628\u0644 \u0645\u062f\u062e\u0646\u0629 \u0623\u0648 \u0635\u0644\u0635\u0629 \u0628\u0627\u0631\u0628\u064a\u0643\u064a\u0648\u060c \u0627\u0637\u0647\u0647 \u0639\u0644\u0649 \u0627\u0644\u0634\u0648\u0627\u064a\u0629 \u0623\u0648 \u062a\u062d\u062a \u0627\u0644\u0634\u0648\u0627\u064a\u0629 \u0627\u0644\u0639\u0644\u0648\u064a\u0629\u060c \u0648\u0627\u062f\u0647\u0646\u0647 \u0645\u0631\u0629 \u0623\u062e\u064a\u0631\u0629 \u0642\u0631\u0628 \u0627\u0644\u0646\u0647\u0627\u064a\u0629 \u062d\u062a\u0649 \u064a\u0635\u0628\u062d \u0644\u0627\u0635\u0642\u0627 \u0648\u0645\u062a\u062d\u0645\u0631\u0627."
    );
  }

  if (promisesSoup(titleText) && !containsAnyPattern(recipe.steps, [/\b(broth|stock|simmer|soup|ladle)\b/i, /\u0645\u0631\u0642|\u0634\u0648\u0631\u0628\u0629|\u063a\u0644\u064a|\u0633\u0628\u0643/u])) {
    addMissing("broth or stock", "\u0645\u0631\u0642");
    addStep(
      "For the soup, add broth or stock, simmer the aromatics and main ingredient until the broth tastes developed, then ladle with the solids evenly distributed.",
      "\u0644\u0644\u0634\u0648\u0631\u0628\u0629\u060c \u0623\u0636\u0641 \u0627\u0644\u0645\u0631\u0642\u060c \u0648\u0627\u0637\u0647 \u0627\u0644\u0639\u0637\u0631\u064a\u0627\u062a \u0648\u0627\u0644\u0645\u0643\u0648\u0646 \u0627\u0644\u0631\u0626\u064a\u0633\u064a \u0639\u0644\u0649 \u063a\u0644\u064a\u0627\u0646 \u0647\u0627\u062f\u0626 \u062d\u062a\u0649 \u064a\u062a\u0637\u0648\u0631 \u0637\u0639\u0645 \u0627\u0644\u0645\u0631\u0642\u060c \u062b\u0645 \u0642\u062f\u0645\u0647\u0627 \u0645\u0639 \u062a\u0648\u0632\u064a\u0639 \u0627\u0644\u0645\u0643\u0648\u0646\u0627\u062a \u0628\u0627\u0644\u062a\u0633\u0627\u0648\u064a."
    );
  }

  return {
    missingIngredients,
    steps
  };
}

function promisesStewOrBraise(value: string) {
  return /\b(stew|stewed|braise|braised|tagine|tajine|ragout|goulash)\b|\u064a\u062e\u0646\u0629|\u0637\u0627\u062c\u0646/u.test(value);
}

function promisesCurry(value: string) {
  return /\b(curry|masala|korma|vindaloo)\b|\u0643\u0627\u0631\u064a|\u0645\u0633\u0627\u0644\u0627/u.test(value);
}

function promisesFriedOrCrispy(value: string) {
  return /\b(fried|crispy|crisp|breaded|cutlet|tempura|crusted)\b|\u0645\u0642\u0644\u064a|\u0645\u0642\u0631\u0645\u0634|\u0628\u0627\u0646\u064a\u0647/u.test(value);
}

function promisesCreamyOrCheesy(value: string) {
  return /\b(creamy|cream|cheesy|cheese|alfredo|bechamel|parmesan|gratin)\b|\u0643\u0631\u064a\u0645\u064a|\u062c\u0628\u0646|\u0628\u0634\u0627\u0645\u064a\u0644/u.test(value);
}

function promisesStuffed(value: string) {
  return /\b(stuffed|filled|dolma|mahshi|rolls?)\b|\u0645\u062d\u0634\u064a|\u0645\u062d\u0634\u064a\u0629|\u0645\u0644\u0641\u0648\u0641/u.test(value);
}

function promisesBbqOrSmoked(value: string) {
  return /\b(bbq|barbecue|smoked|smoky)\b|\u0628\u0627\u0631\u0628\u064a\u0643\u064a\u0648|\u0645\u062f\u062e\u0646/u.test(value);
}

function promisesSoup(value: string) {
  return /\b(soup|broth|chowder|bisque)\b|\u0634\u0648\u0631\u0628\u0629|\u0645\u0631\u0642/u.test(value);
}

function hasSlowMeatCue(value: string) {
  return /\b(beef|steak|lamb|mutton|veal|meat cubes|stew meat|roast)\b|\u0644\u062d\u0645|\u0633\u062a\u064a\u0643|\u0636\u0627\u0646\u064a/u.test(value);
}

function hasSeafoodCue(value: string) {
  return /\b(shrimp|prawn|fish|salmon|tilapia|cod|seafood)\b|\u062c\u0645\u0628\u0631\u064a|\u0633\u0645\u0643|\u0633\u0644\u0645\u0648\u0646|\u0633\u064a \u0641\u0648\u062f/u.test(value);
}

function hasLongSimmerCue(value: string) {
  return /\b(?:4[5-9]|[5-9]\d|1[0-2]\d)\s*(?:to|-)?\s*(?:\d+)?\s*(?:minutes|min)\b|\b(?:1|2)\s*(?:to|-)?\s*(?:2|3)?\s*hours?\b|\bfork-tender\b|\blong simmer\b/i.test(value);
}

function hasSeafoodLateCue(value: string) {
  return /\b(final|last)\s+(?:\d+\s+)?(?:to|-)?\s*\d+\s*(?:minutes|min)\b|\bnear the end\b|\bovercook\b/i.test(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titlePromisesKoftaForm(value: string) {
  return /\b(?:kofta|kafta|kofte|kefta|kebab)\b|\u0643\u0641\u062a(?:\u0629|\u0647)|\u0643\u0628\u0627\u0628/iu.test(value);
}

function hasGroundMeatCue(values: string[]) {
  return containsAnyPattern(values, [
    /\b(?:ground|minced|mince|finely chopped|coarsely ground)\b/i,
    /\u0645\u0641\u0631\u0648\u0645|\u0641\u0631\u0645/u
  ]);
}

function titlePromisesGrilledMethod(value: string) {
  return /\b(?:grilled|grill|charred|meshwi|mashwi)\b|\u0645\u0634\u0648\u064a|\u0645\u0634\u0648\u064a\u0629/iu.test(value);
}

function stepsUseGrilledMethod(steps: string[]) {
  return containsAnyPattern(steps, [
    /\b(?:grill|grilled|grill pan|broil|broiler|char|charred|skewer)\b/i,
    /\u0634\u0648\u0627\u064a\u0629|\u0645\u0634\u0648\u064a|\u0623\u0633\u064a\u0627\u062e|\u0633\u064a\u062e/u
  ]);
}
