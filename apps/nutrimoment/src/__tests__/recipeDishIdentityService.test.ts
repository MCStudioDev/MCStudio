import { describe, expect, it } from "vitest";
import type { Recipe } from "../lib/types";
import {
  preserveSourceDishIdentityName,
  recipeTitlePreservesSourceDishIdentity
} from "../services/recipeDishIdentityService";

function sourceRecipe(name: string): Recipe {
  return {
    name,
    dish_identity: name,
    cuisine: "Italian",
    ingredients: ["chicken"],
    missing_ingredients: [],
    steps: ["Cook according to the authenticated source instructions."],
    calories: 500,
    protein: "40g",
    carbs: "30g",
    fat: "20g",
    cook_time: "30 mins",
    difficulty: "Medium"
  };
}

describe("recipeDishIdentityService", () => {
  it("replaces a generic Arabic rename with the approved Parmesan identity", () => {
    const source = sourceRecipe("Chicken Parmigiana");

    expect(preserveSourceDishIdentityName(source, "\u062f\u062c\u0627\u062c \u062c\u0628\u0646\u0629", "ar")).toBe(
      "\u062f\u062c\u0627\u062c \u0628\u0635\u0644\u0635\u0629 \u0627\u0644\u0637\u0645\u0627\u0637\u0645 \u0648\u0627\u0644\u0628\u0627\u0631\u0645\u064a\u0632\u0627\u0646"
    );
    expect(recipeTitlePreservesSourceDishIdentity(source, "\u062f\u062c\u0627\u062c \u062c\u0628\u0646\u0629", "ar")).toBe(false);
  });

  it("uses the approved Arabic title for a known source identity", () => {
    const source = sourceRecipe("Chicken Cacciatore");
    const edited = "\u062f\u062c\u0627\u062c \u0643\u0627\u062a\u0634\u0627\u062a\u0648\u0631\u064a \u0627\u0644\u0625\u064a\u0637\u0627\u0644\u064a";
    const approved = "\u062f\u062c\u0627\u062c \u0643\u0627\u062a\u0634\u0627\u062a\u0648\u0631\u064a \u0628\u0635\u0648\u0635 \u0627\u0644\u0637\u0645\u0627\u0637\u0645";

    expect(preserveSourceDishIdentityName(source, edited, "Arabic")).toBe(approved);
    expect(recipeTitlePreservesSourceDishIdentity(source, edited, "Arabic")).toBe(false);
  });

  it("rejects transliteration when an approved meaning-based title exists", () => {
    const source = sourceRecipe("Herbed Chicken Marsala");

    expect(preserveSourceDishIdentityName(source, "\u062f\u062c\u0627\u062c \u0645\u0627\u0631\u0633\u0627\u0644\u0627 \u0628\u0627\u0644\u0623\u0639\u0634\u0627\u0628", "ar")).toBe(
      "\u062f\u062c\u0627\u062c \u0628\u0627\u0644\u0641\u0637\u0631 \u0648\u0627\u0644\u0623\u0639\u0634\u0627\u0628 \u0639\u0644\u0649 \u0627\u0644\u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u0625\u064a\u0637\u0627\u0644\u064a\u0629"
    );
  });

  it("preserves an English edit only when it retains the source identity", () => {
    const source = sourceRecipe("Chicken Piccata");

    expect(preserveSourceDishIdentityName(source, "Easy Chicken Piccata", "en")).toBe("Easy Chicken Piccata");
    expect(preserveSourceDishIdentityName(source, "Lemon Chicken", "en")).toBe("Chicken Piccata");
  });
});
