"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from "react";
import { deleteField, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/config/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { DashboardTheme, HealthProfile, Language, UserSettings } from "@/lib/types";
import {
  getStoredOrDetectedPilotLanguage,
  normalizePilotLanguage,
  persistPilotLanguage
} from "@/lib/language";
import { isRtl, t as translate, type TranslationKey } from "@/lib/translations";

const DEFAULT_SETTINGS: UserSettings = {
  calorieTarget: 2000,
  preferredCuisine: "Any",
  maxMissingIngredients: 2,
  recipeCount: 5,
  uiLanguage: "en",
  themeMode: "auroraDark",
  targetWeightKg: null,
  goalTimelineMonths: null
};

const DEFAULT_HEALTH: HealthProfile = {
  diets: [],
  conditions: [],
  allergens: [],
  weightKg: null,
  heightCm: null
};

interface AppContextValue {
  settings: UserSettings;
  saveSettings: (next: Partial<UserSettings>) => Promise<void>;
  health: HealthProfile;
  saveHealth: (next: Partial<HealthProfile>) => Promise<void>;
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  rtl: boolean;
  t: (key: TranslationKey) => string;
  loadingProfile: boolean;
  error: string | null;
  setError: (msg: string | null) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

interface AppProviderProps {
  children: React.ReactNode;
}

interface AppState {
  settings: UserSettings;
  health: HealthProfile;
  loadingProfile: boolean;
}

type AppAction =
  | { type: "profile/loading"; payload: boolean }
  | { type: "settings/merge"; payload: Partial<UserSettings> }
  | { type: "health/set"; payload: HealthProfile };

const INITIAL_STATE: AppState = {
  settings: DEFAULT_SETTINGS,
  health: DEFAULT_HEALTH,
  loadingProfile: true
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "profile/loading":
      return { ...state, loadingProfile: action.payload };
    case "settings/merge":
      return { ...state, settings: { ...state.settings, ...action.payload } };
    case "health/set":
      return { ...state, health: action.payload };
    default:
      return state;
  }
}

function normalizeSettings(
  raw: (Partial<UserSettings> & { recipeLanguage?: unknown }) | undefined,
  fallbackLanguage: Language = "en"
): Partial<UserSettings> {
  const { recipeLanguage: _legacyRecipeLanguage, ...rest } = raw ?? {};
  const uiLanguage = normalizePilotLanguage(raw?.uiLanguage, fallbackLanguage);
  const themeMode = normalizeThemeMode(raw?.themeMode);
  const recipeCount = Number.isFinite(raw?.recipeCount)
    ? Math.min(10, Math.max(1, Number(raw?.recipeCount)))
    : DEFAULT_SETTINGS.recipeCount;
  const targetWeightKg =
    typeof raw?.targetWeightKg === "number" && Number.isFinite(raw.targetWeightKg) && raw.targetWeightKg > 0
      ? Math.round(raw.targetWeightKg * 10) / 10
      : null;
  const goalTimelineMonths =
    typeof raw?.goalTimelineMonths === "number" &&
    Number.isFinite(raw.goalTimelineMonths) &&
    raw.goalTimelineMonths > 0
      ? Math.min(24, Math.max(1, Math.round(raw.goalTimelineMonths)))
      : null;

  return {
    ...rest,
    recipeCount,
    themeMode,
    targetWeightKg,
    goalTimelineMonths,
    uiLanguage
  };
}

function normalizeThemeMode(value: unknown): DashboardTheme {
  return value === "mintWhite" ? "mintWhite" : "auroraDark";
}

function normalizeMetric(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.min(max, Math.round(value * 10) / 10);
}

function normalizeHealth(raw: Partial<HealthProfile> | undefined): HealthProfile {
  return {
    diets: Array.isArray(raw?.diets) ? raw.diets : [],
    conditions: Array.isArray(raw?.conditions) ? raw.conditions : [],
    allergens: Array.isArray(raw?.allergens) ? raw.allergens : [],
    weightKg: normalizeMetric(raw?.weightKg, 400),
    heightCm: normalizeMetric(raw?.heightCm, 260)
  };
}

export function AppProvider({ children }: AppProviderProps) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(appReducer, INITIAL_STATE);
  const [error, setError] = useState<string | null>(null);

  const loadProfileForUser = useCallback(async () => {
    if (!user) {
      dispatch({ type: "profile/loading", payload: false });
      return;
    }

    dispatch({ type: "profile/loading", payload: true });

    try {
      const [settingsSnap, healthSnap] = await Promise.all([
        getDoc(doc(db, "users", user.uid, "profile", "settings")),
        getDoc(doc(db, "users", user.uid, "profile", "health"))
      ]);
      const fallbackLanguage = getStoredOrDetectedPilotLanguage();

      if (settingsSnap.exists()) {
        const data = normalizeSettings(settingsSnap.data() as Partial<UserSettings> & { recipeLanguage?: unknown }, fallbackLanguage);
        dispatch({ type: "settings/merge", payload: data });
        persistPilotLanguage(data.uiLanguage ?? fallbackLanguage);
      } else {
        dispatch({
          type: "settings/merge",
          payload: {
            uiLanguage: fallbackLanguage
          }
        });
        persistPilotLanguage(fallbackLanguage);
      }

      if (healthSnap.exists()) {
        dispatch({ type: "health/set", payload: normalizeHealth(healthSnap.data() as Partial<HealthProfile>) });
      } else {
        dispatch({ type: "health/set", payload: DEFAULT_HEALTH });
      }
    } finally {
      dispatch({ type: "profile/loading", payload: false });
    }
  }, [user]);

  useEffect(() => {
    const preferredLanguage = getStoredOrDetectedPilotLanguage();
    dispatch({
      type: "settings/merge",
      payload: {
        uiLanguage: preferredLanguage
      }
    });
    persistPilotLanguage(preferredLanguage);
  }, []);

  useEffect(() => {
    if (!user) {
      dispatch({ type: "profile/loading", payload: false });
      return;
    }
    void loadProfileForUser();
  }, [loadProfileForUser, user]);

  const settings = state.settings;
  const health = user ? state.health : DEFAULT_HEALTH;

  const saveSettings = useCallback(
    async (next: Partial<UserSettings>) => {
      const merged = normalizeSettings({ ...settings, ...next }, settings.uiLanguage);
      dispatch({ type: "settings/merge", payload: merged });
      persistPilotLanguage(merged.uiLanguage ?? settings.uiLanguage);
      if (!user) return;
      try {
        const ref = doc(db, "users", user.uid, "profile", "settings");
        await setDoc(ref, { ...merged, recipeLanguage: deleteField() }, { merge: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save settings";
        setError(message);
      }
    },
    [settings, user]
  );

  const saveHealth = useCallback(
    async (next: Partial<HealthProfile>) => {
      const merged = normalizeHealth({
        diets: next.diets ?? health.diets,
        conditions: next.conditions ?? health.conditions,
        allergens: next.allergens ?? health.allergens ?? [],
        weightKg: next.weightKg ?? health.weightKg ?? null,
        heightCm: next.heightCm ?? health.heightCm ?? null
      });
      dispatch({ type: "health/set", payload: merged });
      if (!user) return;
      try {
        const ref = doc(db, "users", user.uid, "profile", "health");
        await setDoc(ref, merged, { merge: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save health profile";
        setError(message);
      }
    },
    [health, user]
  );

  const setLanguage = useCallback(
    async (lang: Language) => {
      await saveSettings({ uiLanguage: normalizePilotLanguage(lang) });
    },
    [saveSettings]
  );

  const t = useCallback(
    (key: TranslationKey) => {
      return translate(settings.uiLanguage, key);
    },
    [settings.uiLanguage]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      settings,
      saveSettings,
      health,
      saveHealth,
      language: settings.uiLanguage,
      setLanguage,
      rtl: isRtl(settings.uiLanguage),
      t,
      loadingProfile: user ? state.loadingProfile : false,
      error,
      setError
    }),
    [settings, saveSettings, health, saveHealth, setLanguage, t, state.loadingProfile, error, user]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return ctx;
}
