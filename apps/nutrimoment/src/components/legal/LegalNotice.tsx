"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ShieldAlert, X } from "lucide-react";

const DISMISS_KEY = "nutrimoment-legal-banner-dismissed-v1";

export function AppLegalBanner() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(DISMISS_KEY) === "true";
  });

  const handleDismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
  };

  if (dismissed) {
    return null;
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-start justify-between gap-4 px-4 py-3 text-sm text-amber-950 sm:px-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div className="space-y-1">
            <p className="font-semibold">Informational use only</p>
            <p className="leading-relaxed text-amber-900">
              NutriMoment offers recipe and meal-planning support, not medical advice or guaranteed nutrition accuracy.
              Always verify allergens, ingredient suitability, food safety, and health impact before relying on any output.
            </p>
            <LegalLinksRow />
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-full p-1 text-amber-700 transition hover:bg-amber-100"
          aria-label="Dismiss legal notice"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function ResultLegalNotice({ mode }: { mode: "recipes" | "mealplan" }) {
  const message =
    mode === "recipes"
      ? "Generated recipes may miss allergens, substitutions, safe temperatures, or accurate nutrition values. Review the ingredients and cooking steps yourself before preparing food."
      : "Meal plans reflect saved preferences and pantry matches, but they are not individualized medical nutrition therapy. Review portions, allergies, medications, pregnancy, pediatric, and disease-specific needs with a qualified clinician.";

  return (
    <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-relaxed text-amber-950">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div className="space-y-2">
          <p className="font-semibold">Important safety notice</p>
          <p className="text-amber-900">{message}</p>
          <p className="text-amber-900">
            NutriMoment does not diagnose, treat, or prevent disease. Use results as planning support only.
          </p>
          <LegalLinksRow />
        </div>
      </div>
    </div>
  );
}

export function LegalLinksRow() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
      <Link href="/legal/disclaimer" className="hover:text-amber-900">
        AI Disclaimer
      </Link>
      <Link href="/legal/terms" className="hover:text-amber-900">
        Terms
      </Link>
      <Link href="/legal/privacy" className="hover:text-amber-900">
        Privacy
      </Link>
    </div>
  );
}
