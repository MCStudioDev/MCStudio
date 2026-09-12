import { beforeEach, describe, expect, it, vi } from "vitest";
import { findRecipeDietViolation } from "@/lib/dietEnforcement";

const mocks = vi.hoisted(() => ({ getDoc: vi.fn() }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => segments.join("/"),
  getDoc: mocks.getDoc
}));
vi.mock("@/config/firebase", () => ({ db: {} }));
import { getUserPreferenceSnapshot } from "@/repositories/userProfileRepo";

const snapshot = (data: unknown) => ({ exists: () => data !== null, data: () => data });

describe("Profile reader safety (repository helper; not the dashboard provider)", () => {
  beforeEach(() => { mocks.getDoc.mockReset(); });

  it("loads pescatarian settings and rejects chicken", async () => {
    mocks.getDoc.mockImplementation(async (path: string) => snapshot(path.endsWith("health") ? { diets: ["pescatarian"] } : {}));
    const preferences = await getUserPreferenceSnapshot("diagnostic-user");
    expect(preferences.diets).toEqual(["pescatarian"]);
    expect(findRecipeDietViolation({ ingredients: ["chicken"] }, preferences)).not.toBeNull();
  });

  it.each(["unavailable", "permission-denied"])("fails closed when the saved health read fails: %s", async (code) => {
    mocks.getDoc.mockImplementation(async (path: string) => {
      if (path.endsWith("health")) throw new Error(code);
      return snapshot({});
    });
    await expect(getUserPreferenceSnapshot("diagnostic-user")).rejects.toThrow();
  });

  it("does not silently produce unrestricted preferences for a missing signed-in profile", async () => {
    mocks.getDoc.mockResolvedValue(snapshot(null));
    await expect(getUserPreferenceSnapshot("diagnostic-user")).rejects.toThrow();
  });

  it("waits for a slow health read before returning a preference snapshot", async () => {
    let release!: (value: unknown) => void;
    const pending = new Promise(resolve => { release = resolve; });
    mocks.getDoc.mockImplementation((path: string) => path.endsWith("health") ? pending : Promise.resolve(snapshot({})));
    let settled = false;
    const result = getUserPreferenceSnapshot("diagnostic-user").then(value => { settled = true; return value; });
    await Promise.resolve();
    expect(settled).toBe(false);
    release(snapshot({ diets: ["pescatarian"] }));
    expect((await result).diets).toEqual(["pescatarian"]);
  });
});
