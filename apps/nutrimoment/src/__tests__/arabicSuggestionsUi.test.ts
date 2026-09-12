// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/contexts/AppContext", () => ({ useApp: () => ({ setLanguage: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => {
  const auth = { user: { uid: "test" }, getAuthHeaders: async () => ({}) };
  return { useAuth: () => auth };
});
import { useArabicWorkflow } from "@/hooks/useArabicWorkflow";
import { ArabicGenerationIssue } from "@/components/dashboard/ArabicGenerationIssue";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
function Harness() {
  const arabic = useArabicWorkflow();
  return createElement("div", null,
    createElement("button", { onClick: () => void arabic.generate("recipes", {}).catch(() => undefined) }, "generate"),
    createElement(ArabicGenerationIssue, { issue: arabic.issue }));
}
describe("Arabic suggestions", () => {
  it.each([200, 503])("shows missing ingredients and the configured limit after status %i", async status => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ recipes: [], result: "[]", error: "لا توجد وصفات مطابقة", suggestions: [{ name: "كشري", missingIngredients: ["1 كوب عدس", "1 كوب مكرونة"], maxMissingIngredients: 1 }] }, { status })));
    const container = document.createElement("div"), root = createRoot(container);
    try {
      await act(async () => root.render(createElement(Harness)));
      await act(async () => container.querySelector("button")!.click());
      expect(container.textContent).toContain("كشري");
      expect(container.textContent).toContain("1 كوب عدس");
      expect(container.textContent).toContain("1 كوب مكرونة");
      expect(container.textContent).toContain("الحد الحالي: 1");
    } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
  });
});
