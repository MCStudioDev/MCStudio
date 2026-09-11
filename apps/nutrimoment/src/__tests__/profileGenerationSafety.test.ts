// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultUserHealthProfile, createDefaultUserSettings } from "@/lib/userDefaults";

const state = vi.hoisted(() => ({ app: {} as Record<string, unknown> }));
vi.mock("@/contexts/AppContext", () => ({ useApp: () => state.app }));
vi.mock("@/contexts/AuthContext", () => ({
  hasRecipeImageLookupAccess: () => false,
  useAuth: () => ({
    access: { role: "user", tier: "premium", aiCreditsRemaining: 10 },
    user: { uid: "diagnostic-user" },
    getAuthHeaders: async () => ({}),
    refreshAccess: async () => undefined
  })
}));
vi.mock("@/hooks/useHistory", () => ({ useHistory: () => ({
  items: [], loading: false,
  addEntry: async () => null,
  replaceEntryRecipes: async () => undefined,
  updateEntryStatus: async () => undefined,
  updateRecipeImage: async () => undefined
}) }));
vi.mock("@/hooks/usePantry", () => ({ usePantry: () => ({
  items: [{ id: "rice", name: "rice", quantity: "1 cup" }, { id: "salmon", name: "salmon", quantity: "1 fillet" }],
  addItems: async () => undefined
}) }));
vi.mock("@/hooks/useMealPlan", () => ({ useMealPlan: () => ({
  mealPlan: null, loading: false, error: null,
  reloadMealPlan: async () => undefined,
  saveMealPlan: async () => undefined,
  updateMealImage: async () => undefined
}) }));
vi.mock("@/lib/recipeImageStorage", () => ({ persistRecipeImageForUser: async () => undefined }));
vi.mock("@/components/dashboard/MealRevealCard", () => ({ MealRevealCard: () => null }));
vi.mock("framer-motion", async () => {
  const { createElement } = await import("react");
  const Box = ({ children }: { children: unknown }) => createElement("div", null, children);
  const MotionButton = ({ children, onClick, disabled }: { children: unknown; onClick?: () => void; disabled?: boolean }) => createElement("button", { onClick, disabled }, children);
  return { motion: { div: Box, section: Box, button: MotionButton }, AnimatePresence: Box };
});

import { ScannerTab } from "@/components/dashboard/tabs/ScannerTab";
import { MealPlanTab } from "@/components/dashboard/tabs/MealPlanTab";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let container: HTMLDivElement;
let requests: Array<{ url: string; diets?: string[] }>;

function button(text: string) {
  const match = Array.from(container.querySelectorAll("button")).find(element => element.textContent?.trim() === text);
  if (!match) throw new Error(`Missing button: ${text}`);
  return match;
}

async function mount(tab: "scanner" | "mealplan") {
  await act(async () => root.render(createElement(tab === "scanner" ? ScannerTab : MealPlanTab)));
  if (tab === "scanner") {
    const input = container.querySelector('input[placeholder="quickAdd"]') as HTMLInputElement;
    if (!input) throw new Error("Missing ingredient input");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "rice, salmon");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("add").click());
    expect(container.textContent).toContain("salmon");
  }
}

describe("Generation controls with simulated profile states; all network calls mocked", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    requests = [];
    state.app = {
      settings: createDefaultUserSettings(),
      health: createDefaultUserHealthProfile(),
      loadingProfile: true,
      error: null,
      rtl: false,
      t: (key: string) => key,
      setError: vi.fn(),
      addNotification: vi.fn()
    };
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      requests.push({ url: String(url), diets: body.diets });
      return new Response(JSON.stringify({ error: "Simulated unavailable service" }), { status: 503 });
    }));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it.each([
    { tab: "scanner" as const, label: "generateRecipes", endpoint: "/api/generate-recipes", profile: "pending" },
    { tab: "scanner" as const, label: "generateRecipes", endpoint: "/api/generate-recipes", profile: "failed" },
    { tab: "mealplan" as const, label: "generatePlan", endpoint: "/api/mealplan", profile: "pending" },
    { tab: "mealplan" as const, label: "generatePlan", endpoint: "/api/mealplan", profile: "failed" }
  ])("blocks $tab generation when the profile is $profile", async ({ tab, label, endpoint, profile }) => {
    state.app.loadingProfile = profile === "pending";
    state.app.profileError = profile === "failed" ? "Saved health profile could not be loaded" : null;
    await mount(tab);
    await act(async () => button(label).click());
    const generated = requests.filter(request => request.url === endpoint);
    expect(generated, "Generation must not use an empty diet while the saved profile is unavailable").toHaveLength(0);
  });

  it.each([
    { tab: "scanner" as const, label: "generateRecipes", endpoint: "/api/generate-recipes" },
    { tab: "mealplan" as const, label: "generatePlan", endpoint: "/api/mealplan" }
  ])("sends the loaded pescatarian profile from $tab", async ({ tab, label, endpoint }) => {
    state.app.loadingProfile = false;
    state.app.health = { ...createDefaultUserHealthProfile(), diets: ["pescatarian"] };
    await mount(tab);
    await act(async () => button(label).click());
    expect(requests.filter(request => request.url === endpoint)).toEqual([{ url: endpoint, diets: ["pescatarian"] }]);
  });
});
