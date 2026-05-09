"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/config/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { logger } from "@/lib/logger";
import { normalizeMealPlanData, sanitizeMealPlanForFirestore } from "@/lib/mealPlan";
import type { MealPlanData, RecipeImageSource } from "@/lib/types";

interface MealPlanState {
  mealPlan: MealPlanData | null;
  loading: boolean;
  error: Error | null;
}

type MealPlanAction =
  | { type: "loading"; payload: boolean }
  | { type: "plan"; payload: MealPlanData | null }
  | { type: "error"; payload: Error | null };

const INITIAL_STATE: MealPlanState = {
  mealPlan: null,
  loading: false,
  error: null
};

const mealPlanMemoryCache = new Map<string, MealPlanData>();

function isFirestoreQuotaError(error: unknown) {
  return (
    error instanceof Error &&
    /resource-exhausted|quota exceeded|too many requests|unavailable/i.test(error.message)
  );
}

function isTransientSyncError(error: unknown) {
  return (
    error instanceof Error &&
    /resource-exhausted|quota exceeded|too many requests|unavailable|network-request-failed|load failed|failed to fetch|offline/i.test(
      error.message
    )
  );
}

function isRenderableImage(imageUrl?: string) {
  return Boolean(imageUrl && /^https?:\/\//i.test(imageUrl));
}

function getMealImageIdentity(meal: MealPlanData["plan"][number]["breakfast"]) {
  return [
    meal.name,
    meal.image_search_index,
    ...(meal.image_search_indices ?? [])
  ]
    .map((value) => value?.trim().toLowerCase())
    .filter(Boolean)
    .join("::");
}

function preserveExistingMealImages(nextMealPlan: MealPlanData, currentMealPlan: MealPlanData | null) {
  if (!currentMealPlan) return nextMealPlan;

  const existingMealsByIdentity = new Map(
    currentMealPlan.plan
      .flatMap((day) => [day.breakfast, day.lunch, day.dinner])
      .map((meal) => [getMealImageIdentity(meal), meal] as const)
      .filter(([identity, meal]) => Boolean(identity) && isRenderableImage(meal.image_url))
  );

  return {
    ...nextMealPlan,
    plan: nextMealPlan.plan.map((day, dayIndex) => ({
      ...day,
      breakfast: preserveExistingMealImage(day.breakfast, currentMealPlan.plan[dayIndex]?.breakfast, existingMealsByIdentity),
      lunch: preserveExistingMealImage(day.lunch, currentMealPlan.plan[dayIndex]?.lunch, existingMealsByIdentity),
      dinner: preserveExistingMealImage(day.dinner, currentMealPlan.plan[dayIndex]?.dinner, existingMealsByIdentity)
    }))
  };
}

function preserveExistingMealImage(
  nextMeal: MealPlanData["plan"][number]["breakfast"],
  indexedExistingMeal: MealPlanData["plan"][number]["breakfast"] | undefined,
  existingMealsByIdentity: Map<string, MealPlanData["plan"][number]["breakfast"]>
) {
  if (isRenderableImage(nextMeal.image_url)) return nextMeal;

  const identity = getMealImageIdentity(nextMeal);
  const existingMeal =
    (indexedExistingMeal && getMealImageIdentity(indexedExistingMeal) === identity ? indexedExistingMeal : undefined) ??
    existingMealsByIdentity.get(identity);
  const existingImageUrl = existingMeal?.image_url;

  if (!existingMeal || !isRenderableImage(existingImageUrl)) return nextMeal;

  return {
    ...nextMeal,
    image_attribution_name: nextMeal.image_attribution_name ?? existingMeal.image_attribution_name,
    image_attribution_url: nextMeal.image_attribution_url ?? existingMeal.image_attribution_url,
    image_source: nextMeal.image_source ?? existingMeal.image_source,
    image_url: existingImageUrl
  };
}

function mealPlanReducer(state: MealPlanState, action: MealPlanAction): MealPlanState {
  switch (action.type) {
    case "loading":
      return { ...state, loading: action.payload };
    case "plan":
      return { ...state, mealPlan: action.payload, error: null };
    case "error":
      return { ...state, error: action.payload };
    default:
      return state;
  }
}

export function useMealPlan() {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(mealPlanReducer, INITIAL_STATE);
  const latestMealPlanRef = useRef<MealPlanData | null>(null);
  const localMutationVersionRef = useRef(0);

  useEffect(() => {
    latestMealPlanRef.current = state.mealPlan;
  }, [state.mealPlan]);

  const loadMealPlan = useCallback(async () => {
    if (!user) {
      latestMealPlanRef.current = null;
      dispatch({ type: "plan", payload: null });
      dispatch({ type: "loading", payload: false });
      return;
    }

    const cachedMealPlan = mealPlanMemoryCache.get(user.uid) ?? null;
    if (cachedMealPlan) {
      latestMealPlanRef.current = cachedMealPlan;
      dispatch({ type: "plan", payload: cachedMealPlan });
      dispatch({ type: "loading", payload: false });
    } else {
      dispatch({ type: "loading", payload: true });
    }

    const planRef = doc(db, "users", user.uid, "plans", "currentWeekly");
    const loadStartedAtMutationVersion = localMutationVersionRef.current;

    try {
      const snapshot = await getDoc(planRef);
      if (localMutationVersionRef.current !== loadStartedAtMutationVersion) {
        return;
      }
      if (!snapshot.exists()) {
        latestMealPlanRef.current = null;
        mealPlanMemoryCache.delete(user.uid);
        dispatch({ type: "plan", payload: null });
      } else {
        const data = snapshot.data() as { mealPlan?: unknown };
        const normalized = normalizeMealPlanData(data.mealPlan);
        latestMealPlanRef.current = normalized;
        if (normalized) {
          mealPlanMemoryCache.set(user.uid, normalized);
        } else {
          mealPlanMemoryCache.delete(user.uid);
        }
        dispatch({ type: "plan", payload: normalized });
      }
      dispatch({ type: "error", payload: null });
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error("Failed to load meal plan");
      if (isTransientSyncError(normalizedError)) {
        logger.warn("Meal plan sync read failed; keeping local state", { message: normalizedError.message });
      } else {
        dispatch({ type: "error", payload: normalizedError });
      }
    } finally {
      dispatch({ type: "loading", payload: false });
    }
  }, [user]);

  useEffect(() => {
    void loadMealPlan();
  }, [loadMealPlan]);

  const saveMealPlan = async (mealPlan: MealPlanData) => {
    const normalizedPlan = normalizeMealPlanData(mealPlan);
    const normalized = normalizedPlan ? preserveExistingMealImages(normalizedPlan, latestMealPlanRef.current) : null;
    if (!normalized) {
      throw new Error("Meal plan is missing required days");
    }

    localMutationVersionRef.current += 1;
    dispatch({ type: "plan", payload: normalized });
    latestMealPlanRef.current = normalized;
    if (user) {
      mealPlanMemoryCache.set(user.uid, normalized);
    }

    if (!user) {
      return;
    }

    const planRef = doc(db, "users", user.uid, "plans", "currentWeekly");
    try {
      const sanitized = sanitizeMealPlanForFirestore(normalized);
      await setDoc(
        planRef,
        {
          mealPlan: sanitized,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error("Generated plan displayed locally, but saving failed.");
      if (isTransientSyncError(normalizedError)) {
        logger.warn("Meal plan sync write failed; keeping local plan only", { message: normalizedError.message });
        return;
      }
      dispatch({
        type: "error",
        payload: normalizedError
      });
    }
  };

  const updateMealImage = useCallback(async (
    dayIndex: number,
    mealType: "breakfast" | "lunch" | "dinner",
    imageUrl: string,
    imageSource?: RecipeImageSource,
    imageAttribution?: { name?: string; url?: string }
  ) => {
    const current = latestMealPlanRef.current;
    if (!current) return;
    const currentMeal = current.plan[dayIndex]?.[mealType];
    if (!currentMeal) return;
    const nextImageSource = imageSource ?? currentMeal.image_source;
    const nextAttributionName = imageAttribution?.name ?? currentMeal.image_attribution_name;
    const nextAttributionUrl = imageAttribution?.url ?? currentMeal.image_attribution_url;

    if (
      currentMeal.image_url === imageUrl &&
      currentMeal.image_source === nextImageSource &&
      currentMeal.image_attribution_name === nextAttributionName &&
      currentMeal.image_attribution_url === nextAttributionUrl
    ) {
      return;
    }

    const nextPlan = current.plan.map((day, index) =>
      index === dayIndex
        ? {
            ...day,
            [mealType]: {
              ...currentMeal,
              image_url: imageUrl,
              image_source: nextImageSource,
              image_attribution_name: nextAttributionName,
              image_attribution_url: nextAttributionUrl
            }
          }
        : day
    );

    const nextMealPlan: MealPlanData = {
      ...current,
      plan: nextPlan
    };
    const sanitized = sanitizeMealPlanForFirestore(nextMealPlan);

    localMutationVersionRef.current += 1;
    latestMealPlanRef.current = nextMealPlan;
    if (user) {
      mealPlanMemoryCache.set(user.uid, nextMealPlan);
    }
    dispatch({ type: "plan", payload: nextMealPlan });

    if (!user) return;

    const planRef = doc(db, "users", user.uid, "plans", "currentWeekly");
    try {
      await setDoc(
        planRef,
        {
          mealPlan: sanitized,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    } catch (error) {
      if (isFirestoreQuotaError(error)) {
        logger.warn("Skipping meal-plan image persistence after Firestore throttling", { dayIndex, mealType });
        return;
      }
      throw error;
    }
  }, [user]);

  return {
    mealPlan: state.mealPlan,
    loading: user ? state.loading : false,
    error: state.error,
    saveMealPlan,
    updateMealImage
  };
}
