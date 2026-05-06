/**
 * EXAMPLE USAGE & VERIFICATION
 * Quick reference for using the complete cuisine catalogs
 */

import {
  getCompleteCuisineCatalog,
  getDishesForSubCuisine,
  searchDishByName,
  getDishesForMealType,
  getIconicDishesForCuisine,
  findDishesByIngredient,
  getCatalogStatistics,
  getDishById
} from "./completeCatalogs";
import type { CuisineDish } from "./types";

type ScoredDishMatch = {
  dish: CuisineDish;
  matchedCount: number;
  matchPercentage: number;
  score: number;
};

// ============================================================================
// VERIFICATION EXAMPLES
// ============================================================================

/**
 * Example 1: Get all Egyptian dishes
 */
export function example_getEgyptianCatalog() {
  const egyptian = getCompleteCuisineCatalog("egyptian");
  console.log(`Total Egyptian dishes: ${egyptian?.length}`);

  if (egyptian) {
    const breakfast = egyptian.filter((d) =>
      d.mealTypes.includes("breakfast")
    );
    console.log(`Egyptian breakfast dishes: ${breakfast.length}`);
    breakfast.forEach((d) => console.log(`  - ${d.names.english[0]}`));
  }
}

/**
 * Example 2: Find all Levantine (Lebanese/Syrian) dishes
 */
export function example_getLevantineDishes() {
  const levantine = getDishesForSubCuisine("levantine");
  console.log(`Total Levantine dishes: ${levantine.length}`);
  levantine.forEach((d) => {
    console.log(
      `  - ${d.names.english[0]} (iconic score: ${d.iconicScore})`
    );
  });
}

/**
 * Example 3: Resolver use case - "I have ground meat, onion, bread"
 */
export function example_resolverMatch() {
  const ingredients = ["ground meat", "onion", "bread"];
  console.log(`\nFinding dishes with: ${ingredients.join(", ")}`);

  // Find all dishes that contain ANY of these ingredients
  const matches = new Set<string>();
  ingredients.forEach((ing) => {
    findDishesByIngredient(ing).forEach((dish) => {
      matches.add(dish.id);
    });
  });

  console.log(`Found ${matches.size} potential matches`);

  // Score by ingredient overlap
  const scored = Array.from(matches)
    .map((dishId) => {
      const dish = getDishById(dishId);
      if (!dish) return null;

      const matchedIngredients = ingredients.filter(
        (ing) =>
          dish.primaryIngredients.some((di) =>
            di.toLowerCase().includes(ing.toLowerCase())
          ) ||
          dish.optionalIngredients.some((di) =>
            di.toLowerCase().includes(ing.toLowerCase())
          )
      );

      return {
        dish,
        matchedCount: matchedIngredients.length,
        matchPercentage: (matchedIngredients.length / ingredients.length) * 100,
        score: matchedIngredients.length * 100 + dish.iconicScore
      };
    })
    .filter((item): item is ScoredDishMatch => item !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  console.log("\nTop matches:");
  scored.forEach((item) => {
    console.log(
      `  ✓ ${item.dish.names.english[0]} (${item.matchedCount}/${ingredients.length} ingredients, score: ${item.score})`
    );
  });
}

/**
 * Example 4: Search by dish name
 */
export function example_searchByName() {
  const results = searchDishByName("biryani");
  console.log(`\nSearching for "biryani":`);
  results.forEach((d) => {
    console.log(
      `  - ${d.names.english[0]} (${d.cuisine}, ${d.region})`
    );
  });
}

/**
 * Example 5: Get top iconic dishes per cuisine
 */
export function example_getIconicDishes() {
  console.log("\nTop 5 iconic dishes per cuisine:");
  ["egyptian", "middleEastern", "asian", "mexican", "turkish", "italian"]
    .forEach((cuisine) => {
      const iconic = getIconicDishesForCuisine(cuisine, 5);
      console.log(`\n${cuisine.toUpperCase()}:`);
      iconic.forEach((d) => {
        console.log(
          `  ${d.iconicScore}/100 - ${d.names.english[0]}`
        );
      });
    });
}

/**
 * Example 6: Find all street food
 */
export function example_getStreetFood() {
  const streetFood = getDishesForMealType("street_food");
  console.log(`\nTotal street food dishes: ${streetFood.length}`);
  streetFood.slice(0, 10).forEach((d) => {
    console.log(
      `  - ${d.names.english[0]} (${d.cuisine})`
    );
  });
}

/**
 * Example 7: Get dishes with tahini
 */
export function example_findByIngredient() {
  const tahiniDishes = findDishesByIngredient("tahini");
  console.log(`\nDishes with tahini: ${tahiniDishes.length}`);
  tahiniDishes.slice(0, 8).forEach((d) => {
    console.log(
      `  - ${d.names.english[0]} (${d.cuisine}, ${d.region})`
    );
  });
}

/**
 * Example 8: Get catalog statistics
 */
export function example_statistics() {
  const stats = getCatalogStatistics();
  console.log("\nCatalog Statistics:");
  console.log(`  Total dishes: ${stats.totalDishes}`);
  console.log("\n  Per cuisine:");
  Object.entries(stats.dishesPerCuisine).forEach(([cuisine, count]) => {
    console.log(`    - ${cuisine}: ${count}`);
  });
}

/**
 * Example 9: Image identity lookup
 */
export function example_imageIdentity() {
  const dish = getDishById("ful-medames");
  if (dish) {
    console.log("\nImage Identity Setup for: Ful Medames");
    console.log(`  ID: ${dish.id}`);
    console.log(`  Names: ${dish.names.english.join(" / ")}`);
    console.log(`  Native: ${dish.names.native.join(" / ")}`);
    console.log(`  Description: ${dish.description}`);
    console.log(`  Primary ingredients: ${dish.primaryIngredients.join(", ")}`);
    console.log(`  Image prompt could be:`);
    console.log(
      `    "${dish.names.english[0]} - ${dish.description}. Served with ${dish.primaryIngredients.slice(0, 2).join(" and ")}. Professional food photography."`
    );
  }
}

/**
 * Example 10: Multi-language support
 */
export function example_multiLanguage() {
  const koshary = getDishById("koshary");
  if (koshary) {
    console.log("\nMulti-language example: Koshary");
    console.log(`  English: ${koshary.names.english[0]}`);
    console.log(`  Arabic: ${koshary.names.native[0]}`);
    console.log(`  Region: ${koshary.region}`);
    console.log(`  Ingredients:`);
    console.log(`    Required: ${koshary.primaryIngredients.join(", ")}`);
    console.log(`    Optional: ${koshary.optionalIngredients.join(", ")}`);
  }
}

// ============================================================================
// RUN ALL EXAMPLES
// ============================================================================

export function runAllExamples() {
  console.log("=".repeat(80));
  console.log("CUISINE CATALOG VERIFICATION EXAMPLES");
  console.log("=".repeat(80));

  example_statistics();
  console.log("\n" + "─".repeat(80));
  example_getEgyptianCatalog();
  console.log("\n" + "─".repeat(80));
  example_getLevantineDishes();
  console.log("\n" + "─".repeat(80));
  example_resolverMatch();
  console.log("\n" + "─".repeat(80));
  example_searchByName();
  console.log("\n" + "─".repeat(80));
  example_getIconicDishes();
  console.log("\n" + "─".repeat(80));
  example_getStreetFood();
  console.log("\n" + "─".repeat(80));
  example_findByIngredient();
  console.log("\n" + "─".repeat(80));
  example_imageIdentity();
  console.log("\n" + "─".repeat(80));
  example_multiLanguage();
  console.log("\n" + "=".repeat(80));
}

// Uncomment to run:
// runAllExamples();
