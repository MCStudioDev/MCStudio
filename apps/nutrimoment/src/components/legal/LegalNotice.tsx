"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ShieldAlert, X } from "lucide-react";
import { useApp } from "@/contexts/AppContext";

const DISMISS_KEY = "nutrimoment-legal-banner-dismissed-v1";

export function AppLegalBanner() {
  const { t } = useApp();
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
    <div className="px-3 pb-2 sm:px-4 sm:pb-3">
      <div className="shell-frame">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-300/25 bg-amber-400/8 px-3 py-2 text-[12px] text-amber-100/90 backdrop-blur sm:px-4">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
            <p className="leading-snug">
              <span className="font-semibold text-amber-100">{t("informationalOnly")}</span>{" "}
              <span className="text-amber-100/75">{t("legalBannerText")}</span>
              <span className="ms-2 hidden sm:inline-flex"><LegalLinksRow inline /></span>
            </p>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="focus-ring flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-amber-200/70 transition hover:bg-amber-300/15 hover:text-amber-100"
            aria-label={t("dismissLegalNotice")}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ResultLegalNotice({ mode }: { mode: "recipes" | "mealplan" }) {
  const { t } = useApp();
  const message = mode === "recipes" ? t("recipeSafetyNotice") : t("mealPlanSafetyNotice");

  return (
    <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-relaxed text-amber-950">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div className="space-y-2">
          <p className="font-semibold">{t("importantSafetyNotice")}</p>
          <p className="text-amber-900">{message}</p>
          <p className="text-amber-900">{t("legalFooterText")}</p>
          <LegalLinksRow />
        </div>
      </div>
    </div>
  );
}

interface LegalLinksRowProps {
  inline?: boolean;
}

export function LegalLinksRow({ inline = false }: LegalLinksRowProps) {
  const { t } = useApp();
  const linkClass = inline
    ? "text-amber-200/80 hover:text-amber-100 transition"
    : "text-amber-700 hover:text-amber-900";

  return (
    <span
      className={
        inline
          ? "inline-flex flex-wrap gap-x-3 text-[10px] font-semibold uppercase tracking-[0.18em]"
          : "flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-700"
      }
    >
      <Link href="/legal/disclaimer" className={linkClass}>
        {t("aiDisclaimerShort")}
      </Link>
      <Link href="/legal/terms" className={linkClass}>
        {t("termsShort")}
      </Link>
      <Link href="/legal/privacy" className={linkClass}>
        {t("privacyShort")}
      </Link>
    </span>
  );
}
