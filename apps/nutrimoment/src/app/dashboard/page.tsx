"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { Loader } from "@/components/ui/Loader";
import { NutriMomentApp } from "@/components/dashboard/NutriMomentApp";

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const { t, rtl, language } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir={rtl ? "rtl" : "ltr"} lang={language}>
        <Loader label={rtl ? "جار تجهيز مطبخك..." : t("loadingKitchen")} />
      </div>
    );
  }

  return <DashboardShell />;
}

function DashboardShell() {
  const { rtl, language } = useApp();
  return (
    <div className="min-h-screen" dir={rtl ? "rtl" : "ltr"} lang={language}>
      <NutriMomentApp />
    </div>
  );
}
