import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ cached: vi.fn(), generate: vi.fn(), profile: vi.fn(), entry: vi.fn(), grant: vi.fn(), consume: vi.fn(), premium: false }));
vi.mock("@/services/authService", () => ({ getRequestAccess: async () => ({ uid: "test", isPremium: mock.premium }), accessErrorResponse: () => Response.json({}, { status: 401 }),
  hasGeneratedRecipeImageAccess: () => mock.premium, hasFreeAiActionImageGrantForKey: mock.grant, consumeFreeAiActionImageGrant: mock.consume }));
vi.mock("@/services/generationProfileService", () => ({ loadGenerationRestrictions: mock.profile }));
vi.mock("@/services/rateLimitService", () => ({ applyRateLimit: () => ({ decision: { allowed: true } }) }));
vi.mock("@/services/arabic/images", () => ({ readValidatedArabicEntry: mock.entry, readArabicImage: mock.cached, resolveArabicImage: mock.generate }));
import { POST } from "@/app/api/ar/recipe-photo/route";
const request = () => new Request("http://localhost/api/ar/recipe-photo", { method: "POST", body: JSON.stringify({ recipeId: `ar-${"a".repeat(24)}`, actionGrantId: "parent" }) });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("ARABIC_GENERATION_ENABLED", "true"); mock.premium = false;
  mock.profile.mockResolvedValue({ diets: [], conditions: [], allergens: [] }); mock.entry.mockResolvedValue({ id: `ar-${"a".repeat(24)}` });
  mock.cached.mockResolvedValue(null); mock.grant.mockResolvedValue(false); mock.generate.mockRejectedValue(new Error("ARABIC_IMAGE_NOT_CACHED")); });
afterEach(() => vi.unstubAllEnvs());
describe("Arabic photo route billing and rollback", () => {
  it.each(["true", "false"])("serves cached photos to free users without spending grants when enabled=%s", async enabled => {
    vi.stubEnv("ARABIC_GENERATION_ENABLED", enabled); mock.cached.mockResolvedValue({ imageUrl: "https://example.org/salmon.webp", imageSource: "replicate" });
    expect((await POST(request())).status).toBe(200); expect(mock.grant).not.toHaveBeenCalled(); expect(mock.consume).not.toHaveBeenCalled(); expect(mock.generate).not.toHaveBeenCalled();
  });
  it("passes no AI permission for a creditless cache miss", async () => {
    expect((await POST(request())).status).toBe(404); expect(mock.generate.mock.calls[0][3]).toBe(false); expect(mock.consume).not.toHaveBeenCalled();
  });
  it("fails closed before any image lookup if saved restrictions cannot load", async () => {
    mock.profile.mockRejectedValue(new Error("profile unavailable")); expect((await POST(request())).status).toBe(503); expect(mock.cached).not.toHaveBeenCalled(); expect(mock.generate).not.toHaveBeenCalled();
  });
  it("reports another worker's pending image without showing a broken image", async () => {
    mock.premium = true; mock.generate.mockRejectedValue(new Error("ARABIC_IMAGE_PENDING")); const response = await POST(request());
    expect(response.status).toBe(202); expect((await response.json()).retryAfterSeconds).toBe(4); expect(mock.consume).not.toHaveBeenCalled();
  });
});
