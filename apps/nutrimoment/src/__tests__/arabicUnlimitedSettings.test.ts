// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultUserSettings } from "@/lib/userDefaults";
import type { UserSettings } from "@/lib/types";
const state = vi.hoisted(() => ({ settings: {} as UserSettings, saveSettings: vi.fn() }));
vi.mock("@/contexts/AppContext", () => ({ useApp: () => ({ ...state, t: (key: string) => key }) }));
vi.mock("@/components/dashboard/tabs/HealthTab", () => ({ HealthSettingsSection: () => null, HealthSafetySettingsSection: () => null }));
vi.mock("@/components/dashboard/tabs/shared", () => ({ SectionHero: () => null }));
vi.mock("framer-motion", async () => {
  const { createElement } = await import("react");
  return { motion: { div: ({ children }: { children: unknown }) => createElement("div", null, children) } };
});
import { SettingsTab } from "@/components/dashboard/tabs/SettingsTab";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  state.settings = { ...createDefaultUserSettings(), uiLanguage: "ar" };
  container = document.createElement("div"); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); });
describe("Arabic unlimited missing ingredients preference", () => {
  it("saves unlimited separately and restores the previous numeric setting when turned off", async () => {
    await act(async () => root.render(createElement(SettingsTab)));
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    await act(async () => checkbox.click());
    expect(state.saveSettings).toHaveBeenLastCalledWith({ arabicUnlimitedMissingIngredients: true });
    state.settings = { ...state.settings, arabicUnlimitedMissingIngredients: true };
    await act(async () => root.render(createElement(SettingsTab)));
    expect((container.querySelector('#settings-max-missing-ingredients') as HTMLInputElement).disabled).toBe(true);
    expect(checkbox.checked).toBe(true);
    expect(container.textContent).toContain("unlimited");
    await act(async () => checkbox.click());
    expect(state.saveSettings).toHaveBeenLastCalledWith({ arabicUnlimitedMissingIngredients: false });
    expect(state.settings.maxMissingIngredients).toBe(5);
  });
  it("keeps the existing English numeric control regardless of the Arabic preference", async () => {
    state.settings = { ...state.settings, uiLanguage: "en", arabicUnlimitedMissingIngredients: true };
    await act(async () => root.render(createElement(SettingsTab)));
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    const range = container.querySelector('#settings-max-missing-ingredients') as HTMLInputElement;
    expect(range.disabled).toBe(false); expect(range.value).toBe("5");
  });
});
