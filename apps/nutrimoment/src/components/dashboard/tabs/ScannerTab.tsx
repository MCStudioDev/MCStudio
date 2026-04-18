"use client";

import { ChangeEvent, useState } from "react";
import { motion } from "framer-motion";
import { Camera, ChefHat, ImagePlus, Plus, Sparkles, Utensils } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { useApp } from "@/contexts/AppContext";
import { useHistory } from "@/hooks/useHistory";
import { containerVariants, itemVariants } from "@/lib/animations";
import { fileToBase64 } from "@/lib/utils";
import type { Recipe } from "@/lib/types";
import { EmptyState, SectionHero } from "./shared";

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function buildRecipePrompt(
  ingredients: string[],
  options: {
    recipeLanguage: string;
    preferredCuisine: string;
    calorieTarget: number;
    maxMissingIngredients: number;
    diets: string[];
    conditions: string[];
  }
) {
  const cuisineHint = options.preferredCuisine === "Any" ? "Use any cuisine." : `Prefer ${options.preferredCuisine} cuisine.`;
  const diets = options.diets.length ? options.diets.join(", ") : "none";
  const conditions = options.conditions.length ? options.conditions.join(", ") : "none";

  return [
    `Generate exactly 3 recipes using these ingredients: ${ingredients.join(", ")}.`,
    cuisineHint,
    `Recipe language: ${options.recipeLanguage}.`,
    `Target calories per meal: approximately ${Math.round(options.calorieTarget / 3)} kcal.`,
    `Maximum missing ingredients allowed: ${options.maxMissingIngredients}.`,
    `Dietary preferences: ${diets}.`,
    `Health conditions to respect: ${conditions}.`,
    "Return ONLY valid JSON as an array of recipe objects.",
    "Each recipe must include: name, cuisine, ingredients, missing_ingredients, steps, calories, protein, carbs, fat, fiber, sugar, sodium, cook_time, difficulty."
  ].join(" ");
}

export function ScannerTab() {
  const { t, settings, health, setError } = useApp();
  const { addEntry } = useHistory();
  const [manualEntry, setManualEntry] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  const addManualIngredient = () => {
    const next = manualEntry
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !ingredients.includes(item));

    if (!next.length) return;
    setIngredients((current) => [...current, ...next]);
    setManualEntry("");
  };

  const removeIngredient = (ingredient: string) => {
    setIngredients((current) => current.filter((item) => item !== ingredient));
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image,
          language: settings.recipeLanguage,
          isPantry: false
        })
      });
      const data = (await response.json()) as { result?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to scan image");
      }

      const scanned = safeJsonParse<string[]>(data.result ?? "[]", [])
        .map((item) => item.trim())
        .filter(Boolean);

      setIngredients((current) => Array.from(new Set([...current, ...scanned])));
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
      const prompt = buildRecipePrompt(ingredients, {
        recipeLanguage: settings.recipeLanguage,
        preferredCuisine: settings.preferredCuisine,
        calorieTarget: settings.calorieTarget,
        maxMissingIngredients: settings.maxMissingIngredients,
        diets: health.diets,
        conditions: health.conditions
      });

      const response = await fetch("/api/generate-recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });

      const data = (await response.json()) as { result?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to generate recipes");
      }

      const nextRecipes = safeJsonParse<Recipe[]>(data.result ?? "[]", []);
      setRecipes(nextRecipes);
      await addEntry({
        timestamp: new Date().toISOString(),
        ingredients,
        recipes: nextRecipes
      });
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
              <Button variant="secondary" leftIcon={<Plus className="h-4 w-4" />} onClick={addManualIngredient}>
                {t("add")}
              </Button>
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
            <div className="flex flex-wrap gap-2">
              {ingredients.map((ingredient) => (
                <div
                  key={ingredient}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white/80 px-4 py-2 text-sm font-medium text-stone-700"
                >
                  <span>{ingredient}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={() => removeIngredient(ingredient)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        removeIngredient(ingredient);
                      }
                    }}
                    className="rounded-full px-1.5 text-xs text-stone-500 hover:bg-stone-100"
                  >
                    x
                  </span>
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
          <div className="grid gap-5 lg:grid-cols-3">
            {recipes.map((recipe) => (
              <Card key={recipe.name} className="rounded-[2rem] space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">{recipe.cuisine}</p>
                  <h3 className="text-2xl font-display font-bold text-stone-900">{recipe.name}</h3>
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
                    {recipe.ingredients.map((ingredient) => (
                      <Pill key={ingredient} active>
                        {ingredient}
                      </Pill>
                    ))}
                  </div>
                </div>

                {recipe.missing_ingredients?.length ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-stone-900">{t("ingredientsYouNeed")}</p>
                    <div className="flex flex-wrap gap-2">
                      {recipe.missing_ingredients.map((ingredient) => (
                        <Pill key={ingredient}>{ingredient}</Pill>
                      ))}
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
        ) : (
          <EmptyState
            title="Ready to cook"
            description="Scan a photo or add ingredients manually, then generate three AI-powered recipe ideas tailored to your preferences."
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
