import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | NutriMoment",
  description: "A concise overview of the data NutriMoment stores and how it is used."
};

const items = [
  "NutriMoment stores account details needed for authentication and profile settings.",
  "Pantry items, health preferences, saved recipes, and history may be stored in Firebase services so the app can personalize results.",
  "Uploaded images may be processed to extract ingredients or pantry items.",
  "NutriMoment should not be used to store sensitive medical records or emergency health information.",
  "If you no longer want your data retained, use the account deletion flow or contact the operator of your deployment."
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-stone-50 px-6 py-12 text-stone-900">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="space-y-3">
          <Link href="/" className="text-sm font-semibold text-emerald-700 hover:text-emerald-900">
            Back to NutriMoment
          </Link>
          <h1 className="text-4xl font-display font-bold tracking-tight">Privacy Policy</h1>
          <p className="text-base leading-relaxed text-stone-600">
            This summary describes the main categories of data a NutriMoment deployment may handle.
          </p>
        </div>

        <div className="rounded-[2rem] border border-stone-200 bg-white px-6 py-5 shadow-sm">
          <ul className="space-y-3 text-stone-600">
            {items.map((item) => (
              <li key={item} className="leading-relaxed">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
