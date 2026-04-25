import path from "node:path";
import { config as loadEnv } from "dotenv";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";
import type { RecipeCatalogDoc } from "../src/lib/domain";
import { enrichOfflineRecipe } from "../src/data/offline/recipeMetadata";
import { OFFLINE_INGREDIENT_ALIASES } from "../src/data/offline/aliases";
import { OFFLINE_INGREDIENT_TAXONOMY } from "../src/data/offline/ingredientTaxonomy";
import { OFFLINE_RECIPES } from "../src/data/offline/recipes";
import { localizeRecipeForArabic } from "../src/lib/arabicRecipeLocalization";
import type { Recipe } from "../src/lib/types";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const WRITE_BATCH_SIZE = 150;
const THEMEALDB_AREAS = ["Egyptian", "Italian", "Lebanese", "Turkish"];
const WIKIBOOKS_CATEGORY_TITLE = "Category:Italian_recipes";
const WIKIBOOKS_CUISINE_PAGES = [
  { title: "Cookbook:Cuisine_of_Egypt", cuisine: "egyptian" },
  { title: "Cookbook:Middle_Eastern_cuisines", cuisine: "middle eastern" }
];

interface ExternalRecipeRecord {
  title: string;
  cuisine: string;
  ingredients: string[];
  steps: string[];
  source: {
    provider: string;
    externalId?: string;
    url?: string;
    license?: string;
  };
  imageUrl?: string;
}

const DRY_RUN = process.argv.includes("--dry-run");
const MAX_RECIPES = getNumericArg("--max");
const EXISTING_RECIPE_KEYS = new Set(OFFLINE_RECIPES.map((recipe) => buildRecipeKey(recipe.title, recipe.ingredientCanonicals)));

async function main() {
  if (!DRY_RUN && !hasFirebaseAdminConfig()) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const sourceRecords = await Promise.all([importTheMealDb(), importWikibooks()]);
  const deduped = dedupeExternalRecipes(sourceRecords.flat());
  const catalogDocs = deduped
    .map(buildCatalogDoc)
    .filter((recipe): recipe is RecipeCatalogDoc => Boolean(recipe))
    .filter((recipe) => !EXISTING_RECIPE_KEYS.has(buildRecipeKey(recipe.title, recipe.ingredientCanonicals)));
  const limitedCatalogDocs = MAX_RECIPES != null ? catalogDocs.slice(0, MAX_RECIPES) : catalogDocs;

  process.stdout.write(`Prepared ${limitedCatalogDocs.length} real-source recipes for import.\n`);
  logImportSummary(limitedCatalogDocs);

  if (DRY_RUN) {
    process.stdout.write("Dry run only. No Firestore writes were performed.\n");
    return;
  }

  await seedRecipes(limitedCatalogDocs);
  process.stdout.write("Imported real-source recipes into Firestore.\n");
}

async function importTheMealDb(): Promise<ExternalRecipeRecord[]> {
  const records: ExternalRecipeRecord[] = [];

  for (const area of THEMEALDB_AREAS) {
    const filtered = await fetchJson<{ meals: Array<{ idMeal: string; strMeal: string }> | null }>(
      `https://www.themealdb.com/api/json/v1/1/filter.php?a=${encodeURIComponent(area)}`
    );
    const meals = filtered.meals ?? [];

    for (const meal of meals) {
      const detail = await fetchJson<{ meals: Array<Record<string, string | null>> | null }>(
        `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${encodeURIComponent(meal.idMeal)}`
      );
      const item = detail.meals?.[0];
      if (!item) continue;

      const ingredients = Array.from({ length: 20 }, (_, index) => {
        const ingredient = cleanIngredient(item[`strIngredient${index + 1}`]);
        const measure = cleanIngredient(item[`strMeasure${index + 1}`]);
        if (!ingredient) return null;
        return measure ? `${measure} ${ingredient}` : ingredient;
      }).filter((value): value is string => Boolean(value));

      const instructions = splitInstructions(item.strInstructions);
      if (!ingredients.length || instructions.length < 2) continue;

      const sourceUrl = cleanIngredient(item.strSource) || cleanIngredient(item.strYoutube);

      records.push({
        title: item.strMeal?.trim() ?? meal.strMeal,
        cuisine: normalizeImportedCuisine(area),
        ingredients,
        steps: instructions,
        imageUrl: item.strMealThumb?.trim() || undefined,
        source: {
          provider: "themealdb",
          externalId: meal.idMeal,
          ...(sourceUrl ? { url: sourceUrl } : {}),
          license: "Provider terms"
        }
      });
    }
  }

  return records;
}

async function importWikibooks(): Promise<ExternalRecipeRecord[]> {
  const titles = new Map<string, string>();
  const italianTitles = await fetchWikibooksCategoryMembers(WIKIBOOKS_CATEGORY_TITLE);
  italianTitles.forEach((title) => titles.set(title, "italian"));

  for (const page of WIKIBOOKS_CUISINE_PAGES) {
    const linkedTitles = await fetchWikibooksRecipeLinks(page.title);
    linkedTitles.forEach((title) => titles.set(title, page.cuisine));
  }

  const records: ExternalRecipeRecord[] = [];
  for (const [title, cuisine] of titles.entries()) {
    const wikitext = await fetchWikibooksWikitext(title);
    if (!wikitext) continue;

    const ingredients = parseBulletedSection(wikitext, ["Ingredients"]);
    const steps = parseNumberedSection(wikitext, ["Procedure", "Method", "Directions", "Preparation"]);
    if (!ingredients.length || steps.length < 2) continue;

    records.push({
      title: title.replace(/^Cookbook:/, "").trim(),
      cuisine,
      ingredients,
      steps,
      source: {
        provider: "wikibooks",
        externalId: title,
        url: `https://en.wikibooks.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
        license: "CC BY-SA"
      }
    });
  }

  return records;
}

async function seedRecipes(recipes: RecipeCatalogDoc[]) {
  const db = getAdminDb();
  for (let index = 0; index < recipes.length; index += WRITE_BATCH_SIZE) {
    const chunk = recipes.slice(index, index + WRITE_BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((recipe) => {
      batch.set(db.collection("recipes").doc(recipe.id), stripUndefinedDeep(recipe), { merge: true });
    });
    await batch.commit();
    process.stdout.write(`Imported ${Math.min(index + chunk.length, recipes.length)}/${recipes.length} real-source recipes...\n`);
  }
}

function buildCatalogDoc(record: ExternalRecipeRecord): RecipeCatalogDoc | null {
  const canonicals = Array.from(
    new Set(
      record.ingredients
        .map(normalizeIngredientCanonical)
        .filter(Boolean)
    )
  ).slice(0, 8);

  if (canonicals.length < 2) return null;

  const englishRecipe: Recipe = {
    name: record.title,
    cuisine: toTitleCase(record.cuisine),
    image_search_index: `${toTitleCase(record.cuisine)} ${record.title}`,
    image_search_indices: canonicals.slice(0, 4),
    ingredients: canonicals,
    missing_ingredients: [],
    steps: record.steps.slice(0, 8),
    calories: estimateCalories(canonicals),
    protein: `${estimateMacro(canonicals, "protein")}g`,
    carbs: `${estimateMacro(canonicals, "carbs")}g`,
    fat: `${estimateMacro(canonicals, "fat")}g`,
    fiber: `${estimateMacro(canonicals, "fiber")}g`,
    sugar: `${estimateMacro(canonicals, "sugar")}g`,
    sodium: `${estimateMacro(canonicals, "sodium")}mg`,
    cook_time: `${20 + (canonicals.length * 5)} mins`,
    difficulty: record.steps.length > 5 ? "Medium" : "Easy",
    image_url: record.imageUrl
  };

  const arabicRecipe = localizeRecipeForArabic(englishRecipe);
  const id = buildStableRecipeId(record.title, canonicals);
  const description = `Imported from ${record.source.provider}: ${record.title}`;
  const recipe: RecipeCatalogDoc = {
    id,
    title: record.title,
    slug: `${slugify(record.title)}-${id}`,
    description,
    ingredients: canonicals.map((canonical, index) => ({
      name: canonical,
      canonical,
      quantity: 1,
      required: index < Math.min(3, canonicals.length)
    })),
    ingredientCanonicals: canonicals,
    requiredCanonicals: canonicals.slice(0, Math.min(3, canonicals.length)),
    optionalCanonicals: canonicals.slice(Math.min(3, canonicals.length)),
    dietTags: deriveDietTags(canonicals),
    allergenTags: deriveAllergenTags(canonicals),
    mealType: inferMealType(record.title, canonicals),
    cuisine: record.cuisine,
    prepMinutes: 10,
    cookMinutes: 10 + (canonicals.length * 5),
    totalMinutes: 20 + (canonicals.length * 5),
    difficulty: record.steps.length > 5 ? "medium" : "easy",
    calories: estimateCalories(canonicals),
    protein: estimateMacro(canonicals, "protein"),
    carbs: estimateMacro(canonicals, "carbs"),
    fat: estimateMacro(canonicals, "fat"),
    fiber: estimateMacro(canonicals, "fiber"),
    sugar: estimateMacro(canonicals, "sugar"),
    sodium: estimateMacro(canonicals, "sodium"),
    calorieBand: inferCalorieBand(estimateCalories(canonicals)),
    servings: 4,
    steps: record.steps.slice(0, 8),
    image: {
      storagePath: record.imageUrl ?? "",
      thumbPath: record.imageUrl
    },
    source: record.source,
    localized: {
      English: { ...englishRecipe, id },
      Arabic: { ...arabicRecipe, id }
    },
    searchTokens: Array.from(new Set([record.title, record.cuisine, ...canonicals].map((value) => value.toLowerCase()))),
    popularityScore: 80,
    qualityScore: 88,
    isActive: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  return enrichOfflineRecipe(recipe);
}

function dedupeExternalRecipes(records: ExternalRecipeRecord[]) {
  const deduped = new Map<string, ExternalRecipeRecord>();

  for (const record of records) {
    const canonicals = Array.from(new Set(record.ingredients.map(normalizeIngredientCanonical).filter(Boolean))).sort().slice(0, 6);
    const key = buildRecipeKey(record.title, canonicals);
    if (!deduped.has(key)) {
      deduped.set(key, record);
    }
  }

  return Array.from(deduped.values());
}

async function fetchWikibooksCategoryMembers(categoryTitle: string) {
  const url =
    `https://en.wikibooks.org/w/api.php?action=query&format=json&list=categorymembers&cmtitle=${encodeURIComponent(categoryTitle)}` +
    "&cmlimit=max&cmtype=page&origin=*";
  const json = await fetchJson<{ query?: { categorymembers?: Array<{ title: string }> } }>(url);
  return (json.query?.categorymembers ?? [])
    .map((entry) => entry.title)
    .filter((title) => title.startsWith("Cookbook:"));
}

async function fetchWikibooksRecipeLinks(pageTitle: string) {
  const url =
    `https://en.wikibooks.org/w/api.php?action=parse&format=json&page=${encodeURIComponent(pageTitle)}` +
    "&prop=links&origin=*";
  const json = await fetchJson<{ parse?: { links?: Array<{ "*": string; ns: number }> } }>(url);
  return (json.parse?.links ?? [])
    .filter((entry) => entry.ns === 0 && entry["*"].startsWith("Cookbook:"))
    .map((entry) => entry["*"])
    .filter((title) => !/Cuisine/i.test(title) && !/Cookbook:Recipes/i.test(title));
}

async function fetchWikibooksWikitext(title: string) {
  const url =
    `https://en.wikibooks.org/w/api.php?action=query&prop=revisions&rvprop=content&titles=${encodeURIComponent(title)}` +
    "&format=json&formatversion=2&origin=*";
  const json = await fetchJson<{ query?: { pages?: Array<{ revisions?: Array<{ content?: string }> }> } }>(url);
  return json.query?.pages?.[0]?.revisions?.[0]?.content ?? null;
}

function parseBulletedSection(wikitext: string, sectionTitles: string[]) {
  const section = extractFirstSection(wikitext, sectionTitles);
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[*;]/.test(line))
    .map(cleanWikitextLine)
    .filter(Boolean);
}

function parseNumberedSection(wikitext: string, sectionTitles: string[]) {
  const section = extractFirstSection(wikitext, sectionTitles);
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^#/.test(line))
    .map(cleanWikitextLine)
    .filter(Boolean);
}

function extractFirstSection(wikitext: string, sectionTitles: string[]) {
  for (const sectionTitle of sectionTitles) {
    const pattern = new RegExp(`==\\s*${escapeRegExp(sectionTitle)}\\s*==([\\s\\S]*?)(?:\\n==|$)`, "i");
    const match = wikitext.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return "";
}

function cleanWikitextLine(line: string) {
  return line
    .replace(/^[*;#]+\s*/, "")
    .replace(/\{\{[^}]+\}\}/g, " ")
    .replace(/\[\[([^|\]]+\|)?([^\]]+)\]\]/g, "$2")
    .replace(/'''?/g, "")
    .replace(/<ref[^>]*>.*?<\/ref>/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIngredientCanonical(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d+[\/\d.\s]*(cup|cups|tbsp|tsp|teaspoons?|tablespoons?|grams?|g|kg|lb|lbs|ounces?|oz|ml|l|cloves?|whole|can|cans)\b/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";

  for (const alias of OFFLINE_INGREDIENT_ALIASES) {
    const keys = [alias.raw, ...alias.synonyms, ...alias.misspellings].map((item) => item.toLowerCase());
    if (keys.some((key) => normalized === key || normalized.includes(key) || key.includes(normalized))) {
      return alias.canonical;
    }
  }

  const direct = OFFLINE_INGREDIENT_TAXONOMY.find((entry) => entry.canonical === normalized);
  if (direct) return direct.canonical;

  return normalized;
}

function estimateCalories(canonicals: string[]) {
  return Math.max(220, canonicals.reduce((sum, canonical) => sum + lookupMacro(canonical, "calories"), 0));
}

function estimateMacro(canonicals: string[], key: "protein" | "carbs" | "fat" | "fiber" | "sugar" | "sodium") {
  return canonicals.reduce((sum, canonical) => sum + lookupMacro(canonical, key), 0);
}

function lookupMacro(canonical: string, key: "calories" | "protein" | "carbs" | "fat" | "fiber" | "sugar" | "sodium") {
  const defaults: Record<string, Record<string, number>> = {
    "chicken breast": { calories: 220, protein: 31, carbs: 0, fat: 8, fiber: 0, sugar: 0, sodium: 110 },
    beef: { calories: 280, protein: 29, carbs: 0, fat: 18, fiber: 0, sugar: 0, sodium: 120 },
    rice: { calories: 180, protein: 4, carbs: 39, fat: 1, fiber: 1, sugar: 0, sodium: 5 },
    lentils: { calories: 170, protein: 11, carbs: 28, fat: 1, fiber: 9, sugar: 1, sodium: 12 },
    chickpeas: { calories: 150, protein: 8, carbs: 25, fat: 3, fiber: 7, sugar: 2, sodium: 160 },
    pasta: { calories: 220, protein: 8, carbs: 42, fat: 2, fiber: 2, sugar: 2, sodium: 10 },
    egg: { calories: 120, protein: 12, carbs: 1, fat: 8, fiber: 0, sugar: 0, sodium: 120 },
    "olive oil": { calories: 120, protein: 0, carbs: 0, fat: 14, fiber: 0, sugar: 0, sodium: 0 },
    tomato: { calories: 30, protein: 1, carbs: 7, fat: 0, fiber: 2, sugar: 4, sodium: 8 },
    onion: { calories: 35, protein: 1, carbs: 8, fat: 0, fiber: 2, sugar: 4, sodium: 4 },
    garlic: { calories: 10, protein: 0, carbs: 2, fat: 0, fiber: 0, sugar: 0, sodium: 1 }
  };

  return defaults[canonical]?.[key] ?? (key === "sodium" ? 20 : key === "calories" ? 60 : 2);
}

function deriveDietTags(canonicals: string[]) {
  const tags = new Set<string>();
  const hasAnimalProtein = canonicals.some((canonical) => ["chicken breast", "beef", "salmon"].includes(canonical));
  const hasDairy = canonicals.some((canonical) => ["greek yogurt", "parmesan", "mozzarella"].includes(canonical));
  const hasEgg = canonicals.includes("egg");
  const hasGluten = canonicals.includes("bread") || canonicals.includes("pasta");

  if (!hasAnimalProtein && !hasDairy && !hasEgg) {
    tags.add("vegan");
    tags.add("vegetarian");
  } else if (!hasAnimalProtein) {
    tags.add("vegetarian");
  }
  if (!hasDairy) tags.add("dairy-free");
  if (!hasGluten) tags.add("gluten-free");
  if (canonicals.some((canonical) => ["chicken breast", "beef", "egg", "greek yogurt"].includes(canonical))) {
    tags.add("high-protein");
  }
  if (canonicals.some((canonical) => ["lentils", "chickpeas", "fava beans", "canned beans"].includes(canonical))) {
    tags.add("high-fiber");
  }
  return Array.from(tags);
}

function deriveAllergenTags(canonicals: string[]) {
  const tags = new Set<string>();
  if (canonicals.includes("pasta") || canonicals.includes("bread")) tags.add("gluten");
  if (canonicals.includes("greek yogurt") || canonicals.includes("parmesan") || canonicals.includes("mozzarella")) tags.add("dairy");
  if (canonicals.includes("egg")) tags.add("egg");
  return Array.from(tags);
}

function inferMealType(title: string, canonicals: string[]) {
  const normalized = title.toLowerCase();
  if (/\bbreakfast|omelet|omelette|toast|ful|shakshuka\b/.test(normalized) || canonicals.includes("egg")) return "breakfast" as const;
  if (/\bsalad|soup\b/.test(normalized)) return "lunch" as const;
  return "dinner" as const;
}

function inferCalorieBand(calories: number) {
  if (calories <= 300) return "0_300" as const;
  if (calories <= 500) return "301_500" as const;
  if (calories <= 700) return "501_700" as const;
  return "701_plus" as const;
}

function buildStableRecipeId(title: string, canonicals: string[]) {
  const source = buildRecipeKey(title, canonicals);
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return `src_${hash.toString(36)}`;
}

function buildRecipeKey(title: string, canonicals: string[]) {
  const normalizedTitle = slugify(
    title
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b(style|inspired|recipe|dish)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
  return `${normalizedTitle}|${Array.from(new Set(canonicals)).sort().join("|")}`;
}

function splitInstructions(value: string | null | undefined) {
  if (!value) return [];
  return value
    .split(/\r?\n|(?<=\.)\s+(?=[A-Z])/)
    .map((line) => line.trim())
    .filter((line) => line.length > 8)
    .slice(0, 8);
}

function cleanIngredient(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function normalizeImportedCuisine(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "lebanese" || normalized === "turkish") return "middle eastern";
  return normalized;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "NutriMoment recipe importer"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return (await response.json()) as T;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getNumericArg(flag: string) {
  const arg = process.argv.find((value) => value.startsWith(`${flag}=`));
  if (!arg) return null;
  const parsed = Number(arg.split("=")[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function logImportSummary(recipes: RecipeCatalogDoc[]) {
  const byCuisine = tally(recipes.map((recipe) => recipe.cuisine));
  const byProvider = tally(recipes.map((recipe) => recipe.source?.provider ?? "unknown"));
  process.stdout.write(`By cuisine: ${formatTally(byCuisine)}\n`);
  process.stdout.write(`By provider: ${formatTally(byProvider)}\n`);
}

function tally(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function formatTally(counts: Record<string, number>) {
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([label, count]) => `${label}=${count}`)
    .join(", ");
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => entry !== undefined)
      .map((entry) => stripUndefinedDeep(entry)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefinedDeep(entry)])
    ) as T;
  }

  return value;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
