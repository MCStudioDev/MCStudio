import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AI Disclaimer | NutriMoment",
  description: "Important limitations and safety guidance for NutriMoment recipe and meal-planning outputs."
};

const sections = [
  {
    title: "Informational only",
    body:
      "NutriMoment provides recipe, pantry, and meal-planning suggestions for informational and general wellness purposes only. It does not provide medical advice, diagnosis, treatment, or emergency guidance."
  },
  {
    title: "Output limitations",
    body:
      "AI-generated and catalog-matched results can be incomplete, outdated, or inaccurate. Ingredient identification, nutrition estimates, allergen handling, and cooking instructions may contain mistakes."
  },
  {
    title: "User verification required",
    body:
      "You are responsible for verifying ingredient safety, allergens, substitutions, portion sizes, safe temperatures, nutrition facts, and whether a recipe is appropriate for your own circumstances before cooking or eating."
  },
  {
    title: "Higher-risk situations",
    body:
      "Do not rely on NutriMoment alone for pregnancy, pediatric nutrition, eating disorders, severe allergies, chronic disease management, medication interactions, or any urgent health concern. Consult a qualified healthcare professional for those situations."
  }
];

export default function DisclaimerPage() {
  return (
    <main className="min-h-screen bg-stone-50 px-6 py-12 text-stone-900">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="space-y-3">
          <Link href="/" className="text-sm font-semibold text-emerald-700 hover:text-emerald-900">
            Back to NutriMoment
          </Link>
          <h1 className="text-4xl font-display font-bold tracking-tight">AI Disclaimer</h1>
          <p className="text-base leading-relaxed text-stone-600">
            This page explains the limits of NutriMoment so users can make informed decisions before relying on recipe
            or meal-planning output.
          </p>
        </div>

        {sections.map((section) => (
          <section key={section.title} className="rounded-[2rem] border border-stone-200 bg-white px-6 py-5 shadow-sm">
            <h2 className="text-xl font-semibold text-stone-900">{section.title}</h2>
            <p className="mt-2 leading-relaxed text-stone-600">{section.body}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
