import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "إخلاء مسؤولية الذكاء الاصطناعي | NutriMoment",
  description: "حدود مهمة وإرشادات سلامة لمخرجات وصفات NutriMoment وخطط الوجبات."
};

const sections = [
  {
    title: "للاستخدام المعلوماتي فقط",
    body:
      "يوفر NutriMoment اقتراحات للوصفات والمخزون وتخطيط الوجبات لأغراض معلوماتية وعافية عامة فقط. لا يقدم نصيحة طبية أو تشخيصاً أو علاجاً أو إرشاداً للطوارئ."
  },
  {
    title: "حدود المخرجات",
    body:
      "قد تكون النتائج التي ينشئها الذكاء الاصطناعي أو يطابقها الكتالوج غير مكتملة أو قديمة أو غير دقيقة. قد تحتوي معرفة المكونات وتقديرات التغذية والتعامل مع الحساسية وخطوات الطبخ على أخطاء."
  },
  {
    title: "التحقق من المستخدم مطلوب",
    body:
      "أنت مسؤول عن التحقق من سلامة المكونات والحساسيات والبدائل وحجم الحصص ودرجات الحرارة الآمنة والقيم الغذائية ومدى ملاءمة الوصفة لظروفك قبل الطبخ أو الأكل."
  },
  {
    title: "الحالات الأعلى خطورة",
    body:
      "لا تعتمد على NutriMoment وحده في الحمل أو تغذية الأطفال أو اضطرابات الأكل أو الحساسية الشديدة أو إدارة الأمراض المزمنة أو تداخلات الأدوية أو أي قلق صحي عاجل. استشر مختصاً صحياً مؤهلاً في هذه الحالات."
  }
];

export default function DisclaimerPage() {
  return (
    <main className="min-h-screen bg-stone-50 px-6 py-12 text-stone-900">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="space-y-3">
          <Link href="/" className="text-sm font-semibold text-emerald-700 hover:text-emerald-900">
            العودة إلى NutriMoment
          </Link>
          <h1 className="text-4xl font-display font-bold tracking-tight">إخلاء مسؤولية الذكاء الاصطناعي</h1>
          <p className="text-base leading-relaxed text-stone-600">
            تشرح هذه الصفحة حدود NutriMoment حتى يتمكن المستخدمون من اتخاذ قرارات واعية قبل الاعتماد على مخرجات الوصفات أو تخطيط الوجبات.
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
