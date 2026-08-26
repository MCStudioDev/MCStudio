import { doc, getDoc } from "firebase/firestore";
import { db } from "@/config/firebase";
import type { UserPreferenceSnapshot } from "@/lib/domain";
import { DEFAULT_USER_HEALTH_PROFILE, DEFAULT_USER_SETTINGS } from "@/lib/userDefaults";

const DEFAULT_SNAPSHOT: UserPreferenceSnapshot = {
  preferredCuisine: DEFAULT_USER_SETTINGS.preferredCuisine,
  calorieTarget: DEFAULT_USER_SETTINGS.calorieTarget,
  diets: [...DEFAULT_USER_HEALTH_PROFILE.diets],
  conditions: [...DEFAULT_USER_HEALTH_PROFILE.conditions],
  allergens: [...(DEFAULT_USER_HEALTH_PROFILE.allergens ?? [])]
};

export async function getUserPreferenceSnapshot(uid: string | null): Promise<UserPreferenceSnapshot> {
  if (!uid) return DEFAULT_SNAPSHOT;

  try {
    const [settingsSnap, healthSnap] = await Promise.all([
      getDoc(doc(db, "users", uid, "profile", "settings")),
      getDoc(doc(db, "users", uid, "profile", "health"))
    ]);

    const settings = settingsSnap.exists() ? settingsSnap.data() : {};
    const health = healthSnap.exists() ? healthSnap.data() : {};

    return {
      preferredCuisine: typeof settings.preferredCuisine === "string"
        ? settings.preferredCuisine
        : DEFAULT_USER_SETTINGS.preferredCuisine,
      calorieTarget: typeof settings.calorieTarget === "number"
        ? settings.calorieTarget
        : DEFAULT_USER_SETTINGS.calorieTarget,
      diets: Array.isArray(health.diets) ? health.diets : [],
      conditions: Array.isArray(health.conditions) ? health.conditions : [],
      allergens: Array.isArray(health.allergens) ? health.allergens : []
    };
  } catch {
    return DEFAULT_SNAPSHOT;
  }
}
