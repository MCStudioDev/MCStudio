"use client";
import { useApp } from "@/contexts/AppContext";
import type { ArabicRecipeSuggestion } from "@/services/arabic/types";
export function ArabicGenerationIssue({ issue }: { issue: { code?: string; message: string; items?: Array<{ index: number; text: string }>; suggestions?: ArabicRecipeSuggestion[] } | null }) {
  const { setLanguage } = useApp();
  if (!issue) return null;
  return <div role="alert" dir="rtl" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
    <p>{issue.message}</p>
    {issue.items?.length ? <ul className="list-disc ps-5">{issue.items.map(item => <li key={item.index}>{item.text}</li>)}</ul> : null}
    {issue.suggestions?.length ? <ul className="mt-3 space-y-3">{issue.suggestions.map((suggestion, index) => <li key={`${suggestion.name}-${index}`}>
      <strong>{suggestion.name}</strong>
      <p>تحتاج {suggestion.missingIngredients.length} مكونات غير متوفرة. الحد الحالي: {suggestion.maxMissingIngredients}.</p>
      <p>الناقص: {suggestion.missingIngredients.join("، ")}</p>
    </li>)}</ul> : null}
    {issue.code === "ARABIC_GENERATION_DISABLED" ? <button type="button" className="mt-2 underline" onClick={() => void setLanguage("en")}>التبديل إلى الإنجليزية</button> : null}
  </div>;
}
