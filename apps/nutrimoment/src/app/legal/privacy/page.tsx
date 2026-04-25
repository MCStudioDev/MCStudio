import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "سياسة الخصوصية | NutriMoment",
  description: "نظرة موجزة على البيانات التي يخزنها NutriMoment وكيفية استخدامها."
};

const items = [
  "يخزن NutriMoment تفاصيل الحساب المطلوبة لتسجيل الدخول وإعدادات الملف الشخصي.",
  "قد يتم تخزين عناصر المخزون والتفضيلات الصحية والوصفات المحفوظة والسجل في خدمات Firebase حتى يتمكن التطبيق من تخصيص النتائج.",
  "قد تتم معالجة الصور المرفوعة لاستخراج المكونات أو عناصر المخزون.",
  "لا ينبغي استخدام NutriMoment لتخزين سجلات طبية حساسة أو معلومات صحية طارئة.",
  "إذا لم تعد ترغب في الاحتفاظ ببياناتك، فاستخدم مسار حذف الحساب أو تواصل مع مشغل نسختك من التطبيق."
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-stone-50 px-6 py-12 text-stone-900">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="space-y-3">
          <Link href="/" className="text-sm font-semibold text-emerald-700 hover:text-emerald-900">
            العودة إلى NutriMoment
          </Link>
          <h1 className="text-4xl font-display font-bold tracking-tight">سياسة الخصوصية</h1>
          <p className="text-base leading-relaxed text-stone-600">
            يصف هذا الملخص الفئات الرئيسية من البيانات التي قد تتعامل معها نسخة NutriMoment.
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
