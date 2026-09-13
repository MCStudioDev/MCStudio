"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { MealRevealCard } from "../MealRevealCard";
import type { RecipeImageSource } from "@/lib/types";

type Props = ComponentProps<typeof MealRevealCard>;
type Photo = { imageUrl: string; imageSource?: RecipeImageSource };
const pending = new Map<string, Promise<Photo>>();
const queue: Array<() => void> = [];
let active = 0;
async function queued<T>(task: () => Promise<T>): Promise<T> {
  if (active >= 3) await new Promise<void>(resolve => queue.push(resolve));
  active++;
  try { return await task(); } finally { active--; queue.shift()?.(); }
}
function loadPhoto(key: string, recipeId: string, actionGrantId: string | undefined, headers: () => Promise<Record<string, string>>) {
  const existing = pending.get(key);
  if (existing) return existing;
  const request = queued(async () => {
    const response = await fetch("/api/ar/recipe-photo", { method: "POST", headers: { "Content-Type": "application/json", ...await headers() },
      body: JSON.stringify({ recipeId, actionGrantId }), signal: AbortSignal.timeout(90000) });
    const value = await response.json();
    if (!response.ok || typeof value.imageUrl !== "string" || !/^https:\/\//.test(value.imageUrl)) throw new Error(typeof value.error === "string" ? value.error : "تعذر تحميل صورة مطابقة للوصفة. حاول مجددا.");
    return { imageUrl: value.imageUrl, imageSource: value.imageSource } as Photo;
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
  const [photo, setPhoto] = useState<Photo>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [visible, setVisible] = useState(typeof IntersectionObserver === "undefined");
  const container = useRef<HTMLDivElement>(null);
  const headerRef = useRef(getAuthHeaders); headerRef.current = getAuthHeaders;
  const dietKey = [...(props.imageDiets ?? [])].sort().join("|");
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
    setBusy(true); setError(""); setPhoto(undefined);
    const key = `${uid}:${props.arabicRecipeId}:${dietKey}:${props.imageActionGrantId ?? ""}`;
    void loadPhoto(key, props.arabicRecipeId!, props.imageActionGrantId, () => headerRef.current())
      .then(value => { if (current) setPhoto(value); })
      .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : "تعذر تحميل الصورة. حاول مجددا."); })
      .finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [uid, loading, visible, props.arabicRecipeId, props.imageActionGrantId, dietKey, retry]);
  return <div ref={container} className="min-h-full" dir="rtl">
    <MealRevealCard {...props} arabicRecipeId={undefined} readOnlyImage disableAutoImageLookup trustProvidedImage
      imageUrl={photo?.imageUrl} imageSource={photo?.imageSource} imageLoading={busy || !visible} imageError={Boolean(error)}
      recipeSource={props.recipeSource ?? "generated"} onImageResolved={undefined} />
    {error ? <div role="status" className="mt-2 rounded-xl border border-amber-300/40 bg-amber-50/70 p-3 text-sm text-amber-950">
      <p>{error}</p><button type="button" className="mt-2 underline" onClick={() => setRetry(value => value + 1)}>حاول تحميل الصورة مجددا</button>
    </div> : null}
  </div>;
}
