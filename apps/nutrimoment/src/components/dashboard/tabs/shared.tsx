"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { itemVariants } from "@/lib/animations";

interface SectionHeroProps {
  title: string;
  description: string;
  icon?: ReactNode;
  className?: string;
}

export function SectionHero({ title, description, icon, className }: SectionHeroProps) {
  return (
    <motion.div variants={itemVariants}>
      <Card
        variant="strong"
        className={cn(
          "relative overflow-hidden rounded-[2rem] border border-emerald-200/70 bg-gradient-to-br from-[#17c89a] via-[#11b5a8] to-[#0f9fc2] p-6 md:p-8 text-white",
          className
        )}
      >
        <div className="absolute -left-10 top-3 h-24 w-24 rounded-full bg-white/10" />
        <div className="absolute -right-8 bottom-0 h-28 w-28 rounded-full bg-cyan-100/10" />
        <div className="relative flex items-start gap-4">
          {icon ? <div className="rounded-2xl bg-white/15 p-3">{icon}</div> : null}
          <div className="space-y-2">
            <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight">{title}</h2>
            <p className="max-w-2xl text-sm md:text-base text-emerald-50/95 leading-relaxed">{description}</p>
          </div>
        </div>
      </Card>
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
