"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ResultLegalNotice } from "@/components/legal/LegalNotice";
import { MealRevealCard } from "@/components/dashboard/MealRevealCard";
import { useApp } from "@/contexts/AppContext";
import { hasRecipeImageLookupAccess, useAuth } from "@/contexts/AuthContext";
import { useHistory } from "@/hooks/useHistory";
import { useMealPlan } from "@/hooks/useMealPlan";
import { usePantry } from "@/hooks/usePantry";
import { containerVariants, itemVariants } from "@/lib/animations";
import { translateIngredientToEnglish, translateRecipeTitleToEnglish } from "@/lib/arabicRecipeLocalization";
import { persistRecipeImageForUser } from "@/lib/recipeImageStorage";
import { buildRecipePhotoQueryCandidates } from "@/lib/recipePhotoQueries";
import { normalizeMealPlanData } from "@/lib/mealPlan";
import { normalizePantryIngredientName } from "@/lib/pantryQuantity";
import { isUsableRecipeImageForAccess } from "@/lib/recipeImageQuality";
import { buildNormalizedShoppingList } from "@/lib/shoppingListNormalizer";
import { isLikelyBackgroundFetchInterruption } from "@/lib/backgroundRecipeJobs";
import { getCuisineDisplayLabel } from "@/lib/cuisines";
import type { TranslationKey } from "@/lib/translations";
import type { MealPlanMeal } from "@/lib/types";
import { EmptyState, SectionHero } from "./shared";

const PREMIUM_REPLICATE_LOOKUP_DELAY_MS = 1200;
const PREMIUM_REPLICATE_REQUEUE_DELAY_MS = 5000;
const PREMIUM_REPLICATE_REQUEUE_ROUNDS = 6;
const MEAL_PLAN_PREMIUM_IMAGE_REPAIR_INTERVAL_MS = 18 * 1000;
const MEAL_PLAN_HISTORY_ENTRY_STORAGE_KEY = "nutrimoment-meal-plan-history-entry";
const PENDING_MEAL_PLAN_GENERATION_STORAGE_KEY = "nutrimoment.pendingMealPlanGenerationIds";
const MEAL_PLAN_GENERATION_TIMEOUT_MS = 85_000;
const MEAL_PLAN_PENDING_RECOVERY_TIMEOUT_MS = 3 * 60 * 1000;
const MEAL_PLAN_HISTORY_ENTRY_TIMEOUT_MS = 8_000;
const MEAL_PLAN_IMAGE_APPLY_CONCURRENCY = 4;
const MEAL_PLAN_REPLICATE_IMAGE_CONCURRENCY = 2;
type MealSlotType = "breakfast" | "lunch" | "dinner";
type MealPhotoLookupResponse = {
  error?: string;
  imageAttributionName?: string;
  imageAttributionUrl?: string;
  imageSource?: "api" | "cache" | "search" | "unsplash" | "wikimedia";
  imageUrl?: string;
  ok?: boolean;
  retryAfterSeconds?: number;
  status?: number;
};
type MealPhotoBatchResponse = {
  results?: Record<string, MealPhotoLookupResponse>;
};
type MealPhotoRestoreResponse = {
  images?: Array<{
    dayIndex: number;
    imageAttributionName?: string;
    imageAttributionUrl?: string;
    imageSource?: "api" | "cache" | "search" | "unsplash" | "wikimedia";
    imageUrl: string;
    mealType: MealSlotType;
  }>;
};

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function withClientTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      reject(new Error(`${label} timed out`));
    }, timeoutMs);

    promise
      .then(resolve, reject)
      .finally(() => globalThis.clearTimeout(timeoutId));
  });
}

export function MealPlanTab() {
  const { t, settings, health, setError } = useApp();
  const { access, getAuthHeaders, refreshAccess, user } = useAuth();
  const hasGeneratedImageAccess = hasRecipeImageLookupAccess(access);
  const { items } = usePantry();
  const {
    items: historyItems,
    addEntry: addHistoryEntry,
    updateEntryStatus,
    updateRecipeImage: updateHistoryRecipeImage
  } = useHistory();
  const { mealPlan, loading: savedPlanLoading, error: mealPlanError, reloadMealPlan, saveMealPlan, updateMealImage } = useMealPlan();
  const [loading, setLoading] = useState(false);
  const [imageLoadingSlots, setImageLoadingSlots] = useState<Set<string>>(() => new Set());
  const [imageErrorSlots, setImageErrorSlots] = useState<Set<string>>(() => new Set());
  const mealPlanImageRequestVersionRef = useRef(0);
  const mealPlanRef = useRef(mealPlan);
  const imageErrorSlotsRef = useRef(imageErrorSlots);
  const mealPlanHistoryEntryIdRef = useRef<string | null>(null);
  const updateMealImageRef = useRef(updateMealImage);
  const updateEntryStatusRef = useRef(updateEntryStatus);
  const updateHistoryRecipeImageRef = useRef(updateHistoryRecipeImage);
  const canGenerateMealPlan = access.tier === "premium" || access.weeklyPlanRemaining > 0;

  useEffect(() => {
    if (mealPlanError) {
      setError(mealPlanError.message);
    }
  }, [mealPlanError, setError]);

  const generateMealPlan = async () => {
    if (!canGenerateMealPlan) {
      setError("Your 3 free weekly meal plans are used. Upgrade to premium for more weekly planning.");
      return;
    }

    setLoading(true);
    let pendingHistoryEntryId: string | null = null;
    try {
      const historyIngredients = items.map((item) => item.name);
      pendingHistoryEntryId = await withClientTimeout(
        addHistoryEntry({
          timestamp: new Date().toISOString(),
          title: t("mealPlanTitle"),
          sessionType: "weekly_meal_plan",
          ingredients: historyIngredients,
          recipes: [],
          generationStatus: "pending",
          generationMessage: t("craftingMenu")
        }),
        MEAL_PLAN_HISTORY_ENTRY_TIMEOUT_MS,
        "Meal plan history entry"
      ).catch(() => null);
      if (pendingHistoryEntryId) {
        rememberPendingMealPlanGeneration(pendingHistoryEntryId);
        mealPlanHistoryEntryIdRef.current = pendingHistoryEntryId;
      }

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), MEAL_PLAN_GENERATION_TIMEOUT_MS);
      const response = await fetch("/api/mealplan", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        signal: controller.signal,
        body: JSON.stringify({
          pantry: historyIngredients,
          pantryItems: items.map((item) => ({ name: item.name, quantity: item.quantity })),
          uiLanguage: settings.uiLanguage,
          preferredCuisine: settings.preferredCuisine,
          calorieTarget: settings.calorieTarget,
          diets: health.diets,
          conditions: health.conditions,
          allergens: health.allergens ?? [],
          historyEntryId: pendingHistoryEntryId ?? undefined,
          historyIngredients,
          historyTitle: t("mealPlanTitle"),
          persistResult: true
        })
      }).finally(() => window.clearTimeout(timeoutId));
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
      void persistMealPlanRecipes(nextMealPlan);
      if (pendingHistoryEntryId) {
        rememberMealPlanHistoryEntry(nextMealPlan, pendingHistoryEntryId);
        forgetPendingMealPlanGeneration(pendingHistoryEntryId);
      }
    } catch (error) {
      const interrupted = pendingHistoryEntryId && isLikelyBackgroundFetchInterruption(error);
      const message = interrupted
        ? "Meal plan generation was interrupted before it finished. Please try again."
        : error instanceof Error ? error.message : "Failed to generate meal plan";
      if (pendingHistoryEntryId) {
        await updateEntryStatus(pendingHistoryEntryId, "failed", message).catch(() => undefined);
        forgetPendingMealPlanGeneration(pendingHistoryEntryId);
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const pantryKeys = useMemo(
    () => new Set(items.map((item) => normalizePantryIngredientName(item.name)).filter(Boolean)),
    [items]
  );
  const shoppingList = useMemo(
    () => buildNormalizedShoppingList({ displayLanguage: settings.uiLanguage, mealPlan, pantryItems: items }),
    [items, mealPlan, settings.uiLanguage]
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
    imageErrorSlotsRef.current = imageErrorSlots;
  }, [imageErrorSlots]);

  useEffect(() => {
    setImageLoadingSlots(new Set());
    setImageErrorSlots(new Set());
  }, [mealPlanImagePlanKey]);

  useEffect(() => {
    updateMealImageRef.current = updateMealImage;
  }, [updateMealImage]);

  useEffect(() => {
    updateEntryStatusRef.current = updateEntryStatus;
  }, [updateEntryStatus]);

  useEffect(() => {
    updateHistoryRecipeImageRef.current = updateHistoryRecipeImage;
  }, [updateHistoryRecipeImage]);

  useEffect(() => {
    if (!user || !readPendingMealPlanGenerationIds().length) return;
    let lastReloadAt = 0;

    const recoverPendingMealPlan = () => {
      const pendingEntries = readPendingMealPlanGenerationEntries();
      const pendingIds = pendingEntries.map((entry) => entry.id);
      if (!pendingIds.length) {
        setLoading(false);
        return;
      }
      const now = Date.now();
      const expiredIds = pendingEntries
        .filter((entry) => now - entry.startedAt > MEAL_PLAN_PENDING_RECOVERY_TIMEOUT_MS)
        .map((entry) => entry.id);
      if (expiredIds.length) {
        expiredIds.forEach((id) => {
          void updateEntryStatusRef.current(
            id,
            "failed",
            "Meal plan generation timed out before it finished. Please try again."
          ).catch(() => undefined);
          forgetPendingMealPlanGeneration(id);
        });
        void reloadMealPlan();
        setLoading(readPendingMealPlanGenerationIds().length > 0);
        return;
      }
      if (document.visibilityState === "hidden") return;
      if (now - lastReloadAt < 3000) return;
      lastReloadAt = now;
      setLoading(true);
      void reloadMealPlan().finally(() => {
        if (!readPendingMealPlanGenerationIds().length) {
          setLoading(false);
        }
      });
    };

    recoverPendingMealPlan();
    const intervalId = window.setInterval(recoverPendingMealPlan, 10000);
    window.addEventListener("focus", recoverPendingMealPlan);
    document.addEventListener("visibilitychange", recoverPendingMealPlan);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", recoverPendingMealPlan);
      document.removeEventListener("visibilitychange", recoverPendingMealPlan);
    };
  }, [reloadMealPlan, user]);

  useEffect(() => {
    const pendingIds = readPendingMealPlanGenerationIds();
    if (!pendingIds.length) return;
    const pendingSet = new Set(pendingIds);
    const finishedEntries = historyItems.filter(
      (item) =>
        pendingSet.has(item.id) &&
        (item.generationStatus === "completed" || item.generationStatus === "failed")
    );
    if (!finishedEntries.length) return;

    finishedEntries.forEach((item) => forgetPendingMealPlanGeneration(item.id));
    if (finishedEntries.some((item) => item.generationStatus === "completed")) {
      void reloadMealPlan();
    }
    setLoading(readPendingMealPlanGenerationIds().length > 0);
  }, [historyItems, reloadMealPlan]);

  const persistMealPlanRecipes = useCallback(async (nextMealPlan: NonNullable<typeof mealPlan>) => {
    if (!user || !hasGeneratedImageAccess) return;

    try {
      await fetch("/api/mealplan/cache", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          allergens: health.allergens ?? [],
          diets: health.diets,
          mealPlan: nextMealPlan,
          uiLanguage: settings.uiLanguage
        })
      });
    } catch {
      // Recipe-cache persistence is a background convenience; the user plan is already saved.
    }
  }, [getAuthHeaders, hasGeneratedImageAccess, health.allergens, health.diets, settings.uiLanguage, user]);

  const resolveMealPlanImages = useCallback(async () => {
    void mealPlanImagePlanKey;
    const currentMealPlan = mealPlanRef.current;
    if (!currentMealPlan || !user || !hasGeneratedImageAccess) return;
    if (!mealPlanHistoryEntryIdRef.current) {
      mealPlanHistoryEntryIdRef.current = readMealPlanHistoryEntry(currentMealPlan);
    }
    const requestVersion = mealPlanImageRequestVersionRef.current + 1;
    mealPlanImageRequestVersionRef.current = requestVersion;

    const slots = buildMealPlanImageSlots(currentMealPlan.plan);
    const recoverableFailedKeys = imageErrorSlotsRef.current;
    const slotsNeedingLookup = slots.filter(
      (slot) => !hasStrictRenderableImage(slot.meal.image_url, hasGeneratedImageAccess) && !recoverableFailedKeys.has(slot.key)
    );
    if (!slotsNeedingLookup.length) {
      setImageLoadingSlots(new Set());
      return;
    }

    const usedImageUrls = new Set(
      slots
        .map((slot) => slot.meal.image_url)
        .filter((imageUrl): imageUrl is string => hasStrictRenderableImage(imageUrl, hasGeneratedImageAccess))
    );
    const pendingPremiumKeys = new Set(slotsNeedingLookup.map((slot) => slot.key));
    let latestMealPlanForRecipeCache = currentMealPlan;
    let resolvedImageCount = 0;
    const slotByKey = new Map(slotsNeedingLookup.map((slot) => [slot.key, slot]));

    const resolveCachedMealPhotosBatch = async (lookupSlots: MealPlanImageSlot[]) => {
      const response = await fetch("/api/recipe-photo/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          items: lookupSlots.map((slot) => {
            const queries = buildMealPlanPhotoQuery(slot.meal);
            const identityParams = buildMealPlanPhotoIdentityParams(slot.meal);
            return {
              alt: queries.slice(1),
              cacheOnly: true,
              cuisine: slot.meal.cuisine,
              exact: buildMealPlanPhotoExactNames(slot.meal),
              exclude: Array.from(usedImageUrls),
              ingredient: buildEnglishMealIngredients(slot.meal.ingredients).slice(0, 10),
              query: queries[0] ?? slot.meal.name,
              queryKey: slot.key,
              ...identityParams
            };
          })
        })
      });

      return (await response.json().catch(() => ({ results: {} }))) as MealPhotoBatchResponse;
    };

    const resolveGeneratedMealPhoto = async (slot: MealPlanImageSlot) => {
      const queries = buildMealPlanPhotoQuery(slot.meal);
      const response = await fetch(
        buildMealPlanRecipePhotoRequestUrl(
          queries,
          buildEnglishMealIngredients(slot.meal.ingredients).slice(0, 10),
          Array.from(usedImageUrls),
          {
            cuisine: slot.meal.cuisine,
            exactNames: buildMealPlanPhotoExactNames(slot.meal),
            identity: buildMealPlanPhotoIdentityParams(slot.meal)
          }
        ),
        {
          headers: await getAuthHeaders()
        }
      );
      const data = (await response.json().catch(() => null)) as MealPhotoLookupResponse | null;
      return {
        data,
        ok: response.ok && hasStrictRenderableImage(data?.imageUrl, true),
        retryAfterSeconds: Number(response.headers.get("Retry-After") ?? "0") || data?.retryAfterSeconds || 0,
        status: response.status
      };
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
      latestMealPlanForRecipeCache = applyMealImageToMealPlan(latestMealPlanForRecipeCache, slot, data);
      resolvedImageCount += 1;
      await updateMealImageRef.current(slot.dayIndex, slot.mealType, data.imageUrl, data.imageSource, {
        name: data.imageAttributionName,
        url: data.imageAttributionUrl
      });
      const historyEntryId = mealPlanHistoryEntryIdRef.current;
      const historyRecipeIndex = getMealPlanHistoryRecipeIndex(slot.dayIndex, slot.mealType);
      if (historyEntryId && historyRecipeIndex >= 0) {
        void updateHistoryRecipeImageRef.current(
          historyEntryId,
          historyRecipeIndex,
          data.imageUrl,
          false,
          data.imageSource,
          { name: data.imageAttributionName, url: data.imageAttributionUrl }
        );
      }
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

    try {
      const response = await fetch("/api/mealplan/images", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({ mealPlan: currentMealPlan })
      });
      const restore = (await response.json().catch(() => ({ images: [] }))) as MealPhotoRestoreResponse;
      const restoredMatches = [];

      for (const image of restore.images ?? []) {
        const key = buildMealPlanImageSlotKey(image.dayIndex, image.mealType);
        const slot = slotByKey.get(key);
        if (!slot || !pendingPremiumKeys.has(key) || !hasStrictRenderableImage(image.imageUrl, true)) continue;

        pendingPremiumKeys.delete(key);
        restoredMatches.push({ image, slot });
      }

      await runWithConcurrency(restoredMatches, MEAL_PLAN_IMAGE_APPLY_CONCURRENCY, async ({ image, slot }) => {
        await applyResolvedMealImage(slot, image);
      });
    } catch {
      // Exact cached meal images are a fast path; regular generation handles misses.
    }

    if (requestVersion !== mealPlanImageRequestVersionRef.current) return;
    if (pendingPremiumKeys.size === 0) {
      setImageLoadingSlots(new Set());
      setImageErrorSlots(new Set());
      if (resolvedImageCount > 0) {
        void persistMealPlanRecipes(latestMealPlanForRecipeCache);
      }
      return;
    }

    setImageErrorSlots(new Set());
    setImageLoadingSlots(new Set(Array.from(pendingPremiumKeys)));

    for (let round = 0; round <= PREMIUM_REPLICATE_REQUEUE_ROUNDS && pendingPremiumKeys.size > 0; round += 1) {
      if (round > 0) {
        await new Promise((resolve) => setTimeout(resolve, PREMIUM_REPLICATE_REQUEUE_DELAY_MS));
      }
      if (requestVersion !== mealPlanImageRequestVersionRef.current) return;

      const lookupSlots = slotsNeedingLookup.filter((entry) => pendingPremiumKeys.has(entry.key));
      const isLastRound = round === PREMIUM_REPLICATE_REQUEUE_ROUNDS;
      const batch: MealPhotoBatchResponse = round === 0
        ? await resolveCachedMealPhotosBatch(lookupSlots).catch(
            (): MealPhotoBatchResponse => ({ results: {} })
          )
        : { results: {} };
      const batchResults: Record<string, MealPhotoLookupResponse> = batch.results ?? {};

      const resolvedMatches: Array<{ data: MealPhotoLookupResponse & { imageUrl: string }; slot: MealPlanImageSlot }> = [];
      for (const slot of lookupSlots) {
        const data = batchResults[slot.key];
        if (data?.ok && hasStrictRenderableImage(data.imageUrl, true) && !usedImageUrls.has(data.imageUrl)) {
          pendingPremiumKeys.delete(slot.key);
          resolvedMatches.push({ data: { ...data, imageUrl: data.imageUrl }, slot });
        }
      }

      await runWithConcurrency(resolvedMatches, MEAL_PLAN_IMAGE_APPLY_CONCURRENCY, async ({ data, slot }) => {
        await applyResolvedMealImage(slot, data);
      });

      const generationSlots = lookupSlots.filter((slot) => pendingPremiumKeys.has(slot.key));
      await runWithConcurrency(generationSlots, MEAL_PLAN_REPLICATE_IMAGE_CONCURRENCY, async (slot) => {
        if (requestVersion !== mealPlanImageRequestVersionRef.current) return;
        const result = await resolveGeneratedMealPhoto(slot).catch(() => ({
          data: null,
          ok: false,
          retryAfterSeconds: 0,
          status: 503
        }));
        if (
          result.ok &&
          result.data &&
          hasStrictRenderableImage(result.data.imageUrl, true) &&
          !usedImageUrls.has(result.data.imageUrl)
        ) {
          pendingPremiumKeys.delete(slot.key);
          await applyResolvedMealImage(slot, { ...result.data, imageUrl: result.data.imageUrl });
          return;
        }

        if (isLastRound) {
          setImageLoadingSlots((current) => new Set([...Array.from(current), slot.key]));
          setImageErrorSlots((current) => {
            const next = new Set(current);
            next.delete(slot.key);
            return next;
          });
        }
      });

      if (requestVersion !== mealPlanImageRequestVersionRef.current) return;
      await new Promise((resolve) => setTimeout(resolve, PREMIUM_REPLICATE_LOOKUP_DELAY_MS));
    }

    if (resolvedImageCount > 0) {
      void persistMealPlanRecipes(latestMealPlanForRecipeCache);
    }
  }, [getAuthHeaders, hasGeneratedImageAccess, mealPlanImagePlanKey, persistMealPlanRecipes, user]);

  useEffect(() => {
    void resolveMealPlanImages();
  }, [resolveMealPlanImages]);

  const missingPremiumMealImages = useMemo(() => {
    if (!mealPlan) return 0;
    return buildMealPlanImageSlots(mealPlan.plan).filter(
      (slot) => !hasStrictRenderableImage(slot.meal.image_url, hasGeneratedImageAccess)
    ).length;
  }, [hasGeneratedImageAccess, mealPlan]);

  useEffect(() => {
    if (!hasGeneratedImageAccess || savedPlanLoading || !missingPremiumMealImages) return;
    const interval = globalThis.setInterval(() => {
      void resolveMealPlanImages();
    }, MEAL_PLAN_PREMIUM_IMAGE_REPAIR_INTERVAL_MS);
    return () => globalThis.clearInterval(interval);
  }, [hasGeneratedImageAccess, missingPremiumMealImages, resolveMealPlanImages, savedPlanLoading]);

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
          {
            label: t("accessStat"),
            value: access.tier === "premium"
              ? t("premiumStatus")
              : `${access.weeklyPlanRemaining}/${access.weeklyPlanLimit}`
          }
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

      <motion.div variants={itemVariants}>
        <Card className="rounded-[1.6rem] space-y-4 sm:rounded-[2rem]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("preferences")}</p>
            <h3 className="mt-1.5 text-xl font-display font-bold text-white sm:text-2xl">{t("healthProfile")}</h3>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-50/52">{t("preferredCuisine")}</p>
              <p className="mt-1.5 text-base font-semibold text-white">
                {getCuisineDisplayLabel(settings.preferredCuisine, settings.uiLanguage)}
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-50/52">{t("dailyCalorieTarget")}</p>
              <p className="mt-1.5 text-base font-semibold text-white">{settings.calorieTarget} kcal</p>
            </div>
          </div>

          {(health.diets.length > 0 || health.conditions.length > 0 || (health.allergens ?? []).length > 0) && (
            <div className="space-y-3">
              {health.diets.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-50/52">{t("dietaryPrefs")}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {health.diets.map((diet) => (
                      <span key={diet} className="rounded-full border border-emerald-200/22 bg-emerald-400/14 px-2.5 py-0.5 text-xs font-semibold text-emerald-50">
                        {t(diet as TranslationKey)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {health.conditions.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-50/52">{t("healthConditions")}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {health.conditions.map((condition) => (
                      <span key={condition} className="rounded-full border border-amber-200/22 bg-amber-400/12 px-2.5 py-0.5 text-xs font-semibold text-amber-100">
                        {t(condition as TranslationKey)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(health.allergens ?? []).length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-50/52">{t("allergensTitle")}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(health.allergens ?? []).map((allergen) => (
                      <span key={allergen} className="rounded-full border border-red-200/20 bg-red-400/10 px-2.5 py-0.5 text-xs font-semibold text-red-100">
                        {allergen}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="h-px bg-white/[0.07]" />

          <div className="space-y-3">
            {access.tier !== "premium" ? (
              <div className="rounded-[1.35rem] border border-amber-200/16 bg-amber-400/10 px-4 py-3 text-sm text-amber-50/88">
                {t("freeMealPlanNotice")
                  .replace("{remaining}", String(access.weeklyPlanRemaining))
                  .replace("{limit}", String(access.weeklyPlanLimit))}
              </div>
            ) : (
              <div className="rounded-[1.35rem] border border-emerald-200/16 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-50/88">
                {t("premiumMealPlanNotice")}
              </div>
            )}
            <Button fullWidth size="lg" loading={loading || savedPlanLoading} onClick={generateMealPlan} disabled={!canGenerateMealPlan}>
              {!canGenerateMealPlan ? t("freePlansUsed") : loading ? t("craftingMenu") : mealPlan ? t("regeneratePlan") : t("generatePlan")}
            </Button>
          </div>
        </Card>
      </motion.div>

      {loading || savedPlanLoading ? (
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
        <motion.div variants={itemVariants} className="grid items-start gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="flex flex-col gap-3">
            <ResultLegalNotice mode="mealplan" />
            {mealPlan.plan.map((day, dayIndex) => (
              <Card key={day.day} className="rounded-[2rem] space-y-4">
                <div>
                  <h3 className="text-2xl font-display font-bold text-white">{day.day}</h3>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <MealPlanRevealCard
                    title={t("breakfast")}
                    meal={day.breakfast}
                    deferImageLookup={dayIndex > 0}
                    disableAutoImageLookup={
                      hasGeneratedImageAccess &&
                      !imageErrorSlots.has(buildMealPlanImageSlotKey(indexOfDay(mealPlan.plan, day.day), "breakfast"))
                    }
                    imageError={imageErrorSlots.has(buildMealPlanImageSlotKey(indexOfDay(mealPlan.plan, day.day), "breakfast"))}
                    imageLoading={imageLoadingSlots.has(buildMealPlanImageSlotKey(indexOfDay(mealPlan.plan, day.day), "breakfast"))}
                    pantryKeys={pantryKeys}
                    strictGeneratedImages={hasGeneratedImageAccess}
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
                            clearMealPlanImageSlotState(
                              buildMealPlanImageSlotKey(indexOfDay(mealPlan.plan, day.day), "breakfast"),
                              setImageLoadingSlots,
                              setImageErrorSlots
                            );
                          }
                        : undefined
                    }
                  />
                  <MealPlanRevealCard
                    title={t("lunch")}
                    meal={day.lunch}
                    deferImageLookup={dayIndex > 0}
                    disableAutoImageLookup={
                      hasGeneratedImageAccess &&
                      !imageErrorSlots.has(buildMealPlanImageSlotKey(indexOfDay(mealPlan.plan, day.day), "lunch"))
                    }
                    imageError={imageErrorSlots.has(buildMealPlanImageSlotKey(indexOfDay(mealPlan.plan, day.day), "lunch"))}
                    imageLoading={imageLoadingSlots.has(buildMealPlanImageSlotKey(indexOfDay(mealPlan.plan, day.day), "lunch"))}
                    pantryKeys={pantryKeys}
                    strictGeneratedImages={hasGeneratedImageAccess}
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
                            clearMealPlanImageSlotState(
                              buildMealPlanImageSlotKey(indexOfDay(mealPlan.plan, day.day), "lunch"),
                              setImageLoadingSlots,
                              setImageErrorSlots
                            );
                          }
                        : undefined
                    }
                  />
                  <MealPlanRevealCard
                    title={t("dinner")}
                    meal={day.dinner}
                    deferImageLookup={dayIndex > 0}
                    disableAutoImageLookup={
                      hasGeneratedImageAccess &&
                      !imageErrorSlots.has(buildMealPlanImageSlotKey(indexOfDay(mealPlan.plan, day.day), "dinner"))
                    }
                    imageError={imageErrorSlots.has(buildMealPlanImageSlotKey(indexOfDay(mealPlan.plan, day.day), "dinner"))}
                    imageLoading={imageLoadingSlots.has(buildMealPlanImageSlotKey(indexOfDay(mealPlan.plan, day.day), "dinner"))}
                    pantryKeys={pantryKeys}
                    strictGeneratedImages={hasGeneratedImageAccess}
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
                            clearMealPlanImageSlotState(
                              buildMealPlanImageSlotKey(indexOfDay(mealPlan.plan, day.day), "dinner"),
                              setImageLoadingSlots,
                              setImageErrorSlots
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
              {shoppingList.length ? (
                shoppingList.map((item, index) => (
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
  deferImageLookup,
  disableAutoImageLookup,
  imageError,
  imageLoading,
  title,
  meal,
  pantryKeys,
  strictGeneratedImages,
  t,
  onImageResolved
}: {
  deferImageLookup?: boolean;
  disableAutoImageLookup?: boolean;
  imageError?: boolean;
  imageLoading?: boolean;
  title: string;
  meal: MealPlanMeal;
  pantryKeys: Set<string>;
  strictGeneratedImages?: boolean;
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
      imageUrl={hasStrictRenderableImage(meal.image_url, false) ? meal.image_url : undefined}
      imageSource={meal.image_source}
      imageAttributionName={meal.image_attribution_name}
      imageAttributionUrl={meal.image_attribution_url}
      imageError={imageError}
      imageLoading={imageLoading}
      imageQuery={buildMealPlanPhotoQuery(meal)}
      imageExactNames={buildMealPlanPhotoExactNames(meal)}
      imageCuisine={meal.cuisine}
      imagePromptIngredients={buildEnglishMealIngredients(meal.ingredients).slice(0, 10)}
      deferImageLookup={deferImageLookup}
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

function getMealPlanHistoryRecipeIndex(dayIndex: number, mealType: MealSlotType) {
  const mealOffset: Record<MealSlotType, number> = {
    breakfast: 0,
    lunch: 1,
    dinner: 2
  };
  return dayIndex * 3 + mealOffset[mealType];
}

function getMealPlanHistoryKey(mealPlan: NonNullable<ReturnType<typeof normalizeMealPlanData>>) {
  return mealPlan.plan
    .map((day) => [day.day, day.breakfast.name, day.lunch.name, day.dinner.name].join("::"))
    .join("||")
    .trim()
    .toLowerCase();
}

function readMealPlanHistoryEntry(mealPlan: NonNullable<ReturnType<typeof normalizeMealPlanData>>) {
  try {
    const entries = safeJsonParse<Record<string, string>>(
      globalThis.localStorage?.getItem(MEAL_PLAN_HISTORY_ENTRY_STORAGE_KEY) ?? "{}",
      {}
    );
    return entries[getMealPlanHistoryKey(mealPlan)] ?? null;
  } catch {
    return null;
  }
}

function rememberMealPlanHistoryEntry(
  mealPlan: NonNullable<ReturnType<typeof normalizeMealPlanData>>,
  historyEntryId: string
) {
  try {
    const entries = safeJsonParse<Record<string, string>>(
      globalThis.localStorage?.getItem(MEAL_PLAN_HISTORY_ENTRY_STORAGE_KEY) ?? "{}",
      {}
    );
    entries[getMealPlanHistoryKey(mealPlan)] = historyEntryId;
    globalThis.localStorage?.setItem(MEAL_PLAN_HISTORY_ENTRY_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Local mapping is only a resilience helper; Firestore still owns the saved history entry.
  }
}

function readPendingMealPlanGenerationIds() {
  return readPendingMealPlanGenerationEntries().map((entry) => entry.id);
}

function readPendingMealPlanGenerationEntries(): Array<{ id: string; startedAt: number }> {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PENDING_MEAL_PLAN_GENERATION_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .map((item): { id: string; startedAt: number } | null => {
        if (typeof item === "string") return { id: item, startedAt: now - MEAL_PLAN_PENDING_RECOVERY_TIMEOUT_MS - 1 };
        if (!item || typeof item !== "object") return null;
        const id = typeof item.id === "string" ? item.id : "";
        if (!id) return null;
        const startedAt = typeof item.startedAt === "number" && Number.isFinite(item.startedAt)
          ? item.startedAt
          : now - MEAL_PLAN_PENDING_RECOVERY_TIMEOUT_MS - 1;
        return { id, startedAt };
      })
      .filter((item): item is { id: string; startedAt: number } => Boolean(item));
  } catch {
    return [];
  }
}

function rememberPendingMealPlanGeneration(entryId: string) {
  if (typeof window === "undefined") return;
  const existing = readPendingMealPlanGenerationEntries().filter((entry) => entry.id !== entryId);
  const next = [...existing, { id: entryId, startedAt: Date.now() }];
  window.localStorage.setItem(PENDING_MEAL_PLAN_GENERATION_STORAGE_KEY, JSON.stringify(next.slice(-20)));
}

function forgetPendingMealPlanGeneration(entryId: string) {
  if (typeof window === "undefined") return;
  const next = readPendingMealPlanGenerationEntries().filter((item) => item.id !== entryId);
  window.localStorage.setItem(PENDING_MEAL_PLAN_GENERATION_STORAGE_KEY, JSON.stringify(next));
}


function applyMealImageToMealPlan(
  mealPlan: NonNullable<ReturnType<typeof normalizeMealPlanData>>,
  slot: MealPlanImageSlot,
  data: {
    imageAttributionName?: string;
    imageAttributionUrl?: string;
    imageSource?: "api" | "cache" | "search" | "unsplash" | "wikimedia";
    imageUrl: string;
  }
) {
  return {
    ...mealPlan,
    plan: mealPlan.plan.map((day, dayIndex) =>
      dayIndex === slot.dayIndex
        ? {
            ...day,
            [slot.mealType]: {
              ...day[slot.mealType],
              image_attribution_name: data.imageAttributionName,
              image_attribution_url: data.imageAttributionUrl,
              image_source: data.imageSource,
              image_url: data.imageUrl
            }
          }
        : day
    )
  };
}

function hasStrictRenderableImage(imageUrl: string | undefined, strictGeneratedOnly: boolean): imageUrl is string {
  return isUsableRecipeImageForAccess(imageUrl, strictGeneratedOnly);
}

function clearMealPlanImageSlotState(
  slotKey: string,
  setLoadingSlots: (updater: (current: Set<string>) => Set<string>) => void,
  setErrorSlots: (updater: (current: Set<string>) => Set<string>) => void
) {
  const removeSlot = (current: Set<string>) => {
    const next = new Set(current);
    next.delete(slotKey);
    return next;
  };
  setLoadingSlots(removeSlot);
  setErrorSlots(removeSlot);
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
  const identityEnglishName = meal.photo_identity?.english_name?.trim();
  const englishMealName = identityEnglishName || translateRecipeTitleToEnglish(meal.name, meal.image_search_index);
  const imageSearchIndices = Array.from(
    new Set(
      [
        englishMealName,
        meal.image_search_index,
        ...(meal.image_search_indices ?? [])
      ]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );
  return buildRecipePhotoQueryCandidates({
    imageSearchIndex: imageSearchIndices[0],
    imageSearchIndices,
    ingredients: translatedIngredients,
    name: englishMealName || meal.image_search_index || meal.name
  });
}

function serializeRecipePhotoQuery(queries: string[]) {
  return queries.join(" || ");
}

function buildMealPlanPhotoExactNames(meal: MealPlanMeal) {
  const identityEnglishName = meal.photo_identity?.english_name?.trim();
  const englishMealName = identityEnglishName || translateRecipeTitleToEnglish(meal.name, meal.image_search_index);
  return Array.from(
    new Set(
      [
        meal.name,
        identityEnglishName,
        englishMealName,
        meal.image_search_index,
        ...(meal.image_search_indices ?? [])
      ]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).slice(0, 8);
}

type MealPlanPhotoIdentityParams = {
  photoSlug?: string;
  photoCuisineKey?: string;
  photoProtein?: string;
  photoStarch?: string;
  photoSauce?: string;
  photoMethod?: string;
};

function buildMealPlanPhotoIdentityParams(meal: MealPlanMeal): MealPlanPhotoIdentityParams {
  const identity = meal.photo_identity;
  if (!identity?.dish_slug) return {};
  return {
    photoSlug: identity.dish_slug,
    photoCuisineKey: identity.cuisine_key,
    photoProtein: identity.protein,
    photoStarch: identity.starch,
    photoSauce: identity.sauce,
    photoMethod: identity.method
  };
}

function buildMealPlanRecipePhotoRequestUrl(
  queries: string[],
  ingredients: string[] = [],
  excludeUrls: string[] = [],
  exactContext: { cuisine?: string; exactNames?: string[]; identity?: MealPlanPhotoIdentityParams } = {}
) {
  const params = new URLSearchParams();
  queries.forEach((query, index) => {
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
  if (exactContext.identity) {
    const { photoSlug, photoCuisineKey, photoProtein, photoStarch, photoSauce, photoMethod } = exactContext.identity;
    if (photoSlug) params.set("photoSlug", photoSlug);
    if (photoCuisineKey) params.set("photoCuisineKey", photoCuisineKey);
    if (photoProtein) params.set("photoProtein", photoProtein);
    if (photoStarch) params.set("photoStarch", photoStarch);
    if (photoSauce) params.set("photoSauce", photoSauce);
    if (photoMethod) params.set("photoMethod", photoMethod);
  }
  excludeUrls.slice(0, 20).forEach((url) => params.append("exclude", url));
  return `/api/recipe-photo?${params.toString()}`;
}

function buildEnglishMealIngredients(ingredients?: string[]) {
  return (ingredients ?? [])
    .map((value) => translateIngredientToEnglish(value).trim())
    .filter(Boolean);
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
) {
  const queue = [...items];
  const workerCount = Math.max(1, Math.min(concurrency, queue.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (item === undefined) return;
        await worker(item);
      }
    })
  );
}
