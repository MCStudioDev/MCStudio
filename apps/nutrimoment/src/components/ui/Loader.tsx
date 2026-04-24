import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoaderProps {
  label?: string;
  sub?: string;
  className?: string;
}

export function Loader({ label, sub, className }: LoaderProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-10", className)}>
      <div className="relative">
        <div className="absolute inset-0 rounded-full gradient-emerald blur-xl opacity-50 animate-pulse" />
        <div className="relative h-14 w-14 rounded-full gradient-emerald flex items-center justify-center text-white shadow-glow">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      </div>
      {label ? <p className="text-sm font-semibold text-emerald-50">{label}</p> : null}
      {sub ? <p className="max-w-xs text-center text-xs text-emerald-50/58">{sub}</p> : null}
    </div>
  );
}
