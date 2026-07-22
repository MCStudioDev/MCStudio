import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { RecipeCatalogDoc } from "@/lib/domain";
import { logger } from "@/lib/logger";

interface RealSourceRecipeArtifact {
  recipes?: RecipeCatalogDoc[];
}

let cachedRecipes: RecipeCatalogDoc[] | null = null;

export function getRealSourceArtifactRecipes(): RecipeCatalogDoc[] {
  if (cachedRecipes) return cachedRecipes;

  const artifactPath = findLatestRealSourceArtifactPath();
  if (!artifactPath) {
    cachedRecipes = [];
    return cachedRecipes;
  }

  try {
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as RealSourceRecipeArtifact;
    cachedRecipes = Array.isArray(artifact.recipes) ? artifact.recipes.filter(isUsableRecipeDoc) : [];
    logger.info("Loaded local real-source recipe artifact", {
      artifactPath,
      recipeCount: cachedRecipes.length
    });
  } catch (error) {
    cachedRecipes = [];
    logger.warn("Local real-source recipe artifact could not be loaded", {
      artifactPath,
      error
    });
  }

  return cachedRecipes;
}

function findLatestRealSourceArtifactPath() {
  const candidateDirs = [
    path.join(process.cwd(), ".generated"),
    path.join(process.cwd(), "apps", "nutrimoment", ".generated")
  ];

  for (const dir of candidateDirs) {
    if (!existsSync(dir)) continue;
    const latest = readdirSync(dir)
      .filter((file) => /^real-source-import-.*\.json$/i.test(file))
      .sort()
      .at(-1);
    if (latest) return path.join(dir, latest);
  }

  return null;
}

function isUsableRecipeDoc(value: RecipeCatalogDoc) {
  return Boolean(
    value &&
      typeof value.id === "string" &&
      typeof value.title === "string" &&
      Array.isArray(value.ingredients) &&
      Array.isArray(value.ingredientCanonicals) &&
      Array.isArray(value.requiredCanonicals) &&
      Array.isArray(value.optionalCanonicals) &&
      Array.isArray(value.steps)
  );
}
