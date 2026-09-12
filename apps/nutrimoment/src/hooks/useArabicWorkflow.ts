"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { HistoryItem, MealPlanData, Recipe } from "@/lib/types";

export interface ArabicGenerationResult { recipes: Recipe[]; result: string; generationStatus?: string; message?: string }
export function useArabicWorkflow(readSaved = false) {
  const { user, getAuthHeaders } = useAuth();
  const [issue, setIssue] = useState<{ code?: string; message: string; items?: Array<{ index: number; text: string }> } | null>(null);
  const normalizeInput = useCallback(async (ingredients: string[]) => {
    setIssue(null);
    // Ordinary English input retains the existing request path.
    if (!ingredients.some(value => /[^\x00-\x7f]/.test(value))) return ingredients;
    const response = await fetch("/api/ar/normalize-ingredients", {
      method: "POST", headers: { "Content-Type": "application/json", ...await getAuthHeaders() },
      body: JSON.stringify({ ingredients }), signal: AbortSignal.timeout(15_000)
    });
    const data = await response.json();
    if (!response.ok) {
      const failure = { code: data.code, message: data.error, items: data.items };
      setIssue(failure); throw new Error(failure.message);
    }
    return data.canonical as string[];
  }, [getAuthHeaders]);
  const generate = useCallback(async (mode: "recipes" | "mealplan", input: object) => {
    setIssue(null);
    const response = await fetch(mode === "recipes" ? "/api/ar/generate-recipes" : "/api/ar/mealplan", {
      method: "POST", headers: { "Content-Type": "application/json", ...await getAuthHeaders() },
      body: JSON.stringify({ ...input, actionId: crypto.randomUUID(), uiLanguage: "ar" }),
      signal: AbortSignal.timeout(90_000)
    });
    const data = await response.json();
    if (!response.ok) {
      const failure = { code: data.code, message: data.error ?? "تعذر إكمال الطلب بالعربية.", items: data.items };
      setIssue(failure); throw new Error(failure.message);
    }
    window.dispatchEvent(new Event("nutrimoment:arabic-results"));
    return data as ArabicGenerationResult;
  }, [getAuthHeaders]);
  const [saved, setSaved] = useState<{ uid: string; items: HistoryItem[]; mealPlan: MealPlanData | null } | null>(null);
  const [readError, setReadError] = useState<Error | null>(null);
  const reload = useCallback(async () => {
    if (!user) return;
    const response = await fetch("/api/ar/history", { headers: await getAuthHeaders(), cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error("تعذر تحميل النتائج العربية المحفوظة.");
    const data = await response.json();
    setSaved({ uid: user.uid, items: data.items ?? [], mealPlan: data.mealPlan ?? null });
    setReadError(null);
  }, [user, getAuthHeaders]);
  useEffect(() => {
    if (!readSaved) return;
    const refresh = () => { void reload().catch(error => setReadError(error instanceof Error ? error : new Error("Arabic history unavailable"))); };
    refresh(); window.addEventListener("nutrimoment:arabic-results", refresh);
    return () => window.removeEventListener("nutrimoment:arabic-results", refresh);
  }, [reload, readSaved]);
  const remove = useCallback(async (id: string) => {
    const response = await fetch(`/api/ar/history?id=${encodeURIComponent(id.replace(/^ar:/, ""))}`, { method: "DELETE", headers: await getAuthHeaders() });
    if (!response.ok) throw new Error("تعذر حذف السجل العربي.");
    await reload();
  }, [getAuthHeaders, reload]);
  const current = saved?.uid === user?.uid ? saved : null;
  return { generate, normalizeInput, issue, items: current?.items ?? [], mealPlan: current?.mealPlan ?? null, reload, remove, readError };
}
