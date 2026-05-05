"use client";

import { useCallback, useEffect, useReducer } from "react";
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

  const loadMealPlan = useCallback(async () => {
    if (!user) {
      dispatch({ type: "plan", payload: null });
      dispatch({ type: "loading", payload: false });
      return;
    }

    dispatch({ type: "loading", payload: true });
    const planRef = doc(db, "users", user.uid, "plans", "currentWeekly");

    try {
      const snapshot = await getDoc(planRef);
      if (!snapshot.exists()) {
        dispatch({ type: "plan", payload: null });
      } else {
        const data = snapshot.data() as { mealPlan?: unknown };
        dispatch({ type: "plan", payload: normalizeMealPlanData(data.mealPlan) });
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
    const normalized = normalizeMealPlanData(mealPlan);
    if (!normalized) {
      throw new Error("Meal plan is missing required days");
    }

    dispatch({ type: "plan", payload: normalized });

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
    const current = state.mealPlan;
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
  }, [state.mealPlan, user]);

  return {
    mealPlan: state.mealPlan,
    loading: user ? state.loading : false,
    error: state.error,
    saveMealPlan,
    updateMealImage
  };
}
