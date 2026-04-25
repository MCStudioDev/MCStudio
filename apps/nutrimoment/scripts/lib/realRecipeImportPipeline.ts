import type {
  RecipeCanonicalStagingDoc,
  RecipeCatalogDoc,
  RecipeRawImportDoc,
  RecipeSourceDoc
} from "../../src/lib/domain";
import { getAdminDb } from "../../src/lib/firebaseAdmin";

export interface ExternalRecipeRecord {
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
  language?: string;
}

const DEFAULT_WRITE_BATCH_SIZE = 150;

export async function seedRecipeSourceRegistry(sources: RecipeSourceDoc[], importedAt: number) {
  const db = getAdminDb();
  for (let index = 0; index < sources.length; index += DEFAULT_WRITE_BATCH_SIZE) {
    const chunk = sources.slice(index, index + DEFAULT_WRITE_BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((source) => {
      batch.set(
        db.collection("recipeSources").doc(source.id),
        stripUndefinedDeep({
          ...source,
          lastImportedAt: importedAt
        }),
        { merge: true }
      );
    });
    await batch.commit();
  }
}

export async function seedRawImportedRecipes(rawImports: RecipeRawImportDoc[]) {
  const db = getAdminDb();
  for (let index = 0; index < rawImports.length; index += DEFAULT_WRITE_BATCH_SIZE) {
    const chunk = rawImports.slice(index, index + DEFAULT_WRITE_BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((rawImport) => {
      batch.set(db.collection("recipeRawImports").doc(rawImport.id), stripUndefinedDeep(rawImport), { merge: true });
    });
    await batch.commit();
  }
}

export async function seedCanonicalRecipeStaging(stagingDocs: RecipeCanonicalStagingDoc[]) {
  const db = getAdminDb();
  for (let index = 0; index < stagingDocs.length; index += DEFAULT_WRITE_BATCH_SIZE) {
    const chunk = stagingDocs.slice(index, index + DEFAULT_WRITE_BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((stagingDoc) => {
      batch.set(db.collection("recipeCanonicalStaging").doc(stagingDoc.id), stripUndefinedDeep(stagingDoc), {
        merge: true
      });
    });
    await batch.commit();
  }
}

export async function seedFinalRecipes(recipes: RecipeCatalogDoc[]) {
  const db = getAdminDb();
  for (let index = 0; index < recipes.length; index += DEFAULT_WRITE_BATCH_SIZE) {
    const chunk = recipes.slice(index, index + DEFAULT_WRITE_BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((recipe) => {
      batch.set(db.collection("recipes").doc(recipe.id), stripUndefinedDeep(recipe), { merge: true });
    });
    await batch.commit();
    process.stdout.write(`Imported ${Math.min(index + chunk.length, recipes.length)}/${recipes.length} final recipes...\n`);
  }
}

export function buildImportBatchId(now = new Date()) {
  return `import-${now.toISOString().replace(/[:.]/g, "-")}`;
}

export function buildRawImportDoc(input: {
  importBatchId: string;
  record: ExternalRecipeRecord;
  fetchedAt: number;
  sourceId: string;
}): RecipeRawImportDoc {
  const recipeFingerprint = buildRecipeFingerprint(input.record.title, input.record.ingredients, input.record.steps);
  return {
    id: `raw_${stableHash(`${input.sourceId}|${input.record.source.externalId ?? input.record.source.url ?? recipeFingerprint}`)}`,
    sourceId: input.sourceId,
    importBatchId: input.importBatchId,
    externalId: input.record.source.externalId,
    sourceUrl: input.record.source.url,
    title: input.record.title,
    cuisine: input.record.cuisine,
    language: input.record.language ?? "en",
    ingredients: input.record.ingredients,
    steps: input.record.steps,
    imageUrl: input.record.imageUrl,
    license: input.record.source.license,
    recipeFingerprint,
    fetchedAt: input.fetchedAt
  };
}

export function buildCanonicalStagingDoc(input: {
  importBatchId: string;
  rawImport: RecipeRawImportDoc;
  recipe: RecipeCatalogDoc;
  duplicateKey: string;
  qualityScore: number;
}): RecipeCanonicalStagingDoc {
  return {
    id: `stg_${stableHash(`${input.rawImport.id}|${input.recipe.id}`)}`,
    rawImportId: input.rawImport.id,
    sourceId: input.rawImport.sourceId,
    importBatchId: input.importBatchId,
    canonicalTitle: input.recipe.title,
    normalizedTitle: slugify(input.recipe.title),
    cuisine: input.recipe.cuisine,
    ingredientCanonicals: input.recipe.ingredientCanonicals,
    steps: input.recipe.steps,
    duplicateKey: input.duplicateKey,
    source: {
      provider: input.recipe.source?.provider ?? input.rawImport.sourceId,
      externalId: input.recipe.source?.externalId ?? input.rawImport.externalId,
      url: input.recipe.source?.url ?? input.rawImport.sourceUrl,
      license: input.recipe.source?.license ?? input.rawImport.license
    },
    localized: input.recipe.localized,
    image: {
      storagePath: input.recipe.image.storagePath,
      thumbPath: input.recipe.image.thumbPath
    },
    qualityScore: input.qualityScore,
    status: "approved",
    candidateRecipeId: input.recipe.id,
    createdAt: input.rawImport.fetchedAt,
    updatedAt: input.rawImport.fetchedAt
  };
}

export function buildRecipeFingerprint(title: string, ingredients: string[], steps: string[]) {
  return stableHash(
    [
      slugify(title),
      ...ingredients.map((ingredient) => ingredient.trim().toLowerCase()).sort(),
      ...steps.slice(0, 4).map((step) => step.trim().toLowerCase())
    ].join("|")
  );
}

export function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
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
