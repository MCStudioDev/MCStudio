"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/config/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { HealthProfile, Language, UserSettings } from "@/lib/types";
import { isRtl, t as translate, type TranslationKey } from "@/lib/translations";

const DEFAULT_SETTINGS: UserSettings = {
  calorieTarget: 2000,
  preferredCuisine: "Any",
  maxMissingIngredients: 2,
  voiceLanguage: "English",
  recipeLanguage: "English",
  uiLanguage: "en"
};

const DEFAULT_HEALTH: HealthProfile = {
  diets: [],
  conditions: [],
  allergens: []
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

export function AppProvider({ children }: AppProviderProps) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(appReducer, INITIAL_STATE);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      dispatch({ type: "profile/loading", payload: false });
      return;
    }
    dispatch({ type: "profile/loading", payload: true });
    const settingsRef = doc(db, "users", user.uid, "profile", "settings");
    const healthRef = doc(db, "users", user.uid, "profile", "health");

    const unsubSettings = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Partial<UserSettings>;
        dispatch({ type: "settings/merge", payload: data });
      }
      dispatch({ type: "profile/loading", payload: false });
    });

    const unsubHealth = onSnapshot(healthRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Partial<HealthProfile>;
        dispatch({
          type: "health/set",
          payload: {
            diets: Array.isArray(data.diets) ? data.diets : [],
            conditions: Array.isArray(data.conditions) ? data.conditions : [],
            allergens: Array.isArray(data.allergens) ? data.allergens : []
          }
        });
      }
    });

    return () => {
      unsubSettings();
      unsubHealth();
    };
  }, [user]);

  const settings = user ? state.settings : DEFAULT_SETTINGS;
  const health = user ? state.health : DEFAULT_HEALTH;

  const saveSettings = useCallback(
    async (next: Partial<UserSettings>) => {
      const merged = { ...settings, ...next };
      dispatch({ type: "settings/merge", payload: next });
      if (!user) return;
      try {
        const ref = doc(db, "users", user.uid, "profile", "settings");
        await setDoc(ref, merged, { merge: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save settings";
        setError(message);
      }
    },
    [settings, user]
  );

  const saveHealth = useCallback(
    async (next: Partial<HealthProfile>) => {
      const merged: HealthProfile = {
        diets: next.diets ?? health.diets,
        conditions: next.conditions ?? health.conditions,
        allergens: next.allergens ?? health.allergens ?? []
      };
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
      await saveSettings({ uiLanguage: lang });
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
