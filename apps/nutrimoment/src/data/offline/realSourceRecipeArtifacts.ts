import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { RecipeCatalogDoc } from "@/lib/domain";
import { logger } from "@/lib/logger";
import { hasAuthenticRecipeInstructions } from "@/services/recipePipeline/recipeValidator";
import { CURATED_TRUSTED_RECIPE_CATALOG } from "@/data/offline/curatedTrustedRecipeCatalog";

interface RealSourceRecipeArtifact {
  recipes?: RecipeCatalogDoc[];
}

let cachedRecipes: RecipeCatalogDoc[] | null = null;
const DEFAULT_REAL_SOURCE_ARTIFACT = "real-source-import-import-2026-04-25T22-14-20-757Z.json";

export function getRealSourceArtifactRecipes(): RecipeCatalogDoc[] {
  if (cachedRecipes) return cachedRecipes;
  if (process.env.NODE_ENV === "production") {
    cachedRecipes = CURATED_TRUSTED_RECIPE_CATALOG;
    return cachedRecipes;
  }

  const artifactPath = findLatestRealSourceArtifactPath();
  if (!artifactPath) {
    cachedRecipes = CURATED_TRUSTED_RECIPE_CATALOG;
    return cachedRecipes;
  }

  try {
    const artifact = JSON.parse(
      readFileSync(/* turbopackIgnore: true */ artifactPath, "utf8")
    ) as RealSourceRecipeArtifact;
    const artifactRecipes = Array.isArray(artifact.recipes) ? artifact.recipes : [];
    cachedRecipes = dedupeRecipes([
      ...CURATED_TRUSTED_RECIPE_CATALOG,
      ...artifactRecipes.filter(isUsableRealSourceRecipeDoc)
    ]);
    logger.info("Loaded local real-source recipe artifact", {
      artifactPath,
      recipeCount: cachedRecipes.length,
      rejectedRecipeCount: artifactRecipes.length - cachedRecipes.length
    });
  } catch (error) {
    cachedRecipes = CURATED_TRUSTED_RECIPE_CATALOG;
    logger.warn("Local real-source recipe artifact could not be loaded", {
      artifactPath,
      error
    });
  }

  return cachedRecipes;
}

function dedupeRecipes(recipes: RecipeCatalogDoc[]) {
  return Array.from(new Map(recipes.map((recipe) => [recipe.id, recipe])).values());
}

function findLatestRealSourceArtifactPath() {
  const artifactName = process.env.REAL_SOURCE_RECIPE_ARTIFACT_FILENAME?.trim() || DEFAULT_REAL_SOURCE_ARTIFACT;
  if (!/^real-source-import-[a-z0-9._-]+\.json$/i.test(artifactName)) {
    logger.warn("Rejected unsafe real-source recipe artifact filename", { artifactName });
    return null;
  }

  const candidateDirs = [
    path.join(/* turbopackIgnore: true */ process.cwd(), ".generated"),
    path.join(/* turbopackIgnore: true */ process.cwd(), "apps", "nutrimoment", ".generated")
  ];

  for (const dir of candidateDirs) {
    const artifactPath = path.join(dir, artifactName);
    if (existsSync(/* turbopackIgnore: true */ artifactPath)) return artifactPath;
  }

  return null;
}

export function isUsableRealSourceRecipeDoc(value: RecipeCatalogDoc) {
  return Boolean(
    value &&
      typeof value.id === "string" &&
      typeof value.title === "string" &&
      Array.isArray(value.ingredients) &&
      Array.isArray(value.ingredientCanonicals) &&
      Array.isArray(value.requiredCanonicals) &&
      Array.isArray(value.optionalCanonicals) &&
      Array.isArray(value.steps) &&
      hasAuthenticRecipeInstructions(value.steps)
  );
}
