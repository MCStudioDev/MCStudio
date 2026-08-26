import type { RecipeCatalogDoc } from "@/lib/domain";
import type { Recipe } from "@/lib/types";
import {
  IngredientNormalizer,
  getIngredientProfileForTerm,
  normalizeIngredientText
} from "@/food/IngredientNormalizer";

const ingredientNormalizer = new IngredientNormalizer();

const LOW_SIGNAL_INGREDIENT_IDS = new Set([
  "black_pepper",
  "cooking_oil",
  "juice",
  "oil",
  "salt",
  "water"
]);

const PROTEIN_FAMILY_BY_ID: Record<string, string> = {
  beef: "beef",
  ground_beef: "beef",
  chicken: "chicken",
  duck: "duck",
  egg: "egg",
  fish: "fish",
  grouper: "fish",
  lamb: "lamb",
  liver: "liver",
  pork: "pork",
  salmon: "fish",
  shrimp: "shrimp",
  tuna: "fish",
  turkey: "turkey"
};

const PROTEIN_TERMS: Array<{ family: string; terms: string[] }> = [
  { family: "chicken", terms: ["chicken", "poultry", "دجاج", "فراخ"] },
  { family: "beef", terms: ["beef", "steak", "veal", "ground beef", "ground meat", "meatloaf", "لحم بقري", "ستيك", "لحم مفروم"] },
  { family: "lamb", terms: ["lamb", "mutton", "adana kebab", "لحم ضان", "لحم غنم"] },
  {
    family: "pork",
    terms: [
      "pork",
      "ham",
      "bacon",
      "prosciutto",
      "sparerib",
      "spareribs",
      "pork rib",
      "pork ribs",
      "pepperoni",
      "\u062e\u0646\u0632\u064a\u0631",
      "\u0644\u062d\u0645 \u062e\u0646\u0632\u064a\u0631",
      "\u0644\u062d\u0645 \u0627\u0644\u062e\u0646\u0632\u064a\u0631"
    ]
  },
  { family: "turkey", terms: ["turkey", "ديك رومي"] },
  { family: "duck", terms: ["duck", "بط"] },
  { family: "fish", terms: ["fish", "grouper", "salmon", "tuna", "cod", "tilapia", "sea bass", "clam", "clams", "crab", "lobster", "mussel", "mussels", "oyster", "oysters", "scallop", "scallops", "سمك", "سلمون", "تونة"] },
  { family: "shrimp", terms: ["shrimp", "prawn", "tom yum goong", "جمبري", "روبيان"] },
  { family: "liver", terms: ["liver", "كبدة", "كبده"] },
  { family: "egg", terms: ["egg", "eggs", "shakshuka", "omelette", "frittata", "menemen", "بيض", "شكشوكة"] }
];

PROTEIN_TERMS.push({ family: "shrimp", terms: ["scampi"] });
PROTEIN_TERMS.push({
  family: "fish",
  terms: ["halibut", "haddock", "mahi mahi", "snapper", "swordfish", "trout"]
});

export interface RecipePrimaryIngredientCompatibility {
  compatible: boolean;
  incompatibleProteinFamilies: string[];
  incompatibleProteinEvidence: string[];
  reason: "compatible" | "requested_primary_protein_missing" | "requested_protein_form_mismatch" | "unrequested_primary_protein";
  requestedProteinFamilies: string[];
  recipeProteinFamilies: string[];
}

export interface RecipeIngredientEvidence {
  compatible: boolean;
  reason: "compatible" | "no_meaningful_ingredient_match";
  matchedIngredientIds: string[];
}

export function createRecipeIngredientCompatibilityEvaluator(availableIngredients: string[]) {
  const normalizedRequestedIngredients = ingredientNormalizer.normalize(availableIngredients);
  const meaningfulRequestedIngredients = normalizedRequestedIngredients
    .filter((ingredient) => !LOW_SIGNAL_INGREDIENT_IDS.has(ingredient.id));
  const requestedProteinFamilies = Array.from(new Set(
    normalizedRequestedIngredients
      .map((ingredient) => proteinFamilyForId(ingredient.id))
      .filter((family): family is string => Boolean(family))
  )).sort();
  const requiresProteinOnEveryRecipe = requestedProteinFamilies.length > 0 &&
    meaningfulRequestedIngredients.every((ingredient) => Boolean(proteinFamilyForId(ingredient.id)));
  const requestedProteinFormConstraints = detectRequestedProteinFormConstraints(availableIngredients);

  return {
    evaluateEvidence(recipe: RecipeCatalogDoc | Recipe): RecipeIngredientEvidence {
      return evaluateRecipeIngredientEvidenceWithContext(recipe, meaningfulRequestedIngredients);
    },
    evaluatePrimary(recipe: RecipeCatalogDoc | Recipe): RecipePrimaryIngredientCompatibility {
      const proteinProfile = detectRecipeProteinProfile(recipe);
      const selectedOptionalFamilies = proteinProfile.optionalFamilies
        .filter((family) => requestedProteinFamilies.includes(family));
      const recipeProteinFamilies = Array.from(new Set([
        ...proteinProfile.mandatoryFamilies,
        ...selectedOptionalFamilies
      ])).sort();
      const incompatibleFamilies = proteinProfile.dominantFamilies
        .filter((family) => !requestedProteinFamilies.includes(family));
      const incompatibleProteinEvidence = proteinProfile.dominantEvidence
        .filter((entry) => incompatibleFamilies.includes(entry.family))
        .map((entry) => entry.value)
        .filter((value, index, values) => values.indexOf(value) === index);
      const requestedProteinMissing = requiresProteinOnEveryRecipe &&
        !recipeProteinFamilies.some((family) => requestedProteinFamilies.includes(family));
      const recipeFamilies = new Set([
        ...recipeProteinFamilies,
        ...proteinProfile.dominantFamilies
      ]);
      const requestedProteinFormMismatch = requestedProteinFormConstraints.some((constraint) =>
        recipeFamilies.has(constraint.family) &&
        constraint.detectRecipeForm(recipe) !== constraint.form
      );
      const compatible = incompatibleFamilies.length === 0 && !requestedProteinMissing && !requestedProteinFormMismatch;
      return {
        compatible,
        incompatibleProteinFamilies: incompatibleFamilies,
        incompatibleProteinEvidence,
        reason: incompatibleFamilies.length
          ? "unrequested_primary_protein"
          : requestedProteinMissing
            ? "requested_primary_protein_missing"
            : requestedProteinFormMismatch
              ? "requested_protein_form_mismatch"
            : "compatible",
        requestedProteinFamilies,
        recipeProteinFamilies
      };
    }
  };
}

interface ProteinFormConstraint {
  detectRecipeForm: (recipe: RecipeCatalogDoc | Recipe) => string | null;
  family: string;
  form: string;
}

interface ProteinFormRule {
  detectRecipeForm: (recipe: RecipeCatalogDoc | Recipe) => string | null;
  detectRequestedForm: (ingredients: string[]) => string | null;
  family: string;
}

const PROTEIN_FORM_RULES: ProteinFormRule[] = [
  {
    detectRecipeForm: detectRecipeBeefForm,
    detectRequestedForm: detectRequestedBeefForm,
    family: "beef"
  }
];

function detectRequestedProteinFormConstraints(ingredients: string[]): ProteinFormConstraint[] {
  return PROTEIN_FORM_RULES.flatMap((rule) => {
    const form = rule.detectRequestedForm(ingredients);
    return form ? [{ detectRecipeForm: rule.detectRecipeForm, family: rule.family, form }] : [];
  });
}

export function hasExclusiveRequestedProteinForm(ingredients: string[], family: string) {
  const requestedFamilies = detectRequestedProteinFamilies(ingredients);
  return requestedFamilies.length === 1 &&
    requestedFamilies[0] === family &&
    detectRequestedProteinFormConstraints(ingredients).some((constraint) => constraint.family === family);
}

type BeefForm = "ground" | "steak";

function detectRequestedBeefForm(ingredients: string[]): BeefForm | null {
  const normalizedIngredients = ingredients.map(normalizeIngredientText).filter(Boolean);
  const groundPattern = /\b(?:ground|minced|mince|hamburger)\s+(?:beef|meat)\b|\bbeef\s+(?:mince|minced|ground)\b/;
  const steakPattern = /\b(?:steak|sirloin|ribeye|rib eye|strip steak|tenderloin|filet mignon|flank steak|skirt steak)\b/;
  const hasGroundRequest = normalizedIngredients.some((ingredient) => groundPattern.test(ingredient));
  const hasSteakRequest = normalizedIngredients.some((ingredient) => steakPattern.test(ingredient));
  const hasBroadBeefRequest = normalizedIngredients.some((ingredient) =>
    /\b(?:beef|meat|veal)\b/.test(ingredient) &&
    !groundPattern.test(ingredient) &&
    !steakPattern.test(ingredient)
  );

  // A broad beef item alongside a specific form means the pantry can support
  // both forms. Only an exclusive form request should filter the other form.
  if (hasBroadBeefRequest || (hasGroundRequest && hasSteakRequest)) return null;
  if (hasGroundRequest) return "ground";
  if (hasSteakRequest) return "steak";
  return null;
}

function detectRecipeBeefForm(recipe: RecipeCatalogDoc | Recipe): BeefForm | null {
  const identityValues = "requiredCanonicals" in recipe
    ? [
        recipe.title,
        recipe.description,
        recipe.dishIntent?.dish_name ?? ""
      ]
    : [
        recipe.name,
        recipe.dish_identity ?? "",
        recipe.dish_intent?.dish_name ?? ""
      ];
  const ingredientValues = "requiredCanonicals" in recipe
    ? [
        ...recipe.requiredCanonicals,
        ...recipe.ingredients.flatMap((ingredient) => [ingredient.canonical, ingredient.name])
      ]
    : [...recipe.ingredients, ...recipe.missing_ingredients];
  const identity = identityValues.map(normalizeIngredientText).join(" ");
  const ingredients = ingredientValues.map(normalizeIngredientText).join(" ");
  const groundBeefIngredient = /\b(?:ground|minced|mince|hamburger)\s+(?:beef|meat)\b|\bbeef\s+(?:mince|minced|ground)\b/;
  if (/\b(?:meatballs?|meatloaf|kofta|kofte|beef burger|hamburger)\b/.test(identity) || groundBeefIngredient.test(ingredients)) {
    return "ground";
  }
  const steakForm = /\b(?:steak|sirloin|ribeye|rib eye|strip steak|tenderloin|filet mignon|flank steak|skirt steak|carne asada|churrasco|bistecca|london broil|tagliata)\b/;
  if (steakForm.test(identity) || steakForm.test(ingredients)) return "steak";
  return null;
}

/**
 * Catalog entries can describe authentic protein variants, such as shrimp or
 * chicken fried rice. Keep only the requested optional protein variant when
 * mapping that entry to a card; mandatory recipe proteins are never replaced.
 */
export function specializeCatalogRecipeForRequestedProteins(
  recipe: RecipeCatalogDoc,
  availableIngredients: string[]
): RecipeCatalogDoc {
  const requestedFamilies = detectRequestedProteinFamilies(availableIngredients);
  if (!requestedFamilies.length) return recipe;

  const profile = detectRecipeProteinProfile(recipe);
  const selectedOptionalFamilies = profile.optionalFamilies
    .filter((family) => requestedFamilies.includes(family));
  const mandatoryHasRequestedFamily = profile.mandatoryFamilies
    .some((family) => requestedFamilies.includes(family));
  if (mandatoryHasRequestedFamily || !selectedOptionalFamilies.length) return recipe;

  const removedCanonicals = new Set(
    recipe.optionalCanonicals.filter((canonical) => {
      const families = detectProteinFamilies([canonical]);
      return families.length > 0 &&
        !families.some((family) => selectedOptionalFamilies.includes(family)) &&
        familyIsSelectablePrimary(families);
    })
  );
  if (!removedCanonicals.size) return recipe;

  const optionalCanonicals = recipe.optionalCanonicals
    .filter((canonical) => !removedCanonicals.has(canonical));
  const ingredients = recipe.ingredients
    .filter((ingredient) => !removedCanonicals.has(ingredient.canonical));
  const ingredientCanonicals = recipe.ingredientCanonicals
    .filter((canonical) => !removedCanonicals.has(canonical));
  const steps = recipe.steps.map((step) => removeAlternativeIngredientsFromText(step, removedCanonicals));

  return {
    ...recipe,
    ingredients,
    ingredientCanonicals,
    optionalCanonicals,
    steps
  };
}

export function evaluateRecipeIngredientEvidence(
  recipe: RecipeCatalogDoc | Recipe,
  availableIngredients: string[]
): RecipeIngredientEvidence {
  return createRecipeIngredientCompatibilityEvaluator(availableIngredients).evaluateEvidence(recipe);
}

function evaluateRecipeIngredientEvidenceWithContext(
  recipe: RecipeCatalogDoc | Recipe,
  requested: ReturnType<IngredientNormalizer["normalize"]>
): RecipeIngredientEvidence {
  if (!requested.length) {
    return { compatible: true, reason: "compatible", matchedIngredientIds: [] };
  }

  const recipeValues = "requiredCanonicals" in recipe
    ? [
        recipe.title,
        recipe.description,
        ...recipe.requiredCanonicals,
        ...recipe.optionalCanonicals,
        ...recipe.ingredients.flatMap((ingredient) => [ingredient.canonical, ingredient.name])
      ]
    : [
        recipe.name,
        recipe.dish_identity ?? "",
        recipe.dish_intent?.dish_name ?? "",
        ...recipe.ingredients,
        ...recipe.missing_ingredients
      ];
  const normalizedRecipeValues = recipeValues.map(normalizeIngredientText).filter(Boolean);
  const recipeUsesGenericMeat = "requiredCanonicals" in recipe &&
    recipe.requiredCanonicals.some((canonical) => /^(?:ground )?meat$/i.test(normalizeIngredientText(canonical)));
  const matchedIngredientIds = requested
    .filter((ingredient) =>
      ingredient.aliases.some((alias) =>
        normalizedRecipeValues.some((value) => containsPhrase(value, alias.term))
      ) ||
      (recipeUsesGenericMeat && ["beef", "ground_beef", "lamb"].includes(ingredient.id))
    )
    .map((ingredient) => ingredient.id)
    .filter((id, index, ids) => ids.indexOf(id) === index);

  return {
    compatible: matchedIngredientIds.length > 0,
    reason: matchedIngredientIds.length ? "compatible" : "no_meaningful_ingredient_match",
    matchedIngredientIds
  };
}

export function evaluateRecipePrimaryIngredientCompatibility(
  recipe: RecipeCatalogDoc | Recipe,
  availableIngredients: string[]
): RecipePrimaryIngredientCompatibility {
  return createRecipeIngredientCompatibilityEvaluator(availableIngredients).evaluatePrimary(recipe);
}

export function filterPrimaryIngredientCompatibleRecipes<T extends RecipeCatalogDoc | Recipe>(
  recipes: T[],
  availableIngredients: string[]
) {
  return recipes.filter((recipe) => evaluateRecipePrimaryIngredientCompatibility(recipe, availableIngredients).compatible);
}

function detectRecipeProteinProfile(recipe: RecipeCatalogDoc | Recipe) {
  const canonicalIdentityValues = "requiredCanonicals" in recipe
    ? [recipe.title]
    : [
        recipe.name,
        recipe.dish_identity ?? ""
      ];
  const identityValues = canonicalIdentityValues;
  const identityFamilies = detectProteinFamilies(identityValues);
  const requiredValues = "requiredCanonicals" in recipe
    ? recipe.requiredCanonicals
    : [...recipe.ingredients, ...recipe.missing_ingredients];
  const requiredFamilies = detectProteinFamilies(requiredValues);
  const optionalFamilies = "requiredCanonicals" in recipe
    ? detectProteinFamilies(recipe.optionalCanonicals)
    : [];
  const nonEggIdentityFamilies = identityFamilies.filter((family) => family !== "egg");
  const eggIsDishIdentity = identityFamilies.includes("egg") && nonEggIdentityFamilies.length === 0;
  const dominantFamilies = Array.from(new Set([
    ...nonEggIdentityFamilies,
    ...requiredFamilies.filter((family) => family !== "egg"),
    ...(eggIsDishIdentity ? ["egg"] : [])
  ])).sort();
  const dominantEvidence = [...identityValues, ...requiredValues]
    .flatMap((value) => detectProteinFamilies([value])
      .filter((family) => dominantFamilies.includes(family))
      .map((family) => ({ family, value })))
    .filter((entry) => entry.value.trim());

  return {
    mandatoryFamilies: Array.from(new Set([...identityFamilies, ...requiredFamilies])).sort(),
    dominantEvidence,
    dominantFamilies,
    optionalFamilies
  };
}

function detectProteinFamilies(values: string[]) {
  const families = new Set<string>();
  for (const value of values) {
    const normalized = removeNonPrimaryProteinTerms(normalizeIngredientText(value));
    if (!normalized) continue;
    const profile = getIngredientProfileForTerm(normalized);
    const profileFamily = proteinFamilyForId(profile?.id);
    if (profileFamily) families.add(profileFamily);

    for (const entry of PROTEIN_TERMS) {
      if (entry.terms.some((term) => containsPhrase(normalized, normalizeIngredientText(term)))) {
        families.add(entry.family);
      }
    }
  }
  return Array.from(families).sort();
}

function detectRequestedProteinFamilies(ingredients: string[]) {
  const normalized = ingredientNormalizer.normalize(ingredients);
  return Array.from(new Set(
    normalized
      .map((ingredient) => proteinFamilyForId(ingredient.id))
      .filter((family): family is string => Boolean(family))
  )).sort();
}

function removeNonPrimaryProteinTerms(value: string) {
  return value
    .replace(/\b(?:beef|calf|calves|chicken|duck|goose|lamb|pork|turkey|veal)(?:\s+s)?\s+livers?\b/g, " liver ")
    .replace(/\blivers\b/g, " liver ")
    .replace(/\b(?:fish|oyster) sauce\b/g, " ")
    .replace(/\b(?:beef|chicken|fish) (?:broth|bouillon|stock)\b/g, " ")
    .replace(/\b(?:beef|chicken|duck|goose|pork) (?:drippings|fat|tallow)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function familyIsSelectablePrimary(families: string[]) {
  return families.some((family) => family !== "egg");
}

function removeAlternativeIngredientsFromText(step: string, removedCanonicals: Set<string>) {
  let result = step;
  for (const canonical of removedCanonicals) {
    const escaped = canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result
      .replace(new RegExp(`,?\\s*(?:or\\s+)?${escaped}(?=,|\\.|$)`, "gi"), "")
      .replace(/,\s*,/g, ",");
  }
  return result.replace(/\s+/g, " ").trim();
}

function proteinFamilyForId(id?: string) {
  if (!id) return null;
  return PROTEIN_FAMILY_BY_ID[id] ?? null;
}

function containsPhrase(value: string, phrase: string) {
  if (!value || !phrase) return false;
  return ` ${value} `.includes(` ${phrase} `);
}
