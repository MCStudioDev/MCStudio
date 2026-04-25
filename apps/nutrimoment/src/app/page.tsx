"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Apple,
  CalendarDays,
  Camera,
  ChefHat,
  Leaf,
  Scan,
  ShieldCheck,
  Sparkles,
  Utensils
} from "lucide-react";
import { Loader } from "@/components/ui/Loader";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import type { Language } from "@/lib/types";

interface LandingCopy {
  badge: string;
  heroLead: string;
  heroAccent: string;
  subtitle: string;
  languageLabel: string;
  languageHelper: string;
  languageDetected: string;
  trust: Array<{ value: string; label: string }>;
  preview: {
    eyebrow: string;
    recipeName: string;
    matchScore: string;
    matchLabel: string;
    macros: Array<{ label: string; value: string }>;
    flags: string[];
    ingredients: Array<{ name: string; have: boolean }>;
  };
  steps: Array<{
    title: string;
    description: string;
  }>;
  signIn: string;
  signInBusy: string;
  signInError: string;
  disclaimer: string;
  footer: {
    aiDisclaimer: string;
    privacy: string;
    terms: string;
    poweredBy: string;
  };
}

const LANDING_COPY: Record<Language, LandingCopy> = {
  en: {
    badge: "AI Fridge Scanner",
    heroLead: "Turn your fridge",
    heroAccent: "into healthier meals.",
    subtitle:
      "Snap a photo of what you have, and NutriMoment matches it to nourishing recipes tuned to your diet, allergens, and weekly plan.",
    languageLabel: "Language",
    languageHelper: "Pick your starting language. You can change it later.",
    languageDetected: "Active",
    trust: [
      { value: "60+", label: "Diet & health filters" },
      { value: "Allergen-safe", label: "Every recipe flagged" },
      { value: "~15s", label: "From snap to plate" }
    ],
    preview: {
      eyebrow: "Just scanned",
      recipeName: "Lemon herb chicken bowl",
      matchScore: "93",
      matchLabel: "Great fit for your pantry",
      macros: [
        { label: "Kcal", value: "512" },
        { label: "Protein", value: "38g" },
        { label: "Carbs", value: "44g" }
      ],
      flags: ["Gluten-free", "Low sodium", "High protein"],
      ingredients: [
        { name: "Chicken breast", have: true },
        { name: "Brown rice", have: true },
        { name: "Spinach", have: true },
        { name: "Lemon", have: true },
        { name: "Greek yogurt", have: false }
      ]
    },
    steps: [
      {
        title: "Snap your fridge",
        description: "One photo. AI reads the ingredients for you."
      },
      {
        title: "Get ranked recipes",
        description: "We match your pantry to recipes that fit your diet and goals."
      },
      {
        title: "Plan your week",
        description: "Build a weekly rhythm of meals with one tap, adjust anytime."
      }
    ],
    signIn: "Continue with Google",
    signInBusy: "Connecting...",
    signInError: "Sign-in was cancelled. Try again when you are ready.",
    disclaimer: "Informational support only. Verify allergens, nutrition, and food safety.",
    footer: {
      aiDisclaimer: "AI Disclaimer",
      privacy: "Privacy",
      terms: "Terms",
      poweredBy: "Powered by Gemini"
    }
  },
  ar: {
    badge: "ماسح المطبخ الذكي",
    heroLead: "حوّل ثلاجتك",
    heroAccent: "إلى وجبات صحية.",
    subtitle:
      "التقط صورة لما لديك، فيقترح لك نوتريمومنت وصفات متوازنة تناسب نظامك الغذائي والحساسية وخطة أسبوعك.",
    languageLabel: "اللغة",
    languageHelper: "اختر لغة البداية، ويمكنك تغييرها لاحقا.",
    languageDetected: "الحالية",
    trust: [
      { value: "+60", label: "فلتر تغذية وصحة" },
      { value: "آمن ضد الحساسية", label: "كل وصفة تُراجع" },
      { value: "~15ث", label: "من الصورة إلى الطبق" }
    ],
    preview: {
      eyebrow: "مسح جديد",
      recipeName: "وعاء دجاج بالليمون والأعشاب",
      matchScore: "93",
      matchLabel: "خيار ممتاز لمخزنك",
      macros: [
        { label: "سعرة", value: "512" },
        { label: "بروتين", value: "38غ" },
        { label: "كربوهيدرات", value: "44غ" }
      ],
      flags: ["خالٍ من الغلوتين", "صوديوم منخفض", "بروتين عالٍ"],
      ingredients: [
        { name: "صدر دجاج", have: true },
        { name: "أرز بني", have: true },
        { name: "سبانخ", have: true },
        { name: "ليمون", have: true },
        { name: "زبادي يوناني", have: false }
      ]
    },
    steps: [
      {
        title: "صوّر ثلاجتك",
        description: "صورة واحدة، والذكاء الاصطناعي يقرأ المكونات."
      },
      {
        title: "احصل على وصفات مرتبة",
        description: "نطابق مخزنك مع وصفات تناسب نظامك الغذائي."
      },
      {
        title: "خطط لأسبوعك",
        description: "ابنِ إيقاع وجبات أسبوعي بنقرة، وعدله وقت ما تريد."
      }
    ],
    signIn: "المتابعة باستخدام Google",
    signInBusy: "جارٍ الاتصال...",
    signInError: "تم إلغاء تسجيل الدخول. حاول مجددًا عندما تكون مستعدًا.",
    disclaimer: "الدعم هنا لأغراض معلوماتية فقط. تحقق دائمًا من الحساسية والقيم الغذائية وسلامة الطعام.",
    footer: {
      aiDisclaimer: "إخلاء مسؤولية الذكاء الاصطناعي",
      privacy: "الخصوصية",
      terms: "الشروط",
      poweredBy: "مدعوم بواسطة Gemini"
    }
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
      const rawMessage = err instanceof Error ? err.message : "Google sign-in failed";
      const isPopupClosed = rawMessage.includes("popup-closed-by-user");
      setError(isPopupClosed ? copy.signInError : rawMessage);
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

      <div id="main-content" className="shell-frame relative z-10 flex min-h-[calc(100vh-3rem)] w-full items-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex w-full flex-col gap-6"
        >
          <header className="floating-shell section-band flex flex-col gap-4 rounded-[1.6rem] p-4 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/" className="flex items-center gap-3">
              <span className="gradient-emerald flex h-11 w-11 items-center justify-center rounded-2xl shadow-glow">
                <ChefHat className="h-5 w-5 text-[#032019]" aria-hidden="true" />
              </span>
              <span className="font-display text-xl font-bold text-white">NutriMoment</span>
            </Link>
            <LanguageToggle copy={copy} language={language} setLanguage={setLanguage} compact />
          </header>

          <section className="floating-shell section-band rounded-[2.2rem] p-6 md:p-9 lg:p-11">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] lg:items-center">
              {/* Left column: hero copy + CTA */}
              <div className="flex flex-col gap-7">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-100">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    {copy.badge}
                  </span>
                  <motion.div
                    whileHover={{ rotate: 10, scale: 1.05 }}
                    transition={{ type: "spring", stiffness: 260, damping: 18 }}
                    className="gradient-emerald rounded-2xl p-2.5 shadow-glow"
                    aria-hidden="true"
                  >
                    <ChefHat className="h-5 w-5 text-[#032019]" />
                  </motion.div>
                </div>

                <div className="space-y-4">
                  <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl">
                    <span className="block">{copy.heroLead}</span>
                    <span className="text-gradient block">{copy.heroAccent}</span>
                  </h1>
                  <p className="max-w-xl text-base leading-relaxed text-emerald-50/75 md:text-lg">
                    {copy.subtitle}
                  </p>
                </div>

                <dl className="grid grid-cols-3 gap-3 rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4">
                  {copy.trust.map((item) => (
                    <div key={item.label} className="space-y-1">
                      <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
                        {item.label}
                      </dt>
                      <dd className="text-lg font-display font-semibold text-white">{item.value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSignIn}
                    disabled={signingIn}
                    className="focus-ring gradient-emerald shadow-glow flex h-14 items-center justify-center gap-3 rounded-2xl px-7 text-base font-semibold text-[#032019] transition-ui disabled:opacity-60"
                    aria-label={copy.signIn}
                  >
                    <GoogleIcon />
                    {signingIn ? copy.signInBusy : copy.signIn}
                  </motion.button>
                  <p className="max-w-xs text-xs leading-relaxed text-emerald-50/60">
                    {copy.disclaimer}
                  </p>
                </div>

                {error ? (
                  <div
                    role="alert"
                    className="flex items-start gap-3 rounded-2xl border border-rose-300/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-50/50">
                  <span>{copy.footer.poweredBy}</span>
                  <span aria-hidden="true">·</span>
                  <Link href="/legal/disclaimer" className="transition-ui hover:text-emerald-50">
                    {copy.footer.aiDisclaimer}
                  </Link>
                  <Link href="/legal/privacy" className="transition-ui hover:text-emerald-50">
                    {copy.footer.privacy}
                  </Link>
                  <Link href="/legal/terms" className="transition-ui hover:text-emerald-50">
                    {copy.footer.terms}
                  </Link>
                </div>
              </div>

              {/* Right column: phone mockup */}
              <div className="relative flex items-center justify-center">
                <div className="pointer-events-none absolute -left-6 top-6 h-40 w-40 rounded-full bg-emerald-400/20 blur-3xl" aria-hidden="true" />
                <div className="pointer-events-none absolute -right-4 bottom-8 h-36 w-36 rounded-full bg-cyan-400/20 blur-3xl" aria-hidden="true" />
                <PhoneMockup copy={copy} rtl={rtl} />
              </div>
            </div>
          </section>

          {/* How it works */}
          <section
            aria-label={language === "ar" ? "كيف يعمل" : "How it works"}
            className="floating-shell section-band rounded-[2rem] p-6 md:p-8"
          >
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
                  {language === "ar" ? "ثلاث خطوات" : "Three steps"}
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold text-white md:text-3xl">
                  {language === "ar" ? "من الثلاجة إلى الطبق" : "From fridge to plate"}
                </h2>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-50/70">
                <Scan className="h-3.5 w-3.5" aria-hidden="true" />
                {language === "ar" ? "بسيط" : "Simple flow"}
              </div>
            </div>

            <ol className="grid gap-4 md:grid-cols-3">
              {copy.steps.map((step, index) => (
                <StepCard
                  key={step.title}
                  index={index + 1}
                  title={step.title}
                  description={step.description}
                  icon={STEP_ICONS[index]}
                />
              ))}
            </ol>
          </section>

          {/* Language picker */}
          <section
            aria-label={copy.languageLabel}
            className="floating-shell section-band flex flex-col gap-3 rounded-[1.6rem] p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{copy.languageLabel}</p>
              <p className="text-sm text-emerald-50/65">{copy.languageHelper}</p>
            </div>
            <LanguageToggle copy={copy} language={language} setLanguage={setLanguage} />
          </section>

          {/* Visible app title for screen readers / SEO */}
          <p className="sr-only">{t("appTitle")}</p>
        </motion.div>
      </div>
    </main>
  );
}

const STEP_ICONS: ReactNode[] = [
  <Camera className="h-5 w-5" aria-hidden="true" key="camera" />,
  <Utensils className="h-5 w-5" aria-hidden="true" key="utensils" />,
  <CalendarDays className="h-5 w-5" aria-hidden="true" key="calendar" />
];

function LanguageToggle({
  copy,
  language,
  setLanguage,
  compact = false
}: {
  copy: LandingCopy;
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${compact ? "justify-start sm:justify-end" : ""}`}
      aria-label={copy.languageLabel}
    >
      {LANGUAGE_OPTIONS.map((option) => {
        const active = language === option.code;
        return (
          <button
            key={option.code}
            type="button"
            onClick={() => void setLanguage(option.code)}
            aria-pressed={active}
            className={`focus-ring rounded-full px-4 py-2 text-sm font-semibold transition-ui ${
              active
                ? "gradient-emerald text-[#032019] shadow-glow"
                : "border border-white/10 bg-white/[0.05] text-emerald-50/82 hover:bg-white/[0.1]"
            }`}
          >
            <span>{option.label}</span>
            {active ? <span className="sr-only"> {copy.languageDetected}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function StepCard({
  index,
  title,
  description,
  icon
}: {
  index: number;
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <li className="glass-card section-band relative rounded-[1.4rem] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-2xl bg-white/[0.08] p-2.5 text-cyan-100">{icon}</div>
        <span className="font-display text-3xl font-bold text-white/15 tabular-nums">
          0{index}
        </span>
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold text-white">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-emerald-50/68">{description}</p>
    </li>
  );
}

function PhoneMockup({ copy, rtl }: { copy: LandingCopy; rtl: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, rotate: -2 }}
      animate={{ opacity: 1, y: 0, rotate: -3 }}
      transition={{ duration: 0.7, delay: 0.15 }}
      whileHover={{ rotate: 0, y: -4 }}
      className="relative z-10 w-[19rem] max-w-full"
      style={{ transformStyle: "preserve-3d" }}
      aria-hidden="true"
    >
      <div className="relative rounded-[2.5rem] border border-white/15 bg-[linear-gradient(160deg,rgba(12,40,34,0.98)_0%,rgba(8,26,24,0.95)_60%,rgba(5,18,18,0.98)_100%)] p-3 shadow-[0_48px_120px_-40px_rgba(0,0,0,0.9),0_20px_60px_-30px_rgba(34,243,175,0.35)]">
        {/* Notch */}
        <div className="mx-auto mb-2 h-1.5 w-16 rounded-full bg-white/15" />

        <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_18%_12%,rgba(34,243,175,0.18),transparent_52%),linear-gradient(180deg,rgba(9,29,25,0.98),rgba(5,18,16,0.96))] p-4" dir={rtl ? "rtl" : "ltr"}>
          {/* Status bar */}
          <div className="mb-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-100/60">
            <span>9:41</span>
            <span className="flex items-center gap-1">
              <Leaf className="h-3 w-3" />
              NutriMoment
            </span>
          </div>

          {/* Recipe image placeholder */}
          <div className="relative h-32 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#1b5a43_0%,#28836b_45%,#3ab89c_100%)]">
            <div className="absolute inset-0 opacity-60 mix-blend-soft-light" style={{
              backgroundImage:
                "radial-gradient(circle at 22% 30%, rgba(255,221,130,0.6), transparent 45%), radial-gradient(circle at 78% 72%, rgba(255,245,200,0.45), transparent 40%)"
            }} />
            <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100 backdrop-blur">
              <Sparkles className="h-3 w-3" />
              {copy.preview.eyebrow}
            </div>
            <div className="absolute right-3 top-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400 text-[#052017] shadow-[0_8px_24px_-6px_rgba(34,243,175,0.8)]">
              <div className="text-center leading-tight">
                <div className="font-display text-base font-bold">{copy.preview.matchScore}</div>
                <div className="text-[8px] font-bold uppercase tracking-widest">fit</div>
              </div>
            </div>
            <div className="absolute bottom-2 left-3 right-3 flex items-center gap-2">
              <Apple className="h-4 w-4 text-emerald-50" />
              <span className="truncate text-xs font-semibold text-emerald-50">{copy.preview.matchLabel}</span>
            </div>
          </div>

          {/* Recipe name */}
          <h4 className="mt-3 font-display text-base font-bold leading-tight text-white">
            {copy.preview.recipeName}
          </h4>

          {/* Macros row */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {copy.preview.macros.map((m) => (
              <div
                key={m.label}
                className="rounded-xl border border-white/10 bg-white/[0.05] px-2 py-2 text-center"
              >
                <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-emerald-200/70">
                  {m.label}
                </div>
                <div className="mt-0.5 font-display text-sm font-semibold text-white">{m.value}</div>
              </div>
            ))}
          </div>

          {/* Flags */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {copy.preview.flags.map((flag) => (
              <span
                key={flag}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-100"
              >
                <ShieldCheck className="h-2.5 w-2.5" />
                {flag}
              </span>
            ))}
          </div>

          {/* Ingredient checklist */}
          <div className="mt-3 space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
            {copy.preview.ingredients.map((ing) => (
              <div key={ing.name} className="flex items-center justify-between text-xs">
                <span
                  className={ing.have ? "text-emerald-50/85" : "text-emerald-50/45 line-through"}
                >
                  {ing.name}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.15em] ${
                    ing.have
                      ? "bg-emerald-400/20 text-emerald-200"
                      : "bg-amber-400/15 text-amber-200"
                  }`}
                >
                  {ing.have ? (rtl ? "متوفر" : "Have") : rtl ? "ناقص" : "Need"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
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
