"use client";
import { useApp } from "@/contexts/AppContext";
import { InlineNotice } from "@/components/ui/InlineNotice";
import type { ArabicRecipeSuggestion } from "@/services/arabic/types";
export function ArabicGenerationIssue({ issue }: { issue: { code?: string; message: string; items?: Array<{ index: number; text: string }>; suggestions?: ArabicRecipeSuggestion[] } | null }) {
  const { setLanguage } = useApp();
  if (!issue) return null;
  return <InlineNotice role={issue.code === "ARABIC_WEEKLY_PLAN_NOTICE" || issue.code === "ARABIC_RECIPE_SUGGESTIONS" ? "status" : "alert"} dir="rtl">
    <p>{issue.message}</p>
    {issue.items?.length ? <ul className="list-disc ps-5">{issue.items.map(item => <li key={item.index}>{item.text}</li>)}</ul> : null}
    {issue.suggestions?.length ? <ul className="mt-3 space-y-3">{issue.suggestions.map((suggestion, index) => <li key={`${suggestion.name}-${index}`}>
      <strong>{suggestion.name}</strong>
      <p>تحتاج {suggestion.missingIngredients.length} مكونات غير متوفرة. الحد الحالي: {suggestion.maxMissingIngredients}.</p>
      <p>الناقص: {suggestion.missingIngredients.join("، ")}</p>
    </li>)}</ul> : null}
    {issue.code === "ARABIC_GENERATION_DISABLED" ? <button type="button" className="mt-2 underline" onClick={() => void setLanguage("en")}>التبديل إلى الإنجليزية</button> : null}
  </InlineNotice>;
}
