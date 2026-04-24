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
        "focus-ring inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium backdrop-blur-xl",
        "transition-ui border whitespace-nowrap",
        active
          ? "gradient-emerald text-[#032019] border-transparent shadow-glow"
          : "bg-white/[0.06] text-emerald-50/85 border-white/10 hover:border-cyan-300/30 hover:bg-white/[0.10]",
        className
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});
