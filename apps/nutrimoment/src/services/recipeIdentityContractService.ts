import type { Recipe, RecipeDishIntent } from "@/lib/types";
import { titlesShareDishIdentity } from "@/services/recipeDishIdentityService";
import { buildRecipePhotoIdentity } from "@/lib/recipePhotoIdentity";
import { buildRecipePhotoQueryCandidates } from "@/lib/recipePhotoQueries";
import { normalizePhotoIdentity as normalizePhotoIdentityFields, toIdentityKey } from "@/lib/photoIdentityBuilders";
import { getAllDishes } from "@/lib/cuisineCatalogs/completeCatalogs";

const GENERIC_CATALOG_IDENTITIES = new Set([
  "curry",
  "fried rice",
  "grilled fish",
  "salad",
  "soup",
  "stew"
]);
const CATALOG_IDENTITY_CUISINES = buildCatalogIdentityCuisineIndex();

export interface RecipeIdentityContract {
  cuisine: string;
  dishIdentity: string;
  dishIntent: Pick<RecipeDishIntent, "cooking_method" | "cuisine" | "dish_name"> | null;
  imageSearchIndex: string;
  imageSearchIndices: string[];
  name: string;
  photoIdentity: Recipe["photo_identity"] | null;
  proteinForm: RecipeProteinForm;
}

export type RecipeProteinForm = "fillet" | "ground" | "pieces" | "steak" | "whole" | "unspecified";

export interface RecipeIdentityRejection {
  reasons: string[];
  recipe: Recipe;
}

export interface LockedRecipeCandidates {
  contracts: Map<string, RecipeIdentityContract>;
  recipes: Recipe[];
  rejected: RecipeIdentityRejection[];
}

export function lockRecipeCandidateIdentities(recipes: Recipe[]): LockedRecipeCandidates {
  const contracts = new Map<string, RecipeIdentityContract>();
  const accepted: Recipe[] = [];
  const rejected: RecipeIdentityRejection[] = [];

  recipes.forEach((rawRecipe, index) => {
    const recipe = normalizeRecipeLosslessly(rawRecipe);
    const authorityReasons = validateRecipeIdentityConsistency(recipe)
      .filter((reason) => reason === "dish_identity_name_mismatch");
    if (authorityReasons.length) {
      rejected.push({ reasons: authorityReasons, recipe: rawRecipe });
      return;
    }
    const canonical = canonicalizeRecipeIdentityMetadata(recipe);
    const reasons = validateRecipeIdentityConsistency(canonical);
    if (reasons.length) {
      rejected.push({ reasons, recipe: rawRecipe });
      return;
    }
    const key = getRecipeIdentityContractKey(canonical, index);
    contracts.set(key, createRecipeIdentityContract(canonical));
    accepted.push(canonical);
  });

  return { contracts, recipes: accepted, rejected };
}

/**
 * Mints derived search/photo metadata from the authoritative source title and
 * dish identity. Ingredients, steps, nutrition, and restrictions are not
 * changed here.
 */
export function canonicalizeRecipeIdentityMetadata(recipe: Recipe): Recipe {
  const canonicalName = recipe.dish_identity?.trim() || recipe.name.trim();
  const canonicalCuisine = resolveCatalogCuisine(canonicalName, recipe.cuisine);
  const cookingMethod =
    detectCookingMethod([recipe.name, recipe.dish_identity].filter(Boolean).join(" ")) ??
    detectCookingMethod(recipe.steps.join(" "));
  const dishIntent: RecipeDishIntent = {
    dish_name: canonicalName,
    cuisine: canonicalCuisine,
    ...(recipe.dish_intent?.meal_type ? { meal_type: recipe.dish_intent.meal_type } : {}),
    ...(recipe.dish_intent?.diet_type ? { diet_type: recipe.dish_intent.diet_type } : {}),
    ...(cookingMethod ? { cooking_method: cookingMethod } : {}),
    visual_keywords: [],
    exclude_keywords: []
  };
  const discoveredQueries = buildRecipePhotoQueryCandidates({
    cuisine: canonicalCuisine,
    dishIntent,
    ingredients: recipe.ingredients,
    missingIngredients: recipe.missing_ingredients,
    name: canonicalName
  });
  const queries = Array.from(new Set([
    `${canonicalName} ${canonicalCuisine} food`.trim(),
    `${canonicalName} plated dish`.trim(),
    `${canonicalCuisine} traditional ${canonicalName}`.trim(),
    ...discoveredQueries.filter((query) => queryMatchesCanonicalIdentity(query, canonicalName))
  ].filter(Boolean)));
  dishIntent.visual_keywords = queries.slice(0, 8);

  const photo = buildRecipePhotoIdentity(`${canonicalCuisine} ${canonicalName}`);
  const photoIdentity = normalizePhotoIdentityFields({
    dish_slug: photo.canonicalDishKey ?? photo.familyKey ?? toIdentityKey(canonicalName) ?? "recipe-photo",
    english_name: canonicalName,
    cuisine_key: photo.cuisineKey ?? toIdentityKey(canonicalCuisine),
    protein: photo.mainIngredientKey,
    starch: photo.starchKey,
    sauce: photo.sauceKey,
    method: cookingMethod ?? photo.cookingMethodKey
  });

  return {
    ...recipe,
    cuisine: canonicalCuisine,
    dish_identity: canonicalName,
    dish_intent: dishIntent,
    image_search_index: queries[0] ?? `${canonicalName} ${canonicalCuisine}`.trim(),
    image_search_indices: queries.length ? queries : [`${canonicalName} ${canonicalCuisine}`.trim()],
    ...(photoIdentity ? { photo_identity: photoIdentity } : { photo_identity: undefined })
  };
}

export function filterCandidatesByIdentityContract(
  recipes: Recipe[],
  contracts: ReadonlyMap<string, RecipeIdentityContract>
): Pick<LockedRecipeCandidates, "recipes" | "rejected"> {
  const accepted: Recipe[] = [];
  const rejected: RecipeIdentityRejection[] = [];

  recipes.forEach((recipe, index) => {
    const contract = contracts.get(getRecipeIdentityContractKey(recipe, index));
    const reasons = contract
      ? [...validateRecipeIdentityConsistency(recipe), ...validateRecipeIdentityContract(recipe, contract)]
      : ["identity_contract_missing"];
    if (reasons.length) {
      rejected.push({ reasons: Array.from(new Set(reasons)), recipe });
      return;
    }
    accepted.push(recipe);
  });

  return { recipes: accepted, rejected };
}

export function createRecipeIdentityContract(recipe: Recipe): RecipeIdentityContract {
  return {
    cuisine: normalizeIdentityValue(recipe.cuisine),
    dishIdentity: normalizeIdentityValue(recipe.dish_identity ?? ""),
    dishIntent: recipe.dish_intent
      ? {
          cooking_method: normalizeIdentityValue(recipe.dish_intent.cooking_method ?? ""),
          cuisine: normalizeIdentityValue(recipe.dish_intent.cuisine),
          dish_name: normalizeIdentityValue(recipe.dish_intent.dish_name)
        }
      : null,
    imageSearchIndex: normalizeIdentityValue(recipe.image_search_index ?? ""),
    imageSearchIndices: (recipe.image_search_indices ?? []).map(normalizeIdentityValue),
    name: normalizeIdentityValue(recipe.name),
    photoIdentity: recipe.photo_identity ? normalizePhotoIdentity(recipe.photo_identity) : null,
    proteinForm: detectRecipeProteinForm(recipe)
  };
}

export function validateRecipeIdentityConsistency(recipe: Recipe): string[] {
  const reasons: string[] = [];
  const title = recipe.name?.trim() ?? "";
  const dishIdentity = recipe.dish_identity?.trim() ?? "";
  const dishIntentName = recipe.dish_intent?.dish_name?.trim() ?? "";
  const photoName = recipe.photo_identity?.english_name?.trim() ?? "";
  const expectedIdentity = dishIdentity || title;

  if (title && dishIdentity && !titlesShareDishIdentity(title, dishIdentity)) {
    reasons.push("dish_identity_name_mismatch");
  }
  if (expectedIdentity && dishIntentName && !titlesShareDishIdentity(dishIntentName, expectedIdentity)) {
    reasons.push("dish_intent_name_mismatch");
  }
  if (expectedIdentity && photoName && !titlesShareDishIdentity(photoName, expectedIdentity)) {
    reasons.push("photo_identity_name_mismatch");
  }
  if (
    recipe.cuisine?.trim() &&
    recipe.dish_intent?.cuisine?.trim() &&
    normalizeIdentityValue(recipe.cuisine) !== normalizeIdentityValue(recipe.dish_intent.cuisine)
  ) {
    reasons.push("dish_intent_cuisine_mismatch");
  }
  if (expectedIdentity && recipe.cuisine && hasCatalogCuisineConflict(expectedIdentity, recipe.cuisine)) {
    reasons.push("identity_title_cuisine_mismatch");
  }

  return reasons;
}

export function validateRecipeIdentityContent(recipe: Recipe): string[] {
  const reasons: string[] = [];
  const identityText = [
    recipe.name,
    recipe.dish_identity,
    recipe.dish_intent?.dish_name,
    recipe.dish_intent?.cooking_method,
    recipe.photo_identity?.method
  ].filter(Boolean).join(" ");
  const instructionText = recipe.steps.join(" ");
  const expectedMethod = detectCookingMethod(identityText);

  if (expectedMethod && !stepsUseCookingMethod(instructionText, expectedMethod)) {
    reasons.push(`identity_method_steps_mismatch:${expectedMethod}`);
  }

  const expectedProteinForm = detectProteinFormFromText([
    recipe.name,
    recipe.dish_identity,
    recipe.dish_intent?.dish_name,
    recipe.photo_identity?.protein
  ].filter(Boolean).join(" "));
  const ingredientProteinForm = detectProteinFormFromText([
    ...recipe.ingredients,
    ...recipe.missing_ingredients
  ].join(" "));
  if (
    expectedProteinForm !== "unspecified" &&
    ingredientProteinForm !== "unspecified" &&
    expectedProteinForm !== ingredientProteinForm
  ) {
    reasons.push(`identity_protein_form_content_mismatch:${expectedProteinForm}`);
  }

  return reasons;
}

export function validateRecipeIdentityContract(
  recipe: Recipe,
  contract: RecipeIdentityContract
): string[] {
  const candidate = createRecipeIdentityContract(recipe);
  const reasons: string[] = [];

  if (candidate.name !== contract.name) reasons.push("identity_name_changed");
  if (candidate.cuisine !== contract.cuisine) reasons.push("identity_cuisine_changed");
  if (candidate.dishIdentity !== contract.dishIdentity) reasons.push("identity_dish_identity_changed");
  if (!sameValue(candidate.dishIntent, contract.dishIntent)) reasons.push("identity_dish_intent_changed");
  if (!sameValue(candidate.photoIdentity, contract.photoIdentity)) reasons.push("identity_photo_changed");
  if (candidate.imageSearchIndex !== contract.imageSearchIndex || !sameValue(candidate.imageSearchIndices, contract.imageSearchIndices)) {
    reasons.push("identity_image_query_changed");
  }
  if (candidate.proteinForm !== contract.proteinForm) reasons.push("identity_protein_form_changed");

  return reasons;
}

/**
 * Trims transport formatting only. It must never invent, remove, reorder, or
 * reinterpret recipe facts.
 */
export function normalizeRecipeLosslessly(recipe: Recipe): Recipe {
  const trim = (value: string) => value.trim().replace(/\s+/g, " ");
  return {
    ...recipe,
    name: trim(recipe.name),
    cuisine: trim(recipe.cuisine),
    ...(recipe.dish_identity != null ? { dish_identity: trim(recipe.dish_identity) } : {}),
    ...(recipe.image_search_index != null ? { image_search_index: trim(recipe.image_search_index) } : {}),
    ...(recipe.image_search_indices != null
      ? { image_search_indices: recipe.image_search_indices.map(trim) }
      : {}),
    ingredients: recipe.ingredients.map(trim),
    missing_ingredients: recipe.missing_ingredients.map(trim),
    steps: recipe.steps.map(trim),
    cook_time: trim(recipe.cook_time),
    difficulty: trim(recipe.difficulty),
    protein: trim(recipe.protein),
    carbs: trim(recipe.carbs),
    fat: trim(recipe.fat),
    ...(recipe.fiber != null ? { fiber: trim(recipe.fiber) } : {}),
    ...(recipe.sugar != null ? { sugar: trim(recipe.sugar) } : {}),
    ...(recipe.sodium != null ? { sodium: trim(recipe.sodium) } : {})
  };
}

function detectRecipeProteinForm(recipe: Recipe): RecipeProteinForm {
  return detectProteinFormFromText([
    recipe.name,
    recipe.dish_identity,
    recipe.dish_intent?.dish_name,
    recipe.photo_identity?.protein,
    ...recipe.ingredients.slice(0, 4),
    ...recipe.missing_ingredients.slice(0, 2)
  ].filter(Boolean).join(" "));
}

function detectProteinFormFromText(value: string): RecipeProteinForm {
  const text = normalizeIdentityValue(value);

  if (/\b(?:(?:ground|minced|mince)\s+(?:beef|meat|lamb|turkey|chicken|pork|veal)|meatball|kofta|burger|hamburger)\b/.test(text)) return "ground";
  if (/\b(?:steak|sirloin|ribeye|tenderloin|filet mignon|flank|skirt steak|london broil|tagliata|bistecca)\b/.test(text)) return "steak";
  if (/\b(?:fillet|filet)\b/.test(text)) return "fillet";
  if (/\b(?:whole chicken|whole fish|whole turkey|whole duck|roast chicken)\b/.test(text)) return "whole";
  if (/\b(?:pieces|cubes|chunks|strips|slices|diced)\b/.test(text)) return "pieces";
  return "unspecified";
}

type RecipeCookingMethod = "baked" | "fried" | "grilled" | "pan_seared" | "steamed" | "stewed";

function detectCookingMethod(value: string): RecipeCookingMethod | null {
  const text = normalizeIdentityValue(value);
  if (/\b(?:grill|grilled|barbecue|bbq|chargrill)\b/.test(text)) return "grilled";
  if (/\b(?:bake|baked|roast|roasted|oven|casserole)\b/.test(text)) return "baked";
  if (/\b(?:deep fry|deep fried|fried|fry|breaded|crispy)\b/.test(text)) return "fried";
  if (/\b(?:braise|braised|stew|stewed|tagine|simmered)\b/.test(text)) return "stewed";
  if (/\b(?:steam|steamed)\b/.test(text)) return "steamed";
  if (/\b(?:pan sear|pan seared|sear|seared)\b/.test(text)) return "pan_seared";
  return null;
}

function stepsUseCookingMethod(value: string, method: RecipeCookingMethod) {
  const text = normalizeIdentityValue(value);
  const patterns: Record<RecipeCookingMethod, RegExp> = {
    baked: /\b(?:bake|baked|roast|roasted|oven)\b/,
    fried: /\b(?:fry|fried|deep fry|air fry|bread|coat|batter)\b/,
    grilled: /\b(?:grill|grilled|barbecue|bbq|char)\b/,
    pan_seared: /\b(?:pan|skillet|sear|seared)\b/,
    steamed: /\b(?:steam|steamed|steamer)\b/,
    stewed: /\b(?:braise|braised|stew|stewed|simmer|simmered|low heat)\b/
  };
  return patterns[method].test(text);
}

function getRecipeIdentityContractKey(recipe: Recipe, index: number) {
  return recipe.id ?? recipe.source_recipe_id ?? recipe.dish_identity ?? `${recipe.name}|${recipe.cuisine}|${index}`;
}

function normalizePhotoIdentity(identity: NonNullable<Recipe["photo_identity"]>) {
  return {
    cuisine_key: normalizeIdentityValue(identity.cuisine_key ?? ""),
    dish_slug: normalizeIdentityValue(identity.dish_slug),
    english_name: normalizeIdentityValue(identity.english_name),
    method: normalizeIdentityValue(identity.method ?? ""),
    protein: normalizeIdentityValue(identity.protein ?? ""),
    sauce: normalizeIdentityValue(identity.sauce ?? ""),
    starch: normalizeIdentityValue(identity.starch ?? "")
  };
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function queryMatchesCanonicalIdentity(query: string, canonicalName: string) {
  const canonicalTokens = normalizeIdentityValue(canonicalName)
    .split(" ")
    .filter((token) => token.length >= 4)
    .filter((token) => !new Set(["with", "from", "style", "dish", "recipe"]).has(token))
    .sort((left, right) => right.length - left.length);
  if (!canonicalTokens.length) return false;
  const queryText = normalizeIdentityValue(query);
  return queryText.split(" ").includes(canonicalTokens[0]);
}

function buildCatalogIdentityCuisineIndex() {
  const index = new Map<string, Set<string>>();
  getAllDishes().forEach((dish) => {
    const cuisine = normalizeCuisineIdentityValue(dish.cuisine);
    const aliases = [
      dish.id.replace(/-/g, " "),
      ...dish.names.english,
      ...dish.names.native,
      ...(dish.names.other ?? [])
    ];
    aliases.forEach((alias) => {
      const key = normalizeIdentityValue(alias);
      if (!key || key.length < 5 || GENERIC_CATALOG_IDENTITIES.has(key)) return;
      const cuisines = index.get(key) ?? new Set<string>();
      cuisines.add(cuisine);
      index.set(key, cuisines);
    });
  });
  return index;
}

function hasCatalogCuisineConflict(identity: string, declaredCuisine: string) {
  const identityKey = normalizeIdentityValue(identity);
  const exact = CATALOG_IDENTITY_CUISINES.get(identityKey);
  const cuisines = exact ?? findDistinctiveCatalogIdentityCuisines(identityKey);
  if (!cuisines?.size) return false;
  return !cuisines.has(normalizeCuisineIdentityValue(declaredCuisine));
}

function resolveCatalogCuisine(identity: string, declaredCuisine: string) {
  const identityKey = normalizeIdentityValue(identity);
  const cuisines = CATALOG_IDENTITY_CUISINES.get(identityKey) ?? findDistinctiveCatalogIdentityCuisines(identityKey);
  if (!cuisines?.size) return declaredCuisine;
  const declaredKey = normalizeCuisineIdentityValue(declaredCuisine);
  if (cuisines.has(declaredKey)) return cuisineKeyToLabel(declaredKey);

  const inferredKey = normalizeCuisineIdentityValue(buildRecipePhotoIdentity(identity).cuisineKey ?? "");
  if (inferredKey && cuisines.has(inferredKey)) return cuisineKeyToLabel(inferredKey);
  return cuisineKeyToLabel([...cuisines].sort()[0]);
}

function cuisineKeyToLabel(key: string) {
  const labels: Record<string, string> = {
    american: "American",
    asian: "Asian",
    egyptian: "Egyptian",
    indian: "Indian",
    italian: "Italian",
    mediterranean: "Mediterranean",
    mexican: "Mexican",
    middleeastern: "Middle Eastern",
    thai: "Thai",
    turkish: "Turkish"
  };
  return labels[key] ?? key;
}

function findDistinctiveCatalogIdentityCuisines(identityKey: string) {
  const matches = [...CATALOG_IDENTITY_CUISINES.entries()]
    .filter(([alias]) => alias.split(" ").length === 1 && alias.length >= 7)
    .filter(([alias]) => identityKey === alias || identityKey.endsWith(` ${alias}`));
  if (!matches.length) return null;
  return new Set(matches.flatMap(([, cuisines]) => [...cuisines]));
}

function normalizeCuisineIdentityValue(value: string) {
  return normalizeIdentityValue(value).replace(/\s+/g, "");
}

function normalizeIdentityValue(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
