"use client";

import { ChangeEvent, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Camera, ChefHat, ImagePlus, Plus, Sparkles, Utensils } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useApp } from "@/contexts/AppContext";
import { useHistory } from "@/hooks/useHistory";
import { containerVariants, itemVariants } from "@/lib/animations";
import { getPantryQuantityHint, getPreferredPantryUnit } from "@/lib/pantryQuantity";
import { fileToBase64 } from "@/lib/utils";
import type { Recipe } from "@/lib/types";
import { EmptyState, SectionHero } from "./shared";
import { ResultLegalNotice } from "@/components/legal/LegalNotice";
import { useAuth } from "@/contexts/AuthContext";
import { MealRevealCard } from "@/components/dashboard/MealRevealCard";
import { persistRecipeImageForUser } from "@/lib/recipeImageStorage";
import { buildRecipePhotoQueryCandidates } from "@/lib/recipePhotoQueries";

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

interface ScannerIngredient {
  id: string;
  name: string;
  quantity: string;
}

function createScannerIngredient(name: string, quantity: string): ScannerIngredient {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name,
    quantity
  };
}

function getRecipeIngredientLabel(ingredient: unknown) {
  if (typeof ingredient === "string") return ingredient;

  if (ingredient && typeof ingredient === "object") {
    const maybeIngredient = ingredient as { name?: unknown; quantity?: unknown };
    const name = typeof maybeIngredient.name === "string" ? maybeIngredient.name : "";
    const quantity = typeof maybeIngredient.quantity === "string" ? maybeIngredient.quantity : "";

    return [name, quantity].filter(Boolean).join(" - ") || JSON.stringify(ingredient);
  }

  return String(ingredient);
}

export function ScannerTab() {
  const { t, settings, health, setError } = useApp();
  const { access, getAuthHeaders, refreshAccess, user } = useAuth();
  const { addEntry, replaceEntryRecipes, updateRecipeImage } = useHistory();
  const [manualEntry, setManualEntry] = useState("");
  const [manualQuantity, setManualQuantity] = useState("");
  const [ingredients, setIngredients] = useState<ScannerIngredient[]>([]);
  const [lastScanImage, setLastScanImage] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [historyEntryId, setHistoryEntryId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    action: () => void | Promise<void>;
  } | null>(null);

  const hydrateRecipePhotos = useCallback(
    async (inputRecipes: Recipe[], historyEntryId: string | null) => {
      const seeded = inputRecipes.map((recipe) =>
        hasRenderableImage(recipe.image_url)
          ? { ...recipe, image_loading: false, image_error: false }
          : { ...recipe, image_loading: true, image_error: false }
      );

      setRecipes(seeded);

      const resolved = await Promise.all(
        seeded.map(async (recipe, index) => {
          if (index >= 2) {
            return { ...recipe, image_loading: false, image_error: false };
          }

          if (hasRenderableImage(recipe.image_url)) {
            return recipe;
          }

          try {
            const authHeaders = await getAuthHeaders();
            const response = await fetch(buildRecipePhotoRequestUrl(buildRecipePhotoQuery(recipe)), {
              headers: authHeaders
            });
            const data = (await response.json()) as {
              imageAttributionName?: string;
              imageAttributionUrl?: string;
              imageSource?: "api" | "cache" | "search" | "unsplash" | "wikimedia";
              imageUrl?: string;
              fallbackNotice?: string;
              source?: string;
            };
            await refreshAccess();

            if (!response.ok || !data.imageUrl) {
              return { ...recipe, image_loading: false, image_error: true };
            }

            return {
              ...recipe,
              image_attribution_name: data.imageAttributionName,
              image_attribution_url: data.imageAttributionUrl,
              image_source: data.imageSource,
              image_url: data.imageUrl,
              image_loading: false,
              image_error: false
            };
          } catch {
            return { ...recipe, image_loading: false, image_error: true };
          }
        })
      );

      if (historyEntryId) {
        await replaceEntryRecipes(historyEntryId, resolved);
      }

      setRecipes(resolved);
    },
    [getAuthHeaders, refreshAccess, replaceEntryRecipes]
  );

  const addManualIngredient = () => {
    const next = manualEntry
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !ingredients.some((ingredient) => ingredient.name.toLowerCase() === item.toLowerCase()))
      .map((item) => createScannerIngredient(item, manualQuantity.trim() || `1 ${getPreferredPantryUnit(item)}`));

    if (!next.length) return;
    setIngredients((current) => [...current, ...next]);
    setManualEntry("");
    setManualQuantity("");
  };

  const removeIngredient = (ingredientId: string) => {
    setIngredients((current) => current.filter((item) => item.id !== ingredientId));
  };

  const updateIngredientQuantity = (ingredientId: string, quantity: string) => {
    setIngredients((current) =>
      current.map((item) => (item.id === ingredientId ? { ...item, quantity } : item))
    );
  };

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setScanLoading(true);
    try {
      const image = await fileToBase64(file);
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          image,
          language: settings.recipeLanguage,
          isPantry: false
        })
      });
      const data = (await response.json()) as { result?: string; error?: string; fallbackNotice?: string };
      await refreshAccess();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to scan image");
      }
      if (data.fallbackNotice) {
        setError(data.fallbackNotice);
      }

      const scanned = safeJsonParse<string[]>(data.result ?? "[]", [])
        .map((item) => item.trim())
        .filter(Boolean);

      setLastScanImage(image);
      if (!scanned.length) {
        setError(t("noIngredientsDetected"));
        return;
      }

      setIngredients((current) => {
        const existing = new Set(current.map((item) => item.name.toLowerCase()));
        const nextScanned = scanned
          .filter((item) => !existing.has(item.toLowerCase()))
          .map((item) => createScannerIngredient(item, `1 ${getPreferredPantryUnit(item)}`));

        return [...current, ...nextScanned];
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to scan image";
      setError(message);
    } finally {
      setScanLoading(false);
    }
  };

  const handleGenerateRecipes = async () => {
    if (!ingredients.length && !lastScanImage) {
      setError(t("addOrScanFirst"));
      return;
    }

    setRecipeLoading(true);
    try {
      const ingredientNames = ingredients.map((item) => item.name);
      const ingredientQuantities = ingredients.map((item) => `${item.name} - ${item.quantity}`);
      const response = await fetch("/api/generate-recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          ingredients: ingredientNames.length ? ingredientNames : undefined,
          ingredientQuantities: ingredientQuantities.length ? ingredientQuantities : undefined,
          referenceImage: lastScanImage ?? undefined,
          recipeCount: settings.recipeCount,
          recipeLanguage: settings.recipeLanguage,
          preferredCuisine: settings.preferredCuisine,
          calorieTarget: settings.calorieTarget,
          maxMissingIngredients: settings.maxMissingIngredients,
          diets: health.diets,
          conditions: health.conditions,
          allergens: health.allergens ?? []
        })
      });

      const data = (await response.json()) as {
        result?: string;
        error?: string;
        servedFrom?: "offline_catalog" | "fallback_ai" | "mock";
        fallbackNotice?: string;
      };
      await refreshAccess();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to generate recipes");
      }
      if (data.fallbackNotice) {
        setError(data.fallbackNotice);
      }

      const nextRecipes = safeJsonParse<Recipe[]>(data.result ?? "[]", []);
      setRecipes(nextRecipes);
      const entryId = await addEntry({
        timestamp: new Date().toISOString(),
        ingredients: ingredientQuantities,
        recipes: nextRecipes
      });
      setHistoryEntryId(entryId);
      void hydrateRecipePhotos(nextRecipes, entryId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Recipe generation failed";
      setError(message);
    } finally {
      setRecipeLoading(false);
    }
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      <SectionHero
        title={t("heroTitle")}
        description={t("heroSub")}
        eyebrow={t("liveRecipeVision")}
        chips={[t("scanChip"), t("matchChip"), t("cookChip")]}
        icon={<Camera className="h-6 w-6" />}
        stats={[
          { label: t("ingredientsStat"), value: `${ingredients.length}` },
          { label: t("recipesStat"), value: recipes.length ? `${recipes.length} ${t("readyStatus")}` : t("waitingStatus") },
          {
            label: t("creditsStat"),
            value: access.tier === "free" ? `${access.aiCreditsRemaining}/${access.aiCreditsLimit}` : t("premiumStatus")
          }
        ]}
        aside={
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("scannerFlow")}</p>
            <p className="text-sm leading-relaxed text-emerald-50/72">
              {t("scannerAside")}
            </p>
          </div>
        }
      />

      {access.tier === "free" ? (
        <motion.div variants={itemVariants} className="rounded-[1.5rem] border border-amber-200/16 bg-amber-400/10 px-5 py-4 text-sm text-amber-50/90">
          {t("freePlanScanner")
            .replace("{remaining}", String(access.aiCreditsRemaining))
            .replace("{limit}", String(access.aiCreditsLimit))}
        </motion.div>
      ) : (
        <motion.div variants={itemVariants} className="rounded-[1.5rem] border border-emerald-200/16 bg-emerald-400/10 px-5 py-4 text-sm text-emerald-50/90">
          {t("premiumPlanScanner")}
        </motion.div>
      )}

      <motion.div variants={itemVariants} className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="space-y-5 rounded-[2rem]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">{t("scanIng")}</p>
              <h3 className="text-2xl font-display font-bold text-white">{t("whatIng")}</h3>
            </div>
            <div className="rounded-2xl bg-white/[0.08] p-3 text-cyan-100">
              <Utensils className="h-5 w-5" />
            </div>
          </div>

          <label htmlFor="scanner-photo-upload" className="block">
            <span className="sr-only">{t("uploadFridgePhoto")}</span>
            <input
              id="scanner-photo-upload"
              name="scanner-photo-upload"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleImageUpload}
              aria-label={t("uploadFridgePhoto")}
            />
            <span className="focus-within:ring-2 focus-within:ring-cyan-300 focus-within:ring-offset-2 flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 rounded-[1.5rem] border border-dashed border-white/12 bg-white/[0.04] px-6 text-center transition-ui hover:border-cyan-300/35 hover:bg-white/[0.07]">
              <ImagePlus className="h-8 w-8 text-cyan-200" aria-hidden="true" />
              <span className="text-sm font-semibold text-white" aria-live="polite">
                {scanLoading ? t("identifying") : t("uploadFridgePhoto")}
              </span>
              <span className="text-xs text-emerald-50/55">{t("takePhoto")}</span>
            </span>
          </label>

          <div className="space-y-3">
            <label htmlFor="scanner-manual-ingredient" className="text-sm font-semibold text-emerald-50/88">
              {t("typeIng")}
            </label>
            <div className="flex gap-3">
              <input
                id="scanner-manual-ingredient"
                name="ingredient"
                value={manualEntry}
                onChange={(event) => setManualEntry(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addManualIngredient();
                  }
                }}
                placeholder={t("quickAdd")}
                autoComplete="off"
                spellCheck
                className="focus-ring neo-input h-12 flex-1 rounded-2xl px-4 text-sm transition-ui"
              />
              <label htmlFor="scanner-manual-quantity" className="sr-only">
                {t("ingredientQuantity")}
              </label>
              <input
                id="scanner-manual-quantity"
                name="quantity"
                value={manualQuantity}
                onChange={(event) => setManualQuantity(event.target.value)}
                placeholder={manualEntry.trim() ? getPantryQuantityHint(manualEntry) : t("quantity")}
                autoComplete="off"
                inputMode="text"
                aria-label={t("ingredientQuantity")}
                className="focus-ring neo-input h-12 w-44 rounded-2xl px-4 text-sm transition-ui"
              />
              <Button variant="secondary" leftIcon={<Plus className="h-4 w-4" />} onClick={addManualIngredient}>
                {t("add")}
              </Button>
            </div>
            <div className="rounded-2xl border border-cyan-200/14 bg-cyan-400/10 px-4 py-3 text-xs leading-relaxed text-cyan-50/86">
              {t("quantityGuide")}: {t("quantityGuideDetails")}
            </div>
          </div>
        </Card>

        <Card className="space-y-5 rounded-[2rem]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">{t("reviewIng")}</p>
              <h3 className="text-2xl font-display font-bold text-white">{t("detectedIng")}</h3>
            </div>
            <div className="rounded-2xl bg-white/[0.08] p-3 text-cyan-100">
              <Sparkles className="h-5 w-5" />
            </div>
          </div>

          {ingredients.length ? (
            <div className="grid gap-3">
              {ingredients.map((ingredient) => (
                <div
                  key={ingredient.id}
                  className="grid gap-3 rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-3 text-sm font-medium text-emerald-50/82 sm:grid-cols-[1fr_190px_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{ingredient.name}</p>
                    <p className="text-xs text-emerald-50/50">{getPantryQuantityHint(ingredient.name)}</p>
                  </div>
                  <input
                    id={`scanner-quantity-${ingredient.id}`}
                    name={`quantity-${ingredient.name}`}
                    value={ingredient.quantity}
                    onChange={(event) => updateIngredientQuantity(ingredient.id, event.target.value)}
                    placeholder={getPantryQuantityHint(ingredient.name)}
                    aria-label={`Quantity for ${ingredient.name}`}
                    autoComplete="off"
                    className="focus-ring neo-input h-11 rounded-2xl px-4 text-sm transition-ui"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmState({
                        title: t("removeIngredientTitle"),
                        description: t("removeIngredientDescription"),
                        confirmLabel: t("remove"),
                        action: () => removeIngredient(ingredient.id)
                      })
                    }
                    aria-label={`${t("remove")} ${ingredient.name}`}
                    className="focus-ring rounded-2xl bg-white/[0.05] px-3 py-2 text-xs font-semibold text-emerald-50/65 transition-ui hover:bg-red-500/12 hover:text-red-100"
                  >
                    {t("remove")}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-white/12 bg-white/[0.04] px-5 py-6 text-sm text-emerald-50/55">
              {t("scanFridgeStart")}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Card variant="plain" className="rounded-[1.5rem] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-50/52">{t("preferredCuisine")}</p>
              <p className="mt-2 text-lg font-semibold text-white">{settings.preferredCuisine}</p>
            </Card>
            <Card variant="plain" className="rounded-[1.5rem] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-50/52">{t("dailyCalorieTarget")}</p>
              <p className="mt-2 text-lg font-semibold text-white">{settings.calorieTarget} kcal</p>
            </Card>
            <Card variant="plain" className="rounded-[1.5rem] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-50/52">{t("recipeCount")}</p>
              <p className="mt-2 text-lg font-semibold text-white">{settings.recipeCount}</p>
            </Card>
          </div>

          <Button
            fullWidth
            size="lg"
            loading={recipeLoading}
            leftIcon={<ChefHat className="h-5 w-5" />}
            onClick={handleGenerateRecipes}
          >
            {recipeLoading ? t("aiThinking") : t("generateRecipes")}
          </Button>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants}>
        {recipes.length ? (
          <div className="space-y-4">
            <ResultLegalNotice mode="recipes" />
            <div className="grid gap-5 lg:grid-cols-3">
              {recipes.map((recipe, index) => (
                <MealRevealCard
                  key={recipe.name}
                  deferImageLookup={index >= 2}
                  eyebrow={getRecipeEyebrow(recipe, t)}
                  name={recipe.name}
                  visualMatchLabel={recipe.visual_match_label}
                  summary={buildRecipeSummary(recipe, t)}
                  previewLabel={getRecipePreviewLabel(recipe, t)}
                  previewItems={buildRecipePreviewItems(recipe)}
                  imageUrl={recipe.image_url}
                  imageSource={recipe.image_source}
                  imageAttributionName={recipe.image_attribution_name}
                  imageAttributionUrl={recipe.image_attribution_url}
                  imageLoading={recipe.image_loading}
                  imageError={recipe.image_error}
                  imageQuery={buildRecipePhotoQuery(recipe)}
                  onImageResolved={
                    user && historyEntryId
                      ? async ({ imageAttributionName, imageAttributionUrl, imageSource, imageUrl }) => {
                          const persistedImageUrl = await persistRecipeImageForUser({
                            uid: user.uid,
                            imageUrl,
                              query: serializeRecipePhotoQuery(buildRecipePhotoQuery(recipe))
                            });
                          const recipeIndex = recipes.findIndex((candidate) => candidate.name === recipe.name);
                          if (recipeIndex >= 0) {
                            await updateRecipeImage(
                              historyEntryId,
                              recipeIndex,
                              persistedImageUrl || imageUrl,
                              false,
                              imageSource,
                              { name: imageAttributionName, url: imageAttributionUrl }
                            );
                          }
                        }
                      : undefined
                  }
                  stats={buildRecipeStats(recipe)}
                  sections={buildRecipeSections(recipe, t)}
                />
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            title={t("readyToCook")}
            description={t("readyToCookDesc")}
          />
        )}
      </motion.div>
      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title ?? ""}
        description={confirmState?.description ?? ""}
        confirmLabel={confirmState?.confirmLabel}
        onCancel={() => setConfirmState(null)}
        onConfirm={async () => {
          if (!confirmState) return;
          try {
            await confirmState.action();
          } finally {
            setConfirmState(null);
          }
        }}
      />
    </motion.div>
  );
}

function hasRenderableImage(imageUrl?: string) {
  return Boolean(imageUrl && /^(https?:|data:)/.test(imageUrl));
}

function buildRecipePhotoQuery(recipe: Recipe) {
  return buildRecipePhotoQueryCandidates({
    cuisine: recipe.cuisine,
    imageSearchIndex: recipe.image_search_index,
    imageSearchIndices: recipe.image_search_indices,
    ingredients: recipe.ingredients,
    missingIngredients: recipe.missing_ingredients,
    name: recipe.name
  });
}

function buildRecipePhotoRequestUrl(queries: string[]) {
  const params = new URLSearchParams();
  queries.slice(0, 5).forEach((query, index) => {
    if (index === 0) {
      params.set("query", query);
    } else {
      params.append("alt", query);
    }
  });

  return `/api/recipe-photo?${params.toString()}`;
}

function serializeRecipePhotoQuery(queries: string[]) {
  return queries.join(" || ");
}

function buildRecipeStats(recipe: Recipe) {
  return [
    { label: "kcal", value: recipe.calories },
    { label: "protein", value: recipe.protein },
    { label: "carbs", value: recipe.carbs },
    { label: "fat", value: recipe.fat }
  ];
}

function buildRecipeSummary(recipe: Recipe, t: ReturnType<typeof useApp>["t"]) {
  const originLabel =
    recipe.recipe_origin === "exact_scan_match"
      ? t("exactScannedDish")
      : recipe.recipe_origin === "similar_ingredients"
        ? t("similarIngredients")
        : null;
  const preferenceHits = recipe.preference_hits?.length
    ? t("preferenceMatches").replace("{count}", String(recipe.preference_hits.length))
    : null;
  const scanExplanation =
    recipe.recipe_origin === "exact_scan_match" && recipe.scan_match_explanation
      ? recipe.scan_match_explanation
      : null;

  return [originLabel, recipe.cuisine, recipe.match_quality, preferenceHits, scanExplanation].filter(Boolean).join(" / ");
}

function buildRecipePreviewItems(recipe: Recipe) {
  return [...recipe.ingredients, ...recipe.missing_ingredients].map(getRecipeIngredientLabel).slice(0, 5);
}

function buildRecipeSections(recipe: Recipe, t: ReturnType<typeof useApp>["t"]) {
  return [
    {
      title: t("ingredientsYouHave"),
      tone: "have" as const,
      items: recipe.ingredients.map(getRecipeIngredientLabel)
    },
    {
      title: t("ingredientsYouNeed"),
      tone: "need" as const,
      items: recipe.missing_ingredients.map(getRecipeIngredientLabel)
    },
    {
      title: t("prepSteps"),
      tone: "steps" as const,
      items: recipe.steps
    }
  ];
}

function getRecipeEyebrow(recipe: Recipe, t: ReturnType<typeof useApp>["t"]) {
  if (recipe.recipe_origin === "exact_scan_match") return t("exactScannedDish");
  if (recipe.recipe_origin === "similar_ingredients") return t("similarIngredients");
  return undefined;
}

function getRecipePreviewLabel(recipe: Recipe, t: ReturnType<typeof useApp>["t"]) {
  if (recipe.recipe_origin === "exact_scan_match") {
    return t("exactRecipePreview");
  }

  if (recipe.recipe_origin === "similar_ingredients") {
    return t("similarRecipePreview");
  }

  return t("previewIngredientsMacros");
}
