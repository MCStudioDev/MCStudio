import { findArabicFood } from "@/services/arabic/foodCatalog";
import type { ArabicRecipeFacts } from "@/services/arabic/recipeFacts";
export function weeklyFactFixtures(): ArabicRecipeFacts[] {
  const food = (name: string) => findArabicFood(name)!.id;
  const vegetables = ["tomato", "carrot", "broccoli", "spinach", "onion", "eggplant", "zucchini"];
  return ["breakfast", "lunch", "dinner"].flatMap((mealType, group) => vegetables.map((vegetable, index) => ({
    version: "ar-facts-v1", name: `سلمون مع الأرز والخضار ${group}-${index}`, cuisine: "Mediterranean",
    dishFamily: `salmon rice ${vegetable} ${["baked", "grilled", "steamed"][group]}`, mealTypes: [mealType as "breakfast" | "lunch" | "dinner"], servings: 1,
    ingredients: [{ foodId: food("salmon"), quantity: 200, unit: "g", state: "raw" }, { foodId: food("rice"), quantity: 1, unit: "cup", state: "raw" },
      { foodId: food("water"), quantity: 2, unit: "cup", state: "raw" }, { foodId: food(vegetable), quantity: 50, unit: "g", state: "raw" }],
    steps: [{ action: "wash", foodIds: [food("rice"), food(vegetable)], minutes: 0, temperatureC: 0, heat: "none" },
      { action: "simmer", foodIds: [food("rice"), food("water"), food(vegetable)], minutes: 20, temperatureC: 0, heat: "low" },
      { action: ["bake", "grill", "steam"][group] as "bake" | "grill" | "steam", foodIds: [food("salmon")], minutes: 15, temperatureC: group === 0 ? 200 : 0, heat: "none" },
      { action: "serve", foodIds: [], previousSteps: [2, 3], minutes: 0, temperatureC: 0, heat: "none" }],
    nutrition: { calories: 520, protein: 40, carbs: 55, fat: 15 }, totalMinutes: 35, difficulty: "easy"
  })));
}
