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
    "text-white shadow-glow hover:shadow-soft transition-ui gradient-emerald hover:brightness-110 active:brightness-95",
  secondary:
    "bg-white text-emerald-700 border border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50 transition-ui",
  outline:
    "bg-transparent text-emerald-700 border border-emerald-300 hover:bg-emerald-50 transition-ui",
  ghost: "bg-transparent text-stone-700 hover:bg-stone-100 transition-ui",
  danger: "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-ui"
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
        "focus-ring inline-flex items-center justify-center gap-2 font-semibold tracking-tight",
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
