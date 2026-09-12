import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { canonical, arabic, restrictions } from "./fixtures/arabic";
const mock = vi.hoisted(() => ({ docs: new Map<string, unknown>(), writes: [] as string[], uploads: [] as string[], model: vi.fn(), source: vi.fn(), canReuse: false, cap: true }));
vi.mock("@/lib/firebaseAdmin", () => ({
  getAdminDb: () => ({ doc: (path: string) => ({ get: async () => ({ exists: mock.docs.has(path), data: () => mock.docs.get(path) }), set: async (data: unknown) => { mock.writes.push(path); mock.docs.set(path, data); } }) }),
  getAdminStorageBucket: () => ({ name: "test-bucket", file: (path: string) => ({ save: async () => { mock.uploads.push(path); } }) })
}));
vi.mock("@/lib/replicateRecipeImage", () => ({ generateRecipeImageWithReplicate: mock.model }));
vi.mock("@/services/replicateCostCapService", () => ({ isReplicateGenerationAllowedForUser: async () => ({ allowed: mock.cap, dailyLimit: 100 }), recordReplicateGeneration: vi.fn() }));
vi.mock("@/services/arabic/englishSources", () => ({ readEnglishSource: mock.source, englishSourceFingerprint: () => "source-hash", englishSourceRecipe: () => ({ ...canonical, image_url: "https://example.org/existing.webp" }) }));
vi.mock("@/services/recipePhotoReusePolicy", () => ({ canReuseRecipePhotoForDiet: () => mock.canReuse }));
import { buildArabicEntry } from "@/services/arabic/validation";
import { arabicImageObjectPath, readValidatedArabicEntry, resolveArabicImage } from "@/services/arabic/images";
import { arabicPaths, assertArabicWritePath } from "@/services/arabic/repository";
import type { RequestAccess } from "@/services/authService";
const access = { uid: "test", isPremium: true } as RequestAccess;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("ARABIC_GENERATION_ENABLED", "true");
  mock.docs.clear(); mock.writes = []; mock.uploads = []; mock.canReuse = false; mock.cap = true;
  mock.source.mockResolvedValue(null); mock.model.mockResolvedValue({ imageUrl: "https://replicate.delivery/generated.webp" });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/webp" } })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function fixture(source?: { id: string; fingerprint: string }) {
  const { entry } = await buildArabicEntry(canonical, arabic, restrictions, source);
  mock.docs.set(arabicPaths.shared(entry!.id), entry);
  return entry!;
}
describe("Arabic image isolation", () => {
  it("generates once, stores only Arabic image data and reuses it", async () => {
    const entry = await fixture();
    const urls = await Promise.all([resolveArabicImage(entry, restrictions, access, true), resolveArabicImage(entry, restrictions, access, true)]);
    expect(urls[0]).toBe(urls[1]); expect(mock.model).toHaveBeenCalledTimes(1);
    expect(mock.uploads).toEqual([arabicImageObjectPath(entry.id)]);
    mock.writes.forEach(path => expect(() => assertArabicWritePath(path)).not.toThrow());
    expect(await resolveArabicImage(entry, restrictions, access, false)).toBe(urls[0]);
    expect(mock.model).toHaveBeenCalledTimes(1);
  });
  it("reuses an eligible English image without any writes or regeneration", async () => {
    const entry = await fixture({ id: "en-1", fingerprint: "source-hash" });
    mock.source.mockResolvedValue({}); mock.canReuse = true;
    expect(await resolveArabicImage(entry, restrictions, access, false)).toContain("existing.webp");
    expect(mock.writes).toEqual([]); expect(mock.uploads).toEqual([]); expect(mock.model).not.toHaveBeenCalled();
  });
  it("blocks changed sources and invalid Arabic recipes", async () => {
    const entry = await fixture({ id: "en-1", fingerprint: "source-hash" });
    await expect(readValidatedArabicEntry(entry.id, restrictions)).rejects.toThrow();
    await expect(resolveArabicImage(entry, restrictions, access, true)).rejects.toThrow();
    expect(mock.model).not.toHaveBeenCalled();
  });
  it("honors no-AI access and image cost caps", async () => {
    const entry = await fixture();
    await expect(resolveArabicImage(entry, restrictions, access, false)).rejects.toThrow();
    mock.cap = false;
    await expect(resolveArabicImage(entry, restrictions, access, true)).rejects.toThrow();
    expect(mock.model).not.toHaveBeenCalled();
  });
  it("rejects provider URLs outside the image provider and malformed image IDs", async () => {
    const entry = await fixture(); mock.model.mockResolvedValue({ imageUrl: "http://127.0.0.1/private" });
    await expect(resolveArabicImage(entry, restrictions, access, true)).rejects.toThrow();
    expect(mock.uploads).toEqual([]); expect(() => arabicImageObjectPath("../recipe-photo-cache/en")).toThrow();
  });
});
