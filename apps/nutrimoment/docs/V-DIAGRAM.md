# V-Diagram — NutriMoment Development & Verification Model
**Version:** 1.0  
**Date:** 2026-04-17

The V-Diagram maps each development phase on the left to its corresponding verification/testing phase on the right. Work flows down the left side (definition → design → build) and up the right side (unit test → integration test → acceptance).

---

## V-Model Diagram

```
DEFINITION PHASE                                    VERIFICATION PHASE
════════════════                                    ══════════════════

┌─────────────────────────────────────┐            ┌──────────────────────────────────────┐
│   BUSINESS REQUIREMENTS (L1)        │────────────►│   USER ACCEPTANCE TESTING (L6)       │
│                                     │            │                                      │
│  • AI-assisted meal planning        │            │  • Real users scan fridges           │
│  • Recipe generation from fridge    │            │  • End-to-end recipe flow tested     │
│  • Nutrition tracking               │            │  • Health profile → filtered recipes │
│  • Firebase-backed persistence      │            │  • Meal plan generated and saved     │
│  • Google OAuth authentication      │            │  • Nutrition log tracks correctly    │
│  • Mobile-first web experience      │            │  • Sign-in/out works on mobile       │
└──────────────┬──────────────────────┘            └──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐            ┌──────────────────────────────────────┐
│   SYSTEM REQUIREMENTS (L2 — SRS)    │────────────►│   SYSTEM INTEGRATION TESTING (L5)    │
│                                     │            │                                      │
│  FR-01: Authentication              │            │  • Firebase Auth ↔ Firestore sync    │
│  FR-02: Fridge Scanning             │            │  • Gemini API ↔ recipe pipeline      │
│  FR-03: Inventory Management        │            │  • Inventory → recipe generation     │
│  FR-04: Recipe Generation           │            │  • Health profile → filtered output  │
│  FR-05: Recipe Management           │            │  • Meal plan → nutrition log sync    │
│  FR-06: Meal Planning               │            │  • API rate limiting enforcement     │
│  FR-07: Health Profile              │            │  • Auth token validation on routes   │
│  FR-08: Nutrition Tracking          │            │  • Firebase Storage upload/retrieve  │
│  NFR-01–06: Non-functional reqs     │            │  • Cross-browser compatibility       │
└──────────────┬──────────────────────┘            └──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐            ┌──────────────────────────────────────┐
│   ARCHITECTURAL DESIGN (L3)         │────────────►│   COMPONENT INTEGRATION TESTING (L4) │
│                                     │            │                                      │
│  • Next.js App Router structure     │            │  • AuthContext ↔ all protected pages │
│  • Firebase schema (Section 6.1)    │            │  • useInventory ↔ Pantry tab         │
│  • Gemini prompt design             │            │  • Scanner → API → recipe display    │
│  • API route contracts              │            │  • Health profile ↔ recipe filter    │
│  • Component decomposition          │            │  • Meal plan ↔ recipe linking        │
│  • State management strategy        │            │  • Nutrition log ↔ meal logging      │
│  • Security model (auth on routes)  │            │  • Settings ↔ Firebase profile sync  │
│  • Rate limiting strategy           │            │  • Toast notification system         │
└──────────────┬──────────────────────┘            └──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐            ┌──────────────────────────────────────┐
│   DETAILED DESIGN (L3b)             │────────────►│   UNIT TESTING (L3b)                 │
│                                     │            │                                      │
│  • ComprehensiveDashboard split     │            │  • analyzeImage() prompt/response    │
│    into ScannerTab, PantryTab,      │            │  • generateRecipes() output parsing  │
│    MealPlanTab, HealthTab,          │            │  • useInventory CRUD operations      │
│    HistoryTab, SettingsTab          │            │  • Recipe filter by dietary needs    │
│  • Gemini prompts in prompts.ts     │            │  • Freshness date calculation        │
│  • Types in types.ts                │            │  • Nutrition total calculation       │
│  • API route auth middleware        │            │  • Rate limiter logic                │
│  • Error boundary components        │            │  • Mock fallback detection           │
│  • Toast notification system        │            │  • Recipe schema validation          │
│  • Firestore security rules         │            │  • Auth middleware token parse       │
└──────────────┬──────────────────────┘            └──────────────────────────────────────┘
               │
               ▼
               ┌──────────────────────────────────────────────┐
               │              IMPLEMENTATION (L4)             │
               │                                              │
               │  Sprint 1:  Auth + Security hardening        │
               │  Sprint 2:  Inventory (real data)            │
               │  Sprint 3:  Recipe save/favorite/search      │
               │  Sprint 4:  Health profile + filtering       │
               │  Sprint 5:  Meal planning (AI)               │
               │  Sprint 6:  Nutrition tracking               │
               │  Sprint 7:  Component refactor + tests       │
               │  Sprint 8:  Polish + performance             │
               │                                              │
               └──────────────────────────────────────────────┘
```

---

## Level Detail: Each Phase

### L1 — Business Requirements
**Owner:** Product / Stakeholder  
**Verified by:** User Acceptance Testing (L6)

| Requirement | Acceptance Criterion |
|-------------|---------------------|
| Users can manage nutrition using AI | User scans fridge → receives valid recipes in < 8s |
| App works on mobile | Tested on iPhone 14 Safari + Android Chrome |
| Data persists across sessions | User data survives browser refresh and logout/login |
| App is secure | No credentials exposed; API routes require auth |
| Dietary needs are respected | Vegan user never sees meat-containing recipes |

---

### L2 — System Requirements (SRS)
**Owner:** Engineering Lead  
**Verified by:** System Integration Testing (L5)

Key test scenarios:
```
SIT-001: Sign in → inventory loads → scan image → recipes generated → recipe saved
SIT-002: Set health profile (vegan) → generate recipes → no meat ingredients appear
SIT-003: Add 10 inventory items → generate meal plan → all days populated
SIT-004: Log 3 meals → nutrition dashboard reflects correct totals
SIT-005: Exceed rate limit → API returns 429 with user-friendly message
SIT-006: Firebase unavailable → app shows cached state, no crash
SIT-007: Gemini API down → mock recipes displayed with disclaimer banner
```

---

### L3 — Architectural Design
**Owner:** Senior Engineer  
**Verified by:** Component Integration Testing (L4)

Key integration contracts:
```
CIT-001: AuthContext provides user to all child components
CIT-002: useInventory returns live Firestore data to PantryTab
CIT-003: ScannerTab POST /api/analyze-image returns ingredients[]
CIT-004: RecipeTab POST /api/generate-recipes returns Recipe[]
CIT-005: Recipe save button writes to users/{uid}/recipes collection
CIT-006: HealthProfileForm writes to users/{uid}/healthProfile document
CIT-007: MealPlanTab reads saved recipes to populate week grid
```

---

### L3b — Detailed Design
**Owner:** Engineer  
**Verified by:** Unit Tests

Key unit test coverage targets:
```
UNIT-001: parseGeminiIngredients(response) — handles empty, malformed, valid JSON
UNIT-002: parseGeminiRecipes(response) — handles partial data, missing fields
UNIT-003: calculateFreshness(expiryDate) — returns 'fresh'|'expiring'|'expired'
UNIT-004: filterRecipesByDiet(recipes, restrictions) — removes non-compliant recipes
UNIT-005: calculateDailyTotals(logs) — sums calories and macros correctly
UNIT-006: validateInventoryItem(item) — rejects missing name, invalid quantities
UNIT-007: buildGeminiPrompt(ingredients, healthProfile) — injects restrictions correctly
UNIT-008: verifyFirebaseToken(token) — rejects expired, tampered tokens
UNIT-009: applyRateLimit(userId, bucket) — blocks at threshold, resets after window
UNIT-010: mockFallback(error) — triggers only on network/API errors, not input errors
```

---

### L4 — Implementation
**Tools:** TypeScript, Next.js, Firebase, Gemini SDK, Vitest/Jest

**Definition of Done per feature:**
- [ ] TypeScript types defined
- [ ] Unit tests written first (TDD)
- [ ] Unit tests passing
- [ ] No console.log in production code
- [ ] No hardcoded mock data
- [ ] Firestore security rules updated
- [ ] Code reviewed

---

### L5 — Component Integration Testing
**Tools:** Vitest + Firebase Emulator Suite

**Emulator coverage:**
- Firebase Auth Emulator — sign-in/out flows
- Firestore Emulator — all CRUD operations with security rules
- Gemini API mock — deterministic test responses

---

### L6 — User Acceptance Testing
**Tools:** Playwright E2E + manual test sessions

**Critical user journeys:**
```
E2E-001: Guest → Sign In → First fridge scan → Recipe generated [< 60s]
E2E-002: Return user → Pantry loaded → Add item → Item persists on reload
E2E-003: Set dietary restriction → Generate recipes → No violations in output
E2E-004: Save recipe → Logout → Login → Recipe still saved in history
E2E-005: Complete daily meal log → Nutrition ring shows correct progress
```

---

## Traceability Matrix

| SRS Requirement | Unit Tests | Integration Tests | E2E Tests |
|----------------|-----------|------------------|-----------|
| FR-01 Auth | UNIT-008 | CIT-001 | E2E-001, E2E-004 |
| FR-02 Scanning | UNIT-001 | CIT-003 | E2E-001 |
| FR-03 Inventory | UNIT-003, 006 | CIT-002 | E2E-002 |
| FR-04 Recipe Gen | UNIT-002, 007 | CIT-004 | E2E-001, E2E-003 |
| FR-05 Recipe Mgmt | UNIT-002 | CIT-005 | E2E-004 |
| FR-06 Meal Plan | UNIT-004 | CIT-007 | — |
| FR-07 Health Profile | UNIT-004, 007 | CIT-006 | E2E-003 |
| FR-08 Nutrition | UNIT-005 | — | E2E-005 |
| NFR-02 Security | UNIT-008, 009 | SIT-005 | — |
| NFR-03 Reliability | UNIT-010 | SIT-006, 007 | — |
