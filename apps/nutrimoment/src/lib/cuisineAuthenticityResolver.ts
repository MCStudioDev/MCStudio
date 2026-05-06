import { ensureArabicRecipeLanguage, isArabicRecipeLanguage } from "@/lib/arabicRecipeLocalization";
import { getCompleteCuisineCatalog, getDishById } from "@/lib/cuisineCatalogs/completeCatalogs";
import type { CuisineDish } from "@/lib/cuisineCatalogs/types";
import type { Recipe } from "@/lib/types";

export interface CuisineAuthenticityInput {
  cuisine?: string;
  ingredients: string[];
  mealType?: string;
}

export interface AuthenticCuisineDishCandidate {
  aliases: string[];
  cuisine: string;
  dish: CuisineDish;
  dishId: string;
  dishName: string;
  matchedOptional: string[];
  matchedRequired: string[];
  missingRequired: string[];
  score: number;
  strongRule?: string;
}

const AUTHENTICITY_REWRITE_SCORE = 150;
const AUTHENTICITY_PROMPT_LOCK_SCORE = 170;

const INGREDIENT_ALIASES: Record<string, string[]> = {
  chicken: ["chicken", "poultry", "دجاج"],
  egg: ["egg", "eggs", "بيض"],
  eggplant: ["eggplant", "aubergine", "باذنجان"],
  jameed: ["jameed", "fermented yogurt", "dried yogurt", "جميد"],
  lamb: ["lamb", "mutton", "لحم ضأن", "لحم غنم"],
  pepper: ["pepper", "peppers", "bell pepper", "green pepper", "فلفل"],
  bread: ["bread", "baladi bread", "pita", "flatbread", "dough", "aish", "عيش", "خبز"],
  bulgur: ["bulgur", "burghul", "borghol", "برغل"],
  fava: ["fava", "fava bean", "fava beans", "ful", "foul", "broad bean", "فول"],
  beef: ["beef", "meat", "ground beef", "minced beef"],
  "ground beef": ["ground beef", "ground meat", "minced meat", "meat", "beef"],
  "ground meat": ["ground meat", "ground beef", "minced meat", "minced beef", "beef mince", "lamb mince", "لحم مفروم"],
  lentil: ["lentil", "lentils", "عدس"],
  parsley: ["parsley", "بقدونس"],
  pasta: ["pasta", "macaroni", "spaghetti", "penne", "مكرونة"],
  rice: ["rice", "رز", "أرز", "ارز"],
  tomato: ["tomato", "tomatoes", "طماطم"],
  onion: ["onion", "onions", "بصل"]
};

const STRONG_AUTHENTICITY_RULES: Array<{
  cuisine: string;
  dishId: string;
  groups: string[][];
  label: string;
  scoreBoost: number;
}> = [
  {
    cuisine: "egyptian",
    dishId: "hawawshi",
    groups: [INGREDIENT_ALIASES["ground meat"], INGREDIENT_ALIASES.bread],
    label: "egyptian-ground-meat-flatbread",
    scoreBoost: 110
  },
  {
    cuisine: "egyptian",
    dishId: "fattah",
    groups: [INGREDIENT_ALIASES.bread, INGREDIENT_ALIASES.rice, INGREDIENT_ALIASES["ground meat"]],
    label: "egyptian-bread-rice-meat",
    scoreBoost: 65
  },
  {
    cuisine: "egyptian",
    dishId: "koftet-roz",
    groups: [INGREDIENT_ALIASES["ground meat"], INGREDIENT_ALIASES.rice],
    label: "egyptian-ground-meat-rice",
    scoreBoost: 100
  },
  {
    cuisine: "egyptian",
    dishId: "ful-medames",
    groups: [INGREDIENT_ALIASES.fava],
    label: "egyptian-fava-beans",
    scoreBoost: 120
  },
  {
    cuisine: "egyptian",
    dishId: "koshary",
    groups: [INGREDIENT_ALIASES.rice, INGREDIENT_ALIASES.pasta, INGREDIENT_ALIASES.lentil],
    label: "egyptian-rice-pasta-lentils",
    scoreBoost: 125
  },
  {
    cuisine: "turkish",
    dishId: "cig-kofte",
    groups: [INGREDIENT_ALIASES["ground meat"], INGREDIENT_ALIASES.bulgur],
    label: "turkish-ground-meat-bulgur",
    scoreBoost: 140
  },
  {
    cuisine: "turkish",
    dishId: "menemen",
    groups: [INGREDIENT_ALIASES.egg, INGREDIENT_ALIASES.tomato, INGREDIENT_ALIASES.pepper],
    label: "turkish-egg-tomato-pepper",
    scoreBoost: 135
  },
  {
    cuisine: "middleEastern",
    dishId: "tabbouleh",
    groups: [INGREDIENT_ALIASES.parsley, INGREDIENT_ALIASES.bulgur, INGREDIENT_ALIASES.tomato],
    label: "levantine-parsley-bulgur-tomato",
    scoreBoost: 115
  },
  {
    cuisine: "middleEastern",
    dishId: "mujaddara",
    groups: [INGREDIENT_ALIASES.lentil, INGREDIENT_ALIASES.rice, INGREDIENT_ALIASES.onion],
    label: "levantine-lentils-rice-onions",
    scoreBoost: 135
  },
  {
    cuisine: "middleEastern",
    dishId: "maqluba",
    groups: [INGREDIENT_ALIASES.rice, INGREDIENT_ALIASES.eggplant, INGREDIENT_ALIASES.chicken],
    label: "levantine-rice-eggplant-chicken",
    scoreBoost: 135
  },
  {
    cuisine: "middleEastern",
    dishId: "mansaf",
    groups: [INGREDIENT_ALIASES.lamb, INGREDIENT_ALIASES.jameed, INGREDIENT_ALIASES.rice],
    label: "jordanian-lamb-jameed-rice",
    scoreBoost: 140
  }
];

export function resolveAuthenticCuisineDishes(input: CuisineAuthenticityInput, limit = 10): AuthenticCuisineDishCandidate[] {
  const catalog = getCompleteCuisineCatalog(input.cuisine ?? "");
  if (!catalog?.length) return [];

  const normalizedIngredients = normalizeIngredientSet(input.ingredients);
  if (!normalizedIngredients.length) return [];

  return catalog
    .map((dish) => scoreAuthenticDishCandidate(dish, normalizedIngredients, input))
    .filter((candidate): candidate is AuthenticCuisineDishCandidate => Boolean(candidate && candidate.score > 0))
    .sort((left, right) => right.score - left.score || left.dishName.localeCompare(right.dishName))
    .slice(0, limit);
}

export function buildCanonicalDishPromptHint(candidates: AuthenticCuisineDishCandidate[]) {
  const locked = candidates.find((candidate) => candidate.score >= AUTHENTICITY_PROMPT_LOCK_SCORE);
  if (locked) {
    const alternatives = candidates
      .filter((candidate) => candidate.dish.id !== locked.dish.id)
      .filter((candidate) => candidate.strongRule || candidate.matchedRequired.length >= 2 || candidate.score >= AUTHENTICITY_REWRITE_SCORE)
      .slice(0, 6)
      .map((candidate) => `${candidate.dishName} (${candidate.matchedRequired.join(", ") || "support match"})`)
      .join(" | ");
    return [
      `Canonical authenticity lock: the pantry strongly maps to ${locked.dishName}.`,
      `The first or strongest recipe MUST use this exact dish family and dish_intent.dish_name: ${locked.dishName}.`,
      `Do not repeat ${locked.dishName}; all remaining recipes must use different real dish families or different cooking forms.`,
      alternatives ? `Other canonical pantry-compatible options to consider for later slots: ${alternatives}.` : "",
      `Use missing_ingredients for authentic support items instead of renaming it. Signals: ${locked.matchedRequired.join(", ")}.`
    ].join(" ");
  }

  if (!candidates.length) return "";

  return `Canonical authenticity candidates: ${candidates
    .slice(0, 6)
    .map((candidate, index) => `${index + 1}. ${candidate.dishName} (${candidate.cuisine}; score ${Math.round(candidate.score)}; matches ${candidate.matchedRequired.join(", ") || "none"})`)
    .join(" | ")}. Use these exact dish names when they fit; do not invent branded or heritage-style names.`;
}

export function applyCuisineAuthenticityGate(
  recipes: Recipe[],
  input: {
    availableIngredients: string[];
    preferredCuisine?: string;
    recipeLanguage?: string;
  }
) {
  const wantsArabic = isArabicRecipeLanguage(input.recipeLanguage);

  return recipes.map((recipe) => {
    const cuisine = input.preferredCuisine && input.preferredCuisine !== "Any" ? input.preferredCuisine : recipe.cuisine;
    const candidates = resolveAuthenticCuisineDishes({
      cuisine,
      ingredients: [
        ...input.availableIngredients,
        ...recipe.ingredients
      ],
      mealType: recipe.dish_intent?.meal_type
    });
    const best = candidates[0];
    if (!best || best.score < AUTHENTICITY_REWRITE_SCORE) return recipe;
    if (recipeMatchesAuthenticDish(recipe, best)) return recipe;

    const repaired = rewriteRecipeToAuthenticDish(recipe, best, input.availableIngredients);
    return wantsArabic ? ensureArabicRecipeLanguage(applyNativeDishName(repaired, best)) : repaired;
  });
}

export function enforceAuthenticCuisineRecipeSet(
  recipes: Recipe[],
  input: {
    availableIngredients: string[];
    preferredCuisine?: string;
    recipeLanguage?: string;
    recipeCount?: number;
  }
) {
  const cuisine = input.preferredCuisine && input.preferredCuisine !== "Any" ? input.preferredCuisine : recipes[0]?.cuisine;
  const candidates = resolveAuthenticCuisineDishes({
    cuisine,
    ingredients: input.availableIngredients
  }, Math.max(12, recipes.length * 3));
  if (!candidates.length) {
    return applyCuisineAuthenticityGate(recipes, input).slice(0, input.recipeCount ?? recipes.length);
  }

  const wantsArabic = isArabicRecipeLanguage(input.recipeLanguage);
  const usedFamilies = new Set<string>();
  let nextCandidateIndex = 0;

  const nextUnusedCandidate = () => {
    while (nextCandidateIndex < candidates.length) {
      const candidate = candidates[nextCandidateIndex];
      nextCandidateIndex += 1;
      if (!candidate || usedFamilies.has(candidate.dish.id)) continue;
      if (!isPantrySupportedCandidate(candidate)) continue;
      return candidate;
    }
    return null;
  };

  const repaired = recipes.map((recipe) => {
    const matchedCandidate = candidates.find((candidate) => recipeMatchesAuthenticDish(recipe, candidate));
    const matchedFamily = matchedCandidate?.dish.id;
    const duplicateFamily = Boolean(matchedFamily && usedFamilies.has(matchedFamily));
    const weakRecipe = isWeakGeneratedRecipeIdentity(recipe, input.availableIngredients);

    if (matchedCandidate && !duplicateFamily && !weakRecipe) {
      usedFamilies.add(matchedCandidate.dish.id);
      return recipe;
    }

    const replacement = nextUnusedCandidate();
    if (replacement && (duplicateFamily || weakRecipe || replacement.score >= AUTHENTICITY_REWRITE_SCORE)) {
      usedFamilies.add(replacement.dish.id);
      const rewritten = rewriteRecipeToAuthenticDish(recipe, replacement, input.availableIngredients);
      return wantsArabic ? ensureArabicRecipeLanguage(applyNativeDishName(rewritten, replacement)) : rewritten;
    }

    if (matchedCandidate) {
      usedFamilies.add(matchedCandidate.dish.id);
    }
    return recipe;
  });

  return repaired.slice(0, input.recipeCount ?? recipes.length);
}

export function recipeMatchesAuthenticDish(recipe: Recipe, candidate: AuthenticCuisineDishCandidate) {
  const recipeNames = [
    recipe.name,
    recipe.dish_intent?.dish_name,
    recipe.image_search_index,
    ...(recipe.image_search_indices ?? []),
    recipe.localized?.English?.name,
    recipe.localized?.Arabic?.name,
    recipe.localized?.English?.dish_intent?.dish_name,
    recipe.localized?.Arabic?.dish_intent?.dish_name
  ]
    .map((value) => normalizeText(value ?? ""))
    .filter(Boolean);
  const aliases = candidate.aliases.map(normalizeText).filter(Boolean);

  return recipeNames.some((name) =>
    aliases.some((alias) => name === alias || name.includes(alias) || alias.includes(name))
  );
}

function scoreAuthenticDishCandidate(
  dish: CuisineDish,
  normalizedIngredients: string[],
  input: CuisineAuthenticityInput
): AuthenticCuisineDishCandidate | null {
  const requiredAnchors = normalizeDishIngredientAnchors(dish.primaryIngredients);
  const optionalAnchors = normalizeDishIngredientAnchors(dish.optionalIngredients);
  const matchedRequired = requiredAnchors.filter((anchor) => ingredientListIncludes(normalizedIngredients, anchor));
  const matchedOptional = optionalAnchors.filter((anchor) => ingredientListIncludes(normalizedIngredients, anchor));
  const missingRequired = requiredAnchors.filter((anchor) => !matchedRequired.includes(anchor));
  const strongRule = getStrongRuleHit(dish, normalizedIngredients);

  if (!matchedRequired.length && !matchedOptional.length && !strongRule) return null;

  const mealType = input.mealType;
  const mealTypeBonus =
    mealType && dish.mealTypes.some((type) => normalizeText(type) === normalizeText(mealType))
      ? 12
      : 0;
  const structuralPenalty = Math.min(missingRequired.length, 3) * 9;
  const score =
    dish.iconicScore +
    matchedRequired.length * 32 +
    matchedOptional.length * 8 +
    mealTypeBonus +
    (strongRule?.scoreBoost ?? 0) -
    structuralPenalty;

  return {
    aliases: getDishAliases(dish),
    cuisine: dish.cuisine,
    dish,
    dishId: dish.id,
    dishName: getDishDisplayName(dish),
    matchedOptional,
    matchedRequired,
    missingRequired,
    score,
    strongRule: strongRule?.label
  };
}

function getStrongRuleHit(dish: CuisineDish, normalizedIngredients: string[]) {
  return STRONG_AUTHENTICITY_RULES.find((rule) => {
    if (rule.dishId !== dish.id) return false;
    return rule.groups.every((group) => group.some((alias) => ingredientListIncludes(normalizedIngredients, alias)));
  });
}

function rewriteRecipeToAuthenticDish(
  recipe: Recipe,
  candidate: AuthenticCuisineDishCandidate,
  availableIngredients: string[] = []
): Recipe {
  const dishName = candidate.dishName;
  const cuisine = normalizeCuisineDisplay(candidate.dish.cuisine, recipe.cuisine);
  const searchPhrases = buildAuthenticDishImageSearchPhrases(candidate);
  const ownership = buildCandidateIngredientOwnership(candidate.dish, availableIngredients, recipe.missing_ingredients);
  const dishIntent = {
    ...(recipe.dish_intent ?? {
      visual_keywords: [],
      exclude_keywords: []
    }),
    dish_name: dishName,
    cuisine,
    candidate_score: Math.max(recipe.dish_intent?.candidate_score ?? 0, candidate.score),
    candidate_hits: Array.from(
      new Set([
        ...(recipe.dish_intent?.candidate_hits ?? []),
        "authenticity-catalog-match",
        ...(candidate.strongRule ? [candidate.strongRule] : [])
      ])
    ),
    visual_keywords: Array.from(
      new Set([
        dishName,
        `${cuisine} ${dishName}`,
        ...candidate.dish.names.english,
        ...(recipe.dish_intent?.visual_keywords ?? [])
      ])
    ).slice(0, 6),
    exclude_keywords: Array.from(
      new Set([
        ...(recipe.dish_intent?.exclude_keywords ?? []),
        "fake dish",
        "generic bowl",
        "fusion"
      ])
    ).slice(0, 8)
  };

  return {
    ...recipe,
    cuisine,
    dish_intent: dishIntent,
    image_search_index: searchPhrases[0],
    image_search_indices: searchPhrases,
    ingredients: ownership.ingredients,
    missing_ingredients: ownership.missingIngredients,
    localized: recipe.localized
      ? {
          ...recipe.localized,
          English: recipe.localized.English
            ? { ...recipe.localized.English, name: dishName, cuisine, dish_intent: dishIntent }
            : recipe.localized.English
        }
      : recipe.localized,
    name: dishName,
    preference_hits: Array.from(new Set([...(recipe.preference_hits ?? []), "authenticity-catalog-match"])).slice(0, 8)
  };
}

function applyNativeDishName(recipe: Recipe, candidate: AuthenticCuisineDishCandidate): Recipe {
  const nativeName = candidate.dish.names.native.find((name) => name.trim())?.trim();
  if (!nativeName) return recipe;

  return {
    ...recipe,
    name: nativeName,
    dish_intent: recipe.dish_intent
      ? {
          ...recipe.dish_intent,
          dish_name: nativeName
        }
      : recipe.dish_intent
  };
}

function isPantrySupportedCandidate(candidate: AuthenticCuisineDishCandidate) {
  if (candidate.strongRule) return true;
  if (candidate.matchedRequired.length >= 2) return true;
  if (candidate.score >= AUTHENTICITY_REWRITE_SCORE) return true;
  return false;
}

function buildCandidateIngredientOwnership(dish: CuisineDish, availableIngredients: string[], existingMissingIngredients: string[]) {
  const owned: string[] = [];
  const missing: string[] = [];

  for (const ingredient of dish.primaryIngredients) {
    const availableLabel = findAvailableIngredientLabel(ingredient, availableIngredients);
    if (availableLabel) {
      owned.push(availableLabel);
    } else {
      missing.push(ingredient);
    }
  }

  for (const ingredient of dish.optionalIngredients) {
    const availableLabel = findAvailableIngredientLabel(ingredient, availableIngredients);
    if (availableLabel) {
      owned.push(availableLabel);
    }
  }

  const canonicalSupport = new Set(
    [...dish.primaryIngredients, ...dish.optionalIngredients].map((ingredient) => normalizeIngredient(ingredient))
  );
  for (const ingredient of existingMissingIngredients) {
    const normalized = normalizeIngredient(ingredient);
    if (!normalized || !canonicalSupport.has(normalized)) continue;
    if (findAvailableIngredientLabel(ingredient, availableIngredients)) continue;
    missing.push(ingredient);
  }

  return {
    ingredients: dedupeLabels(owned),
    missingIngredients: dedupeLabels(missing)
  };
}

function findAvailableIngredientLabel(
  anchor: string,
  availableIngredients: string[]
) {
  const normalizedAnchor = normalizeIngredient(anchor);
  if (!normalizedAnchor) return "";

  for (const ingredient of availableIngredients) {
    const normalizedIngredient = normalizeIngredient(ingredient);
    if (!normalizedIngredient) continue;
    if (ingredientListIncludes([normalizedIngredient, ...normalizeIngredientSet([ingredient])], normalizedAnchor)) {
      return ingredient;
    }
  }

  return "";
}

function dedupeLabels(values: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    const normalized = normalizeIngredient(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(value);
  }
  return deduped;
}

function isWeakGeneratedRecipeIdentity(recipe: Recipe, availableIngredients: string[]) {
  const names = [
    recipe.name,
    recipe.dish_intent?.dish_name,
    recipe.localized?.English?.name,
    recipe.localized?.Arabic?.name
  ]
    .map((value) => normalizeText(value ?? ""))
    .filter(Boolean);
  if (!names.length) return true;

  return names.some((name) => {
    if (/\b(recipe|dish|plate|bowl|meal|skillet|mix|water)\b/u.test(name)) return true;
    if (/(^|\s)(وصفة|طبق|وجبة|وعاء|ماء)(\s|$)/u.test(name)) return true;
    return isIngredientOnlyTitle(name, availableIngredients);
  });
}

function isIngredientOnlyTitle(name: string, availableIngredients: string[]) {
  const titleTokens = new Set(name.split(/\s+/).filter((token) => token.length > 1));
  if (titleTokens.size === 0 || titleTokens.size > 4) return false;

  const pantryTokens = new Set(
    normalizeIngredientSet([...availableIngredients, "water", "salt", "pepper", "oil", "ماء", "ملح", "فلفل", "زيت"])
      .flatMap((ingredient) => ingredient.split(/\s+/))
      .filter((token) => token.length > 1)
  );

  let pantryTokenCount = 0;
  for (const token of titleTokens) {
    if (pantryTokens.has(token)) pantryTokenCount += 1;
  }

  return pantryTokenCount === titleTokens.size;
}

function buildAuthenticDishImageSearchPhrases(candidate: AuthenticCuisineDishCandidate) {
  const cuisine = normalizeCuisineDisplay(candidate.dish.cuisine, candidate.cuisine).toLowerCase();
  return Array.from(
    new Set([
      candidate.dishName,
      ...candidate.dish.names.english,
      `${candidate.dishName} ${cuisine}`,
      `${cuisine} traditional ${candidate.dishName}`
    ].map((value) => value.trim()).filter(Boolean))
  ).slice(0, 5);
}

function getDishAliases(dish: CuisineDish) {
  return Array.from(
    new Set([
      dish.id.replace(/-/g, " "),
      ...dish.names.english,
      ...dish.names.native,
      ...(dish.names.other ?? [])
    ].filter(Boolean))
  );
}

function getDishDisplayName(dish: CuisineDish) {
  return dish.names.english[0]?.trim() || getDishById(dish.id)?.names.english[0]?.trim() || dish.id.replace(/-/g, " ");
}

function normalizeCuisineDisplay(cuisine: CuisineDish["cuisine"], fallback: string) {
  const labels: Record<CuisineDish["cuisine"], string> = {
    american: "American",
    asian: "Asian",
    egyptian: "Egyptian",
    indian: "Indian",
    italian: "Italian",
    mediterranean: "Mediterranean",
    mexican: "Mexican",
    middleEastern: "Middle Eastern",
    thai: "Thai",
    turkish: "Turkish"
  };
  return labels[cuisine] ?? fallback;
}

function normalizeIngredientSet(values: string[]) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => [value, ...(INGREDIENT_ALIASES[normalizeText(value)] ?? [])])
        .map(normalizeIngredient)
        .filter(Boolean)
    )
  );
}

function normalizeDishIngredientAnchors(values: string[]) {
  return Array.from(new Set(values.map(normalizeIngredient).filter(Boolean)));
}

function ingredientListIncludes(ingredients: string[], anchor: string) {
  const normalizedAnchor = normalizeIngredient(anchor);
  if (!normalizedAnchor) return false;
  return ingredients.some((ingredient) => {
    if (ingredient === normalizedAnchor) return true;
    if (ingredient.includes(normalizedAnchor)) return true;
    if (normalizedAnchor.includes(ingredient) && ingredient.split(/\s+/).length > 1) return true;
    return false;
  });
}

function normalizeIngredient(value: string) {
  return normalizeText(value)
    .replace(/\b(fresh|cooked|raw|whole|large|small|medium|chopped|diced|sliced|ground|minced)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
