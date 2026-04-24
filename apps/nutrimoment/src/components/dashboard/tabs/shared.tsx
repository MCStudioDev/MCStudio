"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ChefHat, Salad, Sparkles, UtensilsCrossed } from "lucide-react";
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

const floatingAccents = [
  {
    Icon: ChefHat,
    className:
      "left-4 top-5 h-14 w-14 rounded-[1.6rem] bg-white/[0.07] text-emerald-50/70 shadow-[0_20px_40px_rgba(0,0,0,0.16)] md:left-8 md:top-7 md:h-16 md:w-16"
  },
  {
    Icon: UtensilsCrossed,
    className:
      "right-6 top-8 hidden h-12 w-12 rounded-[1.3rem] bg-cyan-300/10 text-cyan-100/65 md:flex"
  },
  {
    Icon: Salad,
    className:
      "bottom-10 right-12 hidden h-16 w-16 rounded-[1.8rem] bg-emerald-300/10 text-emerald-100/65 lg:flex"
  },
  {
    Icon: Sparkles,
    className:
      "bottom-8 left-10 h-10 w-10 rounded-full bg-white/[0.06] text-amber-100/60 md:left-[32%] md:h-11 md:w-11"
  }
] as const;

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
          "section-band relative overflow-hidden rounded-[2.25rem] border border-white/10 bg-[linear-gradient(115deg,rgba(7,19,21,0.98)_0%,rgba(8,29,30,0.94)_34%,rgba(9,45,39,0.88)_62%,rgba(7,24,36,0.94)_100%)] p-6 text-white shadow-soft md:p-8 lg:p-10",
          className
        )}
      >
        <div className="absolute inset-0 dashboard-grid opacity-30" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(139,255,217,0.18),transparent_24%),radial-gradient(circle_at_85%_80%,rgba(105,196,255,0.16),transparent_26%),linear-gradient(90deg,rgba(255,255,255,0.03),transparent_18%,transparent_82%,rgba(255,255,255,0.03))]" />
        <div className="absolute -left-10 top-3 h-24 w-24 rounded-full bg-emerald-200/10 blur-2xl" />
        <div className="absolute -right-8 bottom-0 h-32 w-32 rounded-full bg-cyan-200/10 blur-2xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(144,255,223,0.7),transparent)]" />
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {floatingAccents.map(({ Icon, className }, index) => (
            <motion.div
              key={index}
              className={cn(
                "absolute flex items-center justify-center border border-white/10 backdrop-blur-xl",
                className
              )}
              animate={{
                y: [0, index % 2 === 0 ? -12 : 12, 0],
                x: [0, index % 2 === 0 ? 8 : -8, 0],
                rotate: [0, index % 2 === 0 ? 8 : -8, 0]
              }}
              transition={{
                duration: 8 + index * 1.4,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut",
                delay: index * 0.45
              }}
            >
              <Icon className="h-6 w-6 md:h-7 md:w-7" strokeWidth={1.8} />
            </motion.div>
          ))}
        </div>

        <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,24rem)] xl:items-end">
          <div className="flex min-w-0 items-start gap-4">
            {icon ? (
              <div className="rounded-[1.55rem] border border-white/12 bg-white/12 p-3 text-white shadow-glow ring-1 ring-white/18">
                {icon}
              </div>
            ) : null}

            <div className="min-w-0 space-y-4">
              <div className="inline-flex items-center rounded-full border border-emerald-200/18 bg-white/[0.05] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-50/78">
                {eyebrow}
              </div>
              <div className="space-y-3">
                <h2 className="max-w-4xl text-3xl font-display font-bold tracking-tight text-white md:text-5xl">{title}</h2>
                <p className="max-w-3xl text-sm leading-relaxed text-emerald-50/72 md:text-base">{description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <HeroChip key={chip} label={chip} />
                ))}
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 border-t border-white/10 pt-5 xl:min-w-[19rem] xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
            {stats.length ? (
              <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                {stats.map((stat) => (
                  <div
                    key={`${stat.label}-${stat.value}`}
                    className="rounded-[1.45rem] border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-xl"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">{stat.label}</p>
                    <p className="mt-1 text-lg font-semibold text-white">{stat.value}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {aside ? <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.05] p-4 backdrop-blur-xl">{aside}</div> : null}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-6 bottom-0 h-20 bg-[radial-gradient(circle_at_center,rgba(86,255,210,0.16),transparent_60%)]" />
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
    <Card className="rounded-[2rem] border border-dashed border-white/12 bg-white/[0.04] py-10 text-center">
      <div className="mx-auto max-w-lg space-y-3">
        <h3 className="text-2xl font-display font-bold text-white">{title}</h3>
        <p className="text-sm leading-relaxed text-emerald-50/65">{description}</p>
        {action ? <div className="pt-2">{action}</div> : null}
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
