"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { itemVariants } from "@/lib/animations";
import { Card } from "@/components/ui/Card";

interface SectionHeroProps {
  title: string;
  description: string;
  icon?: ReactNode;
  className?: string;
}

export function SectionHero({ title, description, icon, className }: SectionHeroProps) {
  return (
    <motion.div variants={itemVariants}>
      <section
        className={cn(
          "relative overflow-hidden rounded-[2rem] border border-emerald-700/15 bg-[#0d9488] p-6 text-white shadow-soft md:p-8",
          className
        )}
      >
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#047857_0%,#0f766e_48%,#0e7490_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.22),transparent_28%),radial-gradient(circle_at_88%_82%,rgba(255,255,255,0.14),transparent_30%)]" />
        <div className="absolute -left-10 top-3 h-24 w-24 rounded-full bg-white/10" />
        <div className="absolute -right-8 bottom-0 h-28 w-28 rounded-full bg-cyan-100/10" />
        <div className="relative flex items-start gap-4">
          {icon ? <div className="rounded-2xl bg-white/15 p-3 text-white shadow-sm ring-1 ring-white/20">{icon}</div> : null}
          <div className="space-y-2">
            <h2 className="text-3xl font-display font-bold tracking-tight text-white md:text-4xl">{title}</h2>
            <p className="max-w-2xl text-sm leading-relaxed text-white/95 md:text-base">{description}</p>
          </div>
        </div>
      </section>
    </motion.div>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <Card className="rounded-[2rem] border border-dashed border-emerald-200 bg-white/75 text-center py-10">
      <div className="mx-auto max-w-lg space-y-3">
        <h3 className="text-2xl font-display font-bold text-stone-900">{title}</h3>
        <p className="text-sm text-stone-600 leading-relaxed">{description}</p>
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    </Card>
  );
}
