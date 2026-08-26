import { describe, expect, it } from "vitest";
import {
  createDefaultUserHealthProfile,
  createDefaultUserSettings,
  DEFAULT_USER_SETTINGS
} from "../lib/userDefaults";

describe("new user defaults", () => {
  it("starts onboarded users with the requested recipe settings", () => {
    expect(createDefaultUserSettings()).toMatchObject({
      preferredCuisine: "Any",
      calorieTarget: 1650,
      maxMissingIngredients: 5,
      recipeCount: 10
    });
  });

  it("starts without diet or health restrictions", () => {
    expect(createDefaultUserHealthProfile()).toMatchObject({
      diets: [],
      conditions: [],
      allergens: []
    });
  });

  it("returns independent health arrays and keeps the default recipe count at ten", () => {
    const first = createDefaultUserHealthProfile();
    const second = createDefaultUserHealthProfile();
    first.diets.push("vegan");

    expect(second.diets).toEqual([]);
    expect(DEFAULT_USER_SETTINGS.recipeCount).toBe(10);
  });
});
