import { describe, expect, it, vi } from "vitest";
import { assertArabicWritePath, arabicPaths } from "@/services/arabic/repository";
import { normalizeArabicInputs } from "@/services/arabic/ingredients";
import { arabicEnabled } from "@/services/arabic/config";
import { POST as generate } from "@/app/api/ar/generate-recipes/route";
import { POST as mealplan } from "@/app/api/ar/mealplan/route";

describe("Arabic workflow isolation", () => {
  it("recognizes vegetable broth without guessing unknown Arabic ingredients", async () => {
    for (const text of ["vegetable broth", "vegetable stock", "مرق خضار", "مرق الخضار"]) {
      expect(await normalizeArabicInputs([text])).toMatchObject({ canonical: ["vegetable broth"], unclear: [] });
    }
    expect((await normalizeArabicInputs(["زقربوط"])).unclear).toHaveLength(1);
  });
  it.each(["sharedRecipesV2/x", "users/u/offlineRecipeCache/x", "users/u/history/x", "users/u/plans/currentWeekly", "recipePhotoCache/x"])("rejects English write destination %s", path => {
    expect(() => assertArabicWritePath(path)).toThrow();
  });
  it("allows only explicit Arabic content destinations", () => {
    for (const path of [arabicPaths.shared("r"), arabicPaths.userCache("u", "r"), arabicPaths.history("u", "h"), arabicPaths.plan("u")]) {
      expect(() => assertArabicWritePath(path)).not.toThrow();
    }
    expect(() => arabicPaths.history("u", "../history/x")).toThrow();
  });
  it("is disabled by default", () => {
    vi.stubEnv("ARABIC_GENERATION_ENABLED", "");
    expect(arabicEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });
  it.each([generate, mealplan])("disabled endpoints never enter generation", async handler => {
    vi.stubEnv("ARABIC_GENERATION_ENABLED", "false");
    const result = await handler(new Request("http://localhost/api/ar/test", { method: "POST", body: "{}" }));
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({ code: "ARABIC_GENERATION_DISABLED" });
    vi.unstubAllEnvs();
  });
  it("normalizes mixed-language lists, Arabic commas and digits", async () => {
    const result = await normalizeArabicInputs(["rice، ٢٠٠ غرام تونة\ncucumber"]);
    expect(result.unclear).toEqual([]);
    expect(result.canonical).toEqual(expect.arrayContaining(["rice", "tuna", "cucumber"]));
    expect(result.original).toContain("٢٠٠ غرام تونة");
  });
  it("requests correction instead of guessing an unknown protein", async () => {
    const result = await normalizeArabicInputs(["rice", "شاورما", "xyzfoodxyz"]);
    expect(result.unclear.map(item => item.index)).toEqual([1, 2]);
  });
  it("preserves fava-bean identity in Arabic and mixed ingredient input", async () => {
    for (const ingredient of ["فول", "٢٠٠ غرام فول", "fava beans", "broad beans"]) {
      expect(await normalizeArabicInputs([ingredient])).toMatchObject({ canonical: ["fava beans"], unclear: [] });
    }
    expect((await normalizeArabicInputs(["رز، طماطم، فول"])).canonical).toEqual(["rice", "tomato", "fava beans"]);
  });
});
