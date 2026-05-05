"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ResultLegalNotice } from "@/components/legal/LegalNotice";
import { MealRevealCard } from "@/components/dashboard/MealRevealCard";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMealPlan } from "@/hooks/useMealPlan";
import { usePantry } from "@/hooks/usePantry";
import { containerVariants, itemVariants } from "@/lib/animations";
import { translateIngredientToEnglish } from "@/lib/arabicRecipeLocalization";
import { persistRecipeImageForUser } from "@/lib/recipeImageStorage";
import { buildRecipePhotoQueryCandidates } from "@/lib/recipePhotoQueries";
import { normalizeMealPlanData, normalizeShoppingList } from "@/lib/mealPlan";
import { normalizePantryIngredientName } from "@/lib/pantryQuantity";
import type { MealPlanMeal } from "@/lib/types";
import { EmptyState, SectionHero } from "./shared";

const PREMIUM_REPLICATE_LOOKUP_DELAY_MS = 1200;
const PREMIUM_REPLICATE_MAX_RETRIES = 4;
const PREMIUM_REPLICATE_MAX_RETRY_AFTER_MS = 12 * 1000;
const PREMIUM_REPLICATE_REQUEUE_DELAY_MS = 5000;
const PREMIUM_REPLICATE_REQUEUE_ROUNDS = 6;
type MealSlotType = "breakfast" | "lunch" | "dinner";
type MealPhotoLookupResponse = {
  imageAttributionName?: string;
  imageAttributionUrl?: string;
  imageSource?: "api" | "cache" | "search" | "unsplash" | "wikimedia";
  imageUrl?: string;
};

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function MealPlanTab() {
  const { t, settings, health, setError } = useApp();
  const { access, getAuthHeaders, refreshAccess, user } = useAuth();
  const { items } = usePantry();
  const { mealPlan, loading: savedPlanLoading, error: mealPlanError, saveMealPlan, updateMealImage } = useMealPlan();
  const [loading, setLoading] = useState(false);
  const [imageLoadingSlots, setImageLoadingSlots] = useState<Set<string>>(() => new Set());
  const [imageErrorSlots, setImageErrorSlots] = useState<Set<string>>(() => new Set());
  const mealPlanImageRequestVersionRef = useRef(0);
  const mealPlanRef = useRef(mealPlan);
  const updateMealImageRef = useRef(updateMealImage);

  useEffect(() => {
    if (mealPlanError) {
      setError(mealPlanError.message);
    }
  }, [mealPlanError, setError]);

  const generateMealPlan = async () => {
    if (access.tier !== "premium") {
      setError("Weekly meal plans are a premium feature. Free users can continue with manual pantry and the shared recipe pool.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/mealplan", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          pantry: items.map((item) => item.name),
          pantryItems: items.map((item) => ({ name: item.name, quantity: item.quantity })),
          uiLanguage: settings.uiLanguage,
          preferredCuisine: settings.preferredCuisine,
          calorieTarget: settings.calorieTarget,
          diets: health.diets,
          conditions: health.conditions,
          allergens: health.allergens ?? []
        })
      });
      const data = (await response.json()) as { result?: string; error?: string; fallbackNotice?: string };
      await refreshAccess();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to generate meal plan");
      }
      if (data.fallbackNotice) {
        setError(data.fallbackNotice);
      }

      const nextMealPlan = normalizeMealPlanData(safeJsonParse<unknown>(data.result ?? "null", null));
      if (!nextMealPlan) {
        throw new Error("Meal plan response was empty");
      }

      await saveMealPlan(nextMealPlan);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate meal plan";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const shoppingList = normalizeShoppingList(mealPlan?.shoppingList);
  const localizedShoppingList = useMemo(
    () => shoppingList.map((item) => localizeShoppingListItem(item, settings.uiLanguage)),
    [settings.uiLanguage, shoppingList]
  );
  const pantryKeys = useMemo(
    () => new Set(items.map((item) => normalizePantryIngredientName(item.name)).filter(Boolean)),
    [items]
  );
  const mealPlanImagePlanKey = useMemo(() => {
    if (!mealPlan) return "";
    return mealPlan.plan
      .map((day) =>
        [
          day.day,
          day.breakfast.name,
          day.breakfast.image_search_index,
          day.lunch.name,
          day.lunch.image_search_index,
          day.dinner.name,
          day.dinner.image_search_index
        ].join("::")
      )
      .join("||");
  }, [mealPlan]);

  useEffect(() => {
    mealPlanRef.current = mealPlan;
  }, [mealPlan]);

  useEffect(() => {
    updateMealImageRef.current = updateMealImage;
  }, [updateMealImage]);

  const resolveMealPlanImages = useCallback(async () => {
    void mealPlanImagePlanKey;
    const currentMealPlan = mealPlanRef.current;
    if (!currentMealPlan || !user || access.tier !== "premium") return;
    const requestVersion = mealPlanImageRequestVersionRef.current + 1;
    mealPlanImageRequestVersionRef.current = requestVersion;

    const slots = buildMealPlanImageSlots(currentMealPlan.plan);
    const slotsNeedingLookup = slots.filter((slot) => !hasRenderableImage(slot.meal.image_url));
    if (!slotsNeedingLookup.length) {
      setImageLoadingSlots(new Set());
      setImageErrorSlots(new Set());
      return;
    }

    setImageErrorSlots(new Set());
    setImageLoadingSlots(new Set(slotsNeedingLookup.map((slot) => slot.key)));

    const usedImageUrls = new Set(
      slots
        .map((slot) => slot.meal.image_url)
        .filter((imageUrl): imageUrl is string => hasRenderableImage(imageUrl))
    );
    const pendingPremiumKeys = new Set<string>();

    const resolveMealPhoto = async (meal: MealPlanMeal) => {
      let response: Response | null = null;
      let data: MealPhotoLookupResponse | null = null;
      let attempt = 0;

      while (attempt <= PREMIUM_REPLICATE_MAX_RETRIES) {
        response = await fetch(
          buildRecipePhotoRequestUrl(
            buildMealPlanPhotoQuery(meal),
            buildEnglishMealIngredients(meal.ingredients).slice(0, 10),
            Array.from(usedImageUrls),
            { exactNames: buildMealPlanPhotoExactNames(meal) }
          ),
          {
            headers: await getAuthHeaders()
          }
        );
        data = (await response.json().catch(() => null)) as MealPhotoLookupResponse | null;

        if (response.ok && data?.imageUrl) {
          return { data, ok: true as const, response };
        }

        const retryAfterSeconds = Number(response.headers.get("Retry-After") ?? "0") || 0;
        const canRetry =
          attempt < PREMIUM_REPLICATE_MAX_RETRIES &&
          (response.status === 429 || response.status === 503);

        if (!canRetry) break;

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

    const applyResolvedMealImage = async (
      slot: MealPlanImageSlot,
      data: {
        imageAttributionName?: string;
        imageAttributionUrl?: string;
        imageSource?: "api" | "cache" | "search" | "unsplash" | "wikimedia";
        imageUrl: string;
      }
    ) => {
      usedImageUrls.add(data.imageUrl);
      await updateMealImageRef.current(slot.dayIndex, slot.mealType, data.imageUrl, data.imageSource, {
        name: data.imageAttributionName,
        url: data.imageAttributionUrl
      });
      setImageLoadingSlots((current) => {
        const next = new Set(current);
        next.delete(slot.key);
        return next;
      });
      setImageErrorSlots((current) => {
        const next = new Set(current);
        next.delete(slot.key);
        return next;
      });
    };

    for (const slot of slotsNeedingLookup) {
      if (requestVersion !== mealPlanImageRequestVersionRef.current) return;

      try {
        const { data, ok } = await resolveMealPhoto(slot.meal);
        if (ok && data?.imageUrl) {
          await applyResolvedMealImage(slot, { ...data, imageUrl: data.imageUrl });
        } else {
          pendingPremiumKeys.add(slot.key);
        }
      } catch {
        pendingPremiumKeys.add(slot.key);
      }

      if (requestVersion !== mealPlanImageRequestVersionRef.current) return;
      await new Promise((resolve) => setTimeout(resolve, PREMIUM_REPLICATE_LOOKUP_DELAY_MS));
    }

    for (let round = 0; round < PREMIUM_REPLICATE_REQUEUE_ROUNDS && pendingPremiumKeys.size > 0; round += 1) {
      await new Promise((resolve) => setTimeout(resolve, PREMIUM_REPLICATE_REQUEUE_DELAY_MS));
      if (requestVersion !== mealPlanImageRequestVersionRef.current) return;

      for (const slot of slotsNeedingLookup.filter((entry) => pendingPremiumKeys.has(entry.key))) {
        const isLastRound = round === PREMIUM_REPLICATE_REQUEUE_ROUNDS - 1;
        try {
          const { data, ok } = await resolveMealPhoto(slot.meal);
          if (ok && data?.imageUrl) {
            pendingPremiumKeys.delete(slot.key);
            await applyResolvedMealImage(slot, { ...data, imageUrl: data.imageUrl });
          } else if (isLastRound) {
            pendingPremiumKeys.delete(slot.key);
            setImageLoadingSlots((current) => {
              const next = new Set(current);
              next.delete(slot.key);
              return next;
            });
            setImageErrorSlots((current) => new Set(current).add(slot.key));
          }
        } catch {
          if (isLastRound) {
            pendingPremiumKeys.delete(slot.key);
            setImageLoadingSlots((current) => {
              const next = new Set(current);
              next.delete(slot.key);
              return next;
            });
            setImageErrorSlots((current) => new Set(current).add(slot.key));
          }
        }

        if (requestVersion !== mealPlanImageRequestVersionRef.current) return;
        await new Promise((resolve) => setTimeout(resolve, PREMIUM_REPLICATE_LOOKUP_DELAY_MS));
      }
    }
  }, [access.tier, getAuthHeaders, mealPlanImagePlanKey, user]);

  useEffect(() => {
    void resolveMealPlanImages();
  }, [resolveMealPlanImages]);

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      <SectionHero
        title={t("mealPlanTitle")}
        description={t("mealPlanDesc")}
        eyebrow={t("weeklyNutritionRhythm")}
        chips={[t("balancedChip"), t("pantryAwareChip"), t("visualChip")]}
        icon={<CalendarDays className="h-6 w-6" />}
        stats={[
          { label: t("planStatus"), value: mealPlan ? t("activeStatus") : t("notGeneratedStatus") },
          { label: t("shoppingStat"), value: shoppingList.length ? `${shoppingList.length} ${t("items")}` : t("minimalStatus") },
          { label: t("accessStat"), value: access.tier === "premium" ? t("premiumStatus") : t("upgradeStatus") }
        ]}
        aside={
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("planningLane")}</p>
            <p className="text-sm leading-relaxed text-emerald-50/72">
              {t("mealPlanAside")}
            </p>
          </div>
        }
      />

      <motion.div variants={itemVariants} className="flex justify-start">
        <div className="space-y-3">
          {access.tier !== "premium" ? (
            <div className="rounded-[1.5rem] border border-amber-200/16 bg-amber-400/10 px-5 py-4 text-sm text-amber-50/88">
              {t("freeMealPlanNotice")
                .replace("{remaining}", String(access.aiCreditsRemaining))
                .replace("{limit}", String(access.aiCreditsLimit))}
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-emerald-200/16 bg-emerald-400/10 px-5 py-4 text-sm text-emerald-50/88">
              {t("premiumMealPlanNotice")}
            </div>
          )}
          <Button size="lg" loading={loading || savedPlanLoading} onClick={generateMealPlan} disabled={access.tier !== "premium"}>
            {access.tier !== "premium" ? t("premiumRequired") : loading ? t("craftingMenu") : mealPlan ? t("regeneratePlan") : t("generatePlan")}
          </Button>
        </div>
      </motion.div>

      {savedPlanLoading ? (
        <motion.div variants={itemVariants}>
          <Card className="rounded-[2rem] space-y-4" aria-busy="true">
            <p className="text-sm font-semibold text-emerald-50/72">{t("craftingMenu")}</p>
            <div className="grid gap-3 md:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-80 animate-pulse rounded-[1.7rem] border border-white/10 bg-white/[0.06]" />
              ))}
            </div>
          </Card>
        </motion.div>
      ) : mealPlan ? (
        <motion.div variants={itemVariants} className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="grid gap-4">
            <ResultLegalNotice mode="mealplan" />
            {mealPlan.plan.map((day) => (
              <Card key={day.day} className="rounded-[2rem] space-y-4">
                <div>
                  <h3 className="text-2xl font-display font-bold text-white">{day.day}</h3>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <MealPlanRevealCard
                    title={t("breakfast")}
                    meal={day.breakfast}
                    disableAutoImageLookup={access.tier === "premium"}
                    imageError={imageErrorSlots.has(buildMealPlanImageSlotKey(indexOfDay(mealPlan.plan, day.day), "breakfast"))}
                    imageLoading={imageLoadingSlots.has(buildMealPlanImageSlotKey(indexOfDay(mealPlan.plan, day.day), "breakfast"))}
                    pantryKeys={pantryKeys}
                    t={t}
                    onImageResolved={
                      user
                        ? async ({ imageAttributionName, imageAttributionUrl, imageSource, imageUrl }) => {
                            const persistedImageUrl =
                              access.tier === "premium"
                                ? null
                                : await persistRecipeImageForUser({
                                    uid: user.uid,
                                    imageUrl,
                                    query: serializeRecipePhotoQuery(buildMealPlanPhotoQuery(day.breakfast))
                                  });
                            await updateMealImage(
                              indexOfDay(mealPlan.plan, day.day),
                              "breakfast",
                              persistedImageUrl || imageUrl,
                              imageSource,
                              { name: imageAttributionName, url: imageAttributionUrl }
                            );
                          }
                        : undefined
                    }
                  />
                  <MealPlanRevealCard
                    title={t("lunch")}
                    meal={day.lunch}
                    disableAutoImageLookup={access.tier === "premium"}
                    imageError={imageErrorSlots.has(buildMealPlanImageSlotKey(indexOfDay(mealPlan.plan, day.day), "lunch"))}
                    imageLoading={imageLoadingSlots.has(buildMealPlanImageSlotKey(indexOfDay(mealPlan.plan, day.day), "lunch"))}
                    pantryKeys={pantryKeys}
                    t={t}
                    onImageResolved={
                      user
                        ? async ({ imageAttributionName, imageAttributionUrl, imageSource, imageUrl }) => {
                            const persistedImageUrl =
                              access.tier === "premium"
                                ? null
                                : await persistRecipeImageForUser({
                                    uid: user.uid,
                                    imageUrl,
                                    query: serializeRecipePhotoQuery(buildMealPlanPhotoQuery(day.lunch))
                                  });
                            await updateMealImage(
                              indexOfDay(mealPlan.plan, day.day),
                              "lunch",
                              persistedImageUrl || imageUrl,
                              imageSource,
                              { name: imageAttributionName, url: imageAttributionUrl }
                            );
                          }
                        : undefined
                    }
                  />
                  <MealPlanRevealCard
                    title={t("dinner")}
                    meal={day.dinner}
                    disableAutoImageLookup={access.tier === "premium"}
                    imageError={imageErrorSlots.has(buildMealPlanImageSlotKey(indexOfDay(mealPlan.plan, day.day), "dinner"))}
                    imageLoading={imageLoadingSlots.has(buildMealPlanImageSlotKey(indexOfDay(mealPlan.plan, day.day), "dinner"))}
                    pantryKeys={pantryKeys}
                    t={t}
                    onImageResolved={
                      user
                        ? async ({ imageAttributionName, imageAttributionUrl, imageSource, imageUrl }) => {
                            const persistedImageUrl =
                              access.tier === "premium"
                                ? null
                                : await persistRecipeImageForUser({
                                    uid: user.uid,
                                    imageUrl,
                                    query: serializeRecipePhotoQuery(buildMealPlanPhotoQuery(day.dinner))
                                  });
                            await updateMealImage(
                              indexOfDay(mealPlan.plan, day.day),
                              "dinner",
                              persistedImageUrl || imageUrl,
                              imageSource,
                              { name: imageAttributionName, url: imageAttributionUrl }
                            );
                          }
                        : undefined
                    }
                  />
                </div>
              </Card>
            ))}
          </div>

          <Card className="rounded-[2rem] space-y-4 h-fit">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("shoppingList")}</p>
              <h3 className="mt-2 text-2xl font-display font-bold text-white">{t("shoppingListDesc")}</h3>
            </div>
            <div className="space-y-2">
              {localizedShoppingList.length ? (
                localizedShoppingList.map((item, index) => (
                  <div key={`shopping-${index}-${item}`} className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-emerald-50/82">
                    {item}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-emerald-50/58">
                  {t("noExtraShoppingItems")}
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      ) : (
        <motion.div variants={itemVariants}>
          <EmptyState title={t("noMealPlan")} description={t("noMealPlanDesc")} />
        </motion.div>
      )}
    </motion.div>
  );
}

function MealPlanRevealCard({
  disableAutoImageLookup,
  imageError,
  imageLoading,
  title,
  meal,
  pantryKeys,
  t,
  onImageResolved
}: {
  disableAutoImageLookup?: boolean;
  imageError?: boolean;
  imageLoading?: boolean;
  title: string;
  meal: MealPlanMeal;
  pantryKeys: Set<string>;
  t: ReturnType<typeof useApp>["t"];
  onImageResolved?: (payload: {
    imageAttributionName?: string;
    imageAttributionUrl?: string;
    imageSource?: "api" | "cache" | "search" | "unsplash" | "wikimedia";
    imageUrl: string;
  }) => void | Promise<void>;
}) {
  const ingredients = meal.ingredients ?? [];
  const haveIngredients = ingredients.filter((ing) => pantryKeys.has(normalizePantryIngredientName(ing)));
  const needIngredients = ingredients.filter((ing) => !pantryKeys.has(normalizePantryIngredientName(ing)));

  const sections = [];
  if (haveIngredients.length) {
    sections.push({ title: t("inYourPantry"), tone: "have" as const, items: haveIngredients });
  }
  if (needIngredients.length) {
    sections.push({ title: t("toShop"), tone: "need" as const, items: needIngredients });
  }
  if (meal.steps?.length) {
    sections.push({ title: t("preparation"), tone: "steps" as const, items: meal.steps });
  }

  return (
    <MealRevealCard
      name={meal.name}
      eyebrow={title}
      summary={buildMealSummary(ingredients, haveIngredients, needIngredients, t)}
      previewLabel={t("pantryNutritionPreview")}
      previewItems={[...haveIngredients, ...needIngredients].slice(0, 5)}
      imageUrl={meal.image_url}
      imageSource={meal.image_source}
      imageAttributionName={meal.image_attribution_name}
      imageAttributionUrl={meal.image_attribution_url}
      imageError={imageError}
      imageLoading={imageLoading}
      imageQuery={buildMealPlanPhotoQuery(meal)}
      imageExactNames={buildMealPlanPhotoExactNames(meal)}
      imagePromptIngredients={buildEnglishMealIngredients(meal.ingredients).slice(0, 10)}
      disableAutoImageLookup={disableAutoImageLookup}
      onImageResolved={onImageResolved}
      stats={[
        { label: "kcal", value: meal.calories },
        { label: "protein", value: meal.protein },
        { label: "carbs", value: meal.carbs },
        { label: "fat", value: meal.fat }
      ]}
      sections={sections}
      className="min-h-full"
    />
  );
}

function indexOfDay(plan: Array<{ day: string }>, day: string) {
  return plan.findIndex((entry) => entry.day === day);
}

function localizeShoppingListItem(item: string, uiLanguage: string) {
  if (uiLanguage !== "en" || !/[\u0600-\u06FF]/.test(item)) return item;

  const [namePart, ...rest] = item.split(/\s+-\s+/);
  const translatedName = translateIngredientToEnglish(namePart);
  return [translatedName, ...rest].filter(Boolean).join(" - ");
}

interface MealPlanImageSlot {
  dayIndex: number;
  key: string;
  meal: MealPlanMeal;
  mealType: MealSlotType;
}

function buildMealPlanImageSlots(plan: Array<{ breakfast: MealPlanMeal; lunch: MealPlanMeal; dinner: MealPlanMeal }>) {
  return plan.flatMap((day, dayIndex): MealPlanImageSlot[] => [
    {
      dayIndex,
      key: buildMealPlanImageSlotKey(dayIndex, "breakfast"),
      meal: day.breakfast,
      mealType: "breakfast"
    },
    {
      dayIndex,
      key: buildMealPlanImageSlotKey(dayIndex, "lunch"),
      meal: day.lunch,
      mealType: "lunch"
    },
    {
      dayIndex,
      key: buildMealPlanImageSlotKey(dayIndex, "dinner"),
      meal: day.dinner,
      mealType: "dinner"
    }
  ]);
}

function buildMealPlanImageSlotKey(dayIndex: number, mealType: MealSlotType) {
  return `${dayIndex}:${mealType}`;
}

function hasRenderableImage(imageUrl?: string): imageUrl is string {
  return Boolean(imageUrl && /^https?:\/\//i.test(imageUrl));
}

function buildMealSummary(
  allIngredients: string[],
  haveIngredients: string[],
  needIngredients: string[],
  t: ReturnType<typeof useApp>["t"]
) {
  const total = allIngredients.length ? `${allIngredients.length} ${t("plannedIngredients")}` : t("pantryAwareMeal");
  const have = haveIngredients.length ? `${haveIngredients.length} ${t("onHand")}` : null;
  const need = needIngredients.length ? `${needIngredients.length} ${t("toShopSummary")}` : null;
  return [total, have, need].filter(Boolean).join(" / ");
}

function buildMealPlanPhotoQuery(meal: MealPlanMeal) {
  const translatedIngredients = buildEnglishMealIngredients(meal.ingredients);
  return buildRecipePhotoQueryCandidates({
    imageSearchIndex: meal.image_search_index,
    imageSearchIndices: meal.image_search_indices,
    ingredients: translatedIngredients,
    name: meal.image_search_index ?? meal.name
  });
}

function serializeRecipePhotoQuery(queries: string[]) {
  return queries.join(" || ");
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

function buildMealPlanPhotoExactNames(meal: MealPlanMeal) {
  return Array.from(
    new Set(
      [
        meal.name,
        meal.image_search_index,
        ...(meal.image_search_indices ?? [])
      ]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).slice(0, 8);
}

function buildEnglishMealIngredients(ingredients?: string[]) {
  return (ingredients ?? [])
    .map((value) => translateIngredientToEnglish(value).trim())
    .filter(Boolean);
}
