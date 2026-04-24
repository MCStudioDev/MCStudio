"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

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
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-[#020807]/70 px-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#081917]/96 p-6 text-emerald-50 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-amber-400/10 p-3 text-amber-100">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h2 id="confirm-dialog-title" className="text-xl font-display font-bold text-white">
              {title}
            </h2>
            <p className="text-sm leading-relaxed text-emerald-50/65">{description}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={() => void onConfirm()}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
