import type { RecipeCatalogDoc, RecipeValidationReceipt } from "@/lib/domain";

export const PREMIUM_RECIPE_VALIDATOR_HASH = "premium-recipe-acceptance-v2:2026-08-14";
export const MINIMUM_PREMIUM_ACCEPTANCE_SCORE = 70;

const CANONICAL_MEASUREMENT_FRAGMENT = /^(?:\d+(?:\.\d+)?|(?:\d+\s+)?\d+\s*\/\s*\d+)(?:$|\s+(?:cups?|tablespoons?|tbsp|teaspoons?|tsp|grams?|g|kilograms?|kg|ounces?|oz|pounds?|lbs?|milliliters?|ml|liters?|l|cans?|jars?|packages?|packs?|bags?|bunches?|cloves?|fillets?|pieces?|slices?|whole|pinches?|dashes?|handfuls?|portions?|servings?)\b)/i;

const IDENTITY_DIET_TAGS = new Set([
  "dairy-free",
  "gluten-free",
  "pescatarian",
  "vegan",
  "vegetarian"
]);

export function createPremiumRecipeValidationReceipt(
  recipe: RecipeCatalogDoc,
  input: {
    acceptanceScore: number;
    acceptanceReasons?: string[];
    acceptedAt?: number;
  }
): RecipeValidationReceipt | null {
  if (!Number.isFinite(input.acceptanceScore) || input.acceptanceScore < MINIMUM_PREMIUM_ACCEPTANCE_SCORE) {
    return null;
  }
  if (!hasPublicationSafeCanonicalIngredients(recipe)) return null;

  return {
    profile: "premium",
    acceptanceScore: input.acceptanceScore,
    acceptanceReasons: dedupeStrings(input.acceptanceReasons ?? []),
    acceptedAt: input.acceptedAt ?? Date.now(),
    contentFingerprint: buildRecipeCatalogContentFingerprint(recipe),
    validatorHash: PREMIUM_RECIPE_VALIDATOR_HASH
  };
}

export function hasPublicationSafeCanonicalIngredients(recipe: RecipeCatalogDoc) {
  if (!recipe.ingredientCanonicals.length) return false;
  const ingredientSet = new Set(recipe.ingredientCanonicals.map((canonical) => canonical.trim()));
  const allCanonicals = [
    ...recipe.ingredientCanonicals,
    ...recipe.requiredCanonicals,
    ...recipe.optionalCanonicals
  ];

  return allCanonicals.every((canonical) => {
    const normalized = canonical.trim();
    if (!normalized || CANONICAL_MEASUREMENT_FRAGMENT.test(normalized)) return false;
    return ingredientSet.has(normalized);
  });
}

export function hasCurrentPremiumValidationReceipt(recipe: RecipeCatalogDoc) {
  const receipt = recipe.validationReceipt;
  return Boolean(
    receipt &&
      receipt.profile === "premium" &&
      receipt.validatorHash === PREMIUM_RECIPE_VALIDATOR_HASH &&
      Number.isFinite(receipt.acceptanceScore) &&
      receipt.acceptanceScore >= MINIMUM_PREMIUM_ACCEPTANCE_SCORE &&
      receipt.contentFingerprint === buildRecipeCatalogContentFingerprint(recipe)
  );
}

export function buildRecipeCatalogContentFingerprint(recipe: RecipeCatalogDoc) {
  const english = recipe.localized?.English;
  const payload = {
    calories: numberOrZero(recipe.calories),
    carbs: numberOrZero(recipe.carbs),
    cuisine: normalizeText(recipe.cuisine),
    fat: numberOrZero(recipe.fat),
    ingredients: [...recipe.ingredientCanonicals].map(normalizeText).filter(Boolean).sort(),
    optional: [...recipe.optionalCanonicals].map(normalizeText).filter(Boolean).sort(),
    protein: numberOrZero(recipe.protein),
    required: [...recipe.requiredCanonicals].map(normalizeText).filter(Boolean).sort(),
    steps: (english?.steps?.length ? english.steps : recipe.steps).map(normalizeText).filter(Boolean),
    title: normalizeText(english?.name ?? recipe.title)
  };

  return `recipe-${hashString(stableStringify(payload))}`;
}

export function buildSharedRecipeIdentityKey(recipe: RecipeCatalogDoc) {
  const english = recipe.localized?.English;
  const dishIdentity =
    english?.name ||
    recipe.title ||
    english?.dish_identity ||
    english?.dish_intent?.dish_name ||
    recipe.dishIntent?.dish_name ||
    "recipe";
  const dietVariant = recipe.dietTags
    .map(normalizeText)
    .filter((tag) => IDENTITY_DIET_TAGS.has(tag))
    .sort()
    .join("+") || "standard";

  return [slugify(recipe.cuisine) || "unknown", slugify(dishIdentity) || "recipe", dietVariant].join("|");
}

export function buildSharedRecipeIdFromIdentity(identityKey: string) {
  return `shared-premium-${hashString(identityKey)}`;
}

export function shouldReplaceSharedRecipeVersion(
  existing: RecipeCatalogDoc | undefined,
  incoming: RecipeCatalogDoc
) {
  if (!existing) return true;
  const incomingPremium = hasCurrentPremiumValidationReceipt(incoming);
  const existingPremium = hasCurrentPremiumValidationReceipt(existing);
  if (incomingPremium !== existingPremium) return incomingPremium;

  const incomingPhotoReady = incoming.image.status === "ready" && Boolean(incoming.image.thumbPath || incoming.image.storagePath);
  const existingPhotoReady = existing.image.status === "ready" && Boolean(existing.image.thumbPath || existing.image.storagePath);
  if (incomingPhotoReady !== existingPhotoReady) return incomingPhotoReady;

  const incomingScore = incoming.validationReceipt?.acceptanceScore ?? incoming.qualityScore ?? 0;
  const existingScore = existing.validationReceipt?.acceptanceScore ?? existing.qualityScore ?? 0;
  if (incomingScore !== existingScore) return incomingScore > existingScore;

  const incomingCompleteness = incoming.steps.length * 3 + incoming.ingredientCanonicals.length;
  const existingCompleteness = existing.steps.length * 3 + existing.ingredientCanonicals.length;
  if (incomingCompleteness !== existingCompleteness) return incomingCompleteness > existingCompleteness;

  return incoming.updatedAt >= existing.updatedAt;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeText(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
}

function slugify(value: string) {
  return normalizeText(value).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}

function numberOrZero(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
