import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { canonical, arabic, restrictions } from "./fixtures/arabic";
const mock = vi.hoisted(() => ({ docs: new Map<string, unknown>(), writes: [] as string[], uploads: [] as string[], model: vi.fn(), source: vi.fn(), canReuse: false, cap: true }));
vi.mock("@/lib/firebaseAdmin", () => ({
  getAdminDb: () => ({ doc: (path: string) => ({ path, get: async () => ({ exists: mock.docs.has(path), data: () => mock.docs.get(path) }), set: async (data: unknown) => { mock.writes.push(path); mock.docs.set(path, data); } }),
    runTransaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({ get: async (ref: { path: string }) => ({ exists: mock.docs.has(ref.path), data: () => mock.docs.get(ref.path) }),
      set: (ref: { path: string }, data: Record<string, unknown>, options?: { merge: boolean }) => { mock.writes.push(ref.path); mock.docs.set(ref.path, options?.merge ? { ...(mock.docs.get(ref.path) as object), ...data } : data); } }) }),
  getAdminStorageBucket: () => ({ name: "test-bucket", file: (path: string) => ({ save: async () => { mock.uploads.push(path); } }) })
}));
vi.mock("@/services/arabic/imageProvider", () => ({ generateArabicRecipeImage: mock.model, ARABIC_IMAGE_PROMPT_VERSION: "test-version" }));
vi.mock("@/services/replicateCostCapService", () => ({ isReplicateGenerationAllowedForUser: async () => ({ allowed: mock.cap, dailyLimit: 100 }), recordReplicateGeneration: vi.fn() }));
vi.mock("@/services/arabic/englishSources", () => ({ readEnglishSource: mock.source, englishSourceFingerprint: () => "source-hash", englishSourceRecipe: () => ({ ...canonical, image_url: "https://example.org/existing.webp" }) }));
vi.mock("@/services/recipePhotoReusePolicy", () => ({ canReuseRecipePhotoForDiet: () => mock.canReuse }));
import { buildArabicEntry } from "@/services/arabic/validation";
import { arabicImageObjectPath, readValidatedArabicEntry, resolveArabicImage } from "@/services/arabic/images";
import { arabicPaths, assertArabicWritePath } from "@/services/arabic/repository";
import type { RequestAccess } from "@/services/authService";
import { arabicFingerprint } from "@/services/arabic/fingerprint";
import { buildArabicFactsEntry } from "@/services/arabic/recipeFacts";
import { weeklyFactFixtures } from "./fixtures/arabicFacts";
import { arabicImageIdentity } from "@/services/arabic/imageIdentity";
import { findArabicFood } from "@/services/arabic/foodCatalog";
import { arabicSafetyFingerprint } from "@/services/arabic/semanticSafety";
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
  it("converges existing recipe-version photos without calling Replicate or uploading again", async () => {
    const facts = weeklyFactFixtures()[0];
    const entries = await Promise.all([facts, { ...facts, totalMinutes: facts.totalMinutes + 1 }].map(async fact => {
      const entry = (await buildArabicFactsEntry(fact, restrictions)).entry!;
      mock.docs.set(arabicPaths.shared(entry.id), entry);
      mock.docs.set(arabicPaths.image(entry.id), { imageUrl: `https://example.org/${entry.id}.webp`,
        objectPath: arabicImageObjectPath(entry.id), fingerprint: entry.fingerprint, validatorVersion: entry.validatorVersion,
        promptVersion: "test-version", recipeId: entry.id });
      return entry;
    }));
    const first = await resolveArabicImage(entries[0], restrictions, access, false);
    expect(await resolveArabicImage(entries[1], restrictions, access, false)).toBe(first);
    expect(mock.model).not.toHaveBeenCalled(); expect(mock.uploads).toEqual([]);
    expect(mock.writes).toEqual([arabicPaths.image((await arabicImageIdentity(entries[0])).id)]);
  });
  it("shares the generation lease across concurrent recipe versions", async () => {
    const facts = weeklyFactFixtures()[0];
    const entries = await Promise.all([facts, { ...facts, totalMinutes: facts.totalMinutes + 1 }].map(async fact => {
      const entry = (await buildArabicFactsEntry(fact, restrictions)).entry!;
      mock.docs.set(arabicPaths.shared(entry.id), entry); return entry;
    }));
    const urls = await Promise.all(entries.map(entry => resolveArabicImage(entry, restrictions, access, true)));
    expect(urls[0]).toBe(urls[1]); expect(mock.model).toHaveBeenCalledTimes(1); expect(mock.uploads).toHaveLength(1);
  });
  it("keeps photos separate when a same-name recipe changes protein", async () => {
    const facts = weeklyFactFixtures()[0], salmon = findArabicFood("salmon")!.id, tuna = findArabicFood("tuna")!.id;
    const changed = { ...facts, ingredients: facts.ingredients.map(i => ({ ...i, foodId: i.foodId === salmon ? tuna : i.foodId })),
      steps: facts.steps.map(step => ({ ...step, foodIds: step.foodIds.map(id => id === salmon ? tuna : id) })) };
    const entries = await Promise.all([facts, changed].map(async fact => {
      const result = await buildArabicFactsEntry(fact, restrictions, undefined, undefined, arabicSafetyFingerprint(fact, restrictions));
      expect(result.reasons).toEqual([]);
      mock.docs.set(arabicPaths.shared(result.entry!.id), result.entry); return result.entry!;
    }));
    await resolveArabicImage(entries[0], restrictions, access, true);
    await expect(resolveArabicImage(entries[1], restrictions, access, false)).rejects.toThrow("ARABIC_IMAGE_NOT_CACHED");
    expect((await arabicImageIdentity(entries[0])).id).not.toBe((await arabicImageIdentity(entries[1])).id);
    expect(mock.model).toHaveBeenCalledTimes(1);
  });
  it("does not reuse a stable photo whose original source has since become blocked", async () => {
    const facts = weeklyFactFixtures()[0];
    const sourceEntry = (await buildArabicFactsEntry(facts, restrictions, { id: "en-1", fingerprint: "source-hash" })).entry!;
    const independent = (await buildArabicFactsEntry(facts, restrictions)).entry!;
    for (const entry of [sourceEntry, independent]) mock.docs.set(arabicPaths.shared(entry.id), entry);
    mock.source.mockResolvedValue({});
    await resolveArabicImage(sourceEntry, restrictions, access, true);
    mock.source.mockResolvedValue(null);
    await expect(resolveArabicImage(independent, restrictions, access, false)).rejects.toThrow("ARABIC_IMAGE_NOT_CACHED");
    expect(mock.model).toHaveBeenCalledTimes(1);
  });
  it("reuses one photo across recipe IDs when quantities, step timing and ingredient order change", async () => {
    const facts = weeklyFactFixtures()[0];
    const first = (await buildArabicFactsEntry(facts, restrictions)).entry!;
    const second = (await buildArabicFactsEntry({ ...facts,
      ingredients: [...facts.ingredients].reverse().map(item => ({ ...item, quantity: item.quantity * 1.1 })),
      steps: facts.steps.map(step => ({ ...step, minutes: step.minutes ? step.minutes + 1 : 0 })) }, restrictions)).entry!;
    expect(first.id).not.toBe(second.id);
    for (const entry of [first, second]) mock.docs.set(arabicPaths.shared(entry.id), entry);
    const original = await resolveArabicImage(first, restrictions, access, true);
    expect(await resolveArabicImage(second, restrictions, access, false)).toBe(original);
    expect(mock.model).toHaveBeenCalledTimes(1); expect(mock.uploads).toHaveLength(1);
    mock.writes.forEach(path => expect(() => assertArabicWritePath(path)).not.toThrow());
  });
  it("generates once, stores only Arabic image data and reuses it", async () => {
    const entry = await fixture();
    const urls = await Promise.all([resolveArabicImage(entry, restrictions, access, true), resolveArabicImage(entry, restrictions, access, true)]);
    expect(urls[0]).toBe(urls[1]); expect(mock.model).toHaveBeenCalledTimes(1);
    expect(mock.uploads).toEqual([arabicImageObjectPath((await arabicImageIdentity(entry)).id)]);
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
  it("reuses a source-matched semantic picture without any image generation or English writes", async () => {
    const key = "a".repeat(64), recipe = { ...canonical, image_url: "https://example.org/semantic.webp" };
    const entry = await fixture({ kind: "shared", id: "en-1", fingerprint: "source-hash", editorKey: key, editorFingerprint: arabicFingerprint(recipe) });
    mock.docs.set(`recipeEditorSemanticCache/${key}`, { recipe, cacheVersion: "recipe-editor-v11-validation-identity-v1", expiresAt: { toMillis: () => Date.now() + 60000 } });
    mock.source.mockResolvedValue({}); mock.canReuse = true;
    expect(await resolveArabicImage(entry, restrictions, access, false)).toBe(recipe.image_url);
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
