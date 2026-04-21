import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | NutriMoment",
  description: "Core usage terms for NutriMoment."
};

const clauses = [
  "NutriMoment is provided for general informational and meal-planning support.",
  "You are responsible for reviewing every recipe, ingredient, and meal plan before use.",
  "Do not use NutriMoment as a substitute for professional medical, dietetic, or allergy advice.",
  "You agree not to rely on the service for emergencies or situations where inaccurate food guidance could create serious harm without independent verification.",
  "The operator may change, suspend, or remove features at any time."
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-stone-50 px-6 py-12 text-stone-900">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="space-y-3">
          <Link href="/" className="text-sm font-semibold text-emerald-700 hover:text-emerald-900">
            Back to NutriMoment
          </Link>
          <h1 className="text-4xl font-display font-bold tracking-tight">Terms of Service</h1>
          <p className="text-base leading-relaxed text-stone-600">
            These terms summarize how NutriMoment should be used and where responsibility stays with the user.
          </p>
        </div>

        <div className="rounded-[2rem] border border-stone-200 bg-white px-6 py-5 shadow-sm">
          <ol className="space-y-3 text-stone-600">
            {clauses.map((clause, index) => (
              <li key={clause} className="leading-relaxed">
                {index + 1}. {clause}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </main>
  );
}
