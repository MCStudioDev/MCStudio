/**
 * The single source of truth for every prompt sent to Gemini by NutriMoment.
 *
 * Keep prompt assembly here so routes and services only provide validated
 * context; they must not concatenate their own model instructions.
 */

import { buildPreferenceProfile, type NutritionGoals } from "@/lib/preferences";
import { getCuisineDishReferenceText } from "@/lib/cuisineDishCatalog";
import { getCuisineVisualReferenceText } from "@/lib/cuisineVisualReferences";
import {
  buildPromptForbiddenMealPlanLine,
  findIngredientDietViolation
} from "@/lib/dietEnforcement";
import type { RecipeReferencePromptRecipe } from "@/lib/recipeReferenceTypes";
import type { MealPlanData } from "@/lib/types";
import type { RecipeInputCoveragePrompt } from "@/services/recipeInputCoverageService";
import { getRequestedProteinFormRequirements } from "@/services/recipePrimaryIngredientCompatibility";

export interface RecipePromptIngredient {
  name: string;
  quantity?: string;
}

export interface RecipePromptOptions {
  recipeLanguage: string;
  preferredCuisine: string;
  calorieTarget: number;
  maxMissingIngredients: number;
  ingredientCoverage?: RecipeInputCoveragePrompt;
  primaryIngredient?: string;
  recipeCount: number;
  diets: string[];
  conditions: string[];
  allergens?: string[];
  excludedIngredients?: string[];
  recentRecipeAvoidance?: string;
  discoveryFocus?: string;
  variationSeed?: string;
  recipeReferences?: RecipeReferencePromptRecipe[];
}

export interface RecipeEditorBatchPromptOptions extends Omit<RecipePromptOptions, "recipeReferences"> {
  recipeReferences: RecipeReferencePromptRecipe[];
}

export interface MealPlanPromptOptions {
  pantry: string[];
  pantryItems?: { name: string; quantity?: string }[];
  diets: string[];
  conditions: string[];
  allergens?: string[];
  recipeLanguage?: string;
  preferredCuisine?: string;
  calorieTarget?: number;
}

const RECIPE_EDITOR_SYSTEM_PROMPT = [
  "You are NutriMoment's Recipe Editor.",
  "Edit only the validated source recipe provided.",
  "Preserve the dish identity, ingredient relationships, preparation forms, cooking method, order, timing, and food-safety cues.",
  "Make only targeted changes required by the supplied dietary restrictions, allergens, excluded ingredients, or health conditions.",
  "When a substitution is required, replace every occurrence consistently in the title, ingredient lists, and cooking steps.",
  "Remove source-site introductions, personal stories, promotional copy, and serving commentary that is not a cooking instruction.",
  "Return at least two unique, specific cooking steps and never return placeholder instructions such as prepare the ingredients, cook until done, or serve warm.",
  "Every ingredient string must begin with a positive quantity and a clear unit, followed by exactly one ingredient name.",
  "Use ingredients only for source-recipe ingredients the user already has, and use missing_ingredients for every remaining source-recipe ingredient.",
  "Do not duplicate normalized ingredient names across ingredients and missing_ingredients.",
  "Do not add an available pantry ingredient unless it is part of the source recipe.",
  "Keep preparation modifiers such as sliced, thinly sliced, minced, chopped, or diced attached to their ingredient; never return a preparation modifier as a standalone ingredient.",
  "Mention every ingredient listed in the returned ingredients array and every missing protein ingredient explicitly in at least one cooking step.",
  "Return cook_time as total whole minutes in the exact format '<number> minutes'; convert hours to minutes and do not return hours, ranges, or approximate prose.",
  "Do not invent a recipe, ingredients, cooking steps, cuisine, nutrition, shopping list, source, image metadata, or URLs.",
  "Return valid JSON only."
].join(" ");

const RECIPE_EDITOR_BATCH_SYSTEM_PROMPT = [
  "You are NutriMoment's batch Recipe Editor.",
  "Edit every validated source recipe independently and return exactly one result for every source_recipe_id supplied.",
  "Copy each source_recipe_id exactly; never omit, duplicate, invent, merge, or reorder recipe identities.",
  "Preserve each dish identity, ingredient relationships, preparation forms, cooking method, order, timing, and food-safety cues.",
  "Make only targeted changes required by the supplied dietary restrictions, allergens, excluded ingredients, health conditions, or output language.",
  "Never move ingredients, steps, names, or cuisine details between source recipes.",
  "Return the complete adjusted recipe ingredient list in ingredients and always return missing_ingredients as an empty array; pantry ownership is computed deterministically after editing.",
  "Every ingredient string must begin with a positive quantity and a clear unit, followed by exactly one ingredient name.",
  "Do not duplicate normalized ingredient names, and keep preparation modifiers attached to their ingredient.",
  "Mention every returned ingredient explicitly in at least one cooking step.",
  "Return at least two unique, specific cooking steps and never return placeholder or serving-only instructions.",
  "Return cook_time as total whole minutes in the exact format '<number> minutes'.",
  "Do not invent recipes, sources, image metadata, URLs, promotional prose, or unrelated pantry ingredients.",
  "Return valid JSON only as an array."
].join(" ");

const RECIPE_DISCOVERY_SYSTEM_PROMPT = [
  "You are NutriMoment's grounded Recipe Researcher.",
  "Use the enabled Google Search grounding tool to find established, authentic recipes from reputable culinary sources.",
  "Use each discovered source as factual evidence, then independently summarize and paraphrase the recipe in concise original wording.",
  "Never copy source introductions, ingredient-list wording, instructions, descriptions, or other sentences verbatim.",
  "Return recipe facts supported by the discovered source; do not invent a dish, cuisine, ingredients, method, timing, temperature, nutrition, or URL.",
  "Choose distinct canonical dishes that match the requested ingredients and cuisine.",
  "Every recipe must feature the supplied primaryIngredient as a central ingredient; never substitute another protein or return a side dish that omits it.",
  "When primaryIngredient names a protein cut or form, such as chicken thigh, chicken breast, ground beef, or steak, every discovered source must use that exact cut or form; the same protein family is not an acceptable substitute.",
  "Every title must be an established dish name from its source, never a generic ingredient list or a health-condition label.",
  "Set dish_identity to the recognized canonical dish identity supported by the source; it must never contain a health label or a newly invented title.",
  "Apply only supplied dietary, allergen, and exclusion constraints without changing each dish's identity; medical adaptation is handled after discovery.",
  "Return valid JSON only as an array of recipe objects.",
  "Each recipe must contain name, dish_identity, cuisine, ingredients, missing_ingredients, steps, calories, protein, carbs, fat, sodium, cook_time, difficulty, source_url, recipe_source_type, and preference_hits.",
  "Keep those JSON property names exactly in English even when their values are Arabic.",
  "Return the complete recipe ingredient list using original phrasing; every ingredient line must begin with a positive quantity and a clear unit.",
  "Return at least two specific, ordered cooking steps in original phrasing, preserving the source method, temperatures, timing, and food-safety cues without reproducing its sentences.",
  "Return cook_time as total whole minutes in the exact format '<number> minutes'; convert hours and ranges to one realistic total.",
  "Set recipe_source_type to external_source and source_url to the exact culinary page used."
].join(" ");

const RECIPE_BATCH_GENERATION_SYSTEM_PROMPT = [
  "You are NutriMoment's recipe generator.",
  "Return exactly the recipeCount requested in the response schema; never return fewer recipes.",
  "When ingredientCoverage is supplied, return a recipeGroups object keyed by anchor id and fill every anchor array to that anchor's targetCards count. Do not move a recipe into a different anchor group merely to satisfy the JSON shape.",
  "Follow ingredientCoverage as the highest-priority relevance contract when it is supplied.",
  "Every recipe must centrally feature at least one ingredientCoverage anchor, each anchor must appear in at least its targetCards count across the complete batch, and recipes that naturally combine multiple anchors are preferred.",
  "Before filling anchor-specific variety, identify established canonical dishes that naturally combine the greatest number of requested anchors. Treat ingredientCoverage.combinationPriority.targetMultiAnchorCards as the target for credible multi-anchor dishes, rank those dishes first, and never force unrelated ingredients together or invent a dish to meet the target.",
  "Do not paste every requested anchor into every recipe. Include an anchor only when it is a real ingredient in that established dish and the cooking steps explicitly prepare or cook it.",
  "Never pad an ingredient list to improve coverage. A valid lower-overlap recipe is better than a falsely combined recipe.",
  "When dishDiscoveryHints are supplied, treat them as high-priority established dish matches for the pantry and include them when they satisfy the restrictions and ingredient-coverage contract.",
  "ingredientCoverage.recipeSlots is mandatory: output recipe 1 must centrally feature slot 1's requiredAnchorId and variationKey, recipe 2 must feature slot 2's requiredAnchorId and variationKey, and so on. An anchor in broth, stock, sauce, garnish, or an incidental trace does not satisfy its slot.",
  "Slots for the same anchor must have different canonical dish identities and principal cooking forms; use variationKey to prevent near-duplicate titles and methods while keeping every dish established and realistic.",
  "When preferredCuisine is Any, distribute every anchor group across the world and use at least four distinct cuisine labels across the complete batch; do not default vegetable groups to only Italian and Mediterranean dishes.",
  "Before returning JSON, audit every output position against recipeSlots and replace any nonmatching recipe while keeping the exact requested array length.",
  "Choose distinct, established, recognizable dish identities and preserve every anchor's physical form; use primaryIngredient only when the request has one anchor.",
  "When proteinFormRequirements is supplied, treat every entry as a hard eligibility constraint. Use the requested species and physical cut or form explicitly in the title, ingredients, and steps; never substitute another cut or form from the same protein family.",
  "Do not introduce an animal protein that is absent from ingredientCoverage as a dominant ingredient or as a substitute for a requested anchor.",
  "A species label inside an organ ingredient, such as chicken liver or beef liver, does not permit adding that species' muscle meat or another animal ingredient; never add bacon, ham, sausage, or another unrequested protein to complete a slot.",
  "Meeting coverage never permits generic titles such as Roasted Vegetables, Vegetable Stew, Pan-Seared Vegetables, Pasta Bake, or Protein Bowl; choose established named dish families.",
  "Do not invent fake dish names, regional labels, health-condition titles, sources, or URLs.",
  "Every ingredient line must begin with a positive quantity and a clear unit followed by one ingredient name.",
  "Return the complete ingredient list and at least two specific, ordered cooking steps for every recipe.",
  "Mention every listed ingredient in the cooking steps and include realistic temperatures, timing, and food-safety cues where relevant.",
  "Estimate calories, protein, carbs, fat, and sodium realistically from the stated quantities for one serving.",
  "Return cook_time as total whole minutes in the exact format '<number> minutes'.",
  "Set recipe_source_type to generated. Return valid JSON only with no markdown."
].join(" ");

const ARABIC_RECIPE_EDITOR_RULES = [
  "Write every user-facing value in natural Modern Standard Arabic.",
  "Localize recipe names naturally; never use English words written in Arabic characters when a common Arabic culinary name exists.",
  "Use approved ingredient names and culinary verbs. Keep quantities and temperatures clear."
].join(" ");

const RECIPE_EDITOR_RESPONSE_SCHEMA = {
  type: "array",
  minItems: 1,
  maxItems: 1,
  items: {
    type: "object",
    additionalProperties: false,
    required: [
      "name",
      "cuisine",
      "ingredients",
      "missing_ingredients",
      "steps",
      "cook_time",
      "difficulty",
      "preference_hits"
    ],
    properties: {
      name: { type: "string" },
      cuisine: { type: "string" },
      ingredients: {
        type: "array",
        minItems: 1,
        description: "Source-recipe ingredients present in availableIngredients. Never include pantry items that are absent from the source recipe.",
        items: { type: "string", description: "Positive quantity, unit, and one ingredient name with any preparation modifier attached." }
      },
      missing_ingredients: {
        type: "array",
        description: "Required source-recipe ingredients not present in availableIngredients. Never repeat an ingredient from ingredients.",
        items: { type: "string" }
      },
      steps: { type: "array", minItems: 2, items: { type: "string" } },
      cook_time: { type: "string", description: "Total whole minutes formatted exactly as '<number> minutes'." },
      difficulty: { type: "string" },
      preference_hits: { type: "array", items: { type: "string" } }
    }
  }
} as const;

export function buildRecipeEditorSystemPrompt(recipeLanguage: string) {
  return [
    RECIPE_EDITOR_SYSTEM_PROMPT,
    recipeLanguage.toLowerCase() === "arabic" ? ARABIC_RECIPE_EDITOR_RULES : "Write every user-facing value in English only."
  ].join(" ");
}

export function buildRecipeEditorBatchSystemPrompt(recipeLanguage: string) {
  return [
    RECIPE_EDITOR_BATCH_SYSTEM_PROMPT,
    recipeLanguage.toLowerCase() === "arabic" ? ARABIC_RECIPE_EDITOR_RULES : "Write every user-facing value in English only."
  ].join(" ");
}

export function buildRecipeEditorBatchResponseSchema(recipeCount: number) {
  const boundedCount = Math.max(1, Math.min(12, Math.floor(recipeCount || 1)));
  return {
    type: "array",
    minItems: boundedCount,
    maxItems: boundedCount,
    items: {
      type: "object",
      additionalProperties: false,
      required: [
        "source_recipe_id",
        "name",
        "cuisine",
        "ingredients",
        "missing_ingredients",
        "steps",
        "cook_time",
        "difficulty",
        "preference_hits"
      ],
      properties: {
        source_recipe_id: { type: "string" },
        name: { type: "string" },
        cuisine: { type: "string" },
        ingredients: {
          type: "array",
          minItems: 1,
          items: { type: "string", description: "A complete quantified recipe ingredient line." }
        },
        missing_ingredients: {
          type: "array",
          maxItems: 0,
          items: { type: "string" }
        },
        steps: { type: "array", minItems: 2, items: { type: "string" } },
        cook_time: { type: "string", description: "Total whole minutes formatted exactly as '<number> minutes'." },
        difficulty: { type: "string" },
        preference_hits: { type: "array", items: { type: "string" } }
      }
    }
  } as const;
}

export function buildRecipeDiscoverySystemPrompt(recipeLanguage: string) {
  return [
    RECIPE_DISCOVERY_SYSTEM_PROMPT,
    recipeLanguage.toLowerCase() === "arabic" ? ARABIC_RECIPE_EDITOR_RULES : "Write every user-facing value in English only."
  ].join(" ");
}

export function buildRecipeDiscoveryResponseSchema(recipeCount: number) {
  return {
    type: "array",
    minItems: 1,
    maxItems: Math.max(1, Math.min(10, Math.floor(recipeCount || 1))),
    items: {
      type: "object",
      additionalProperties: false,
      required: [
        "name",
        "dish_identity",
        "cuisine",
        "ingredients",
        "missing_ingredients",
        "steps",
        "calories",
        "protein",
        "carbs",
        "fat",
        "sodium",
        "cook_time",
        "difficulty",
        "source_url",
        "recipe_source_type",
        "preference_hits"
      ],
      properties: {
        name: { type: "string" },
        dish_identity: { type: "string" },
        cuisine: { type: "string" },
        ingredients: { type: "array", items: { type: "string" } },
        missing_ingredients: { type: "array", items: { type: "string" } },
        steps: { type: "array", items: { type: "string" } },
        calories: { type: "number" },
        protein: { type: "string" },
        carbs: { type: "string" },
        fat: { type: "string" },
        sodium: { type: "string" },
        cook_time: { type: "string" },
        difficulty: { type: "string" },
        source_url: { type: "string" },
        recipe_source_type: { type: "string", enum: ["external_source"] },
        preference_hits: { type: "array", items: { type: "string" } }
      }
    }
  } as const;
}

export function buildRecipeGenerationResponseSchema(
  recipeCount: number,
  ingredientCoverage?: RecipeInputCoveragePrompt
) {
  const boundedCount = Math.max(1, Math.min(10, Math.floor(recipeCount || 1)));
  const discoverySchema = buildRecipeDiscoveryResponseSchema(boundedCount);
  const generatedRecipeArraySchema = {
    type: discoverySchema.type,
    items: {
      ...discoverySchema.items,
      required: discoverySchema.items.required.filter((field) => field !== "source_url"),
      properties: {
        ...discoverySchema.items.properties,
        recipe_source_type: { type: "string", enum: ["generated"] }
      }
    }
  } as const;
  if (!ingredientCoverage?.anchors.length) return generatedRecipeArraySchema;

  const recipeGroups = Object.fromEntries(
    ingredientCoverage.anchors.map((anchor) => [
      anchor.id,
      {
        type: "array",
        items: generatedRecipeArraySchema.items
      }
    ])
  );
  return {
    type: "object",
    additionalProperties: false,
    required: ["recipeGroups"],
    properties: {
      recipeGroups: {
        type: "object",
        additionalProperties: false,
        required: ingredientCoverage.anchors.map((anchor) => anchor.id),
        properties: recipeGroups
      }
    }
  } as const;
}

function buildCompactSourceRecipe(reference?: RecipeReferencePromptRecipe) {
  if (!reference) return null;

  return {
    title: reference.title,
    cuisine: reference.cuisine,
    ingredients: reference.ingredients.slice(0, 24),
    steps: reference.steps.slice(0, 12)
  };
}

function buildCompactRestrictionActions(options: RecipePromptOptions) {
  const actions: string[] = [];
  const diets = new Set(options.diets.map((diet) => diet.trim().toLowerCase()));
  if (diets.has("glutenfree") || diets.has("gluten-free")) {
    actions.push("Replace every wheat pasta, noodle, ravioli, bread, flour, breadcrumb, and crust with an explicitly gluten-free equivalent in both ingredients and steps.");
  }
  if (diets.has("vegetarian")) {
    actions.push("Remove all meat, poultry, fish, seafood, and meat stock; use a dish-appropriate vegetarian protein or vegetable substitute everywhere.");
  }
  if (diets.has("vegan")) {
    actions.push("Remove all animal products; use dish-appropriate plant substitutes everywhere.");
  }
  if (diets.has("dairyfree") || diets.has("dairy-free")) {
    actions.push("Replace every dairy ingredient with a dish-appropriate dairy-free equivalent everywhere.");
  }
  for (const allergen of options.allergens ?? []) {
    if (allergen.trim()) actions.push(`Remove or safely replace every occurrence of allergen: ${allergen.trim()}.`);
  }
  for (const excluded of options.excludedIngredients ?? []) {
    if (excluded.trim()) actions.push(`Remove or safely replace every occurrence of excluded ingredient: ${excluded.trim()}.`);
  }
  return actions;
}

/**
 * Builds the per-recipe editor context. A request can carry one source recipe
 * only; ranking and card diversity are deterministic backend responsibilities.
 */
export function buildRecipeGenerationPrompt(ingredients: RecipePromptIngredient[], options: RecipePromptOptions) {
  const sourceRecipe = buildCompactSourceRecipe(
    (options.recipeReferences ?? []).find((reference) => reference.title && reference.ingredients.length && reference.steps.length)
  );
  const restrictions = {
    diets: options.diets.filter(Boolean),
    healthConditions: options.conditions.filter(Boolean),
    allergens: (options.allergens ?? []).filter(Boolean),
    excludedIngredients: (options.excludedIngredients ?? []).filter(Boolean)
  };
  const requiredChanges = sourceRecipe ? buildCompactRestrictionActions(options) : [];
  const dishDiscoveryHints = sourceRecipe
    ? ""
    : buildIngredientDrivenCuisineGuidance(options.preferredCuisine, ingredients);
  const proteinFormRequirements = getRequestedProteinFormRequirements(
    ingredients.map((ingredient) => ingredient.name)
  );

  return JSON.stringify({
    task: sourceRecipe ? "edit_validated_recipe" : "discover_grounded_recipes",
    language: options.recipeLanguage.toLowerCase() === "arabic" ? "ar" : "en",
    preferredCuisine: options.preferredCuisine,
    ...(options.ingredientCoverage ? { ingredientCoverage: options.ingredientCoverage } : {}),
    ...(options.primaryIngredient ? { primaryIngredient: options.primaryIngredient } : {}),
    ...(sourceRecipe
      ? {}
      : {
          recipeCount: options.recipeCount,
          ...(options.discoveryFocus ? { discoveryFocus: options.discoveryFocus } : {}),
          ...(options.variationSeed ? { variationSeed: options.variationSeed } : {}),
          ...(options.recentRecipeAvoidance ? { avoidRecipeNames: options.recentRecipeAvoidance } : {}),
          ...(dishDiscoveryHints ? { dishDiscoveryHints } : {})
        }),
    availableIngredients: ingredients.map((ingredient) => ({
      name: ingredient.name,
      ...(ingredient.quantity ? { quantity: ingredient.quantity } : {})
    })),
    ...(proteinFormRequirements.length ? { proteinFormRequirements } : {}),
    restrictions,
    ...(requiredChanges.length ? { requiredChanges } : {}),
    sourceRecipe
  });
}

export function buildRecipeEditorBatchPrompt(options: RecipeEditorBatchPromptOptions) {
  const sourceRecipes = options.recipeReferences.slice(0, 12).map((reference) => ({
    source_recipe_id: reference.id,
    sourceRecipe: buildCompactSourceRecipe(reference)
  }));
  const restrictions = {
    diets: options.diets.filter(Boolean),
    healthConditions: options.conditions.filter(Boolean),
    allergens: (options.allergens ?? []).filter(Boolean),
    excludedIngredients: (options.excludedIngredients ?? []).filter(Boolean)
  };
  const requiredChanges = buildCompactRestrictionActions(options);

  return JSON.stringify({
    task: "edit_validated_recipe_batch",
    language: options.recipeLanguage.toLowerCase() === "arabic" ? "ar" : "en",
    preferredCuisine: options.preferredCuisine,
    restrictions,
    ...(requiredChanges.length ? { requiredChanges } : {}),
    outputContract: {
      exactRecipeCount: sourceRecipes.length,
      ingredientsContainsCompleteRecipe: true,
      missingIngredientsMustBeEmpty: true,
      preserveSourceRecipeIds: true
    },
    sourceRecipes
  });
}

function buildRealRecipeGuardrails(preferredCuisine: string) {
  const cuisineLabel = preferredCuisine && preferredCuisine !== "Any" ? preferredCuisine : "the best-fitting cuisine";

  return [
    `Use only real, recognizable dish families from ${cuisineLabel}. Do not invent fake recipes, fake cuisine names, fake regional labels, or marketing-style titles.`,
    "Do not fabricate variants like Cairo style, Alexandria style, house special, signature bowl, chef's skillet, or heritage plate unless that dish is an established real-world recipe family.",
    "If the pantry does not support an exact famous recipe, choose the closest real established dish family and put the missing essentials in missing_ingredients instead of inventing a new recipe.",
    "The recipe name must be a stable canonical dish identity that can be translated and cached cleanly in English and Arabic later.",
    "Do not output hybrid or fusion naming unless the dish is already a widely recognized real dish family."
  ].join(" ");
}

function buildAnyCuisineRotationGuidance(recipeCount: number, outputName: string) {
  const minimumCuisineFamilies = recipeCount >= 21 ? 7 : recipeCount >= 10 ? 6 : recipeCount >= 8 ? 5 : 3;
  const egyptianTurkishMediterraneanCap = recipeCount >= 21 ? 9 : recipeCount >= 10 ? 5 : 3;

  return PromptBuilder.compose([
    `Any-cuisine rotation rule: because the user selected Any, the final ${outputName} must show real variety across cuisine families, not only Egyptian, Turkish, and Mediterranean.`,
    `When diet/allergy rules and pantry fit allow it, cover at least ${minimumCuisineFamilies} cuisine families across ${outputName}. Good families include Italian, Mexican, Indian, Thai, Chinese or broader East Asian, American, Middle Eastern or Levantine, Egyptian, Turkish, Mediterranean, Spanish, Greek, and French.`,
    `Do not let Egyptian + Turkish + Mediterranean together take more than ${egyptianTurkishMediterraneanCap} slots unless the pantry or restrictions make other cuisines unsafe or implausible. If they do exceed that cap, the extra slots must use clearly different named dish families and preference_hits should explain why.`,
    "Use each cuisine's own canonical dishes: Italian pizza, risotto, pasta alla norma, minestrone, and chicken cacciatore; Mexican tacos, chilaquiles, huevos rancheros, fajitas, and enchiladas; Indian dal, chana masala, curry, biryani, and bhurji; Thai pad krapow, red curry, tom yum, and larb; East Asian stir-fries, fried rice, teriyaki, kung pao, and Korean bowls; American roast chicken, chili, burgers, stew, and casseroles.",
    "A cuisine label counts toward variety only when the dish name, starch, sauce, aromatics, steps, image_search_index, and plating are internally coherent for that cuisine."
  ]);
}

const CUISINE_PROMPT_GUIDANCE: Record<string, string[]> = {
  any: [
    "When no cuisine is preferred, choose the cuisine whose real dish families best match the pantry ingredients, cooking style, and meal context.",
    "Prefer authentic, recognizable dishes over vague fusion unless the ingredient set clearly supports a fusion result."
  ],
  egyptian: [
    "Egyptian ful topping ladder: distinguish classic ful medames, ful bil zeit, spicy ful bil zeit, Arabiata-style ful with hot oil, tahini, lemon, and cumin, Alexandrian ful with tomato and pepper, ful with tahini-lemon sauce, ful with fried egg, ful tagine with eggs and cheese, ful tray with eggs and sausage, ful tagine with eggs and basterma, ful sandwich in baladi bread, ful with pickles and vegetables, ful salad plate, and ful with olive oil. Lebanese or Syrian ful bil zeit can be used as a nearby Levantine fallback only after Egyptian ful forms are exhausted or when the cuisine is Levantine/Middle Eastern. Use sausage, cheese, or basterma/pastrami only if it is available or explicitly listed in missing_ingredients for that specific card.",
    "Use clearly Egyptian dish logic, not just generic Middle Eastern labeling.",
    "Hawawshi visual rule: hawawshi must be closed Egyptian baladi bread or pita stuffed with minced meat, toasted or baked, and cut into wedges or halves with filling visible at the cut seam. Do not describe hawawshi as beef skewers, kebab sticks, kofta logs, loose mince, shawarma, open-faced lahmacun, or pizza.",
    "Prefer real Egyptian dish families when the ingredients fit, such as ful medames, Alexandrian ful, ful with tahini, ful with egg, ful sandwich, taameya or tameya, shakshuka or shakshouka, eggah, koshary, lentil soup, fasolia, molokhia, hawawshi, kofta kebab, taagen kofta, macarona bechamel, sayadeya, samak singari, fish tagine, samak bel radah, smoked fish, fried tilapia, Egyptian baked fish tray, alexandrian shrimp, farakh meshwi, chicken molokhia, chicken fattah, chicken negresco, or rice-based stews.",
    "Egyptian ful expansion rule: if the available ingredient is only ful, فول, fava beans, or broad beans and cuisine is Egyptian, fill the list first with distinct Egyptian ful forms before borrowing nearby cuisines: classic ful medames with cumin and lemon, Alexandrian ful with tomato and pepper, ful with tahini-lemon sauce, ful with boiled or fried egg, ful sandwich in baladi bread, ful with tomato-pepper salsa, ful with pickles and vegetables, ful salad plate, ful with butter or olive oil, and taameya only when herbs/aromatics are plausible. Only use Levantine, Mediterranean, or generic bean dishes after these forms are exhausted or diet rules require it.",
    "Egyptian fish expansion rule: if the available ingredient is only fish, سمك, tilapia, bouri, snapper, or sea bass and cuisine is Egyptian, fill the list first with distinct Egyptian fish forms before borrowing nearby cuisines: sayadeya fish rice, samak singari, grilled Egyptian fish, samak bel radah, smoked fish, fried tilapia or fried red mullet, Egyptian baked fish tray, Egyptian fish tagine with tomato sauce, roasted whole fish with Egyptian spices, and Egyptian fried fish sandwich. Only use Mediterranean, Middle Eastern, Turkish, or other nearby cuisine after these forms are exhausted or diet rules require it.",
    "Egyptian shrimp expansion rule: if the available ingredient is only shrimp, جمبري, prawns, or mixed seafood and cuisine is Egyptian, fill the list first with distinct Egyptian seafood forms before borrowing nearby cuisines: Alexandrian shrimp, seafood sayadeya, shrimp rice with browned onion, Egyptian shrimp tagine with tomato sauce, grilled shrimp skewers with cumin and coriander, garlic-lemon shrimp, shrimp with tahini-lemon sauce, spicy shrimp stew, seafood soup, and fried shrimp. Only use Mediterranean, Turkish, Chinese, Thai, or Cajun forms after these are exhausted or diet rules require it.",
    "Egyptian breakfast patterns often center on eggs with tomato and pepper, ful, taameya, cheese, tomato, cucumber, bread, and legumes; lunch and dinner often center on rice, legumes, tomato-based stews, grilled meats, kofta, chicken molokhia, farakh meshwi, sayadeya, samak singari, fish tagine, seafood rice, or baked casseroles.",
    "Taameya is traditionally made with fava beans; do not call a recipe taameya unless fava beans or a clearly Egyptian taameya-style base is plausible.",
    "Use Egyptian flavor logic such as onion, garlic, tomato, cumin, coriander, parsley, cilantro, lemon, tahini, rice, vermicelli, lentils, and fava beans where appropriate."
  ],
  italian: [
    "Use clearly Italian or Italian-American dish families only when the ingredients support them. Start from iconic Italian dishes, not generic protein-plus-starch cards with Italian herbs.",
    "Prefer specific dishes such as pizza margherita, pizza marinara, calzone, focaccia, bruschetta, panzanella, caprese salad, minestrone, ribollita, pappa al pomodoro, pasta al pomodoro, arrabbiata, aglio e olio, cacio e pepe, amatriciana, carbonara, puttanesca, pasta alla norma, shrimp linguine, seafood risotto, mushroom risotto, frittata, lasagna, baked pasta, eggplant parmesan, chicken cacciatore, chicken piccata, or chicken parmesan when those structures genuinely fit.",
    "Italian pizza rule: pizza is valid when the pantry has dough, pizza dough, flour plus yeast, flatbread, pita, tortilla, bread, or another credible base plus tomato, tomato sauce, mozzarella, cheese, basil, oregano, mushrooms, tuna, chicken, vegetables, or another plausible topping. Keep pizza in the dish universe and place missing essentials such as yeast, mozzarella, tomato sauce, or basil in missing_ingredients instead of skipping pizza.",
    "Italian sparse pantry rule: if Italian is selected and the pantry is sparse, choose recognizable dish families such as pizza, focaccia, bruschetta, pasta al pomodoro, minestrone, frittata, risotto, caprese, or ribollita before falling back to vague salad, bowl, skillet, or grilled protein titles.",
    "Distinguish tomato pasta from creamy pasta, risotto from plain rice, and Italian from Italian-American; for example, creamy chicken pasta should not be labeled as a classic Italian dish unless the structure really fits.",
    "Use Italian pantry logic such as olive oil, garlic, onion, basil, oregano, parsley, tomato, parmesan, mozzarella, pasta shapes, arborio rice, beans, zucchini, eggplant, and lemon where appropriate."
  ],
  middleeastern: [
    "Use real Middle Eastern or Levantine dish families, not a generic healthy bowl with a regional label.",
    "Prefer dishes such as mujadara, lentil soup, fasolia, kofta, chicken shawarma wraps, beef shawarma plates, lamb shawarma bowls, grilled kebabs, shakshuka, chickpea salad, fattoush, tabbouleh, hummus plates, baked fish with tahini, or rice and lentil dishes when ingredients fit.",
    "Shawarma is a sliced or shaved marinated roasted meat family. Use chicken shawarma for chicken, beef shawarma for intact beef, and lamb shawarma for lamb. Do not describe shawarma as kofta, Adana, kebab skewers, ground meat, or generic wraps.",
    "Middle Eastern shawarma rule: when the pantry has chicken, intact beef, or lamb plus any supporting shawarma signals such as garlic, lemon, cumin, coriander, paprika, allspice, yogurt, tahini, pita, flatbread, rice, pickles, or onion, include a shawarma wrap, plate, or bowl as a strong candidate and list missing support items instead of replacing it with a generic grilled meat meal.",
    "Use regional staple logic such as chickpeas, lentils, fava beans, tahini, yogurt, parsley, mint, lemon, cumin, coriander, garlic, tomato, onion, bulgur, pita, and rice."
  ],
  mediterranean: [
    "Use a clearly Mediterranean pattern centered on olive oil, vegetables, legumes, seafood or grilled proteins, yogurt, herbs, grains, and salads.",
    "Prefer dishes such as Greek salad, baked fish with vegetables, garlic shrimp pasta, chickpea bowls, lentil salad, grilled chicken with rice, stuffed vegetables, shakshuka-style eggs, bean stew, or mezze-inspired plates when ingredients fit.",
    "Do not call a dish Mediterranean if it is structurally closer to a different cuisine family without Mediterranean staples."
  ],
  indian: [
    "Use clearly Indian dish families and naming, not a generic curry label.",
    "Prefer dishes such as dal, chana masala, rajma, fish curry, egg bhurji, paneer curry, palak paneer, vegetable pulao, chicken curry, keema, upma, poha, or masala omelette when ingredients fit.",
    "Use Indian flavor logic such as onion, tomato, ginger, garlic, cumin, coriander, turmeric, chili, garam masala, lentils, chickpeas, rice, yogurt, spinach, paneer, and cilantro where appropriate."
  ],
  mexican: [
    "Use clearly Mexican dish families and naming rather than generic wraps or bowls.",
    "Prefer dishes such as huevos rancheros, chilaquiles, quesadillas, tacos, enchiladas, arroz con pollo, camarones al ajo, sopa de fideo, frijoles, fajitas, or caldos when ingredients fit.",
    "Use Mexican pantry logic such as corn tortillas, beans, tomato, onion, jalapeno, cilantro, lime, queso, rice, avocado, and roasted or stewed salsas where appropriate."
  ],
  american: [
    "Use clearly American home-style or diner-style dish families when that cuisine is selected.",
    "Prefer dishes such as scrambled eggs and toast, breakfast hash, oatmeal bowls, chicken salad, grilled cheese and soup, skillet chicken, roasted chicken, southern buttermilk fried chicken, chicken and rice skillet, creamy spinach chicken, beef stew, garlic butter steak bites, roast beef, French onion braised beef, meatloaf-style plates, mac and cheese, burgers, or sheet-pan dinners when ingredients fit.",
    "Avoid labeling a dish American if it is more specifically Italian, Mexican, Indian, or Middle Eastern in structure."
  ],
  asian: [
    "Treat Asian as a broad umbrella. When ingredients point clearly to a substyle such as Chinese, Japanese, Korean, Thai, or Vietnamese, choose that substyle and reflect it in the recipe name and cuisine field.",
    "Prefer dishes such as kung pao chicken, soy garlic chicken, Korean fried chicken, Mongolian beef, Chinese beef and onion stir-fry, beef and broccoli, black pepper beef, crispy ginger beef, Korean ground beef bowl, fried rice, noodle stir fry, garlic honey shrimp, congee, teriyaki chicken, vegetable stir fry, rice bowls, miso-style soups, or bibimbap-inspired bowls when ingredients fit.",
    "Use Asian flavor logic such as soy sauce, sesame, ginger, garlic, scallion, rice, noodles, mushrooms, chili, and broths where appropriate."
  ],
  thai: [
    "Use clearly Thai dish families and bright Thai balance rather than a generic Asian stir-fry label.",
    "Prefer dishes such as pad krapow, basil chicken, fried rice, red curry, green curry, tom yum shrimp, Thai garlic shrimp, larb, noodle stir fry, or Thai omelette when ingredients fit.",
    "Use Thai flavor logic such as garlic, chili, lime, fish sauce, basil, coconut milk, curry paste, rice, rice noodles, cilantro, and lemongrass where appropriate."
  ],
  turkish: [
    "Use clearly Turkish dish families rather than broad Middle Eastern labels when Turkish is selected.",
    "Prefer dishes such as Turkish kofte, adana kebab, adana durum, beyti kebab, iskender kebab, doner kebab, cag kebap, menemen, karniyarik, Turkish musakka, kiymali pide, lahmacun, kiymali tepsi boregi, spiral borek, mercimek corbasi, rice pilaf, or yogurt-led grilled meat plates when ingredients fit.",
    "Adana kebab visual rule: use Adana only for spicy minced lamb or beef molded onto long flat skewers with ridged compressed-meat texture and char marks; the serving should read as a Turkish kebab plate, not generic kofta. Include lavash, grilled tomato, long green pepper, sumac onion, parsley, bulgur, or salad only when available or explicitly missing.",
    "Turkish ground-meat variety rule: keep Adana kebab, Adana durum or Beyti wrap, Iskender, doner, cag kebap, kofte, lahmacun, kiymali pide, borek, karniyarik, musakka, and Turkish ground-beef stew as separate dish families. Do not output them as duplicate kebab/kofta cards unless the shape, bread, sauce, or vegetable structure is visibly different.",
    "Do not confuse turkey poultry recipes, such as turkey picadillo, with Turkish cuisine.",
    "Use Turkish flavor logic such as onion, garlic, parsley, cumin, sumac, paprika, aleppo pepper, tomato paste, pepper paste, yogurt, lemon, rice, and flatbread where appropriate."
  ]
};

interface CuisineKnowledge {
  substyles?: string[];
  stapleProteins?: string[];
  stapleStarches?: string[];
  stapleAromatics?: string[];
  stapleSauces?: string[];
  visualAnchors?: string[];
  breakfastPatterns?: string[];
  lunchDinnerPatterns?: string[];
  dishTriggers?: string[];
  substitutionRules?: string[];
  guardrails?: string[];
}

const CUISINE_KNOWLEDGE: Record<string, CuisineKnowledge> = {
  egyptian: {
    substyles: ["Cairene street food", "home-style breakfast plates", "rice-and-stew comfort dishes", "grilled meat plates"],
    stapleProteins: ["egg", "ground beef", "ground lamb", "chicken", "fish", "shrimp", "fava bean", "lentil"],
    stapleStarches: ["baladi bread", "rice", "vermicelli rice", "pasta", "lentils"],
    stapleAromatics: ["onion", "garlic", "tomato", "cumin", "coriander", "parsley", "cilantro"],
    stapleSauces: ["tomato sauce", "bechamel", "tahini", "lemon-garlic dressing"],
    visualAnchors: ["golden taameya patties", "stuffed bread wedges", "baked bechamel pasta squares", "tomato-rich breakfast skillets", "rice with browned vermicelli"],
    breakfastPatterns: [
      "ful medames with bread and vegetables",
      "taameya with herbs and aromatics",
      "shakshuka with egg, tomato, and pepper",
      "eggah-style skillet egg dishes"
    ],
    lunchDinnerPatterns: [
      "kofta with rice or tomato sauce",
      "hawawshi with stuffed bread",
      "macarona bechamel with ground meat",
      "farakh meshwi or Egyptian grilled chicken",
      "chicken molokhia with rice",
      "chicken fattah with rice and bread",
      "chicken negresco when chicken and pasta fit",
      "sayadeya fish rice",
      "samak singari, grilled Egyptian fish, samak bel radah, smoked fish, fried tilapia, Egyptian baked fish tray, or Egyptian fish tagine",
      "alexandrian shrimp or seafood sayadeya",
      "koshary with lentils, rice, pasta, and tomato sauce",
      "fasolia or tomato-based bean stews"
    ],
    dishTriggers: [
      "ground meat + parsley/onion/garlic -> kofta",
      "ground meat + bread/pita -> hawawshi",
      "ground meat + pasta + milk or flour or butter -> macarona bechamel",
      "chicken + garlic/lemon/spices -> farakh meshwi",
      "chicken + rice/bread/garlic/vinegar -> chicken fattah",
      "chicken + molokhia/garlic/coriander -> chicken molokhia",
      "chicken + pasta + milk/flour/butter -> chicken negresco",
      "ful/fava bean only + Egyptian cuisine -> rotate classic ful medames, Alexandrian ful, ful with tahini, ful with egg, ful sandwich, ful with tomato-pepper salsa, ful with pickles and vegetables, ful salad plate, ful with butter or olive oil, and taameya-style dishes before non-Egyptian bean recipes",
      "fish + rice + onion -> sayadeya",
      "fish + tomato/pepper/garlic/lemon -> samak singari, Egyptian baked fish tray, or Egyptian fish tagine",
      "fish only + Egyptian cuisine -> rotate sayadeya, samak singari, grilled Egyptian fish, samak bel radah, smoked fish, fried tilapia, baked fish tray, fish tagine with tomato sauce, whole fish with Egyptian spices, and Egyptian fried fish sandwich before non-Egyptian fish recipes",
      "shrimp + garlic/cumin/coriander/lemon -> alexandrian shrimp",
      "shrimp + rice + onion/tomato -> seafood sayadeya",
      "shrimp only + Egyptian cuisine -> rotate Alexandrian shrimp, seafood sayadeya, shrimp rice, Egyptian shrimp tagine with tomato sauce, grilled shrimp skewers, garlic-lemon shrimp, shrimp with tahini-lemon sauce, spicy shrimp stew, seafood soup, and fried shrimp before non-Egyptian shrimp recipes",
      "egg + tomato + bell pepper/onion -> shakshuka",
      "fava bean + herbs + onion/garlic -> taameya",
      "lentil + rice + pasta -> koshary"
    ],
    substitutionRules: [
      "If a classic Egyptian dish is close but missing one or two supporting items, keep the authentic dish family and place the missing staples in missing_ingredients.",
      "Prefer fava bean dishes over generic bean patties when fava beans are present; use chickpea only if fava beans are absent and do not mislabel it as taameya unless clearly Egyptian in structure."
    ],
    guardrails: [
      "Do not label a dish taameya unless a fava-bean or clearly Egyptian herb-bean fritter base is plausible.",
      "Do not call a meat-and-bread recipe hawawshi unless the meat is stuffed into bread or clearly baked in bread.",
      "Do not call a pasta dish macarona bechamel unless it genuinely includes a bechamel-style creamy baked structure."
    ]
  },
  italian: {
    substyles: ["Neapolitan pizza and tomato dishes", "southern tomato-forward pasta", "Roman-style simple pasta", "Tuscan bean-and-bread soups", "Italian-American baked comfort dishes"],
    stapleProteins: ["egg", "chicken", "white fish", "shrimp", "beans", "mozzarella", "parmesan"],
    stapleStarches: ["pizza dough", "flour", "flatbread", "pasta", "risotto rice", "bread", "polenta"],
    stapleAromatics: ["garlic", "onion", "basil", "oregano", "parsley", "lemon"],
    stapleSauces: ["pomodoro", "marinara", "arrabbiata", "pesto", "butter sauce", "cream sauce"],
    visualAnchors: ["round pizza with tomato sauce and melted mozzarella", "red tomato-coated pasta", "creamy white-sauce pasta", "golden baked pasta tops", "herb-finished skillet chicken", "risotto spread in a shallow bowl"],
    breakfastPatterns: ["frittata", "ricotta toast", "savory egg skillet", "bruschetta-style toast"],
    lunchDinnerPatterns: [
      "pizza margherita, pizza marinara, calzone, or focaccia",
      "bruschetta, panzanella, or caprese salad",
      "pasta al pomodoro, arrabbiata, aglio e olio, cacio e pepe, amatriciana, carbonara, puttanesca, or pasta alla norma",
      "shrimp linguine, spaghetti alle vongole, seafood risotto, or mushroom risotto",
      "minestrone, ribollita, pappa al pomodoro, or pasta e fagioli",
      "lasagna, cannelloni, baked ziti, or pasta al forno",
      "chicken cacciatore, chicken piccata, chicken parmesan, eggplant parmesan, or polenta e funghi"
    ],
    dishTriggers: [
      "dough/flour/flatbread/bread + tomato or mozzarella/cheese -> pizza margherita, pizza marinara, calzone, focaccia, or bruschetta depending on form",
      "pizza dough or pizza base + tomato sauce + mozzarella -> pizza margherita before generic flatbread",
      "flatbread/pita/tortilla/bread + tomato + cheese/herbs -> pizza-style flatbread or bruschetta, with missing mozzarella, tomato sauce, or basil listed explicitly",
      "pasta + tomato -> pomodoro/arrabbiata/baked tomato pasta",
      "pasta + olive oil + garlic -> aglio e olio",
      "pasta + egg/cheese -> carbonara or cacio e pepe only when the structure fits",
      "pasta + eggplant + tomato -> pasta alla norma",
      "pasta + dairy -> creamy pasta or alfredo-style family",
      "shrimp + pasta + garlic/lemon -> shrimp linguine or garlic shrimp pasta",
      "fish/shrimp + rice + broth/parmesan -> seafood risotto",
      "egg + vegetables + cheese -> frittata",
      "rice + broth + parmesan -> risotto",
      "beans + bread/greens/tomato -> ribollita, minestrone, or pasta e fagioli",
      "chicken + tomato/onion/herbs -> chicken cacciatore",
      "chicken + lemon/capers/butter -> chicken piccata",
      "eggplant + tomato + mozzarella/parmesan -> eggplant parmesan"
    ],
    substitutionRules: [
      "If parmesan is missing but the structure is otherwise Italian, keep the dish family and list parmesan or pecorino as missing.",
      "If basil is missing, parsley or oregano may support Italian identity, but do not invent pesto unless the herb, nuts, and cheese structure fits.",
      "If a pizza family is the best match but dough, yeast, mozzarella, tomato sauce, or basil is missing, keep the pizza identity and place those essentials in missing_ingredients when the missing count allows it."
    ],
    guardrails: [
      "Do not output multiple generic pasta cards when Italian is selected; rotate named Italian families with different sauces, starch forms, soups, pizza/bread forms, risotto, and baked dishes.",
      "Do not call a flatbread pizza unless it has a credible bread/dough base and a tomato/cheese/topping structure.",
      "Do not call creamy chicken pasta a classic Italian dish unless the rest of the structure supports it; otherwise use Italian-American when appropriate.",
      "Do not label plain rice as risotto unless broth-based creamy risotto technique is plausible."
    ]
  },
  middleeastern: {
    substyles: ["Levantine mezze plates", "grill-house meat dishes", "legume-and-rice comfort meals"],
    stapleProteins: ["chickpea", "lentil", "fava bean", "chicken", "lamb", "beef", "yogurt"],
    stapleStarches: ["rice", "bulgur", "pita", "flatbread"],
    stapleAromatics: ["onion", "garlic", "parsley", "mint", "lemon", "cumin", "coriander"],
    stapleSauces: ["tahini", "yogurt sauce", "tomato stew base"],
    visualAnchors: ["tahini-drizzled plates", "charred kebabs", "lentil-and-rice mounds", "herb-heavy salads", "warm pita service"],
    breakfastPatterns: ["shakshuka", "hummus plate", "labneh plate", "bean breakfast dishes"],
    lunchDinnerPatterns: ["mujadara", "kofta", "shawarma plate", "lentil soup", "bean stew", "grilled kebabs"],
    dishTriggers: [
      "lentil + rice -> mujadara",
      "chickpea + tahini/lemon/garlic -> hummus family",
      "ground meat + parsley/onion/spices -> kofta",
      "chicken + garlic/lemon/cumin/coriander/paprika/allspice/yogurt/tahini/pita/flatbread/rice/pickles -> chicken shawarma wrap, chicken shawarma plate, or chicken shawarma bowl before generic grilled chicken",
      "intact beef + garlic/lemon/cumin/coriander/tahini/pita/flatbread/rice/pickles -> beef shawarma wrap, beef shawarma plate, or beef shawarma bowl before generic beef plates",
      "lamb + garlic/lemon/cumin/coriander/yogurt/tahini/pita/flatbread/rice/pickles -> lamb shawarma wrap, lamb shawarma plate, or lamb shawarma bowl before generic lamb plates"
    ],
    substitutionRules: [
      "Keep dishes within Levantine or broader Middle Eastern families when the pantry strongly fits one regional branch.",
      "If tahini is missing, keep the dish family and list tahini as missing instead of renaming the dish to a generic salad or bowl."
    ],
    guardrails: [
      "Do not label a dish shawarma unless the seasoning and sliced or shaved meat plate/wrap structure fit.",
      "Do not turn shawarma into kofta, Adana, kebab skewers, ground meat bowls, or generic wraps.",
      "Do not call any lentil-and-rice dish mujadara unless onion-led Levantine structure is plausible."
    ]
  },
  mediterranean: {
    substyles: ["Greek-inspired salads and bakes", "eastern Mediterranean grill plates", "olive-oil vegetable dishes"],
    stapleProteins: ["fish", "chicken", "egg", "chickpea", "lentil", "yogurt", "feta"],
    stapleStarches: ["rice", "orzo", "bread", "potato"],
    stapleAromatics: ["olive oil", "lemon", "garlic", "oregano", "parsley", "mint", "tomato"],
    stapleSauces: ["olive oil-lemon dressing", "yogurt sauce", "tomato braise"],
    visualAnchors: ["olive-oil gloss", "lemon-herb grilled proteins", "feta-topped salads", "roasted vegetables"],
    breakfastPatterns: ["egg and tomato skillets", "yogurt bowls", "feta and vegetable plates"],
    lunchDinnerPatterns: ["grilled fish", "garlic shrimp pasta", "stuffed vegetables", "bean salad", "lentil salad", "grilled chicken with rice", "vegetable stew"],
    dishTriggers: [
      "fish + lemon + herbs -> baked or grilled Mediterranean fish",
      "shrimp + pasta + garlic + lemon -> garlic shrimp pasta",
      "chickpea + cucumber/tomato/herbs -> Mediterranean chickpea salad",
      "yogurt + cucumber/garlic -> yogurt sauce plate",
      "egg + tomato + feta -> Mediterranean egg skillet"
    ],
    substitutionRules: [
      "Use olive-oil, herb, vegetable-forward structures before heavy cream sauces when Mediterranean is selected.",
      "If seafood is absent, legumes or grilled chicken can carry the cuisine identity."
    ],
    guardrails: [
      "Do not use Mediterranean as a vague fallback when a more specific cuisine family clearly fits better."
    ]
  },
  indian: {
    substyles: ["North Indian masala gravies", "home-style dal meals", "breakfast skillet and grain dishes"],
    stapleProteins: ["lentil", "chickpea", "kidney bean", "paneer", "egg", "chicken", "ground meat"],
    stapleStarches: ["rice", "flatbread", "poha", "semolina"],
    stapleAromatics: ["onion", "tomato", "ginger", "garlic", "cumin", "coriander", "turmeric", "chili"],
    stapleSauces: ["masala gravy", "yogurt marinade", "spinach gravy"],
    visualAnchors: ["deep orange-red masala", "tempered lentils", "cilantro finish", "rice with curry spooned over"],
    breakfastPatterns: ["poha", "upma", "masala omelette", "egg bhurji"],
    lunchDinnerPatterns: ["dal", "chana masala", "rajma", "fish curry", "paneer curry", "keema", "chicken curry", "pulao"],
    dishTriggers: [
      "lentil + cumin/turmeric/aromatics -> dal",
      "chickpea + tomato/onion/ginger/garlic -> chana masala",
      "kidney bean + tomato/onion/aromatics -> rajma",
      "fish + tomato/onion/ginger/garlic -> fish curry",
      "ground meat + peas/spices -> keema",
      "paneer + spinach -> palak paneer"
    ],
    substitutionRules: [
      "If paneer is missing but spinach and dairy are present, list paneer as missing rather than renaming the dish generically.",
      "Use curry names only when the spice-and-gravy structure genuinely fits."
    ],
    guardrails: [
      "Do not call every saucy dish curry; prefer dal, masala, bhurji, pulao, or keema when those structures are more exact."
    ]
  },
  mexican: {
    substyles: ["street taco and tortilla dishes", "home-style rice-and-bean plates", "salsa-led breakfast dishes"],
    stapleProteins: ["egg", "beans", "chicken", "beef", "cheese"],
    stapleStarches: ["corn tortilla", "flour tortilla", "rice", "fideo"],
    stapleAromatics: ["tomato", "onion", "jalapeno", "cilantro", "lime", "garlic"],
    stapleSauces: ["salsa roja", "salsa verde", "chipotle-tomato base"],
    visualAnchors: ["charred tortillas", "salsa spooned eggs", "rice-and-bean sides", "cilantro-lime garnish"],
    breakfastPatterns: ["huevos rancheros", "chilaquiles", "breakfast tacos", "bean and egg plates"],
    lunchDinnerPatterns: ["tacos", "quesadillas", "enchiladas", "fajitas", "arroz con pollo", "camarones al ajo", "sopa de fideo"],
    dishTriggers: [
      "egg + tortilla + salsa -> huevos rancheros or breakfast tacos",
      "tortilla + cheese -> quesadilla family",
      "chicken + rice + tomato -> arroz con pollo",
      "shrimp + garlic + lime -> camarones al ajo",
      "fideo + tomato broth -> sopa de fideo"
    ],
    substitutionRules: [
      "If tortillas are missing, keep taco or enchilada families only when tortillas can reasonably appear in missing_ingredients.",
      "Prefer beans, salsa, and tortilla logic over generic wraps."
    ],
    guardrails: [
      "Do not call a dish tacos or enchiladas without tortillas.",
      "Do not label any bean-and-rice bowl Mexican unless the salsa, tortilla, or Mexican pantry structure fits."
    ]
  },
  american: {
    substyles: ["diner breakfast", "weeknight skillet comfort food", "baked casserole comfort dishes"],
    stapleProteins: ["egg", "chicken", "ground beef", "turkey", "cheddar"],
    stapleStarches: ["bread", "potato", "pasta", "oats", "rice"],
    stapleAromatics: ["onion", "garlic", "mustard", "celery", "black pepper"],
    stapleSauces: ["gravy", "cheese sauce", "barbecue sauce", "pan sauce"],
    visualAnchors: ["golden roast chicken skin", "crispy fried chicken pieces", "creamy spinach chicken skillet", "chicken and rice skillet", "chunky beef stew", "garlic butter steak bites", "sliced roast beef", "braised shredded beef", "golden cheese tops", "hash-browned potatoes", "stacked sandwiches", "red-sauce ground beef penne", "chunky hamburger stew", "sheet-pan roasted trays"],
    breakfastPatterns: ["scrambled eggs and toast", "breakfast hash", "oatmeal bowl", "omelette"],
    lunchDinnerPatterns: ["roasted chicken", "southern buttermilk fried chicken", "chicken and rice skillet", "creamy spinach chicken", "classic beef stew", "garlic butter steak bites", "roast beef", "French onion braised beef", "meatloaf-style plates", "burgers", "mac and cheese", "ground beef penne", "ground beef pasta skillet", "hamburger stew", "skillet chicken", "sheet-pan dinners", "grilled cheese and soup"],
    dishTriggers: [
      "chicken + herbs/garlic/butter -> roasted chicken or garlic butter chicken, not a generic chicken bowl",
      "chicken + cream/spinach -> creamy spinach chicken or chicken Florentine",
      "chicken + rice -> chicken and rice skillet or chicken rice tray when rice is part of the named dish",
      "chicken + buttermilk/flour/breadcrumbs -> southern fried chicken",
      "beef cubes + potato/carrot/celery/tomato or broth -> classic beef stew",
      "beef steak or beef chunks + garlic/butter/herbs -> garlic butter steak bites",
      "beef roast or steak + herbs/potatoes/carrots -> roast beef or beef tenderloin roast",
      "beef + onion + broth + mashed potatoes/bread -> French onion braised beef",
      "ground beef + bread buns -> burger family",
      "ground beef + penne/pasta + tomato sauce -> one-pan ground beef penne or beef tomato pasta skillet",
      "ground beef + potato/carrot/celery + tomato -> hamburger stew",
      "pasta + cheddar/milk -> mac and cheese",
      "potato + egg + onion -> breakfast hash",
      "ground meat + breadcrumbs + onion -> meatloaf-style bake"
    ],
    substitutionRules: [
      "Use American as a fallback only when another cuisine family does not fit more precisely.",
      "If the structure is diner-style or home-style comfort food, American can be appropriate even with simple pantry ingredients."
    ],
    guardrails: [
      "Do not label a clearly Italian, Mexican, Indian, or Middle Eastern dish as American just because the pantry is broad."
    ]
  },
  asian: {
    substyles: ["Chinese-style stir-fry and fried rice", "Japanese-inspired rice and noodle bowls", "Korean-style savory rice dishes", "Thai-style basil and curry dishes", "Vietnamese noodle and herb dishes"],
    stapleProteins: ["egg", "chicken", "beef", "tofu", "shrimp"],
    stapleStarches: ["rice", "rice noodle", "wheat noodle"],
    stapleAromatics: ["soy sauce", "ginger", "garlic", "scallion", "sesame", "chili"],
    stapleSauces: ["soy-ginger sauce", "oyster-style sauce", "broth", "teriyaki-style glaze"],
    visualAnchors: ["glossy kung pao chicken cubes", "soy garlic glazed chicken", "crispy Korean fried chicken pieces", "thin Mongolian beef strips", "black pepper beef strips", "beef and broccoli stir-fry", "crispy ginger beef strips", "scallion and sesame garnish", "brothy noodle bowls", "rice topped with sliced protein"],
    breakfastPatterns: ["congee", "savory egg rice bowls"],
    lunchDinnerPatterns: ["kung pao chicken", "soy garlic chicken", "korean fried chicken", "Mongolian beef", "beef and broccoli", "black pepper beef", "Chinese beef and onion stir-fry", "crispy ginger beef", "Korean ground beef bowl", "fried rice", "stir-fried noodles", "garlic honey shrimp", "rice bowls", "brothy noodle soups", "teriyaki-style proteins"],
    dishTriggers: [
      "chicken + peanuts/chili/scallion/soy -> kung pao chicken",
      "chicken + soy/garlic/honey or soy/garlic/scallion -> soy garlic chicken",
      "chicken + crispy fried coating + gochujang/soy-garlic glaze -> Korean fried chicken",
      "beef + scallion/soy/ginger/brown sugar -> Mongolian beef with thin glossy strips",
      "beef + broccoli/soy/garlic -> beef and broccoli stir-fry",
      "beef + black pepper/bell pepper/onion -> black pepper beef",
      "beef + onion/scallion/soy -> Chinese beef and onion stir-fry",
      "beef strips + ginger + crispy coating -> crispy ginger beef",
      "ground beef + soy/sesame/scallion + rice -> Korean ground beef bowl",
      "rice + egg + soy/scallion -> fried rice family",
      "noodle + soy/ginger/garlic -> stir-fried noodle family",
      "shrimp + garlic + honey + soy -> garlic honey shrimp",
      "rice + broth + aromatics -> congee or rice soup family"
    ],
    substitutionRules: [
      "When ingredients point clearly to Thai, Chinese, Japanese, Korean, or Vietnamese patterns, choose that substyle explicitly.",
      "If the pantry lacks defining substyle markers, keep the cuisine label broad as Asian but still use a real Asian dish family."
    ],
    guardrails: [
      "Do not call a dish teriyaki, ramen, pad thai, or bibimbap unless that structure clearly fits."
    ]
  },
  thai: {
    substyles: ["basil-chili stir-fries", "coconut curries", "lime-forward herb salads", "rice-noodle wok dishes"],
    stapleProteins: ["chicken", "shrimp", "egg", "tofu"],
    stapleStarches: ["jasmine rice", "rice noodle"],
    stapleAromatics: ["garlic", "chili", "lime", "fish sauce", "basil", "cilantro", "lemongrass"],
    stapleSauces: ["red curry", "green curry", "fish sauce-lime dressing", "coconut curry base"],
    visualAnchors: ["holy basil and chili flecks", "coconut-rich curry bowls", "lime wedges", "rice noodle wok-char"],
    breakfastPatterns: ["Thai omelette with rice", "savory rice-based breakfasts"],
    lunchDinnerPatterns: ["pad krapow", "fried rice", "curry", "larb", "tom yum shrimp", "thai garlic shrimp", "rice noodle stir fry"],
    dishTriggers: [
      "rice noodle + egg/protein + lime/fish sauce -> Thai noodle stir fry family",
      "ground meat + basil + chili -> pad krapow style dish",
      "coconut milk + curry aromatics + protein -> Thai curry family",
      "shrimp + lemongrass + lime + chili -> tom yum shrimp",
      "shrimp + garlic + fish sauce + rice -> thai garlic shrimp",
      "lime + chili + herbs + minced meat -> larb-style salad"
    ],
    substitutionRules: [
      "If fish sauce is missing, keep Thai identity only when enough other Thai markers remain or place fish sauce in missing_ingredients.",
      "Use basil-chili-garlic logic before generic soy stir-fry when Thai is selected and the pantry supports it."
    ],
    guardrails: [
      "Do not call a dish pad thai unless tamarind/noodle/egg/Thai stir-fry structure fits.",
      "Do not label any coconut stew Thai curry unless curry aromatics or Thai markers are plausible."
    ]
  },
  turkish: {
    substyles: ["grill-house kofte and kebabs", "Turkish bakery flatbreads", "savory borek pastries", "home-style tomato and egg pans", "eggplant and pilaf comfort dishes"],
    stapleProteins: ["ground meat", "lamb", "beef", "egg", "yogurt", "lentil", "chicken"],
    stapleStarches: ["rice", "flatbread", "bulgur", "pide"],
    stapleAromatics: ["onion", "garlic", "parsley", "cumin", "sumac", "paprika", "aleppo pepper", "tomato paste"],
    stapleSauces: ["pepper paste", "tomato sauce", "yogurt sauce", "butter-paprika drizzle"],
    visualAnchors: ["grilled kofte logs", "charred Adana flat skewers", "Adana durum or Beyti lavash wrap", "sliced doner over bread for Iskender", "thin sliced doner kebab", "horizontal cag kebap slices", "boat-shaped kiymali pide", "thin round lahmacun", "golden spiral borek", "tray-cut kiymali tepsi boregi", "split stuffed karniyarik eggplant", "layered Turkish musakka", "tomato-rich egg pans", "yogurt-finished meat plates", "rice pilaf beside kebabs"],
    breakfastPatterns: ["menemen", "egg and pepper skillets", "cheese and tomato breakfast plates"],
    lunchDinnerPatterns: ["kofte", "adana kebab", "adana durum", "beyti kebab", "iskender kebab", "doner kebab", "cag kebap", "kiymali pide", "lahmacun", "kiymali tepsi boregi", "spiral borek", "karniyarik", "turkish musakka", "turkish ground beef stew", "lentil soup", "pilaf plates", "yogurt-led grill plates"],
    dishTriggers: [
      "ground meat + onion + parsley + cumin -> Turkish kofte",
      "ground meat + paprika, aleppo pepper, chili, or pepper paste -> adana kebab style dish with long flat skewers and ridged spicy minced-meat texture",
      "adana + lavash/wrap -> Adana durum or Beyti kebab, with the wrap visibly different from a plain kebab plate",
      "sliced doner + bread + tomato sauce + yogurt -> Iskender kebab, not Adana",
      "thin sliced meat from a vertical roast -> doner kebab; horizontal lamb slices -> cag kebap",
      "ground meat + dough/flatbread + tomato/pepper -> kiymali pide or lahmacun",
      "ground meat + phyllo/yufka + onion/spices -> Turkish spiral borek or kiymali tepsi boregi",
      "ground meat + vegetables + tomato sauce -> Turkish ground beef stew when the form is saucy and loose",
      "egg + tomato + pepper -> menemen",
      "eggplant + ground meat + tomato -> karniyarik or Turkish musakka"
    ],
    substitutionRules: [
      "If a Turkish dish needs pepper paste, sumac, yogurt, or flatbread to feel authentic, keep the dish family and place those items in missing_ingredients.",
      "For ground meat, favor kofte or kebab families before generic meatballs unless the pantry clearly points elsewhere."
    ],
    guardrails: [
      "Do not label a dish Turkish kofte unless the meat mixture has a plausible onion-herb-spice structure.",
      "Do not call a dish adana kebab unless a spicy minced-meat skewer or kebab structure is plausible."
    ]
  }
};

function buildVegetarianVarietyGuidance(diets: string[], recipeCount: number): string {
  const isVegetarian = diets.includes("vegetarian");
  const isVegan = diets.includes("vegan");
  const isPescatarian = diets.includes("pescatarian");
  if (!isVegetarian && !isVegan && !isPescatarian) return "";

  const minimumDistinctForms = Math.min(recipeCount, recipeCount >= 7 ? 6 : Math.max(recipeCount - 1, 3));

  if (isPescatarian) {
    const isDairyFree = diets.includes("dairyFree");
    const isMealPlan = recipeCount >= 14;
    const fishFrequencyRule = isMealPlan
      ? "Pescatarian weekly meal plan fish quota: across the 7-day plan, fish or seafood MUST be the primary protein in at least 6 of the 21 meal slots — ideally 1 to 2 fish or seafood lunches and 1 to 2 fish or seafood dinners across the week. Do NOT fill the week with vegetarian or legume-based meals and add only one token fish dish. The plan should feel like a pescatarian plan, not a vegetarian plan with a single fish card."
      : isDairyFree
      ? "Include at least one legume-based dish and at least one seafood-other-than-shrimp dish when generating four or more cards. Do not use eggs or dairy."
        : "Include at least one egg dish, at least one legume-based dish, and at least one seafood-other-than-shrimp dish when generating four or more cards.";
    const preferredTagClarification = isMealPlan
      ? "CRITICAL clarification: the system profile lists 'preferredDietTags: vegetarian' alongside 'pescatarian'. This does NOT mean the meal plan should be vegetarian-dominant. It means vegetarian options are compatible with the diet — fish and seafood are the primary animal proteins for pescatarian users and must appear prominently throughout the week."
      : "";
    const healthConditionClarification = isMealPlan
      ? "Health condition note for pescatarian: baked, grilled, and steamed fish is naturally low in saturated fat and sodium — it is ideal for users with high blood pressure or high cholesterol. Do NOT avoid fish and seafood because of these health conditions. Fish such as tilapia, white fish, salmon, tuna, and shrimp prepared without heavy salt or cream are fully compatible with low-fat and low-sodium nutrition targets. Choosing a grilled fish fillet or baked tilapia is safer than a high-sodium legume stew when the sodium limit is tight."
      : "";
    return [
      isDairyFree
        ? "Pescatarian distinct-variety mode is active. Fish and seafood are fully allowed; eggs, dairy, meat, and poultry are forbidden by the combined strict diet rules."
        : "Pescatarian distinct-variety mode is active. Fish, seafood, eggs, and dairy are fully allowed; all meat and poultry are forbidden.",
      `Produce at least ${minimumDistinctForms} visibly different dish forms across the set.`,
      preferredTagClarification,
      healthConditionClarification,
      fishFrequencyRule,
      isDairyFree
        ? "Strong pescatarian dish families to draw from: grilled or baked salmon fillet, baked tilapia with herbs and lemon, tuna pasta or tuna salad without mayonnaise, shrimp stir-fry, fish tacos or fish burrito bowl without dairy sauce, grilled tilapia with herbs, calamari with tomato sauce, pasta with shrimp or clam sauce, fish soup or chowder without cream, prawn curry without dairy, crab rice or crab pasta, mujadara lentils with caramelised onion, smoked salmon rice bowl, fish with roasted vegetables, seafood paella, Mediterranean stuffed peppers with shrimp, Egyptian sayadeya fish rice, samak singari grilled fish, Egyptian fish tagine."
        : "Strong pescatarian dish families to draw from: grilled or baked salmon fillet, baked tilapia with herbs and lemon, tuna pasta or tuna salad, shrimp stir-fry or shrimp garlic butter, fish tacos or fish burrito bowl, shakshuka with eggs, omelette or frittata with vegetables, grilled tilapia with herbs, calamari with tomato sauce, pasta with shrimp or clam sauce, fish soup or chowder, prawn curry, crab rice or crab pasta, mujadara lentils with caramelised onion, smoked salmon rice bowl, fish with roasted vegetables, seafood paella, Mediterranean stuffed peppers with shrimp, Egyptian sayadeya fish rice, samak singari grilled fish, Egyptian fish tagine.",
      isDairyFree
        ? "Do not make the set mostly fried battered fish. Vary the protein form, cooking method, and sauce base across fish, shrimp, calamari, legumes, and vegetables. Do not use eggs or dairy."
        : "Do not make the set mostly fried battered fish. Vary the protein form, cooking method, and sauce base across fish, shrimp, calamari, and eggs.",
      "Do not output any dish that contains chicken, beef, lamb, pork, turkey, or any other land animal meat."
    ].filter(Boolean).join(" ");
  }

  const isDairyFree = diets.includes("dairyFree");
  const vegetarianProteinRule = isDairyFree || isVegan
    ? "Vegetarian dairy-free distinct-variety mode is active. No meat, no poultry, no fish, no seafood, no eggs, and no dairy. Use legumes, beans, lentils, chickpeas, tofu, vegetables, grains, nuts, and seeds as the protein and texture base."
    : "Vegetarian distinct-variety mode is active. No meat, no poultry, no fish, no seafood. Eggs and dairy are allowed.";
  const vegetarianForbiddenRule = isDairyFree || isVegan
    ? "Do not output any dish that contains chicken, beef, lamb, pork, turkey, fish, shrimp, seafood, egg, eggs, egg whites, egg yolks, mayonnaise, dairy milk, dairy cream, cheese, dairy butter, yogurt, labneh, ghee, whey, casein, or any other animal meat or dairy. Plant milks and plant creams are allowed when explicitly plant-based."
    : "Do not output any dish that contains chicken, beef, lamb, pork, turkey, fish, shrimp, seafood, or any other animal meat.";

  return PromptBuilder.compose([
    vegetarianProteinRule,
    `Produce at least ${minimumDistinctForms} visibly different dish forms across the set.`,
    "Vegetable-forward mandate: when vegetarian or vegan is selected, do not treat lentils, chickpeas, beans, hummus, falafel, or rice as the default answer. At least half of a 10-card vegetarian set, and at least half of a vegetarian weekly plan when pantry allows, should be vegetable-led named dishes where the visible hero is a vegetable or vegetable mix: eggplant, zucchini, cauliflower, broccoli, mushrooms, peppers, potatoes, sweet potatoes, squash, cabbage, grape leaves, okra, green beans, spinach, carrots, peas, corn, tomato, or mixed roasted vegetables.",
    "Vegetable technique ladder: rotate vegetables through roasted traybakes, stuffed vegetables, stews, soups, curries, stir-fries, fritters, casseroles, pasta dishes, flatbreads or pizza, tacos or enchiladas, sandwiches, grain bowls, salads, gratins or dairy-free bakes, and pureed creamy soups with plant milk when needed. A plain vegetable side is not enough; make it a complete named meal.",
    "Vegetable family anti-repeat rule: do not output multiple rice-legume bowls when vegetables are available. If the pantry has several vegetables, each repeated base must change the hero vegetable and dish form, for example cauliflower tacos, mushroom curry, zucchini boats, stuffed peppers, broccoli soup, eggplant pasta, potato hash, cabbage rolls, okra tomato stew, green bean fasolakia, or roasted squash risotto.",
    "Vegetarian lentil anti-clustering rule: do not default to mujadara for every lentil card. Mujadara is only one lentil family. Rotate lentils through lentil kofta or lentil patties, lentil salad, lentil soup, lentil dal, lentil curry, lentil bolognese, lentil moussaka, lentil shepherd's pie, lentil stuffed peppers, koshary with lentils/rice/pasta, lentil tacos, lentil loaf, lentil stew, lentil kibbeh or kofte, and lentil pasta bake when pantry and cuisine fit.",
    "Vegetarian eggplant anti-clustering rule: eggplant should not become only grilled eggplant or baba ghanoush. Rotate eggplant through fried eggplant, eggplant musakhan-style plates when culturally appropriate, Turkish musakka, Greek moussaka, eggplant parmesan, pasta alla norma, baba ghanoush, mutabbal, pickled eggplant, stuffed eggplant with rice or vegetables, sheikh el mahshi vegetarian style, eggplant bechamel casserole, eggplant chickpea tagine, eggplant curry, roasted eggplant salad, and eggplant sandwiches when diet rules allow.",
    "Vegetable-specific dish map: cauliflower can become roasted cauliflower steak, cauliflower tacos, cauliflower curry, cauliflower shawarma bowl, cauliflower soup, gobi manchurian, aloo gobi, or cauliflower bolognese. Broccoli can become broccoli pasta, broccoli soup with oat or almond milk, broccoli stir-fry, broccoli cheddar only when dairy is allowed, broccoli pesto pasta, or broccoli potato bake. Mushrooms can become mushroom shawarma, mushroom stroganoff, mushroom risotto, mushroom curry, stuffed mushrooms, mushroom tacos, mushroom soup, or mushroom noodle stir-fry. Zucchini can become kousa mahshi, zucchini boats, zucchini fritters, ratatouille, zucchini pasta, briam, or vegetable lasagne. Peppers can become stuffed peppers, fajitas, pepper tomato stew, peperonata, shakshuka-style eggless tomato pepper skillet, or roasted pepper pasta. Cabbage can become malfouf, sarma, cabbage rolls, stir-fried cabbage noodles, cabbage soup, or roasted cabbage steaks. Okra can become bamia tomato stew, okra curry, gumbo-style okra stew, or roasted okra. Green beans can become fasolakia, stir-fried green beans, green bean casserole when diet allows, or tomato green bean stew.",
    isDairyFree || isVegan
      ? "Dairy-free cooking knowledge: almond milk, oat milk, coconut milk, soy milk, cashew milk, coconut cream, and cashew cream are allowed plant-based substitutes. Use them for broccoli soup, cauliflower chowder, creamy vegetable soup, vegan pancakes, oatmeal, chia pudding, dairy-free white sauce, and curry when they fit; do not treat them as dairy."
      : "",
    recipeCount >= 14
      ? "Plant-based weekly variety cap: across the 21 weekly meal slots, do not let rice appear in more than about one-third of meals, and do not let lentils/chickpeas/beans/ful/hummus/falafel dominate more than about half the week. Use potatoes, pasta, noodles, quinoa, bulgur, bread/flatbread, oats, mushrooms, tofu, eggplant, zucchini, cauliflower, okra, squash, salads, soups, traybakes, sandwiches, and vegetable mains to create variety."
      : "Plant-based variety cap: do not let rice plus lentils/chickpeas/beans dominate the set. Use potatoes, pasta, noodles, quinoa, bread/flatbread, mushrooms, tofu, eggplant, zucchini, cauliflower, squash, salads, traybakes, sandwiches, and vegetable mains.",
    "Southern-inspired vegetarian dinner variety: use this as a shape library, not as a fixed menu. Rotate through casseroles, skillet dinners, soups, stews, pot pies, hand pies, stuffed vegetables, pasta bakes, pizzas or flatbreads, sandwiches, grain bowls, bean mains, vegetable centerpiece mains, hearty salads, tacos, enchiladas, and sheet-pan meals.",
    "Good Food-inspired vegetarian dinner variety: also rotate through global meat-free family suppers such as vegetable lasagne, sweet potato peanut curry, veggie shepherd's pie with sweet potato mash, butternut squash risotto, coconut squash dhansak, vegetarian bolognese, mushroom curry, vegetarian chilli, pasta bake, warming stew, traybake, pie, and bean or lentil mains. Use these as real dish-family anchors instead of generic vegetable plates.",
    "Everyday vegetarian dinner variety: include practical named families such as black bean enchiladas, easy chickpea curry, pasta primavera, vegetarian taco skillet, lasagna stuffed mushrooms, vegetarian tikka masala, roasted cauliflower chickpea tacos, black bean soup, black bean quinoa enchilada bake, ratatouille, sesame noodles, white bean soup, stacked roasted vegetable enchiladas, butternut squash enchiladas, chickpea salad sandwich, roasted vegetable lasagne, white bean skillet, enchilada stuffed sweet potatoes, creamy lemon ravioli, butternut squash baked ziti, veggie pizza, skillet vegetarian enchiladas, Asian quinoa salad, bean and cheese burritos, spaghetti with chickpeas and kale, vegetarian fajitas, pasta pomodoro, cauliflower chowder, broccoli pasta, black bean taquitos, cottage cheese frittata, cauliflower bolognese, migas, sweet potato hash, roasted corn chowder, enchilada stuffed mushrooms, sweet potato refried bean tostadas, roasted vegetable quinoa bowls, butternut squash mac and cheese, vegetable soup, vegetarian chili mac, skillet vegetable lasagna, chickpea shawarma bowls, and broccoli cheese soup when diet rules allow them.",
    isDairyFree || isVegan
      ? "Strong vegetarian dairy-free dish families to draw from: stuffed bell peppers with rice and vegetables, kousa mahshi, vegetarian cabbage rolls, grape leaves with rice and herbs, tomato-basil pasta without cheese, marinara pizza or flatbread without cheese, mushroom risotto finished with olive oil, vegetable tagine with couscous, lentil moussaka without dairy, tofu vegetable stir-fry, baba ghanoush with pita, mutabbal without yogurt, pickled eggplant, fried eggplant, stuffed eggplant with rice and vegetables, eggplant chickpea tagine, eggplant curry, roasted eggplant salad, vegetable soup, tomato okra stew, fasolakia green beans, broccoli oat-milk soup, cauliflower chowder with almond milk, mushroom curry, mushroom shawarma, mushroom tacos, zucchini boats, ratatouille, briam, imam bayildi, vegetable pot pie with dairy-free crust, roasted cauliflower steak, sweet potato peanut curry, coconut squash dhansak, dairy-free vegetable lasagne, vegetable traybake, lentil shepherd's pie with olive-oil mash, black bean soup, roasted cauliflower chickpea tacos without dairy sauce, sweet potato refried bean tostadas without dairy, roasted vegetable quinoa bowls, dairy-free vegetable chili mac, black bean enchiladas without cheese, white bean skillet, lentil soup, lentil kofta, lentil patties, lentil salad, mujadara, koshary, chickpea curry or chana masala, falafel with tahini, and lentil dal."
      : "Strong vegetarian dish families to draw from: stuffed bell peppers with rice and vegetables, kousa mahshi, vegetarian cabbage rolls, grape leaves with rice and herbs, caprese or Greek salad, pasta primavera, pasta with tomato basil sauce, margherita pizza or flatbread, mushroom risotto, vegetable tagine with couscous, palak paneer or paneer tikka, moussaka with lentils, vegetable stir-fry with tofu or egg, baba ghanoush with pita, mutabbal, pickled eggplant, fried eggplant, Turkish musakka, Greek moussaka, eggplant parmesan, pasta alla norma, stuffed eggplant with rice and vegetables, sheikh el mahshi vegetarian style, eggplant bechamel casserole, tomato okra stew, fasolakia green beans, broccoli pasta, broccoli soup, mushroom curry, mushroom shawarma, mushroom tacos, zucchini boats, ratatouille, briam, imam bayildi, macaroni and cheese, spinach and cheese pie, vegetable lasagne, black bean enchiladas, tomato pie, vegetable pot pie, roasted cauliflower steak, sweet potato peanut curry, coconut squash dhansak, vegetarian chilli, vegetarian bolognese, butternut squash risotto, veggie shepherd's pie, vegetable traybake, pasta bake, shakshuka eggs in tomato sauce, cheese omelette or vegetable frittata, lentil soup, lentil kofta, lentil patties, lentil salad, mujadara, lentil dal, koshary, chickpea curry or chana masala, falafel with tahini, and bean tacos or burritos.",
    "Do not default to plain rice and lentils for every card. Vary the protein source, cooking form, cuisine region, and plate architecture across the list.",
    isDairyFree || isVegan
      ? "For vegetarian dairy-free variety, rotate legumes, beans, lentils, chickpeas, tofu, mushrooms, eggplant, cauliflower, squash, grains, nuts, and seeds. Do not use eggs or dairy as shortcuts."
      : "For vegetarian variety, rotate eggs, legumes, cheese, yogurt, paneer, tofu, mushrooms, eggplant, cauliflower, squash, beans, lentils, chickpeas, grains, nuts, and seeds.",
    vegetarianForbiddenRule
  ]);
}

function buildPescatarianFishGate(diets: string[], conditions: string[], recipeCount: number): string {
  if (!diets.includes("pescatarian")) return "";

  const hasHeartConditions = conditions.includes("cholesterol") || conditions.includes("highBloodPressure");
  const isDairyFree = diets.includes("dairyFree");

  const heartNote = hasHeartConditions
    ? "CRITICAL health clarification: high blood pressure and high cholesterol do NOT make fish or seafood unsafe or forbidden. Baked, grilled, and steamed fish is naturally low in saturated fat and low in sodium — nutritionists and cardiologists actively recommend fish for both conditions. Do NOT use heart-health conditions as a justification to avoid fish. Instead choose heart-safe fish preparations: bake or grill without heavy cream or excess salt, and the fish will satisfy all fat and sodium targets."
    : "";

  const dairyFreeNote = isDairyFree
    ? "DAIRY-FREE + PESCATARIAN clarification: these two diets do NOT conflict. Plain baked, grilled, or steamed fish and seafood contain zero dairy by default — they are fully compatible with dairy-free. The user does NOT need dairy-based fish preparations. Use tomato sauce, lemon-herb, olive oil, garlic, or spice-based preparations for fish. Do NOT avoid fish because you cannot add cream or cheese — simply use dairy-free preparations."
    : "";

  const isMealPlan = recipeCount >= 14;

  if (isMealPlan) {
    return [
      "PESCATARIAN FISH INCLUSION GATE — this rule overrides cuisine defaults, health-condition safe-food bias, and any other variety guidance below.",
      "The user has selected a PESCATARIAN diet. Fish and seafood are the defining proteins of this diet and MUST appear prominently in the weekly plan.",
      "HARD REQUIREMENT: fish or seafood must be the primary protein in a MINIMUM of 6 of the 21 meal slots across the 7-day plan. Distribute fish and seafood across at least 4 different days, using a variety of types and preparations (e.g., baked tilapia, grilled salmon, shrimp tagine, fish soup, sayadeya fish rice, samak singari, calamari, shrimp stir-fry).",
      "DO NOT fill the weekly plan primarily with legume-based meals (ful, lentils, chickpeas, beans) and add only 1 or 2 token seafood cards. A plan that is 80% vegetarian is NOT a pescatarian plan. Legumes are one valid option among several — not the default.",
      "Preferring vegetarian options is ALLOWED in addition to fish — but the plan must still contain fish and seafood in multiple visible meal slots.",
      dairyFreeNote,
      isDairyFree ? "STRICT dairy-free rule: do not use eggs, egg whites, egg yolks, omelette, frittata, shakshuka, eggah, mayonnaise, milk, cream, cheese, butter, yogurt, labneh, ghee, whey, casein, or any dairy." : "",
      heartNote
    ].filter(Boolean).join(" ");
  }

  return [
    "PESCATARIAN FISH INCLUSION NOTE: the user is pescatarian. Fish and seafood are primary proteins and must appear in multiple recipe cards, not just 1 card surrounded by vegetarian options.",
    dairyFreeNote,
    isDairyFree ? "STRICT dairy-free rule: do not use eggs, egg whites, egg yolks, omelette, frittata, shakshuka, eggah, mayonnaise, milk, cream, cheese, butter, yogurt, labneh, ghee, whey, casein, or any dairy." : "",
    heartNote
  ].filter(Boolean).join(" ");
}

function buildAllowedProteinRotationGuidance(
  diets: string[],
  conditions: string[],
  recipeCount: number
): string {
  const totalConstraints = diets.length + conditions.length;
  if (totalConstraints < 2) return "";

  const isPescatarian = diets.includes("pescatarian");
  const isVegetarian = diets.includes("vegetarian");
  const isVegan = diets.includes("vegan");
  const isDairyFree = diets.includes("dairyFree");

  const hasHeartConditions = conditions.includes("cholesterol") || conditions.includes("highBloodPressure");
  const hasDiabetes = conditions.includes("diabetes");
  const hasWeightCondition = conditions.includes("weightLoss") || conditions.includes("weightGain");

  const allowedProteins: string[] = [];

  if (isVegan) {
    allowedProteins.push(
      "legumes (lentils, chickpeas, black beans, fava beans) — vary the legume type and cooking form each time",
      "tofu or tempeh in stir-fries, curries, or baked forms",
      "nuts and seeds as a protein boost in salads or grain bowls"
    );
  } else if (isPescatarian) {
    allowedProteins.push(
      "fish (baked salmon, grilled tilapia, baked white fish, tuna salad, fish soup) — use fish as the primary protein in multiple meal slots",
      "seafood (shrimp stir-fry, calamari, prawn curry, shrimp rice) — vary the seafood type and method",
      "eggs (shakshuka, omelette, frittata, poached eggs) — great for breakfast and light meals"
    );
    if (!isDairyFree) {
      allowedProteins.push("dairy-based dishes (yogurt bowls, cheese frittata, labne plates) — use for breakfast or sides");
    }
    allowedProteins.push("legumes (lentil soup, mujadara, chickpea salad) — include in some meals but NOT dominant");
  } else if (isVegetarian) {
    allowedProteins.push("eggs (shakshuka, omelette, frittata, egg curry)");
    if (!isDairyFree) {
      allowedProteins.push("dairy (paneer curry, cheese pie, yogurt bowls, labne plates)");
    }
    allowedProteins.push(
      "legumes (lentil soup, mujadara, chickpea curry, bean stew)",
      "tofu in stir-fries or curries when cuisine fits"
    );
  } else {
    // Omnivore — only add rotation note when health conditions are active
    if (hasHeartConditions) {
      allowedProteins.push(
        "fish and seafood — STRONGLY RECOMMENDED for heart health",
        "poultry (chicken, turkey) — lean protein, heart-friendly",
        "lean beef or lamb — occasional, low-fat preparations",
        "eggs — compatible with heart health when not fried in excess fat",
        "legumes — high fiber, heart-healthy"
      );
    } else if (hasDiabetes || hasWeightCondition) {
      allowedProteins.push(
        "lean proteins: chicken, fish, eggs, legumes — rotate across all",
        "beef or lamb in lean cuts"
      );
    }
  }

  if (!allowedProteins.length) return "";
  const strictAllowedProteins = isDairyFree
    ? allowedProteins.filter((protein) => !/\begg|eggs|omelette|omelet|frittata|shakshuka|poached eggs/i.test(protein))
    : allowedProteins;
  if (!strictAllowedProteins.length) return "";

  const isMealPlan = recipeCount >= 14;
  const contextLabel = isMealPlan ? "the 7-day weekly meal plan" : `this ${recipeCount}-recipe set`;
  const rotationInstruction = isMealPlan
    ? "Across the 21 meal slots, each allowed protein source MUST appear in multiple meals. No single protein source should dominate more than 8 of the 21 slots. Distribute fish, seafood, eggs, and other allowed proteins visibly throughout the week."
    : `Across the ${recipeCount} recipes, rotate through as many of the allowed protein/food sources as possible. Do not generate multiple recipes using the same protein group when other allowed options exist.`;
  const strictRotationInstruction = isDairyFree
    ? rotationInstruction.replace("fish, seafood, eggs, and other", "fish, seafood, legumes, and other") + " Do not use eggs."
    : rotationInstruction;

  const heartNote = hasHeartConditions
    ? "Heart-health preparation rule: high blood pressure and high cholesterol restrict fat and sodium LIMITS — they do NOT ban fish, eggs, or any food category. Fish is medically recommended for both conditions. Choose baked, grilled, or steamed preparations; avoid heavy cream, excessive oil, or excess salt. A grilled fish fillet is safer and more heart-healthy than a high-fiber legume stew that exceeds sodium limits from seasoning."
    : "";

  const strictHeartNote = isDairyFree
    ? heartNote
        .replace("fish, eggs, or any food category", "fish or seafood")
        .replace("avoid heavy cream", "avoid eggs, heavy cream")
    : heartNote;

  const diabetesNote = hasDiabetes
    ? "Diabetes carb rule: the carb limit restricts starch portions and sugar — it does NOT limit protein variety. Include high-protein dishes across different protein sources and keep portions controlled."
    : "";

  const collapseWarning = `ANTI-COLLAPSE RULE: when multiple dietary preferences and health conditions are active simultaneously, the AI must NOT find the single food type that satisfies every constraint at once and repeat it throughout the output. This produces a plan that feels monotonous and ignores half of the user's allowed diet. Instead: identify ALL food groups that are compatible with the combined constraints, then ROTATE across every allowed group within ${contextLabel}.`;
  const friendlyHealthAdaptationNote = [
    hasHeartConditions
      ? "Broader heart-health adaptation: high blood pressure and high cholesterol limit fat and sodium, not normal food categories. Red meat, eggs, shawarma-style plates, BBQ-style plates, sliced sandwiches, soups, and stews can appear when made lean, low-sodium, baked/grilled/roasted/stewed, and not fried, creamy, cured, or processed. Keep dishes appetizing; do not replace everything with salads or generic healthy bowls."
      : "",
    hasDiabetes
      ? "Broader diabetes adaptation: control sugar and starch portions without banning all bread, rice, pasta, fruit, or comfort dishes. Use protein, fiber, legumes, whole grains when appropriate, and balanced portions."
      : "",
    hasWeightCondition
      ? "Weight-goal adaptation: use portions, protein, calorie density, and cooking method to fit the goal while keeping real dish identities and variety."
      : ""
  ].filter(Boolean).join(" ");

  return [
    collapseWarning,
    `Allowed protein and food sources for this combined preference profile (${[...diets, ...conditions].join(", ")}): ${strictAllowedProteins.join("; ")}.`,
    strictRotationInstruction,
    strictHeartNote,
    diabetesNote,
    friendlyHealthAdaptationNote
  ].filter(Boolean).join(" ");
}

function buildChickenDistinctCardGuidance(
  ingredients: RecipePromptIngredient[],
  recipeCount: number,
  preferredCuisine: string
) {
  const pantry = buildNormalizedPantrySet(ingredients);
  const source = ingredients.map((ingredient) => `${ingredient.name} ${ingredient.quantity ?? ""}`).join(" ").toLowerCase();
  const hasChicken =
    hasAny(pantry, ["chicken", "chicken breast", "chicken thigh", "whole chicken"]) ||
    /\b(chicken|chicken breast|chicken thigh|whole chicken)\b/i.test(source) ||
    /(?:\u062f\u062c\u0627\u062c|\u0641\u0631\u0627\u062e|\u0641\u0631\u0627\u062e\u0629|\u0641\u0631\u062e\u0629|\u0635\u062f\u0648\u0631?\s*\u062f\u062c\u0627\u062c|\u0635\u062f\u0648\u0631?\s*\u0641\u0631\u0627\u062e)/iu.test(source);

  if (!hasChicken) return "";

  const cuisineKey = normalizeCuisinePromptKey(preferredCuisine);
  const anyCuisine = cuisineKey === "any";
  const minimumDistinctForms = Math.min(recipeCount, recipeCount >= 8 ? 7 : 4);
  const cuisineScope = anyCuisine
    ? "Use Any cuisine freedom to spread chicken cards across American, Italian, Egyptian, Middle Eastern, Mexican, Indian, Thai, Chinese, Korean, Mediterranean, and global home-cooking forms when pantry and missing ingredients allow."
    : `Keep most chicken cards rooted in ${preferredCuisine}, but still vary the named chicken forms inside that cuisine and use directly related regional forms when needed.`;

  return [
    "Chicken distinct-card mode is active. Do not stop at grilled chicken, lemon chicken, garlic chicken, or plain chicken breast.",
    `Across this ${recipeCount}-card request, produce at least ${minimumDistinctForms} visibly different chicken dish forms when that many cards are requested.`,
    cuisineScope,
    recipeCount >= 8
      ? "For a 10-card chicken request, use at most ONE plain grilled, lemon herb, garlic butter, or simple pan-seared chicken card. The rest must use different visible forms, sauces, starches, or serving structures."
      : "For smaller chicken sets, include at most one plain grilled/lemon/garlic chicken card when other real forms fit.",
    "Chicken form universe: grilled chicken salad, grilled chicken fettuccine, chicken Alfredo fettuccine, chicken negresco pasta, chicken bechamel casserole, stuffed fried chicken cutlet, crispy fried chicken with sauce, sweet and sour chicken, honey garlic chicken, sweet chili chicken, BBQ chicken, chicken shawarma wrap, chicken shawarma plate, shish tawook, chicken fajitas, chicken tacos, chicken enchilada bake, chicken burrito bowl, chicken biryani, butter chicken, chicken curry, desi gravy chicken, kung pao chicken, sesame chicken, orange chicken, Korean fried chicken, soy garlic chicken, teriyaki chicken, creamy chicken soup, chicken noodle soup, chicken Florentine, creamy spinach chicken, chicken piccata, chicken cacciatore, roast chicken, chicken and rice skillet, chicken pot pie, chicken salad sandwich, farakh meshwi, chicken molokhia, chicken fattah, and chicken soup with vegetables.",
    "Chicken image identity rule: image_search_index and dish_intent.dish_name must encode the actual form, not only the protein. Good examples: grilled chicken salad, chicken Alfredo fettuccine, chicken negresco pasta, crispy sweet chili chicken, honey garlic chicken, BBQ chicken, chicken shawarma wrap, creamy chicken soup, chicken biryani, butter chicken, kung pao chicken, or chicken cacciatore.",
    "If the only pantry ingredient is chicken, list missing support items for real dish families instead of repeating plain grilled chicken with small seasoning changes."
  ].join(" ");
}

function buildSeafoodDistinctCardGuidance(
  ingredients: RecipePromptIngredient[],
  recipeCount: number,
  preferredCuisine: string
) {
  const pantry = buildNormalizedPantrySet(ingredients);
  const source = ingredients.map((ingredient) => ingredient.name).join(" ").toLowerCase();
  const hasShrimp =
    hasAny(pantry, ["shrimp", "prawn"]) ||
    /\b(shrimp|prawn|prawns)\b/i.test(source) ||
    /\u062c\u0645\u0628\u0631[\u0649\u064a]|\u0631\u0648\u0628\u064a\u0627\u0646|\u0642\u0631\u064a\u062f\u0633/u.test(source);
  const hasSeafood =
    hasAny(pantry, ["seafood"]) ||
    /\b(seafood|sea food|mixed seafood)\b/i.test(source) ||
    /\u0633\u064a\s*\u0641\u0648\u062f|\u0645\u0623\u0643\u0648\u0644\u0627\u062a\s*\u0628\u062d\u0631\u064a\u0629/u.test(source);
  const hasFish =
    hasAny(pantry, ["fish", "tilapia", "sea bass", "snapper", "cod"]) ||
    /\b(fish|tilapia|sea bass|snapper|cod|white fish)\b/i.test(source) ||
    /\u0633\u0645\u0643|\u0633\u0645\u0643\u0629|\u0628\u0644\u0637\u064a|\u0628\u0648\u0631\u064a|\u0642\u0627\u0631\u0648\u0635|\u062f\u0646\u064a\u0633/u.test(source);

  if (!hasShrimp && !hasSeafood && !hasFish) return "";

  const cuisineKey = normalizeCuisinePromptKey(preferredCuisine);
  const cuisineScope =
    cuisineKey === "any"
      ? "Use Any cuisine freedom to spread seafood cards across Egyptian, Mediterranean, Turkish, Chinese, Filipino, Cajun, Italian, Spanish, and global coastal forms when pantry and missing ingredients allow."
      : `Keep most seafood cards rooted in ${preferredCuisine}, but still vary the named seafood forms inside that cuisine and use directly related coastal/regional forms when needed.`;
  const minimumDistinctForms = Math.min(recipeCount, recipeCount >= 8 ? 8 : 4);
  const shrimpScope = hasShrimp
    ? "Shrimp card universe: choose from exact families such as Alexandrian shrimp, Egyptian shrimp tagine, shrimp rice with browned onion, seafood sayadeya, shrimp soup, shrimp chowder, shrimp noodle soup, fried shrimp, butterfly shrimp, coconut shrimp, sweet chili shrimp, honey garlic shrimp, Cajun honey shrimp, boom boom shrimp, drunken shrimp, shrimp with oyster sauce, Kung Pao shrimp, Asian garlic shrimp, Chinese salt and pepper shrimp, Chinese shrimp and broccoli, shrimp stir-fry bowl, shrimp rice bowl, shrimp burrito bowl, shrimp tacos, shrimp fajitas, shrimp pasta salad, shrimp spaghetti or linguine, garlic shrimp quinoa, shrimp and broccoli, Cajun shrimp, pan-seared shrimp, grilled shrimp kebabs, head-on spicy garlic shrimp, spicy grilled shrimp, Portuguese garlic shrimp, Mediterranean shrimp with feta, Turkish prawns with feta, Turkish prawn chickpea stew, Karides Guvec, Thai tom yum shrimp, Thai red curry shrimp, green curry shrimp, prawn curry, shrimp boil, Cajun seafood boil, shrimp po' boy, shrimp lettuce cups, shrimp cakes, or shrimp toast."
    : "";
  const shrimpVarietyRule = hasShrimp
    ? [
        "Shrimp anti-clustering rule: do not fill the set with garlic, cumin, coriander, lemon, or garlic-butter shrimp variants. These simple seasoning-only shrimp cards count as the same visual family.",
        recipeCount >= 8
          ? "For a 10-card shrimp request, use at most ONE simple garlic/lemon/cumin shrimp card. At least SIX cards must come from different visible shrimp forms such as fried or butterfly shrimp, sweet chili or honey garlic shrimp, shrimp soup or chowder, shrimp rice or noodle bowl, shrimp pasta, shrimp tacos or fajitas, curry shrimp, stir-fry shrimp, shrimp skewers, shrimp boil, shrimp cakes, or shrimp toast."
          : "For smaller shrimp sets, include at most one simple garlic/lemon/cumin shrimp card and prioritize different visible forms.",
        "Shrimp image identity rule: image_search_index and dish_intent.dish_name must encode the form, not just the seasoning. Good examples: butterfly shrimp, honey garlic shrimp, sweet chili shrimp bowl, shrimp soup, shrimp fried rice, shrimp linguine, shrimp tacos, shrimp red curry, Cajun shrimp boil, or Chinese shrimp and broccoli.",
        "If the only pantry ingredient is shrimp, list missing support items for these real dish families rather than repeating garlic/lemon/cumin shrimp with tiny wording changes."
      ].join(" ")
    : "";
  const seafoodScope = hasSeafood
    ? "Mixed seafood card universe: choose from exact families such as seafood bake, seafood pasta, seafood Creole, seafood Bicol Express, seafood salad, sauteed seafood medley, grilled seafood medley, Chinese ginger garlic seafood stir fry, steamed fish in oyster sauce, seafood paella, Cajun seafood boil, cioppino seafood stew, seafood chowder, creamy Italian seafood bake, spicy tomato seafood pasta, seafood sayadeya, or Mediterranean fish soup."
    : "";
  const fishScope = hasFish
    ? "Fish card universe: choose from exact families such as Egyptian singari fish, sayadeya fish, grilled Arabic fish, fish tagine with tomato sauce, rada-coated fish, smoked mullet, fried red mullet, whole roasted fish, baked lemon fish, pan-fried fish, fish Florentine, spicy fish fry, skillet garlic butter white fish, salt-grilled fish, herb-roasted fish, fish curry, fish nuggets, fish soup, or fish sandwich when pantry and cuisine fit."
    : "";

  return [
    "Seafood distinct-card mode is active. Do not stop after two shrimp ideas or five seafood ideas.",
    `Return exactly ${recipeCount} seafood-related recipes for this request and make at least ${minimumDistinctForms} of them visibly different named dish families when that many cards are requested.`,
    cuisineScope,
    shrimpScope,
    shrimpVarietyRule,
    seafoodScope,
    fishScope,
    "Every shrimp, seafood, or fish recipe must use a specific dish family in name, dish_intent.dish_name, image_search_index, and the first image_search_indices item. Do not use generic names such as shrimp recipe, seafood recipe, fish plate, seafood plate, or recipe with seafood.",
    "Image generation accuracy rule: choose Replicate-friendly identities already phrased as real food-photo searches, for example Alexandrian shrimp, Egyptian shrimp tagine, seafood paella, Cajun seafood boil, seafood chowder, garlic butter shrimp, Chinese shrimp and broccoli, baked lemon fish, or Egyptian singari fish.",
    "Avoid duplicate seafood cards unless the core seafood type, sauce, starch/base, or cooking form visibly changes. Garlic shrimp, lemon garlic shrimp, and garlic butter shrimp count as too similar unless one is grilled skewers, one is pasta, and one is a skillet with a clearly different sauce/base.",
    "For dish_intent.exclude_keywords, include wrong traps for each card such as chicken, beef, salad, dessert, plain rice, generic platter, sushi, or pasta when pasta is not the dish."
  ]
    .filter(Boolean)
    .join(" ");
}

function hasExplicitGroundOrMincedMeatInput(ingredients: RecipePromptIngredient[]) {
  const rawSource = ingredients.map((ingredient) => ingredient.name).join(" ").toLowerCase();
  const pantry = buildNormalizedPantrySet(ingredients);

  return (
    hasAny(pantry, ["ground meat", "ground beef", "minced meat", "beef mince", "lamb mince", "mince"]) ||
    /\b(ground|minced|mince|beef mince|ground beef|minced beef|minced meat|ground meat|lamb mince)\b/i.test(rawSource) ||
    isArabicGroundMeatPantryIngredient(rawSource)
  );
}

function hasPlainBeefOrMeatInput(ingredients: RecipePromptIngredient[]) {
  const pantry = buildNormalizedPantrySet(ingredients);
  const rawSource = ingredients.map((ingredient) => ingredient.name).join(" ").toLowerCase();

  return (
    hasAny(pantry, ["beef", "meat", "steak"]) ||
    /\b(beef|steak|veal|meat)\b/i.test(rawSource) ||
    /(?:\u0644\u062d\u0645|\u0644\u062d\u0645\u0629|\u0644\u062d\u0645\u0647)/iu.test(rawSource)
  );
}

function buildBeefFormPriorityGuidance(
  ingredients: RecipePromptIngredient[],
  recipeCount: number,
  preferredCuisine: string
) {
  if (!hasPlainBeefOrMeatInput(ingredients)) return "";

  const cuisineLabel = preferredCuisine && preferredCuisine !== "Any" ? preferredCuisine : "the selected cuisines";

  if (hasExplicitGroundOrMincedMeatInput(ingredients)) {
    return [
      "Ground/minced beef mode is explicit because the user wrote ground, minced, mince, or Arabic minced meat.",
      "In this mode, ground beef, minced fillings, kofta variants, meatballs, hawawshi, lahmacun, Adana, hamburger stew, ground beef pasta, lasagna, tacos, burritos, lettuce wraps, zucchini boats, cauliflower casseroles, and stuffed vegetables are valid when cuisine and pantry fit.",
      "Even in ground/minced mode, avoid duplicate cards: vary the shape and serving form across stuffed bread, meatballs, skewers, pasta, lasagna, stew, curry, tray bake, rice topping, tacos, burritos, lettuce cups, casseroles, and stuffed vegetables."
    ].join(" ");
  }

  return [
    "Plain-beef priority mode is active because the user provided beef/meat/steak, not ground or minced meat.",
    `For this ${recipeCount}-card set, choose intact beef forms first inside ${cuisineLabel}: thin stir-fry strips, chopped or sliced beef, steak bites, beef cubes in stew or soup, roast slices, braised or shredded beef, fried crispy beef strips, thin beef shawarma slices, kebab cubes, or broth pieces.`,
    "Do not convert plain beef into ground beef/minced meat by default. Avoid Korean ground beef bowl, loose crumbled beef bowls, hamburger stew, ground beef pasta, kofta, meatballs, burger patties, minced fillings, hawawshi, lahmacun, and Adana unless the user explicitly wrote ground/minced/mince/minced beef/ground beef/Arabic minced meat.",
    recipeCount >= 8
      ? "If a ground/minced fallback is absolutely necessary for variety, use at most one card, place it after all intact-beef options, and make its recipe name plus image_search_index explicitly say ground or minced."
      : "For a small set, use zero ground/minced beef cards unless explicitly requested.",
    "For plain-beef dish_intent.exclude_keywords, include ground beef, minced meat, loose crumbles, meatballs, burger, kofta, hawawshi, lahmacun, and Adana so image lookup does not drift into ground-meat photos."
  ].join(" ");
}

function buildShawarmaDishGuidance(
  ingredients: RecipePromptIngredient[],
  recipeCount: number,
  preferredCuisine: string
) {
  const pantry = buildNormalizedPantrySet(ingredients);
  const source = ingredients.map((ingredient) => `${ingredient.name} ${ingredient.quantity ?? ""}`).join(" ").toLowerCase();
  const cuisineKey = normalizeCuisinePromptKey(preferredCuisine);
  const cuisineSupportsShawarma =
    cuisineKey === "any" ||
    ["middleeastern", "mediterranean", "egyptian", "lebanese", "syrian", "arabic"].includes(cuisineKey) ||
    /\b(middle\s*eastern|levantine|arab|egyptian|lebanese|syrian|mediterranean)\b/i.test(preferredCuisine);
  const hasChicken =
    hasAny(pantry, ["chicken", "chicken breast", "chicken thigh", "whole chicken"]) ||
    /\b(chicken|chicken breast|chicken thigh)\b/i.test(source) ||
    /(?:\u062f\u062c\u0627\u062c|\u0641\u0631\u0627\u062e|\u0641\u0631\u0627\u062e\u0020\u0628\u0627\u0646\u064a\u0647)/iu.test(source);
  const hasPlainBeef =
    hasPlainBeefOrMeatInput(ingredients) &&
    !hasExplicitGroundOrMincedMeatInput(ingredients) &&
    !/(?:\u0636\u0627\u0646\u064a|\u0636\u0623\u0646\u064a|\u062e\u0631\u0648\u0641)/iu.test(source);
  const hasLamb =
    hasAny(pantry, ["lamb", "lamb shoulder", "lamb leg", "mutton"]) ||
    /\b(lamb|mutton)\b/i.test(source) ||
    /(?:\u0636\u0627\u0646\u064a|\u0636\u0623\u0646\u064a|\u062e\u0631\u0648\u0641|\u0644\u062d\u0645\s+\u0636\u0627\u0646\u064a)/iu.test(source);

  if (!cuisineSupportsShawarma || (!hasChicken && !hasPlainBeef && !hasLamb)) return "";

  const candidates: string[] = [];
  if (hasChicken) candidates.push("chicken shawarma wrap, chicken shawarma plate, chicken shawarma bowl");
  if (hasPlainBeef) candidates.push("beef shawarma wrap, beef shawarma plate, beef shawarma bowl");
  if (hasLamb) candidates.push("lamb shawarma wrap, lamb shawarma plate, lamb shawarma bowl");
  if (hasPlainBeef && hasLamb) candidates.push("beef and lamb shawarma wrap or mixed meat shawarma plate");

  return [
    `Shawarma family rule is active for this ${recipeCount}-card request when cuisine and pantry fit.`,
    `Valid shawarma candidates: ${candidates.join("; ")}.`,
    "Use shawarma as one distinct card family for sliced or shaved marinated roasted chicken, beef, or lamb. It should be visibly different from shish tawook, kofta, Adana, doner, kebab skewers, tacos, burritos, and generic wraps.",
    "Do not convert plain beef or lamb shawarma into ground/minced meat. If the user explicitly wrote ground or minced, do not use shawarma unless the card clearly uses sliced meat instead of the ground ingredient.",
    "For shawarma image_search_index and the first image_search_indices value, use exact English identities such as chicken shawarma wrap, chicken shawarma plate, beef shawarma wrap, beef shawarma bowl, lamb shawarma wrap, or lamb shawarma plate.",
    "For shawarma dish_intent.visual_keywords, include thin sliced shawarma meat, shaved roasted meat, pita or lavash wrap, open wrap end, garlic sauce, tahini sauce, pickles, tomato, onion, or parsley only when relevant. For exclude_keywords, include kebab skewers, kofta, ground meat, Adana, doner cone, burger, taco, burrito, whole chicken breast, steak cubes, and stew chunks."
  ].join(" ");
}

function buildStuffedDishGuidance(
  ingredients: RecipePromptIngredient[],
  recipeCount: number,
  preferredCuisine: string
) {
  const pantry = buildNormalizedPantrySet(ingredients);
  const source = ingredients.map((ingredient) => ingredient.name).join(" ").toLowerCase();
  const cuisineKey = normalizeCuisinePromptKey(preferredCuisine);
  const explicitStuffedSignal =
    /\b(stuffed|mahshi|dolma|dolmades|sarma)\b/i.test(source) ||
    /\u0645\u062d\u0634\u064a/u.test(source);
  const hasStuffableVegetable =
    hasAny(pantry, [
      "zucchini",
      "courgette",
      "eggplant",
      "aubergine",
      "bell pepper",
      "pepper",
      "cabbage",
      "grape leaves",
      "vine leaves",
      "tomato",
      "squash",
      "onion"
    ]) ||
    /\b(zucchini|courgette|eggplant|aubergine|pepper|cabbage|grape leaves|vine leaves|tomato|squash|onion|stuffed|mahshi|dolma|dolmades|sarma)\b/i.test(source) ||
    /محشي|كوسة|باذنجان|فلفل|كرنب|ملفوف|ورق\s*عنب|طماطم|بصل/u.test(source);
  const cuisineSupportsMahshi = ["egyptian", "middle eastern", "lebanese", "turkish", "mediterranean", "arabic", "any"].includes(cuisineKey);

  if (!cuisineSupportsMahshi && !hasStuffableVegetable && !explicitStuffedSignal) {
    return "";
  }

  if (!hasStuffableVegetable && !explicitStuffedSignal) return "";

  return [
    `Stuffed-dish catalog rule: when pantry or cuisine supports stuffed food in this ${recipeCount}-card request, treat it as a real dish family, not a generic side. Use named families such as Egyptian mahshi, mixed mahshi, kousa mahshi, stuffed zucchini, stuffed eggplant, sheikh el mahshi, stuffed bell peppers, stuffed cabbage rolls, grape leaves or warak enab, tomato mahshi, stuffed onions, Lebanese kousa mahshi, malfouf mahshi, sarma, dolma, stuffed chicken with rice, stuffed lamb shoulder, hashweh with cooked cucumbers, or deconstructed kousa only when the pantry and cuisine fit.`,
    "Vegetarian stuffed knowledge: mahshi, sarma, dolma, warak enab, malfouf, stuffed peppers, stuffed zucchini, and stuffed eggplant can be fully vegetarian or vegan with rice, herbs, tomato, vegetables, olive oil, and lemon; pickled stuffed eggplant and other pickled stuffed vegetables are vegetarian when no meat, dairy, or egg is listed. Do not add meat to mahshi, sarma, dolma, or pickled stuffed dishes unless meat is explicitly allowed and listed.",
    "Stuffed cards must be visually distinct: hollowed vegetables packed with rice/herb/vegetable or allowed meat filling, rolls in tomato sauce, grape-leaf bundles, cabbage rolls, stuffed peppers standing upright, eggplant boats, zucchini cylinders, mixed mahshi platter, or sliced stuffed poultry/meat. The rice, meat, vegetable, or herb filling must be inside the named stuffed item, not beside it. Do not show an unstuffed vegetable stew, a rice plate with vegetables on the side, or loose meat over rice for a stuffed dish.",
    "For stuffed dish image_search_index, use the exact named stuffed form such as kousa mahshi, stuffed cabbage rolls, warak enab, stuffed bell peppers, tomato mahshi, stuffed eggplant, sheikh el mahshi, or Egyptian mixed mahshi. Avoid generic search phrases like stuffed food, vegetable recipe, rice vegetables, tomato rice, meat rice, or healthy dinner.",
    "For stuffed dish_intent.visual_keywords, always include words like hollowed zucchini, stuffed pepper, cabbage roll, grape-leaf roll, open-topped tomato, split stuffed eggplant, visible filling inside, or cut-open stuffed piece. For stuffed dish_intent.exclude_keywords, include rice side, meat over rice, loose filling, unstuffed vegetables, stew, salad, and generic rice bowl.",
    "Only repeat mahshi/stuffed forms when the stuffed vegetable or filling genuinely changes, for example zucchini versus cabbage versus grape leaves, rice-only versus meat-rice filling, tomato sauce versus broth, or eggplant boats versus mixed platter."
  ].join(" ");
}

function buildDessertCatalogGuidance(
  ingredients: RecipePromptIngredient[],
  recipeCount: number,
  preferredCuisine: string
) {
  const source = ingredients.map((ingredient) => ingredient.name).join(" ").toLowerCase();
  const pantry = buildNormalizedPantrySet(ingredients);
  const cuisineKey = normalizeCuisinePromptKey(preferredCuisine);
  const dessertSignal =
    /\b(dessert|sweet|cake|cookie|chocolate|cocoa|cream|milk|yogurt|banana|strawberry|berry|berries|pudding|custard|pastry|phyllo|kataifi|semolina|sugar|honey|date|dates|oreo|caramel|ice cream)\b/i.test(source) ||
    hasAny(pantry, ["yogurt", "milk", "cream", "chocolate", "cocoa", "banana", "strawberry", "berries", "date", "dates", "honey", "sugar"]);

  if (!dessertSignal) return "";

  const cuisineLine =
    cuisineKey === "turkish"
      ? "For Turkish dessert mode, strongly consider sutlac, kunefe, kazandibi, tavuk gogsu, semolina helva, revani, ekmek kadayifi, gullac, baklava, tulumba, Turkish delight, kabak tatlisi, milk pudding, yogurt cake, and pistachio layered desserts when pantry and missing ingredients fit."
      : cuisineKey === "middle eastern" || cuisineKey === "egyptian" || cuisineKey === "arabic"
      ? "For Egyptian/Middle Eastern dessert mode, strongly consider basbousa, kunafa, rice pudding, mahalabia, qatayef, roz bel laban, date desserts, semolina cake, layered cream desserts, and yogurt or fruit parfaits when pantry and missing ingredients fit."
      : "For Any cuisine dessert mode, diversify across custards, puddings, no-bake cups, truffles, parfaits, berry shells, layered pistachio desserts, caramel bars, chocolate cake, lava cake, cobbler, churros, panna cotta, bread pudding, cream cheese desserts, fruit creams, and frozen desserts when pantry and missing ingredients fit.";

  return [
    `Dessert catalog rule: when the request or pantry points to dessert in this ${recipeCount}-card request, do not return repeated generic sweet bowls. Pick named dessert families with distinct visual structures.`,
    cuisineLine,
    "Dessert visual forms should differ clearly: ramekin custard, layered glass parfait, truffle balls, sheet-pan bars, cake slice, rolled pastry, syrup-soaked pastry, pudding cup, cream-filled shells, churros, cobbler scoop, panna cotta mold, baklava squares, kunefe skillet, or semolina pudding.",
    "For dessert image_search_index, use the exact dessert family such as creme brulee, Oreo truffles, strawberry parfait, pistachio pudding dessert, molten chocolate lava cake, churros, panna cotta, Turkish sutlac, kunefe, kazandibi, baklava, or basbousa. Avoid generic phrases like dessert recipe, sweet dish, cream dessert, or healthy dessert.",
    "Avoid duplicate dessert cards unless the base, texture, or serving format changes, such as custard versus cake versus truffle versus pastry versus frozen dessert."
  ].join(" ");
}

function buildHealthyPlateVarietyGuidance(
  ingredients: RecipePromptIngredient[],
  recipeCount: number,
  preferredCuisine: string,
  diets: string[] = [],
  conditions: string[] = []
) {
  const pantry = buildNormalizedPantrySet(ingredients);
  const source = ingredients.map((ingredient) => ingredient.name).join(" ").toLowerCase();
  const profile = [...diets, ...conditions].join(" ").toLowerCase();
  const healthMode =
    /\b(healthy|heart|diabetes|weight|low carb|high protein|low sodium|fitness|balanced|diet)\b/i.test(profile) ||
    /\b(healthy|fitness|balanced|diet|low carb|high protein|low sodium|weight loss|heart healthy|diabetic)\b/i.test(source);
  const hasProteinOrLegume =
    hasAny(pantry, ["chicken", "fish", "shrimp", "seafood", "beef", "meat", "egg", "lentil", "chickpeas", "beans"]) ||
    /\b(chicken|fish|shrimp|seafood|beef|egg|lentil|chickpea|beans)\b/i.test(source);

  if (!healthMode || !hasProteinOrLegume) return "";

  const cuisineLabel = preferredCuisine && preferredCuisine !== "Any" ? preferredCuisine : "the selected cuisines";

  return [
    `Healthy-plate variety rule: when nutrition preferences are active across this ${recipeCount}-card request, still choose real dish families from ${cuisineLabel}; do not output a row of generic healthy bowls.`,
    "Use different proteins and pantry combinations when available: chicken with vegetables or rice, intact beef strips with broccoli or peppers, fish with vegetables or lentils, shrimp with pasta/rice/salad, eggs with vegetables, legumes with grains, and mixed vegetable casseroles. Do not let one protein dominate all cards if the pantry has multiple meaningful ingredients.",
    "Healthy plates should have named visual structures such as chicken stir-fry, healthy chicken enchilada bake, Cobb-style chicken salad, apricot chicken bowl, one-pot chicken vegetables, beef and broccoli, intact-beef stir-fry, shrimp pasta salad, seafood grain bowl, chickpea avocado bowl, lentil soup, vegetable frittata, or high-protein dinner bowl when the cuisine and pantry fit.",
    "For healthy image_search_index values, avoid generic phrases like healthy recipe, healthy dinner, diet plate, or macro bowl. Use the exact dish family and visible protein, such as chicken vegetable skillet, beef and broccoli, shrimp pasta salad, chickpea avocado bowl, or lentil soup.",
    "If beef is present in healthy mode but not explicitly ground/minced, use intact beef strips/cubes/slices/steak bites; do not choose healthy ground beef bowls unless the input explicitly says ground/minced beef."
  ].join(" ");
}

function buildIngredientPrepFormGuidance(
  ingredients: RecipePromptIngredient[],
  recipeCount: number,
  preferredCuisine: string
) {
  const pantry = buildNormalizedPantrySet(ingredients);
  const source = ingredients.map((ingredient) => ingredient.name).join(" ").toLowerCase();
  const cuisineLabel = preferredCuisine && preferredCuisine !== "Any" ? preferredCuisine : "the chosen cuisine";
  const minimumForms = Math.min(recipeCount, recipeCount >= 8 ? 6 : Math.max(3, recipeCount));
  const guidance: string[] = [
    "Ingredient material-transformation rule: treat every provided pantry ingredient as a flexible cooking material, not a fixed object. It may be boiled, simmered into soup, stewed, grilled, roasted, baked in a tray, smoked, fried, pan-seared, mashed/smashed, minced, sliced, diced, cubed, shredded, pounded, butterflied, chopped, folded into a filling, blended into a sauce, or formed into patties/fritters when that is physically realistic for the ingredient and cuisine.",
    "A prep-form transformation is not a new pantry ingredient. Keep the ingredients array limited to the exact user-provided pantry ingredient name and language; describe the transformation in steps, dish_intent.visual_keywords, and image_search_indices.",
    `Across this generation, use prep-form variety as one of the main diversity levers. Aim for at least ${minimumForms} visibly different forms when enough cards are requested, while staying inside real ${cuisineLabel} dish families.`,
    "Do not repeat the same visible form with only a different seasoning. Different forms should look different on cards: soup, stew, whole piece, strips, cubes/chunks, minced patties, shredded filling, smashed mash, stuffed bread, skewers, baked tray, casserole, smoked plate, fried pieces, rice dish, sandwich, salad, sauce-coated skillet, or pasta/noodle integration.",
    "Ingredient integration rule: avoid isolated hero ingredient plus a plain side. Each card should integrate the pantry ingredient into a real dish structure with supporting components, sauce, starch, vegetables, aromatics, or serving form listed in missing_ingredients when not owned. The finished card should look like a complete recipe, not a protein dropped onto rice.",
    "Form matrix rule: for one main ingredient and many cards, intentionally distribute the final list across several cooking/serving families such as soup/broth, stew/tagine/curry, grilled/skewered, baked/roasted tray, fried/crispy, mashed/smashed, minced/patties/fritters, sliced/carpaccio-style or stir-fry strips, stuffed/filling, sandwich/wrap, rice/pasta/noodle integration, and salad/cold plate when the cuisine genuinely supports them."
  ];

  if (hasAny(pantry, ["chicken", "chicken breast", "chicken thigh", "whole chicken"]) || /دجاج|فراخ|فراخة|صدور?\s*دجاج|صدور?\s*فراخ/u.test(source)) {
    guidance.push(
      "Chicken prep ladder: chicken breast or chicken can become whole cutlets, thin escalopes, strips, cubes, shredded cooked chicken, minced/chopped chicken patties, skewers, stir-fry pieces, rice pieces, soup pieces, stuffed filling, fried cutlets, sauced crispy pieces, pasta topping, salad topping, shawarma slices, BBQ pieces, or casserole slices when the dish calls for it. Do not make every card a whole grilled chicken breast. Rotate forms such as grilled chicken salad, fettuccine chicken pasta, chicken negresco, fried chicken with sauce, stuffed fried chicken, shawarma, sweet and sour chicken, honey garlic chicken, sweet chili chicken, creamy chicken soup, BBQ chicken, curry, biryani, and roast chicken when pantry and cuisine fit."
    );
  }

  if (hasAny(pantry, ["fish", "tilapia", "sea bass", "snapper", "cod"]) || /سمك|سمكة|بلطي|بوري|قاروص|دنيس/u.test(source)) {
    guidance.push(
      "Fish prep ladder: fish can appear as whole fish, fillets, steaks, slices, chunks in tagine/curry/stew, flakes in rice, minced fish kofta or patties, fried pieces, baked tray portions, sandwich pieces, or soup pieces. Do not turn every fish card into the same lemon fillet."
    );
  }

  if (hasAny(pantry, ["shrimp", "prawn", "seafood"]) || /جمبري|جمبرى|روبيان|قريدس|سي\s*فود/u.test(source)) {
    guidance.push(
      "Shrimp and seafood prep ladder: shrimp can be whole peeled shrimp, shell-on grilled shrimp, skewers, chopped shrimp filling, shrimp rice, shrimp pasta, fried shrimp, soup pieces, tagine/stew pieces, or minced shrimp cakes when authentic. Avoid repeating generic garlic shrimp."
    );
  }

  if (
    hasAny(pantry, ["beef", "meat", "lamb", "steak", "chicken liver", "liver"]) ||
    /لحم|لحمة|لحم(?:ة|ه)?|كبدة|كبد/u.test(source)
  ) {
    guidance.push(
      hasExplicitGroundOrMincedMeatInput(ingredients)
        ? "Ground/minced meat prep ladder: because the user explicitly provided ground or minced meat, use cuisine-native ground-meat forms such as kofta variants, meatballs, stuffed fillings, patties, loose rice toppings, bread fillings, pasta sauces, lasagna layers, taco or burrito fillings, lettuce wraps, zucchini boats, cauliflower casseroles, curry meatballs, and stews when realistic."
        : "Plain meat prep ladder: beef/meat can become cubes, strips, thin slices, chopped pieces, steak bites, roast slices, shredded braised meat, stew pieces, soup pieces, rice toppings, kebab cubes, fried strips, or casserole layers when realistic. Do not mince plain beef/meat into ground beef, kofta, meatballs, hawawshi, lahmacun, Adana, burger patties, or loose crumbles unless the user explicitly provided ground/minced meat."
    );
  }

  if (hasAny(pantry, ["egg", "eggs"]) || /بيض|بيضة/u.test(source)) {
    guidance.push(
      "Egg prep ladder: eggs can be fried sunny-side, scrambled, beaten into omelette/eggah/frittata, poached in sauce, boiled and sliced, baked in a tray, folded into a sandwich, or used as a topping. Do not repeat plain fried eggs across cards."
    );
  }

  if (hasAny(pantry, ["fava bean", "broad bean", "ful", "beans", "lentils", "chickpeas"]) || /فول|عدس|حمص|فاصوليا/u.test(source)) {
    guidance.push(
      "Legume prep ladder: legumes can be mashed, stewed, made into patties/fritters, cooked with rice, used in soup, served as a breakfast bowl, folded into a sandwich, baked as a tray, or dressed as a salad when the cuisine supports it. For lentils specifically, rotate beyond mujadara into lentil kofta, lentil patties, lentil salad, lentil soup, dal, curry, koshary, lentil shepherd's pie, lentil stuffed vegetables, lentil loaf, and lentil bolognese when diet and cuisine fit."
    );
  }

  if (hasAny(pantry, ["eggplant", "aubergine"]) || /باذنجان|بتنجان/u.test(source)) {
    guidance.push(
      "Eggplant prep ladder: eggplant can be fried, roasted, grilled, mashed into baba ghanoush or mutabbal, pickled, layered into musakka or moussaka, baked with bechamel, cooked into curry or tagine, stuffed with rice or vegetables, folded into pasta alla norma, or served as sandwiches. Do not repeat plain grilled eggplant."
    );
  }

  if (hasAny(pantry, ["potato", "potatoes", "sweet potato"]) || /بطاطس|بطاطا/u.test(source)) {
    guidance.push(
      "Potato visual-form ladder: potatoes can become fries, smashed crispy potatoes, mashed potatoes, baked potato, Turkish kumpir/compir stuffed baked potato, wedges, hash browns, potato hash, potato salad, potato soup, potato gratin, scalloped potatoes, potato bechamel casserole, potato curry, potato stew, roasted tray potatoes, or stuffed potatoes when cuisine and pantry fit. Always put the exact potato form in name, dish_intent.dish_name, image_search_index, and image_search_indices; do not use generic potato recipe."
    );
  }

  guidance.push(
    "Vegetable and starch prep ladder: vegetables and starches can be sliced, diced, grated, mashed/smashed, roasted, grilled, smoked, stuffed, fried as fritters, baked into trays, simmered into stews or soups, blended into sauces, folded into omelettes, or used as fillings when authentic."
  );

  return guidance.join(" ");
}

function buildCuisineDepthExplorationGuidance(
  preferredCuisine: string,
  ingredients: RecipePromptIngredient[],
  recipeCount: number,
  outputName: string
) {
  const cuisineLabel = preferredCuisine && preferredCuisine !== "Any" ? preferredCuisine : "the best-fitting cuisines";
  const meaningfulIngredients = ingredients
    .map((ingredient) => normalizePantryIngredient(ingredient.name))
    .filter((ingredient) => ingredient && !isMinorPantryIngredientForPrompt(ingredient));
  const ingredientList = Array.from(new Set(meaningfulIngredients)).join(", ") || "the provided pantry ingredients";
  const candidateCount = Math.max(recipeCount * 3, recipeCount >= 8 ? 24 : 12);

  return [
    `Professional cuisine-depth rule: before writing JSON, internally brainstorm at least ${candidateCount} real candidate dish families for ${ingredientList} inside ${cuisineLabel}, then rank them by pantry fit, authenticity, diet fit, visual distinctness, and missing-ingredient count.`,
    "Do not stop after the first 2 or 3 obvious dishes. Search your cuisine knowledge by ingredient, region, meal type, cooking method, starch/base, sauce family, and prep form before choosing final cards.",
    `For the final ${outputName}, prefer deep same-cuisine variety before leaving the selected cuisine: regional substyles, breakfast/lunch/dinner traditions, street-food forms, home-style stews, rice dishes, baked trays, stuffed breads, soups, sandwiches, casseroles, grilled plates, fried plates, and salads.`,
    "Only borrow from nearby or global cuisines after the selected cuisine's plausible dish families for that ingredient have been exhausted, ruled out by diet/allergy constraints, or would require an unreasonable missing-ingredient list.",
    "When many candidates share the same main ingredient, choose cards that differ by named dish family and visible structure, not by wording. The result should feel like a professional chef's menu, not a repeated template."
  ].join(" ");
}

function isMinorPantryIngredientForPrompt(ingredient: string) {
  if (ingredient === "bell pepper") return false;

  return /\b(salt|pepper|black pepper|water|oil|olive oil|butter|garlic|lemon|lime|vinegar|herb|herbs|parsley|cilantro|coriander|dill|mint|basil|oregano|cumin|paprika|chili|chilli|spice|spices|seasoning)\b/i.test(
    ingredient
  );
}

function splitPantryByDietCompatibility(
  items: { name: string; quantity?: string }[],
  dietContext: { diets: string[]; allergens: string[] }
) {
  const allowed: { name: string; quantity?: string }[] = [];
  const ignored: { name: string; quantity?: string }[] = [];

  for (const item of items) {
    if (!item.name.trim()) continue;
    if (findIngredientDietViolation(item.name, dietContext)) {
      ignored.push(item);
    } else {
      allowed.push(item);
    }
  }

  return { allowed, ignored };
}

export function buildMealPlanPrompt({
  pantry,
  pantryItems = [],
  diets,
  conditions,
  allergens = [],
  recipeLanguage = "English",
  preferredCuisine = "Any",
  calorieTarget = 2000
}: MealPlanPromptOptions) {
  const dietContext = { diets: diets ?? [], allergens: allergens ?? [] };
  const rawPantryIngredients = pantryItems.length
    ? pantryItems.map((item) => ({ name: item.name, quantity: item.quantity }))
    : pantry.map((name) => ({ name }));
  const pantryDietSplit = splitPantryByDietCompatibility(rawPantryIngredients, dietContext);
  const safePantryIngredients = pantryDietSplit.allowed;
  const safePantry = safePantryIngredients.map((item) => item.name);
  const ignoredPantry = pantryDietSplit.ignored.map((item) => item.name);
  const pantryWithQuantities = safePantryIngredients
    .map((item) => [item.name, item.quantity].filter(Boolean).join(" - "))
    .filter(Boolean);
  const pantryIngredients = safePantryIngredients;
  const proteinFormRequirements = getRequestedProteinFormRequirements(safePantry);
  const proteinFormRequirementLine = proteinFormRequirements.length
    ? `Hard protein form requirements: ${JSON.stringify(proteinFormRequirements)} Every meal that uses one of these protein families must follow its instruction exactly.`
    : "";
  const cuisineSpecificGuidance = buildCuisineSpecificGuidance(preferredCuisine);
  const cuisineKnowledgeGuidance = buildCuisineKnowledgeGuidance(preferredCuisine);
  const cuisineDishCatalogGuidance = buildCuisineDishCatalogGuidance(preferredCuisine);
  const cuisineVisualReferenceGuidance = buildCuisineVisualReferenceGuidance(preferredCuisine);
  const languageOutputGuidance = buildLanguageOutputGuidance(recipeLanguage);
  const substyleGuidance = buildCuisineSubstyleGuidance(preferredCuisine, pantryIngredients);
  const mealTypeRoutingGuidance = buildMealTypeRoutingGuidance(preferredCuisine, pantryIngredients);
  const imageGuidance = buildCuisineImageGuidance(preferredCuisine);
  const ingredientDrivenCuisineGuidance = buildIngredientDrivenCuisineGuidance(preferredCuisine, pantryIngredients);
  const seafoodDistinctCardGuidance = buildSeafoodDistinctCardGuidance(pantryIngredients, 21, preferredCuisine);
  const vegetarianVarietyGuidance = buildVegetarianVarietyGuidance(diets, 21);
  const allowedProteinRotationGuidance = buildAllowedProteinRotationGuidance(diets, conditions, 21);
  const pescatarianFishGate = buildPescatarianFishGate(diets, conditions, 21);
  const beefFormPriorityGuidance = buildBeefFormPriorityGuidance(pantryIngredients, 21, preferredCuisine);
  const shawarmaDishGuidance = buildShawarmaDishGuidance(pantryIngredients, 21, preferredCuisine);
  const chickenDistinctCardGuidance = buildChickenDistinctCardGuidance(pantryIngredients, 21, preferredCuisine);
  const stuffedDishGuidance = buildStuffedDishGuidance(pantryIngredients, 21, preferredCuisine);
  const dessertCatalogGuidance = buildDessertCatalogGuidance(pantryIngredients, 21, preferredCuisine);
  const healthyPlateGuidance = buildHealthyPlateVarietyGuidance(
    pantryIngredients,
    21,
    preferredCuisine,
    diets,
    conditions
  );
  const ingredientPrepFormGuidance = buildIngredientPrepFormGuidance(pantryIngredients, 21, preferredCuisine);
  const cuisineDepthExplorationGuidance = buildCuisineDepthExplorationGuidance(
    preferredCuisine,
    pantryIngredients,
    21,
    "weekly meal slots"
  );
  const anyCuisineRotationGuidance =
    normalizeCuisinePromptKey(preferredCuisine) === "any"
      ? buildAnyCuisineRotationGuidance(21, "weekly meal slots")
      : "";
  const realRecipeGuardrails = buildRealRecipeGuardrails(preferredCuisine);
  const namedPlatePolicy = buildNamedPlateGenerationPolicy({
    allergens,
    conditions,
    diets,
    mode: "meal-plan",
    preferredCuisine
  });
  const deepMealPlanCuisineGuidance = buildDeepMealPlanCuisineGuidance(preferredCuisine);
  const preferenceBrief = buildPromptPreferenceBrief({
    preferredCuisine,
    calorieTarget,
    diets,
    conditions,
    allergens
  });
  const isArabicMode = recipeLanguage.toLowerCase() === "arabic";
  const hasPantryItems = safePantry.some((item) => item.trim());
  const pantryLine = isArabicMode
    ? `مكونات المستخدم المتوافقة مع النظام الغذائي للجدول الأسبوعي، اتركها كما كتبها المستخدم ولا تترجمها داخل هذا السطر: ${safePantry.join(", ") || "لا توجد مكونات متوافقة"}.`
    : `Diet-compatible pantry items for this user: ${safePantry.join(", ") || "none provided"}.`;
  const pantryQuantitiesLine = isArabicMode
    ? `كميات مكونات المستخدم المتاحة، اترك أسماء المكونات كما كتبها المستخدم: ${pantryWithQuantities.join(", ") || "غير متوفرة"}.`
    : `Pantry quantities (use these to decide what is actually needed for the week): ${pantryWithQuantities.join(", ") || "not provided"}.`;
  const ignoredPantryLine = ignoredPantry.length
    ? `Ignored pantry items for this plan because they conflict with the selected diet/allergen rules or may belong to someone else: ${ignoredPantry.join(", ")}. Do not use them in any meal, ingredient, image identity, or shopping-list reconciliation.`
    : "";
  const pantryPlanningMode = hasPantryItems
    ? "Diet-first pantry mode: the user has saved/scanned pantry or fridge items, but diet, allergens, medical conditions, and selected cuisine are higher authority than pantry. Use only the diet-compatible pantry items where they fit the selected cuisine and health profile. If the pantry contains chicken, meat, fish, eggs, dairy, or any other item forbidden by the selected diet, ignore it completely; it may belong to another person and must not steer this user's weekly plan."
    : "Empty-or-incompatible-pantry creative mode: the user has no saved pantry items compatible with the selected diet. Generate a complete, creative, cuisine-accurate weekly plan from scratch using the selected diets, health conditions, calorie target, and preferred cuisine as hard authority. Because usable pantry is absent, choose the best safe ingredients for the plan and put every needed item in shoppingList with quantities. Build a full shoppingList for the whole week. Do not minimize the shopping list by making repetitive cheap filler meals. Do not make generic placeholder meals. Vary proteins, vegetables, starches, sauces, cooking methods, meal families, colors, and textures across the week.";
  const arabicMealPlanPromptBlock = isArabicMode
    ? [
        "تعليمات مهمة لوضع اللغة العربية في جدول الوجبات:",
        "اترك أسماء مكونات المستخدم كما هي بالضبط في سطر مكونات المستخدم المتاحة ولا تترجمها داخل البرومبت.",
        "اكتب كل الحقول التي يقرأها المستخدم بالعربية فقط: اسم اليوم، أسماء الوجبات، المطبخ عند وجوده، المكونات، الخطوات، قائمة التسوق، وأي أسباب أو أوصاف غذائية.",
        "اترك حقول الصور والبحث باللغة الإنجليزية فقط لأنها تذهب إلى البحث وتوليد الصور: image_search_index و image_search_indices.",
        "لا تخلط الإنجليزية داخل الحقول العربية إلا إذا كانت الكلمة دارجة كتعريب شائع."
      ].join(" ")
    : "";

  const forbiddenMealPlanLine = buildPromptForbiddenMealPlanLine({
    diets: diets ?? [],
    allergens: allergens ?? []
  });

  return [
    "You are NutriMoment's premium weekly meal planning assistant.",
    arabicMealPlanPromptBlock,
    forbiddenMealPlanLine,
    pescatarianFishGate,
    "Return ONLY valid JSON. Do not include markdown, prose, comments, or code fences.",
    "Generate a 7-day meal plan.",
    "Priority order: first satisfy diet rules and health-condition nutrition targets, second stay near the daily calorie target, third maximize use of compatible pantry ingredients before adding groceries and minimize extra shopping.",
    "Pantry utilization rule: among equally safe and cuisine-correct meal choices, prefer the meal that uses more distinct pantry ingredients and requires fewer missing ingredients. Never invent pantry ownership; every ingredient not actually available belongs in shoppingList.",
    proteinFormRequirementLine,
    "Use clear, searchable meal names. Prefer canonical dish or meal-family names over creative titles.",
    "Cuisine must be structurally authentic. Do not assign a cuisine label unless the meal's core ingredients, cooking method, starch, sauce, and dish family genuinely fit that cuisine.",
    deepMealPlanCuisineGuidance,
    realRecipeGuardrails,
    namedPlatePolicy,
    preferredCuisine === "Any"
      ? "Because preferred cuisine is Any, choose the best-fitting authentic cuisine for each meal and vary the week intentionally."
      : `Closed cuisine rule: every breakfast, lunch, and dinner must belong to ${preferredCuisine} or a direct regional substyle inside ${preferredCuisine}. Do not output Egyptian, Mediterranean, American, Italian, Turkish, or any other off-cuisine meal when ${preferredCuisine} is selected; add missing ingredients instead of drifting off-cuisine.`,
    "Every breakfast, lunch, and dinner object must include a cuisine field. Use the precise cuisine or regional substyle for that specific meal, not only the user's broad preference. Examples: Egyptian, Alexandrian Egyptian, Turkish, Levantine, North Indian, Thai, Italian-American, Mediterranean.",
    "Deep cuisine rule for every meal slot: choose a real breakfast/lunch/dinner tradition from that cuisine, then make the ingredients, steps, aromatics, spice base, starch, sauce, garnish, and plating match that tradition. Do not make a generic protein bowl and label it Egyptian, Turkish, Italian, Indian, Asian, or Mediterranean.",
    "Breakfast should be cuisine-native, not a generic Western breakfast unless that cuisine or user preference supports it. Lunch and dinner should use distinct cuisine-native structures such as stew, rice plate, stuffed bread, grilled plate, baked casserole, curry, soup, pasta, pilaf, bean dish, or skillet only when that structure belongs to the meal's cuisine.",
    "Across the week, vary cuisine depth by substyle and dish family: do not repeat the same cuisine expression every day. For example, Egyptian can rotate between ful/shakshuka breakfast, koshary/rice-and-stew lunch, hawawshi/kofta/fish tagine dinner; Turkish can rotate menemen breakfast, lentil soup lunch, kofte/adana/pide dinner.",
    "Duplicate meal rule: do not repeat the same dish family across cards unless the core ingredients clearly change the plate. A repeated protein with only a different cooking method is not enough; use a different starch, sauce, vegetable base, or named dish family.",
    "Avoid filler adjectives like simple, hearty, lean, classic, spiced, or loaded unless they are essential.",
    "When a meal matches a known family, title it that way, for example: shakshuka, fasolia, ful medames, mujadara, koshary, kafta, white bean stew, bean salad, lentil soup, or chickpea salad.",
    "If the pantry points to a more specific regional branch or substyle inside the selected cuisine, choose that substyle explicitly and reflect it in the meal name, cuisine label, and image search phrases.",
    "Do ingredient-to-dish reasoning before planning the week. Infer which authentic dish families the pantry best supports, then build breakfast, lunch, and dinner around those families.",
    cuisineDepthExplorationGuidance,
    anyCuisineRotationGuidance,
    "Use breakfast, lunch, and dinner patterns that make sense for the selected cuisine rather than repeating the same generic bowl structure every day.",
    "Weekly variety hard rule: do not repeat the same named plate or visual structure across the same day unless the user's restrictions leave no safer alternative. Vary dish family, cooking form, starch/sauce structure, and meal context while keeping nutrition and cuisine accuracy.",
    cuisineSpecificGuidance,
    cuisineKnowledgeGuidance,
    cuisineDishCatalogGuidance,
    cuisineVisualReferenceGuidance,
    substyleGuidance,
    mealTypeRoutingGuidance,
    ingredientDrivenCuisineGuidance,
    healthyPlateGuidance,
    beefFormPriorityGuidance,
    shawarmaDishGuidance,
    chickenDistinctCardGuidance,
    seafoodDistinctCardGuidance,
    allowedProteinRotationGuidance,
    vegetarianVarietyGuidance,
    stuffedDishGuidance,
    dessertCatalogGuidance,
    ingredientPrepFormGuidance,
    "For every breakfast, lunch, and dinner object also output image_search_indices: an array of 3 to 5 short English visual identity phrases for matching a stored Replicate photo or building a precise Replicate prompt, ordered from most exact to broader identity aliases.",
    "Each image_search_indices item should be 2 to 6 words, use canonical dish nouns first, add cuisine, protein, sauce, cooking method, or starch only when it improves accuracy, and avoid quantities, health claims, macro words, filler adjectives, and branding.",
    "When the meal has an important visual or prep-form variant, encode it in the search phrases and visual keywords. Examples: chicken cubes rice bowl, chicken cutlet, minced fish cakes, whole grilled fish, white sauce pasta, tomato noodle stir fry.",
    imageGuidance,
    "Also include image_search_index as the first/best string from image_search_indices for backward compatibility.",
    "Examples of good image_search_indices values: [\"mujadara\",\"lentils and rice\",\"middle eastern lentils rice\"], [\"chicken shawarma wrap\",\"chicken shawarma\",\"shawarma plate\"], [\"beef shawarma wrap\",\"beef shawarma\",\"middle eastern shawarma\"], [\"baked white fish\",\"white fish vegetables\",\"roasted fish plate\"], [\"grilled chicken red sauce pasta\",\"chicken tomato pasta\",\"grilled chicken pasta\"].",
    "Every breakfast, lunch, and dinner object MUST also include a photo_identity object in English, even when the meal name itself is Arabic. Shape: {\"dish_slug\":\"kebab-case-canonical-dish-key\",\"english_name\":\"Canonical English Dish Name\",\"protein\":\"seafood|shrimp|chicken|beef|lamb|fish|liver|tofu|chickpeas|lentils|beans|egg|...\",\"starch\":\"rice|pasta|bread|potato|quinoa|tortilla|...\",\"sauce\":\"tomato|lemon-herb|garlic|cream|curry|bechamel|tahini|salsa|...\",\"method\":\"grilled|fried|roasted|skillet|soup|stew|baked|raw|salad|sandwich|wrap|...\",\"cuisine_key\":\"egyptian|mediterranean|italian|mexican|indian|thai|turkish|american|global|...\"}. dish_slug must be a unique, lowercase, hyphen-only, ASCII-only canonical dish key derived from the English dish family (e.g., \"lemon-herb-seafood-soup\", \"seafood-tomato-pasta\", \"green-curry-shrimp\", \"chicken-shawarma-wrap\"). english_name must be the canonical English name of the dish. dish_slug must be DIFFERENT for two meals that should not share a photo (e.g., \"seafood-tomato-pasta\" vs \"seafood-pasta\" vs \"lemon-herb-seafood-soup\"). All photo_identity values must use English lowercase ASCII tokens.",
    "Two different photo_identity slugs MUST exist for two meals that visually look different. Same photo_identity.dish_slug means the meals will share a photo — only use the same slug when the meals truly are the same dish.",
    "Do not use a pantry ingredient when it conflicts with the user's diet or health profile; choose a safer substitute and include the substitute in shoppingList.",
    "Selected diets are hard requirements for every meal and every shoppingList item. If a dish cannot be made compatible with all selected diets, choose a different named dish family instead.",
    "Pantry cannot override user preference: if a pantry item conflicts with vegetarian, vegan, pescatarian, dairy-free, allergy, medical, or cuisine rules, ignore that item and plan as if it is not available. The weekly plan is for the current user's settings, not for every food item in the household fridge.",
    "Never output a placeholder meal, flexible meal slot, TBD meal, or empty meal. If the pantry cannot support a safe real meal, create a real compatible meal using missing ingredients and list those missing ingredients in shoppingList.",
    "It is acceptable to go beyond the pantry for diet safety, allergens, cuisine authenticity, and a complete usable weekly plan.",
    pantryPlanningMode,
    pantryLine,
    pantryQuantitiesLine,
    ignoredPantryLine,
    preferenceBrief,
    `Preferred cuisine: ${preferredCuisine}.`,
    `Recipe language: ${recipeLanguage}.`,
    languageOutputGuidance,
    "Bilingual cache rule: the app stores full English and Arabic variants locally after generation. Output one stable canonical meal identity per slot in the requested language, not two bilingual copies.",
    `Daily calorie target: ${calorieTarget}; make breakfast about 25%, lunch about 35%, and dinner about 40% of the target, with the day total within about 10% unless the health profile requires tighter limits.`,
    `Calorie distribution authority: the user's explicit daily calorie target of ${calorieTarget} kcal controls per-meal calorie budgets via the 25/35/40 split above. If the nutrition targets derived from health conditions specify a per-meal maximum (e.g., maxCalories: 450), treat that as a guideline for choosing lower-calorie-density foods within the correct portion — NOT as a hard cap that overrides the calorie distribution. For example, at ${calorieTarget} kcal/day, dinner should be around ${Math.round(calorieTarget * 0.4)} kcal; use lighter preparations and controlled portions to hit this target rather than serving only salads or soups to stay under an arbitrary 450 kcal cap.`,
    "Every meal must be compatible with the diet and health-condition targets, not just one meal per day.",
    "Avoid medical claims; describe meals as compatible with the stated profile, not as treatment.",
    "Return an object with exactly these top-level keys: plan, shoppingList.",
    "plan must be an array of 7 days.",
    "Each breakfast, lunch, and dinner object must include cuisine, image_search_index, and image_search_indices for image generation.",
    "Each day must use this exact shape: {\"day\":\"Monday\",\"breakfast\":{\"name\":\"...\",\"cuisine\":\"...\",\"photo_identity\":{\"dish_slug\":\"...\",\"english_name\":\"...\"},\"ingredients\":[\"1 cup ...\"],\"steps\":[\"...\"],\"calories\":400,\"protein\":\"20g\",\"carbs\":\"45g\",\"fat\":\"12g\",\"cook_time\":\"25 minutes\",\"difficulty\":\"Easy\"},\"lunch\":{\"name\":\"...\",\"cuisine\":\"...\",\"photo_identity\":{\"dish_slug\":\"...\",\"english_name\":\"...\"},\"ingredients\":[\"1 cup ...\"],\"steps\":[\"...\"],\"calories\":550,\"protein\":\"30g\",\"carbs\":\"60g\",\"fat\":\"18g\",\"cook_time\":\"35 minutes\",\"difficulty\":\"Medium\"},\"dinner\":{\"name\":\"...\",\"cuisine\":\"...\",\"photo_identity\":{\"dish_slug\":\"...\",\"english_name\":\"...\"},\"ingredients\":[\"1 cup ...\"],\"steps\":[\"...\"],\"calories\":650,\"protein\":\"35g\",\"carbs\":\"55g\",\"fat\":\"22g\",\"cook_time\":\"45 minutes\",\"difficulty\":\"Medium\"}}.",
    "Each meal MUST include an ingredients array that lists every ingredient the meal uses, including pantry items the diner already owns. Every ingredient string must begin with a positive quantity and a recognizable unit, such as '1 cup chickpeas', '2 whole tomatoes', or '1 tbsp olive oil'; do not return bare ingredient names. In Arabic mode, write ingredients and units in Arabic and keep pantry ingredient names exactly as the user wrote them when they appear.",
    "Each meal MUST include cook_time as total whole minutes in the exact format '<number> minutes' and difficulty as Easy, Medium, or Hard.",
    "Each meal MUST also include a steps array with 7 to 10 detailed preparation instructions suitable for home cooking.",
    "Every meal step string must include the action, exact ingredient quantities used in that step, heat level or tool when relevant, timing in minutes, and the visual/texture cue for moving to the next step.",
    "Every meal's steps must include at least two cuisine-specific technique/flavor details, such as blooming cumin and coriander for Egyptian kofta, frying tomato-pepper base for shakshuka, simmering dal tadka with tempered spices, grilling adana-style ground meat, folding lahmacun toppings thinly, or finishing Mediterranean fish with lemon, herbs, and olive oil.",
    "Use pantry quantities when provided and choose realistic per-meal quantities for missing ingredients. Be specific enough that a beginner can cook without guessing.",
    "Do not use vague meal-plan steps like 'cook the chicken', 'prepare vegetables', 'mix together', or 'serve'. Break prep, cooking, finishing, and plating into separate explicit steps.",
    "Include image_search_index and image_search_indices in English inside every breakfast, lunch, and dinner object, for example: breakfast {\"name\":\"Greek Yogurt Bowl\",\"image_search_index\":\"greek yogurt berries\",\"image_search_indices\":[\"greek yogurt berries\",\"yogurt bowl\",\"breakfast yogurt bowl\"],...}.",
    "shoppingList must be an array of strings with only missing grocery items needed after pantry ingredients are used. Build shoppingList from canonical English grocery names first, merge duplicates by that canonical English ingredient, then render the final item label in the selected recipe language.",
    "Shopping-list language rule: shoppingList is for buying groceries, not cooking prep. Collapse prep forms into the buyable ingredient name. Use onion, not chopped onion; tomato, not diced tomato; parsley, not chopped parsley for garnish; herbs, not dried Mediterranean herbs unless the user truly must buy a dried herb mix. For staples use measurable grocery units, not arbitrary item counts: rice/pasta/oats/lentils/quinoa use cup or package/bag, coconut milk uses can, garlic uses clove, herbs use bunch.",
    "Shopping-list quantity rule: sum the whole-week amount per grocery ingredient. If onion appears chopped in five recipes, output one line such as \"onion - 6 whole\" or Arabic equivalent, not five recipe-prep lines.",
    "Shopping-list translation rule: every user-facing shoppingList item must be in the selected recipe language. Do not output English units like item, bunch, cup, or transliterated words inside Arabic shoppingList. Translate by meaning from the canonical English grocery name, not letter-by-letter transliteration: coconut milk -> حليب جوز الهند, oat milk -> حليب الشوفان, almond milk -> حليب اللوز, nori -> طحالب نوري, edamame -> فول صويا أخضر, sushi rice -> أرز سوشي.",
    "Every shoppingList item must include summed quantity and unit. In English mode use examples like \"rice - 4 cup\" or \"tomato - 8 whole\"; in Arabic mode use Arabic item names and Arabic-readable quantities."
  ].join(" ");
}

export function buildMealPlanRepairPrompt({
  allergens = [],
  calorieTarget = 2000,
  conditions,
  diets,
  issues,
  mealPlan,
  pantry,
  pantryItems = [],
  preferredCuisine = "Any",
  recipeLanguage = "English"
}: MealPlanPromptOptions & {
  issues: unknown[];
  mealPlan: MealPlanData;
}) {
  const basePrompt = buildMealPlanPrompt({
    allergens,
    calorieTarget,
    conditions,
    diets,
    pantry,
    pantryItems,
    preferredCuisine,
    recipeLanguage
  });

  return [
    basePrompt,
    "",
    "Backend repair pass: the previous meal plan failed validation after strict diet, cuisine, repetition, and variety checks.",
    "Return a complete replacement 7-day meal plan, not only the broken slots.",
    "You may reuse safe, unique meals from the previous plan, but replace every meal related to the validation issues.",
    "Do not include any forbidden ingredient even in meal names, ingredients, steps, image_search_index, or image_search_indices.",
    "Avoid repeated dish families and avoid fallback-style generic bowls unless that is the authentic dish family.",
    "Validation issues to fix:",
    JSON.stringify(issues, null, 2),
    "Previous plan to repair:",
    JSON.stringify(mealPlan, null, 2),
    "Return ONLY valid JSON with exactly the same schema requested above."
  ].join(" ");
}

export function buildPromptOnlyRecipeGenerationPrompt(prompt: string, recipeLanguage = "English", requestedRecipeCount = 10) {
  const languageOutputGuidance = buildLanguageOutputGuidance(recipeLanguage);
  const realRecipeGuardrails = buildRealRecipeGuardrails("Any");
  const namedPlatePolicy = buildNamedPlateGenerationPolicy({
    conditions: [],
    diets: [],
    mode: "prompt-only",
    preferredCuisine: "Any"
  });
  const recipeCount = Math.min(10, Math.max(1, requestedRecipeCount || 5));

  return [
    "You are NutriMoment's recipe generation assistant.",
    "Follow the user's recipe request, but always obey the output language and JSON rules below even if the request itself is written in another language.",
    "Return ONLY valid JSON. Do not include markdown, prose, comments, or code fences.",
    "Prompt-only sourcing rule: because no backend local recipe reference was provided in this path, set recipe_source_type to generated unless the backend request explicitly supplies an external trusted culinary source URL. Never invent a source_url.",
    `Generate exactly ${recipeCount} practical recipes.`,
    realRecipeGuardrails,
    namedPlatePolicy,
    "Even for free-form prompts, use actual established recipes or widely recognized dish families. If the request is vague, choose real dish families instead of inventing generic bowls, skillets, wraps, or fake house specials.",
    "Recipe title hard rule: the name must describe a finished dish, not a single ingredient. Never use names such as Chicken, Beef, Fish, Rice, Egg, Tomato, Potato, Ground Beef, or Shrimp by themselves.",
    "Variety hard rule: do not return repeated versions of the same recipe under different titles or photos. Each recipe must be a distinct named dish family or distinct serving structure.",
    `Recipe language: ${recipeLanguage}.`,
    languageOutputGuidance,
    "Bilingual cache rule: every recipe object must include top-level fields in the requested recipe language and also include localized.English and localized.Arabic variants with those exact capitalized keys. The helper translator should only be used as a fallback when one localized side is incomplete.",
    "Keep image_search_index and image_search_indices in English only.",
    "Every recipe MUST include plated_visual_description: a professional food-photography description of ONLY the finished plated dish. Do not describe preparation, raw ingredients, loose grocery items, hands, packages, labels, or cooking process.",
    "Before returning JSON, verify cooking temperatures, cooking times, ingredient quantities, food safety, realistic workflow order, allergen/exclusion safety, calories, macro plausibility, and that every ingredient is used in the steps.",
    "Return a JSON array, not an object.",
    "Each recipe object must include: name, cuisine, recipe_source_type, source_url when applicable, plated_visual_description, image_search_index, image_search_indices, ingredients, missing_ingredients, steps, calories, protein, carbs, fat, fiber, sugar, sodium, cook_time, difficulty, preference_hits, localized.",
    "ingredients and missing_ingredients must be arrays of strings in the requested recipe language. Every ingredient string must start with a realistic quantity and unit, followed by the ingredient name, for example: \"2 breasts chicken breast\", \"1 cup tomato sauce\", or \"1 tbsp olive oil\". Never return bare ingredient strings such as \"Chicken Breast\" or \"Tomato\". steps must be an array of 7 to 10 detailed strings with timing and quantities. preference_hits must be an array of strings in the requested recipe language. plated_visual_description must be English-only finished-dish visual metadata. localized must contain exactly the case-sensitive keys English and Arabic, and each localized variant must include the same user-facing recipe fields.",
    `User request: ${prompt}`
  ].join(" ");
}

function buildDeepMealPlanCuisineGuidance(preferredCuisine: string) {
  const normalized = normalizeCuisinePromptKey(preferredCuisine);
  const knowledge = CUISINE_KNOWLEDGE[normalized];
  const isAnyCuisine = normalized === "any";
  const selectedCuisine =
    preferredCuisine && preferredCuisine !== "Any"
      ? preferredCuisine
      : "the best-fitting cuisine for each meal slot";

  const base = [
    `Deep cuisine planning mode: treat each breakfast, lunch, and dinner as a real meal from ${selectedCuisine}, not as a macro template.`,
    "For each meal, decide the cuisine/substyle first, then choose a canonical dish family and make the pantry fit that dish. The cuisine field must describe that exact choice.",
    "A meal is only cuisine-deep if its dish name, ingredients, cooking method, aromatics, spice/herb profile, sauce or starch, steps, image_search_index, and plating all point to the same cuisine.",
    "Avoid shallow labels such as Mediterranean bowl, Asian bowl, Middle Eastern plate, Egyptian chicken, Turkish eggs, or Indian fish unless the structure is tied to a real dish family.",
    "For fish and seafood meals, prefer specific visual families when they fit: Alexandrian shrimp, seafood sayadeya, Egyptian shrimp tagine, grilled shrimp kebabs, Mediterranean garlic shrimp, Mediterranean shrimp with feta, Turkish prawns with feta, Karides Guvec, Kung Pao shrimp, salt and pepper shrimp, Chinese shrimp and broccoli, ginger garlic seafood stir fry, Spanish seafood paella, Cajun seafood boil, cioppino, seafood chowder, Egyptian sayadeya, samak singari, grilled Egyptian fish, samak bel radah, smoked fish, fried tilapia, Egyptian baked fish tray, Egyptian fish tagine, Mediterranean fish soup, Thai Pla Pad Cha, Thai chilli lime fish, fish Florentine, crispy pan fried fish, Mediterranean baked fish, Arabic grilled fish, Barboon Maklee, Egyptian fried fish sandwich, lemon herb Parmesan crusted fish, or garlic butter cod.",
    "For fish and seafood meals, image_search_index and the first image_search_indices item must repeat that exact visual family, not a broad phrase like fish recipe, shrimp dinner, seafood plate, or healthy seafood.",
    isAnyCuisine
      ? "For Any cuisine, each day should normally include at least two distinct cuisine traditions when the pantry allows it, but breakfast/lunch/dinner must still each be internally coherent."
      : ""
  ];

  if (!knowledge) {
    return base.join(" ");
  }

  return [
    ...base,
    knowledge.substyles?.length
      ? `Use these regional/substyle lanes when they fit: ${knowledge.substyles.join("; ")}.`
      : "",
    knowledge.breakfastPatterns?.length
      ? `Breakfast depth: prefer real breakfast families such as ${knowledge.breakfastPatterns.join("; ")} instead of generic eggs, yogurt, toast, or bowls.`
      : "",
    knowledge.lunchDinnerPatterns?.length
      ? `Lunch/dinner depth: prefer real lunch and dinner families such as ${knowledge.lunchDinnerPatterns.join("; ")} instead of generic plates.`
      : "",
    knowledge.stapleAromatics?.length
      ? `Technique/flavor depth: steps should use cuisine anchors such as ${knowledge.stapleAromatics.join(", ")}.`
      : "",
    knowledge.stapleSauces?.length
      ? `Sauce/base depth: when appropriate, use cuisine bases such as ${knowledge.stapleSauces.join(", ")}.`
      : "",
    knowledge.guardrails?.length
      ? `Cuisine-depth guardrails: ${knowledge.guardrails.join(" ")}`
      : ""
  ].filter(Boolean).join(" ");
}

function buildPromptPreferenceBrief(snapshot: {
  preferredCuisine: string;
  calorieTarget: number;
  diets: string[];
  conditions: string[];
  allergens: string[];
}) {
  const resolved = buildPreferenceProfile(snapshot);
  const dietLabels = resolved.promptDietLabels.length ? resolved.promptDietLabels.join(", ") : "none";
  const conditionLabels = resolved.promptConditionLabels.length ? resolved.promptConditionLabels.join(", ") : "none";
  const selectedDiets = snapshot.diets.length ? snapshot.diets.join(", ") : "none";
  const selectedConditions = snapshot.conditions.length ? snapshot.conditions.join(", ") : "none";
  const requiredDietTags = resolved.requiredDietTags.length ? resolved.requiredDietTags.join(", ") : "none";
  const preferredDietTags = resolved.preferredDietTags.length ? resolved.preferredDietTags.join(", ") : "none";
  const allergens = resolved.allergens?.length ? resolved.allergens.join(", ") : "none";
  const nutritionTargets = formatNutritionGoals(resolved.nutritionGoals);

  const pescatarianTagNote = snapshot.diets.includes("pescatarian")
    ? snapshot.diets.includes("dairyFree")
      ? "Note on preferredDietTags: the 'vegetarian' tag in the preferred list indicates that vegetarian options are compatible with the pescatarian diet — it does NOT mean fish and seafood should be deprioritized or that the output should be mostly vegetarian. For this dairy-free pescatarian profile, fish and seafood are the primary proteins; eggs and dairy are forbidden."
      : "Note on preferredDietTags: the 'vegetarian' tag in the preferred list indicates that vegetarian options are compatible with the pescatarian diet — it does NOT mean fish and seafood should be deprioritized or that the output should be mostly vegetarian. Fish, seafood, eggs, and dairy are the primary protein sources for a pescatarian and must appear prominently."
    : "";

  return [
    `Selected diet setting IDs: ${selectedDiets}.`,
    `Selected health condition setting IDs: ${selectedConditions}.`,
    `Dietary preferences: ${dietLabels}.`,
    `Health conditions to respect: ${conditionLabels}.`,
    `Required diet compatibility: ${requiredDietTags}.`,
    `Preferred diet compatibility: ${preferredDietTags}.`,
    pescatarianTagNote,
    `Known allergens to avoid: ${allergens}.`,
    `Nutrition targets derived from the profile: ${nutritionTargets}.`
  ].filter(Boolean).join(" ");
}

function buildNamedPlateGenerationPolicy({
  allergens = [],
  conditions,
  diets,
  mode,
  preferredCuisine
}: {
  allergens?: string[];
  conditions: string[];
  diets: string[];
  mode: "recipe" | "meal-plan" | "prompt-only";
  preferredCuisine: string;
}) {
  const selectedConstraintCount = diets.length + conditions.length + allergens.length;
  const isHighlyConstrained = selectedConstraintCount >= 2 || conditions.length >= 1;
  const cuisineScope =
    preferredCuisine && preferredCuisine !== "Any"
      ? `${preferredCuisine} and its direct regional dish families`
      : "the best-fitting cuisines from the pantry";
  const itemLabel = mode === "meal-plan" ? "meal" : "recipe";
  const collectionLabel = mode === "meal-plan" ? "weekly meal plan" : "recipe list";

  return [
    `Named-plate policy for this ${collectionLabel}: by default, generate real named plates from ${cuisineScope}, not generic ingredient combinations.`,
    preferredCuisine && preferredCuisine !== "Any"
      ? `Selected-cuisine closed-world rule: ${preferredCuisine} is the recipe universe. Use traditional ${preferredCuisine} plates, direct regional relatives, or safe traditional adaptations. Do not borrow famous dishes from other cuisines just because they fit the ingredients.`
      : "Open-cuisine rule: because the user selected Any, you may choose the best-fitting named dishes across cuisines and should use that freedom for variety.",
    "Before inventing or genericizing a title, map the main pantry ingredients to the selected cuisine's known dish reference set. If a famous dish family naturally centers the ingredient, use that canonical plate name and put missing support items in missing_ingredients.",
    `Every ${itemLabel} name should be a recognizable dish identity or a clear established dish-family variant that a food photo model can visualize.`,
    "Go deeper than broad cuisine labels: choose specific plates such as hawawshi, kofta, koshary, ful medames, macarona bechamel, menemen, adana kebab, chana masala, dal tadka, arroz con pollo, pad krapow, tom yum, frittata, shrimp linguine, mujadara, shawarma plate, or the closest real dish family for the selected cuisine.",
    "For each named plate, make image_search_index, image_search_indices, and dish_intent.dish_name point to that same canonical visual identity. Do not let photo phrases collapse to generic food, dinner assembled, beef plate, chicken plate, or cuisine food.",
    "If a real dish needs support ingredients to be recognizable, keep the named dish and list those support ingredients in missing_ingredients instead of renaming it into a generic bowl or skillet.",
    "Missing-ingredient boundary: missing_ingredients may add aromatics, spices, herbs, rice, bread, sauces, vegetables, or garnish, but must not replace the scanned main protein. If the pantry contains chicken, keep chicken-centered recipes; do not output ground meat, beef, lamb, fish, shrimp, egg, or dairy-centered dishes unless that main protein was also scanned or typed.",
    isHighlyConstrained
      ? "Highly constrained nutrition mode is active because the user selected diets, allergens, or medical conditions. In this mode, safety and nutrition rules outrank strict authenticity: adapt the named dish, simplify it, or choose a safer neighboring named dish family when needed."
      : "Normal named-plate mode is active. Authentic dish identity should outrank generic macro-friendly substitutions when the pantry allows it.",
    isHighlyConstrained
      ? "Even in highly constrained mode, do not invent fake dish names. Use names like diabetes-friendly shakshuka only if it remains visually and structurally shakshuka; otherwise choose a real safer dish family and explain the adaptation in preference_hits."
      : "Do not add health words to the recipe title unless the user explicitly asked for that diet style; keep health compatibility in preference_hits instead."
  ].join(" ");
}

function buildCuisineSpecificGuidance(preferredCuisine: string) {
  const normalized = normalizeCuisinePromptKey(preferredCuisine);
  const guidance = CUISINE_PROMPT_GUIDANCE[normalized] ?? [];

  if (!guidance.length) {
    return preferredCuisine && preferredCuisine !== "Any"
      ? `Preferred cuisine guidance: use real, recognizable ${preferredCuisine} dish families, staple ingredients, and cooking methods rather than generic recipes with a cuisine label.`
      : CUISINE_PROMPT_GUIDANCE.any.join(" ");
  }

  return guidance.join(" ");
}

function buildCuisineKnowledgeGuidance(preferredCuisine: string) {
  const normalized = normalizeCuisinePromptKey(preferredCuisine);
  const knowledge = CUISINE_KNOWLEDGE[normalized];

  if (!knowledge) {
    return preferredCuisine && preferredCuisine !== "Any"
      ? `Cuisine knowledge: use authentic staples, meal patterns, substitutions, and dish-family guardrails for ${preferredCuisine}.`
      : "";
  }

  const sections = [
    knowledge.stapleProteins?.length
      ? `Typical proteins for this cuisine: ${knowledge.stapleProteins.join(", ")}.`
      : "",
    knowledge.stapleStarches?.length
      ? `Typical starches for this cuisine: ${knowledge.stapleStarches.join(", ")}.`
      : "",
    knowledge.stapleAromatics?.length
      ? `Typical aromatics and flavor anchors: ${knowledge.stapleAromatics.join(", ")}.`
      : "",
    knowledge.stapleSauces?.length
      ? `Typical sauces or bases: ${knowledge.stapleSauces.join(", ")}.`
      : "",
    knowledge.breakfastPatterns?.length
      ? `Typical breakfast families: ${knowledge.breakfastPatterns.join("; ")}.`
      : "",
    knowledge.lunchDinnerPatterns?.length
      ? `Typical lunch and dinner families: ${knowledge.lunchDinnerPatterns.join("; ")}.`
      : "",
    knowledge.dishTriggers?.length
      ? `Dish-family triggers to use when ingredients fit: ${knowledge.dishTriggers.join("; ")}.`
      : "",
    knowledge.substitutionRules?.length
      ? `Cuisine-aware substitution rules: ${knowledge.substitutionRules.join(" ")}`
      : "",
    knowledge.guardrails?.length
      ? `Mislabeling guardrails: ${knowledge.guardrails.join(" ")}`
      : ""
  ].filter(Boolean);

  return sections.join(" ");
}

function buildLanguageOutputGuidance(recipeLanguage: string) {
  if (recipeLanguage.toLowerCase() !== "arabic") {
    return [
      "Exact language contract: write all top-level user-facing recipe text in the requested recipe language.",
      "User-facing fields are name, cuisine, ingredients, missing_ingredients, steps, cook_time, difficulty, preference_hits, shoppingList, day_labels, and scan_match_explanation.",
      "Internal image fields must stay in English only: image_search_index, image_search_indices, dish_intent.dish_name, dish_intent.cuisine, dish_intent.meal_type, dish_intent.diet_type, dish_intent.cooking_method, dish_intent.visual_keywords, and dish_intent.exclude_keywords.",
      "localized must contain exactly two case-sensitive keys: English and Arabic. Do not output localized.english or localized.arabic.",
      "localized.English must contain English user-facing recipe text. localized.Arabic must contain Arabic user-facing recipe text."
    ].join(" ");
  }

  return [
    "Exact language contract for Arabic mode: write every top-level user-facing recipe field in Arabic only.",
    "Arabic-only user-facing fields are name, cuisine, ingredients, missing_ingredients, steps, cook_time, difficulty, preference_hits, shoppingList, day_labels, and scan_match_explanation.",
    "Translate and localize for Egyptian Arabic culinary usage, not literal word-by-word translation.",
    "Use natural Egyptian household cooking terms. Prefer Egyptian cooking vocabulary over Modern Standard Arabic, Gulf Arabic, or transliterated English.",
    "Never transliterate English food names unless there is no common Arabic culinary equivalent.",
    "Localize dish titles by meaning and cooking form. Example: Creamy Tuscan Chicken must become دجاج توسكاني بصوص كريمي or دجاج بالصوص الكريمي على الطريقة التوسكانية, never تشيكن توسكان كريمي.",
    "Localize ingredients by common kitchen name. Example: Heavy Cream or cooking cream must become كريمة طبخ, never هيفي كريم.",
    "Do not put English words in those Arabic user-facing fields unless the word is a common Arabic culinary term already used in Egyptian households.",
    "Internal image fields must stay in English only because they feed photo search and image generation: image_search_index, image_search_indices, dish_intent.dish_name, dish_intent.cuisine, dish_intent.meal_type, dish_intent.diet_type, dish_intent.cooking_method, dish_intent.visual_keywords, and dish_intent.exclude_keywords.",
    "localized must contain exactly two case-sensitive keys: English and Arabic. Do not output localized.english or localized.arabic.",
    "localized.Arabic must mirror the top-level Arabic user-facing fields. localized.English must contain the same user-facing fields translated into English.",
    "Use natural Arabic cooking language throughout the Arabic fields."
  ].join(" ");
}

function buildCuisineDishCatalogGuidance(preferredCuisine: string) {
  if (!preferredCuisine || preferredCuisine === "Any") return "";

  const referenceDishes = getCuisineDishReferenceText(preferredCuisine, 50);
  if (!referenceDishes) return "";

  return [
    `Famous ${preferredCuisine} dish reference set for authenticity and recall: ${referenceDishes}.`,
    "Use this reference set as the target dish universe when naming recipes.",
    "For a normal 10-card recipe request or a weekly meal plan, at least half of the selected-cuisine cards should be recognizable named dishes from this reference set or direct variants of them when diet/allergy constraints allow it.",
    "For each primary pantry ingredient, first scan this reference set for dish names or families that naturally contain, feature, or traditionally center that ingredient before falling back to a generic preparation.",
    "When the pantry is sparse, choose the closest authentic dish family from this cuisine reference set instead of inventing a generic bowl, skillet, wrap, or salad.",
    "Generic titles are only acceptable when no recognizable dish family from the selected cuisine fits the ingredient set.",
    "If the pantry only supports part of a classic dish, keep the authentic dish family and move the missing support items into missing_ingredients.",
    "When the user is vegan or dairy-free, use compatible dishes and direct compatible variants from the same cuisine reference set before jumping to global tofu bowls, sushi, or generic salads. For Mediterranean vegan planning, prefer briam, fasolakia, revithada, spanakorizo, fava Santorini, gigantes plaki, gemista, dolma, imam bayildi, caponata, pasta alla norma without cheese, lentil moussaka without dairy, white bean tomato stew, chickpea tagine, hummus plates, baba ghanoush, roasted cauliflower tahini, and vegetable couscous."
  ].join(" ");
}

function buildCuisineVisualReferenceGuidance(preferredCuisine: string) {
  if (!preferredCuisine || preferredCuisine === "Any") return "";

  const visualReferences = getCuisineVisualReferenceText(preferredCuisine, 14);
  if (!visualReferences) return "";

  return [
    `Visual reference set for ${preferredCuisine} plating and recall: ${visualReferences}.`,
    "Use these references to choose the right dish family, garnish, bread form, sauce placement, rice layering, and cooking finish before defaulting to a generic plated meal.",
    "When the pantry strongly matches one of these visual families, reflect that same family in the recipe name, steps, and image search phrases."
  ].join(" ");
}

function buildCuisineSubstyleGuidance(
  preferredCuisine: string,
  ingredients: Array<{ name: string; quantity?: string }>
) {
  const normalized = normalizeCuisinePromptKey(preferredCuisine);
  const knowledge = CUISINE_KNOWLEDGE[normalized];
  if (!knowledge?.substyles?.length) return "";

  const pantry = buildNormalizedPantrySet(ingredients);
  const candidates = knowledge.substyles.join(", ");

  if (normalized === "asian") {
    if (hasAny(pantry, ["fish sauce", "lime", "basil", "coconut milk", "lemongrass"])) {
      return `Substyle routing: the pantry leans Thai, so prefer Thai dish families and say Thai in the cuisine field when appropriate. Other available substyles are ${candidates}.`;
    }
    if (hasAny(pantry, ["soy sauce", "sesame", "scallion", "ginger"])) {
      return `Substyle routing: the pantry leans East Asian stir-fry or rice-bowl cooking, so choose the clearest substyle rather than leaving every dish broadly labeled Asian. Other available substyles are ${candidates}.`;
    }

    return `Substyle routing: Asian is a broad umbrella. Select the best-fitting substyle from these options based on the pantry: ${candidates}.`;
  }

  return `Substyle routing: if the pantry clearly matches one of these branches, prefer it explicitly: ${candidates}.`;
}

function buildMealTypeRoutingGuidance(
  preferredCuisine: string,
  ingredients: Array<{ name: string; quantity?: string }>
) {
  const pantry = buildNormalizedPantrySet(ingredients);
  if (!pantry.size) return "";

  const breakfastSignals = countPantryMatches(pantry, [
    "egg", "eggs", "fava bean", "broad bean", "ful", "yogurt", "feta", "cheese", "bread", "pita", "bell pepper", "tomato"
  ]);
  const dinnerSignals = countPantryMatches(pantry, [
    "ground meat", "ground beef", "lamb", "chicken", "rice", "pasta", "noodle", "lentil", "kidney bean", "chickpea", "coconut milk"
  ]);

  const normalizedCuisine = normalizeCuisinePromptKey(preferredCuisine);
  const mealBias =
    breakfastSignals >= Math.max(2, dinnerSignals + 1)
      ? "The pantry is breakfast-leaning, so at least some top recipes should be authentic breakfast dishes."
      : dinnerSignals >= 2
        ? "The pantry is lunch/dinner-leaning, so prioritize full plated meals, skillets, stews, rice dishes, pasta dishes, or baked mains over breakfast plates."
        : "The pantry is mixed, so balance breakfast-style and lunch/dinner-style dish families according to the strongest authentic match.";

  if (normalizedCuisine === "egyptian") {
    return `${mealBias} For Egyptian cuisine, breakfast should lean toward ful, taameya, shakshuka, or eggah; lunch and dinner should lean toward kofta, hawawshi, fasolia, koshary, rice plates, or baked casseroles.`;
  }

  if (normalizedCuisine === "italian") {
    return `${mealBias} For Italian cuisine, breakfast should stay light like frittata or toast-based dishes, while lunch and dinner should lean toward pasta, risotto, soups, skillets, or baked dishes.`;
  }

  if (normalizedCuisine === "indian") {
    return `${mealBias} For Indian cuisine, breakfast can lean toward bhurji, poha, upma, or masala omelette, while lunch and dinner should lean toward dal, pulao, curry, keema, rajma, or chana masala.`;
  }

  if (normalizedCuisine === "turkish") {
    return `${mealBias} For Turkish cuisine, breakfast should lean toward menemen or egg-and-cheese plates, while lunch and dinner should lean toward kofte, adana kebab, lentil soup, pilaf plates, or eggplant-based mains.`;
  }

  if (normalizedCuisine === "asian") {
    return `${mealBias} For Asian cuisine, choose clear Asian substyles such as Chinese, Japanese, Korean, Thai, Vietnamese, or broader East/Southeast Asian meals. Breakfast can lean toward congee, rice bowls, noodle soup, or vegetable rice plates; lunch and dinner should lean toward rice bowls, rice noodle dishes, stir-fries, brothy soups, curries, or fried rice with Asian aromatics. Do not use Egyptian, Mediterranean, American, Italian, or generic Western meal families.`;
  }

  return mealBias;
}

function buildCuisineImageGuidance(preferredCuisine: string) {
  const normalized = normalizeCuisinePromptKey(preferredCuisine);
  const knowledge = CUISINE_KNOWLEDGE[normalized];
  if (!knowledge?.visualAnchors?.length) return "";

  return `Image-search guidance: prefer search phrases that reflect the dish's visible form. Favor these visual anchors when relevant: ${knowledge.visualAnchors.join(", ")}. Do not reuse the same broad photo phrase for visually different recipes.`;
}

function normalizeCuisinePromptKey(value: string) {
  if (!value || value === "Any") return "any";
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

function buildIngredientDrivenCuisineGuidance(
  preferredCuisine: string,
  ingredients: Array<{ name: string; quantity?: string }>
) {
  const pantry = buildNormalizedPantrySet(ingredients);

  if (!pantry.size) return "";

  const cuisineKey = normalizeCuisinePromptKey(preferredCuisine);
  const hints: string[] = [];

  if (cuisineKey === "egyptian" || cuisineKey === "any") {
    if (hasAny(pantry, ["pasta", "spaghetti", "shell pasta", "macaroni", "penne", "fettuccine"])) {
      hints.push("Egyptian sparse pantry reasoning: pasta shapes alone can still justify macarona bechamel, baked macarona trays, or other Egyptian pasta dishes if the missing_ingredients list clearly supplies mince, onion, tomato sauce, milk, flour, butter, or bechamel components.");
    }

    if (hasAny(pantry, ["ground meat", "minced meat", "beef mince", "lamb mince", "mince"])) {
      hints.push("Egyptian ingredient reasoning: when ground meat is present, consider kofta first if onion, parsley, cilantro, garlic, or rice are available.");

      if (hasAny(pantry, ["bread", "pita", "baladi bread", "flatbread"])) {
        hints.push("Egyptian ingredient reasoning: ground meat plus bread or pita should strongly suggest hawawshi or arayes-style stuffed bread before generic meat sandwiches.");
      }

      if (hasAny(pantry, ["pasta", "penne", "macaroni", "spaghetti"]) && hasAny(pantry, ["milk", "butter", "flour", "bechamel", "cream"])) {
        hints.push("Egyptian ingredient reasoning: ground meat plus pasta plus milk, butter, flour, or bechamel components should strongly suggest macarona bechamel before generic pasta bake.");
      }

      if (hasAny(pantry, ["tomato", "tomato sauce", "passata"]) && hasAny(pantry, ["rice", "vermicelli"])) {
        hints.push("Egyptian ingredient reasoning: ground meat plus tomato and rice can support kofta with rice or meat kofta in tomato sauce.");
      }

      if (hasAny(pantry, ["rice"]) && hasAny(pantry, ["parsley", "dill", "cilantro", "coriander", "tomato", "tomato sauce"])) {
        hints.push("Egyptian ingredient reasoning: ground meat plus crushed rice and herbs can support Egyptian rice kofta, koftet roz: fried kofta fingers or balls simmered in red tomato-garlic sauce. This is different from grilled kofta mashwia.");
      }
    }

    if (hasAny(pantry, ["chicken", "chicken breast", "chicken thigh", "whole chicken"])) {
      hints.push("Egyptian ingredient reasoning: chicken should first map to authentic Egyptian plates such as farakh meshwi, chicken molokhia, chicken fattah, taagen chicken and onions, or chicken negresco before generic garlic chicken.");
      if (hasAny(pantry, ["pasta", "macaroni", "penne", "spaghetti"]) || hasAny(pantry, ["milk", "butter", "flour", "cream", "cheese"])) {
        hints.push("Egyptian ingredient reasoning: chicken plus pasta or white-sauce staples can support chicken negresco, with missing bechamel items listed explicitly.");
      }
      if (hasAny(pantry, ["rice", "bread", "baladi bread", "garlic", "vinegar"])) {
        hints.push("Egyptian ingredient reasoning: chicken plus rice, bread, garlic, or vinegar can support chicken fattah instead of a generic chicken rice plate.");
      }
    }

    if (hasAny(pantry, ["fava bean", "broad bean", "ful"])) {
      hints.push("Egyptian ingredient reasoning: fava beans strongly suggest ful medames for breakfast or taameya-style dishes when herbs and aromatics fit.");
      hints.push("Egyptian sparse ful rule: if ful or fava beans are the only meaningful pantry item and many cards are requested, make the cards distinct by ful topping and serving form: classic ful medames, ful bil zeit, spicy ful bil zeit, Arabiata-style ful with tahini lemon cumin, Alexandrian ful, ful with fried egg, ful tagine with eggs and cheese, ful tray with eggs and sausage, ful tagine with eggs and basterma, ful sandwich, ful salad plate, and taameya-style dishes before non-Egyptian bean recipes.");
      if (hasAny(pantry, ["onion", "garlic"]) && hasAny(pantry, ["cilantro", "coriander", "parsley", "dill"])) {
        hints.push("Egyptian ingredient reasoning: fava beans plus onion, garlic, and fresh herbs should strongly suggest taameya instead of generic bean patties.");
      }
    }

    if (hasAny(pantry, ["egg", "eggs"]) && hasAny(pantry, ["tomato", "tomato sauce"]) && hasAny(pantry, ["bell pepper", "pepper", "onion"])) {
      hints.push("Egyptian ingredient reasoning: eggs plus tomato plus pepper or onion should strongly suggest shakshuka or shakshouka for breakfast.");
    }

    if (hasAny(pantry, ["lentil", "brown lentil"]) && hasAny(pantry, ["rice"]) && hasAny(pantry, ["pasta", "macaroni", "spaghetti"])) {
      hints.push("Egyptian ingredient reasoning: lentils plus rice plus pasta strongly suggest koshary, especially if tomato sauce, chickpeas, or fried onion are plausible missing ingredients.");
    }

    if (hasAny(pantry, ["fish", "tilapia", "sea bass", "snapper"])) {
      hints.push("Egyptian ingredient reasoning: fish should first map to Egyptian fish forms such as sayadeya, samak singari, grilled Egyptian fish, samak bel radah, smoked fish, fried tilapia, Egyptian baked fish tray, or Egyptian fish tagine before a generic grilled fish plate.");
      hints.push("Egyptian sparse fish rule: if fish is the only meaningful pantry item and 10 cards are requested, make the cards distinct by Egyptian dish family and missing support ingredients, not by repeating generic lemon fish. Use sayadeya, samak singari, grilled, bel radah, smoked, fried, tilapia tray, baked oven fish, tomato fish tagine, and Egyptian fried fish sandwich before nearby cuisine fallbacks.");
      if (hasAny(pantry, ["rice", "vermicelli", "onion"])) {
        hints.push("Egyptian ingredient reasoning: fish plus rice and onion should strongly suggest sayadeya before a generic fish plate.");
      }
      if (hasAny(pantry, ["tomato", "bell pepper", "pepper", "garlic", "lemon"])) {
        hints.push("Egyptian ingredient reasoning: fish plus tomato, pepper, garlic, or lemon should strongly suggest samak singari, Egyptian baked fish tray, or Egyptian fish tagine.");
      }
    }

    if (hasAny(pantry, ["shrimp", "prawn", "seafood"])) {
      hints.push("Egyptian ingredient reasoning: shrimp or seafood should first map to Alexandrian shrimp, seafood sayadeya, shrimp rice, Egyptian shrimp tagine, grilled shrimp skewers, garlic-lemon shrimp, shrimp with tahini-lemon sauce, spicy shrimp stew, seafood soup, or fried shrimp before generic shrimp plates.");
      hints.push("Egyptian sparse shrimp rule: if shrimp is the only meaningful pantry item and many cards are requested, make the cards distinct by Egyptian seafood family and missing support ingredients, not by repeating generic garlic shrimp.");
      if (hasAny(pantry, ["rice", "onion", "tomato"])) {
        hints.push("Egyptian ingredient reasoning: shrimp plus rice, onion, or tomato can support seafood sayadeya.");
      }
      if (hasAny(pantry, ["garlic", "lemon", "cumin", "coriander", "chili"])) {
        hints.push("Egyptian ingredient reasoning: shrimp plus garlic, lemon, cumin, coriander, or chili can support Alexandrian shrimp.");
      }
    }
  }

  if (cuisineKey === "italian" || cuisineKey === "any") {
    if (
      hasAny(pantry, ["pizza dough", "pizza base", "dough", "flour", "flatbread", "pita", "tortilla", "bread"]) &&
      hasAny(pantry, ["tomato", "tomato sauce", "passata", "marinara", "mozzarella", "cheese", "basil", "oregano", "mushroom", "tuna", "chicken", "vegetable"])
    ) {
      hints.push("Italian ingredient reasoning: a credible pizza base plus tomato, cheese, herbs, or toppings should strongly suggest pizza margherita, pizza marinara, calzone, focaccia, or Italian flatbread pizza before generic toast, sandwich, or baked bread. Put missing yeast, mozzarella, tomato sauce, basil, or oregano in missing_ingredients when needed.");
    }
    if (hasAny(pantry, ["bread", "baguette", "toast", "flatbread"]) && hasAny(pantry, ["tomato", "basil", "garlic", "olive oil"])) {
      hints.push("Italian ingredient reasoning: bread plus tomato, garlic, basil, or olive oil should suggest bruschetta or panzanella before a generic salad or toast.");
    }
    if (hasAny(pantry, ["pasta", "spaghetti", "penne", "macaroni"]) && hasAny(pantry, ["tomato", "tomato sauce", "passata"])) {
      hints.push("Italian ingredient reasoning: pasta plus tomato should favor pomodoro, arrabbiata, baked pasta, or tomato-based pasta families instead of generic noodles.");
    }
    if (hasAny(pantry, ["pasta", "spaghetti", "linguine", "fettuccine"]) && hasAny(pantry, ["garlic", "olive oil"])) {
      hints.push("Italian ingredient reasoning: pasta plus garlic and olive oil can support aglio e olio, while pasta plus tomato/olives/capers can support puttanesca, and pasta plus cheese/pepper can support cacio e pepe when missing ingredients allow it.");
    }
    if (hasAny(pantry, ["ground meat", "ground beef", "minced meat", "beef mince", "mince"]) && hasAny(pantry, ["pasta", "penne", "macaroni", "rigatoni"]) && hasAny(pantry, ["tomato", "tomato sauce", "passata"])) {
      hints.push("Italian-American ingredient reasoning: ground beef plus penne or short pasta plus tomato sauce can support a beef tomato pasta skillet or one-pan ground beef penne. The image should show crumbled ground beef in red sauce with visible penne, not steak, meatballs, or beef strips.");
    }
    if (hasAny(pantry, ["pasta", "spaghetti", "penne", "macaroni"]) && hasAny(pantry, ["milk", "cream", "parmesan", "mozzarella", "butter"])) {
      hints.push("Italian ingredient reasoning: pasta plus dairy should favor creamy pasta or baked pasta families and should be clearly distinguished from red sauce pasta.");
    }
    if (hasAny(pantry, ["shrimp", "prawn"]) && hasAny(pantry, ["pasta", "spaghetti", "linguine", "fettuccine"])) {
      hints.push("Italian ingredient reasoning: shrimp plus pasta should favor shrimp linguine or garlic shrimp pasta before a generic seafood pasta label.");
    }
    if (hasAny(pantry, ["rice", "arborio rice", "risotto rice"]) && hasAny(pantry, ["mushroom", "shrimp", "seafood", "broth", "parmesan"])) {
      hints.push("Italian ingredient reasoning: rice plus broth, parmesan, mushroom, shrimp, or seafood should suggest risotto, not a generic rice bowl.");
    }
    if (hasAny(pantry, ["chicken"]) && hasAny(pantry, ["tomato", "tomato sauce", "onion", "garlic", "oregano", "basil"])) {
      hints.push("Italian ingredient reasoning: chicken plus tomato, onion, garlic, and herbs should suggest chicken cacciatore before generic tomato chicken.");
    }
    if (hasAny(pantry, ["chicken"]) && hasAny(pantry, ["lemon", "capers", "butter", "parsley"])) {
      hints.push("Italian ingredient reasoning: chicken plus lemon, capers, butter, or parsley should suggest chicken piccata before generic lemon chicken.");
    }
  }

  if (cuisineKey === "middleeastern" || cuisineKey === "any") {
    if (
      hasAny(pantry, ["chicken", "beef", "lamb"]) &&
      hasAny(pantry, ["garlic", "lemon", "cumin", "coriander", "paprika", "allspice", "yogurt", "tahini", "pita", "flatbread", "rice", "pickle", "pickles", "onion"])
    ) {
      hints.push("Middle Eastern ingredient reasoning: chicken, intact beef, or lamb with garlic, lemon, shawarma spices, tahini, yogurt, pita, flatbread, rice, pickles, or onion should strongly suggest shawarma wrap, shawarma plate, or shawarma bowl before a generic grilled meat plate. Do not use shawarma for ground or minced meat.");
    }
  }

  if (cuisineKey === "mediterranean" || cuisineKey === "any") {
    if (hasAny(pantry, ["fish", "sea bass", "cod", "snapper"]) && hasAny(pantry, ["lemon", "olive oil", "oregano", "parsley"])) {
      hints.push("Mediterranean ingredient reasoning: fish plus lemon, olive oil, and herbs should favor baked or grilled Mediterranean fish.");
    }
    if (hasAny(pantry, ["shrimp", "prawn"]) && hasAny(pantry, ["pasta", "spaghetti", "linguine", "orzo", "garlic"])) {
      hints.push("Mediterranean ingredient reasoning: shrimp plus pasta and garlic should favor garlic shrimp pasta or lemon shrimp pasta instead of a generic shrimp plate.");
    }
  }

  if (cuisineKey === "american" || cuisineKey === "any") {
    if (hasAny(pantry, ["ground meat", "ground beef", "minced beef", "minced meat", "beef mince", "mince"]) && hasAny(pantry, ["pasta", "penne", "macaroni", "rigatoni"]) && hasAny(pantry, ["tomato", "tomato sauce", "passata", "marinara"])) {
      hints.push("American or Italian-American ingredient reasoning: ground beef plus short pasta plus tomato sauce should strongly suggest one-pan ground beef penne, ground beef pasta, or a beef tomato pasta skillet. Use visual_keywords like penne or elbow macaroni, red tomato meat sauce, and small crumbled ground beef; exclude steak, beef strips, beef cubes, meatballs, burger patties, and unrelated pasta shapes.");
    }

    if (hasAny(pantry, ["ground meat", "ground beef", "minced beef", "minced meat", "beef mince", "mince"]) && hasAny(pantry, ["potato", "potatoes", "carrot", "celery"]) && hasAny(pantry, ["tomato", "tomato sauce", "stewed tomatoes", "diced tomatoes"])) {
      hints.push("American ingredient reasoning: ground beef plus potatoes, carrots, celery, onion, and tomatoes should strongly suggest hamburger stew or hamburger soup. The image should show chunky tomato broth with crumbled ground beef and vegetables, not beef cubes, steak, meatballs, pasta, or chili.");
    }
  }

  if (cuisineKey === "indian" || cuisineKey === "any") {
    if (hasAny(pantry, ["lentil", "red lentil", "yellow lentil", "masoor dal", "moong dal"])) {
      hints.push("Indian ingredient reasoning: lentils should favor dal families before generic lentil soup when the cuisine is Indian.");
    }
    if (hasAny(pantry, ["chickpea", "garbanzo"]) && hasAny(pantry, ["tomato", "onion", "garlic", "ginger"])) {
      hints.push("Indian ingredient reasoning: chickpeas plus tomato, onion, and aromatics should favor chana masala-style dishes.");
    }
    if (hasAny(pantry, ["fish"]) && hasAny(pantry, ["tomato", "onion", "ginger", "garlic"])) {
      hints.push("Indian ingredient reasoning: fish plus tomato, onion, ginger, and garlic should favor fish curry rather than a generic fish stew.");
    }
  }

  if (cuisineKey === "turkish" || cuisineKey === "any") {
    if (hasAny(pantry, ["ground meat", "minced meat", "ground beef", "beef mince", "lamb mince", "chopped meat"])) {
      hints.push("Turkish ingredient reasoning: ground or chopped meat should strongly favor kofte or kebab families before generic meatballs.");

      if (hasAny(pantry, ["paprika", "pepper paste", "tomato paste", "chili", "aleppo pepper"])) {
        hints.push("Turkish ingredient reasoning: ground meat plus paprika or pepper-paste ingredients should strongly suggest adana kebab-style or spicy kofte-style dishes.");
      }

      if (hasAny(pantry, ["onion", "parsley", "garlic", "cumin", "sumac"])) {
        hints.push("Turkish ingredient reasoning: ground meat plus onion, parsley, garlic, cumin, or sumac should push image and naming language toward kofte, izgara kofte, or kebab.");
      }

      if (hasAny(pantry, ["dough", "flatbread", "flour", "pide", "bread"]) && hasAny(pantry, ["tomato", "pepper", "bell pepper", "onion"])) {
        hints.push("Turkish ingredient reasoning: ground meat plus dough or flatbread plus tomato, pepper, and onion should strongly suggest kiymali pide or lahmacun. Kiymali pide is oval and boat-shaped with folded raised edges; lahmacun is very thin and round with finely minced topping.");
      }

      if (hasAny(pantry, ["phyllo", "filo", "yufka", "pastry"]) && hasAny(pantry, ["onion", "paprika", "cumin", "parsley"])) {
        hints.push("Turkish ingredient reasoning: ground meat plus phyllo or yufka should suggest Turkish spiral borek, a golden coiled pastry filled with spiced ground beef.");
      }

      if (hasAny(pantry, ["eggplant", "aubergine"]) && hasAny(pantry, ["tomato", "tomato sauce", "pepper", "bell pepper"])) {
        hints.push("Turkish ingredient reasoning: ground meat plus eggplant and tomato should branch into karniyarik when the eggplant is split and stuffed, or Turkish musakka when it is a layered casserole.");
      }
    }

    if (hasAny(pantry, ["egg", "eggs"]) && hasAny(pantry, ["tomato", "pepper", "bell pepper", "onion"])) {
      hints.push("Turkish ingredient reasoning: eggs plus tomato and peppers should suggest menemen before a generic tomato egg skillet.");
    }
  }

  if (cuisineKey === "thai" || cuisineKey === "any") {
    if (hasAny(pantry, ["rice noodle", "noodle"]) && hasAny(pantry, ["egg", "shrimp", "chicken", "bean sprout"])) {
      hints.push("Thai ingredient reasoning: rice noodles plus protein and egg should favor Thai noodle families rather than generic stir-fry noodles.");
    }
    if (hasAny(pantry, ["coconut milk"]) && hasAny(pantry, ["chicken", "shrimp", "vegetable"])) {
      hints.push("Thai ingredient reasoning: coconut milk plus protein or vegetables should favor curry or coconut soup families when the rest of the pantry fits.");
    }
    if (hasAny(pantry, ["shrimp", "prawn"]) && hasAny(pantry, ["lemongrass", "lime", "chili", "fish sauce"])) {
      hints.push("Thai ingredient reasoning: shrimp plus lemongrass, lime, chili, or fish sauce should strongly suggest tom yum shrimp or Thai garlic shrimp before a generic shrimp stir-fry.");
    }
  }

  if (cuisineKey === "asian" || cuisineKey === "any") {
    if (hasAny(pantry, ["shrimp", "prawn"]) && hasAny(pantry, ["garlic", "soy sauce", "honey"])) {
      hints.push("Asian ingredient reasoning: shrimp plus garlic, soy sauce, and honey should favor garlic honey shrimp rather than a generic seafood bowl.");
    }
    if (hasAny(pantry, ["fish"]) && hasAny(pantry, ["broth", "ginger", "scallion"])) {
      hints.push("Asian ingredient reasoning: fish plus broth and aromatics can justify a fish soup or brothy rice bowl instead of only grilled fish.");
    }
  }

  return hints.join(" ");
}

function buildNormalizedPantrySet(ingredients: Array<{ name: string; quantity?: string }>) {
  return new Set(
    ingredients
      .map((item) => normalizePantryIngredient(item.name))
      .filter(Boolean)
  );
}

function hasAny(pantry: Set<string>, candidates: string[]) {
  return candidates.some((candidate) => {
    const normalizedCandidate = normalizePantryIngredient(candidate);
    return Array.from(pantry).some(
      (ingredient) =>
        ingredient === normalizedCandidate ||
        ingredient.includes(normalizedCandidate) ||
        normalizedCandidate.includes(ingredient)
    );
  });
}

function countPantryMatches(pantry: Set<string>, candidates: string[]) {
  return candidates.reduce((count, candidate) => count + (hasAny(pantry, [candidate]) ? 1 : 0), 0);
}

function normalizePantryIngredient(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/\b\d+(?:\/\d+)?\b/g, " ")
    .replace(/\b(cup|cups|tbsp|tsp|g|gram|grams|kg|lb|oz|bag|bottle|jar|can|cans|carton|pack|package|whole|fresh|dried|dry|frozen|cooked|raw|minced|chopped|diced|sliced)\b/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (isArabicGroundMeatPantryIngredient(normalized)) return "ground meat";
  if (/\b(bell\s*pep+er|sweet\s+pep+er|capsicum|green\s+pep+er|red\s+pep+er|yellow\s+pep+er)\b/i.test(normalized)) return "bell pepper";
  if (/\b(chicken\s+breasts?|chicken\s+thighs?|chicken\s+legs?|chicken\s+tenders?)\b/i.test(normalized)) return "chicken";
  if (/\b(flatbread|pita|tortilla|lavash|naan|baladi\s+bread|wraps?)\b/i.test(normalized)) return "bread";
  if (/سمك|سمكة|بلطي|بوري|قاروص|دنيس/u.test(normalized)) return "fish";
  if (/جمبري|جمبرى|روبيان|قريدس|سي\s*فود/u.test(normalized)) return "shrimp";
  if (/دجاج|فراخ|فراخة|فرخة|صدور?\s*دجاج|صدور?\s*فراخ/u.test(normalized)) return "chicken";
  if (/بيض|بيضة/u.test(normalized)) return "egg";
  if (/فول/u.test(normalized)) return "ful";
  if (/عدس/u.test(normalized)) return "lentil";
  if (/حمص/u.test(normalized)) return "chickpeas";
  if (/كبدة|كبد/u.test(normalized)) return "liver";

  return normalized;
}

function isArabicGroundMeatPantryIngredient(value: string) {
  return /(?:\u0627\u0644)?\u0644\u062d\u0645(?:\u0629|\u0647)?\s+(?:\u0627\u0644)?\u0645\u0641\u0631\u0648\u0645(?:\u0629|\u0647)?\u0648?/iu.test(value);
}

function formatNutritionGoals(goals: NutritionGoals) {
  const entries = [
    goals.minCalories ? `minimum calories ${goals.minCalories} kcal per meal` : "",
    goals.maxCalories ? `maximum calories ${goals.maxCalories} kcal per meal` : "",
    goals.minProtein ? `minimum protein ${goals.minProtein}g per meal` : "",
    goals.maxCarbs ? `maximum carbs ${goals.maxCarbs}g per meal` : "",
    goals.maxSugar ? `maximum sugar ${goals.maxSugar}g per meal` : "",
    goals.maxSodium ? `maximum sodium ${goals.maxSodium}mg per meal` : "",
    goals.minSodium ? `minimum sodium ${goals.minSodium}mg per meal` : "",
    goals.maxFat ? `maximum fat ${goals.maxFat}g per meal` : "",
    goals.minFiber ? `minimum fiber ${goals.minFiber}g per meal` : ""
  ].filter(Boolean);

  return entries.length ? entries.join("; ") : "standard balanced meals aligned to calorie target";
}

export function buildIngredientVisionPrompt(language = "English") {
  return [
    "You are NutriMoment's food vision assistant.",
    "Analyze the image and identify the clearly visible food ingredients or dominant grocery components in it.",
    "Return ONLY valid JSON. Do not include markdown, prose, comments, or code fences.",
    "Use this exact format: {\"ingredients\":[\"ingredient1\",\"ingredient2\"]}.",
    "Only include actual food ingredients. Use short canonical grocery names in singular form when possible.",
    "If the image shows a cooked dish instead of loose ingredients, list only the dominant visible components such as chicken breast, pasta, rice, noodles, tomato sauce, white sauce, cheese, spinach, or mushrooms. Do not invent hidden seasonings or full recipes.",
    "Never output brand names, packaging text, cookware, plates, utensils, or vague labels like food, meal, dish, sauce, or seasoning unless the ingredient itself is visually clear.",
    `Use ${language}.`
  ].join(" ");
}

export function buildIngredientNameArrayVisionPrompt(language = "English", isPantry = false) {
  return [
    "You are NutriMoment's food vision assistant.",
    isPantry
      ? "Identify distinct grocery or pantry items visible in the image, including jars, cans, packaged goods, fresh produce, and staples."
      : "Identify the clearly visible food ingredients or dominant grocery components in the image.",
    "Return ONLY valid JSON. Do not include markdown, prose, comments, or code fences.",
    isPantry
      ? "Return a JSON array of short item names, for example: [\"olive oil\",\"rice\",\"canned tomatoes\"]."
      : "Return a JSON array of short canonical ingredient names, for example: [\"tomato\",\"onion\",\"chicken breast\"].",
    isPantry
      ? "Prefer generic grocery names over brands, and include packaged foods only when the food type is clear."
      : "If the image shows a plated meal, output only the dominant visible components such as grilled chicken, pasta, egg noodles, tomato sauce, white sauce, rice, broccoli, or mushrooms. Prefer the ingredient form over the recipe title.",
    "Do not include quantities, brands, cookware, tableware, or speculative ingredients that are not visually clear.",
    `Use ${language}.`
  ].join(" ");
}

export function buildPlateRecipeMatchVisionPrompt(language = "English") {
  const languageOutputGuidance = buildLanguageOutputGuidance(language);

  return [
    "You are NutriMoment's plated-dish reconstruction assistant.",
    "Analyze the uploaded image and decide whether it shows a plated prepared meal that can be recreated as a recipe.",
    "Return ONLY valid JSON. Do not include markdown, prose, comments, or code fences.",
    "Use this exact top-level shape: {\"isPlatedDish\":true,\"recipe\":{...}} or {\"isPlatedDish\":false,\"reason\":\"...\"}.",
    "If the image is not a plated meal, or it is too ambiguous to infer a likely recipe, return isPlatedDish false.",
    "If it is a plated meal, return exactly one likely recipe that recreates the visible dish as closely as possible.",
    "Prefer canonical dish names over generic names. Example: use chicken alfredo pasta, shakshuka, fried rice, grilled salmon with rice, not delicious dinner bowl.",
    "Base the recipe on clearly visible food components and likely cooking structure. It is acceptable to infer a small number of support ingredients when they are necessary to recreate the dish faithfully.",
    "Visible dominant components should go in ingredients. Likely but not clearly visible support items should go in missing_ingredients.",
    "Do not include brands, cookware, plates, utensils, tables, garnish guesses with low confidence, or speculative hidden ingredients that are not needed to reconstruct the dish.",
    "Return 7 to 10 detailed recipe steps that are practical for home cooking.",
    "Every step string must include the action, exact ingredient quantities used in that step, heat level or tool when relevant, timing in minutes, and the visual/texture cue for moving on.",
    "Also include image_search_index and image_search_indices so photo lookup can find the same dish style later.",
    languageOutputGuidance,
    "Set scan_match_explanation to one short sentence explaining why this recipe matches the plated dish visually.",
    "The recipe object must include exactly these keys: name, cuisine, recipe_origin, scan_match_explanation, image_search_index, image_search_indices, ingredients, missing_ingredients, steps, calories, protein, carbs, fat, fiber, sugar, sodium, cook_time, difficulty, match_quality, preference_hits, localized.",
    "Set recipe_origin to exact_scan_match.",
    "Set match_quality to great when the dish family is clear, good when plausible, possible when somewhat uncertain.",
    "Return ingredients and missing_ingredients as arrays of short strings. Return steps as an array of detailed strings with timing and quantities. Return preference_hits as an empty array if none apply. localized must contain exactly English and Arabic, and each localized variant must include the same user-facing recipe fields.",
    `Use ${language}.`
  ].join(" ");
}

export function buildPantryInventoryVisionPrompt(language = "English") {
  return [
    "You are NutriMoment's pantry inventory assistant.",
    "Analyze the pantry or grocery image and identify visible food items with approximate quantities.",
    "Return ONLY valid JSON. Do not include markdown, prose, comments, or code fences.",
    "Use this exact format: {\"items\":[{\"name\":\"rice\",\"quantity\":\"1 bag\"},{\"name\":\"olive oil\",\"quantity\":\"1 bottle\"}]}",
    "Estimate quantity approximately using simple units like \"1 jar\", \"2 cans\", \"half bag\", \"1 bunch\", or \"1 carton\".",
    "Use short singular item names where possible. Only include food or pantry items that are reasonably visible. If uncertain, provide a cautious approximate quantity.",
    `Use ${language}.`
  ].join(" ");
}

/**
 * Centralized facade for every Gemini prompt in NutriMoment.
 *
 * The exported function names above remain available for compatibility with
 * existing scripts and tests. Production callers should use this class so a
 * route never owns prompt wording or concatenates model instructions.
 */
export class PromptBuilder {
  static compose(modules: Array<string | null | undefined | false>) {
    return modules
      .filter((module): module is string => typeof module === "string" && module.trim().length > 0)
      .join(" ");
  }

  static recipeGeneration(ingredients: RecipePromptIngredient[], options: RecipePromptOptions) {
    return buildRecipeGenerationPrompt(ingredients, options);
  }

  static recipeEditorSystemPrompt(recipeLanguage: string) {
    return buildRecipeEditorSystemPrompt(recipeLanguage);
  }

  static recipeEditorBatchPrompt(options: RecipeEditorBatchPromptOptions) {
    return buildRecipeEditorBatchPrompt(options);
  }

  static recipeEditorBatchSystemPrompt(recipeLanguage: string) {
    return buildRecipeEditorBatchSystemPrompt(recipeLanguage);
  }

  static recipeEditorBatchResponseSchema(recipeCount: number) {
    return buildRecipeEditorBatchResponseSchema(recipeCount);
  }

  static recipeDiscoverySystemPrompt(recipeLanguage: string) {
    return buildRecipeDiscoverySystemPrompt(recipeLanguage);
  }

  static recipeBatchGenerationSystemPrompt(recipeLanguage: string) {
    return [
      RECIPE_BATCH_GENERATION_SYSTEM_PROMPT,
      recipeLanguage.toLowerCase() === "arabic" ? ARABIC_RECIPE_EDITOR_RULES : "Write every user-facing value in English only."
    ].join(" ");
  }

  static recipeGenerationResponseSchema(recipeCount: number, ingredientCoverage?: RecipeInputCoveragePrompt) {
    return buildRecipeGenerationResponseSchema(recipeCount, ingredientCoverage);
  }

  static recipeDiscoveryResponseSchema(recipeCount: number) {
    return buildRecipeDiscoveryResponseSchema(recipeCount);
  }

  static recipeEditorResponseSchema() {
    return RECIPE_EDITOR_RESPONSE_SCHEMA;
  }

  static promptOnlyRecipeGeneration(prompt: string, recipeLanguage = "English", requestedRecipeCount = 10) {
    return buildPromptOnlyRecipeGenerationPrompt(prompt, recipeLanguage, requestedRecipeCount);
  }

  static mealPlan(options: MealPlanPromptOptions) {
    return buildMealPlanPrompt(options);
  }

  static mealPlanRepair(options: MealPlanPromptOptions & { issues: unknown[]; mealPlan: MealPlanData }) {
    return buildMealPlanRepairPrompt(options);
  }

  static ingredientVision(language = "English") {
    return buildIngredientVisionPrompt(language);
  }

  static ingredientNameArrayVision(language = "English", isPantry = false) {
    return buildIngredientNameArrayVisionPrompt(language, isPantry);
  }

  static platedDishVision(language = "English") {
    return buildPlateRecipeMatchVisionPrompt(language);
  }

  static pantryInventoryVision(language = "English") {
    return buildPantryInventoryVisionPrompt(language);
  }

  static fridgeImageAnalysis() {
    return [
      "You are an expert dietitian and chef. Look at this image of a fridge or groceries.",
      "Identify all the distinct food ingredients you can see perfectly clearly.",
      "Do not hallucinate items that are not present.",
      "Return strict JSON in this shape:",
      JSON.stringify({
        ingredients: [{ name: "Ingredient Name", quantity: "Estimated Quantity/Unit" }],
        recipeSuggestion: {
          title: "A clever recipe name using mainly these ingredients",
          description: "Brief 1 sentence pitch of the recipe."
        }
      }),
      "Return only JSON."
    ].join("\n");
  }

  static legacyRecipeRequest(userPrompt: string) {
    // The legacy endpoint intentionally preserves its existing free-form API.
    // Keeping this pass-through in the builder prevents routes from creating
    // their own Gemini prompt path while retaining the wire behavior.
    return userPrompt;
  }

  static scannerPantryBalanceRepair(basePrompt: string, recipeCount: number) {
    return [
      basePrompt,
      "",
      "Scanner repair pass: your previous answer did not produce enough strong pantry-first recipe options.",
      `Return up to ${recipeCount} recipes.`,
      "Recommend recipes where available ingredients clearly carry the dish after strict pantry ownership is applied.",
      "Start with the strongest pantry-friendly recipes first, centered on the scanned or typed ingredients.",
      "If there are not enough pantry-strong options, fill the remaining recipe slots with the best pantry-first recipes you can find.",
      "Keep missing_ingredients as low as possible and avoid weak pantry fits unless they are needed to fill later slots.",
      "If the pantry is sparse, choose recognizable named dish families and list authentic support items as missing_ingredients. Do not collapse the retry into plain grilled, garlic-lemon, or generic pasta plates.",
      "Return only valid JSON and follow the same schema as before."
    ].join(" ");
  }
}
