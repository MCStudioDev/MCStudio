"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { itemVariants } from "@/lib/animations";
import { cn } from "@/lib/utils";

interface SectionHeroProps {
  title: string;
  description: string;
  eyebrow?: string;
  chips?: string[];
  icon?: ReactNode;
  stats?: Array<{ label: string; value: string }>;
  aside?: ReactNode;
  className?: string;
}

export function SectionHero({
  title,
  description,
  eyebrow = "NutriMoment pilot",
  chips = ["Responsive", "Guided", "Healthy"],
  icon,
  stats = [],
  aside,
  className
}: SectionHeroProps) {
  return (
    <motion.div variants={itemVariants}>
      <section
        className={cn(
          "section-band relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(115deg,rgba(7,19,21,0.98)_0%,rgba(8,29,30,0.94)_34%,rgba(9,45,39,0.88)_62%,rgba(7,24,36,0.94)_100%)] p-4 text-white shadow-soft md:p-5",
          className
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(139,255,217,0.12),transparent_28%),radial-gradient(circle_at_85%_80%,rgba(105,196,255,0.10),transparent_30%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(144,255,223,0.55),transparent)]" />

        <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(16rem,20rem)] lg:items-center">
          <div className="flex min-w-0 items-center gap-3">
            {icon ? (
              <div className="rounded-2xl border border-white/12 bg-white/[0.08] p-2.5 text-white shadow-glow ring-1 ring-white/15">
                {icon}
              </div>
            ) : null}

            <div className="min-w-0 space-y-1.5">
              <div className="inline-flex items-center rounded-full border border-emerald-200/18 bg-white/[0.05] px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-emerald-50/70">
                {eyebrow}
              </div>
              <h2 className="font-display text-xl font-bold tracking-tight text-white md:text-2xl">{title}</h2>
              <p className="max-w-2xl text-[13px] leading-relaxed text-emerald-50/65">{description}</p>
              {chips.length ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {chips.map((chip) => (
                    <HeroChip key={chip} label={chip} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {(stats.length || aside) ? (
            <div className="flex w-full flex-col gap-2 border-t border-white/10 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
              {stats.length ? (
                <div className="grid gap-1.5 grid-cols-3">
                  {stats.map((stat) => (
                    <div
                      key={`${stat.label}-${stat.value}`}
                      className="rounded-xl border border-white/10 bg-white/[0.05] px-2.5 py-2 backdrop-blur-xl"
                    >
                      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-200/85">{stat.label}</p>
                      <p className="mt-0.5 text-sm font-semibold text-white truncate">{stat.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {aside ? <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-[12px] backdrop-blur-xl">{aside}</div> : null}
            </div>
          ) : null}
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
    <Card className="rounded-[1.5rem] border border-dashed border-white/12 bg-white/[0.04] py-6 text-center">
      <div className="mx-auto max-w-md space-y-2">
        <h3 className="font-display text-lg font-bold text-white">{title}</h3>
        <p className="text-[13px] leading-relaxed text-emerald-50/65">{description}</p>
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    </Card>
  );
}

function HeroChip({ label }: { label: string }) {
  return (
    <div className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-50/70">
      {label}
    </div>
  );
}
