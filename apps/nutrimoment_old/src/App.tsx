/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, Upload, Utensils, Loader2, ChefHat, Info, 
  ArrowRight, RefreshCw, Plus, Trash2, Heart, Calendar, 
  ShoppingCart, CheckCircle2, AlertCircle, X, Edit2, Save,
  ShieldCheck, FileText, Menu, ChevronRight, Clock, Mic,
  LogOut, User, Lock, Mail, History, Sparkles, Coffee,
  Sun, Moon, Check, Flame, Languages
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Tab = 'scanner' | 'pantry' | 'mealplan' | 'health' | 'history' | 'settings';

interface PantryItem {
  id?: number;
  name: string;
  quantity: string;
  expiration?: string;
}

interface Recipe {
  name: string;
  cuisine: string;
  ingredients: string[];
  missing_ingredients: string[];
  steps: string[];
  calories: number;
  protein: string;
  carbs: string;
  fat: string;
  cook_time: string;
  difficulty: string;
  image_url?: string;
  image_loading?: boolean;
  image_error?: boolean;
}

interface MealPlanDay {
  day: string;
  breakfast: { name: string; calories: number; protein: string; carbs: string; fat: string; };
  lunch: { name: string; calories: number; protein: string; carbs: string; fat: string; };
  dinner: { name: string; calories: number; protein: string; carbs: string; fat: string; };
}

interface MealPlanData {
  plan: MealPlanDay[];
  shoppingList: string[];
}

interface HistoryItem {
  id: string;
  timestamp: string;
  ingredients: string[];
  recipes: Recipe[];
}

const containerVariants: any = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.05 }
  }
};

const itemVariants: any = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

const scaleVariants: any = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

const translations = {
  en: {
    appTitle: "NutriMoment",
    appSubtitle: "Your AI-powered nutrition expert",
    login: "Login",
    signup: "Sign Up",
    email: "Email Address",
    password: "Password",
    welcomeBack: "Welcome Back",
    createAccount: "Create Account",
    terms: "Terms of Service",
    scanner: "Scanner",
    pantry: "Pantry",
    health: "Health",
    mealplan: "Meal Plan",
    history: "History",
    settings: "Settings",
    heroTitle: "Let's Cook Something Amazing! 👩‍🍳",
    heroSub: "Snap a photo of your fridge, pantry, or ingredients, and our AI will craft the perfect recipe tailored just for you.",
    takePhoto: "Take a Photo",
    typeIng: "Type Ingredients",
    quickAdd: "Quick add: chicken, rice, beans...",
    generate: "Generate",
    manualRecipe: "Manual Recipe Request",
    clearAll: "Clear All",
    whatIng: "What ingredients do you have?",
    describePlate: "Describe your desired plate",
    reviewIng: "Review Ingredients",
    generateNow: "Generate Now",
    aiThinking: "AI is thinking...",
    identifying: "Identifying ingredients and calculating nutrition.",
    detectedIng: "Detected Ingredients",
    editList: "Edit List",
    addMissing: "Add missing ingredient...",
    includePantry: "Include Pantry Items?",
    generateRecipes: "Generate Recipes",
    scanIng: "Scan Ingredients",
    myPantry: "My Pantry",
    keepTrack: "Keep track of what you have in stock.",
    scanPantry: "Scan Pantry",
    addItem: "Add Item",
    pantryScan: "Pantry Scan",
    analyzingPantry: "Analyzing pantry items...",
    analyzeImage: "Analyze Image",
    detectedItems: "Detected Items",
    items: "items",
    addMissedItem: "Add missed item...",
    add: "Add",
    addItemsToPantry: "Add Items to Pantry",
    pantryEmpty: "Your pantry is empty!",
    scanFridgeStart: "Scan your fridge or add items manually to start generating personalized recipes.",
    healthProfile: "Health & Diet Profile",
    healthProfileDesc: "Select dietary preferences and conditions to tailor your AI recipe suggestions.",
    dietaryPrefs: "Dietary Preferences",
    healthConditions: "Health Conditions",
    medicalDisclaimer: "Medical Disclaimer:",
    medicalDisclaimerText: "NutriMoment provides nutrition suggestions for informational purposes only. It is not intended as medical advice. Always consult a qualified healthcare professional for medical or dietary guidance.",
    mealPlanTitle: "7-Day Meal Plan",
    mealPlanDesc: "Your personalized weekly nutrition schedule.",
    generatePlan: "Generate Plan",
    regeneratePlan: "Regenerate Plan",
    craftingMenu: "Crafting your menu...",
    analyzingHealth: "Analyzing your health profile and pantry items.",
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    shoppingList: "Shopping List",
    shoppingListDesc: "Everything you need for the week.",
    noMealPlan: "No Meal Plan Yet",
    noMealPlanDesc: "Generate a personalized 7-day meal plan based on your health profile, dietary preferences, and pantry items.",
    createMyPlan: "Create My Plan",
    recipeHistory: "Recipe History",
    recipeHistoryDesc: "Your past culinary explorations",
    clearAllHistory: "Clear all history?",
    yesClear: "Yes, Clear",
    cancel: "Cancel",
    noHistory: "No history yet",
    noHistoryDesc: "Start scanning ingredients to build your personalized recipe collection.",
    startScanning: "Start Scanning",
    ingredients: "Ingredients:",
    viewRecipe: "View Recipe",
    saveRecipe: "Save Recipe",
    aiGenerated: "AI Generated",
    aiGeneratedDesc: "Recipe generated by AI. Results may vary.",
    recipeOutputLang: "Recipe Output Language",
    privacyPolicy: "Privacy Policy",
    aiDisclaimer: "AI Disclaimer",
    startOver: "Start Over",
    ingredientsUsed: "Ingredients Used",
    wantMoreVariety: "Want more variety?",
    wantMoreVarietyDesc: "You can adjust your health profile or pantry items in the other tabs to get different suggestions.",
    cookingImage: "Cooking up image...",
    imageUnavailable: "Image unavailable",
    ingredientsYouHave: "Ingredients You Have",
    ingredientsYouNeed: "Ingredients You Need",
    protein: "Protein",
    carbs: "Carbs",
    fat: "Fat",
    nutritionBenefits: "Nutrition & Benefits",
    fiber: "Fiber",
    sugar: "Sugar",
    sodium: "Sodium",
    prepSteps: "Preparation Steps",
    preferences: "Preferences",
    preferencesDesc: "Customize your recipe generation experience.",
    dailyCalorieTarget: "Daily Calorie Target",
    recipesWillAimFor: "Recipes will aim for ~",
    kcalPerMeal: "kcal per meal.",
    preferredCuisine: "Preferred Cuisine",
    maxMissingIngredients: "Max Missing Ingredients",
    recipesWillAllowUpTo: "Recipes will allow up to",
    missingIngredients: "missing ingredients.",
    voiceInputLanguage: "Voice Input Language",
    voiceInputLanguageDesc: "The language you will speak when using the microphone.",
    recipeOutputLanguageDesc: "The language the AI will use to generate recipes.",
    termsOfService: "Terms of Service",
    deleteAccountDesc: "Permanently delete your account and all data.",
    vegetarian: "Vegetarian",
    vegetarianDesc: "No meat or poultry",
    vegan: "Vegan",
    veganDesc: "No animal products",
    keto: "Keto",
    ketoDesc: "Very low carb, high fat",
    paleo: "Paleo",
    paleoDesc: "Whole foods, no grains/dairy",
    glutenFree: "Gluten-Free",
    glutenFreeDesc: "No wheat, barley, rye",
    dairyFree: "Dairy-Free",
    dairyFreeDesc: "No milk, cheese, butter",
    diabetes: "Diabetes",
    diabetesDesc: "Low sugar, balanced carbs",
    hypertension: "Hypertension",
    hypertensionDesc: "Low sodium, heart healthy",
    highBloodPressure: "High Blood Pressure",
    highBloodPressureDesc: "Low sodium, heart healthy",
    lowBloodPressure: "Low Blood Pressure",
    lowBloodPressureDesc: "Balanced sodium, nutrient dense",
    weightGain: "Weight Gain",
    weightGainDesc: "Calorie dense, high protein",
    weightLoss: "Weight Loss",
    weightLossDesc: "Calorie controlled, high protein",
    cholesterol: "High Cholesterol",
    cholesterolDesc: "Low saturated fats",
    english: "English",
    spanish: "Spanish",
    french: "French",
    german: "German",
    chinese: "Chinese",
    japanese: "Japanese",
    arabic: "Arabic",
    hindi: "Hindi",
    anyCuisine: "Any",
    italian: "Italian",
    mexican: "Mexican",
    indian: "Indian",
    mediterranean: "Mediterranean",
    thai: "Thai",
    ingredientName: "Ingredient Name",
  },
  ar: {
    appTitle: "نيوتري مومنت",
    appSubtitle: "خبير التغذية الخاص بك المدعوم بالذكاء الاصطناعي",
    login: "تسجيل الدخول",
    signup: "إنشاء حساب",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    welcomeBack: "مرحباً بعودتك",
    createAccount: "إنشاء حساب",
    terms: "شروط الخدمة",
    scanner: "الماسح الضوئي",
    pantry: "المخزن",
    health: "الصحة",
    mealplan: "خطة الوجبات",
    history: "السجل",
    settings: "الإعدادات",
    heroTitle: "دعنا نطبخ شيئاً مذهلاً! 👩‍🍳",
    heroSub: "التقط صورة لثلاجتك أو مخزنك أو المكونات، وسيقوم الذكاء الاصطناعي بابتكار الوصفة المثالية لك.",
    takePhoto: "التقط صورة",
    typeIng: "اكتب المكونات",
    quickAdd: "إضافة سريعة: دجاج، أرز، فاصوليا...",
    generate: "توليد",
    manualRecipe: "طلب وصفة يدوي",
    clearAll: "مسح الكل",
    whatIng: "ما هي المكونات التي لديك؟",
    describePlate: "صف طبقك المفضل",
    reviewIng: "مراجعة المكونات",
    generateNow: "توليد الآن",
    aiThinking: "الذكاء الاصطناعي يفكر...",
    identifying: "تحديد المكونات وحساب التغذية.",
    detectedIng: "المكونات المكتشفة",
    editList: "تعديل القائمة",
    addMissing: "إضافة مكون مفقود...",
    includePantry: "تضمين عناصر المخزن؟",
    generateRecipes: "توليد الوصفات",
    scanIng: "مسح المكونات",
    myPantry: "مخزني",
    keepTrack: "تتبع ما لديك في المخزن.",
    scanPantry: "مسح المخزن",
    addItem: "إضافة عنصر",
    pantryScan: "مسح المخزن",
    analyzingPantry: "جاري تحليل عناصر المخزن...",
    analyzeImage: "تحليل الصورة",
    detectedItems: "العناصر المكتشفة",
    items: "عناصر",
    addMissedItem: "إضافة عنصر مفقود...",
    add: "إضافة",
    addItemsToPantry: "إضافة العناصر إلى المخزن",
    pantryEmpty: "مخزنك فارغ!",
    scanFridgeStart: "امسح ثلاجتك أو أضف العناصر يدويًا لبدء إنشاء وصفات مخصصة.",
    healthProfile: "الملف الصحي والغذائي",
    healthProfileDesc: "حدد التفضيلات الغذائية والحالات لتخصيص اقتراحات الوصفات بالذكاء الاصطناعي.",
    dietaryPrefs: "التفضيلات الغذائية",
    healthConditions: "الحالات الصحية",
    medicalDisclaimer: "إخلاء مسؤولية طبية:",
    medicalDisclaimerText: "يوفر نيوتري مومنت اقتراحات غذائية لأغراض إعلامية فقط. ليس المقصود منه أن يكون نصيحة طبية. استشر دائمًا أخصائي رعاية صحية مؤهل للحصول على إرشادات طبية أو غذائية.",
    mealPlanTitle: "خطة وجبات لمدة 7 أيام",
    mealPlanDesc: "جدول التغذية الأسبوعي المخصص لك.",
    generatePlan: "توليد الخطة",
    regeneratePlan: "إعادة توليد الخطة",
    craftingMenu: "جاري إعداد قائمتك...",
    analyzingHealth: "جاري تحليل ملفك الصحي وعناصر المخزن.",
    breakfast: "الإفطار",
    lunch: "الغداء",
    dinner: "العشاء",
    shoppingList: "قائمة التسوق",
    shoppingListDesc: "كل ما تحتاجه للأسبوع.",
    noMealPlan: "لا توجد خطة وجبات بعد",
    noMealPlanDesc: "قم بإنشاء خطة وجبات مخصصة لمدة 7 أيام بناءً على ملفك الصحي والتفضيلات الغذائية وعناصر المخزن.",
    createMyPlan: "إنشاء خطتي",
    recipeHistory: "سجل الوصفات",
    recipeHistoryDesc: "استكشافاتك في الطهي السابقة",
    clearAllHistory: "مسح كل السجل؟",
    yesClear: "نعم، امسح",
    cancel: "إلغاء",
    noHistory: "لا يوجد سجل بعد",
    noHistoryDesc: "ابدأ بمسح المكونات لبناء مجموعة الوصفات المخصصة لك.",
    startScanning: "بدء المسح",
    ingredients: "المكونات:",
    viewRecipe: "عرض الوصفة",
    saveRecipe: "حفظ الوصفة",
    aiGenerated: "مولد بالذكاء الاصطناعي",
    aiGeneratedDesc: "وصفة تم إنشاؤها بواسطة الذكاء الاصطناعي. قد تختلف النتائج.",
    recipeOutputLang: "لغة إخراج الوصفة",
    privacyPolicy: "سياسة الخصوصية",
    aiDisclaimer: "إخلاء مسؤولية الذكاء الاصطناعي",
    startOver: "البدء من جديد",
    ingredientsUsed: "المكونات المستخدمة",
    wantMoreVariety: "تريد المزيد من التنوع؟",
    wantMoreVarietyDesc: "يمكنك تعديل ملفك الصحي أو عناصر المخزن في علامات التبويب الأخرى للحصول على اقتراحات مختلفة.",
    cookingImage: "جاري تحضير الصورة...",
    imageUnavailable: "الصورة غير متوفرة",
    ingredientsYouHave: "المكونات المتوفرة لديك",
    ingredientsYouNeed: "المكونات التي تحتاجها",
    protein: "بروتين",
    carbs: "كربوهيدرات",
    fat: "دهون",
    nutritionBenefits: "التغذية والفوائد",
    fiber: "ألياف",
    sugar: "سكر",
    sodium: "صوديوم",
    prepSteps: "خطوات التحضير",
    preferences: "التفضيلات",
    preferencesDesc: "قم بتخصيص تجربة إنشاء الوصفات الخاصة بك.",
    dailyCalorieTarget: "الهدف اليومي للسعرات الحرارية",
    recipesWillAimFor: "ستهتم الوصفات بحوالي ~",
    kcalPerMeal: "سعرة حرارية لكل وجبة.",
    preferredCuisine: "المطبخ المفضل",
    maxMissingIngredients: "الحد الأقصى للمكونات المفقودة",
    recipesWillAllowUpTo: "ستسمح الوصفات بما يصل إلى",
    missingIngredients: "مكونات مفقودة.",
    voiceInputLanguage: "لغة الإدخال الصوتي",
    voiceInputLanguageDesc: "اللغة التي ستتحدث بها عند استخدام الميكروفون.",
    recipeOutputLanguageDesc: "اللغة التي سيستخدمها الذكاء الاصطناعي لإنشاء الوصفات.",
    termsOfService: "شروط الخدمة",
    deleteAccountDesc: "حذف حسابك وجميع بياناتك نهائيًا.",
    vegetarian: "نباتي",
    vegetarianDesc: "بدون لحوم أو دواجن",
    vegan: "نباتي صرف",
    veganDesc: "بدون منتجات حيوانية",
    keto: "كيتو",
    ketoDesc: "كربوهيدرات منخفضة جداً، دهون عالية",
    paleo: "باليو",
    paleoDesc: "أطعمة كاملة، بدون حبوب/ألبان",
    glutenFree: "خالي من الجلوتين",
    glutenFreeDesc: "بدون قمح، شعير، جاودار",
    dairyFree: "خالي من منتجات الألبان",
    dairyFreeDesc: "بدون حليب، جبن، زبدة",
    diabetes: "السكري",
    diabetesDesc: "سكر منخفض، كربوهيدرات متوازنة",
    highBloodPressure: "ارتفاع ضغط الدم",
    highBloodPressureDesc: "صوديوم منخفض، صحي للقلب",
    lowBloodPressure: "انخفاض ضغط الدم",
    lowBloodPressureDesc: "صوديوم متوازن، غني بالمغذيات",
    weightGain: "زيادة الوزن",
    weightGainDesc: "غني بالسعرات الحرارية، بروتين عالي",
    weightLoss: "فقدان الوزن",
    weightLossDesc: "سعرات حرارية خاضعة للرقابة، بروتين عالي",
    cholesterol: "ارتفاع الكوليسترول",
    cholesterolDesc: "دهون مشبعة منخفضة",
    english: "الإنجليزية",
    spanish: "الإسبانية",
    french: "الفرنسية",
    german: "الألمانية",
    chinese: "الصينية",
    japanese: "اليابانية",
    arabic: "العربية",
    hindi: "الهندية",
    anyCuisine: "أي مطبخ",
    italian: "إيطالي",
    mexican: "مكسيكي",
    indian: "هندي",
    mediterranean: "متوسطي",
    thai: "تايلاندي",
    ingredientName: "اسم المكون",
  },
  es: {
    appTitle: "NutriMoment",
    appSubtitle: "Tu experto en nutrición con IA",
    login: "Iniciar sesión",
    signup: "Registrarse",
    email: "Correo electrónico",
    password: "Contraseña",
    welcomeBack: "Bienvenido de nuevo",
    createAccount: "Crear cuenta",
    terms: "Términos de servicio",
    scanner: "Escáner",
    pantry: "Despensa",
    health: "Salud",
    mealplan: "Plan de comidas",
    history: "Historial",
    settings: "Ajustes",
    heroTitle: "¡Cocinemos algo increíble! 👩‍🍳",
    heroSub: "Toma una foto de tu refrigerador, despensa o ingredientes, y nuestra IA creará la receta perfecta para ti.",
    takePhoto: "Tomar una foto",
    typeIng: "Escribir ingredientes",
    quickAdd: "Añadir rápido: pollo, arroz, frijoles...",
    generate: "Generar",
    manualRecipe: "Solicitud de receta manual",
    clearAll: "Borrar todo",
    whatIng: "¿Qué ingredientes tienes?",
    describePlate: "Describe tu plato deseado",
    reviewIng: "Revisar ingredientes",
    generateNow: "Generar ahora",
    aiThinking: "La IA está pensando...",
    identifying: "Identificando ingredientes y calculando nutrición.",
    detectedIng: "Ingredientes detectados",
    editList: "Editar lista",
    addMissing: "Añadir ingrediente faltante...",
    includePantry: "¿Incluir artículos de la despensa?",
    generateRecipes: "Generar recetas",
    scanIng: "Escanear ingredientes",
    myPantry: "Mi despensa",
    keepTrack: "Lleva un registro de lo que tienes en stock.",
    scanPantry: "Escanear despensa",
    addItem: "Añadir artículo",
    pantryScan: "Escaneo de despensa",
    analyzingPantry: "Analizando artículos de la despensa...",
    analyzeImage: "Analizar imagen",
    detectedItems: "Artículos detectados",
    items: "artículos",
    addMissedItem: "Añadir artículo faltante...",
    add: "Añadir",
    addItemsToPantry: "Añadir artículos a la despensa",
    pantryEmpty: "¡Tu despensa está vacía!",
    scanFridgeStart: "Escanea tu refrigerador o añade artículos manualmente para comenzar a generar recetas personalizadas.",
    healthProfile: "Perfil de salud y dieta",
    healthProfileDesc: "Selecciona preferencias dietéticas y condiciones para adaptar tus sugerencias de recetas de IA.",
    dietaryPrefs: "Preferencias dietéticas",
    healthConditions: "Condiciones de salud",
    medicalDisclaimer: "Descargo de responsabilidad médica:",
    medicalDisclaimerText: "NutriMoment proporciona sugerencias de nutrición solo con fines informativos. No pretende ser un consejo médico. Consulta siempre a un profesional de la salud calificado para obtener orientación médica o dietética.",
    mealPlanTitle: "Plan de comidas de 7 días",
    mealPlanDesc: "Tu horario de nutrición semanal personalizado.",
    generatePlan: "Generar plan",
    regeneratePlan: "Regenerar plan",
    craftingMenu: "Elaborando tu menú...",
    analyzingHealth: "Analizando tu perfil de salud y artículos de la despensa.",
    breakfast: "Desayuno",
    lunch: "Almuerzo",
    dinner: "Cena",
    shoppingList: "Lista de compras",
    shoppingListDesc: "Todo lo que necesitas para la semana.",
    noMealPlan: "Aún no hay plan de comidas",
    noMealPlanDesc: "Genera un plan de comidas personalizado de 7 días basado en tu perfil de salud, preferencias dietéticas y artículos de la despensa.",
    createMyPlan: "Crear mi plan",
    recipeHistory: "Historial de recetas",
    recipeHistoryDesc: "Tus exploraciones culinarias pasadas",
    clearAllHistory: "¿Borrar todo el historial?",
    yesClear: "Sí, borrar",
    cancel: "Cancelar",
    noHistory: "Aún no hay historial",
    noHistoryDesc: "Comienza a escanear ingredientes para construir tu colección de recetas personalizadas.",
    startScanning: "Comenzar a escanear",
    ingredients: "Ingredientes:",
    viewRecipe: "Ver receta",
    saveRecipe: "Guardar receta",
    aiGenerated: "Generado por IA",
    aiGeneratedDesc: "Receta generada por IA. Los resultados pueden variar.",
    recipeOutputLang: "Idioma de salida de la receta",
    privacyPolicy: "Política de privacidad",
    aiDisclaimer: "Descargo de responsabilidad de IA",
    startOver: "Empezar de nuevo",
    ingredientsUsed: "Ingredientes utilizados",
    wantMoreVariety: "¿Quieres más variedad?",
    wantMoreVarietyDesc: "Puedes ajustar tu perfil de salud o artículos de la despensa en las otras pestañas para obtener sugerencias diferentes.",
    cookingImage: "Cocinando imagen...",
    imageUnavailable: "Imagen no disponible",
    ingredientsYouHave: "Ingredientes que tienes",
    ingredientsYouNeed: "Ingredientes que necesitas",
    protein: "Proteína",
    carbs: "Carbohidratos",
    fat: "Grasa",
    nutritionBenefits: "Nutrición y beneficios",
    fiber: "Fibra",
    sugar: "Azúcar",
    sodium: "Sodio",
    prepSteps: "Pasos de preparación",
    preferences: "Preferencias",
    preferencesDesc: "Personaliza tu experiencia de generación de recetas.",
    dailyCalorieTarget: "Objetivo diario de calorías",
    recipesWillAimFor: "Las recetas apuntarán a ~",
    kcalPerMeal: "kcal por comida.",
    preferredCuisine: "Cocina preferida",
    maxMissingIngredients: "Máximo de ingredientes faltantes",
    recipesWillAllowUpTo: "Las recetas permitirán hasta",
    missingIngredients: "ingredientes faltantes.",
    voiceInputLanguage: "Idioma de entrada de voz",
    voiceInputLanguageDesc: "El idioma que hablarás al usar el micrófono.",
    recipeOutputLanguageDesc: "El idioma que usará la IA para generar recetas.",
    termsOfService: "Términos de servicio",
    deleteAccountDesc: "Elimina permanentemente tu cuenta y todos los datos.",
    vegetarian: "Vegetariano",
    vegetarianDesc: "Sin carne ni aves",
    vegan: "Vegano",
    veganDesc: "Sin productos animales",
    keto: "Keto",
    ketoDesc: "Muy bajo en carbohidratos, alto en grasas",
    paleo: "Paleo",
    paleoDesc: "Alimentos integrales, sin granos/lácteos",
    glutenFree: "Sin gluten",
    glutenFreeDesc: "Sin trigo, cebada, centeno",
    dairyFree: "Sin lácteos",
    dairyFreeDesc: "Sin leche, queso, mantequilla",
    diabetes: "Diabetes",
    diabetesDesc: "Bajo en azúcar, carbohidratos equilibrados",
    highBloodPressure: "Presión arterial alta",
    highBloodPressureDesc: "Bajo en sodio, saludable para el corazón",
    lowBloodPressure: "Presión arterial baja",
    lowBloodPressureDesc: "Sodio equilibrado, denso en nutrientes",
    weightGain: "Aumento de peso",
    weightGainDesc: "Calórico, alto en proteínas",
    weightLoss: "Pérdida de peso",
    weightLossDesc: "Calorías controladas, alto en proteínas",
    cholesterol: "Colesterol alto",
    cholesterolDesc: "Bajo en grasas saturadas",
    english: "Inglés",
    spanish: "Español",
    french: "Francés",
    german: "Alemán",
    chinese: "Chino",
    japanese: "Japonés",
    arabic: "Árabe",
    hindi: "Hindi",
    anyCuisine: "Cualquiera",
    italian: "Italiana",
    mexican: "Mexicana",
    indian: "India",
    mediterranean: "Mediterránea",
    thai: "Tailandesa",
    ingredientName: "Nombre del ingrediente",
  },
  fr: {
    appTitle: "NutriMoment",
    appSubtitle: "Votre expert en nutrition IA",
    login: "Connexion",
    signup: "S'inscrire",
    email: "Adresse e-mail",
    password: "Mot de passe",
    welcomeBack: "Bon retour",
    createAccount: "Créer un compte",
    terms: "Conditions d'utilisation",
    scanner: "Scanner",
    pantry: "Garde-manger",
    health: "Santé",
    mealplan: "Plan de repas",
    history: "Historique",
    settings: "Paramètres",
    heroTitle: "Cuisinons quelque chose d'incroyable ! 👩‍🍳",
    heroSub: "Prenez une photo de votre réfrigérateur, de votre garde-manger ou de vos ingrédients, et notre IA créera la recette parfaite pour vous.",
    takePhoto: "Prendre une photo",
    typeIng: "Taper les ingrédients",
    quickAdd: "Ajout rapide : poulet, riz, haricots...",
    generate: "Générer",
    manualRecipe: "Demande de recette manuelle",
    clearAll: "Tout effacer",
    whatIng: "Quels ingrédients avez-vous ?",
    describePlate: "Décrivez votre plat souhaité",
    reviewIng: "Revoir les ingrédients",
    generateNow: "Générer maintenant",
    aiThinking: "L'IA réfléchit...",
    identifying: "Identification des ingrédients et calcul de la nutrition.",
    detectedIng: "Ingrédients détectés",
    editList: "Modifier la liste",
    addMissing: "Ajouter un ingrédient manquant...",
    includePantry: "Inclure les articles du garde-manger ?",
    generateRecipes: "Générer des recettes",
    scanIng: "Scanner les ingrédients",
    myPantry: "Mon garde-manger",
    keepTrack: "Gardez une trace de ce que vous avez en stock.",
    scanPantry: "Scanner le garde-manger",
    addItem: "Ajouter un article",
    pantryScan: "Scan du garde-manger",
    analyzingPantry: "Analyse des articles du garde-manger...",
    analyzeImage: "Analyser l'image",
    detectedItems: "Articles détectés",
    items: "articles",
    addMissedItem: "Ajouter un article manquant...",
    add: "Ajouter",
    addItemsToPantry: "Ajouter des articles au garde-manger",
    pantryEmpty: "Votre garde-manger est vide !",
    scanFridgeStart: "Scannez votre réfrigérateur ou ajoutez des articles manuellement pour commencer à générer des recettes personnalisées.",
    healthProfile: "Profil de santé et d'alimentation",
    healthProfileDesc: "Sélectionnez vos préférences et conditions alimentaires pour adapter vos suggestions de recettes IA.",
    dietaryPrefs: "Préférences alimentaires",
    healthConditions: "Conditions de santé",
    medicalDisclaimer: "Avis médical :",
    medicalDisclaimerText: "NutriMoment fournit des suggestions nutritionnelles à titre informatif uniquement. Il ne s'agit pas d'un avis médical. Consultez toujours un professionnel de la santé qualifié pour obtenir des conseils médicaux ou diététiques.",
    mealPlanTitle: "Plan de repas de 7 jours",
    mealPlanDesc: "Votre programme nutritionnel hebdomadaire personnalisé.",
    generatePlan: "Générer le plan",
    regeneratePlan: "Régénérer le plan",
    craftingMenu: "Élaboration de votre menu...",
    analyzingHealth: "Analyse de votre profil de santé et des articles de votre garde-manger.",
    breakfast: "Petit-déjeuner",
    lunch: "Déjeuner",
    dinner: "Dîner",
    shoppingList: "Liste de courses",
    shoppingListDesc: "Tout ce dont vous avez besoin pour la semaine.",
    noMealPlan: "Pas encore de plan de repas",
    noMealPlanDesc: "Générez un plan de repas personnalisé de 7 jours basé sur votre profil de santé, vos préférences alimentaires et les articles de votre garde-manger.",
    createMyPlan: "Créer mon plan",
    recipeHistory: "Historique des recettes",
    recipeHistoryDesc: "Vos explorations culinaires passées",
    clearAllHistory: "Effacer tout l'historique ?",
    yesClear: "Oui, effacer",
    cancel: "Annuler",
    noHistory: "Pas encore d'historique",
    noHistoryDesc: "Commencez à scanner des ingrédients pour créer votre collection de recettes personnalisée.",
    startScanning: "Commencer à scanner",
    ingredients: "Ingrédients :",
    viewRecipe: "Voir la recette",
    saveRecipe: "Enregistrer la recette",
    aiGenerated: "Généré par l'IA",
    aiGeneratedDesc: "Recette générée par l'IA. Les résultats peuvent varier.",
    recipeOutputLang: "Langue de sortie de la recette",
    privacyPolicy: "Politique de confidentialité",
    aiDisclaimer: "Avis de non-responsabilité de l'IA",
    startOver: "Recommencer",
    ingredientsUsed: "Ingrédients utilisés",
    wantMoreVariety: "Vous voulez plus de variété ?",
    wantMoreVarietyDesc: "Vous pouvez ajuster votre profil de santé ou les articles de votre garde-manger dans les autres onglets pour obtenir des suggestions différentes.",
    cookingImage: "Préparation de l'image...",
    imageUnavailable: "Image non disponible",
    ingredientsYouHave: "Ingrédients que vous avez",
    ingredientsYouNeed: "Ingrédients dont vous avez besoin",
    protein: "Protéines",
    carbs: "Glucides",
    fat: "Graisses",
    nutritionBenefits: "Nutrition et avantages",
    fiber: "Fibres",
    sugar: "Sucre",
    sodium: "Sodium",
    prepSteps: "Étapes de préparation",
    preferences: "Préférences",
    preferencesDesc: "Personnalisez votre expérience de génération de recettes.",
    dailyCalorieTarget: "Objectif calorique quotidien",
    recipesWillAimFor: "Les recettes viseront environ ~",
    kcalPerMeal: "kcal par repas.",
    preferredCuisine: "Cuisine préférée",
    maxMissingIngredients: "Maximum d'ingrédients manquants",
    recipesWillAllowUpTo: "Les recettes permettront jusqu'à",
    missingIngredients: "ingrédients manquants.",
    voiceInputLanguage: "Langue de saisie vocale",
    voiceInputLanguageDesc: "La langue que vous parlerez lors de l'utilisation du microphone.",
    recipeOutputLanguageDesc: "La langue que l'IA utilisera pour générer des recettes.",
    termsOfService: "Conditions d'utilisation",
    deleteAccountDesc: "Supprimez définitivement votre compte et toutes vos données.",
    vegetarian: "Végétarien",
    vegetarianDesc: "Pas de viande ni de volaille",
    vegan: "Végétalien",
    veganDesc: "Pas de produits d'origine animale",
    keto: "Céto",
    ketoDesc: "Très faible en glucides, riche en graisses",
    paleo: "Paléo",
    paleoDesc: "Aliments entiers, sans céréales/produits laitiers",
    glutenFree: "Sans gluten",
    glutenFreeDesc: "Sans blé, orge, seigle",
    dairyFree: "Sans produits laitiers",
    dairyFreeDesc: "Sans lait, fromage, beurre",
    diabetes: "Diabète",
    diabetesDesc: "Faible en sucre, glucides équilibrés",
    highBloodPressure: "Hypertension artérielle",
    highBloodPressureDesc: "Faible en sodium, bon pour le cœur",
    lowBloodPressure: "Hypotension artérielle",
    lowBloodPressureDesc: "Sodium équilibré, riche en nutriments",
    weightGain: "Prise de poids",
    weightGainDesc: "Calorique, riche en protéines",
    weightLoss: "Perte de poids",
    weightLossDesc: "Calories contrôlées, riche en protéines",
    cholesterol: "Cholestérol élevé",
    cholesterolDesc: "Faible en graisses saturées",
    english: "Anglais",
    spanish: "Espagnol",
    french: "Français",
    german: "Allemand",
    chinese: "Chinois",
    japanese: "Japonais",
    arabic: "Arabe",
    hindi: "Hindi",
    anyCuisine: "Toutes",
    italian: "Italienne",
    mexican: "Mexicaine",
    indian: "Indienne",
    mediterranean: "Méditerranéenne",
    thai: "Thaïlandaise",
    ingredientName: "Nom de l'ingrédient",
  }
};

function withTimeout<T>(promise: Promise<T>, ms = 15000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms)
    )
  ]);
}

export default function App() {
  const [uiLanguage, setUiLanguage] = useState<'en' | 'ar' | 'es' | 'fr'>(() => {
    return (localStorage.getItem('nutrimoment_ui_lang') as 'en' | 'ar' | 'es' | 'fr') || 'en';
  });
  const t = translations[uiLanguage];

  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('nutrimoment_logged_in') === 'true');
  const [user, setUser] = useState<{ email: string } | null>(() => {
    const savedUser = localStorage.getItem('nutrimoment_user');
    if (savedUser) {
      try {
        return JSON.parse(savedUser);
      } catch (e) {
        console.error("Failed to parse user", e);
        return null;
      }
    }
    return null;
  });
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  
  const [trialCount, setTrialCount] = useState(() => {
    const count = localStorage.getItem('nutrimoment_trial_count');
    return count ? parseInt(count, 10) : 0;
  });
  const [showTrialModal, setShowTrialModal] = useState(false);
  const TRIAL_LIMIT = 3;

  const [activeTab, setActiveTab] = useState<Tab>('scanner');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false);
  const recognitionRef = useRef<any>(null);

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('nutrimoment_history');
    setShowClearHistoryConfirm(false);
  };
  const [image, setImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectedIngredients, setDetectedIngredients] = useState<string[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [expandedRecipeIndex, setExpandedRecipeIndex] = useState<number>(0);
  const [mealPlan, setMealPlan] = useState<MealPlanData | null>(null);
  const [selectedMeal, setSelectedMeal] = useState<{ name: string; calories: number; protein: string; carbs: string; fat: string; } | null>(null);
  const [isGeneratingMealPlan, setIsGeneratingMealPlan] = useState(false);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [pantryImage, setPantryImage] = useState<string | null>(null);
  const [isScanningPantry, setIsScanningPantry] = useState(false);
  const [detectedPantryItems, setDetectedPantryItems] = useState<string[]>([]);
  const [isEditingPantryScan, setIsEditingPantryScan] = useState(false);
  const [newPantryIngredient, setNewPantryIngredient] = useState("");
  const [dietaryPrefs, setDietaryPrefs] = useState<string[]>([]);
  const [healthConditions, setHealthConditions] = useState<string[]>([]);
  const [language, setLanguage] = useState("English");
  const [inputLanguage, setInputLanguage] = useState("English");
  const [cuisine, setCuisine] = useState("Any");
  const [calorieTarget, setCalorieTarget] = useState("2000");
  const [maxMissingIngredients, setMaxMissingIngredients] = useState("2");
  const [includePantry, setIncludePantry] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isManualMode, setIsManualMode] = useState(false);
  const [customDescription, setCustomDescription] = useState("");
  const [isEditingIngredients, setIsEditingIngredients] = useState(false);
  const [newIngredient, setNewIngredient] = useState("");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [showPolicies, setShowPolicies] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkTrialLimit = () => {
    if (!isLoggedIn && trialCount >= TRIAL_LIMIT) {
      setShowTrialModal(true);
      return false;
    }
    return true;
  };

  const incrementTrialCount = () => {
    if (!isLoggedIn) {
      const newCount = trialCount + 1;
      setTrialCount(newCount);
      localStorage.setItem('nutrimoment_trial_count', newCount.toString());
    }
  };

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      
      const languageMap: { [key: string]: string } = {
        'English': 'en-US',
        'Spanish': 'es-ES',
        'French': 'fr-FR',
        'German': 'de-DE',
        'Chinese': 'zh-CN',
        'Japanese': 'ja-JP',
        'Arabic': 'ar-SA',
        'Hindi': 'hi-IN'
      };
      recognitionRef.current.lang = languageMap[inputLanguage] || 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setVoiceTranscript(transcript);
        
        // Reset silence timer
        if (recognitionRef.current.silenceTimer) clearTimeout(recognitionRef.current.silenceTimer);
        recognitionRef.current.silenceTimer = setTimeout(() => {
          recognitionRef.current?.stop();
        }, 3000); // 3 seconds silence

        if (activeTab === 'scanner') {
          if (isManualMode) {
            setNewIngredient(prev => prev ? `${prev}, ${transcript}` : transcript);
          } else {
            const input = document.querySelector('input[placeholder*="Quick add"]') as HTMLInputElement;
            if (input) {
              input.value = transcript;
            }
          }
        }
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, [activeTab, isManualMode, inputLanguage]);

  const toggleVoice = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (e) {
        console.error("Speech recognition error:", e);
      }
    }
  };

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (authEmail && authPassword) {
      const userData = { email: authEmail };
      setUser(userData);
      setIsLoggedIn(true);
      localStorage.setItem('nutrimoment_logged_in', 'true');
      localStorage.setItem('nutrimoment_user', JSON.stringify(userData));
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUser(null);
    localStorage.removeItem('nutrimoment_logged_in');
    localStorage.removeItem('nutrimoment_user');
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchPantry();
      fetchHealthProfile();
      fetchSettings();
      
      const savedHistory = localStorage.getItem('nutrimoment_history');
      if (savedHistory) {
        try {
          const parsed = JSON.parse(savedHistory);
          if (Array.isArray(parsed)) {
            setHistory(parsed);
          }
        } catch (e) {
          console.error("Failed to parse history", e);
        }
      }
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn) {
      try {
        localStorage.setItem('nutrimoment_history', JSON.stringify(history));
      } catch (e) {
        if (e instanceof DOMException && e.name === 'QuotaExceededError') {
          // If quota exceeded, try saving without images
          const historyWithoutImages = history.map(item => ({
            ...item,
            recipes: (Array.isArray(item.recipes) ? item.recipes : []).map(recipe => {
              const { image_url, ...rest } = recipe;
              return rest;
            })
          }));
          try {
            localStorage.setItem('nutrimoment_history', JSON.stringify(historyWithoutImages));
          } catch (e2) {
            // If still fails, keep only the most recent 5 items without images
            try {
              localStorage.setItem('nutrimoment_history', JSON.stringify(historyWithoutImages.slice(0, 5)));
            } catch (e3) {
              console.error("Failed to save history even after stripping images and truncating", e3);
            }
          }
        } else {
          console.error("Failed to save history", e);
        }
      }
    }
  }, [history, isLoggedIn]);

  const fetchSettings = async () => {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.language) setLanguage(data.language);
    if (data.inputLanguage) setInputLanguage(data.inputLanguage);
    if (data.cuisine) setCuisine(data.cuisine);
    if (data.calorieTarget) setCalorieTarget(data.calorieTarget);
    if (data.maxMissingIngredients) setMaxMissingIngredients(data.maxMissingIngredients);
  };

  const saveSettings = async (newLang: string, newInputLang: string, newCuisine: string, newCalorie: string, newMaxMissing: string) => {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: newLang, inputLanguage: newInputLang, cuisine: newCuisine, calorieTarget: newCalorie, maxMissingIngredients: newMaxMissing }),
    });
    setLanguage(newLang);
    setInputLanguage(newInputLang);
    setCuisine(newCuisine);
    setCalorieTarget(newCalorie);
    setMaxMissingIngredients(newMaxMissing);
  };

  const fetchPantry = async () => {
    const res = await fetch('/api/pantry');
    const data = await res.json();
    setPantry(data);
  };

  const fetchHealthProfile = async () => {
    const res = await fetch('/api/health-profile');
    const data = await res.json();
    setHealthConditions(data);
  };

  const saveHealthProfile = async (conditions: string[]) => {
    await fetch('/api/health-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conditions }),
    });
    setHealthConditions(conditions);
  };

  const addToPantry = async (item: PantryItem) => {
    await fetch('/api/pantry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    fetchPantry();
  };

  const removeFromPantry = async (id: number) => {
    await fetch(`/api/pantry/${id}`, { method: 'DELETE' });
    fetchPantry();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setDetectedIngredients([]);
        setRecipes([]);
        setExpandedRecipeIndex(0);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePantryFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPantryImage(reader.result as string);
        setDetectedPantryItems([]);
        setIsEditingPantryScan(false);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const scanPantryImage = async () => {
    if (!pantryImage) return;
    if (!checkTrialLimit()) return;
    
    setIsScanningPantry(true);
    setError(null);

    try {
      const base64Data = pantryImage.split(',')[1];

      const response = await withTimeout(fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Data, language, isPantry: true })
      }), 20000);

      if (!response.ok) throw new Error("Scan failed");
      const { result } = await response.json();

      let data = JSON.parse(result || "[]");
      if (!Array.isArray(data)) {
        if (data.ingredients && Array.isArray(data.ingredients)) {
          data = data.ingredients;
        } else if (data.items && Array.isArray(data.items)) {
          data = data.items;
        } else {
          data = Object.values(data).find(Array.isArray) || [];
        }
      }
      setDetectedPantryItems(data);
      setIsEditingPantryScan(true);
      incrementTrialCount();
    } catch (err) {
      setError("Failed to scan pantry image. Please try again.");
    } finally {
      setIsScanningPantry(false);
    }
  };

  const addScannedItemsToPantry = async () => {
    for (const item of detectedPantryItems) {
      // Add each item to the pantry
      await fetch('/api/pantry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: item, quantity: "1 unit" }),
      });
    }
    fetchPantry();
    setIsEditingPantryScan(false);
    setPantryImage(null);
    setDetectedPantryItems([]);
  };

  const scanFood = async () => {
    if (!image) return;
    if (!checkTrialLimit()) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const base64Data = image.split(',')[1];

      const response = await withTimeout(fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Data, language, isPantry: false })
      }), 20000);

      if (!response.ok) throw new Error("Scan failed");
      const { result } = await response.json();

      let data = JSON.parse(result || "[]");
      if (!Array.isArray(data)) {
        if (data.ingredients && Array.isArray(data.ingredients)) {
          data = data.ingredients;
        } else if (data.items && Array.isArray(data.items)) {
          data = data.items;
        } else {
          data = Object.values(data).find(Array.isArray) || [];
        }
      }
      setDetectedIngredients(data);
      setIsEditingIngredients(true);
      incrementTrialCount();
    } catch (err) {
      setError("Failed to scan image. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateMealPlan = async () => {
    setIsGeneratingMealPlan(true);
    setError(null);
    try {
      const pantryList = includePantry ? pantry.map(p => p.name).join(", ") : "None";
      const historyList = history.flatMap(h => Array.isArray(h.recipes) ? h.recipes.map(r => r.name) : []).slice(0, 10).join(", ");

      const prompt = `
        You are a world-class nutrition expert and meal planner.
        
        USER CONSTRAINTS:
        - Dietary Preferences: ${dietaryPrefs.join(", ") || "None"}.
        - Health conditions: ${healthConditions.join(", ") || "None"}.
        - Preferred Cuisine: ${cuisine === 'Any' ? 'Varied' : cuisine}.
        - Daily Calorie Target: Aim for approximately ${calorieTarget} calories per day.
        - Available Pantry Items: ${pantryList}.
        - Prior History Recipes (what they have cooked/liked before): ${historyList || "None"}.
        - Response Language: ${language}.
        
        TASK:
        Generate a 7-day meal plan based on the user's constraints, preferences, and prior history.
        The meal plan should include Breakfast, Lunch, and Dinner for each day (Monday to Sunday).
        For each meal, include the name, calories, protein, carbs, and fat content.
        Also generate a concise shopping list of ingredients needed for this meal plan that are NOT already in the Available Pantry Items.
        
        IMPORTANT: The entire response MUST be in ${language}.
        Return ONLY a JSON object with this structure:
        {
          "plan": [
            {
              "day": "Monday",
              "breakfast": { "name": "string", "calories": number, "protein": "string", "carbs": "string", "fat": "string" },
              "lunch": { "name": "string", "calories": number, "protein": "string", "carbs": "string", "fat": "string" },
              "dinner": { "name": "string", "calories": number, "protein": "string", "carbs": "string", "fat": "string" }
            }
          ],
          "shoppingList": ["string"]
        }
      `;

      const response = await withTimeout(fetch('/api/mealplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      }), 30000);

      if (!response.ok) throw new Error("Meal plan generation failed");
      const { result } = await response.json();

      const data = JSON.parse(result);
      setMealPlan(data);
    } catch (err) {
      console.error("Meal plan generation failed:", err);
      setError("Failed to generate meal plan.");
    } finally {
      setIsGeneratingMealPlan(false);
    }
  };

  const generateRecipes = async (manualIngredients?: string[]) => {
    const ingredientsToUse = manualIngredients || detectedIngredients;
    if (ingredientsToUse.length === 0) {
      setError("Please add some ingredients first.");
      return;
    }
    if (!checkTrialLimit()) return;

    setIsAnalyzing(true);
    setRecipes([]);
    setExpandedRecipeIndex(0);
    try {
      const pantryList = includePantry ? pantry.map(p => p.name).join(", ") : "None";
      const targetPerMeal = Math.round(parseInt(calorieTarget) / 3);

      const prompt = `
        You are a world-class nutrition expert and chef.
        
        PRIMARY INGREDIENTS: ${ingredientsToUse.join(", ")}.
        AVAILABLE PANTRY ITEMS: ${pantryList}.
        
        CRITICAL USER REQUEST: ${customDescription ? `The user specifically wants: "${customDescription}". You MUST follow this request as the primary goal for all 3 recipes.` : "Create something healthy and delicious based on the ingredients."}
        
        USER CONSTRAINTS:
        - Health conditions/Diet: ${healthConditions.join(", ") || "None"}.
        - Preferred Cuisine: ${cuisine === 'Any' ? 'Choose a suitable cuisine for each recipe (e.g., Italian, Mexican, etc.)' : cuisine}.
        - Calorie Target: Aim for approximately ${targetPerMeal} calories per recipe.
        - Maximum Missing Ingredients: ${maxMissingIngredients}.
        - Response Language: ${language}.
        
        TASK:
        Generate 3 healthy, gourmet-quality recipes. 
        If an image is provided and it shows a finished dish (not just raw ingredients), the FIRST recipe MUST be the exact recipe for the dish shown in the image. The other 2 recipes should be alternative suggestions using similar ingredients.
        If the image shows raw ingredients, generate 3 recipes using those ingredients.
        
        1. Identify "Ingredients You Have": Use the PRIMARY INGREDIENTS and AVAILABLE PANTRY ITEMS.
        2. Identify "Missing Ingredients": List items needed for the recipe that are NOT in the provided lists (e.g., specific spices, oils, or fresh herbs).
        
        For each recipe, provide:
        - A detailed nutrition panel.
        - The cuisine type.
        - A clear "cook_time" (timeframe).
        
        IMPORTANT: The entire response (recipe names, ingredients, steps, etc.) MUST be in ${language}.
        Return ONLY a JSON array of objects with this structure:
        {
          "name": "string",
          "cuisine": "string",
          "ingredients": ["string"], // Ingredients the user HAS
          "missing_ingredients": ["string"], // Ingredients the user NEEDS to add
          "steps": ["string"],
          "calories": number,
          "protein": "string",
          "carbs": "string",
          "fat": "string",
          "fiber": "string",
          "sugar": "string",
          "sodium": "string",
          "cook_time": "string",
          "difficulty": "string",
          "health_benefit": "string"
        }
      `;

      let base64Data;
      if (image) {
        base64Data = image.split(',')[1];
      }

      const response = await withTimeout(fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, image: base64Data })
      }), 45000);

      if (!response.ok) throw new Error("Recipe generation failed");
      const { result } = await response.json();

      let data: Recipe[] = JSON.parse(result || "[]");
      if (!Array.isArray(data)) {
        if ((data as any).recipes && Array.isArray((data as any).recipes)) {
          data = (data as any).recipes;
        } else {
          data = Object.values(data).find(Array.isArray) || [];
        }
      }
      
      // Set recipes immediately so user sees text
      const recipesWithLoading = data.map(r => ({ ...r, image_loading: true, image_error: false }));
      setRecipes(recipesWithLoading);
      
      // Update history immediately with text-only recipes
      const historyId = Date.now().toString();
      const newHistoryItem: HistoryItem = {
        id: historyId,
        timestamp: new Date().toLocaleString(),
        ingredients: ingredientsToUse,
        recipes: recipesWithLoading
      };
      setHistory(prev => [newHistoryItem, ...prev]);
      incrementTrialCount();

      // Generate images for each recipe sequentially to avoid rate limits
      (async () => {
        for (let index = 0; index < data.length; index++) {
          const recipe = data[index];
          try {
            // Add a larger delay between requests to prevent 429 errors
            if (index > 0) {
              await new Promise(resolve => setTimeout(resolve, 5000));
            }
            
            const imgResponse = await withTimeout(fetch('/api/generate-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: `A professional, gourmet food photography shot of ${recipe.name}, ${recipe.cuisine} style. Plated beautifully on a clean background.`
              })
            }), 30000);
            
            let imageUrl = "";
            if (imgResponse.ok) {
              const imgData = await imgResponse.json();
              imageUrl = imgData.imageUrl || "";
            }
            
            if (imageUrl) {
              // Update current recipes view
              setRecipes(prev => {
                const newRecipes = [...prev];
                if (newRecipes[index]) {
                  newRecipes[index] = { ...newRecipes[index], image_url: imageUrl, image_loading: false };
                }
                return newRecipes;
              });

              // Update history item with image
              setHistory(prev => prev.map(item => {
                if (item.id === historyId) {
                  const updatedRecipes = [...(Array.isArray(item.recipes) ? item.recipes : [])];
                  if (updatedRecipes[index]) {
                    updatedRecipes[index] = { ...updatedRecipes[index], image_url: imageUrl, image_loading: false };
                  }
                  return { ...item, recipes: updatedRecipes };
                }
                return item;
              }));
            } else {
              throw new Error("No image data returned");
            }
          } catch (e) {
            console.error("Image generation failed for", recipe.name, e);
            // Update current recipes view to show error state
            setRecipes(prev => {
              const newRecipes = [...prev];
              if (newRecipes[index]) {
                newRecipes[index] = { ...newRecipes[index], image_loading: false, image_error: true };
              }
              return newRecipes;
            });

            // Update history item to show error state
            setHistory(prev => prev.map(item => {
              if (item.id === historyId) {
                const updatedRecipes = [...(Array.isArray(item.recipes) ? item.recipes : [])];
                if (updatedRecipes[index]) {
                  updatedRecipes[index] = { ...updatedRecipes[index], image_loading: false, image_error: true };
                }
                return { ...item, recipes: updatedRecipes };
              }
              return item;
            }));
          }
        }
      })();

      setIsEditingIngredients(false);
      setIsManualMode(false);
      setCustomDescription("");
      setNewIngredient("");
    } catch (err) {
      setError("Failed to generate recipes.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleDietaryPref = (pref: string) => {
    const newPrefs = dietaryPrefs.includes(pref)
      ? dietaryPrefs.filter(p => p !== pref)
      : [...dietaryPrefs, pref];
    setDietaryPrefs(newPrefs);
  };

  const toggleCondition = (condition: string) => {
    const newConditions = healthConditions.includes(condition)
      ? healthConditions.filter(c => c !== condition)
      : [...healthConditions, condition];
    saveHealthProfile(newConditions);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans text-[#1a1a1a]" dir={uiLanguage === 'ar' ? 'rtl' : 'ltr'}>
      {!isLoggedIn ? (
        <div className="min-h-screen flex items-center justify-center p-4 bg-emerald-50/30">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md w-full bg-white p-8 rounded-[2.5rem] shadow-2xl shadow-emerald-900/5 border border-black/5 space-y-8"
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="bg-emerald-500 p-4 rounded-2xl shadow-xl shadow-emerald-500/20">
                <ChefHat className="text-white w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h1 className="text-3xl font-serif font-bold tracking-tight">{t.appTitle}</h1>
                <p className="text-gray-500 text-sm">{t.appSubtitle}</p>
              </div>
            </div>

            <div className="flex p-1 bg-gray-100 rounded-2xl">
              <button 
                onClick={() => setAuthMode('login')}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all",
                  authMode === 'login' ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500"
                )}
              >
                {t.login}
              </button>
              <button 
                onClick={() => setAuthMode('signup')}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all",
                  authMode === 'signup' ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500"
                )}
              >
                {t.signup}
              </button>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mx-1">{t.email}</label>
                <div className="relative">
                  <Mail className="absolute rtl:right-4 ltr:left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input 
                    type="email" 
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full rtl:pr-11 rtl:pl-4 ltr:pl-11 ltr:pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all text-left"
                    dir="ltr"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mx-1">{t.password}</label>
                <div className="relative">
                  <Lock className="absolute rtl:right-4 ltr:left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input 
                    type="password" 
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rtl:pr-11 rtl:pl-4 ltr:pl-11 ltr:pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all text-left"
                    dir="ltr"
                  />
                </div>
              </div>
              <button 
                type="submit"
                className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition-all mt-4"
              >
                {authMode === 'login' ? t.welcomeBack : t.createAccount}
              </button>
            </form>

            <div className="text-center">
              <p className="text-xs text-gray-400">
                By continuing, you agree to our <button className="text-emerald-600 font-bold">{t.terms}</button>
              </p>
            </div>
          </motion.div>
        </div>
      ) : (
        <>
          {/* Navigation */}
          <nav className="bg-white/80 backdrop-blur-xl border-b border-emerald-100 sticky top-0 z-50 shadow-sm">
            <div className="max-w-5xl mx-auto px-4">
              <div className="flex items-center justify-between h-20">
                <div className="flex items-center gap-3">
                  <motion.div 
                    whileHover={{ rotate: 180 }} 
                    transition={{ duration: 0.5 }}
                    className="bg-gradient-to-br from-emerald-400 to-teal-600 p-2.5 rounded-2xl shadow-lg shadow-emerald-500/30"
                  >
                    <ChefHat className="text-white w-6 h-6" />
                  </motion.div>
                  <div className="flex flex-col">
                    <span className="text-2xl font-serif font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-700 to-teal-600">NutriMoment</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/80">Your Personal Chef</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-1 bg-gray-50/50 p-1.5 rounded-2xl border border-gray-100 overflow-x-auto no-scrollbar">
                  {[
                    { id: 'scanner', icon: Camera, label: t.scanner },
                    { id: 'pantry', icon: Utensils, label: t.pantry },
                    { id: 'mealplan', icon: Calendar, label: t.mealplan },
                    { id: 'health', icon: Heart, label: t.health },
                    { id: 'history', icon: History, label: t.history },
                    { id: 'settings', icon: RefreshCw, label: t.settings },
                  ].map((item) => (
                    <motion.button
                      key={item.id}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setActiveTab(item.id as Tab)}
                      className={cn(
                        "relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors duration-300",
                        activeTab === item.id 
                          ? "text-emerald-700" 
                          : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      {activeTab === item.id && (
                        <motion.div
                          layoutId="activeTab"
                          className="absolute inset-0 bg-white shadow-sm border border-emerald-100 rounded-xl"
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10 flex items-center gap-2">
                        <item.icon className={cn("w-4 h-4", activeTab === item.id ? "text-emerald-500" : "")} />
                        {item.label}
                      </span>
                    </motion.button>
                  ))}
                  <div className="w-px h-6 bg-gray-200 mx-2" />
                  <button 
                    onClick={() => {
                      const langs: ('en' | 'ar' | 'es' | 'fr')[] = ['en', 'ar', 'es', 'fr'];
                      const nextIndex = (langs.indexOf(uiLanguage) + 1) % langs.length;
                      const newLang = langs[nextIndex];
                      setUiLanguage(newLang);
                      localStorage.setItem('nutrimoment_ui_lang', newLang);
                      
                      // Also update the recipe output language and voice input language to match the UI language
                      const langMap: Record<string, string> = {
                        'en': 'English',
                        'ar': 'Arabic',
                        'es': 'Spanish',
                        'fr': 'French'
                      };
                      saveSettings(langMap[newLang], langMap[newLang], cuisine, calorieTarget, maxMissingIngredients);
                    }}
                    className="p-2.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all font-bold text-sm uppercase"
                    title="Toggle Language"
                  >
                    {uiLanguage}
                  </button>
                  <button 
                    onClick={handleLogout}
                    className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    title="Log Out"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </nav>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'scanner' && (
            <motion.div
              key="scanner"
              variants={containerVariants}
              initial="hidden"
              animate="show"
              exit="hidden"
              className="space-y-8"
            >
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 text-red-700 mb-4"
                >
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p className="text-sm font-medium">{error}</p>
                  <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-red-100 rounded-lg transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}

              {recipes.length > 0 ? (
                <motion.div variants={itemVariants} className="space-y-8">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h2 className="text-3xl font-serif font-bold text-gray-900">Your Personalized Recipes</h2>
                      <p className="text-emerald-600 font-medium">Based on your ingredients and health profile.</p>
                    </div>
                    <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setRecipes([]);
                        setExpandedRecipeIndex(0);
                        setImage(null);
                        setDetectedIngredients([]);
                        setIsManualMode(false);
                      }}
                      className="flex items-center gap-2 px-5 py-2.5 bg-emerald-50 text-emerald-700 font-bold hover:bg-emerald-100 rounded-xl transition-all shadow-sm"
                    >
                      <RefreshCw className="w-4 h-4" />
                      {t.startOver}
                    </motion.button>
                  </div>

                  <motion.div variants={containerVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <motion.div variants={itemVariants} className="space-y-6">
                      {image && (
                        <div className="relative aspect-video rounded-3xl overflow-hidden shadow-lg border border-black/5">
                          <img src={image} alt="Original ingredients" className="w-full h-full object-cover" />
                        </div>
                      )}
                      
                      <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm space-y-4">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                          <Utensils className="w-5 h-5 text-emerald-500" />
                          {t.ingredientsUsed}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {detectedIngredients.map((ing, i) => (
                            <span key={i} className="px-3 py-1 bg-gray-50 text-gray-600 rounded-lg text-xs font-semibold border border-gray-100">
                              {ing}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="bg-emerald-600 p-8 rounded-3xl text-white space-y-4 shadow-xl shadow-emerald-600/20">
                        <ChefHat className="w-10 h-10 opacity-50" />
                        <h3 className="text-xl font-bold">{t.wantMoreVariety}</h3>
                        <p className="text-emerald-100 text-sm leading-relaxed">
                          {t.wantMoreVarietyDesc}
                        </p>
                      </div>
                    </motion.div>

                    <motion.div variants={containerVariants} className="space-y-6">
                      {recipes.map((recipe, idx) => (
                        <motion.div
                          key={idx}
                          variants={itemVariants}
                          className={`bg-white rounded-3xl border ${expandedRecipeIndex === idx ? 'border-emerald-500 shadow-xl shadow-emerald-500/10 scale-[1.02]' : 'border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-emerald-200'} overflow-hidden transition-all duration-300 cursor-pointer`}
                          onClick={() => setExpandedRecipeIndex(expandedRecipeIndex === idx ? -1 : idx)}
                        >
                          {recipe.image_loading ? (
                            <div className={`w-full bg-emerald-50/50 flex flex-col items-center justify-center transition-all duration-300 ${expandedRecipeIndex === idx ? 'aspect-video' : 'h-48'}`}>
                              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mb-2" />
                              <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">{t.cookingImage}</span>
                            </div>
                          ) : recipe.image_error ? (
                            <div className={`w-full bg-orange-50 flex flex-col items-center justify-center text-orange-400 transition-all duration-300 ${expandedRecipeIndex === idx ? 'aspect-video' : 'h-48'}`}>
                              <AlertCircle className="w-8 h-8 mb-2" />
                              <span className="text-xs font-bold uppercase tracking-widest">{t.imageUnavailable}</span>
                            </div>
                          ) : recipe.image_url ? (
                            <div className={`w-full overflow-hidden transition-all duration-500 relative ${expandedRecipeIndex === idx ? 'aspect-video' : 'h-48'}`}>
                              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent z-10" />
                              <img 
                                src={recipe.image_url} 
                                alt={recipe.name} 
                                className="w-full h-full object-cover transition-transform duration-700 hover:scale-110"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          ) : (
                            <div className={`w-full bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center transition-all duration-300 ${expandedRecipeIndex === idx ? 'aspect-video' : 'h-48'}`}>
                              <Utensils className="w-12 h-12 text-emerald-200" />
                            </div>
                          )}
                          
                          <div className="p-6 space-y-4">
                            <div className="flex justify-between items-start">
                              <div className="space-y-1.5">
                                <h4 className="text-xl font-bold text-gray-900 leading-tight">{recipe.name}</h4>
                                <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                  <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">{recipe.cuisine}</span>
                                  <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-md">
                                    <Clock className="w-3 h-3" />
                                    {recipe.cook_time}
                                  </span>
                                  <span className="bg-gray-50 px-2 py-1 rounded-md">{recipe.difficulty}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="bg-gradient-to-r from-emerald-400 to-teal-500 px-3 py-1 rounded-full text-white text-sm font-bold shrink-0 shadow-md shadow-emerald-500/20">
                                  {recipe.calories} kcal
                                </div>
                                <motion.div animate={{ rotate: expandedRecipeIndex === idx ? 90 : 0 }} className={cn("p-2 rounded-full transition-colors", expandedRecipeIndex === idx ? "bg-emerald-100 text-emerald-600" : "bg-gray-50 text-gray-400")}>
                                  <ChevronRight className="w-5 h-5" />
                                </motion.div>
                              </div>
                            </div>

                            {expandedRecipeIndex === idx && (
                              <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="space-y-4 pt-4 border-t border-gray-50"
                              >
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2 bg-emerald-50/30 p-4 rounded-2xl border border-emerald-100/50">
                                    <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      {t.ingredientsYouHave}
                                    </div>
                                    <ul className="text-xs text-gray-700 space-y-1.5">
                                      {(Array.isArray(recipe?.ingredients) ? recipe.ingredients : []).map((ing, i) => (
                                        <li key={i} className="flex items-start gap-2">
                                          <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full mt-1 shrink-0" />
                                          <span className="leading-tight">{ing}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  {recipe?.missing_ingredients?.length > 0 && (
                                    <div className="space-y-2 bg-amber-50/30 p-4 rounded-2xl border border-amber-100/50">
                                      <div className="text-[10px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1.5">
                                        <ShoppingCart className="w-3.5 h-3.5" />
                                        {t.ingredientsYouNeed}
                                      </div>
                                      <ul className="text-xs text-gray-700 space-y-1.5">
                                        {(Array.isArray(recipe?.missing_ingredients) ? recipe.missing_ingredients : []).map((ing, i) => (
                                          <li key={i} className="flex items-start gap-2">
                                            <div className="w-1.5 h-1.5 bg-amber-400 rounded-full mt-1 shrink-0" />
                                            <span className="leading-tight">{ing}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>

                                <div className="grid grid-cols-3 gap-2 py-4 border-y border-gray-100">
                                  <div className="text-center space-y-1">
                                    <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest">{t.protein}</div>
                                    <div className="font-bold text-lg text-gray-900">{recipe.protein}</div>
                                  </div>
                                  <div className="text-center space-y-1 border-x border-gray-100">
                                    <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest">{t.carbs}</div>
                                    <div className="font-bold text-lg text-gray-900">{recipe.carbs}</div>
                                  </div>
                                  <div className="text-center space-y-1">
                                    <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest">{t.fat}</div>
                                    <div className="font-bold text-lg text-gray-900">{recipe.fat}</div>
                                  </div>
                                </div>

                                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-5 rounded-2xl space-y-4 border border-emerald-100/50 shadow-inner">
                                  <div className="flex items-center gap-2 text-emerald-700">
                                    <ShieldCheck className="w-5 h-5" />
                                    <span className="text-xs font-bold uppercase tracking-widest">{t.nutritionBenefits}</span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-3 text-[11px] font-bold text-emerald-800 bg-white/50 p-3 rounded-xl">
                                    <div className="flex flex-col"><span className="text-[9px] text-emerald-600/70 uppercase">{t.fiber}</span>{(recipe as any).fiber}</div>
                                    <div className="flex flex-col"><span className="text-[9px] text-emerald-600/70 uppercase">{t.sugar}</span>{(recipe as any).sugar}</div>
                                    <div className="flex flex-col"><span className="text-[9px] text-emerald-600/70 uppercase">{t.sodium}</span>{(recipe as any).sodium}</div>
                                  </div>
                                  <div className="text-xs leading-relaxed text-emerald-800 font-medium">
                                    {(recipe as any).health_benefit}
                                  </div>
                                </div>

                                <div className="space-y-4 pt-4">
                                  <div className="text-sm font-bold flex items-center gap-2 text-gray-900 border-b border-gray-100 pb-2">
                                    <FileText className="w-5 h-5 text-emerald-500" />
                                    {t.prepSteps}
                                  </div>
                                  <ol className="space-y-4">
                                    {(Array.isArray(recipe?.steps) ? recipe.steps : []).map((step, i) => (
                                      <li key={i} className="flex gap-4 group">
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                                          {i + 1}
                                        </div>
                                        <p className="text-sm text-gray-700 leading-relaxed pt-1">{step}</p>
                                      </li>
                                    ))}
                                  </ol>
                                </div>
                              </motion.div>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  </motion.div>
                </motion.div>
              ) : !image && !isManualMode ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-20 px-4 text-center space-y-10 relative overflow-hidden rounded-[3rem] bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 text-white shadow-2xl shadow-emerald-500/30"
                >
                  {/* Decorative floating elements */}
                  <motion.div animate={{ y: [0, -15, 0] }} transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }} className="absolute top-10 left-10 text-5xl opacity-80 drop-shadow-lg">🥑</motion.div>
                  <motion.div animate={{ y: [0, 20, 0] }} transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }} className="absolute bottom-20 left-20 text-6xl opacity-80 drop-shadow-lg">🥗</motion.div>
                  <motion.div animate={{ y: [0, -20, 0] }} transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut" }} className="absolute top-20 right-16 text-6xl opacity-80 drop-shadow-lg">🍳</motion.div>
                  <motion.div animate={{ y: [0, 15, 0] }} transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut" }} className="absolute bottom-10 right-24 text-5xl opacity-80 drop-shadow-lg">🍓</motion.div>

                  <div className="space-y-6 relative z-10 max-w-2xl mx-auto">
                    <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", bounce: 0.5, duration: 0.8 }} className="bg-white/20 p-5 rounded-[2rem] inline-flex items-center justify-center backdrop-blur-md mb-2 border border-white/30 shadow-xl">
                      <Sparkles className="w-12 h-12 text-yellow-300" />
                    </motion.div>
                    <h2 className="text-5xl md:text-6xl font-serif font-bold tracking-tight text-white drop-shadow-md">
                      {t.heroTitle}
                    </h2>
                    <p className="text-lg md:text-xl text-emerald-50 max-w-xl mx-auto leading-relaxed font-medium drop-shadow-sm">
                      {t.heroSub}
                    </p>
                  </div>
                  
                  <div className="flex flex-wrap justify-center gap-4 relative z-10 w-full max-w-md mx-auto">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 min-w-[200px] flex items-center justify-center gap-3 px-8 py-5 bg-white text-emerald-600 rounded-2xl font-bold text-lg shadow-xl hover:shadow-2xl transition-all duration-300"
                    >
                      <Camera className="w-6 h-6" />
                      {t.takePhoto}
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setIsManualMode(true)}
                      className="flex-1 min-w-[200px] flex items-center justify-center gap-3 px-8 py-5 bg-emerald-700/40 text-white border border-white/30 backdrop-blur-sm rounded-2xl font-bold text-lg hover:bg-emerald-700/60 transition-all duration-300"
                    >
                      <Edit2 className="w-6 h-6" />
                      {t.typeIng}
                    </motion.button>
                  </div>

                  <div className="max-w-md mx-auto w-full pt-8 relative z-10">
                    <div className="relative group">
                      <input
                        type="text"
                        placeholder={t.quickAdd}
                        className="w-full px-6 py-5 bg-white/10 backdrop-blur-md border border-white/30 text-white placeholder-emerald-100 rounded-2xl shadow-lg focus:outline-none focus:ring-2 focus:ring-white/50 rtl:pl-44 ltr:pr-44 transition-all group-hover:bg-white/20"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = (e.target as HTMLInputElement).value;
                            if (val) {
                              const ings = val.split(/[,،，、\n]/).map(i => i.trim()).filter(i => i);
                              generateRecipes(ings);
                              (e.target as HTMLInputElement).value = "";
                            }
                          }
                        }}
                      />
                      <div className="absolute right-2 top-2 bottom-2 flex gap-2">
                        <motion.button 
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={toggleVoice}
                          className={cn(
                            "px-4 rounded-xl transition-all flex items-center justify-center backdrop-blur-md",
                            isListening ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30" : "bg-white/20 text-white hover:bg-white/30"
                          )}
                        >
                          <Mic className="w-5 h-5" />
                        </motion.button>
                        {voiceTranscript && (
                          <motion.button 
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              const ings = voiceTranscript.split(/[,،，、\n]/).map(i => i.trim()).filter(i => i);
                              generateRecipes(ings);
                              setVoiceTranscript("");
                            }}
                            className="px-5 bg-white text-emerald-600 rounded-xl font-bold text-sm shadow-lg transition-all"
                          >
                            {t.generate}
                          </motion.button>
                        )}
                        <motion.button 
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => {
                            const input = (e.currentTarget.parentElement?.previousSibling as HTMLInputElement);
                            const val = input.value;
                            if (val) {
                              const ings = val.split(/[,،，、\n]/).map(i => i.trim()).filter(i => i);
                              generateRecipes(ings);
                              input.value = "";
                            }
                          }}
                          className="px-5 bg-white text-emerald-600 rounded-xl font-bold text-sm shadow-lg transition-all"
                        >
                          {t.generate}
                        </motion.button>
                      </div>
                    </div>
                  </div>
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                </motion.div>
              ) : isManualMode ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }} 
                  animate={{ opacity: 1, scale: 1 }}
                  className="max-w-2xl mx-auto bg-white p-8 rounded-3xl border border-black/5 shadow-sm space-y-6"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-serif font-bold">{t.manualRecipe}</h2>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => {
                          setNewIngredient("");
                          setCustomDescription("");
                        }}
                        className="text-xs font-bold text-gray-400 uppercase tracking-widest hover:text-red-500 transition-colors"
                      >
                        {t.clearAll}
                      </button>
                      <motion.button 
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setIsManualMode(false)} 
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-6 h-6" />
                      </motion.button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center justify-between">
                        {t.whatIng}
                        <motion.button 
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={toggleVoice}
                          className={cn(
                            "p-1.5 rounded-lg transition-all",
                            isListening ? "bg-red-500 text-white animate-pulse" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          )}
                        >
                          <Mic className="w-3.5 h-3.5" />
                        </motion.button>
                        {voiceTranscript && (
                          <motion.button 
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setNewIngredient(prev => prev ? `${prev}, ${voiceTranscript}` : voiceTranscript);
                              setVoiceTranscript("");
                            }}
                            className="px-3 py-1 bg-emerald-600 text-white rounded-lg font-bold text-xs hover:bg-emerald-700 transition-all"
                          >
                            Add
                          </motion.button>
                        )}
                      </label>
                      <textarea
                        value={newIngredient}
                        onChange={(e) => setNewIngredient(e.target.value)}
                        placeholder="e.g. Chicken, broccoli, garlic, lemon..."
                        className="w-full h-32 p-4 bg-gray-50 border border-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-400 uppercase tracking-widest">{t.describePlate}</label>
                      <textarea
                        value={customDescription}
                        onChange={(e) => setCustomDescription(e.target.value)}
                        placeholder="e.g. I want a spicy Mediterranean bowl that is high in protein..."
                        className="w-full h-32 p-4 bg-gray-50 border border-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          const ings = newIngredient.split(/[,،，、\n]/).map(i => i.trim()).filter(i => i);
                          setDetectedIngredients(ings);
                          setNewIngredient("");
                          setIsEditingIngredients(true);
                          setIsManualMode(false);
                        }}
                        className="py-4 bg-white border border-gray-200 text-gray-700 rounded-2xl font-bold hover:bg-gray-50 transition-all"
                      >
                        {t.reviewIng}
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          const ings = newIngredient.split(/[,،，、\n]/).map(i => i.trim()).filter(i => i);
                          generateRecipes(ings);
                        }}
                        className="py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
                      >
                        {t.generateNow}
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="grid grid-cols-1 lg:grid-cols-2 gap-8"
                >
                  <div className="space-y-4">
                    <div className="relative aspect-square rounded-3xl overflow-hidden shadow-2xl bg-gray-200 group">
                      <img src={image} alt="Target" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => setImage(null)}
                        className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    {!detectedIngredients.length && !isAnalyzing && (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={scanFood}
                        className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                      >
                        {t.scanIng} <ArrowRight className="w-5 h-5 rtl:rotate-180" />
                      </motion.button>
                    )}
                  </div>

                  <div className="space-y-6">
                    {isAnalyzing && (
                      <div className="bg-white p-12 rounded-3xl border border-black/5 flex flex-col items-center justify-center text-center space-y-4 shadow-sm">
                        <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
                        <div className="space-y-1">
                          <h3 className="text-xl font-bold">{t.aiThinking}</h3>
                          <p className="text-gray-500">{t.identifying}</p>
                        </div>
                      </div>
                    )}

                    {isEditingIngredients && !isAnalyzing && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm space-y-6">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xl font-bold">{t.detectedIng}</h3>
                          <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">{t.editList}</span>
                        </div>
                        
                        <div className="flex flex-wrap gap-2">
                          {detectedIngredients.map((ing, idx) => (
                            <motion.div 
                              whileHover={{ scale: 1.05 }}
                              key={idx} 
                              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-semibold group"
                            >
                              {ing}
                              <button onClick={() => setDetectedIngredients(prev => prev.filter((_, i) => i !== idx))} className="hover:text-red-500">
                                <X className="w-3 h-3" />
                              </button>
                            </motion.div>
                          ))}
                        </div>

                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newIngredient}
                            onChange={(e) => setNewIngredient(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && newIngredient) {
                                setDetectedIngredients([...detectedIngredients, newIngredient]);
                                setNewIngredient("");
                              }
                            }}
                            placeholder={t.addMissing}
                            className="flex-1 px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          />
                          <motion.button 
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              if (newIngredient) {
                                setDetectedIngredients([...detectedIngredients, newIngredient]);
                                setNewIngredient("");
                              }
                            }}
                            className="p-2 bg-emerald-600 text-white rounded-xl"
                          >
                            <Plus className="w-5 h-5" />
                          </motion.button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                          <div className="flex items-center gap-2">
                            <Utensils className="w-4 h-4 text-emerald-600" />
                            <span className="text-sm font-bold text-emerald-800">{t.includePantry}</span>
                          </div>
                          <motion.button 
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setIncludePantry(!includePantry)}
                            className={cn(
                              "w-12 h-6 rounded-full transition-all relative",
                              includePantry ? "bg-emerald-600" : "bg-gray-200"
                            )}
                          >
                            <div className={cn(
                              "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                              includePantry ? "left-7" : "left-1"
                            )} />
                          </motion.button>
                        </div>

                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => generateRecipes()}
                          className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                        >
                          {t.generateRecipes} <ChefHat className="w-5 h-5" />
                        </motion.button>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'pantry' && (
            <motion.div 
              key="pantry" 
              variants={containerVariants}
              initial="hidden"
              animate="show"
              exit="hidden"
              className="space-y-8"
            >
              <motion.div variants={itemVariants} className="flex items-center justify-between">
                <div className="space-y-1">
                  <h2 className="text-3xl font-serif font-bold">{t.myPantry}</h2>
                  <p className="text-gray-500">{t.keepTrack}</p>
                </div>
                <div className="flex items-center gap-3">
                  <motion.label 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-2 px-6 py-3 bg-white text-emerald-600 border-2 border-emerald-100 rounded-2xl font-bold hover:bg-emerald-50 transition-colors cursor-pointer shadow-sm"
                  >
                    <Camera className="w-5 h-5" />
                    {t.scanPantry}
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePantryFileChange} />
                  </motion.label>
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      const name = prompt(t.ingredientName);
                      if (name) addToPantry({ name, quantity: "1 unit" });
                    }}
                    className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                    {t.addItem}
                  </motion.button>
                </div>
              </motion.div>

              {pantryImage && (
                <motion.div variants={itemVariants} className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold">{t.pantryScan}</h3>
                    <button onClick={() => { setPantryImage(null); setIsEditingPantryScan(false); setDetectedPantryItems([]); }} className="text-gray-400 hover:text-gray-600">
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                  
                  <div className="aspect-video relative rounded-2xl overflow-hidden bg-gray-100">
                    <img src={pantryImage} alt="Pantry scan" className="w-full h-full object-cover" />
                    {isScanningPantry && (
                      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
                        <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
                        <p className="text-emerald-700 font-medium animate-pulse">{t.analyzingPantry}</p>
                      </div>
                    )}
                  </div>

                  {!isScanningPantry && !isEditingPantryScan && detectedPantryItems.length === 0 && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={scanPantryImage}
                      className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                    >
                      <Sparkles className="w-5 h-5" />
                      {t.analyzeImage}
                    </motion.button>
                  )}

                  {isEditingPantryScan && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                      <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-emerald-900 flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                            {t.detectedItems}
                          </h3>
                          <span className="text-sm font-medium text-emerald-600 bg-emerald-100 px-3 py-1 rounded-full">
                            {detectedPantryItems.length} {t.items}
                          </span>
                        </div>
                        
                        <div className="flex flex-wrap gap-2">
                          {detectedPantryItems.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-emerald-100 shadow-sm group">
                              <span className="font-medium text-gray-700">{item}</span>
                              <button 
                                onClick={() => setDetectedPantryItems(prev => prev.filter((_, i) => i !== idx))}
                                className="text-gray-400 hover:text-red-500 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-2 pt-2">
                          <input
                            type="text"
                            value={newPantryIngredient}
                            onChange={(e) => setNewPantryIngredient(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && newPantryIngredient.trim()) {
                                setDetectedPantryItems(prev => [...prev, newPantryIngredient.trim()]);
                                setNewPantryIngredient("");
                              }
                            }}
                            placeholder={t.addMissedItem}
                            className="flex-1 px-4 py-2 rounded-xl border border-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          />
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              if (newPantryIngredient.trim()) {
                                setDetectedPantryItems(prev => [...prev, newPantryIngredient.trim()]);
                                setNewPantryIngredient("");
                              }
                            }}
                            className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl font-bold hover:bg-emerald-200 transition-colors"
                          >
                            {t.add}
                          </motion.button>
                        </div>
                      </div>

                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={addScannedItemsToPantry}
                        className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                      >
                        <Plus className="w-5 h-5" />
                        {t.add} {detectedPantryItems.length} {t.addItemsToPantry}
                      </motion.button>
                    </motion.div>
                  )}
                </motion.div>
              )}

              <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pantry.length === 0 && !pantryImage && (
                  <motion.div variants={itemVariants} className="col-span-full py-20 text-center space-y-6 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-[3rem] border border-emerald-100/50 shadow-inner">
                    <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto shadow-md">
                      <Utensils className="w-10 h-10 text-emerald-300" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-2xl font-serif font-bold text-emerald-900">{t.pantryEmpty}</h3>
                      <p className="text-emerald-600/80 max-w-sm mx-auto">{t.scanFridgeStart}</p>
                    </div>
                  </motion.div>
                )}
                {pantry.map((item) => (
                  <motion.div variants={itemVariants} key={item.id} className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm flex items-center justify-between group hover:shadow-md hover:-translate-y-1 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="bg-emerald-50 p-3 rounded-2xl group-hover:bg-emerald-100 transition-colors">
                        <Utensils className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <div className="font-bold text-lg text-gray-800">{item.name}</div>
                        <div className="text-sm text-gray-400">{item.quantity}</div>
                      </div>
                    </div>
                    <motion.button 
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => item.id && removeFromPantry(item.id)}
                      className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-5 h-5" />
                    </motion.button>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          )}

          {activeTab === 'health' && (
            <motion.div 
              key="health" 
              variants={containerVariants}
              initial="hidden"
              animate="show"
              exit="hidden"
              className="space-y-8 max-w-2xl mx-auto"
            >
              <motion.div variants={itemVariants} className="text-center space-y-2">
                <h2 className="text-3xl font-serif font-bold">{t.healthProfile}</h2>
                <p className="text-gray-500">{t.healthProfileDesc}</p>
              </motion.div>

              <motion.div variants={itemVariants} className="space-y-4">
                <h3 className="text-xl font-bold">{t.dietaryPrefs}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { id: 'vegetarian', label: t.vegetarian, desc: t.vegetarianDesc },
                    { id: 'vegan', label: t.vegan, desc: t.veganDesc },
                    { id: 'keto', label: t.keto, desc: t.ketoDesc },
                    { id: 'paleo', label: t.paleo, desc: t.paleoDesc },
                    { id: 'gluten-free', label: t.glutenFree, desc: t.glutenFreeDesc },
                    { id: 'dairy-free', label: t.dairyFree, desc: t.dairyFreeDesc },
                  ].map((item) => (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      key={item.id}
                      onClick={() => toggleDietaryPref(item.id)}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-3xl border transition-all text-left",
                        dietaryPrefs.includes(item.id)
                          ? "bg-emerald-50 border-emerald-200 ring-2 ring-emerald-500/10"
                          : "bg-white border-black/5 hover:border-emerald-200"
                      )}
                    >
                      <div className="space-y-1">
                        <div className="font-bold text-lg">{item.label}</div>
                        <div className="text-sm text-gray-500">{item.desc}</div>
                      </div>
                      {dietaryPrefs.includes(item.id) && (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}>
                          <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                        </motion.div>
                      )}
                    </motion.button>
                  ))}
                </div>
              </motion.div>

              <motion.div variants={itemVariants} className="space-y-4">
                <h3 className="text-xl font-bold">{t.healthConditions}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { id: 'diabetes', label: t.diabetes, desc: t.diabetesDesc },
                    { id: 'high-blood-pressure', label: t.highBloodPressure, desc: t.highBloodPressureDesc },
                    { id: 'low-blood-pressure', label: t.lowBloodPressure, desc: t.lowBloodPressureDesc },
                    { id: 'cholesterol', label: t.cholesterol, desc: t.cholesterolDesc },
                    { id: 'weight-gain', label: t.weightGain, desc: t.weightGainDesc },
                    { id: 'weight-loss', label: t.weightLoss, desc: t.weightLossDesc },
                  ].map((item) => (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      key={item.id}
                      onClick={() => toggleCondition(item.id)}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-3xl border transition-all text-left",
                        healthConditions.includes(item.id)
                          ? "bg-emerald-50 border-emerald-200 ring-2 ring-emerald-500/10"
                          : "bg-white border-black/5 hover:border-emerald-200"
                      )}
                    >
                      <div className="space-y-1">
                        <div className="font-bold text-lg">{item.label}</div>
                        <div className="text-sm text-gray-500">{item.desc}</div>
                      </div>
                      {healthConditions.includes(item.id) && (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}>
                          <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                        </motion.div>
                      )}
                    </motion.button>
                  ))}
                </div>
              </motion.div>

              <motion.div variants={itemVariants} className="bg-amber-50 p-6 rounded-3xl border border-amber-100 flex gap-4">
                <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
                <div className="text-sm text-amber-800 leading-relaxed">
                  <span className="font-bold">{t.medicalDisclaimer}</span> {t.medicalDisclaimerText}
                </div>
              </motion.div>
            </motion.div>
          )}

          {activeTab === 'mealplan' && (
            <motion.div 
              key="mealplan" 
              variants={containerVariants}
              initial="hidden"
              animate="show"
              exit="hidden"
              className="space-y-8"
            >
              <motion.div variants={itemVariants} className="flex items-center justify-between">
                <div className="space-y-1">
                  <h2 className="text-3xl font-serif font-bold text-gray-900">{t.mealPlanTitle}</h2>
                  <p className="text-emerald-600 font-medium">{t.mealPlanDesc}</p>
                </div>
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={generateMealPlan}
                  disabled={isGeneratingMealPlan}
                  className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all disabled:opacity-50"
                >
                  {isGeneratingMealPlan ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  {mealPlan ? t.regeneratePlan : t.generatePlan}
                </motion.button>
              </motion.div>

              {isGeneratingMealPlan ? (
                <motion.div variants={itemVariants} className="flex flex-col items-center justify-center py-20 space-y-6 bg-white rounded-3xl border border-emerald-100 shadow-sm">
                  <div className="relative">
                    <div className="absolute inset-0 bg-emerald-400 blur-xl opacity-20 rounded-full animate-pulse" />
                    <Loader2 className="w-16 h-16 text-emerald-500 animate-spin relative z-10" />
                  </div>
                  <div className="space-y-2 text-center">
                    <h3 className="text-xl font-bold text-gray-900">{t.craftingMenu}</h3>
                    <p className="text-emerald-600 font-medium animate-pulse">{t.analyzingHealth}</p>
                  </div>
                </motion.div>
              ) : mealPlan ? (
                <motion.div variants={containerVariants} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
                      {mealPlan.plan.map((dayPlan, idx) => (
                        <motion.div 
                          variants={itemVariants}
                          key={idx} 
                          className="bg-white p-5 rounded-3xl border border-emerald-100 shadow-sm hover:shadow-xl hover:shadow-emerald-500/10 hover:-translate-y-1 transition-all duration-300 space-y-5"
                        >
                        <div className="text-center font-bold text-emerald-700 bg-emerald-50 py-2 rounded-xl uppercase tracking-widest text-xs border border-emerald-100/50">
                          {dayPlan.day}
                        </div>
                        <div className="space-y-4">
                          <button onClick={() => setSelectedMeal(dayPlan.breakfast)} className="w-full text-left space-y-1.5 group">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-500 uppercase tracking-widest">
                              <Coffee className="w-3.5 h-3.5" /> {t.breakfast}
                            </div>
                            <div className="text-sm font-semibold text-gray-800 leading-snug group-hover:text-emerald-600 transition-colors">{dayPlan.breakfast.name}</div>
                          </button>
                          <div className="w-full h-px bg-gradient-to-r from-transparent via-gray-100 to-transparent" />
                          <button onClick={() => setSelectedMeal(dayPlan.lunch)} className="w-full text-left space-y-1.5 group">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-orange-500 uppercase tracking-widest">
                              <Sun className="w-3.5 h-3.5" /> {t.lunch}
                            </div>
                            <div className="text-sm font-semibold text-gray-800 leading-snug group-hover:text-emerald-600 transition-colors">{dayPlan.lunch.name}</div>
                          </button>
                          <div className="w-full h-px bg-gradient-to-r from-transparent via-gray-100 to-transparent" />
                          <button onClick={() => setSelectedMeal(dayPlan.dinner)} className="w-full text-left space-y-1.5 group">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-500 uppercase tracking-widest">
                              <Moon className="w-3.5 h-3.5" /> {t.dinner}
                            </div>
                            <div className="text-sm font-semibold text-gray-800 leading-snug group-hover:text-emerald-600 transition-colors">{dayPlan.dinner.name}</div>
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  
                  <motion.div 
                    variants={itemVariants}
                    className="bg-white p-8 rounded-[2.5rem] border border-emerald-100 shadow-xl shadow-emerald-500/5 space-y-8 relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50 rounded-full blur-3xl -mr-32 -mt-32 opacity-50" />
                    <div className="flex items-center gap-3 relative z-10">
                      <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
                        <ShoppingCart className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900">{t.shoppingList}</h3>
                        <p className="text-sm font-medium text-emerald-600">{t.shoppingListDesc}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-4 relative z-10">
                      {mealPlan.shoppingList.map((item, i) => (
                        <motion.label 
                          whileHover={{ scale: 1.02 }}
                          key={i} 
                          className="flex items-center gap-4 p-3 rounded-2xl hover:bg-emerald-50 transition-colors cursor-pointer group"
                        >
                          <div className="relative flex items-center justify-center w-6 h-6 rounded-lg border-2 border-emerald-200 group-hover:border-emerald-400 transition-colors bg-white">
                            <input type="checkbox" className="peer sr-only" />
                            <Check className="w-4 h-4 text-emerald-500 opacity-0 peer-checked:opacity-100 transition-opacity" />
                          </div>
                          <span className="text-sm font-semibold text-gray-700 group-hover:text-gray-900 transition-colors">{item}</span>
                        </motion.label>
                      ))}
                    </div>
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div variants={itemVariants} className="bg-gradient-to-br from-emerald-50 to-teal-50 p-16 rounded-[3rem] border border-emerald-100 shadow-inner text-center space-y-6">
                  <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/10 mb-6">
                    <Calendar className="w-10 h-10 text-emerald-500" />
                  </div>
                  <h3 className="text-3xl font-serif font-bold text-gray-900">{t.noMealPlan}</h3>
                  <p className="text-emerald-700 max-w-md mx-auto font-medium leading-relaxed">
                    {t.noMealPlanDesc}
                  </p>
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={generateMealPlan}
                    className="inline-flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition-all mt-4"
                  >
                    <Sparkles className="w-5 h-5" />
                    {t.createMyPlan}
                  </motion.button>
                </motion.div>
              )}
            </motion.div>
          )}

          {selectedMeal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedMeal(null)}>
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full space-y-4"
                onClick={e => e.stopPropagation()}
              >
                <h3 className="text-2xl font-bold text-gray-900">{selectedMeal.name}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-emerald-50 p-3 rounded-xl">
                    <p className="font-bold text-emerald-700">Calories</p>
                    <p className="text-emerald-900">{selectedMeal.calories}</p>
                  </div>
                  <div className="bg-emerald-50 p-3 rounded-xl">
                    <p className="font-bold text-emerald-700">Protein</p>
                    <p className="text-emerald-900">{selectedMeal.protein}</p>
                  </div>
                  <div className="bg-emerald-50 p-3 rounded-xl">
                    <p className="font-bold text-emerald-700">Carbs</p>
                    <p className="text-emerald-900">{selectedMeal.carbs}</p>
                  </div>
                  <div className="bg-emerald-50 p-3 rounded-xl">
                    <p className="font-bold text-emerald-700">Fat</p>
                    <p className="text-emerald-900">{selectedMeal.fat}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedMeal(null)} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold">Close</button>
              </motion.div>
            </div>
          )}
          {activeTab === 'history' && (
            <motion.div
              key="history"
              variants={containerVariants}
              initial="hidden"
              animate="show"
              exit="hidden"
              className="space-y-8"
            >
              <motion.div variants={itemVariants} className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-serif font-bold tracking-tight text-gray-900">{t.recipeHistory}</h2>
                  <p className="text-emerald-600 font-medium">{t.recipeHistoryDesc}</p>
                </div>
                <div className="relative">
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowClearHistoryConfirm(!showClearHistoryConfirm)}
                    className="flex items-center gap-2 px-4 py-2 text-red-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all text-sm font-bold border border-transparent hover:border-red-100"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t.clearAll}
                  </motion.button>
                  
                  {showClearHistoryConfirm && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className="absolute right-0 top-full mt-2 w-56 bg-white border border-red-100 shadow-xl shadow-red-500/10 rounded-2xl p-4 z-50 space-y-3 origin-top-right rtl:origin-top-left rtl:left-0 rtl:right-auto"
                    >
                      <p className="text-sm font-bold text-gray-900 text-center">{t.clearAllHistory}</p>
                      <div className="flex gap-2">
                        <button 
                          onClick={clearHistory}
                          className="flex-1 bg-red-500 text-white py-2 rounded-xl text-xs font-bold hover:bg-red-600 transition-colors shadow-sm shadow-red-500/20"
                        >
                          {t.yesClear}
                        </button>
                        <button 
                          onClick={() => setShowClearHistoryConfirm(false)}
                          className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-xl text-xs font-bold hover:bg-gray-200 transition-colors"
                        >
                          {t.cancel}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>

              {history.length === 0 ? (
                <motion.div variants={itemVariants} className="bg-gradient-to-br from-emerald-50 to-teal-50 p-16 rounded-[3rem] border border-emerald-100 shadow-inner text-center space-y-6">
                  <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/10 mb-6">
                    <History className="w-10 h-10 text-emerald-500" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-3xl font-serif font-bold text-gray-900">{t.noHistory}</h3>
                    <p className="text-emerald-700 max-w-sm mx-auto font-medium leading-relaxed">{t.noHistoryDesc}</p>
                  </div>
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setActiveTab('scanner')}
                    className="inline-flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition-all mt-4"
                  >
                    <Sparkles className="w-5 h-5" />
                    {t.startScanning}
                  </motion.button>
                </motion.div>
              ) : (
                <motion.div variants={containerVariants} className="space-y-8">
                  {history.map((item, index) => (
                    <motion.div 
                      variants={itemVariants}
                      key={item.id} 
                      className="bg-white rounded-[2.5rem] border border-emerald-100 overflow-hidden shadow-sm hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-300 group"
                    >
                      <div className="p-6 border-b border-emerald-50 bg-gradient-to-r from-emerald-50/50 to-transparent flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="bg-white p-3 rounded-2xl shadow-sm border border-emerald-100 group-hover:scale-110 transition-transform duration-300">
                            <Calendar className="w-5 h-5 text-emerald-600" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">{item.timestamp}</p>
                            <p className="text-xs font-medium text-emerald-600 line-clamp-1 mt-0.5">
                              <span className="text-gray-500 mr-1 rtl:ml-1 rtl:mr-0">{t.ingredients}</span> 
                              {item.ingredients.join(", ")}
                            </p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setHistory(prev => prev.filter(h => h.id !== item.id))}
                          className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                          title="Delete from history"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {(Array.isArray(item.recipes) ? item.recipes : []).map((recipe, idx) => (
                          <motion.div 
                            whileHover={{ scale: 1.02 }}
                            key={idx} 
                            className="space-y-4 group/recipe"
                          >
                            <div className="aspect-[4/3] rounded-3xl overflow-hidden bg-gray-100 relative shadow-inner">
                              {recipe.image_loading ? (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-emerald-50/50 space-y-3">
                                  <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest animate-pulse">Loading</span>
                                </div>
                              ) : recipe.image_error ? (
                                <div className="w-full h-full flex flex-col items-center justify-center text-red-400 bg-red-50 space-y-2">
                                  <AlertCircle className="w-8 h-8" />
                                  <span className="text-xs font-bold uppercase tracking-widest">Unavailable</span>
                                </div>
                              ) : recipe.image_url ? (
                                <img src={recipe.image_url} alt={recipe.name} className="w-full h-full object-cover transition-transform duration-700 group-hover/recipe:scale-110" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gray-50">
                                  <Utensils className="w-10 h-10 text-gray-300" />
                                </div>
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover/recipe:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-6">
                                <motion.button 
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => {
                                    setRecipes(Array.isArray(item.recipes) ? item.recipes : []);
                                    setExpandedRecipeIndex(idx);
                                    setActiveTab('scanner');
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  className="bg-white/90 backdrop-blur-sm text-emerald-900 px-6 py-2.5 rounded-2xl text-sm font-bold shadow-xl hover:bg-white transition-colors transform duration-200"
                                >
                                  View Recipe
                                </motion.button>
                              </div>
                            </div>
                            <div className="px-2">
                              <h4 className="font-bold text-base text-gray-900 line-clamp-1 group-hover/recipe:text-emerald-600 transition-colors">{recipe.name}</h4>
                              <div className="flex items-center gap-3 mt-1.5">
                                <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">{recipe.calories} kcal</span>
                                <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> {recipe.cook_time}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              key="settings" 
              variants={containerVariants}
              initial="hidden"
              animate="show"
              exit="hidden"
              className="space-y-8 max-w-2xl mx-auto"
            >
              <motion.div variants={itemVariants} className="text-center space-y-2">
                <h2 className="text-3xl font-serif font-bold text-gray-900">{t.preferences}</h2>
                <p className="text-emerald-600 font-medium">{t.preferencesDesc}</p>
              </motion.div>

              <motion.div variants={itemVariants} className="space-y-6">
                <motion.div variants={itemVariants} className="bg-white p-8 rounded-[2.5rem] border border-emerald-100 shadow-sm hover:shadow-md transition-shadow space-y-6">
                  <div className="flex items-center gap-3 border-b border-emerald-50 pb-4">
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
                      <Flame className="w-5 h-5" />
                    </div>
                    <label className="block text-sm font-bold text-gray-900 uppercase tracking-widest">{t.dailyCalorieTarget}</label>
                  </div>
                  <div className="flex items-center gap-6">
                    <input 
                      type="range" 
                      min="1200" 
                      max="4000" 
                      step="50"
                      value={calorieTarget}
                      onChange={(e) => saveSettings(language, inputLanguage, cuisine, e.target.value, maxMissingIngredients)}
                      className="flex-1 h-2.5 bg-gray-100 rounded-full appearance-none cursor-pointer accent-emerald-600 hover:accent-emerald-500 transition-all"
                    />
                    <div className="bg-emerald-50 px-5 py-2.5 rounded-2xl text-emerald-700 font-bold min-w-[110px] text-center border border-emerald-100 shadow-inner">
                      {calorieTarget} <span className="text-xs font-semibold opacity-80">kcal</span>
                    </div>
                  </div>
                  <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-emerald-400" />
                    {t.recipesWillAimFor}{Math.round(parseInt(calorieTarget)/3)} {t.kcalPerMeal}
                  </p>
                </motion.div>

                <motion.div variants={itemVariants} className="bg-white p-8 rounded-[2.5rem] border border-emerald-100 shadow-sm hover:shadow-md transition-shadow space-y-6">
                  <div className="flex items-center gap-3 border-b border-emerald-50 pb-4">
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
                      <Utensils className="w-5 h-5" />
                    </div>
                    <label className="block text-sm font-bold text-gray-900 uppercase tracking-widest">{t.preferredCuisine}</label>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      { id: 'Any', label: t.anyCuisine },
                      { id: 'Italian', label: t.italian },
                      { id: 'Mexican', label: t.mexican },
                      { id: 'Japanese', label: t.japanese },
                      { id: 'Indian', label: t.indian },
                      { id: 'Mediterranean', label: t.mediterranean },
                      { id: 'Chinese', label: t.chinese },
                      { id: 'French', label: t.french },
                      { id: 'Thai', label: t.thai }
                    ].map((c) => (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        key={c.id}
                        onClick={() => saveSettings(language, inputLanguage, c.id, calorieTarget, maxMissingIngredients)}
                        className={cn(
                          "px-4 py-3 rounded-2xl text-sm font-bold border-2 transition-all duration-200",
                          cuisine === c.id 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-500 shadow-sm" 
                            : "bg-white text-gray-600 border-gray-100 hover:border-emerald-200 hover:bg-gray-50"
                        )}
                      >
                        {c.label}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>

                <motion.div variants={itemVariants} className="bg-white p-8 rounded-[2.5rem] border border-emerald-100 shadow-sm hover:shadow-md transition-shadow space-y-6">
                  <div className="flex items-center gap-3 border-b border-emerald-50 pb-4">
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
                      <ShoppingCart className="w-5 h-5" />
                    </div>
                    <label className="block text-sm font-bold text-gray-900 uppercase tracking-widest">{t.maxMissingIngredients}</label>
                  </div>
                    <div className="flex items-center gap-6">
                      <input 
                        type="range" 
                        min="0" 
                        max="5" 
                        step="1"
                        value={maxMissingIngredients}
                        onChange={(e) => saveSettings(language, inputLanguage, cuisine, calorieTarget, e.target.value)}
                        className="flex-1 h-2.5 bg-gray-100 rounded-full appearance-none cursor-pointer accent-emerald-600 hover:accent-emerald-500 transition-all"
                      />
                      <div className="bg-emerald-50 px-5 py-2.5 rounded-2xl text-emerald-700 font-bold min-w-[70px] text-center border border-emerald-100 shadow-inner">
                        {maxMissingIngredients}
                      </div>
                    </div>
                    <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                      <Info className="w-4 h-4 text-emerald-400" />
                      {t.recipesWillAllowUpTo} {maxMissingIngredients} {t.missingIngredients}
                    </p>
                  </motion.div>

                <motion.div variants={itemVariants} className="bg-white p-8 rounded-[2.5rem] border border-emerald-100 shadow-sm hover:shadow-md transition-shadow space-y-6">
                  <div className="flex items-center gap-3 border-b border-emerald-50 pb-4">
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
                      <Mic className="w-5 h-5" />
                    </div>
                    <label className="block text-sm font-bold text-gray-900 uppercase tracking-widest">{t.voiceInputLanguage}</label>
                  </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {[
                        { id: 'English', label: t.english },
                        { id: 'Spanish', label: t.spanish },
                        { id: 'French', label: t.french },
                        { id: 'German', label: t.german },
                        { id: 'Chinese', label: t.chinese },
                        { id: 'Japanese', label: t.japanese },
                        { id: 'Arabic', label: t.arabic },
                        { id: 'Hindi', label: t.hindi },
                      ].map((l) => (
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          key={l.id}
                          onClick={() => saveSettings(language, l.id, cuisine, calorieTarget, maxMissingIngredients)}
                          className={cn(
                            "px-4 py-3 rounded-2xl text-sm font-bold border-2 transition-all duration-200",
                            inputLanguage === l.id 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-500 shadow-sm" 
                              : "bg-white text-gray-600 border-gray-100 hover:border-emerald-200 hover:bg-gray-50"
                          )}
                        >
                          {l.label}
                        </motion.button>
                      ))}
                    </div>
                    <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                      <Info className="w-4 h-4 text-emerald-400" />
                      {t.voiceInputLanguageDesc}
                    </p>
                  </motion.div>

                <motion.div variants={itemVariants} className="bg-white p-8 rounded-[2.5rem] border border-emerald-100 shadow-sm hover:shadow-md transition-shadow space-y-6">
                  <div className="flex items-center gap-3 border-b border-emerald-50 pb-4">
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
                      <Languages className="w-5 h-5" />
                    </div>
                    <label className="block text-sm font-bold text-gray-900 uppercase tracking-widest">{t.recipeOutputLang}</label>
                  </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {[
                        { id: 'English', label: t.english },
                        { id: 'Spanish', label: t.spanish },
                        { id: 'French', label: t.french },
                        { id: 'German', label: t.german },
                        { id: 'Chinese', label: t.chinese },
                        { id: 'Japanese', label: t.japanese },
                        { id: 'Arabic', label: t.arabic },
                        { id: 'Hindi', label: t.hindi },
                      ].map((l) => (
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          key={l.id}
                          onClick={() => saveSettings(l.id, inputLanguage, cuisine, calorieTarget, maxMissingIngredients)}
                          className={cn(
                            "px-4 py-3 rounded-2xl text-sm font-bold border-2 transition-all duration-200",
                            language === l.id 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-500 shadow-sm" 
                              : "bg-white text-gray-600 border-gray-100 hover:border-emerald-200 hover:bg-gray-50"
                          )}
                        >
                          {l.label}
                        </motion.button>
                      ))}
                    </div>
                    <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                      <Info className="w-4 h-4 text-emerald-400" />
                      {t.recipeOutputLanguageDesc}
                    </p>
                  </motion.div>

                <motion.div variants={itemVariants} className="bg-white p-8 rounded-[2.5rem] border border-emerald-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className="space-y-3">
                    {[
                      { label: t.privacyPolicy, icon: ShieldCheck },
                      { label: t.aiDisclaimer, icon: Info },
                      { label: t.termsOfService, icon: FileText },
                    ].map((item) => (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        key={item.label}
                        className="w-full flex items-center justify-between p-4 rounded-2xl border border-transparent hover:border-emerald-100 hover:bg-emerald-50 transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-gray-50 group-hover:bg-white rounded-xl transition-colors">
                            <item.icon className="w-5 h-5 text-gray-400 group-hover:text-emerald-600 transition-colors" />
                          </div>
                          <span className="font-bold text-gray-700 group-hover:text-gray-900 transition-colors">{item.label}</span>
                        </div>
                        <ChevronRight className={cn("w-5 h-5 text-gray-300 group-hover:text-emerald-500 transition-colors", uiLanguage === 'ar' ? "rotate-180" : "")} />
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showTrialModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-400 to-teal-500" />
                <button
                  onClick={() => setShowTrialModal(false)}
                  className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                
                <div className="text-center mb-8">
                  <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Sparkles className="w-10 h-10 text-emerald-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">Trial Limit Reached</h3>
                  <p className="text-gray-600 leading-relaxed">
                    You've used your {TRIAL_LIMIT} free AI scans. Create an account or log in to continue using NutriMoment and unlock unlimited features!
                  </p>
                </div>
                
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      setShowTrialModal(false);
                      setIsLoggedIn(false);
                      setAuthMode('signup');
                    }}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold shadow-lg shadow-emerald-200 transition-all active:scale-[0.98]"
                  >
                    Create Free Account
                  </button>
                  <button
                    onClick={() => {
                      setShowTrialModal(false);
                      setIsLoggedIn(false);
                      setAuthMode('login');
                    }}
                    className="w-full py-4 bg-white hover:bg-gray-50 text-emerald-600 border-2 border-emerald-100 hover:border-emerald-200 rounded-2xl font-bold transition-all active:scale-[0.98]"
                  >
                    Log In
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
        </>
      )}
    </div>
  );
}
