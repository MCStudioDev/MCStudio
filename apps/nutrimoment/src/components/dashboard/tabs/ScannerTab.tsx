"use client";

import Image from "next/image";
import { ChangeEvent, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Camera, ChefHat, ImagePlus, Plus, Sparkles, Utensils } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { useApp } from "@/contexts/AppContext";
import { useHistory } from "@/hooks/useHistory";
import { containerVariants, itemVariants } from "@/lib/animations";
import { buildRecipeGenerationPrompt } from "@/lib/aiPrompts";
import { getPantryQuantityHint, getPreferredPantryUnit } from "@/lib/pantryQuantity";
import { fileToBase64 } from "@/lib/utils";
import type { Recipe } from "@/lib/types";
import { EmptyState, SectionHero } from "./shared";
import { ResultLegalNotice } from "@/components/legal/LegalNotice";
import { useAuth } from "@/contexts/AuthContext";

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

interface ScannerIngredient {
  name: string;
  quantity: string;
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
  const { access, getAuthHeaders, refreshAccess } = useAuth();
  const { addEntry, updateRecipeImage } = useHistory();
  const [manualEntry, setManualEntry] = useState("");
  const [manualQuantity, setManualQuantity] = useState("");
  const [ingredients, setIngredients] = useState<ScannerIngredient[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeSource, setRecipeSource] = useState<"offline_catalog" | "fallback_ai" | "mock" | null>(null);

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
          if (hasRenderableImage(recipe.image_url)) {
            return recipe;
          }

          try {
            const authHeaders = await getAuthHeaders();
            const response = await fetch(`/api/recipe-photo?query=${encodeURIComponent(buildRecipePhotoQuery(recipe))}`, {
              headers: authHeaders
            });
            const data = (await response.json()) as { imageUrl?: string; fallbackNotice?: string };
            await refreshAccess();

            if (!response.ok || !data.imageUrl) {
              if (historyEntryId) {
                await updateRecipeImage(historyEntryId, index, "", true);
              }
              return { ...recipe, image_loading: false, image_error: true };
            }

            if (historyEntryId) {
              await updateRecipeImage(historyEntryId, index, data.imageUrl, false);
            }

            return {
              ...recipe,
              image_url: data.imageUrl,
              image_loading: false,
              image_error: false
            };
          } catch {
            if (historyEntryId) {
              await updateRecipeImage(historyEntryId, index, "", true);
            }
            return { ...recipe, image_loading: false, image_error: true };
          }
        })
      );

      setRecipes(resolved);
    },
    [getAuthHeaders, refreshAccess, updateRecipeImage]
  );

  const addManualIngredient = () => {
    const next = manualEntry
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !ingredients.some((ingredient) => ingredient.name.toLowerCase() === item.toLowerCase()))
      .map((item) => ({
        name: item,
        quantity: manualQuantity.trim() || `1 ${getPreferredPantryUnit(item)}`
      }));

    if (!next.length) return;
    setIngredients((current) => [...current, ...next]);
    setManualEntry("");
    setManualQuantity("");
  };

  const removeIngredient = (ingredient: string) => {
    setIngredients((current) => current.filter((item) => item.name !== ingredient));
  };

  const updateIngredientQuantity = (ingredientName: string, quantity: string) => {
    setIngredients((current) =>
      current.map((item) => (item.name === ingredientName ? { ...item, quantity } : item))
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

      setIngredients((current) => {
        const existing = new Set(current.map((item) => item.name.toLowerCase()));
        const nextScanned = scanned
          .filter((item) => !existing.has(item.toLowerCase()))
          .map((item) => ({ name: item, quantity: `1 ${getPreferredPantryUnit(item)}` }));

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
    if (!ingredients.length) {
      setError("Add or scan ingredients first.");
      return;
    }

    setRecipeLoading(true);
    try {
      const ingredientNames = ingredients.map((item) => item.name);
      const ingredientQuantities = ingredients.map((item) => `${item.name} - ${item.quantity}`);
      const prompt = buildRecipeGenerationPrompt(ingredients, {
        recipeLanguage: settings.recipeLanguage,
        preferredCuisine: settings.preferredCuisine,
        calorieTarget: settings.calorieTarget,
        maxMissingIngredients: settings.maxMissingIngredients,
        diets: health.diets,
        conditions: health.conditions
      });

      const response = await fetch("/api/generate-recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          ingredients: ingredientNames,
          ingredientQuantities,
          recipeLanguage: settings.recipeLanguage,
          prompt,
          preferredCuisine: settings.preferredCuisine,
          calorieTarget: settings.calorieTarget,
          maxMissingIngredients: settings.maxMissingIngredients,
          diets: health.diets,
          conditions: health.conditions
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
      setRecipeSource(data.servedFrom ?? null);
      const entryId = await addEntry({
        timestamp: new Date().toISOString(),
        ingredients: ingredientQuantities,
        recipes: nextRecipes
      });
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
        icon={<Camera className="h-6 w-6" />}
      />

      {access.tier === "free" ? (
        <motion.div variants={itemVariants} className="rounded-[1.5rem] border border-amber-100 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          Free plan: {access.aiCreditsRemaining} of {access.aiCreditsLimit} shared AI uses left for scans and recipe photos.
          After that, manual ingredient entry and offline recipes stay available.
        </motion.div>
      ) : (
        <motion.div variants={itemVariants} className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
          Premium plan: API recipe generation, scans, and recipe photos are enabled with offline fallback.
        </motion.div>
      )}

      <motion.div variants={itemVariants} className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="space-y-5 rounded-[2rem]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">{t("scanIng")}</p>
              <h3 className="text-2xl font-display font-bold text-stone-900">{t("whatIng")}</h3>
            </div>
            <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
              <Utensils className="h-5 w-5" />
            </div>
          </div>

          <label className="block">
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            <span className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 rounded-[1.5rem] border border-dashed border-emerald-200 bg-emerald-50/60 px-6 text-center transition hover:border-emerald-400 hover:bg-emerald-50">
              <ImagePlus className="h-8 w-8 text-emerald-600" />
              <span className="text-sm font-semibold text-stone-800">
                {scanLoading ? t("identifying") : "Upload a fridge or ingredient photo"}
              </span>
              <span className="text-xs text-stone-500">{t("takePhoto")}</span>
            </span>
          </label>

          <div className="space-y-3">
            <label className="text-sm font-semibold text-stone-800">{t("typeIng")}</label>
            <div className="flex gap-3">
              <input
                value={manualEntry}
                onChange={(event) => setManualEntry(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addManualIngredient();
                  }
                }}
                placeholder={t("quickAdd")}
                className="h-12 flex-1 rounded-2xl border border-emerald-100 bg-white px-4 text-sm outline-none transition focus:border-emerald-400"
              />
              <input
                value={manualQuantity}
                onChange={(event) => setManualQuantity(event.target.value)}
                placeholder={manualEntry.trim() ? getPantryQuantityHint(manualEntry) : "Quantity"}
                className="h-12 w-44 rounded-2xl border border-emerald-100 bg-white px-4 text-sm outline-none transition focus:border-emerald-400"
              />
              <Button variant="secondary" leftIcon={<Plus className="h-4 w-4" />} onClick={addManualIngredient}>
                {t("add")}
              </Button>
            </div>
            <div className="rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-xs leading-relaxed text-cyan-800">
              Quantity guide: rice/oats/lentils use cups, tomato/onion/egg use whole/items, garlic uses cloves,
              olive oil uses tbsp, chicken breast uses lb, yogurt uses cups.
            </div>
          </div>
        </Card>

        <Card className="space-y-5 rounded-[2rem]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">{t("reviewIng")}</p>
              <h3 className="text-2xl font-display font-bold text-stone-900">{t("detectedIng")}</h3>
            </div>
            <div className="rounded-2xl bg-cyan-100 p-3 text-cyan-700">
              <Sparkles className="h-5 w-5" />
            </div>
          </div>

          {ingredients.length ? (
            <div className="grid gap-3">
              {ingredients.map((ingredient) => (
                <div
                  key={ingredient.name}
                  className="grid gap-3 rounded-[1.25rem] border border-emerald-100 bg-white/80 p-3 text-sm font-medium text-stone-700 sm:grid-cols-[1fr_190px_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-stone-900">{ingredient.name}</p>
                    <p className="text-xs text-stone-500">{getPantryQuantityHint(ingredient.name)}</p>
                  </div>
                  <input
                    value={ingredient.quantity}
                    onChange={(event) => updateIngredientQuantity(ingredient.name, event.target.value)}
                    placeholder={getPantryQuantityHint(ingredient.name)}
                    className="h-11 rounded-2xl border border-emerald-100 bg-white px-4 text-sm outline-none focus:border-emerald-400"
                  />
                  <button
                    type="button"
                    onClick={() => removeIngredient(ingredient.name)}
                    className="rounded-2xl bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-500 transition hover:bg-red-50 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-emerald-200 bg-white/70 px-5 py-6 text-sm text-stone-500">
              {t("scanFridgeStart")}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Card variant="plain" className="rounded-[1.5rem] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{t("preferredCuisine")}</p>
              <p className="mt-2 text-lg font-semibold text-stone-900">{settings.preferredCuisine}</p>
            </Card>
            <Card variant="plain" className="rounded-[1.5rem] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{t("dailyCalorieTarget")}</p>
              <p className="mt-2 text-lg font-semibold text-stone-900">{settings.calorieTarget} kcal</p>
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
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
                {recipeSource === "offline_catalog" ? "Offline catalog match" : recipeSource === "fallback_ai" ? "AI fallback" : "Mock mode"}
              </span>
            </div>
            <ResultLegalNotice mode="recipes" />
            <div className="grid gap-5 lg:grid-cols-3">
            {recipes.map((recipe) => (
              <Card key={recipe.name} className="rounded-[2rem] space-y-4">
                <RecipeImage recipe={recipe} />
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">{recipe.cuisine}</p>
                  <h3 className="text-2xl font-display font-bold text-stone-900">{recipe.name}</h3>
                  {recipe.match_quality ? (
                    <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                      {recipe.match_quality} match
                    </span>
                  ) : null}
                  {recipe.preference_hits?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {recipe.preference_hits.map((hit) => (
                        <span
                          key={`${recipe.name}-${hit}`}
                          className="inline-flex rounded-full bg-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700"
                        >
                          {hit}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Metric label={t("protein")} value={recipe.protein} />
                  <Metric label={t("carbs")} value={recipe.carbs} />
                  <Metric label={t("fat")} value={recipe.fat} />
                  <Metric label="Calories" value={`${recipe.calories}`} />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-stone-900">{t("ingredientsYouHave")}</p>
                  <div className="flex flex-wrap gap-2">
                    {recipe.ingredients.map((ingredient, index) => {
                      const label = getRecipeIngredientLabel(ingredient);

                      return (
                        <Pill key={`${recipe.name}-ingredient-${index}-${label}`} active>
                          {label}
                        </Pill>
                      );
                    })}
                  </div>
                </div>

                {recipe.missing_ingredients?.length ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-stone-900">{t("ingredientsYouNeed")}</p>
                    <div className="flex flex-wrap gap-2">
                      {recipe.missing_ingredients.map((ingredient, index) => {
                        const label = getRecipeIngredientLabel(ingredient);

                        return <Pill key={`${recipe.name}-missing-${index}-${label}`}>{label}</Pill>;
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-stone-900">{t("prepSteps")}</p>
                  <ol className="space-y-2 text-sm text-stone-600">
                    {recipe.steps.map((step, index) => (
                      <li key={`${recipe.name}-${index}`} className="flex gap-3">
                        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                          {index + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </Card>
            ))}
            </div>
          </div>
        ) : (
          <EmptyState
            title="Ready to cook"
            description="Scan a photo or add ingredients manually, then generate three recipe ideas shaped by your preferences. Always verify allergens, nutrition, and food safety before cooking."
          />
        )}
      </motion.div>
    </motion.div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-stone-900">{value}</p>
    </div>
  );
}

function RecipeImage({ recipe }: { recipe: Recipe }) {
  if (hasRenderableImage(recipe.image_url)) {
    return (
      <div className="overflow-hidden rounded-[1.5rem] bg-stone-100">
        <Image
          src={recipe.image_url ?? ""}
          alt={recipe.name}
          width={800}
          height={480}
          className="h-48 w-full object-cover"
          unoptimized
        />
      </div>
    );
  }

  if (recipe.image_loading) {
    return <div className="h-48 animate-pulse rounded-[1.5rem] bg-stone-100" />;
  }

  return (
    <div className="flex h-48 items-center justify-center rounded-[1.5rem] border border-dashed border-stone-200 bg-stone-50 px-4 text-center text-sm text-stone-500">
      {recipe.image_error ? "No matching web photo found yet." : "Searching the web for a matching recipe photo."}
    </div>
  );
}

function hasRenderableImage(imageUrl?: string) {
  return Boolean(imageUrl && /^(https?:|data:)/.test(imageUrl));
}

function buildRecipePhotoQuery(recipe: Recipe) {
  const ingredients = recipe.ingredients
    .slice(0, 3)
    .map((ingredient) => getRecipeIngredientLabel(ingredient))
    .join(" ");

  return [recipe.name, recipe.cuisine, ingredients, "food plated"]
    .filter(Boolean)
    .join(" ");
}
