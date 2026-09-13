import { config } from "dotenv";
import { generateArabicFactBatch } from "../src/services/arabic/factsGemini";
import { buildArabicFactsEntry } from "../src/services/arabic/recipeFacts";
import { partitionArabicRecipe } from "../src/services/arabic/validation";
import { getCompleteCuisineCatalog } from "../src/lib/cuisineCatalogs/completeCatalogs";
import { normalizeArabicInputs } from "../src/services/arabic/ingredients";
import { findArabicFood } from "../src/services/arabic/foodCatalog";
config({ path: ".env.local", quiet: true });

// Explicit developer diagnostic: provider calls only. No app action/credit,
// recipe, history, plan, cache or image writes. Do not include account identity.
async function main() {
  const cuisine = process.argv[2] || "Egyptian";
  if (cuisine === "catalog") {
    for (const dish of getCompleteCuisineCatalog("Egyptian") || []) if (/ful medames|foul medames|taameya/i.test(dish.names.english[0])) console.log(JSON.stringify({ name: dish.names.english, primary: dish.primaryIngredients, normalized: await normalizeArabicInputs(dish.primaryIngredients) }));
    console.log(findArabicFood("fava beans")); return;
  }
  const restrictions = { diets: [process.argv[3] || "vegan"], conditions: [], allergens: [] };
  const ingredients = process.argv[4]?.split(",") || ["rice", "tomato", "fava beans"];
  const result = await generateArabicFactBatch({ ingredients, restrictions, cuisine, count: 5, calorieTarget: 1650, missingLimit: 5 }, Date.now() + 60000, "arabic-facts-diagnostic");
  const receipts = [];
  for (const candidate of result.recipes) {
    const checked = await buildArabicFactsEntry(candidate.facts, restrictions, candidate.source, candidate.labelReceipt);
    const displayed = checked.entry ? await partitionArabicRecipe(checked.entry, ingredients, 30) : null;
    receipts.push({ name: candidate.facts.name, family: candidate.facts.dishFamily, reasons: checked.reasons, missingCount: displayed?.missing_ingredients.length,
      unlisted: candidate.facts.steps.flatMap(step => step.foodIds).filter(id => !candidate.facts.ingredients.some(item => item.foodId === id)),
      facts: checked.reasons.length ? candidate.facts : undefined,
      ingredients: checked.entry?.recipe.ingredients, steps: checked.entry?.recipe.steps });
  }
  console.log(JSON.stringify({ cuisine, diet: restrictions.diets, returned: receipts.length, diagnostics: result.diagnostics, receipts }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Diagnostic failed"); process.exitCode = 1; });
