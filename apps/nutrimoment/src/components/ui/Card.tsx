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
        ? "bg-white border border-emerald-100"
        : "glass-card";
  return (
    <div ref={ref} className={cn("rounded-3xl p-5 md:p-6", base, className)} {...rest} />
  );
});
