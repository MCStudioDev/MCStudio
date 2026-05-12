"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, X } from "lucide-react";
import { useApp } from "@/contexts/AppContext";

export function ErrorBanner() {
  const { error, setError } = useApp();
  return (
    <AnimatePresence>
      {error ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="fixed left-1/2 top-24 z-[200] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 sm:top-28"
        >
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm text-[#173a31] shadow-[0_24px_70px_-30px_rgba(16,58,48,0.38)]">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#0f8f7c]" aria-hidden="true" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="focus-ring rounded-lg p-1 text-[#4f6f66] transition-ui hover:bg-emerald-50 hover:text-[#173a31]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
