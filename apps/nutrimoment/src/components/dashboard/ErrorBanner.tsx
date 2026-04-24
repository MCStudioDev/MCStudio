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
          className="fixed top-36 left-1/2 z-[90] w-[90%] max-w-md -translate-x-1/2 sm:top-36"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-red-200/16 bg-[#2a0d14]/92 px-4 py-3 text-sm text-red-50 shadow-soft">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="focus-ring rounded-lg p-1 transition-ui hover:bg-red-500/16"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
