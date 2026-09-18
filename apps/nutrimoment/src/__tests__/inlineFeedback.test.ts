// @vitest-environment jsdom
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultUserHealthProfile, createDefaultUserSettings } from "@/lib/userDefaults";
import { t } from "@/lib/translations";

const state = vi.hoisted(() => ({
  app: {} as Record<string, unknown>,
  user: { uid: "feedback-test" } as { uid: string } | null,
  issue: null as { code: string; message: string; items?: { index: number; text: string }[] } | null,
  historyError: null as Error | null,
  signIn: vi.fn()
}));
vi.mock("@/contexts/AppContext", () => ({ useApp: () => state.app }));
vi.mock("@/contexts/AuthContext", () => ({
  hasRecipeImageLookupAccess: () => false,
  useAuth: () => ({
    user: state.user, loading: false, signInWithGoogle: state.signIn,
    access: { role: "user", tier: "premium", aiCreditsRemaining: 10 },
    getAuthHeaders: async () => ({}), refreshAccess: async () => undefined
  })
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/hooks/useHistory", () => ({ useHistory: () => ({ items: [], loading: false }) }));
vi.mock("@/hooks/useCombinedHistory", () => ({ useCombinedHistory: () => ({ items: [], loading: false, error: state.historyError }) }));
vi.mock("@/hooks/usePantry", () => ({ usePantry: () => ({ items: [], loading: false }) }));
vi.mock("@/hooks/useMealPlan", () => ({ useMealPlan: () => ({ mealPlan: null, loading: false, error: null }) }));
vi.mock("@/hooks/useArabicWorkflow", () => ({ useArabicWorkflow: () => ({ issue: state.issue, mealPlan: null }) }));
vi.mock("@/lib/recipeImageStorage", () => ({ persistRecipeImageForUser: vi.fn() }));
vi.mock("framer-motion", async () => {
  const { createElement } = await import("react");
  const Box = ({ children }: { children: ReactNode }) => createElement("div", null, children);
  const Button = ({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) => createElement("button", { onClick, disabled }, children);
  return { motion: { div: Box, section: Box, button: Button }, AnimatePresence: Box };
});

import { ScannerTab } from "@/components/dashboard/tabs/ScannerTab";
import { MealPlanTab } from "@/components/dashboard/tabs/MealPlanTab";
import { PantryTab } from "@/components/dashboard/tabs/PantryTab";
import { HistoryTab } from "@/components/dashboard/tabs/HistoryTab";
import { SettingsTab } from "@/components/dashboard/tabs/SettingsTab";
import Landing from "@/app/page";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
const tabs: Array<[string, ComponentType]> = [["scanner", ScannerTab], ["mealplan", MealPlanTab], ["pantry", PantryTab], ["history", HistoryTab], ["settings", SettingsTab]];

function expectInlineMessage(message: string, direction: string) {
  const alerts = Array.from(container.querySelectorAll('[role="alert"]')).filter(node => node.textContent?.includes(message));
  expect(alerts).toHaveLength(1);
  const alert = alerts[0] as HTMLElement;
  expect(alert.classList.contains("bg-[#fffbeb]")).toBe(true);
  expect(alert.getAttribute("dir")).toBe(direction);
  for (let node: HTMLElement | null = alert; node && node !== container; node = node.parentElement) {
    expect(node.classList.contains("fixed")).toBe(false);
    expect(node.classList.contains("absolute")).toBe(false);
  }
  return alert;
}

describe.each(["en", "ar"] as const)("%s inline feedback", language => {
  const message = language === "ar" ? "تعذر إكمال الطلب. حاول مجددًا." : "Unable to complete the request. Please try again.";
  const direction = language === "ar" ? "rtl" : "ltr";
  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    state.user = { uid: "feedback-test" }; state.issue = null; state.historyError = null;
    state.signIn.mockReset();
    state.app = {
      settings: { ...createDefaultUserSettings(), uiLanguage: language },
      health: createDefaultUserHealthProfile(), loadingProfile: false, profileError: null,
      language, rtl: language === "ar", t: (key: Parameters<typeof t>[0]) => t(key, language),
      error: message, setError: vi.fn(), setLanguage: vi.fn(), saveSettings: vi.fn(), saveHealth: vi.fn()
    };
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  it.each(tabs)("keeps formerly popup-only errors visible once in %s", async (_name, Tab) => {
    await act(async () => root.render(createElement(Tab)));
    const alert = expectInlineMessage(message, direction);
    const dismiss = alert.querySelector("button")!;
    expect(dismiss.getAttribute("aria-label")).toBe(t("dismissNotification", language));
    await act(async () => dismiss.click());
    expect(state.app.setError).toHaveBeenCalledWith(null);
  });

  it.each(tabs.slice(0, 2))("keeps rich Arabic correction details without a duplicate in %s", async (_name, Tab) => {
    state.issue = { code: "INGREDIENT_CLARIFICATION_REQUIRED", message, items: [{ index: 0, text: "Ingredient needing correction" }] };
    await act(async () => root.render(createElement(Tab)));
    const alert = expectInlineMessage(message, "rtl");
    expect(alert.textContent).toContain("Ingredient needing correction");
    expect(container.textContent?.split(message)).toHaveLength(2);
  });

  it("shows a single localized history loading failure", async () => {
    state.app.error = null; state.historyError = new Error("read unavailable");
    await act(async () => root.render(createElement(HistoryTab)));
    expectInlineMessage(language === "ar" ? "السجل غير متاح مؤقتًا." : "History is temporarily unavailable.", direction);
    expect(state.app.setError).not.toHaveBeenCalled();
  });

  it("shows sign-in failures inline on the landing page", async () => {
    state.user = null;
    state.signIn.mockRejectedValue(new Error(message));
    await act(async () => root.render(createElement(Landing)));
    const button = Array.from(container.querySelectorAll("button")).find(node => node.textContent?.includes(language === "ar" ? "المتابعة باستخدام Google" : "Continue with Google"));
    expect(button).toBeDefined();
    await act(async () => button!.click());
    expectInlineMessage(message, direction);
  });
});
