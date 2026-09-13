import { describe, expect, it } from "vitest";
import { applyArabicRateLimit } from "@/services/arabic/rateLimit";
import { applyRateLimit } from "@/services/rateLimitService";
describe("Arabic request bucket isolation", () => {
  it.each(["recipe_generation", "meal_plan", "recipe_photo"] as const)("does not exhaust English %s requests", feature => {
    const input = { uid: `arabic-isolation-${feature}`, feature, isPremium: false };
    const capacity = applyArabicRateLimit(input).config.capacity;
    for (let index = 1; index < capacity; index++) expect(applyArabicRateLimit(input).decision.allowed).toBe(true);
    expect(applyArabicRateLimit(input).decision.allowed).toBe(false);
    expect(applyRateLimit(input).decision.allowed).toBe(true);
  });
});
