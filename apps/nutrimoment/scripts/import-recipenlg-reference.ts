import { createReadStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { config as loadEnv } from "dotenv";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";
import {
  buildRecipeReferenceLookupBuckets,
  buildRecipeReferenceIngredientSet,
  expandRecipeReferenceIngredient,
  normalizeRecipeReferenceIngredient
} from "../src/lib/recipeReferenceNormalization";
import {
  buildRecipeReferenceTaxonomyBuckets,
  classifyRecipeReferenceTaxonomy
} from "../src/lib/recipeReferenceTaxonomy";
import type { RecipeReferenceDoc } from "../src/lib/recipeReferenceTypes";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const DEFAULT_COLLECTION = "recipeReferenceRecipes";
const DEFAULT_BATCH_SIZE = 400;
const CSV_PATH = getStringArg("--csv") ?? "C:\\Users\\gamal\\Downloads\\nutrimoment recipe import\\RecipeNLG_dataset.csv";
const SERVICE_ACCOUNT_PATH =
  getStringArg("--service-account") ??
  "C:\\Users\\gamal\\Downloads\\nutrimoment recipe import\\serviceAccountKey.json";
const COLLECTION = getStringArg("--collection") ?? DEFAULT_COLLECTION;
const MAX_ROWS = getNumberArg("--max");
const DRY_RUN = process.argv.includes("--dry-run");
const IMPORT_ALL = process.argv.includes("--all");
const OFFSET_ROWS = getNumberArg("--offset") ?? 0;

interface RecipeNlgRow {
  title: string;
  ingredients: string;
  directions: string;
  link: string;
  source: string;
  NER: string;
}

async function main() {
  if (!existsSync(CSV_PATH)) {
    throw new Error(`RecipeNLG CSV not found: ${CSV_PATH}`);
  }

  if (!IMPORT_ALL && MAX_ROWS == null && !DRY_RUN) {
    throw new Error("Refusing full import without --all or --max. Use --dry-run to inspect safely.");
  }

  loadServiceAccountFallback();
  if (!DRY_RUN && !hasFirebaseAdminConfig()) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const db = DRY_RUN ? null : getAdminDb();
  const stream = createReadStream(CSV_PATH, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let headers: string[] | null = null;
  let seenRows = 0;
  let processedRows = 0;
  let importedRows = 0;
  let skippedRows = 0;
  let batch = db?.batch();
  let batchCount = 0;
  const startedAt = Date.now();

  for await (const line of rl) {
    if (!headers) {
      headers = parseCsvLine(line);
      continue;
    }

    seenRows += 1;
    if (seenRows <= OFFSET_ROWS) continue;
    if (MAX_ROWS != null && processedRows >= MAX_ROWS) break;

    processedRows += 1;
    const row = parseRecipeNlgRow(headers, parseCsvLine(line));
    const doc = buildRecipeReferenceDoc(row);
    if (!doc) {
      skippedRows += 1;
      continue;
    }

    importedRows += 1;
    if (!DRY_RUN && db && batch) {
      batch.set(db.collection(COLLECTION).doc(doc.id), stripUndefinedDeep(doc), { merge: true });
      batchCount += 1;

      if (batchCount >= DEFAULT_BATCH_SIZE) {
        await batch.commit();
        process.stdout.write(`Imported ${importedRows} reference recipes, skipped ${skippedRows}...\n`);
        batch = db.batch();
        batchCount = 0;
      }
    } else if (importedRows <= 5) {
      process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`);
    }
  }

  if (!DRY_RUN && batch && batchCount > 0) {
    await batch.commit();
  }

  process.stdout.write(
    [
      `RecipeNLG reference import complete.`,
      `Collection: ${COLLECTION}.`,
      `Rows seen: ${seenRows}.`,
      `Rows processed: ${processedRows}.`,
      `Imported: ${importedRows}.`,
      `Skipped: ${skippedRows}.`,
      `Duration: ${Date.now() - startedAt}ms.`,
      DRY_RUN ? "Dry run only. No Firestore writes were performed." : ""
    ]
      .filter(Boolean)
      .join(" ") + "\n"
  );
}

function buildRecipeReferenceDoc(row: RecipeNlgRow): RecipeReferenceDoc | null {
  const title = cleanText(row.title);
  const ingredients = parseJsonStringArray(row.ingredients).map(cleanText).filter(Boolean);
  const directions = parseJsonStringArray(row.directions).map(cleanDirection).filter((step) => step.length >= 8);
  if (!title || ingredients.length < 2 || directions.length < 1) return null;
  if (title.length > 140 || directions.join(" ").length < 40) return null;

  // Use full ingredient lines as the canonical source. RecipeNLG's NER field is
  // useful, but it can over-extract flavor words such as "chicken" from
  // "chicken bouillon" or "chicken stuffing", which causes wrong protein matches.
  const ingredientSource = ingredients;
  const ingredientCanonicals = buildRecipeReferenceIngredientSet(ingredientSource);
  if (ingredientCanonicals.length < 2) return null;

  const mainIngredients = pickMainIngredients(title, ingredientCanonicals, ingredientSource);
  const timestamp = Date.now();
  const id = `recipenlg-${stableHash([title, row.link || ingredients.slice(0, 4).join("|")].join("|"))}`;
  const taxonomy = classifyRecipeReferenceTaxonomy({
    directions,
    ingredientCanonicals,
    ingredients,
    mainIngredients,
    title
  });
  const cuisine = taxonomy.cuisineConfidence >= 75 ? taxonomy.cuisine : "Global";
  const lookup = buildRecipeReferenceLookupBuckets({ cuisine, mainIngredients });
  const taxonomyLookupBuckets = buildRecipeReferenceTaxonomyBuckets(taxonomy, mainIngredients);

  return {
    id,
    title,
    cuisine,
    cuisineKey: lookup.cuisineKey,
    cuisineConfidence: taxonomy.cuisineConfidence,
    ingredients: ingredients.slice(0, 28),
    ingredientCanonicals,
    mainIngredients,
    mainIngredientKeys: lookup.mainIngredientKeys,
    lookupBuckets: lookup.lookupBuckets,
    protein: taxonomy.protein,
    proteinKey: taxonomy.proteinKey,
    mealType: taxonomy.mealType,
    cookingMethod: taxonomy.cookingMethod,
    difficulty: taxonomy.difficulty,
    flavorProfile: taxonomy.flavorProfile,
    tags: taxonomy.tags,
    estimatedCalories: taxonomy.estimatedCalories,
    ingredientIds: taxonomy.ingredientIds,
    techniques: taxonomy.techniques,
    estimatedPrepMinutes: taxonomy.estimatedPrepMinutes,
    estimatedCookMinutes: taxonomy.estimatedCookMinutes,
    commonAllergens: taxonomy.commonAllergens,
    imagePrompt: taxonomy.imagePrompt,
    publishStatus: taxonomy.publishStatus,
    validationWarnings: taxonomy.validationWarnings,
    taxonomy,
    taxonomyLookupBuckets,
    directions: directions.slice(0, 12),
    source: {
      provider: "recipenlg",
      url: normalizeRecipeUrl(row.link),
      name: cleanText(row.source)
    },
    searchTokens: buildSearchTokens(title, cuisine, ingredientCanonicals, mainIngredients, taxonomy),
    qualityScore: scoreRecipeQuality({ title, ingredients, directions, ingredientCanonicals, mainIngredients }),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function pickMainIngredients(title: string, canonicals: string[], originalIngredients: string[]) {
  const titleExpanded = expandRecipeReferenceIngredient(title);
  const titleMatches = canonicals.filter((canonical) => titleExpanded.includes(canonical));
  const originalMain = originalIngredients
    .flatMap(expandRecipeReferenceIngredient)
    .filter((ingredient) => isMainIngredientCandidate(ingredient));

  return Array.from(new Set([...titleMatches, ...originalMain, ...canonicals.filter(isMainIngredientCandidate)]))
    .slice(0, 8);
}

function isMainIngredientCandidate(value: string) {
  return /^(chicken|beef|steak|ground beef|ground meat|lamb|liver|shrimp|seafood|fish|salmon|egg|rice|pasta|bread|potato|tomato|bell pepper|mushroom|spinach|cheese|dairy|legumes)$/.test(value);
}

function scoreRecipeQuality(input: {
  title: string;
  ingredients: string[];
  directions: string[];
  ingredientCanonicals: string[];
  mainIngredients: string[];
}) {
  let score = 40;
  score += Math.min(20, input.ingredients.length * 2);
  score += Math.min(25, input.directions.length * 4);
  score += Math.min(10, input.mainIngredients.length * 2);
  score += /\b(cook|bake|grill|roast|fry|simmer|boil|saute|stir|marinate)\b/i.test(input.directions.join(" ")) ? 10 : 0;
  score -= /\b(jello|gelatin|frosting|cake mix)\b/i.test(input.title) ? 8 : 0;
  return Math.max(0, Math.min(100, score));
}

function buildSearchTokens(
  title: string,
  cuisine: string,
  ingredients: string[],
  mainIngredients: string[],
  taxonomy: ReturnType<typeof classifyRecipeReferenceTaxonomy>
) {
  return Array.from(
    new Set(
      [
        title,
        cuisine,
        taxonomy.cuisine,
        taxonomy.protein ?? "",
        taxonomy.mealType,
        taxonomy.cookingMethod,
        taxonomy.difficulty,
        taxonomy.publishStatus,
        ...taxonomy.flavorProfile,
        ...taxonomy.tags,
        ...taxonomy.techniques,
        ...taxonomy.commonAllergens,
        ...taxonomy.ingredientIds,
        ...ingredients,
        ...mainIngredients,
        ...title.toLowerCase().split(/[^a-z0-9]+/g).filter((token) => token.length >= 3)
      ]
        .map((value) => normalizeRecipeReferenceIngredient(value))
        .filter(Boolean)
    )
  ).slice(0, 80);
}

function parseRecipeNlgRow(headers: string[], values: string[]): RecipeNlgRow {
  const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  return {
    title: row.title ?? "",
    ingredients: row.ingredients ?? "",
    directions: row.directions ?? "",
    link: row.link ?? "",
    source: row.source ?? "",
    NER: row.NER ?? ""
  };
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current);
  return values;
}

function parseJsonStringArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return value
      .replace(/^\[|\]$/g, "")
      .split(/\s*,\s*/)
      .map((entry) => entry.replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanDirection(value: string) {
  return cleanText(value)
    .replace(/^\d+\s*[.)-]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRecipeUrl(value: string) {
  const cleaned = cleanText(value);
  if (!cleaned) return undefined;
  return /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
}

function loadServiceAccountFallback() {
  if (hasFirebaseAdminConfig() || !existsSync(SERVICE_ACCOUNT_PATH)) return;
  const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, "utf8")) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };
  if (serviceAccount.project_id) process.env.FIREBASE_ADMIN_PROJECT_ID = serviceAccount.project_id;
  if (serviceAccount.client_email) process.env.FIREBASE_ADMIN_CLIENT_EMAIL = serviceAccount.client_email;
  if (serviceAccount.private_key) process.env.FIREBASE_ADMIN_PRIVATE_KEY = serviceAccount.private_key;
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
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

function getStringArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function getNumberArg(name: string) {
  const value = getStringArg(name);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
