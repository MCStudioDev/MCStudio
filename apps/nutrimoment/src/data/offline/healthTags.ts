import type { HealthTagDoc } from "@/lib/domain";

export const OFFLINE_HEALTH_TAGS: HealthTagDoc[] = [
  {
    id: "condition-diabetes-friendly",
    type: "condition_support",
    label: "diabetes-friendly",
    description: "Favors lower glycemic load, steadier carbohydrates, and balanced protein.",
    localized: {
      English: {
        label: "diabetes-friendly",
        description: "Favors lower glycemic load, steadier carbohydrates, and balanced protein."
      },
      Arabic: {
        label: "مناسب لمرضى السكري",
        description: "يركز على حمل سكري أقل وكربوهيدرات أكثر توازنا مع بروتين مناسب."
      }
    },
    isActive: true
  },
  {
    id: "condition-low-sodium",
    type: "condition_support",
    label: "low-sodium",
    description: "Supports lower sodium meals for hypertension and heart-health goals.",
    localized: {
      English: {
        label: "low-sodium",
        description: "Supports lower sodium meals for hypertension and heart-health goals."
      },
      Arabic: {
        label: "منخفض الصوديوم",
        description: "يدعم الوجبات الأقل صوديومًا لمراعاة الضغط وصحة القلب."
      }
    },
    isActive: true
  },
  {
    id: "condition-high-protein",
    type: "nutrition_claim",
    label: "high-protein",
    description: "Provides stronger protein density per serving.",
    localized: {
      English: {
        label: "high-protein",
        description: "Provides stronger protein density per serving."
      },
      Arabic: {
        label: "عالي البروتين",
        description: "يوفر كثافة بروتين أعلى في الحصة."
      }
    },
    isActive: true
  },
  {
    id: "condition-heart-healthy",
    type: "condition_support",
    label: "heart-healthy",
    description: "Prioritizes balanced fats, moderate sodium, and fiber-friendly ingredients.",
    localized: {
      English: {
        label: "heart-healthy",
        description: "Prioritizes balanced fats, moderate sodium, and fiber-friendly ingredients."
      },
      Arabic: {
        label: "صديق لصحة القلب",
        description: "يركز على الدهون المتوازنة والصوديوم المعتدل والمكونات الغنية بالألياف."
      }
    },
    isActive: true
  },
  {
    id: "condition-renal-friendly",
    type: "condition_support",
    label: "renal-friendly",
    description: "Reserved for recipes reviewed to better fit kidney-conscious meal patterns.",
    localized: {
      English: {
        label: "renal-friendly",
        description: "Reserved for recipes reviewed to better fit kidney-conscious meal patterns."
      },
      Arabic: {
        label: "مناسب للكلى",
        description: "يستخدم للوصفات التي تمت مراجعتها لتناسب الأنماط الغذائية المراعية للكلى."
      }
    },
    isActive: true
  },
  {
    id: "caution-high-potassium",
    type: "caution",
    label: "high-potassium",
    description: "May require caution for users managing potassium intake.",
    localized: {
      English: {
        label: "high-potassium",
        description: "May require caution for users managing potassium intake."
      },
      Arabic: {
        label: "مرتفع البوتاسيوم",
        description: "قد يحتاج إلى حذر لمن يراقبون تناول البوتاسيوم."
      }
    },
    isActive: true
  },
  {
    id: "caution-high-purine",
    type: "caution",
    label: "high-purine",
    description: "May require caution for gout-sensitive diets.",
    localized: {
      English: {
        label: "high-purine",
        description: "May require caution for gout-sensitive diets."
      },
      Arabic: {
        label: "مرتفع البيورين",
        description: "قد يحتاج إلى حذر لمن يتبعون حمية تراعي النقرس."
      }
    },
    isActive: true
  },
  {
    id: "caution-contains-dairy",
    type: "caution",
    label: "contains-dairy",
    description: "Contains milk-based ingredients.",
    localized: {
      English: {
        label: "contains-dairy",
        description: "Contains milk-based ingredients."
      },
      Arabic: {
        label: "يحتوي على ألبان",
        description: "يحتوي على مكونات مشتقة من الحليب."
      }
    },
    isActive: true
  },
  {
    id: "caution-contains-gluten",
    type: "caution",
    label: "contains-gluten",
    description: "Contains wheat or gluten-bearing ingredients.",
    localized: {
      English: {
        label: "contains-gluten",
        description: "Contains wheat or gluten-bearing ingredients."
      },
      Arabic: {
        label: "يحتوي على جلوتين",
        description: "يحتوي على القمح أو مكونات تحمل الجلوتين."
      }
    },
    isActive: true
  },
  {
    id: "caution-contains-egg",
    type: "caution",
    label: "contains-egg",
    description: "Contains egg ingredients.",
    localized: {
      English: {
        label: "contains-egg",
        description: "Contains egg ingredients."
      },
      Arabic: {
        label: "يحتوي على بيض",
        description: "يحتوي على مكونات من البيض."
      }
    },
    isActive: true
  }
];
