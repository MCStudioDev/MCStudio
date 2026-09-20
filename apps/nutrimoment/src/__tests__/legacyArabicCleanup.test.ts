import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { assertLegacyArabicTarget, cleanupFingerprint, withoutLegacyArabic } from "../../scripts/lib/legacy-arabic-cleanup";

describe("legacy Arabic cleanup boundary", () => {
  it.each(["users/u/history/x", "sharedRecipesArabicV1/x", "sharedRecipesV2/x/nested/y", "recipePhotoCache/x", "sharedRecipesV2/"])("rejects %s", target => {
    expect(() => assertLegacyArabicTarget(target)).toThrow();
  });
  it("removes only the Arabic field and preserves timestamps, other locales and image metadata", () => {
    const source = { localized: { English: { name: "Rice", image_url: "unchanged" }, Arabic: { name: "أرز" }, French: { name: "Riz" } }, updatedAt: new Timestamp(123, 456), image: { id: "photo", tags: ["vegan"] }, receipt: "unchanged" };
    const removed = withoutLegacyArabic(source);
    expect(removed).toEqual({ ...source, localized: { English: source.localized.English, French: source.localized.French } });
    expect(source.localized.Arabic).toEqual({ name: "أرز" });
    expect(cleanupFingerprint(removed)).toBe(cleanupFingerprint(withoutLegacyArabic({ ...source, localized: { ...source.localized, Arabic: { name: "other" } } })));
    expect(cleanupFingerprint(removed)).not.toBe(cleanupFingerprint({ ...removed, updatedAt: new Timestamp(123, 457) }));
    expect(cleanupFingerprint(removed)).not.toBe(cleanupFingerprint({ ...removed, image: { id: "changed" } }));
    expect(() => assertLegacyArabicTarget("sharedRecipesV2/shared-premium-123")).not.toThrow();
  });
  it("is stable across map ordering but distinguishes array ordering", () => {
    expect(cleanupFingerprint({ a: 1, b: [1, 2] })).toBe(cleanupFingerprint({ b: [1, 2], a: 1 }));
    expect(cleanupFingerprint([1, 2])).not.toBe(cleanupFingerprint([2, 1]));
  });
});
