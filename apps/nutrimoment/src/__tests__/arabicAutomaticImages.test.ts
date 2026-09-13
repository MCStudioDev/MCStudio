// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "arabic-image-user" }, loading: false, getAuthHeaders: async () => ({ Authorization: "test" }) }) }));
vi.mock("@/components/dashboard/MealRevealCard", () => ({ MealRevealCard: (props: Record<string, unknown>) => createElement("div", { "data-source": props.imageSource, "data-arabic-id": props.arabicRecipeId }, props.imageUrl ? createElement("img", { src: props.imageUrl as string, alt: "food" }) : props.name as string) }));
import { ArabicAwareMealRevealCard } from "@/components/dashboard/arabic/ArabicAwareMealRevealCard";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => vi.unstubAllGlobals());
describe("Automatic Arabic images", () => {
  it("automatically loads the Arabic image, supplies provenance and never calls an English API", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ imageUrl: "https://example.org/arabic.webp", imageSource: "replicate" }));
    vi.stubGlobal("fetch", fetcher);
    const element = document.createElement("div"), root = createRoot(element);
    try {
      await act(async () => root.render(createElement(ArabicAwareMealRevealCard, { name: "طعمية", arabicRecipeId: "ar-123456789012345678901234", imageActionGrantId: "grant" })));
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][0]).toBe("/api/ar/recipe-photo");
      expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ actionGrantId: "grant" });
      expect(element.querySelector("img")?.getAttribute("src")).toContain("arabic.webp");
      expect(element.querySelector("[data-source]")?.getAttribute("data-source")).toBe("replicate");
    } finally { await act(async () => root.unmount()); }
  });
  it("passes English cards through unchanged without making any request", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const element = document.createElement("div"), root = createRoot(element);
    try {
      await act(async () => root.render(createElement(ArabicAwareMealRevealCard, { name: "English recipe", imageUrl: "https://example.org/english.webp" })));
      expect(fetcher).not.toHaveBeenCalled();
      expect(element.querySelector("img")?.getAttribute("src")).toContain("english.webp");
    } finally { await act(async () => root.unmount()); }
  });
  it("shows an Arabic reason and retry when photo loading fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "تعذر تحميل الصورة" }, { status: 503 })));
    const element = document.createElement("div"), root = createRoot(element);
    try {
      await act(async () => root.render(createElement(ArabicAwareMealRevealCard, { name: "طعمية", arabicRecipeId: "ar-223456789012345678901234" })));
      expect(element.textContent).toContain("تعذر تحميل الصورة");
      expect(element.querySelector("button")?.textContent).toContain("حاول");
    } finally { await act(async () => root.unmount()); }
  });
});
