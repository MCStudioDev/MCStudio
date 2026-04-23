"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ChevronUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MealRevealSection {
  title: string;
  items: string[];
  tone?: "have" | "need" | "steps";
}

interface MealRevealCardProps {
  name: string;
  imageUrl?: string;
  imageLoading?: boolean;
  imageError?: boolean;
  imageQuery?: string;
  eyebrow?: string;
  stats?: Array<{ label: string; value: string | number | undefined }>;
  sections?: MealRevealSection[];
  className?: string;
}

export function MealRevealCard({
  name,
  imageUrl,
  imageLoading,
  imageError,
  imageQuery,
  eyebrow,
  stats = [],
  sections = [],
  className
}: MealRevealCardProps) {
  const [lookedUpImage, setLookedUpImage] = useState<string>("");
  const [lookupFailed, setLookupFailed] = useState(false);
  const resolvedImage = imageUrl || lookedUpImage;

  useEffect(() => {
    if (imageUrl || !imageQuery || lookedUpImage || lookupFailed) return;

    let cancelled = false;

    fetch(`/api/recipe-photo?query=${encodeURIComponent(imageQuery)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { imageUrl?: string } | null) => {
        if (cancelled) return;

        if (data?.imageUrl) {
          setLookedUpImage(data.imageUrl);
        } else {
          setLookupFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLookupFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [imageQuery, imageUrl, lookedUpImage, lookupFailed]);

  const visibleStats = useMemo(
    () => stats.filter((stat) => stat.value !== undefined && stat.value !== ""),
    [stats]
  );

  return (
    <article
      tabIndex={0}
      className={cn(
        "focus-ring group relative overflow-hidden rounded-[1.5rem] border border-white/70 bg-stone-950 shadow-soft transition-ui hover:-translate-y-1 hover:shadow-xl",
        className
      )}
    >
      <div className="relative min-h-[21rem]">
        {resolvedImage ? (
          <Image
            src={resolvedImage}
            alt={name}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-[transform,filter] duration-500 group-hover:scale-105 group-hover:brightness-75 group-focus-within:scale-105 group-focus-within:brightness-75"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.45),transparent_32%),linear-gradient(135deg,#134e4a,#1c1917_62%,#78350f)]" />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/45 to-transparent" />

        {imageLoading ? (
          <div className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-700">
            Finding photo
          </div>
        ) : null}

        {imageError || lookupFailed ? (
          <div className="absolute right-4 top-4 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">
            No exact photo
          </div>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 space-y-4 p-5 text-white">
          <div className="space-y-2">
            {eyebrow ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100">{eyebrow}</p>
            ) : null}
            <h3 className="text-2xl font-display font-bold leading-tight drop-shadow-sm">{name}</h3>
          </div>

          <div className="max-h-0 space-y-4 overflow-hidden opacity-0 transition-[max-height,opacity] duration-300 group-hover:max-h-[26rem] group-hover:opacity-100 group-focus-within:max-h-[26rem] group-focus-within:opacity-100">
            {visibleStats.length ? (
              <div className="grid grid-cols-2 gap-2">
                {visibleStats.slice(0, 4).map((stat) => (
                  <div key={`${stat.label}-${stat.value}`} className="rounded-2xl bg-white/14 px-3 py-2 backdrop-blur-md">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/65">{stat.label}</p>
                    <p className="text-sm font-semibold tabular-nums">{stat.value}</p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
              {sections
                .filter((section) => section.items.length)
                .map((section) => (
                  <div key={section.title} className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">{section.title}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {section.items.slice(0, section.tone === "steps" ? 4 : 8).map((item, index) => (
                        <span
                          key={`${section.title}-${index}-${item}`}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-semibold",
                            section.tone === "have" && "bg-emerald-300/20 text-emerald-50",
                            section.tone === "need" && "bg-amber-200/20 text-amber-50",
                            section.tone === "steps" && "bg-white/12 text-white/90"
                          )}
                        >
                          {section.tone === "steps" ? `${index + 1}. ${item}` : item}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-white/75">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Hover for details
            </span>
            <ChevronUp className="h-4 w-4 transition-transform group-hover:rotate-180 group-focus-within:rotate-180" aria-hidden="true" />
          </div>
        </div>
      </div>
    </article>
  );
}
