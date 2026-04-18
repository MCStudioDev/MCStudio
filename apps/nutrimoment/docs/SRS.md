# Software Requirements Specification
## NutriMoment — AI-Powered Nutrition & Recipe Platform
**Version:** 1.0  
**Date:** 2026-04-17  
**Status:** Draft  
**Author:** MCStudio Engineering

---

## Table of Contents
1. [Introduction](#1-introduction)
2. [Overall Description](#2-overall-description)
3. [Functional Requirements](#3-functional-requirements)
4. [Non-Functional Requirements](#4-non-functional-requirements)
5. [System Interfaces & Constraints](#5-system-interfaces--constraints)
6. [Data Model](#6-data-model)
7. [Gap Analysis — Current vs Required](#7-gap-analysis--current-vs-required)

---

## 1. Introduction

### 1.1 Purpose
This SRS defines the complete requirements for NutriMoment, an AI-powered web application that helps users manage their nutrition by scanning fridge contents, generating personalized recipes, tracking meals, and monitoring health goals.

### 1.2 Scope
NutriMoment is a Next.js 16 (App Router) web application deployed on Vercel. It uses Firebase for authentication and persistence, Google Gemini API for AI vision and text generation, and Tailwind CSS for UI. This document covers both the current state (v0.1.0) and the full intended product (v1.0.0).

### 1.3 Definitions
| Term | Definition |
|------|-----------|
| **Scan** | Process of uploading or capturing a fridge/pantry image for ingredient detection |
| **Inventory** | User's current pantry/fridge contents stored in Firestore |
| **Recipe** | AI-generated cooking instruction set with nutritional metadata |
| **Meal Plan** | AI-generated weekly schedule of meals based on inventory and health profile |
| **Health Profile** | User's dietary restrictions, allergies, health conditions, and caloric goals |
| **Gemini** | Google's multimodal LLM used for vision and text generation |
| **Tenant** | A single authenticated Firebase user with isolated data |

### 1.4 References
- Google Gemini API: `@google/generative-ai` v0.21.0
- Firebase SDK: v12.x
- Next.js App Router documentation
- USDA FoodData Central (future integration for nutritional accuracy)

---

## 2. Overall Description

### 2.1 Product Perspective
NutriMoment operates as a standalone SaaS web application within the MCStudio monorepo. It is independent of other MCStudio apps. All user data is isolated per Firebase UID. The AI layer is stateless — the application manages conversation context.

### 2.2 System Context Diagram
```
┌─────────────────────────────────────────────────────────────┐
│                         USER BROWSER                        │
│                                                             │
│   ┌──────────────┐    ┌──────────────┐    ┌─────────────┐  │
│   │  Next.js UI  │◄──►│ AuthContext  │◄──►│  Firebase   │  │
│   │  (React 19)  │    │  (Google)    │    │    Auth     │  │
│   └──────┬───────┘    └──────────────┘    └─────────────┘  │
│          │                                                  │
│          ▼                                                  │
│   ┌──────────────┐    ┌──────────────┐    ┌─────────────┐  │
│   │  API Routes  │◄──►│  Gemini API  │    │  Firestore  │  │
│   │  (Next.js)   │    │  (Google)    │    │  Database   │  │
│   └──────────────┘    └──────────────┘    └─────────────┘  │
│                                                             │
│                        ┌─────────────┐                     │
│                        │  Firebase   │                     │
│                        │   Storage   │                     │
│                        └─────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Product Functions (High-Level)
1. **Authentication** — Google OAuth sign-in and sign-out
2. **Fridge Scanning** — Camera capture or file upload → AI ingredient detection
3. **Inventory Management** — CRUD operations on pantry items with expiry tracking
4. **Recipe Generation** — AI-generated recipes from inventory with nutritional data
5. **Recipe Management** — Save, view, favorite, and share recipes
6. **Meal Planning** — AI-generated weekly meal plans based on inventory + health profile
7. **Health Profile** — Store dietary restrictions, allergies, conditions, caloric goals
8. **Nutrition Tracking** — Log meals, track macros vs targets
9. **History & Analytics** — Past scans, recipes, and nutritional trends

### 2.4 User Classes
| User Class | Description | Technical Level |
|-----------|-------------|-----------------|
| **General User** | Logs in, scans fridge, generates/views recipes | Low |
| **Health-Conscious User** | Sets health profile, tracks nutrition, plans meals | Medium |
| **Power User** | Manages full inventory, creates custom meal plans | Medium-High |
| **Admin** (future) | Manages app configuration, monitors usage | High |

### 2.5 Assumptions & Dependencies
- User has a Google account for authentication
- User has a device with a camera or image files
- GEMINI_API_KEY is valid and has quota for both vision and text models
- Firebase project is active with Firestore and Auth enabled
- Application is deployed with HTTPS (required for camera access)

---

## 3. Functional Requirements

### FR-01: Authentication

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01.1 | System SHALL allow users to sign in using Google OAuth | MUST |
| FR-01.2 | System SHALL create a user profile document in Firestore on first sign-in | MUST |
| FR-01.3 | System SHALL redirect unauthenticated users to the login page | MUST |
| FR-01.4 | System SHALL allow users to sign out, clearing session state | MUST |
| FR-01.5 | System SHALL persist authentication state across page refreshes | MUST |
| FR-01.6 | System SHALL display the user's name and avatar when authenticated | SHOULD |
| FR-01.7 | System SHALL support email/password authentication as a fallback | COULD |

---

### FR-02: Fridge Scanning

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-02.1 | System SHALL allow users to capture images from their device camera | MUST |
| FR-02.2 | System SHALL allow users to upload image files (JPG, PNG, WEBP, max 10MB) | MUST |
| FR-02.3 | System SHALL send the captured/uploaded image to Gemini vision API for analysis | MUST |
| FR-02.4 | System SHALL display a list of detected ingredients with confidence handling | MUST |
| FR-02.5 | System SHALL allow users to add, edit, or remove detected ingredients before saving | MUST |
| FR-02.6 | System SHALL fall back to mock ingredient data when GEMINI_API_KEY is unavailable | MUST |
| FR-02.7 | System SHALL display a scanning animation/progress indicator during analysis | SHOULD |
| FR-02.8 | System SHALL allow manual ingredient entry without scanning | SHOULD |
| FR-02.9 | System SHALL support multiple images in a single scan session | COULD |
| FR-02.10 | System SHALL save the scanned image to Firebase Storage linked to the scan event | COULD |

**Gemini Prompt Specification (FR-02):**
```
Model: gemini-2.0-flash
Role: Expert nutritionist and chef
Task: Identify all visible food ingredients in the provided image.
Output: JSON { "ingredients": string[], "confidence": "high"|"medium"|"low" }
Rules: No hallucination. Only list clearly visible items. Use singular form.
```

---

### FR-03: Inventory Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-03.1 | System SHALL display all inventory items for the authenticated user | MUST |
| FR-03.2 | System SHALL allow adding inventory items with name, quantity, unit, and expiry date | MUST |
| FR-03.3 | System SHALL allow editing existing inventory items | MUST |
| FR-03.4 | System SHALL allow deleting inventory items | MUST |
| FR-03.5 | System SHALL persist all inventory changes to Firestore in real-time | MUST |
| FR-03.6 | System SHALL display a freshness indicator based on expiry date | MUST |
| FR-03.7 | System SHALL highlight items expiring within 3 days as "expiring soon" | MUST |
| FR-03.8 | System SHALL highlight items past expiry date as "expired" | MUST |
| FR-03.9 | System SHALL support adding detected scan ingredients to inventory in one action | SHOULD |
| FR-03.10 | System SHALL categorize items by food group (produce, dairy, protein, etc.) | SHOULD |
| FR-03.11 | System SHALL allow filtering inventory by category or freshness status | COULD |
| FR-03.12 | System SHALL send browser notifications for items expiring in 24 hours | COULD |

**Firestore Schema (FR-03):**
```
users/{uid}/inventory/{itemId}
  name: string
  quantity: number
  unit: string           (g, ml, pieces, cups, etc.)
  category: string       (produce, dairy, protein, grain, condiment, other)
  expiryDate: Timestamp
  addedAt: Timestamp
  updatedAt: Timestamp
  imageUrl?: string
```

---

### FR-04: Recipe Generation

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-04.1 | System SHALL generate recipes from a list of provided ingredients using Gemini | MUST |
| FR-04.2 | System SHALL return a minimum of 3 recipe suggestions per generation request | MUST |
| FR-04.3 | System SHALL include for each recipe: name, cuisine, ingredient list, steps, nutritional info, cook time, difficulty | MUST |
| FR-04.4 | System SHALL distinguish between "available" and "missing" ingredients per recipe | MUST |
| FR-04.5 | System SHALL fall back to mock recipes when Gemini API is unavailable | MUST |
| FR-04.6 | System SHALL allow users to regenerate recipes with modified ingredient lists | SHOULD |
| FR-04.7 | System SHALL respect user dietary restrictions from health profile when generating | SHOULD |
| FR-04.8 | System SHALL allow users to specify cuisine preference for generation | SHOULD |
| FR-04.9 | System SHALL display estimated cost per recipe (future: grocery prices API) | COULD |
| FR-04.10 | System SHALL generate a recipe from a single food item name (quick recipe) | COULD |

**Recipe Data Structure:**
```typescript
interface Recipe {
  id: string;
  name: string;
  cuisine: string;
  description: string;
  ingredients: { name: string; amount: string; available: boolean }[];
  steps: string[];
  nutrition: {
    calories: number;
    protein: string;
    carbs: string;
    fat: string;
    fiber: string;
  };
  cookTime: string;
  prepTime: string;
  difficulty: 'easy' | 'medium' | 'hard';
  servings: number;
  tags: string[];
  generatedAt: Timestamp;
  isFavorite: boolean;
  imageUrl?: string;
}
```

---

### FR-05: Recipe Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-05.1 | System SHALL allow users to save generated recipes to their profile | MUST |
| FR-05.2 | System SHALL display a list of all saved recipes | MUST |
| FR-05.3 | System SHALL display full recipe detail on selection | MUST |
| FR-05.4 | System SHALL allow users to mark/unmark recipes as favorites | MUST |
| FR-05.5 | System SHALL allow users to delete saved recipes | MUST |
| FR-05.6 | System SHALL persist saved recipes to Firestore | MUST |
| FR-05.7 | System SHALL display recipe history sorted by generation date (newest first) | SHOULD |
| FR-05.8 | System SHALL allow searching and filtering saved recipes | SHOULD |
| FR-05.9 | System SHALL allow users to share a recipe via a public link | COULD |
| FR-05.10 | System SHALL generate a recipe card image for social sharing | COULD |

**Firestore Schema (FR-05):**
```
users/{uid}/recipes/{recipeId}
  ... (Recipe interface as above)
  savedAt: Timestamp
  source: 'generated' | 'manual' | 'shared'
```

---

### FR-06: Meal Planning

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-06.1 | System SHALL generate a 7-day meal plan using AI based on current inventory | MUST |
| FR-06.2 | System SHALL display meal plan as a weekly calendar (Mon–Sun) | MUST |
| FR-06.3 | System SHALL show breakfast, lunch, and dinner for each day | MUST |
| FR-06.4 | System SHALL link each meal to a full recipe | MUST |
| FR-06.5 | System SHALL calculate total daily nutrition from meal plan | MUST |
| FR-06.6 | System SHALL respect dietary restrictions from health profile | MUST |
| FR-06.7 | System SHALL allow swapping a single meal in the plan | SHOULD |
| FR-06.8 | System SHALL save generated meal plans to Firestore | SHOULD |
| FR-06.9 | System SHALL generate a grocery shopping list from a meal plan | SHOULD |
| FR-06.10 | System SHALL allow exporting meal plan as PDF or image | COULD |

**Firestore Schema (FR-06):**
```
users/{uid}/mealPlans/{planId}
  weekStart: Timestamp
  days: {
    monday: { breakfast: recipeRef, lunch: recipeRef, dinner: recipeRef }
    tuesday: { ... }
    ...
  }
  totalCalories: number
  createdAt: Timestamp
```

---

### FR-07: Health Profile

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-07.1 | System SHALL allow users to set daily caloric goal | MUST |
| FR-07.2 | System SHALL allow users to set dietary restrictions (vegan, keto, gluten-free, etc.) | MUST |
| FR-07.3 | System SHALL allow users to specify food allergies | MUST |
| FR-07.4 | System SHALL allow users to select health conditions (diabetes, hypertension, etc.) | MUST |
| FR-07.5 | System SHALL persist health profile to Firestore | MUST |
| FR-07.6 | System SHALL use health profile to filter/modify recipe generation | MUST |
| FR-07.7 | System SHALL allow users to set macro targets (protein/carb/fat percentages) | SHOULD |
| FR-07.8 | System SHALL calculate BMR/TDEE from user-provided weight, height, and age | SHOULD |
| FR-07.9 | System SHALL display medical disclaimer when health conditions are set | MUST |
| FR-07.10 | System SHALL NOT provide medical advice, only nutritional guidance | MUST |

**Firestore Schema (FR-07):**
```
users/{uid}/healthProfile
  caloricGoal: number
  dietaryRestrictions: string[]   (vegan, vegetarian, keto, paleo, gluten-free, etc.)
  allergies: string[]             (nuts, dairy, shellfish, eggs, soy, etc.)
  healthConditions: string[]      (diabetes_t2, hypertension, celiac, pcos, etc.)
  macroTargets: { protein: number, carbs: number, fat: number }  // percentages
  weight?: number                 (kg)
  height?: number                 (cm)
  age?: number
  activityLevel?: string          (sedentary, light, moderate, active, very_active)
  updatedAt: Timestamp
```

---

### FR-08: Nutrition Tracking

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-08.1 | System SHALL allow users to log meals consumed each day | MUST |
| FR-08.2 | System SHALL track daily caloric intake vs goal | MUST |
| FR-08.3 | System SHALL track daily macro intake (protein, carbs, fat) vs targets | MUST |
| FR-08.4 | System SHALL display a weekly nutrition summary | SHOULD |
| FR-08.5 | System SHALL display a progress ring/chart for daily goals | SHOULD |
| FR-08.6 | System SHALL allow logging meals from saved recipes in one tap | SHOULD |
| FR-08.7 | System SHALL allow manual nutritional entry | COULD |
| FR-08.8 | System SHALL display weekly and monthly trends as charts | COULD |

---

### FR-09: User Interface & Navigation

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-09.1 | System SHALL provide bottom tab navigation for: Scanner, Pantry, Meal Plan, Health, History, Settings | MUST |
| FR-09.2 | System SHALL display animated transitions between tabs | SHOULD |
| FR-09.3 | System SHALL be responsive and usable on mobile screens (375px+) | MUST |
| FR-09.4 | System SHALL display toast notifications for success/error feedback | MUST |
| FR-09.5 | System SHALL display a loading skeleton while data is fetching | SHOULD |
| FR-09.6 | System SHALL support system dark/light mode preference | SHOULD |
| FR-09.7 | System SHALL display user avatar and name in header | SHOULD |

---

## 4. Non-Functional Requirements

### NFR-01: Performance
| ID | Requirement | Target |
|----|-------------|--------|
| NFR-01.1 | Image analysis API call SHALL complete within | < 5 seconds |
| NFR-01.2 | Recipe generation SHALL complete within | < 8 seconds |
| NFR-01.3 | Page initial load (LCP) SHALL be | < 2.5 seconds |
| NFR-01.4 | Tab navigation SHALL animate within | < 200ms |
| NFR-01.5 | Firestore real-time updates SHALL reflect within | < 1 second |

### NFR-02: Security
| ID | Requirement |
|----|-------------|
| NFR-02.1 | All API keys SHALL be stored as server-side environment variables only (never NEXT_PUBLIC_) |
| NFR-02.2 | All Gemini API calls SHALL be made server-side (API routes or Server Actions) |
| NFR-02.3 | Firestore Security Rules SHALL restrict reads/writes to the authenticated user's own documents |
| NFR-02.4 | API routes SHALL validate that the requester is authenticated via Firebase ID token |
| NFR-02.5 | Rate limiting SHALL be applied to `/api/analyze-image` (max 10 requests/user/hour) |
| NFR-02.6 | Rate limiting SHALL be applied to `/api/generate-recipes` (max 20 requests/user/hour) |
| NFR-02.7 | The `/api/debug` endpoint SHALL be removed in production |
| NFR-02.8 | All user inputs SHALL be sanitized before sending to AI models |

### NFR-03: Reliability
| ID | Requirement |
|----|-------------|
| NFR-03.1 | Application SHALL degrade gracefully when Gemini API is unavailable (mock fallback) |
| NFR-03.2 | Application SHALL degrade gracefully when Firebase is unavailable (cached state) |
| NFR-03.3 | All async operations SHALL have error boundaries and user-visible error states |
| NFR-03.4 | Application SHALL maintain 99.5% uptime (Vercel SLA dependent) |

### NFR-04: Scalability
| ID | Requirement |
|----|-------------|
| NFR-04.1 | Application SHALL support up to 10,000 concurrent users on Vercel serverless |
| NFR-04.2 | Firestore queries SHALL use composite indexes for all multi-field queries |
| NFR-04.3 | Large recipe history lists SHALL be paginated (25 items per page) |

### NFR-05: Usability
| ID | Requirement |
|----|-------------|
| NFR-05.1 | New users SHALL be able to scan fridge and generate recipes within 3 minutes |
| NFR-05.2 | All interactive elements SHALL have accessible labels (WCAG 2.1 AA) |
| NFR-05.3 | Error messages SHALL be human-readable and actionable |
| NFR-05.4 | Application SHALL work on Chrome, Firefox, Safari (latest 2 major versions) |
| NFR-05.5 | Application SHALL work on iOS Safari and Android Chrome |

### NFR-06: Maintainability
| ID | Requirement |
|----|-------------|
| NFR-06.1 | No single component file SHALL exceed 300 lines |
| NFR-06.2 | All API routes SHALL have TypeScript request/response type definitions |
| NFR-06.3 | All Gemini prompts SHALL be extracted into a centralized `prompts.ts` file |
| NFR-06.4 | Test coverage SHALL be ≥ 80% for utility functions and API handlers |

---

## 5. System Interfaces & Constraints

### 5.1 External APIs
| API | Usage | Model | Rate Limit |
|-----|-------|-------|-----------|
| Google Gemini | Image analysis | gemini-2.0-flash | 15 RPM (free tier) |
| Google Gemini | Recipe generation | gemini-2.0-flash | 15 RPM (free tier) |
| Firebase Auth | Google OAuth | — | Per Firebase plan |
| Firebase Firestore | Data persistence | — | Per Firebase plan |
| Firebase Storage | Image storage | — | Per Firebase plan |

### 5.2 Hardware Interfaces
- Device camera (via `navigator.mediaDevices.getUserMedia`) — requires HTTPS
- Device file system (via `<input type="file">`)

### 5.3 Constraints
- Camera access requires HTTPS deployment
- Gemini vision models accept base64 images up to ~20MB
- Firebase free tier: 1GB storage, 50K reads/day, 20K writes/day
- Next.js serverless functions have a 10-second timeout on Vercel hobby plan

---

## 6. Data Model

### 6.1 Complete Firestore Schema
```
users/
└── {uid}/
    ├── email: string
    ├── displayName: string
    ├── photoURL: string
    ├── createdAt: Timestamp
    ├── updatedAt: Timestamp
    │
    ├── healthProfile/          (document)
    │   ├── caloricGoal: number
    │   ├── dietaryRestrictions: string[]
    │   ├── allergies: string[]
    │   ├── healthConditions: string[]
    │   ├── macroTargets: { protein: number, carbs: number, fat: number }
    │   ├── weight?: number
    │   ├── height?: number
    │   ├── age?: number
    │   └── activityLevel?: string
    │
    ├── inventory/              (subcollection)
    │   └── {itemId}/
    │       ├── name: string
    │       ├── quantity: number
    │       ├── unit: string
    │       ├── category: string
    │       ├── expiryDate: Timestamp
    │       ├── addedAt: Timestamp
    │       └── updatedAt: Timestamp
    │
    ├── recipes/                (subcollection)
    │   └── {recipeId}/
    │       ├── name: string
    │       ├── cuisine: string
    │       ├── description: string
    │       ├── ingredients: { name, amount, available }[]
    │       ├── steps: string[]
    │       ├── nutrition: { calories, protein, carbs, fat, fiber }
    │       ├── cookTime: string
    │       ├── prepTime: string
    │       ├── difficulty: string
    │       ├── servings: number
    │       ├── tags: string[]
    │       ├── isFavorite: boolean
    │       ├── generatedAt: Timestamp
    │       └── savedAt: Timestamp
    │
    ├── mealPlans/              (subcollection)
    │   └── {planId}/
    │       ├── weekStart: Timestamp
    │       ├── days: { [day]: { breakfast, lunch, dinner } }
    │       ├── totalCalories: number
    │       └── createdAt: Timestamp
    │
    └── nutritionLogs/          (subcollection)
        └── {logId}/
            ├── date: Timestamp
            ├── meals: { recipeId, name, calories, macros, loggedAt }[]
            ├── totalCalories: number
            └── totalMacros: { protein, carbs, fat }
```

---

## 7. Gap Analysis — Current vs Required

### Features: Current State vs Full SRS

| Feature Area | Required (SRS) | Current State | Gap |
|---|---|---|---|
| **Authentication** | Google OAuth + email fallback | Google OAuth only | Low |
| **Fridge Scanning** | Camera + upload + multi-image | Upload works; camera not wired | Medium |
| **Inventory CRUD** | Full CRUD with expiry/category | Hook exists, UI uses mock data | High |
| **Recipe Generation** | AI + health profile filtering | Works, no profile filtering | Medium |
| **Recipe Saving** | Save/favorite/share/search | Not implemented | High |
| **Meal Planning** | AI-generated 7-day plan + grocery list | UI mock only | High |
| **Health Profile** | Full profile + medical conditions | UI mock only | High |
| **Nutrition Tracking** | Daily logging + trends | Not implemented | High |
| **Security** | Auth on API routes + rate limiting | No auth, no rate limiting | Critical |
| **Testing** | 80% coverage | 0% | High |
| **Error Handling** | Toast notifications + error boundaries | alert() + console.log | Medium |
| **Data Persistence** | Recipes + meal plans + logs | Only inventory schema | High |

### Security Gaps (Critical)
| Gap | Current | Required |
|-----|---------|----------|
| API key exposure | GEMINI_API_KEY in .env.local committed to git | Server-env only, rotated |
| Firebase keys exposure | NEXT_PUBLIC_ firebase keys in committed .env.local | Acceptable for Firebase (by design) but .env.local must be gitignored |
| API route auth | No authentication check | Verify Firebase ID token on every API route |
| Rate limiting | None | 10 req/hour analyze-image, 20 req/hour generate-recipes |
| Debug endpoint | `/api/debug` exposes key fragments | Remove entirely in production |

### Architecture Gaps
| Gap | Current | Required |
|-----|---------|----------|
| Duplicate routes | Both `/dashboard` and `/(dashboard)` exist | Single canonical route |
| Monolithic component | `ComprehensiveDashboard.tsx` = 940 lines | Split into 6 tab components |
| Unused server action | `geminiActions.ts` not used anywhere | Consolidate or delete |
| Unused hook | `useInventory` imported but not used in dashboard | Wire to Pantry tab |
| Mock data in UI | 5 of 6 tabs use hardcoded data | All tabs connected to Firestore |
