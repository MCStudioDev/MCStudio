import { describe, expect, it } from "vitest";
import {
  getRecipeDiversitySelectionScore,
  selectSharedRecipeReadStrategy,
  shouldReadRemoteRecipeCaches
} from "../services/recipeSearchService";
import type { RankedRecipeResult, RecipeCatalogDoc } from "../lib/domain";

describe("recipe search source policy", () => {
  it("uses a warm shared snapshot without another Firestore read", () => {
    expect(selectSharedRecipeReadStrategy({
      targetedRecipeCount: 0,
      warmRecipeCount: 20
    })).toBe("warm");
  });

  it("uses bounded ingredient results when no warm snapshot exists", () => {
    expect(selectSharedRecipeReadStrategy({
      targetedRecipeCount: 8,
      warmRecipeCount: 0
    })).toBe("targeted");
  });

  it("falls through to local sources instead of reading the full shared collection", () => {
    expect(selectSharedRecipeReadStrategy({
      targetedRecipeCount: 0,
      warmRecipeCount: 0
    })).toBe("local_only");
  });

  it("does not block a request on remote caches when local sources can fill it", () => {
    expect(shouldReadRemoteRecipeCaches({
      allowRemoteCaches: false,
      localSourceCount: 2000,
      requestedRecipeCount: 10
    })).toBe(false);
  });

  it("preserves trusted cuisine-source authority inside diversity selection", () => {
    const result = { score: 4 } as RankedRecipeResult;
    const trusted = {
      id: "trusted-source-middle-eastern-lebanese-kafta",
      cuisine: "Middle Eastern"
    } as RecipeCatalogDoc;
    const imported = {
      id: "src-generic-kofta-burger",
      cuisine: "Middle Eastern"
    } as RecipeCatalogDoc;

    expect(getRecipeDiversitySelectionScore(result, trusted, "Middle Eastern"))
      .toBeGreaterThan(getRecipeDiversitySelectionScore({ score: 100 } as RankedRecipeResult, imported, "Middle Eastern"));
    expect(getRecipeDiversitySelectionScore(result, trusted, "Any")).toBe(4);
  });

  it("keeps a named cuisine dish ahead of a generic higher-overlap title", () => {
    const namedDish = {
      id: "src-chicken-piccata",
      title: "Chicken Piccata",
      slug: "chicken-piccata",
      cuisine: "Italian",
      image: { sourceQuery: "chicken piccata" }
    } as RecipeCatalogDoc;
    const genericDish = {
      id: "src-italian-chicken",
      title: "Italian Chicken",
      slug: "italian-chicken",
      cuisine: "Italian",
      image: { sourceQuery: "italian chicken" }
    } as RecipeCatalogDoc;

    expect(getRecipeDiversitySelectionScore({ score: 1 } as RankedRecipeResult, namedDish, "Italian"))
      .toBeGreaterThan(getRecipeDiversitySelectionScore({ score: 100 } as RankedRecipeResult, genericDish, "Italian"));
  });
});
