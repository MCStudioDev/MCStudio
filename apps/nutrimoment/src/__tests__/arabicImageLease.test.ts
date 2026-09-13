import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ data: {} as Record<string, unknown>, writes: [] as string[] }));
vi.mock("@/lib/firebaseAdmin", () => ({ getAdminDb: () => ({ doc: (path: string) => ({ path }), runTransaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
  get: async () => ({ data: () => mock.data }), set: (ref: { path: string }, value: Record<string, unknown>) => { mock.data = { ...mock.data, ...value }; mock.writes.push(ref.path); }
}) }) }));
import { acquireArabicImageLease, releaseArabicImageLease } from "@/services/arabic/imageLease";
beforeEach(() => { mock.data = {}; mock.writes = []; });
describe("Arabic image generation lease", () => {
  it("allows one generator across workers and releases only its own lease", async () => {
    const id = "ar-123456789012345678901234";
    await acquireArabicImageLease(id, "first");
    await expect(acquireArabicImageLease(id, "second")).rejects.toThrow("PENDING");
    await releaseArabicImageLease(id, "second");
    await expect(acquireArabicImageLease(id, "second")).rejects.toThrow("PENDING");
    await releaseArabicImageLease(id, "first");
    await acquireArabicImageLease(id, "second");
    expect(mock.writes.every(path => path.startsWith("recipePhotoCacheArabicV1/"))).toBe(true);
  });
});
