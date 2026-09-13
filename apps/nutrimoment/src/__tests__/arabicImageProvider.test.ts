import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildArabicImagePrompt, generateArabicRecipeImage } from "@/services/arabic/imageProvider";
import { canonical } from "./fixtures/arabic";
beforeEach(() => { vi.stubEnv("REPLICATE_API_TOKEN", "test-token"); vi.stubEnv("REPLICATE_IMAGE_MODEL", "black-forest-labs/flux-schnell"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("Arabic image facts and provider isolation", () => {
  it("keeps the literal dish and method without fuzzy English dish remapping", () => {
    const prompt = buildArabicImagePrompt({ ...canonical, name: "Rice with Tomato Sauce", ingredients: ["1 cup rice", "2 tomatoes"], steps: ["Chop tomatoes, then simmer with rice."] });
    expect(prompt).toContain("Rice with Tomato Sauce"); expect(prompt).toContain("simmer"); expect(prompt).not.toMatch(/mahshi|stuffed vegetable|structural component required/);
  });
  it("uses the configured provider and a strict recipe prompt without any cache writes", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "succeeded", output: ["https://replicate.delivery/photo.webp"] })));
    vi.stubGlobal("fetch", fetcher);
    expect((await generateArabicRecipeImage(canonical)).imageUrl).toBe("https://replicate.delivery/photo.webp");
    const input = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(input.version).toBe("black-forest-labs/flux-schnell"); expect(input.input.prompt).toContain(canonical.name);
  });
  it("never follows an untrusted prediction polling URL with the provider token", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "processing", urls: { get: "https://attacker.invalid/steal" } })));
    vi.stubGlobal("fetch", fetcher);
    await expect(generateArabicRecipeImage(canonical)).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
