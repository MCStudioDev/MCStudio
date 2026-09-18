"use client";

import { useApp } from "@/contexts/AppContext";
import { InlineNotice } from "@/components/ui/InlineNotice";

export function ErrorBanner({ handledMessage }: { handledMessage?: string | null }) {
  const { error, setError, rtl, t } = useApp();
  // A richer local notice owns this message (for example, ingredient corrections).
  if (!error || error === handledMessage) return null;
  return <InlineNotice role="alert" dir={rtl ? "rtl" : "ltr"}
    onDismiss={() => setError(null)} dismissLabel={t("dismissNotification")}>
    {error}
  </InlineNotice>;
}
