import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANT_STYLES: Record<Variant, string> = {
  primary:
    "text-[#032019] shadow-glow hover:shadow-soft transition-ui gradient-emerald hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:brightness-95",
  secondary:
    "bg-white/[0.08] text-emerald-50 border border-white/12 hover:border-cyan-300/35 hover:bg-white/[0.12] transition-ui backdrop-blur-xl",
  outline:
    "bg-transparent text-cyan-100 border border-cyan-300/30 hover:bg-cyan-300/8 transition-ui",
  ghost: "bg-transparent text-emerald-50/78 hover:bg-white/[0.06] transition-ui",
  danger: "bg-red-500/12 text-red-100 border border-red-300/20 hover:bg-red-500/18 transition-ui"
};

const SIZE_STYLES: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-xl",
  md: "h-11 px-5 text-sm rounded-2xl",
  lg: "h-14 px-7 text-base rounded-2xl"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", leftIcon, rightIcon, loading, fullWidth, children, disabled, type, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "focus-ring inline-flex items-center justify-center gap-2 font-semibold tracking-tight will-change-transform",
        "disabled:opacity-60 disabled:cursor-not-allowed select-none",
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      {loading ? (
        <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
});
