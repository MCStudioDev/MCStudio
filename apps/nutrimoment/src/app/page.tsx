"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  Camera,
  ChefHat,
  Heart,
  ShieldCheck,
  ShoppingBasket,
  Sparkles
} from "lucide-react";
import { Loader } from "@/components/ui/Loader";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import type { Language } from "@/lib/types";

const LANDING_COPY: Record<
  Language,
  {
    badge: string;
    subtitle: string;
    featureScan: string;
    featurePantry: string;
    featurePlan: string;
    languageLabel: string;
    languageHelper: string;
    languageDetected: string;
    scannerEyebrow: string;
    scannerTitle: string;
    scannerUpload: string;
    scannerHint: string;
    quickIngredients: string[];
    metricLabels: [string, string, string];
    metricValues: [string, string, string];
    signIn: string;
    signInBusy: string;
    disclaimer: string;
    panels: Array<{
      eyebrow: string;
      title: string;
      description: string;
      items: string[];
    }>;
  }
> = {
  en: {
    badge: "AI fridge scanner",
    subtitle:
      "AI-guided recipe and meal-planning support. Scan ingredients, build a pantry, and turn everyday groceries into healthier meal ideas with one calm workflow.",
    featureScan: "Scan ingredients",
    featurePantry: "Track pantry",
    featurePlan: "Plan meals",
    languageLabel: "Pilot language",
    languageHelper: "We choose a starting language from your browser or region, and you can switch it here before login.",
    languageDetected: "Current language",
    scannerEyebrow: "Scan ingredients",
    scannerTitle: "What ingredients do you have?",
    scannerUpload: "Upload a fridge or ingredient photo",
    scannerHint: "Preview the same scanner flow you get immediately after sign-in.",
    quickIngredients: ["Tomatoes", "Spinach", "Greek yogurt", "Oats"],
    metricLabels: ["Healthy choices", "Safer planning", "Fast workflow"],
    metricValues: ["Ranked by fit", "Allergen-aware", "Scan to recipes"],
    signIn: "Continue with Google",
    signInBusy: "Connecting...",
    disclaimer: "Informational support only. Always verify allergens, nutrition, and food safety.",
    panels: [
      {
        eyebrow: "Pantry intelligence",
        title: "Keep your kitchen updated",
        description:
          "Save quantities, watch what is running low, and use the same pantry data in recipes and weekly planning.",
        items: ["Brown rice - 2 cups", "Eggs - 6 items", "Chicken breast - 1.5 lb"]
      },
      {
        eyebrow: "Meal planning",
        title: "Get a healthier weekly rhythm",
        description:
          "Plan breakfast, lunch, and dinner around preferences, calorie targets, and what you already have.",
        items: ["Mon - Greek yogurt bowl", "Tue - Chickpea salad", "Wed - Lemon chicken rice"]
      },
      {
        eyebrow: "Health profile",
        title: "Personalize what gets suggested",
        description: "Set diets, conditions, and allergens so results stay more relevant and easier to trust.",
        items: ["Vegetarian", "Low sodium", "No peanuts"]
      }
    ]
  },
  ar: {
    badge: "ماسح المطبخ الذكي",
    subtitle:
      "مساعد وصفات وتخطيط وجبات بالذكاء الاصطناعي. امسح المكونات وابن مخزنك وحول مشترياتك اليومية إلى أفكار صحية في مسار واحد هادئ.",
    featureScan: "مسح المكونات",
    featurePantry: "متابعة المخزن",
    featurePlan: "تخطيط الوجبات",
    languageLabel: "لغة النسخة التجريبية",
    languageHelper: "نختار لغة البداية من المتصفح أو المنطقة، ويمكنك تغييرها هنا قبل تسجيل الدخول.",
    languageDetected: "اللغة الحالية",
    scannerEyebrow: "مسح المكونات",
    scannerTitle: "ما المكونات المتوفرة لديك؟",
    scannerUpload: "ارفع صورة للثلاجة أو المكونات",
    scannerHint: "هذه معاينة لنفس تجربة المسح التي تبدأ بها مباشرة بعد تسجيل الدخول.",
    quickIngredients: ["طماطم", "سبانخ", "زبادي يوناني", "شوفان"],
    metricLabels: ["خيارات صحية", "تخطيط أكثر أمانا", "مسار سريع"],
    metricValues: ["مرتبة حسب الملاءمة", "مراعية للحساسية", "من المسح إلى الوصفات"],
    signIn: "المتابعة باستخدام Google",
    signInBusy: "جار الاتصال...",
    disclaimer: "الدعم هنا لأغراض معلوماتية فقط. يرجى دائما التحقق من الحساسية والقيم الغذائية وسلامة الطعام.",
    panels: [
      {
        eyebrow: "ذكاء المخزن",
        title: "حافظ على مطبخك محدثا",
        description: "احفظ الكميات وتابع ما يوشك على النفاد واستخدم بيانات المخزن نفسها في الوصفات والخطة الأسبوعية.",
        items: ["أرز بني - كوبان", "بيض - 6 حبات", "صدر دجاج - 1.5 رطل"]
      },
      {
        eyebrow: "تخطيط الوجبات",
        title: "احصل على إيقاع أسبوعي صحي",
        description: "خطط للفطور والغداء والعشاء بناء على التفضيلات والسعرات وما لديك بالفعل.",
        items: ["الاثنين - وعاء زبادي يوناني", "الثلاثاء - سلطة حمص", "الأربعاء - أرز بالدجاج والليمون"]
      },
      {
        eyebrow: "الملف الصحي",
        title: "خصص ما يتم اقتراحه",
        description: "حدد الأنظمة والحالات الصحية ومسببات الحساسية ليبقى المحتوى أكثر ملاءمة وأسهل في الثقة.",
        items: ["نباتي", "صوديوم منخفض", "بدون فول سوداني"]
      }
    ]
  }
};

const LANGUAGE_OPTIONS: Array<{ code: Language; label: string }> = [
  { code: "en", label: "English" },
  { code: "ar", label: "العربية" }
];

export default function Landing() {
  const { user, loading, signInWithGoogle } = useAuth();
  const { rtl, language, setLanguage, t } = useApp();
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = LANDING_COPY[language];

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  const handleSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google sign-in failed";
      setError(message);
    } finally {
      setSigningIn(false);
    }
  };

  if (loading || !isMounted) {
    return (
      <div className="dashboard-shell flex min-h-screen items-center justify-center px-4">
        <Loader label="Checking your session..." />
      </div>
    );
  }

  if (user) {
    return (
      <div className="dashboard-shell flex min-h-screen items-center justify-center px-4">
        <Loader label="Redirecting to your kitchen..." />
      </div>
    );
  }

  return (
    <main
      className="dashboard-shell interactive-shell relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 sm:py-8"
      dir={rtl ? "rtl" : "ltr"}
      lang={language}
    >
      <div className="blob animate-blob left-[-5rem] top-10 h-56 w-56 bg-emerald-300/18" />
      <div className="blob animate-blob right-[-3rem] top-24 h-72 w-72 bg-cyan-300/14 [animation-delay:-4s]" />
      <div className="blob animate-blob bottom-0 left-[18%] h-52 w-52 bg-lime-200/10 [animation-delay:-8s]" />

      <div className="shell-frame relative z-10 flex min-h-[calc(100vh-3rem)] w-full items-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex w-full flex-col gap-6"
        >
          <section className="floating-shell section-band rounded-[2.2rem] p-6 md:p-8 lg:p-10">
            <div className="flex flex-col gap-8">
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-100/90">
                  {copy.badge}
                </div>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <motion.div
                    whileHover={{ rotate: 12, scale: 1.05 }}
                    transition={{ type: "spring", stiffness: 260, damping: 18 }}
                    className="gradient-emerald w-fit rounded-3xl p-4 shadow-glow"
                  >
                    <ChefHat className="h-9 w-9 text-white" />
                  </motion.div>
                  <div>
                    <h1 className="text-4xl font-display font-bold tracking-tight text-white md:text-5xl">
                      {t("appTitle")}
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-emerald-50/70 md:text-base">
                      {copy.subtitle}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{copy.languageLabel}</p>
                    <p className="text-sm text-emerald-50/62">{copy.languageHelper}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGE_OPTIONS.map((option) => (
                      <button
                        key={option.code}
                        type="button"
                        onClick={() => void setLanguage(option.code)}
                        aria-pressed={language === option.code}
                        className={`focus-ring rounded-full px-4 py-2 text-sm font-semibold transition-ui ${
                          language === option.code
                            ? "gradient-emerald text-[#032019] shadow-glow"
                            : "border border-white/10 bg-white/[0.05] text-emerald-50/82 hover:bg-white/[0.1]"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-50/42">
                  {copy.languageDetected}: {language === "ar" ? "العربية" : "English"}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Feature icon={<Camera className="h-4 w-4" />} label={copy.featureScan} />
                <Feature icon={<ShoppingBasket className="h-4 w-4" />} label={copy.featurePantry} />
                <Feature icon={<CalendarDays className="h-4 w-4" />} label={copy.featurePlan} />
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
                <div className="rounded-[1.85rem] border border-white/10 bg-[linear-gradient(135deg,rgba(8,24,22,0.8)_0%,rgba(10,49,42,0.56)_52%,rgba(8,32,45,0.78)_100%)] p-5 md:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{copy.scannerEyebrow}</p>
                      <h2 className="mt-2 text-2xl font-display font-bold text-white">{copy.scannerTitle}</h2>
                    </div>
                    <div className="rounded-2xl bg-white/[0.08] p-3 text-cyan-100">
                      <Sparkles className="h-5 w-5" />
                    </div>
                  </div>

                  <div className="mt-5 rounded-[1.5rem] border border-dashed border-white/12 bg-white/[0.04] px-6 py-8 text-center">
                    <Camera className="mx-auto h-8 w-8 text-cyan-200" />
                    <p className="mt-3 text-sm font-semibold text-white">{copy.scannerUpload}</p>
                    <p className="mt-1 text-xs text-emerald-50/55">{copy.scannerHint}</p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {copy.quickIngredients.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-emerald-50/78"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-1">
                  <PreviewMetric label={copy.metricLabels[0]} value={copy.metricValues[0]} icon={<Heart className="h-4 w-4" />} />
                  <PreviewMetric label={copy.metricLabels[1]} value={copy.metricValues[1]} icon={<ShieldCheck className="h-4 w-4" />} />
                  <PreviewMetric label={copy.metricLabels[2]} value={copy.metricValues[2]} icon={<ArrowRight className="h-4 w-4" />} />
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSignIn}
                  disabled={signingIn}
                  className="focus-ring gradient-emerald shadow-glow flex h-14 w-full items-center justify-center gap-3 rounded-2xl px-6 font-semibold text-[#032019] transition-ui disabled:opacity-60 sm:w-auto"
                  aria-label="Continue with Google"
                >
                  <GoogleIcon />
                  {signingIn ? copy.signInBusy : copy.signIn}
                </motion.button>
                <div className="text-xs leading-relaxed text-emerald-50/58">{copy.disclaimer}</div>
              </div>

              {error ? (
                <p className="text-sm text-red-200">{error}</p>
              ) : (
                <div className="flex flex-wrap gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-50/42">
                  <span>Powered by Gemini</span>
                  <Link href="/legal/disclaimer" className="transition-ui hover:text-emerald-50">
                    AI Disclaimer
                  </Link>
                  <Link href="/legal/privacy" className="transition-ui hover:text-emerald-50">
                    Privacy
                  </Link>
                  <Link href="/legal/terms" className="transition-ui hover:text-emerald-50">
                    Terms
                  </Link>
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {copy.panels.map((panel, index) => (
              <PreviewPanel
                key={panel.title}
                eyebrow={panel.eyebrow}
                title={panel.title}
                description={panel.description}
                items={panel.items}
                className={index === 2 ? "md:col-span-2 xl:col-span-1" : undefined}
              />
            ))}
          </section>
        </motion.div>
      </div>
    </main>
  );
}

function Feature({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[1.25rem] border border-white/10 bg-white/[0.05] px-4 py-4 backdrop-blur-xl">
      <div className="rounded-xl bg-white/[0.08] p-2 text-cyan-100">{icon}</div>
      <span className="text-sm font-semibold text-emerald-50/88">{label}</span>
    </div>
  );
}

function PreviewMetric({
  label,
  value,
  icon
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="glass-card section-band rounded-[1.6rem] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{label}</p>
          <p className="mt-2 text-xl font-semibold text-white">{value}</p>
        </div>
        <div className="rounded-2xl bg-white/[0.08] p-3 text-cyan-100">{icon}</div>
      </div>
    </div>
  );
}

function PreviewPanel({
  eyebrow,
  title,
  description,
  items,
  className
}: {
  eyebrow: string;
  title: string;
  description: string;
  items: string[];
  className?: string;
}) {
  return (
    <div className={`glass-card section-band rounded-[1.9rem] p-5 ${className ?? ""}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-display font-bold text-white">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-emerald-50/65">{description}</p>

      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <div
            key={item}
            className="rounded-[1rem] border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-medium text-emerald-50/82"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.2-1.5 3.6-5.5 3.6-3.3 0-6.1-2.7-6.1-6.1s2.8-6.1 6.1-6.1c1.9 0 3.2.8 4 1.5l2.7-2.6C17 2.8 14.7 2 12 2 6.9 2 2.8 6.1 2.8 11.2S6.9 20.4 12 20.4c6.9 0 9.2-4.8 9.2-7.3 0-.5-.1-.9-.1-1.3H12z" />
      <path fill="#34A853" d="M3.8 7.6l3.2 2.3c.9-1.7 2.7-2.9 5-2.9 1.9 0 3.2.8 4 1.5l2.7-2.6C17 2.8 14.7 2 12 2 8.5 2 5.5 4 3.8 7.6z" />
      <path fill="#FBBC05" d="M12 20.4c2.6 0 4.8-.9 6.5-2.4l-3-2.4c-.8.6-1.9 1.1-3.5 1.1-3.3 0-6-2.2-7-5.2l-3.3 2.6c1.7 3.4 5.3 5.7 10.3 5.7z" />
      <path fill="#4285F4" d="M21.2 13.1c0-.6-.1-1-.2-1.5H12v3.9h5.5c-.3 1.4-1.1 2.5-2.2 3.3l3 2.4c1.8-1.7 2.9-4.1 2.9-8.1z" />
    </svg>
  );
}
