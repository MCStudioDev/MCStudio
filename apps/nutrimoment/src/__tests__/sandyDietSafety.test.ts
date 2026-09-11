import evidence from "./fixtures/ambiguousShawarma.json";
import { describe, expect, it } from "vitest";
import { findRecipeDietViolation } from "@/lib/dietEnforcement";
import { filterRecipeCatalogByDietConstraints } from "@/services/recipeSearchService";
import { deriveRecipeComplianceTags } from "@/services/sharedRecipePoolQualityService";
import { isSharedRecipeV2Searchable } from "@/services/sharedRecipeV2PolicyService";
import { normalizeCachedRecipeCatalogDoc } from "@/data/offline/recipeMetadata";
import type { RecipeCatalogDoc } from "@/lib/domain";

const backup = evidence;
const original = evidence.original as unknown as RecipeCatalogDoc;
const context = { diets: ["pescatarian"], allergens: [] };

describe("Sandy dietary safety acceptance criteria", () => {
  it("rejects the exact saved card with unresolved shawrma in its missing ingredients and steps", () => {
    expect(findRecipeDietViolation(evidence.observedRecipe, context)).not.toBeNull();
  });

  it("rejects the original shared catalog record before quarantine", () => {
    const ids = filterRecipeCatalogByDietConstraints([original], context.diets, []).map(recipe => recipe.id);
    expect(ids).not.toContain(original.id);
  });

  it.each(["shawrma", "shawarma"])("does not certify unresolved %s as vegan or vegetarian", (ingredient) => {
    const recipe = {
      ...original,
      title: `${ingredient} rice bowl`,
      description: "Rice bowl with an unspecified composite ingredient.",
      dishIntent: undefined,
      ingredients: [{ canonical: ingredient, name: ingredient, required: true }],
      ingredientCanonicals: [ingredient],
      steps: [`Serve the ${ingredient} over rice.`]
    } as RecipeCatalogDoc;
    const tags = deriveRecipeComplianceTags(recipe).dietTags;
    expect(tags.filter(tag => ["vegan", "vegetarian"].includes(tag))).toEqual([]);
  });

  it.each([
    { label: "named chicken", recipe: { name: "Chicken Shawarma Salad", ingredients: ["1 serving chicken", "lettuce", "tomato"] } },
    { label: "chicken only in missing ingredients", recipe: { name: "Rice Bowl", ingredients: ["rice"], missing_ingredients: ["150g chicken"] } },
    { label: "chicken only in cooking steps", recipe: { name: "Rice Bowl", ingredients: ["rice"], steps: ["Top the rice with sliced chicken."] } },
    { label: "Arabic chicken", recipe: { name: "شاورما دجاج", ingredients: ["دجاج", "أرز"] } }
  ])("rejects $label for a pescatarian", ({ recipe }) => {
    expect(findRecipeDietViolation(recipe, context)).toMatchObject({ kind: "diet", diet: "pescatarian" });
  });

  it.each([
    { label: "explicit mushroom shawarma", recipe: { name: "Mushroom Shawarma Bowl", ingredients: ["oyster mushrooms", "rice", "tahini"], steps: ["Roast the mushrooms with shawarma spices and serve over rice."] } },
    { label: "salmon", recipe: { name: "Salmon Rice Bowl", ingredients: ["salmon", "rice", "cucumber"] } },
    { label: "tuna", recipe: { name: "Tuna Salad", ingredients: ["tuna", "lettuce", "tomato"] } }
  ])("accepts $label for a pescatarian", ({ recipe }) => {
    expect(findRecipeDietViolation(recipe, context)).toBeNull();
  });

  it("preserves the manual quarantine through cache normalization", () => {
    const quarantined = { ...original, ...backup.patch };
    expect(isSharedRecipeV2Searchable(quarantined)).toBe(false);
    expect(isSharedRecipeV2Searchable(normalizeCachedRecipeCatalogDoc(quarantined))).toBe(false);
  });
});
