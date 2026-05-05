"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useApp } from "@/contexts/AppContext";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const { t, rtl } = useApp();
  const resolvedConfirmLabel = confirmLabel ?? (rtl ? "تأكيد" : t("confirm"));
  const resolvedCancelLabel = cancelLabel ?? (rtl ? "إلغاء" : t("cancel"));

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="theme-modal-backdrop fixed inset-0 z-[140] flex items-center justify-center p-4 bg-[#020807]/70 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={onCancel}
    >
      <div
        className="theme-modal-surface w-full max-w-md rounded-[2rem] border border-white/10 bg-[#081917]/96 p-6 text-emerald-50 shadow-2xl sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div className="theme-modal-icon rounded-2xl bg-amber-400/10 p-3 text-amber-100">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h2 id="confirm-dialog-title" className="theme-modal-title text-xl font-display font-bold text-white">
              {title}
            </h2>
            <p className="theme-modal-description text-sm leading-relaxed text-emerald-50/65">{description}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" className="theme-modal-button theme-modal-button-ghost" onClick={onCancel}>
            {resolvedCancelLabel}
          </Button>
          <Button variant="danger" className="theme-modal-button theme-modal-button-danger" onClick={() => void onConfirm()}>
            {resolvedConfirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
