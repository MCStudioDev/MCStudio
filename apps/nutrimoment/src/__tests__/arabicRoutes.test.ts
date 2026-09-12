import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ reads: [] as string[], deletes: [] as string[], authenticate: vi.fn(), historyData: {} as Record<string, unknown>, planReferences: {} as Record<string, unknown> }));
vi.mock("@/services/authService", () => ({ getRequestAccess: mock.authenticate, accessErrorResponse: () => Response.json({}, { status: 401 }) }));
vi.mock("@/lib/firebaseAdmin", () => ({ getAdminDb: () => ({
  doc: (path: string) => ({ get: async () => { mock.reads.push(path); return { data: () => ({ mealPlan: { generationLanguage: "ar" }, englishSources: mock.planReferences }) }; }, delete: async () => { mock.deletes.push(path); } }),
  collection: (path: string) => {
    mock.reads.push(path);
    const query = { orderBy: () => query, limit: () => query, get: async () => ({ docs: [{ id: "history-1", data: () => mock.historyData }] }) };
    return query;
  }
}) }));
import { GET, DELETE } from "@/app/api/ar/history/route";
import { POST } from "@/app/api/ar/normalize-ingredients/route";
beforeEach(() => { vi.clearAllMocks(); mock.reads = []; mock.deletes = []; mock.historyData = { generationLanguage: "ar", recipes: [] }; mock.planReferences = {}; mock.authenticate.mockResolvedValue({ uid: "test-user" }); vi.stubEnv("ARABIC_GENERATION_ENABLED", "false"); });
afterEach(() => vi.unstubAllEnvs());
describe("Arabic read and input routes", () => {
  it("preserves Arabic history after disablement using a display adapter", async () => {
    const response = await GET(new Request("http://localhost/api/ar/history"));
    expect(await response.json()).toMatchObject({ items: [{ id: "ar:history-1" }], mealPlan: { generationLanguage: "ar" } });
    expect(mock.reads.sort()).toEqual(["users/test-user/historyArabicV1", "users/test-user/plans/currentWeeklyArabic"].sort());
  });
  it("deletes only the caller's Arabic history and rejects arbitrary paths", async () => {
    expect((await DELETE(new Request("http://localhost/api/ar/history?id=history-1"))).status).toBe(200);
    expect(mock.deletes).toEqual(["users/test-user/historyArabicV1/history-1"]);
    expect((await DELETE(new Request("http://localhost/api/ar/history?id=../history/en"))).status).toBe(400);
  });
  it("rejects unauthenticated reads and deletes", async () => {
    mock.authenticate.mockRejectedValue(new Error("Unauthorized"));
    expect((await GET(new Request("http://localhost/api/ar/history"))).status).toBe(401);
    expect((await DELETE(new Request("http://localhost/api/ar/history?id=x"))).status).toBe(401);
    expect(mock.reads).toEqual([]); expect(mock.deletes).toEqual([]);
  });
  it("accepts English, Arabic and mixed input even with Arabic output disabled", async () => {
    for (const ingredients of [["rice", "tuna"], ["أرز", "تونة"], ["rice؛ ٢٠٠ غرام تونة"]]) {
      const response = await POST(new Request("http://localhost/api/ar/normalize-ingredients", { method: "POST", body: JSON.stringify({ ingredients }) }));
      expect(response.status).toBe(200); expect((await response.json()).canonical).toEqual(["rice", "tuna"]);
    }
    expect(mock.reads).toEqual([]); expect(mock.deletes).toEqual([]);
  });
  it("asks about unclear input and rejects malformed payloads", async () => {
    expect((await POST(new Request("http://localhost/test", { method: "POST", body: JSON.stringify({ ingredients: ["xyzxyz"] }) }))).status).toBe(422);
    expect((await POST(new Request("http://localhost/test", { method: "POST", body: "{}" }))).status).toBe(400);
  });
  it("withholds saved derivatives of blocked sources without rewriting history", async () => {
    const refs = { "ar-recipe": { id: "blocked-source", fingerprint: "original" } };
    mock.historyData = { recipes: [{ id: "ar-recipe" }], englishSources: refs };
    mock.planReferences = refs;
    const result = await (await GET(new Request("http://localhost/api/ar/history"))).json();
    expect(result.items[0].recipes).toEqual([]); expect(result.mealPlan).toBeNull();
    expect(mock.deletes).toEqual([]);
    expect(mock.reads.filter(path => path === "sharedRecipesV2/blocked-source")).toHaveLength(1);
  });
});
