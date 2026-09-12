// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), user: { uid: "first-user" } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/config/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => path.join("/"),
  getDoc: mocks.get, setDoc: mocks.set,
  collection: vi.fn(), query: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
  onSnapshot: () => () => {}
}));
import { AppProvider, useApp } from "@/contexts/AppContext";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let current: ReturnType<typeof useApp>;
let root: Root;
let container: HTMLDivElement;
const snapshot = (data: unknown) => ({ exists: () => data !== null, data: () => data });
function Probe() { current = useApp(); return createElement("div", null, current.loadingProfile ? "pending" : current.profileError ? "failed" : current.health.diets.join(",")); }
const mount = async () => { await act(async () => root.render(createElement(AppProvider, null, createElement(Probe)))); };

describe("real AppProvider profile lifecycle", () => {
  beforeEach(() => {
    mocks.user = { uid: "first-user" };
    mocks.get.mockReset(); mocks.set.mockReset();
    container = document.createElement("div"); document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  it("keeps pending state until the health read completes", async () => {
    let release!: (value: unknown) => void;
    const pending = new Promise(resolve => { release = resolve; });
    mocks.get.mockImplementation((path: string) => path.endsWith("health") ? pending : Promise.resolve(snapshot({})));
    await mount(); expect(container.textContent).toBe("pending");
    await act(async () => release(snapshot({ diets: ["pescatarian"] })));
    expect(container.textContent).toBe("pescatarian");
  });
  it.each(["missing", "permission-denied"])("exposes a retryable %s failure and recovers", async kind => {
    mocks.get.mockImplementation(async (path: string) => {
      if (!path.endsWith("health")) return snapshot({});
      if (kind === "missing") return snapshot(null);
      throw new Error(kind);
    });
    await mount(); expect(container.textContent).toBe("failed");
    mocks.get.mockImplementation(async (path: string) => snapshot(path.endsWith("health") ? { diets: ["pescatarian"] } : {}));
    await act(async () => current.reloadProfile());
    expect(container.textContent).toBe("pescatarian");
  });
  it("does not relax restrictions after a failed profile save", async () => {
    mocks.get.mockImplementation(async (path: string) => snapshot(path.endsWith("health") ? { diets: ["pescatarian"] } : {}));
    await mount();
    mocks.set.mockRejectedValue(new Error("permission-denied"));
    await act(async () => current.saveHealth({ diets: [] }));
    expect(current.health.diets).toEqual(["pescatarian"]);
    expect(current.profileError).toBeTruthy();
  });
  it("ignores an old user's slow response after switching accounts", async () => {
    let release!: (value: unknown) => void;
    const pending = new Promise(resolve => { release = resolve; });
    mocks.get.mockImplementation((path: string) => path.endsWith("health") ? pending : Promise.resolve(snapshot({})));
    await mount();
    mocks.user = { uid: "second-user" };
    mocks.get.mockImplementation(async (path: string) => snapshot(path.endsWith("health") ? { diets: ["vegan"] } : {}));
    await mount();
    await act(async () => release(snapshot({ diets: [] })));
    expect(container.textContent).toBe("vegan");
  });
});
