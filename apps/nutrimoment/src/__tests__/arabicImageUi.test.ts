// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/contexts/AppContext", () => ({ useApp: () => ({ t: (key: string) => key, rtl: false }) }));
vi.mock("@/contexts/AuthContext", () => {
  const auth = { access: { tier: "premium" }, loading: false, user: { uid: "test" }, getAuthHeaders: async () => ({}), refreshAccess: async () => undefined };
  return { useAuth: () => auth, hasRecipeImageLookupAccess: () => true };
});
import { MealRevealCard } from "@/components/dashboard/MealRevealCard";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
describe("Arabic image UI", () => {
  it("never calls English photo APIs automatically or on manual retry", async () => {
    const fetcher = vi.fn(async () => Response.json({ imageUrl: "https://example.org/ar.webp" }));
    vi.stubGlobal("fetch", fetcher);
    const element = document.createElement("div"), root = createRoot(element); document.body.append(element);
    try {
      await act(async () => root.render(createElement(MealRevealCard, { name: "Arabic meal", arabicRecipeId: "ar-123456789012345678901234", imageActionGrantId: "parent-action" })));
      expect(fetcher).not.toHaveBeenCalled();
      const retry = element.querySelector('button[aria-label="retryPhoto"]') as HTMLButtonElement;
      expect(retry).not.toBeNull();
      await act(async () => retry.click());
      expect(fetcher.mock.calls).toHaveLength(1);
      expect((fetcher.mock.calls[0] as unknown[])[0]).toBe("/api/ar/recipe-photo");
    } finally { await act(async () => root.unmount()); element.remove(); vi.unstubAllGlobals(); }
  });
});
