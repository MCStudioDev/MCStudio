import { consume, getFeatureLimit } from "@/services/rateLimitService";

export function applyArabicRateLimit(input: { uid: string; feature: "recipe_generation" | "meal_plan" | "recipe_photo"; isPremium: boolean; bypass?: boolean }) {
  const config = getFeatureLimit(input.feature, input.isPremium);
  const decision = input.bypass ? { allowed: true, remaining: config.capacity, resetAt: Date.now() + config.windowMs }
    : consume(`arabic:${input.feature}:${input.uid}`, config);
  return { config, decision };
}
