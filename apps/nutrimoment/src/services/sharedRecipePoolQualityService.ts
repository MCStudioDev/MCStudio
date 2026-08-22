import type { RecipeCatalogDoc } from "@/lib/domain";
import {
  classifyRecipeContentQuality,
  RECIPE_CONTENT_VERSION
} from "@/services/recipeContentQualityService";
import { canonicalizeRecipeIdentityMetadata } from "@/services/recipeIdentityContractService";
import { hasCurrentPremiumValidationReceipt } from "@/services/recipeValidationContractService";

export const SHARED_RECIPE_VALIDATOR_HASH = "recipe-content-v2:identity-pure:diet-v5:compact-ingredients:alias-index:2026-08-14";

export type SharedRecipeQualityEnforcementMode = "gate" | "observe" | "strict";

export interface SharedRecipePoolAuditResult {
  action: "keep" | "update";
  document: RecipeCatalogDoc;
  previousStatus: RecipeCatalogDoc["qualityStatus"];
}

export function auditSharedRecipePoolDocument(
  source: RecipeCatalogDoc,
  validatedAt = Date.now()
): SharedRecipePoolAuditResult {
  const canonical = canonicalizeSharedRecipeDerivedIdentity(source);
  const quality = classifyRecipeContentQuality(canonical);
  const untrustedProvenance = hasUntrustedSharedPoolProvenance(canonical);
  const premiumValidated =
    canonical.source?.provider === "premium-validated" &&
    hasCurrentPremiumValidationReceipt(canonical);
  const premiumPublicationEligible =
    premiumValidated &&
    quality.status !== "blocked" &&
    quality.status !== "dish_intent";
  const qualityReasons = Array.from(new Set([
    ...quality.reasons,
    ...(untrustedProvenance ? ["untrusted_shared_pool_provenance"] : [])
  ]));
  const qualityStatus = premiumPublicationEligible
    ? "verified"
    : untrustedProvenance && (quality.status === "golden" || quality.status === "verified")
      ? "probation"
      : quality.status;
  const document: RecipeCatalogDoc = {
    ...canonical,
    ...deriveRecipeComplianceTags(canonical),
    contentVersion: quality.contentVersion,
    publicationWarnings: premiumPublicationEligible ? quality.reasons : canonical.publicationWarnings,
    qualityReasons: premiumPublicationEligible ? [] : qualityReasons,
    qualityScore: premiumPublicationEligible
      ? Math.max(quality.score, canonical.validationReceipt?.acceptanceScore ?? 0)
      : untrustedProvenance
        ? Math.min(quality.score, 60)
        : quality.score,
    qualityStatus,
    validatedAt,
    validatorHash: SHARED_RECIPE_VALIDATOR_HASH
  };

  return {
    action: sameDocument(source, document) ? "keep" : "update",
    document,
    previousStatus: source.qualityStatus
  };
}

export function deriveRecipeComplianceTags(recipe: RecipeCatalogDoc) {
  const recipeSignals = new Set(
    [
      recipe.title,
      recipe.description,
      recipe.dishIntent?.dish_name ?? "",
      ...recipe.steps,
      ...recipe.ingredientCanonicals,
      ...recipe.ingredients.flatMap((ingredient) => [ingredient.canonical, ingredient.name])
    ].map(normalizeTagText).filter(Boolean)
  );
  const contains = (pattern: RegExp) => Array.from(recipeSignals).some((signal) => pattern.test(signal));
  const hasMeat = contains(/\b(?:bacon|beef|chicken|chorizo|duck|goat|ham|hot dog|kielbasa|lamb|lard|meat|meatball|mutton|pancetta|pepperoni|pork|prosciutto|salami|sausage|turkey|veal)\b/);
  const hasSeafood = contains(/\b(?:anchovy|clam|cod|crab|fish|lobster|mussel|oyster|salmon|seafood|shrimp|tuna)\b/);
  const hasDairy = contains(/\b(?:butter|cheese|cream|dairy|ghee|milk|yogurt)\b/);
  const hasEgg = contains(/\b(?:egg|eggs|mayonnaise|mayo)\b/);
  const hasNonVegetarianAnimalProduct = contains(/\b(?:gelatin|lard)\b/);
  const hasNonVeganAnimalProduct = hasNonVegetarianAnimalProduct || contains(/\b(?:honey)\b/);
  const hasGluten = contains(/\b(?:barley|bread|bulgur|couscous|flour|pasta|rye|semolina|wheat)\b/);
  const hasShellfish = contains(/\b(?:clam|crab|lobster|mussel|oyster|shrimp)\b/);
  const hasTreeNuts = contains(/\b(?:almond|cashew|hazelnut|pecan|pistachio|walnut)\b/);
  const hasPeanut = contains(/\b(?:peanut|groundnut)\b/);
  const hasSoy = contains(/\b(?:soy|soya|tofu|tempeh)\b/);

  const dietTags = new Set<string>();
  if (!hasMeat && !hasSeafood && !hasDairy && !hasEgg && !hasNonVeganAnimalProduct) dietTags.add("vegan");
  if (!hasMeat && !hasSeafood && !hasNonVegetarianAnimalProduct) dietTags.add("vegetarian");
  if (!hasMeat && hasSeafood) dietTags.add("pescatarian");
  if (!hasDairy) dietTags.add("dairy-free");
  if (!hasGluten) dietTags.add("gluten-free");
  if (Number(recipe.protein) >= 25) dietTags.add("high-protein");
  if (Number(recipe.carbs) <= 25) dietTags.add("low-carb");
  if (Number(recipe.carbs) <= 20) dietTags.add("keto");

  const allergenTags = new Set<string>();
  if (hasDairy) allergenTags.add("dairy");
  if (hasEgg) allergenTags.add("egg");
  if (hasGluten) allergenTags.add("gluten");
  if (hasShellfish) allergenTags.add("shellfish");
  if (hasTreeNuts) allergenTags.add("tree-nuts");
  if (hasPeanut) allergenTags.add("peanut");
  if (hasSoy) allergenTags.add("soy");

  return {
    allergenTags: Array.from(allergenTags).sort(),
    dietTags: Array.from(dietTags).sort()
  };
}

export function isSharedRecipeDiscoverable(
  recipe: RecipeCatalogDoc,
  mode: SharedRecipeQualityEnforcementMode
) {
  if (!recipe.isActive) return false;
  if (recipe.qualityStatus === "blocked" || recipe.qualityStatus === "dish_intent") return false;

  const hasCurrentValidation =
    recipe.contentVersion === RECIPE_CONTENT_VERSION &&
    recipe.validatorHash === SHARED_RECIPE_VALIDATOR_HASH;

  if (mode === "observe") return true;
  if (mode === "gate") {
    return !hasCurrentValidation || recipe.qualityStatus === "golden" || recipe.qualityStatus === "verified";
  }
  return hasCurrentValidation && (recipe.qualityStatus === "golden" || recipe.qualityStatus === "verified");
}

export function isSharedRecipePublishable(recipe: RecipeCatalogDoc) {
  return !hasUntrustedSharedPoolProvenance(recipe) && isSharedRecipeDiscoverable(recipe, "strict");
}

export function resolveSharedRecipeQualityMode(value: string | undefined): SharedRecipeQualityEnforcementMode {
  if (value === "observe" || value === "gate") return value;
  return "strict";
}

function hasUntrustedSharedPoolProvenance(recipe: RecipeCatalogDoc) {
  return recipe.source?.provider === "shared-user-cache" || recipe.source?.provider === "shared-backfill";
}

function canonicalizeSharedRecipeDerivedIdentity(source: RecipeCatalogDoc): RecipeCatalogDoc {
  const english = source.localized?.English;
  if (!english) return source;

  const canonicalEnglish = canonicalizeRecipeIdentityMetadata(english);
  return {
    ...source,
    dishIntent: canonicalEnglish.dish_intent,
    image: {
      ...source.image,
      sourceQuery: canonicalEnglish.image_search_index ?? source.image.sourceQuery
    },
    localized: {
      ...(source.localized ?? {}),
      English: canonicalEnglish
    },
    searchTokens: Array.from(new Set([
      ...source.searchTokens,
      canonicalEnglish.name,
      canonicalEnglish.dish_identity ?? "",
      ...(canonicalEnglish.image_search_indices ?? [])
    ].filter(Boolean)))
  };
}

function sameDocument(left: RecipeCatalogDoc, right: RecipeCatalogDoc) {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeTagText(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
