import { describe, expect, it } from "vitest";
import {
  getMealPlanPhotoCacheSignatures,
  getMealPlanPhotoIdentityKey,
  isMealPlanImageIdentityCompatible,
  isMealPlanRestorableImageUrl
} from "../lib/mealPlanImageMatching";

const generated = (slug: string) =>
  `https://firebasestorage.googleapis.com/v0/b/test/o/recipe-photo-cache%2Fgenerated%3Astrict-v7%3A${slug}.jpg?alt=media`;

describe("meal plan image matching", () => {
  const meal = {
    name: "Arroz con Pollo",
    photo_identity: {
      dish_slug: "arroz-con-pollo",
      english_name: "Arroz con Pollo"
    }
  };

  it("accepts a durable generated photo linked to the exact meal identity", () => {
    expect(isMealPlanImageIdentityCompatible(meal, generated("arroz-con-pollo"))).toBe(true);
    expect(getMealPlanPhotoIdentityKey(meal)).toBe("arroz-con-pollo");
  });

  it("rejects a generated photo cached for a different dish", () => {
    expect(isMealPlanImageIdentityCompatible(meal, generated("garlic-chicken-rice-bowl"))).toBe(false);
  });

  it("keeps durable provider photos eligible when their URL has no cache identity", () => {
    expect(isMealPlanImageIdentityCompatible(meal, "https://images.unsplash.com/photo-123?fit=crop")).toBe(true);
  });

  it("restores a generated image stored in the V2 recipe-owned folder", () => {
    const imageUrl = "https://firebasestorage.googleapis.com/v0/b/test/o/shared-recipes-v2%2Fshared-premium-abc123%2Fphoto.jpg?alt=media";

    expect(isMealPlanRestorableImageUrl(imageUrl)).toBe(true);
    expect(isMealPlanImageIdentityCompatible(meal, imageUrl)).toBe(true);
  });

  it("does not treat an arbitrary provider URL as a restorable shared image", () => {
    expect(isMealPlanRestorableImageUrl("https://images.unsplash.com/photo-123?fit=crop")).toBe(false);
  });

  it("maps a Koshary meal directly to its shared generated-photo cache signature", () => {
    expect(getMealPlanPhotoCacheSignatures({
      name: "Koshary",
      photo_identity: {
        cuisine_key: "Egyptian",
        dish_slug: "koshary",
        english_name: "Koshary"
      }
    })).toEqual([
      "generated:strict-v7:koshary",
      "generated:strict-v7:koshary|egyptian"
    ]);
  });
});
