import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "شروط الخدمة | NutriMoment",
  description: "شروط الاستخدام الأساسية لـ NutriMoment."
};

const clauses = [
  "يتم توفير NutriMoment لدعم معلوماتي عام وتخطيط الوجبات.",
  "أنت مسؤول عن مراجعة كل وصفة ومكون وخطة وجبات قبل الاستخدام.",
  "لا تستخدم NutriMoment بديلاً عن النصيحة الطبية أو التغذوية أو نصائح الحساسية من مختص.",
  "توافق على عدم الاعتماد على الخدمة في الطوارئ أو الحالات التي قد يؤدي فيها الإرشاد الغذائي غير الدقيق إلى ضرر خطير دون تحقق مستقل.",
  "قد يغيّر المشغل الميزات أو يعلّقها أو يزيلها في أي وقت."
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-stone-50 px-6 py-12 text-stone-900">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="space-y-3">
          <Link href="/" className="text-sm font-semibold text-emerald-700 hover:text-emerald-900">
            العودة إلى NutriMoment
          </Link>
          <h1 className="text-4xl font-display font-bold tracking-tight">شروط الخدمة</h1>
          <p className="text-base leading-relaxed text-stone-600">
            تلخص هذه الشروط كيفية استخدام NutriMoment وأين تبقى المسؤولية على المستخدم.
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
