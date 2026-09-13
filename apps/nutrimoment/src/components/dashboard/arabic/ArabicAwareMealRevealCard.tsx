"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { MealRevealCard } from "../MealRevealCard";
import type { RecipeImageSource } from "@/lib/types";

type Props = ComponentProps<typeof MealRevealCard>;
type Photo = { imageUrl: string; imageSource?: RecipeImageSource; imageAttributionName?: string; imageAttributionUrl?: string };
const pending = new Map<string, Promise<Photo>>();
const queue: Array<() => void> = [];
let active = 0;
async function queued<T>(task: () => Promise<T>): Promise<T> {
  if (active >= 3) await new Promise<void>(resolve => queue.push(resolve));
  else active++;
  try { return await task(); } finally { const next = queue.shift(); if (next) next(); else active--; }
}
function loadPhoto(key: string, recipeId: string, actionGrantId: string | undefined, headers: () => Promise<Record<string, string>>) {
  const existing = pending.get(key);
  if (existing) return existing;
  const request = queued(async () => {
    for (let attempt = 0; attempt < 12; attempt++) {
    const response = await fetch("/api/ar/recipe-photo", { method: "POST", headers: { "Content-Type": "application/json", ...await headers() },
      body: JSON.stringify({ recipeId, actionGrantId }), signal: AbortSignal.timeout(90000) });
    const value = await response.json();
    if (response.status === 202 && value.code === "ARABIC_IMAGE_PENDING") {
      await new Promise(resolve => setTimeout(resolve, 4000)); continue;
    }
    if (!response.ok || typeof value.imageUrl !== "string" || !/^https:\/\//.test(value.imageUrl)) throw new Error(typeof value.error === "string" ? value.error : "تعذر تحميل صورة مطابقة للوصفة. حاول مجددا.");
    return { imageUrl: value.imageUrl, imageSource: value.imageSource, imageAttributionName: value.imageAttributionName, imageAttributionUrl: value.imageAttributionUrl } as Photo;
    }
    throw new Error("الصورة ما زالت قيد الإعداد. حاول تحميلها بعد قليل.");
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

export function ArabicAwareMealRevealCard(props: Props) {
  return props.arabicRecipeId ? <ArabicRecipeCard key={props.arabicRecipeId} {...props} /> : <MealRevealCard {...props} />;
}
function ArabicRecipeCard(props: Props) {
  const { user, loading, getAuthHeaders } = useAuth();
  const uid = user?.uid;
  const [result, setResult] = useState<{ key: string; photo?: Photo; error?: string }>();
  const [retry, setRetry] = useState(0);
  const [visible, setVisible] = useState(typeof IntersectionObserver === "undefined");
  const container = useRef<HTMLDivElement>(null);
  const headerRef = useRef(getAuthHeaders);
  useEffect(() => { headerRef.current = getAuthHeaders; }, [getAuthHeaders]);
  const dietKey = [...(props.imageDiets ?? [])].sort().join("|");
  const key = `${uid}:${props.arabicRecipeId}:${dietKey}:${props.imageActionGrantId ?? ""}:${retry}`;
  const currentResult = result?.key === key ? result : undefined;
  const photo = currentResult?.photo, error = currentResult?.error;
  const busy = !currentResult;
  useEffect(() => {
    if (!container.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "300px" });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let current = true;
    if (!uid || loading || !visible) return;
    // Never trust a supplied URL until this Arabic ID is revalidated against
    // current saved restrictions and source fingerprints on the server.
    void loadPhoto(key, props.arabicRecipeId!, props.imageActionGrantId, () => headerRef.current())
      .then(value => { if (current) setResult({ key, photo: value }); })
      .catch(reason => { if (current) setResult({ key, error: reason instanceof Error ? reason.message : "تعذر تحميل الصورة. حاول مجددا." }); });
    return () => { current = false; };
  }, [uid, loading, visible, props.arabicRecipeId, props.imageActionGrantId, key]);
  return <div ref={container} className="min-h-full" dir="rtl" onErrorCapture={event => { if ((event.target as HTMLElement).tagName === "IMG") setResult({ key, error: "تعذر عرض صورة الوصفة. حاول تحميلها مجددا." }); }}>
    <MealRevealCard key={retry} {...props} arabicRecipeId={undefined} readOnlyImage disableAutoImageLookup trustProvidedImage
      imageUrl={photo?.imageUrl} imageSource={photo?.imageSource} imageLoading={busy || !visible} imageError={Boolean(error)}
      imageAttributionName={photo?.imageAttributionName} imageAttributionUrl={photo?.imageAttributionUrl}
      recipeSource={props.recipeSource ?? "generated"} onImageResolved={undefined} />
    {error ? <div role="status" className="mt-2 rounded-xl border border-amber-300/40 bg-amber-50/70 p-3 text-sm text-amber-950">
      <p>{error}</p><button type="button" className="mt-2 underline" onClick={() => setRetry(value => value + 1)}>حاول تحميل الصورة مجددا</button>
    </div> : null}
  </div>;
}
