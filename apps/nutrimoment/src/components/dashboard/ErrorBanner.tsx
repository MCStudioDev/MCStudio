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
          <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-3 text-sm text-red-700 shadow-soft">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="focus-ring p-1 rounded-lg hover:bg-red-100 transition-ui"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
