import type { RecipeCatalogDoc, RecipeQualityStatus } from "@/lib/domain";
import {
  getIngredientProfileForExactTerm,
  getIngredientProfileForTerm,
  normalizeIngredientText
} from "@/food/IngredientNormalizer";

export const RECIPE_CONTENT_VERSION = "recipe-content-v2";

export interface RecipeContentQualityResult {
  contentVersion: string;
  eligibleForDiscovery: boolean;
  reasons: string[];
  score: number;
  status: RecipeQualityStatus;
}

export interface RecipeCatalogQualityPartition {
  discoverable: RecipeCatalogDoc[];
  quarantined: Array<{ quality: RecipeContentQualityResult; recipe: RecipeCatalogDoc }>;
}

const GENERIC_INSTRUCTION_PATTERNS = [
  /prepare the main ingredients for/i,
  /add supporting flavors such as/i,
  /cook until the ingredients are tender and the flavors match/i,
  /serve warm with a balanced portion size/i,
  /^(?:heat|preheat) (?:a |the )?pan\.?$/i,
  /^add (?:the )?(?:main ingredient|ingredients?|chicken|meat)\.?$/i,
  /^cook until (?:done|ready|cooked)\.?$/i,
  /^combine all ingredients\.?$/i,
  /^serve warm\.?$/i
] as const;

const CULINARY_ACTION_PATTERN = /\b(?:arrange|assemble|bake|beat|blend|boil|braise|brown|chop|coat|combine|dice|drain|fold|fry|grate|grill|heat|knead|marinate|mash|mince|mix|peel|pour|preheat|reduce|rest|roast|saute|sear|season|simmer|slice|steam|stir|toast|whisk)\b/giu;
const PREPARATION_PATTERN = /\b(?:across the grain|bite-size|chop|clean|coat|cube|cut|dice|drain|flatten|grate|marinate|mince|pat|peel|pound|rinse|score|shred|slice|soak|trim|whisk)\b/i;
const COOKING_CONTROL_PATTERN = /\b(?:low|medium|high|heat|oven|grill|skillet|pan|pot|baking dish|sheet|rack|temperature|\d{2,3}\s*(?:c|f)\b)/i;
const TIME_OR_DONENESS_PATTERN = /\b(?:\d+\s*(?:to|-)?\s*\d*\s*(?:minute|minutes|min|hour|hours)|until|golden|browned|tender|opaque|crisp|set|reaches?\s+\d{2,3}\s*(?:c|f))\b/i;
const UNSAFE_INSTRUCTION_PATTERN = /\b(?:serve|eat)\s+(?:(?:the\s+)?(?:raw|undercooked)\s+(?:chicken|poultry|pork|ground meat|ground beef)|(?:the\s+)?(?:chicken|poultry|pork|ground meat|ground beef)\s+(?:raw|undercooked))|\b(?:bleach|detergent|cleaning product)\b/i;

export function classifyRecipeContentQuality(recipe: RecipeCatalogDoc): RecipeContentQualityResult {
  const reasons: string[] = [];
  const steps = normalizeSteps(recipe.steps);
  const sourceProvider = normalizeIngredientText(recipe.source?.provider ?? "");

  if (recipe.qualityStatus === "blocked" || hasUnsafeInstructions(steps)) {
    if (hasUnsafeInstructions(steps)) reasons.push("unsafe_cooking_instruction");
    if (recipe.qualityStatus === "blocked") reasons.push("explicitly_blocked");
    return result("blocked", reasons, 0);
  }

  if (sourceProvider === "cuisine catalog v2" || recipe.id.startsWith("catalog-v2-")) {
    return result("dish_intent", ["dish_intent_not_complete_recipe"], 20);
  }

  if (!recipe.title?.trim()) reasons.push("missing_recipe_title");
  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length < 2) reasons.push("insufficient_ingredients");
  if (steps.length < 3) reasons.push("insufficient_instruction_steps");
  const quantifiedIngredientCount = recipe.ingredients.filter(hasUsableQuantityAndUnit).length;
  if (recipe.ingredients.length && quantifiedIngredientCount < Math.ceil(recipe.ingredients.length * 0.6)) {
    reasons.push("insufficient_ingredient_quantities");
  }

  const instructionText = steps.join(" ");
  const instructionCharacters = instructionText.length;
  const actionCount = instructionText.match(CULINARY_ACTION_PATTERN)?.length ?? 0;
  const genericStepCount = countGenericRecipeInstructions(steps);

  if (genericStepCount >= 2) reasons.push("generic_instruction_language");
  if (instructionCharacters < 220 || actionCount < 4) reasons.push("insufficient_instruction_detail");
  if (!PREPARATION_PATTERN.test(instructionText)) reasons.push("missing_preparation_detail");
  if (!COOKING_CONTROL_PATTERN.test(instructionText)) reasons.push("missing_heat_or_equipment_detail");
  if (!TIME_OR_DONENESS_PATTERN.test(instructionText)) reasons.push("missing_time_or_doneness_detail");

  reasons.push(...validateTitleMethodPromises(recipe.title, instructionText));
  reasons.push(...validateTitleIngredientPromises(recipe, instructionText));
  reasons.push(...validatePrimaryIngredientUsage(recipe, instructionText));

  const hasVerifiableSource = Boolean(recipe.source?.url?.trim());
  if (!hasVerifiableSource) reasons.push("missing_verifiable_source");

  const uniqueReasons = Array.from(new Set(reasons));
  if (uniqueReasons.length) {
    return result("probation", uniqueReasons, calculateScore(uniqueReasons));
  }

  const status: RecipeQualityStatus = recipe.id.startsWith("trusted-source-") ? "golden" : "verified";
  return result(status, [], status === "golden" ? 100 : 92);
}

export function hasGenericRecipeInstructions(steps: string[]) {
  return countGenericRecipeInstructions(steps) >= 2;
}

function countGenericRecipeInstructions(steps: string[]) {
  return steps.filter((step) => GENERIC_INSTRUCTION_PATTERNS.some((pattern) => pattern.test(step.trim()))).length;
}

function validateTitleIngredientPromises(recipe: RecipeCatalogDoc, instructions: string) {
  const promisedProfiles = getTitleIngredientProfiles(recipe.title);
  if (!promisedProfiles.length) return [];

  const recipeIngredientIds = new Set(
    [...recipe.ingredientCanonicals, ...recipe.ingredients.flatMap((ingredient) => [ingredient.canonical, ingredient.name])]
      .map((ingredient) => getIngredientProfileForTerm(ingredient)?.id)
      .filter((id): id is string => Boolean(id))
  );
  const normalizedInstructions = normalizeIngredientText(instructions);
  const reasons: string[] = [];

  for (const profile of promisedProfiles) {
    if (!recipeIngredientIds.has(profile.id)) {
      reasons.push(`title_ingredient_missing:${profile.id}`);
      continue;
    }
    const instructionSignals = [
      profile.id.replace(/_/g, " "),
      profile.canonicalEnglishName,
      ...profile.aliases.slice(0, 4)
    ].map((value) => normalizeIngredientText(value)).filter(Boolean);
    if (!instructionSignals.some((signal) => normalizedInstructions.includes(signal))) {
      reasons.push(`title_ingredient_not_used:${profile.id}`);
    }
  }

  return reasons;
}

function getTitleIngredientProfiles(title: string) {
  const tokens = normalizeIngredientText(title).split(" ").filter(Boolean);
  const profiles = new Map<string, NonNullable<ReturnType<typeof getIngredientProfileForExactTerm>>>();

  for (let size = Math.min(3, tokens.length); size >= 1; size -= 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      const phrase = tokens.slice(index, index + size).join(" ");
      const profile = getIngredientProfileForExactTerm(phrase);
      if (profile) profiles.set(profile.id, profile);
    }
  }

  return Array.from(profiles.values());
}

export function selectDiscoverableRecipeCatalog(recipes: RecipeCatalogDoc[]) {
  return partitionRecipeCatalogByQuality(recipes).discoverable;
}

export function partitionRecipeCatalogByQuality(recipes: RecipeCatalogDoc[]): RecipeCatalogQualityPartition {
  const discoverable: RecipeCatalogDoc[] = [];
  const quarantined: RecipeCatalogQualityPartition["quarantined"] = [];

  for (const recipe of recipes) {
    if (!recipe.isActive) {
      quarantined.push({
        recipe,
        quality: result("blocked", ["inactive_recipe"], 0)
      });
      continue;
    }
    const quality = classifyRecipeContentQuality(recipe);
    if (!quality.eligibleForDiscovery) {
      quarantined.push({ recipe, quality });
      continue;
    }
    discoverable.push({
      ...recipe,
      contentVersion: quality.contentVersion,
      qualityReasons: quality.reasons,
      qualityScore: Math.max(recipe.qualityScore, quality.score),
      qualityStatus: quality.status
    });
  }

  return { discoverable, quarantined };
}

function validateTitleMethodPromises(title: string, instructions: string) {
  const normalizedTitle = normalizeIngredientText(title);
  const reasons: string[] = [];

  if (/\b(?:grilled|chargrilled|barbecued)\b/.test(normalizedTitle) && !/\b(?:grill|barbecue|bbq|char)\b/i.test(instructions)) {
    reasons.push("title_method_mismatch:grill");
  }
  if (/\b(?:baked|roasted|casserole)\b/.test(normalizedTitle) && !/\b(?:bake|roast|oven)\b/i.test(instructions)) {
    reasons.push("title_method_mismatch:bake");
  }
  if (/\b(?:fried|crispy|breaded)\b/.test(normalizedTitle)) {
    if (!/\b(?:fry|fried|air-fry|air fry|bake)\b/i.test(instructions)) reasons.push("title_method_mismatch:fry");
    if (/\bbreaded\b/.test(normalizedTitle) && !/\b(?:coat|bread|crumb|flour|panko|batter)\b/i.test(instructions)) {
      reasons.push("missing_breading_process");
    }
  }
  if (/\b(?:stew|braised)\b/.test(normalizedTitle) && !/\b(?:stew|braise|simmer|low heat)\b/i.test(instructions)) {
    reasons.push("title_method_mismatch:stew");
  }
  if (/\bsoup\b/.test(normalizedTitle) && !/\b(?:boil|broth|stock|simmer)\b/i.test(instructions)) {
    reasons.push("title_method_mismatch:soup");
  }

  return reasons;
}

function validatePrimaryIngredientUsage(recipe: RecipeCatalogDoc, instructions: string) {
  const normalizedInstructions = normalizeIngredientText(instructions);
  const primaryIngredients = recipe.requiredCanonicals.slice(0, 2);
  if (!primaryIngredients.length) return ["missing_primary_ingredient_identity"];

  return primaryIngredients.flatMap((ingredient) => {
    const normalized = normalizeIngredientText(ingredient);
    if (!normalized || isPantryStaple(normalized)) return [];
    const profile = getIngredientProfileForTerm(normalized);
    const reduced = normalized
      .split(" ")
      .filter((token) => !/^(?:boneless|cleaned|firm|fresh|ground|lean|large|medium|minced|skinless|small|thai|whole)$/.test(token))
      .join(" ");
    const ingredientTokens = normalized.split(" ").filter(Boolean);
    const nounPhrase = ingredientTokens.length >= 3 ? ingredientTokens.slice(-2).join(" ") : "";
    const terms = new Set([
      normalized,
      normalized.replace(/_/g, " "),
      reduced,
      nounPhrase,
      profile?.id.replace(/_/g, " ") ?? "",
      profile?.canonicalEnglishName ?? ""
    ].map(normalizeIngredientText).filter(Boolean));
    return Array.from(terms).some((term) => normalizedInstructions.includes(term))
      ? []
      : [`primary_ingredient_not_used:${normalized.replace(/\s+/g, "_")}`];
  });
}

function isPantryStaple(value: string) {
  return /^(?:black pepper|butter|flour|garlic|oil|olive oil|salt|spice|spices|water)$/.test(value);
}

function hasUsableQuantityAndUnit(ingredient: RecipeCatalogDoc["ingredients"][number]) {
  const quantity = Number(ingredient.quantity);
  return Number.isFinite(quantity) && quantity > 0 && Boolean(ingredient.unit?.trim());
}

function normalizeSteps(steps: unknown) {
  return Array.isArray(steps)
    ? steps.map((step) => typeof step === "string" ? step.trim() : "").filter(Boolean)
    : [];
}

function hasUnsafeInstructions(steps: string[]) {
  return UNSAFE_INSTRUCTION_PATTERN.test(steps.join(" "));
}

function calculateScore(reasons: string[]) {
  const penalties: Record<string, number> = {
    generic_instruction_language: 35,
    insufficient_instruction_detail: 25,
    insufficient_instruction_steps: 25,
    insufficient_ingredients: 30,
    missing_heat_or_equipment_detail: 10,
    insufficient_ingredient_quantities: 25,
    missing_preparation_detail: 12,
    missing_recipe_title: 40,
    missing_time_or_doneness_detail: 15,
    missing_verifiable_source: 20
  };
  const penalty = reasons.reduce((total, reason) => {
    const direct = penalties[reason];
    if (direct != null) return total + direct;
    if (reason.startsWith("title_method_mismatch")) return total + 25;
    if (reason.startsWith("primary_ingredient_not_used")) return total + 20;
    return total + 10;
  }, 0);
  return Math.max(0, 90 - penalty);
}

function result(status: RecipeQualityStatus, reasons: string[], score: number): RecipeContentQualityResult {
  return {
    contentVersion: RECIPE_CONTENT_VERSION,
    eligibleForDiscovery: status === "golden" || status === "verified",
    reasons: Array.from(new Set(reasons)),
    score,
    status
  };
}
