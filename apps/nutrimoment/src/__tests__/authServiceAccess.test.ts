import { describe, expect, it } from "vitest";
import {
  FREE_LIFETIME_AI_CREDITS,
  FREE_LIFETIME_WEEKLY_PLANS,
  hasAiFeatureAccess,
  hasGeneratedRecipeImageAccess,
  resolveEffectiveAccessTier,
  type RequestAccess
} from "../services/authService";

describe("auth service access tiers", () => {
  it("keeps explicit free entitlements free even when status is active", () => {
    expect(resolveEffectiveAccessTier({ tier: "free", status: "active" }, undefined)).toBe("free");
    expect(resolveEffectiveAccessTier({ tier: "free", status: "trialing" }, undefined)).toBe("free");
    expect(resolveEffectiveAccessTier({ tier: "free", status: "free" }, "premium")).toBe("free");
  });

  it("treats premium and active legacy entitlements as premium when not expired", () => {
    expect(resolveEffectiveAccessTier({ tier: "premium", status: "active" }, undefined)).toBe("premium");
    expect(resolveEffectiveAccessTier({ status: "trialing" }, undefined)).toBe("premium");
    expect(resolveEffectiveAccessTier({ status: "active" }, undefined)).toBe("premium");
  });

  it("expires premium entitlements before granting premium features", () => {
    expect(resolveEffectiveAccessTier({ tier: "premium", status: "active", expiresAt: "2020-01-01T00:00:00.000Z" }, undefined)).toBe("free");
    expect(resolveEffectiveAccessTier({ tier: "premium", status: "canceled" }, undefined)).toBe("free");
  });

  it("separates public photo lookup from premium generated images", () => {
    const freeAccess = buildAccess({ tier: "free", isPremium: false });
    const premiumAccess = buildAccess({ tier: "premium", isPremium: true });

    expect(hasAiFeatureAccess(freeAccess, "recipe_image")).toBe(true);
    expect(hasGeneratedRecipeImageAccess(freeAccess)).toBe(false);
    expect(hasAiFeatureAccess(premiumAccess, "recipe_image")).toBe(true);
    expect(hasGeneratedRecipeImageAccess(premiumAccess)).toBe(true);
  });
});

function buildAccess(overrides: Partial<RequestAccess>): RequestAccess {
  return {
    uid: "test-user",
    email: "test@example.com",
    role: "user",
    tier: "free",
    isAdmin: false,
    isPremium: false,
    features: {},
    aiCreditsUsed: 0,
    aiCreditsLimit: FREE_LIFETIME_AI_CREDITS,
    aiCreditsRemaining: FREE_LIFETIME_AI_CREDITS,
    weeklyPlanUsed: 0,
    weeklyPlanLimit: FREE_LIFETIME_WEEKLY_PLANS,
    weeklyPlanRemaining: FREE_LIFETIME_WEEKLY_PLANS,
    ...overrides
  };
}
