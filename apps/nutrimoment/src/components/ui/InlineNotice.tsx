import type { ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Persistent feedback in the page flow, shared by English and Arabic views. */
export function InlineNotice({ children, className, dir, role = "status", onDismiss, dismissLabel, icon }: {
  children: ReactNode;
  className?: string;
  dir?: "rtl" | "ltr";
  role?: "alert" | "status";
  onDismiss?: () => void;
  dismissLabel?: string;
  icon?: ReactNode;
}) {
  return (
    <div role={role} aria-live={role === "alert" ? "assertive" : "polite"} aria-atomic="true" dir={dir}
      className={cn("flex items-start gap-3 rounded-xl border border-[#f3d477] bg-[#fffbeb] px-4 py-3 text-start text-sm leading-relaxed text-[#713f12]", className)}>
      {icon ?? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />}
      <div className="min-w-0 flex-1 break-words">{children}</div>
      {onDismiss ? <button type="button" onClick={onDismiss} aria-label={dismissLabel}
        className="focus-ring shrink-0 rounded-lg p-1 transition-ui hover:bg-[#fef3c7]">
        <X className="h-4 w-4" aria-hidden="true" />
      </button> : null}
    </div>
  );
}
