import { describe, expect, it } from "vitest";
import { buildArabicFactsEntry, type ArabicRecipeFacts } from "@/services/arabic/recipeFacts";
import { findArabicFood } from "@/services/arabic/foodCatalog";
import { partitionArabicRecipe } from "@/services/arabic/validation";

describe("Arabic recipes with separately prepared components", () => {
  it("retains the separate cooking and assembly steps of koshary", async () => {
    const food = (name: string) => findArabicFood(name)!.id;
    const steps: ArabicRecipeFacts["steps"] = [];
    for (const name of ["rice", "lentils", "pasta"]) {
      steps.push({ action: "wash", foodIds: [food(name)], minutes: 1, temperatureC: 0, heat: "none" },
        { action: "boil", foodIds: [food(name), food("water"), food("salt")], minutes: 15, temperatureC: 100, heat: "medium" },
        { action: "drain", foodIds: [food(name)], minutes: 1, temperatureC: 0, heat: "none" });
    }
    steps.push(
      { action: "peel", foodIds: [food("onion")], minutes: 1, temperatureC: 0, heat: "none" },
      { action: "chop", foodIds: [food("onion")], minutes: 2, temperatureC: 0, heat: "none" },
      { action: "fry", foodIds: [food("onion"), food("olive oil")], minutes: 12, temperatureC: 160, heat: "medium" },
      { action: "simmer", foodIds: [food("tomato sauce")], minutes: 8, temperatureC: 100, heat: "low" },
      { action: "stir", foodIds: [food("tomato sauce")], minutes: 1, temperatureC: 0, heat: "none" },
      { action: "wash", foodIds: [food("chickpeas")], minutes: 1, temperatureC: 0, heat: "none" },
      { action: "simmer", foodIds: [food("chickpeas"), food("water")], minutes: 4, temperatureC: 100, heat: "low" },
      { action: "drain", foodIds: [food("chickpeas")], minutes: 1, temperatureC: 0, heat: "none" },
      { action: "layer", foodIds: [], previousSteps: [3, 6, 9, 12, 14, 17], minutes: 1, temperatureC: 0, heat: "none" }
    );
    const facts: ArabicRecipeFacts = { version: "ar-facts-v1", name: "كشري مصري", cuisine: "Egyptian", dishFamily: "Classic Egyptian Koshary", mealTypes: ["lunch", "dinner"], servings: 1,
      ingredients: ["rice", "lentils", "pasta", "chickpeas", "tomato sauce", "water"].map(name => ({ foodId: food(name), quantity: name === "water" ? 4 : 0.25, unit: "cup" as const, state: name === "chickpeas" ? "cooked" as const : "raw" as const })).concat([]),
      steps, nutrition: { calories: 520, protein: 19, carbs: 96, fat: 8 }, totalMinutes: 60, difficulty: "medium" };
    facts.ingredients.push({ foodId: food("onion"), quantity: 0.5, unit: "piece", state: "raw" }, { foodId: food("olive oil"), quantity: 1, unit: "tbsp", state: "raw" }, { foodId: food("salt"), quantity: 0.25, unit: "tsp", state: "raw" });
    const checked = await buildArabicFactsEntry(facts, { diets: ["vegan"], conditions: [], allergens: [] });
    expect(checked.reasons).toEqual([]);
    expect(checked.entry?.recipe.steps).toHaveLength(18);
    expect(await partitionArabicRecipe(checked.entry!, ["rice", "lentils", "chickpeas"], 5)).toBeNull();
    expect((await partitionArabicRecipe(checked.entry!, ["rice", "lentils", "chickpeas", "pasta", "tomato sauce", "onion"], 5))?.missing_ingredients).toHaveLength(3);
  });
});
