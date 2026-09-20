import { describe, expect, it, vi } from "vitest";
import { rejectLegacyArabicGeneration } from "@/services/arabic/legacyWorkflow";

describe("legacy Arabic route guard", () => {
  it.each(["true", "false"])("stays retired when the new Arabic feature flag is %s", async flag => {
    vi.stubEnv("ARABIC_GENERATION_ENABLED", flag);
    try {
      const request = new Request("http://localhost/api/generate-recipes", { method: "POST", body: JSON.stringify({ uiLanguage: "ar" }) });
      expect((await rejectLegacyArabicGeneration(request, "/api/ar/generate-recipes"))?.status).toBe(410);
    } finally { vi.unstubAllEnvs(); }
  });
  it.each([{ uiLanguage: "en", ingredients: ["أرز", "fish"] }, { ingredients: ["rice"] }, null, []])("preserves English inputs and the original body: %j", async body => {
    const request = new Request("http://localhost/api/generate-recipes", { method: "POST", body: JSON.stringify(body) });
    expect(await rejectLegacyArabicGeneration(request, "/api/ar/generate-recipes")).toBeNull();
    expect(await request.json()).toEqual(body);
  });
  it("leaves malformed JSON to the existing route error handler", async () => {
    const request = new Request("http://localhost/api/generate-recipes", { method: "POST", body: "{" });
    expect(await rejectLegacyArabicGeneration(request, "/api/ar/generate-recipes")).toBeNull();
    expect(await request.text()).toBe("{");
  });
});
