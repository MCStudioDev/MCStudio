import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { searchCatalogRecipes } from "../src/services/recipeSearchService";
import { findRecipeDietViolation } from "../src/lib/dietEnforcement";
import { cuisineMatchesPreference } from "../src/lib/cuisines";
import type { Recipe, RecipeMealType } from "../src/lib/types";

type Tier = "free" | "premium";

interface AccountPersona {
  email: string;
  tier: Tier;
}

interface DietCase {
  id: string;
  label: string;
  diets: string[];
  allergens: string[];
}

interface TestCaseResult {
  id: string;
  email: string;
  tier: Tier;
  cuisine: string;
  mealType: RecipeMealType;
  dietPreference: string;
  recipeCount: number;
  topRecipe?: string;
  topCuisine?: string;
  stepScore: number;
  cuisineAligned: boolean;
  dietViolation?: string;
  gaps: string[];
}

const accounts: AccountPersona[] = [
  { email: "gamal.mina2013@gmail.com", tier: "free" },
  { email: "mina.naguib42@gmail.com", tier: "premium" }
];

const cuisines = [
  "Egyptian",
  "Italian",
  "Middle Eastern",
  "Mediterranean",
  "Indian",
  "Mexican",
  "American",
  "Asian",
  "Thai",
  "Turkish"
];

const diets: DietCase[] = [
  { id: "balanced", label: "Balanced / no diet restriction", diets: [], allergens: [] },
  { id: "vegetarian", label: "Vegetarian", diets: ["vegetarian"], allergens: [] },
  { id: "vegan", label: "Vegan", diets: ["vegan"], allergens: [] },
  { id: "pescatarian", label: "Pescatarian", diets: ["pescatarian"], allergens: [] },
  { id: "dairy-free", label: "Dairy-free", diets: ["dairyFree"], allergens: [] },
  { id: "gluten-free", label: "Gluten-free", diets: ["glutenFree"], allergens: [] },
  { id: "keto", label: "Keto", diets: ["keto"], allergens: [] },
  { id: "paleo", label: "Paleo", diets: ["paleo"], allergens: [] }
];

const pantryByCuisine: Record<string, string[]> = {
  Egyptian: ["lentils", "rice", "tomatoes", "onion", "garlic", "chickpeas", "parsley", "cumin", "tilapia", "lemon"],
  Italian: ["tomatoes", "pasta", "zucchini", "eggplant", "basil", "garlic", "olive oil", "chicken breast", "mushrooms"],
  "Middle Eastern": ["chickpeas", "lentils", "tomatoes", "cucumber", "parsley", "tahini", "rice", "eggplant", "lemon"],
  Mediterranean: ["tomatoes", "zucchini", "eggplant", "chickpeas", "olive oil", "lemon", "fish", "rice", "parsley"],
  Indian: ["lentils", "chickpeas", "rice", "spinach", "tomatoes", "onion", "garlic", "ginger", "cauliflower"],
  Mexican: ["black beans", "corn", "tomatoes", "rice", "avocado", "lime", "cilantro", "chicken breast", "peppers"],
  American: ["chicken breast", "potatoes", "broccoli", "mushrooms", "eggs", "tomatoes", "lettuce", "beans"],
  Asian: ["tofu", "rice", "broccoli", "mushrooms", "ginger", "garlic", "soy sauce", "shrimp", "carrots"],
  Thai: ["tofu", "rice", "coconut milk", "lime", "basil", "ginger", "garlic", "shrimp", "mushrooms"],
  Turkish: ["eggplant", "tomatoes", "lentils", "rice", "parsley", "yogurt", "chickpeas", "fish", "onion"]
};

const actionVerbPattern = /\b(preheat|heat|simmer|boil|bake|roast|grill|saute|sauté|stir|mix|whisk|season|slice|chop|dice|cook|fold|combine|toast|serve|drain|rinse|marinate|steam|sear|blend)\b/i;
const measurementPattern = /\b(\d+\s*(?:min|minute|minutes|hour|hours|f|c|°|tbsp|tsp|cup|g|kg|oz|ml)|until|once|tender|golden|fragrant|through)\b/i;
const vagueStepPattern = /\b(cook until done|prepare ingredients|make sauce|cook everything|serve when ready|mix all|add spices)\b/i;

async function main() {
  const startedAt = Date.now();
  const results: TestCaseResult[] = [];
  let index = 0;

  for (const account of accounts) {
    for (const cuisine of cuisines) {
      for (const diet of diets) {
        index += 1;
        const mealType: RecipeMealType = index % 2 === 0 ? "dinner" : "lunch";
        const result = await runCase(index, account, cuisine, diet, mealType);
        results.push(result);
        console.log(
          `${String(index).padStart(3, "0")} ${account.tier} ${cuisine} ${diet.id}: ` +
            `${result.recipeCount} recipes, score ${result.stepScore}, ${result.gaps.length} gaps`
        );
      }
    }
  }

  await writeReports(results, Date.now() - startedAt);
}

async function runCase(
  index: number,
  account: AccountPersona,
  cuisine: string,
  diet: DietCase,
  mealType: RecipeMealType
): Promise<TestCaseResult> {
  const response = await searchCatalogRecipes({
    ingredients: pantryByCuisine[cuisine],
    preferredCuisine: cuisine,
    diets: diet.diets,
    conditions: [],
    allergens: diet.allergens,
    mealType,
    maxResults: account.tier === "premium" ? 4 : 3,
    recipeLanguage: "English",
    uid: account.email,
    includeFirestoreReferences: false,
    allowRemoteCaches: false
  });

  const recipes = response.recipes ?? [];
  const topRecipe = recipes[0];
  const gaps = analyzeResultGaps(recipes, cuisine, diet, account.tier);
  const dietViolation = topRecipe ? findRecipeDietViolation(topRecipe, { diets: diet.diets, allergens: diet.allergens }) : null;
  const stepScore = average(recipes.map(scoreRecipeSteps));

  return {
    id: `diet-case-${String(index).padStart(3, "0")}`,
    email: account.email,
    tier: account.tier,
    cuisine,
    mealType,
    dietPreference: diet.label,
    recipeCount: recipes.length,
    topRecipe: topRecipe?.name,
    topCuisine: topRecipe?.cuisine,
    stepScore,
    cuisineAligned: topRecipe ? cuisineMatchesPreference(topRecipe.cuisine, cuisine) : false,
    dietViolation: dietViolation ? `${dietViolation.kind}:${"diet" in dietViolation ? dietViolation.diet : dietViolation.allergen}:${dietViolation.match}` : undefined,
    gaps
  };
}

function analyzeResultGaps(recipes: Recipe[], cuisine: string, diet: DietCase, tier: Tier) {
  const gaps: string[] = [];

  if (!recipes.length) {
    gaps.push("No recipes returned.");
    return gaps;
  }

  const expectedMinimum = tier === "premium" ? 4 : 3;
  if (recipes.length < expectedMinimum) gaps.push(`Returned ${recipes.length}/${expectedMinimum} expected recipes for ${tier}.`);

  recipes.forEach((recipe, recipeIndex) => {
    const label = `${recipeIndex + 1}. ${recipe.name}`;
    if (!cuisineMatchesPreference(recipe.cuisine, cuisine)) {
      gaps.push(`${label}: cuisine '${recipe.cuisine}' does not align with '${cuisine}'.`);
    }

    const dietViolation = findRecipeDietViolation(recipe, { diets: diet.diets, allergens: diet.allergens });
    if (dietViolation) {
      gaps.push(`${label}: diet/allergen violation ${JSON.stringify(dietViolation)}.`);
    }

    const stepGaps = analyzeStepGaps(recipe);
    gaps.push(...stepGaps.map((gap) => `${label}: ${gap}`));
  });

  return gaps;
}

function analyzeStepGaps(recipe: Recipe) {
  const gaps: string[] = [];
  const steps = recipe.steps ?? [];
  if (steps.length < 3) gaps.push(`only ${steps.length} recipe steps.`);

  const shortSteps = steps.filter((step) => step.trim().length < 18);
  if (shortSteps.length) gaps.push(`${shortSteps.length} very short step(s).`);

  const vagueSteps = steps.filter((step) => vagueStepPattern.test(step));
  if (vagueSteps.length) gaps.push(`${vagueSteps.length} vague step(s).`);

  const stepsWithActions = steps.filter((step) => actionVerbPattern.test(step)).length;
  if (steps.length && stepsWithActions / steps.length < 0.75) {
    gaps.push(`low action-verb coverage (${stepsWithActions}/${steps.length}).`);
  }

  const stepsWithTimingOrDoneness = steps.filter((step) => measurementPattern.test(step)).length;
  if (steps.length && stepsWithTimingOrDoneness / steps.length < 0.35) {
    gaps.push(`low timing/doneness coverage (${stepsWithTimingOrDoneness}/${steps.length}).`);
  }

  const ingredientCoverage = estimateIngredientCoverage(recipe);
  if (ingredientCoverage < 0.35) gaps.push(`low ingredient-to-step coverage (${Math.round(ingredientCoverage * 100)}%).`);

  return gaps;
}

function scoreRecipeSteps(recipe: Recipe) {
  const gaps = analyzeStepGaps(recipe);
  return Math.max(0, 100 - gaps.length * 18);
}

function estimateIngredientCoverage(recipe: Recipe) {
  const stepsText = (recipe.steps ?? []).join(" ").toLowerCase();
  const ingredients = (recipe.ingredients ?? [])
    .map((ingredient) => ingredient.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim())
    .map((ingredient) => ingredient.split(/\s+/).filter((part) => part.length >= 4)[0] ?? ingredient)
    .filter(Boolean);

  if (!ingredients.length) return 0;
  const covered = ingredients.filter((ingredient) => stepsText.includes(ingredient)).length;
  return covered / ingredients.length;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function writeReports(results: TestCaseResult[], durationMs: number) {
  const outputDir = path.join(process.cwd(), ".generated");
  await mkdir(outputDir, { recursive: true });

  const byTier = summarize(results, (item) => item.tier);
  const byCuisine = summarize(results, (item) => item.cuisine);
  const byDiet = summarize(results, (item) => item.dietPreference);
  const allGaps = results.flatMap((item) => item.gaps);
  const topGapThemes = summarizeGapThemes(allGaps);

  const report = {
    generatedAt: new Date().toISOString(),
    accountUseNote:
      "Emails were used as local test persona labels only. The live Chrome session did not expose NutriMoment tabs for these accounts, so this run did not operate inside the real signed-in sessions.",
    durationMs,
    totalCases: results.length,
    passLikeCases: results.filter((item) => item.recipeCount > 0 && item.gaps.length === 0).length,
    gapCaseCount: results.filter((item) => item.gaps.length > 0).length,
    averageStepScore: average(results.map((item) => item.stepScore)),
    byTier,
    byCuisine,
    byDiet,
    topGapThemes,
    results
  };

  await writeFile(path.join(outputDir, "diet-preference-account-matrix-report.json"), JSON.stringify(report, null, 2));
  await writeFile(
    path.join(outputDir, "diet-preference-account-matrix-report.md"),
    [
      "# NutriMoment Diet Preference Account Matrix",
      "",
      `Generated: ${report.generatedAt}`,
      report.accountUseNote,
      `Runtime: ${(durationMs / 1000).toFixed(1)}s`,
      `Total cases: ${report.totalCases}`,
      `Clean cases: ${report.passLikeCases}`,
      `Cases with gaps: ${report.gapCaseCount}`,
      `Average step score: ${report.averageStepScore}/100`,
      "",
      "## Account Tier Summary",
      tableFromSummary(byTier),
      "",
      "## Cuisine Summary",
      tableFromSummary(byCuisine),
      "",
      "## Diet Preference Summary",
      tableFromSummary(byDiet),
      "",
      "## Top Gap Themes",
      topGapThemes.map((item) => `- ${item.theme}: ${item.count}`).join("\n") || "- None",
      "",
      "## Cases With Gaps",
      ...results
        .filter((item) => item.gaps.length)
        .map((item) => [
          `### ${item.id} ${item.tier} ${item.cuisine} ${item.dietPreference}`,
          `Top: ${item.topRecipe ?? "none"} (${item.topCuisine ?? "n/a"}), recipes: ${item.recipeCount}, step score: ${item.stepScore}`,
          ...item.gaps.map((gap) => `- ${gap}`)
        ].join("\n"))
    ].join("\n")
  );

  console.log(
    `Diet preference matrix: ${report.totalCases} cases, ${report.passLikeCases} clean, ` +
      `${report.gapCaseCount} with gaps, avg step score ${report.averageStepScore}/100`
  );
  console.log(`Report: ${path.join(outputDir, "diet-preference-account-matrix-report.md")}`);
}

function summarize(results: TestCaseResult[], keyFor: (item: TestCaseResult) => string) {
  const summary = new Map<string, { cases: number; clean: number; gaps: number; avgStepScore: number; avgRecipeCount: number }>();
  for (const item of results) {
    const key = keyFor(item);
    const current = summary.get(key) ?? { cases: 0, clean: 0, gaps: 0, avgStepScore: 0, avgRecipeCount: 0 };
    current.cases += 1;
    current.clean += item.gaps.length ? 0 : 1;
    current.gaps += item.gaps.length;
    current.avgStepScore += item.stepScore;
    current.avgRecipeCount += item.recipeCount;
    summary.set(key, current);
  }

  return Array.from(summary.entries()).map(([key, item]) => ({
    key,
    cases: item.cases,
    clean: item.clean,
    gapCases: item.cases - item.clean,
    gaps: item.gaps,
    avgStepScore: Math.round(item.avgStepScore / item.cases),
    avgRecipeCount: Number((item.avgRecipeCount / item.cases).toFixed(2))
  }));
}

function summarizeGapThemes(gaps: string[]) {
  const themes = new Map<string, number>();
  for (const gap of gaps) {
    const theme = gap.includes("No recipes")
      ? "No recipe results"
      : gap.includes("cuisine")
        ? "Cuisine mismatch"
        : gap.includes("diet") || gap.includes("allergen")
          ? "Diet/allergen mismatch"
          : gap.includes("short")
            ? "Short steps"
            : gap.includes("vague")
              ? "Vague steps"
              : gap.includes("action-verb")
                ? "Low action verbs"
                : gap.includes("timing")
                  ? "Low timing/doneness detail"
                  : gap.includes("ingredient-to-step")
                    ? "Low ingredient coverage in steps"
                    : "Returned fewer than expected";
    themes.set(theme, (themes.get(theme) ?? 0) + 1);
  }
  return Array.from(themes.entries())
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count);
}

function tableFromSummary(items: ReturnType<typeof summarize>) {
  return [
    "| Segment | Cases | Clean | Gap cases | Gaps | Avg recipes | Avg step score |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...items.map(
      (item) =>
        `| ${item.key} | ${item.cases} | ${item.clean} | ${item.gapCases} | ${item.gaps} | ${item.avgRecipeCount} | ${item.avgStepScore} |`
    )
  ].join("\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
