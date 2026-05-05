"use client";

import { ChangeEvent, useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChefHat, ImagePlus, Plus, Sparkles, Utensils } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useApp } from "@/contexts/AppContext";
import { useHistory } from "@/hooks/useHistory";
import { containerVariants, itemVariants } from "@/lib/animations";
import { translateIngredientToEnglish } from "@/lib/arabicRecipeLocalization";
import { fileToBase64 } from "@/lib/utils";
import type { Recipe } from "@/lib/types";
import { EmptyState } from "./shared";
import { ResultLegalNotice } from "@/components/legal/LegalNotice";
import { useAuth } from "@/contexts/AuthContext";
import { MealRevealCard } from "@/components/dashboard/MealRevealCard";
import { persistRecipeImageForUser } from "@/lib/recipeImageStorage";
import { buildEnglishRecipePhotoContext, buildEnglishRecipePhotoIngredients } from "@/lib/recipePhotoLanguage";
import { buildRecipePhotoQueryCandidates } from "@/lib/recipePhotoQueries";

// Keep a small gap between premium image requests to avoid Replicate burst rate limits
// without making the scanner page feel artificially slow.
const PREMIUM_REPLICATE_LOOKUP_DELAY_MS = 1200;
const PREMIUM_REPLICATE_MAX_RETRIES = 4;
const PREMIUM_REPLICATE_MAX_RETRY_AFTER_MS = 12 * 1000;
const PREMIUM_REPLICATE_REQUEUE_DELAY_MS = 5000;
const PREMIUM_REPLICATE_REQUEUE_ROUNDS = 6;

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
}

function createScannerIngredient(name: string): ScannerIngredient {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name
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
  const recipeRequestVersionRef = useRef(0);
  const [manualEntry, setManualEntry] = useState("");
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
    async (inputRecipes: Recipe[], historyEntryId: string | null, requestVersion: number) => {
      if (requestVersion !== recipeRequestVersionRef.current) return;
      const isPremium = access.tier === "premium";

      const renderableImageCounts = new Map<string, number>();
      inputRecipes.forEach((recipe) => {
        if (!hasRenderableImage(recipe.image_url)) return;
        renderableImageCounts.set(recipe.image_url, (renderableImageCounts.get(recipe.image_url) ?? 0) + 1);
      });

      const keptRenderableUrls = new Set<string>();
      const duplicateRefreshFlags = inputRecipes.map((recipe) => {
        if (!hasRenderableImage(recipe.image_url)) return false;
        const count = renderableImageCounts.get(recipe.image_url) ?? 0;
        if (count <= 1) {
          keptRenderableUrls.add(recipe.image_url);
          return false;
        }
        if (!keptRenderableUrls.has(recipe.image_url)) {
          keptRenderableUrls.add(recipe.image_url);
          return false;
        }
        return true;
      });

      const seeded = inputRecipes.map((recipe, index) =>
        hasRenderableImage(recipe.image_url) && !duplicateRefreshFlags[index]
          ? { ...recipe, image_loading: false, image_error: false }
          : { ...recipe, image_loading: true, image_error: false }
      );

      if (requestVersion !== recipeRequestVersionRef.current) return;
      setRecipes(seeded);

      const usedImageUrls = new Set(
        seeded
          .filter((_, index) => !duplicateRefreshFlags[index])
          .map((recipe) => recipe.image_url)
          .filter((imageUrl): imageUrl is string => hasRenderableImage(imageUrl))
      );
      const resolved: Recipe[] = [...seeded];
      const pendingPremiumIndexes = new Set<number>();
      let lookupCount = 0;
      const maxLookups = isPremium ? inputRecipes.length : Math.min(Math.max(inputRecipes.length, 4), 8);

      const resolveRecipePhoto = async (recipe: Recipe) => {
        let response: Response | null = null;
        let data:
          | {
              imageAttributionName?: string;
              imageAttributionUrl?: string;
              imageSource?: "api" | "cache" | "search" | "unsplash" | "wikimedia";
              imageUrl?: string;
              fallbackNotice?: string;
              source?: string;
            }
          | null = null;
        let attempt = 0;

        while (attempt <= (isPremium ? PREMIUM_REPLICATE_MAX_RETRIES : 0)) {
          const authHeaders = await getAuthHeaders();
          response = await fetch(
            buildRecipePhotoRequestUrl(
              buildRecipePhotoQuery(recipe),
              buildRecipePhotoPromptIngredients(recipe),
              Array.from(usedImageUrls),
              {
                cuisine: buildRecipePhotoCuisine(recipe),
                exactNames: buildRecipePhotoExactNames(recipe)
              }
            ),
            {
              headers: authHeaders
            }
          );
          data = (await response.json()) as {
            imageAttributionName?: string;
            imageAttributionUrl?: string;
            imageSource?: "api" | "cache" | "search" | "unsplash" | "wikimedia";
            imageUrl?: string;
            fallbackNotice?: string;
            source?: string;
          };

          if (!isPremium) {
            await refreshAccess();
          }

          if (response.ok && data.imageUrl) {
            return { data, ok: true as const, response };
          }

          const retryAfterSeconds = Number(response.headers.get("Retry-After") ?? "0") || 0;
          const canRetry =
            isPremium &&
            attempt < PREMIUM_REPLICATE_MAX_RETRIES &&
            (response.status === 429 || response.status === 503);

          if (!canRetry) {
            break;
          }

          attempt += 1;
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              Math.min(
                PREMIUM_REPLICATE_MAX_RETRY_AFTER_MS,
                Math.max(PREMIUM_REPLICATE_LOOKUP_DELAY_MS, retryAfterSeconds * 1000)
              )
            )
          );
        }

        return { data, ok: false as const, response };
      };

      for (const [index, recipe] of seeded.entries()) {
        if (requestVersion !== recipeRequestVersionRef.current) {
          return;
        }

        const needsLookup = duplicateRefreshFlags[index] || !hasRenderableImage(recipe.image_url);

        if (!needsLookup) {
          resolved[index] = { ...recipe, image_loading: false, image_error: false };
          continue;
        }

        if (lookupCount >= maxLookups) {
          resolved[index] = { ...recipe, image_loading: false, image_error: false };
          continue;
        }

        lookupCount += 1;

        try {
          const { data, ok } = await resolveRecipePhoto(recipe);

          if (!ok || !data?.imageUrl) {
            resolved[index] = {
              ...recipe,
              image_loading: isPremium,
              image_error: !isPremium
            };
            if (isPremium) {
              pendingPremiumIndexes.add(index);
            }
            if (requestVersion === recipeRequestVersionRef.current) {
              setRecipes([...resolved]);
            }
            if (historyEntryId && !isPremium) {
              await updateRecipeImage(
                historyEntryId,
                index,
                recipe.image_url ?? "",
                true,
                recipe.image_source,
                {
                  name: recipe.image_attribution_name,
                  url: recipe.image_attribution_url
                }
              );
            }
            continue;
          }

          usedImageUrls.add(data.imageUrl);
          resolved[index] = {
            ...recipe,
            image_attribution_name: data.imageAttributionName,
            image_attribution_url: data.imageAttributionUrl,
            image_source: data.imageSource,
            image_url: data.imageUrl,
            image_loading: false,
            image_error: false
          };
          if (requestVersion === recipeRequestVersionRef.current) {
            setRecipes([...resolved]);
          }
          if (historyEntryId) {
            await updateRecipeImage(
              historyEntryId,
              index,
              data.imageUrl,
              false,
              data.imageSource,
              {
                name: data.imageAttributionName,
                url: data.imageAttributionUrl
              }
            );
          }
        } catch {
          resolved[index] = { ...recipe, image_loading: false, image_error: true };
          if (requestVersion === recipeRequestVersionRef.current) {
            setRecipes([...resolved]);
          }
          if (historyEntryId) {
            await updateRecipeImage(
              historyEntryId,
              index,
              recipe.image_url ?? "",
              true,
              recipe.image_source,
              {
                name: recipe.image_attribution_name,
                url: recipe.image_attribution_url
              }
            );
          }
        }

        if (isPremium && lookupCount < maxLookups && index < seeded.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, PREMIUM_REPLICATE_LOOKUP_DELAY_MS));
        }
      }

      if (isPremium) {
        for (let round = 0; round < PREMIUM_REPLICATE_REQUEUE_ROUNDS && pendingPremiumIndexes.size > 0; round += 1) {
          await new Promise((resolve) => setTimeout(resolve, PREMIUM_REPLICATE_REQUEUE_DELAY_MS));

          for (const index of Array.from(pendingPremiumIndexes)) {
            if (requestVersion !== recipeRequestVersionRef.current) {
              return;
            }

            const recipe = resolved[index];
            try {
              const { data, ok } = await resolveRecipePhoto(recipe);
              if (!ok || !data?.imageUrl) {
                const isLastRound = round === PREMIUM_REPLICATE_REQUEUE_ROUNDS - 1;
                resolved[index] = {
                  ...recipe,
                  image_loading: !isLastRound,
                  image_error: false
                };

                if (isLastRound) {
                  pendingPremiumIndexes.delete(index);
                  if (historyEntryId) {
                    await updateRecipeImage(
                      historyEntryId,
                      index,
                      recipe.image_url ?? "",
                      false,
                      recipe.image_source,
                      {
                        name: recipe.image_attribution_name,
                        url: recipe.image_attribution_url
                      }
                    );
                  }
                }
              } else {
                usedImageUrls.add(data.imageUrl);
                resolved[index] = {
                  ...recipe,
                  image_attribution_name: data.imageAttributionName,
                  image_attribution_url: data.imageAttributionUrl,
                  image_source: data.imageSource,
                  image_url: data.imageUrl,
                  image_loading: false,
                  image_error: false
                };
                pendingPremiumIndexes.delete(index);

                if (historyEntryId) {
                  await updateRecipeImage(
                    historyEntryId,
                    index,
                    data.imageUrl,
                    false,
                    data.imageSource,
                    {
                      name: data.imageAttributionName,
                      url: data.imageAttributionUrl
                    }
                  );
                }
              }
            } catch {
              const isLastRound = round === PREMIUM_REPLICATE_REQUEUE_ROUNDS - 1;
              resolved[index] = {
                ...recipe,
                image_loading: !isLastRound,
                image_error: false
              };
              if (isLastRound) {
                pendingPremiumIndexes.delete(index);
              }
            }

            if (requestVersion === recipeRequestVersionRef.current) {
              setRecipes([...resolved]);
            }

            if (pendingPremiumIndexes.size > 0) {
              await new Promise((resolve) => setTimeout(resolve, PREMIUM_REPLICATE_LOOKUP_DELAY_MS));
            }
          }
        }
      }

      if (requestVersion !== recipeRequestVersionRef.current) return;

      if (historyEntryId) {
        await replaceEntryRecipes(historyEntryId, resolved);
      }

      if (requestVersion !== recipeRequestVersionRef.current) return;
      setRecipes(resolved);
    },
    [access.tier, getAuthHeaders, refreshAccess, replaceEntryRecipes, updateRecipeImage]
  );

  const addManualIngredient = () => {
    const next = manualEntry
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !ingredients.some((ingredient) => ingredient.name.toLowerCase() === item.toLowerCase()))
      .map((item) => createScannerIngredient(item));

    if (!next.length) return;
    setIngredients((current) => [...current, ...next]);
    setManualEntry("");
  };

  const removeIngredient = (ingredientId: string) => {
    setIngredients((current) => current.filter((item) => item.id !== ingredientId));
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
          language: settings.uiLanguage,
          isPantry: false
        })
      });
      const data = (await response.json()) as {
        ingredients?: string[];
        result?: string;
        error?: string;
        fallbackNotice?: string;
      };
      await refreshAccess();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to scan image");
      }
      if (data.fallbackNotice) {
        setError(data.fallbackNotice);
      }

      const scanned = (Array.isArray(data.ingredients) ? data.ingredients : safeJsonParse<string[]>(data.result ?? "[]", []))
        .map((item) => item.trim())
        .filter(Boolean);

      setLastScanImage(image);
      if (!scanned.length) {
        setError(t("noIngredientsDetected"));
        return;
      }

      setIngredients((current) => {
        const existing = new Set(current.map((item) => normalizeIngredientKey(item.name)));
        const nextScanned = scanned
          .filter((item) => !existing.has(normalizeIngredientKey(item)))
          .map((item) => createScannerIngredient(item));

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

    const requestVersion = recipeRequestVersionRef.current + 1;
    recipeRequestVersionRef.current = requestVersion;
    setRecipeLoading(true);
    try {
      const ingredientNames = ingredients.map((item) => item.name);
      const response = await fetch("/api/generate-recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          ingredients: ingredientNames.length ? ingredientNames : undefined,
          referenceImage: lastScanImage ?? undefined,
          recipeCount: settings.recipeCount,
          uiLanguage: settings.uiLanguage,
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
        servedFrom?: "shared_pool" | "fallback_ai" | "mock";
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
      if (requestVersion !== recipeRequestVersionRef.current) {
        return;
      }

      setRecipes(nextRecipes);
      if (!nextRecipes.length) {
        setHistoryEntryId(null);
        return;
      }
      const entryId = await addEntry({
        timestamp: new Date().toISOString(),
        ingredients: ingredientNames,
        recipes: nextRecipes
      });
      setHistoryEntryId(entryId);
      void hydrateRecipePhotos(nextRecipes, entryId, requestVersion);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Recipe generation failed";
      setError(message);
    } finally {
      setRecipeLoading(false);
    }
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-4 sm:space-y-5">
      <motion.div variants={itemVariants}>
        <Card className="space-y-3.5 rounded-[1.4rem] p-3.5 sm:rounded-[1.7rem] sm:p-4.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-200">
                <span>{t("scanIng")}</span>
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-[10px] tracking-[0.14em] text-emerald-50/72">
                  {ingredients.length} {t("ingredientsStat")}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-[10px] tracking-[0.14em] text-emerald-50/72">
                  {recipes.length ? `${recipes.length} ${t("readyStatus")}` : t("waitingStatus")}
                </span>
              </div>
              <h3 className="text-base font-display font-bold text-white sm:text-lg">{t("whatIng")}</h3>
              <p className="max-w-2xl text-sm leading-relaxed text-emerald-50/62">{t("scannerCompactLead")}</p>
            </div>
            <div className="rounded-2xl bg-white/[0.08] p-2.5 text-cyan-100">
              <Utensils className="h-4.5 w-4.5" />
            </div>
          </div>

          <div
            className={
              access.tier === "free"
                ? "rounded-[1.2rem] border border-amber-200/16 bg-amber-400/10 px-4 py-3 text-xs leading-relaxed text-amber-50/90"
                : "rounded-[1.2rem] border border-emerald-200/16 bg-emerald-400/10 px-4 py-3 text-xs leading-relaxed text-emerald-50/90"
            }
          >
            {access.tier === "free"
              ? t("freePlanScanner")
                  .replace("{remaining}", String(access.aiCreditsRemaining))
                  .replace("{limit}", String(access.aiCreditsLimit))
              : t("premiumPlanScanner")}
          </div>

          <div className="grid gap-3.5 xl:grid-cols-[1.08fr_0.92fr]">
            <div className="space-y-3.5">
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
                <span className="focus-within:ring-2 focus-within:ring-cyan-300 focus-within:ring-offset-2 flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[1.25rem] border border-dashed border-white/12 bg-white/[0.04] px-5 text-center transition-ui hover:border-cyan-300/35 hover:bg-white/[0.07]">
                  <ImagePlus className="h-8 w-8 text-cyan-200" aria-hidden="true" />
                  <span className="text-sm font-semibold text-white" aria-live="polite">
                    {scanLoading ? t("identifying") : t("uploadFridgePhoto")}
                  </span>
                  <span className="text-xs text-emerald-50/55">{t("scannerCompactActions")}</span>
                </span>
              </label>

              <div className="space-y-2.5">
                <label htmlFor="scanner-manual-ingredient" className="text-sm font-semibold text-emerald-50/88">
                  {t("typeIng")}
                </label>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
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
                    className="focus-ring neo-input h-12 rounded-2xl px-4 text-sm transition-ui"
                  />
                  <Button variant="secondary" leftIcon={<Plus className="h-4 w-4" />} onClick={addManualIngredient}>
                    {t("add")}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("reviewIng")}</p>
                  <h3 className="text-base font-display font-bold text-white sm:text-lg">{t("detectedIng")}</h3>
                </div>
                <div className="rounded-2xl bg-white/[0.08] p-2.5 text-cyan-100">
                  <Sparkles className="h-4.5 w-4.5" />
                </div>
              </div>

              {ingredients.length ? (
                <div className="grid gap-2.5">
                  {ingredients.map((ingredient) => (
                    <div
                      key={ingredient.id}
                      className="grid gap-2.5 rounded-[1.1rem] border border-white/10 bg-white/[0.04] p-3 text-sm font-medium text-emerald-50/82 sm:grid-cols-[1fr_auto]"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">{ingredient.name}</p>
                      </div>
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
                <div className="rounded-[1.25rem] border border-dashed border-white/12 bg-white/[0.04] px-4 py-5 text-sm text-emerald-50/55">
                  {t("scanFridgeStart")}
                </div>
              )}

              <div className="grid gap-2.5 sm:grid-cols-3">
                <Card variant="plain" className="rounded-[1.2rem] p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-50/52">{t("preferredCuisine")}</p>
                  <p className="mt-1.5 text-base font-semibold text-white">{settings.preferredCuisine}</p>
                </Card>
                <Card variant="plain" className="rounded-[1.2rem] p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-50/52">{t("dailyCalorieTarget")}</p>
                  <p className="mt-1.5 text-base font-semibold text-white">{settings.calorieTarget} kcal</p>
                </Card>
                <Card variant="plain" className="rounded-[1.2rem] p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-50/52">{t("recipeCount")}</p>
                  <p className="mt-1.5 text-base font-semibold text-white">{settings.recipeCount}</p>
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
            </div>
          </div>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants}>
        {recipes.length ? (
          <div className="space-y-4">
            <ResultLegalNotice mode="recipes" />
            <div className="grid gap-5 lg:grid-cols-3">
              {recipes.map((recipe, index) => (
                <MealRevealCard
                  key={`${recipe.id ?? recipe.name}-${index}`}
                  disableAutoImageLookup
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
                  imageExactNames={buildRecipePhotoExactNames(recipe)}
                  imageCuisine={buildRecipePhotoCuisine(recipe)}
                  imagePromptIngredients={buildRecipePhotoPromptIngredients(recipe)}
                  onImageResolved={
                    user && historyEntryId
                      ? async ({ imageAttributionName, imageAttributionUrl, imageSource, imageUrl }) => {
                          const persistedImageUrl =
                            access.tier === "premium"
                              ? null
                              : await persistRecipeImageForUser({
                                  uid: user.uid,
                                  imageUrl,
                                  query: serializeRecipePhotoQuery(buildRecipePhotoQuery(recipe))
                                });
                          await updateRecipeImage(
                            historyEntryId,
                            index,
                            persistedImageUrl || imageUrl,
                            false,
                            imageSource,
                            { name: imageAttributionName, url: imageAttributionUrl }
                          );
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

function hasRenderableImage(imageUrl?: string): imageUrl is string {
  return Boolean(imageUrl && /^https?:\/\//i.test(imageUrl));
}

function buildRecipePhotoQuery(recipe: Recipe) {
  const photoContext = buildEnglishRecipePhotoContext(recipe);
  return buildRecipePhotoQueryCandidates({
    cuisine: photoContext.cuisine,
    dishIntent: photoContext.dishIntent,
    imageSearchIndex: photoContext.imageSearchIndex,
    imageSearchIndices: photoContext.imageSearchIndices,
    ingredients: photoContext.ingredients,
    missingIngredients: photoContext.missingIngredients,
    name: photoContext.name
  });
}

function buildRecipePhotoRequestUrl(
  queries: string[],
  ingredients: string[] = [],
  excludeUrls: string[] = [],
  exactContext: { cuisine?: string; exactNames?: string[] } = {}
) {
  const params = new URLSearchParams();
  queries.slice(0, 5).forEach((query, index) => {
    if (index === 0) {
      params.set("query", query);
    } else {
      params.append("alt", query);
    }
  });
  ingredients
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 10)
    .forEach((ingredient) => params.append("ingredient", ingredient));
  exactContext.exactNames
    ?.map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 8)
    .forEach((name) => params.append("exact", name));
  if (exactContext.cuisine?.trim()) {
    params.set("cuisine", exactContext.cuisine.trim());
  }
  excludeUrls.slice(0, 8).forEach((url) => params.append("exclude", url));

  return `/api/recipe-photo?${params.toString()}`;
}

function serializeRecipePhotoQuery(queries: string[]) {
  return queries.join(" || ");
}

function buildRecipePhotoPromptIngredients(recipe: Recipe) {
  return buildEnglishRecipePhotoIngredients(recipe);
}

function buildRecipePhotoExactNames(recipe: Recipe) {
  return Array.from(
    new Set(
      [
        recipe.localized?.English?.name,
        recipe.localized?.Arabic?.name,
        recipe.name,
        recipe.dish_intent?.dish_name,
        recipe.localized?.English?.dish_intent?.dish_name,
        recipe.localized?.Arabic?.dish_intent?.dish_name,
        recipe.image_search_index,
        recipe.localized?.English?.image_search_index,
        recipe.localized?.Arabic?.image_search_index
      ]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).slice(0, 8);
}

function buildRecipePhotoCuisine(recipe: Recipe) {
  return recipe.localized?.English?.cuisine ?? recipe.cuisine;
}

function normalizeIngredientKey(value: string) {
  return translateIngredientToEnglish(value).trim().toLowerCase();
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
  const isArabicRecipe = containsArabicText(`${recipe.name} ${recipe.cuisine}`);
  const originLabel =
    recipe.recipe_origin === "exact_scan_match"
      ? t("exactScannedDish")
      : recipe.recipe_origin === "similar_ingredients"
        ? t("similarIngredients")
        : null;
  const dishStyle = formatRecipeDishStyle(recipe, isArabicRecipe);
  const preferenceHits = recipe.preference_hits?.length
    ? t("preferenceMatches").replace("{count}", String(recipe.preference_hits.length))
    : null;
  const scanExplanation =
    recipe.recipe_origin === "exact_scan_match" && recipe.scan_match_explanation
      ? recipe.scan_match_explanation
      : null;

  return [
    originLabel,
    recipe.cuisine,
    dishStyle,
    formatRecipeMatchQuality(recipe.match_quality, isArabicRecipe),
    preferenceHits,
    scanExplanation
  ].filter(Boolean).join(" / ");
}

function formatRecipeDishStyle(recipe: Recipe, isArabicRecipe: boolean) {
  const mealType = recipe.dish_intent?.meal_type;
  const cookingMethod = recipe.dish_intent?.cooking_method;
  const genericCookingMethod = cookingMethod === "assembled";
  const values = [mealType, genericCookingMethod ? undefined : cookingMethod].filter(Boolean) as string[];
  if (!values.length) return null;
  if (!isArabicRecipe) return values.join(" ");

  const translated = values
    .map((value) => ARABIC_DISH_STYLE_LABELS[value.toLowerCase()] ?? "")
    .filter(Boolean);

  return translated.length ? translated.join(" ") : null;
}

function formatRecipeMatchQuality(matchQuality: Recipe["match_quality"], isArabicRecipe: boolean) {
  if (!matchQuality) return null;
  if (!isArabicRecipe) return matchQuality;
  return ARABIC_MATCH_QUALITY_LABELS[matchQuality] ?? null;
}

function containsArabicText(value: string) {
  return /[\u0600-\u06FF]/.test(value);
}

const ARABIC_DISH_STYLE_LABELS: Record<string, string> = {
  breakfast: "فطور",
  lunch: "غداء",
  dinner: "عشاء",
  snack: "وجبة خفيفة",
  grilled: "مشوي",
  baked: "مخبوز",
  fried: "مقلي",
  "stir-fried": "سوتيه",
  simmered: "مطهو بهدوء",
  skillet: "في المقلاة"
};

const ARABIC_MATCH_QUALITY_LABELS: Record<NonNullable<Recipe["match_quality"]>, string> = {
  great: "مطابقة ممتازة",
  good: "مطابقة جيدة",
  possible: "مطابقة ممكنة",
  stretch: "مطابقة ضعيفة"
};

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
