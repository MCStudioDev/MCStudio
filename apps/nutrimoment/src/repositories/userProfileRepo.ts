import { doc, getDoc } from "firebase/firestore";
import { db } from "@/config/firebase";
import type { UserPreferenceSnapshot } from "@/lib/domain";

const DEFAULT_SNAPSHOT: UserPreferenceSnapshot = {
  preferredCuisine: "Any",
  calorieTarget: 2000,
  diets: [],
  conditions: [],
  allergens: []
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
      preferredCuisine: typeof settings.preferredCuisine === "string" ? settings.preferredCuisine : "Any",
      calorieTarget: typeof settings.calorieTarget === "number" ? settings.calorieTarget : 2000,
      diets: Array.isArray(health.diets) ? health.diets : [],
      conditions: Array.isArray(health.conditions) ? health.conditions : [],
      allergens: Array.isArray(health.allergens) ? health.allergens : []
    };
  } catch {
    return DEFAULT_SNAPSHOT;
  }
}
