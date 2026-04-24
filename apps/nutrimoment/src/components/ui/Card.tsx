import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "soft" | "strong" | "plain";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant = "soft", ...rest },
  ref
) {
  const base =
    variant === "strong"
      ? "glass-card-strong"
      : variant === "plain"
        ? "bg-white/[0.08] border border-white/10 backdrop-blur-xl text-emerald-50"
        : "glass-card";
  return (
    <div ref={ref} className={cn("rounded-[1.75rem] p-5 md:p-6 text-emerald-50", base, className)} {...rest} />
  );
});
