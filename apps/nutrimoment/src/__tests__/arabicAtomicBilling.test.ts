import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Transaction } from "firebase-admin/firestore";
const mock = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), transactions: 0 }));
vi.mock("@/lib/firebaseAdmin", () => ({ getAdminDb: () => ({
  doc: (path: string) => ({ path }),
  runTransaction: async (run: (tx: unknown) => Promise<void>) => {
    mock.transactions++;
    const staged: Array<{ path: string; data: Record<string, unknown> }> = [];
    await run({
      get: async (ref: { path: string }) => {
        if (staged.length) throw new Error("read after write");
        return { exists: mock.docs.has(ref.path), data: () => mock.docs.get(ref.path) };
      },
      set: (ref: { path: string }, data: Record<string, unknown>) => staged.push({ path: ref.path, data })
    });
    for (const { path, data } of staged) mock.docs.set(path, { ...mock.docs.get(path), ...data });
  }
}) }));
import { completeFreeAiAction, type RequestAccess } from "@/services/authService";
const access = { uid: "atomic-test", isPremium: false, isAdmin: false, aiCreditsUsed: 0 } as RequestAccess;
const usagePath = "users/atomic-test/usage/aiCredits", grantPath = "users/atomic-test/aiActionGrants/action";
beforeEach(() => { mock.transactions = 0; mock.docs.clear(); mock.docs.set(usagePath, { lifetimeUsed: 0 }); mock.docs.set(grantPath, { status: "pending", feature: "recipe_generation", reservationExpiresAt: Date.now() + 60_000 }); });
const publish = async (tx: Transaction) => { tx.set({ path: "sharedRecipesArabicV1/recipe" } as never, { validated: true }); };
describe("Atomic content publication with shared billing", () => {
  it("commits content and exactly one credit together", async () => {
    const updated = await completeFreeAiAction(access, "action", publish);
    expect(updated.aiCreditsUsed).toBe(1); expect(mock.docs.get(usagePath)?.lifetimeUsed).toBe(1);
    expect(mock.docs.has("sharedRecipesArabicV1/recipe")).toBe(true);
    expect(mock.docs.get(grantPath)?.status).toBe("completed");
    expect(mock.transactions).toBe(1);
  });
  it("rolls back both content and billing when publication fails", async () => {
    await expect(completeFreeAiAction(access, "action", async tx => { await publish(tx); throw new Error("publication failed"); })).rejects.toThrow();
    expect(mock.docs.has("sharedRecipesArabicV1/recipe")).toBe(false);
    expect(mock.docs.get(usagePath)?.lifetimeUsed).toBe(0);
    expect(mock.docs.get(grantPath)?.status).toBe("pending");
  });
  it("does not publish after reservation expiry", async () => {
    mock.docs.set(grantPath, { status: "pending", reservationExpiresAt: 1 });
    const callback = vi.fn(publish);
    await expect(completeFreeAiAction(access, "action", callback)).rejects.toThrow();
    expect(callback).not.toHaveBeenCalled();
  });
  it("retains the original English credit-only behavior when callback is omitted", async () => {
    await completeFreeAiAction(access, "action");
    expect([...mock.docs.keys()].sort()).toEqual([usagePath, grantPath].sort());
    expect(mock.docs.get(usagePath)?.lifetimeUsed).toBe(1);
  });
  it("publishes premium content without billing writes", async () => {
    await completeFreeAiAction({ ...access, isPremium: true }, undefined, publish);
    expect(mock.docs.get(usagePath)?.lifetimeUsed).toBe(0); expect(mock.docs.get(grantPath)?.status).toBe("pending");
    expect(mock.docs.has("sharedRecipesArabicV1/recipe")).toBe(true);
  });
});
