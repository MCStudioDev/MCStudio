import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => {
  const documents = new Map<string, Record<string, unknown>>();
  const snapshot = (path: string) => ({
    exists: documents.has(path),
    data: () => documents.get(path)
  });
  const db = {
    doc: (path: string) => ({ path }),
    runTransaction: async <T>(callback: (transaction: {
      get: (reference: { path: string }) => Promise<ReturnType<typeof snapshot>>;
      set: (
        reference: { path: string },
        data: Record<string, unknown>,
        options?: { merge?: boolean }
      ) => void;
    }) => Promise<T>) => callback({
      get: async (reference) => snapshot(reference.path),
      set: (reference, data, options) => {
        const current = options?.merge ? documents.get(reference.path) ?? {} : {};
        documents.set(reference.path, { ...current, ...data });
      }
    })
  };
  return { db, documents };
});

vi.mock("@/lib/firebaseAdmin", () => ({
  getAdminAuth: vi.fn(),
  getAdminDb: vi.fn(() => firestore.db)
}));

import {
  completeFreeAiAction,
  FREE_LIFETIME_AI_CREDITS,
  releaseFreeAiAction,
  reserveFreeAiAction,
  type RequestAccess
} from "@/services/authService";

describe("free AI action accounting", () => {
  beforeEach(() => {
    firestore.documents.clear();
  });

  it("reserves capacity without incrementing the used-credit count", async () => {
    const result = await reserveFreeAiAction(buildAccess(), "recipe_generation", "recipe-click-1");
    const usage = usageDocument();
    const grant = grantDocument("recipe-click-1");

    expect(result.access.aiCreditsUsed).toBe(0);
    expect(usage.lifetimeUsed).toBeUndefined();
    expect(usage.pendingActions).toEqual([
      expect.objectContaining({ actionId: "recipe-click-1" })
    ]);
    expect(grant.status).toBe("pending");
  });

  it("charges exactly once after successful completion", async () => {
    const access = buildAccess();
    const reservation = await reserveFreeAiAction(access, "recipe_generation", "recipe-click-1");
    const completed = await completeFreeAiAction(access, reservation.actionId);
    const completedAgain = await completeFreeAiAction(completed, reservation.actionId);

    expect(completed.aiCreditsUsed).toBe(1);
    expect(completed.aiCreditsRemaining).toBe(9);
    expect(completedAgain.aiCreditsUsed).toBe(1);
    expect(usageDocument().lifetimeUsed).toBe(1);
    expect(usageDocument().pendingActions).toEqual([]);
    expect(grantDocument("recipe-click-1").status).toBe("completed");
  });

  it("releases a failed action without consuming a credit", async () => {
    const access = buildAccess();
    const reservation = await reserveFreeAiAction(access, "weekly_plan", "meal-click-1");

    expect(await releaseFreeAiAction(access, reservation.actionId)).toBe(true);
    expect(usageDocument().lifetimeUsed).toBeUndefined();
    expect(usageDocument().pendingActions).toEqual([]);
    expect(grantDocument("meal-click-1").status).toBe("released");
  });

  it("rejects duplicate and over-capacity concurrent reservations", async () => {
    const access = buildAccess();
    await reserveFreeAiAction(access, "recipe_generation", "action-0");
    await expect(reserveFreeAiAction(access, "recipe_generation", "action-0"))
      .rejects.toMatchObject({ status: 409 });

    for (let index = 1; index < FREE_LIFETIME_AI_CREDITS; index += 1) {
      await reserveFreeAiAction(access, "recipe_generation", `action-${index}`);
    }

    await expect(reserveFreeAiAction(access, "recipe_generation", "action-over-limit"))
      .rejects.toMatchObject({ status: 409 });
  });
});

function buildAccess(): RequestAccess {
  return {
    uid: "free-user",
    email: "free@example.com",
    role: "user",
    tier: "free",
    isAdmin: false,
    isPremium: false,
    features: {},
    aiCreditsUsed: 0,
    aiCreditsLimit: FREE_LIFETIME_AI_CREDITS,
    aiCreditsRemaining: FREE_LIFETIME_AI_CREDITS,
    weeklyPlanUsed: 0,
    weeklyPlanLimit: FREE_LIFETIME_AI_CREDITS,
    weeklyPlanRemaining: FREE_LIFETIME_AI_CREDITS
  };
}

function usageDocument() {
  return firestore.documents.get("users/free-user/usage/aiCredits") ?? {};
}

function grantDocument(actionId: string) {
  return firestore.documents.get(`users/free-user/aiActionGrants/${actionId}`) ?? {};
}
