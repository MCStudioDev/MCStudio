import { describe, expect, it } from "vitest";
import { buildIngredientLookupCanonicals } from "@/lib/ingredientFamilies";

describe("shared ingredient lookup policy", () => {
  it("indexes a specific ground protein under its preparation, protein, and broad family", () => {
    expect(buildIngredientLookupCanonicals(["ground beef"])).toEqual(expect.arrayContaining([
      "ground beef",
      "ground meat",
      "beef",
      "meat"
    ]));
  });

  it("uses the same hierarchy for plural and minced protein wording", () => {
    expect(buildIngredientLookupCanonicals(["minced lamb", "beef cubes"])).toEqual(expect.arrayContaining([
      "minced lamb",
      "ground meat",
      "lamb",
      "beef",
      "meat"
    ]));
  });

  it("does not broaden seafood into the meat family", () => {
    expect(buildIngredientLookupCanonicals(["shrimp", "salmon"])).not.toContain("meat");
  });

  it("does not interpret ground spices as ground meat", () => {
    const lookup = buildIngredientLookupCanonicals(["ground cumin", "ground coriander"]);

    expect(lookup).not.toContain("ground meat");
    expect(lookup).not.toContain("meat");
  });
});
