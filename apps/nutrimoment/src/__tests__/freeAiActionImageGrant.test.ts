import { describe, expect, it } from "vitest";
import { canUseFreeAiActionImageGrant } from "@/services/authService";

describe("free AI action image grants", () => {
  const now = Date.now();

  it("keeps an already-authorized meal retryable after the plan image limit is reached", () => {
    expect(canUseFreeAiActionImageGrant({
      expiresAt: now + 60_000,
      feature: "weekly_plan",
      imageKeys: ["menemen-signature"],
      imageLimit: 21,
      imagesUsed: 21
    }, now, "menemen-signature")).toBe(true);
  });

  it("does not authorize a new meal after the plan image limit is reached", () => {
    expect(canUseFreeAiActionImageGrant({
      expiresAt: now + 60_000,
      feature: "weekly_plan",
      imageKeys: ["menemen-signature"],
      imageLimit: 21,
      imagesUsed: 21
    }, now, "lentil-soup-signature")).toBe(false);
  });

  it("rejects expired grants even for a previously-authorized meal", () => {
    expect(canUseFreeAiActionImageGrant({
      expiresAt: now - 1,
      feature: "weekly_plan",
      imageKeys: ["menemen-signature"],
      imageLimit: 21,
      imagesUsed: 21
    }, now, "menemen-signature")).toBe(false);
  });
});
