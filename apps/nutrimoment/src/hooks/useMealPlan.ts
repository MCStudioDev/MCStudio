"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/config/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { logger } from "@/lib/logger";
import { normalizeMealPlanData, sanitizeMealPlanForFirestore } from "@/lib/mealPlan";
import { isDurableRecipeImageUrl } from "@/lib/recipeImageDurability";
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

const MEAL_PLAN_SYNC_TIMEOUT_MS = 10_000;
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
    /resource-exhausted|quota exceeded|too many requests|unavailable|network-request-failed|load failed|failed to fetch|offline|timed?\s*out|timeout/i.test(
      error.message
    )
  );
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

function isRenderableImage(imageUrl?: string) {
  return isDurableRecipeImageUrl(imageUrl);
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

export function useMealPlan(expectedPreferenceSignature?: string) {
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

    const cachedMealPlan = filterMealPlanByPreferenceSignature(
      mealPlanMemoryCache.get(user.uid) ?? null,
      expectedPreferenceSignature
    );
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
      const snapshot = await withClientTimeout(getDoc(planRef), MEAL_PLAN_SYNC_TIMEOUT_MS, "Meal plan sync read");
      if (localMutationVersionRef.current !== loadStartedAtMutationVersion) {
        return;
      }
      if (!snapshot.exists()) {
        latestMealPlanRef.current = null;
        mealPlanMemoryCache.delete(user.uid);
        dispatch({ type: "plan", payload: null });
      } else {
        const data = snapshot.data() as { mealPlan?: unknown; preferenceSignature?: unknown };
        const normalizedPlan = normalizeMealPlanData(data.mealPlan);
        const storedPreferenceSignature =
          typeof data.preferenceSignature === "string"
            ? data.preferenceSignature
            : normalizedPlan?.preferenceSignature;
        const normalized = filterMealPlanByPreferenceSignature(
          normalizedPlan && storedPreferenceSignature
            ? { ...normalizedPlan, preferenceSignature: storedPreferenceSignature }
            : normalizedPlan,
          expectedPreferenceSignature
        );
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
  }, [expectedPreferenceSignature, user]);

  useEffect(() => {
    void loadMealPlan();
  }, [loadMealPlan]);

  const saveMealPlan = async (mealPlan: MealPlanData) => {
    const normalizedPlan = normalizeMealPlanData(mealPlan);
    const normalized = normalizedPlan;
    if (!normalized) {
      throw new Error("Meal plan is missing required days");
    }

    const normalizedWithSignature = expectedPreferenceSignature
      ? { ...normalized, preferenceSignature: expectedPreferenceSignature }
      : normalized;

    localMutationVersionRef.current += 1;
    dispatch({ type: "plan", payload: normalizedWithSignature });
    latestMealPlanRef.current = normalizedWithSignature;
    if (user) {
      mealPlanMemoryCache.set(user.uid, normalizedWithSignature);
    }

    if (!user) {
      return;
    }

    const planRef = doc(db, "users", user.uid, "plans", "currentWeekly");
    try {
      const sanitized = sanitizeMealPlanForFirestore(normalizedWithSignature);
      await withClientTimeout(
        setDoc(
          planRef,
          {
            mealPlan: sanitized,
            ...(expectedPreferenceSignature ? { preferenceSignature: expectedPreferenceSignature } : {}),
            updatedAt: serverTimestamp()
          },
          { merge: true }
        ),
        MEAL_PLAN_SYNC_TIMEOUT_MS,
        "Meal plan sync write"
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
    const nextImageUrl = isRenderableImage(imageUrl) ? imageUrl : undefined;
    const nextImageSource = nextImageUrl ? imageSource ?? currentMeal.image_source : undefined;
    const nextAttributionName = nextImageUrl ? imageAttribution?.name ?? currentMeal.image_attribution_name : undefined;
    const nextAttributionUrl = nextImageUrl ? imageAttribution?.url ?? currentMeal.image_attribution_url : undefined;

    if (
      currentMeal.image_url === nextImageUrl &&
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
              image_url: nextImageUrl,
              image_source: nextImageSource,
              image_attribution_name: nextAttributionName,
              image_attribution_url: nextAttributionUrl
            }
          }
        : day
    );

    const nextMealPlan: MealPlanData = {
      ...current,
      plan: nextPlan,
      ...(expectedPreferenceSignature ? { preferenceSignature: expectedPreferenceSignature } : {})
    };
    const nextMealPlanWithSignature = expectedPreferenceSignature
      ? { ...nextMealPlan, preferenceSignature: expectedPreferenceSignature }
      : nextMealPlan;
    const sanitized = sanitizeMealPlanForFirestore(nextMealPlanWithSignature);

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
            ...(expectedPreferenceSignature ? { preferenceSignature: expectedPreferenceSignature } : {}),
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
  }, [expectedPreferenceSignature, user]);

  return {
    mealPlan: state.mealPlan,
    loading: user ? state.loading : false,
    error: state.error,
    reloadMealPlan: loadMealPlan,
    saveMealPlan,
    updateMealImage
  };
}

function filterMealPlanByPreferenceSignature(
  mealPlan: MealPlanData | null,
  expectedPreferenceSignature?: string
) {
  if (!mealPlan || !expectedPreferenceSignature) return mealPlan;
  return mealPlan.preferenceSignature === expectedPreferenceSignature ? mealPlan : null;
}
