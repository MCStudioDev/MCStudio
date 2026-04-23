import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  icon?: ReactNode;
}

export const Pill = forwardRef<HTMLButtonElement, PillProps>(function Pill(
  { active, icon, className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={active}
      className={cn(
        "focus-ring inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium",
        "transition-ui border whitespace-nowrap",
        active
          ? "gradient-emerald text-white border-transparent shadow-glow"
          : "bg-white/70 text-stone-700 border-emerald-100 hover:border-emerald-300 hover:bg-white",
        className
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});
