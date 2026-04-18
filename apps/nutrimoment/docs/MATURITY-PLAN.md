# NutriMoment - Maturity Plan
**Version:** 1.1
**Date:** 2026-04-17
**Current State:** v0.2.0 (stabilized prototype)
**Target State:** v1.0.0 (production-ready SaaS)

## Current State Assessment

### What works today
| Feature | Status | Notes |
|---|---|---|
| Google Sign-In | Working | Firebase Auth plus user document creation |
| Image to ingredient detection | Working | OpenAI route with mock fallback |
| Recipe generation | Working | OpenAI route with profile-aware prompt input |
| Dashboard shell | Working | Top nav plus 6 rendered tab components |
| Pantry CRUD | Working | Firestore-backed via `usePantry` |
| Health/profile persistence | Working | Firestore-backed via `AppContext` |
| History persistence | Working | Firestore-backed via `useHistory` |
| Meal-plan generation UI | Working | Route-backed generation and shopping list rendering |
| Lint and typecheck baseline | Working | `eslint` and `tsc --noEmit` are clean |

### What is still incomplete or partially mocked
| Feature | Current Gap |
|---|---|
| API route security | No Firebase token verification on the AI route handlers yet |
| Rate limiting | No quota protection on AI endpoints yet |
| Meal plan persistence | Plans are generated in-session but not stored in Firestore |
| Pantry model | No category, unit normalization, or freshness system |
| Recipe library | History exists, but favorites and separate saved-recipe collections do not |
| Nutrition tracking | Not implemented yet |
| Camera capture | Upload works, but live `getUserMedia` flow is not wired |
| Route consolidation | `scan` vs `analyze-image` and `recipes` vs `generate-recipes` still overlap |
| Legacy inventory hook | `useInventory` still exists as a secondary path and should be merged or retired |

### Critical issues before production use
1. API keys and local secret handling need a formal cleanup review.
2. AI routes need authenticated access.
3. AI routes need rate limiting and abuse protection.
4. Firestore security rules need to be verified against the intended data model.

## Stabilization Fixes Completed In This Pass
- Replaced missing dashboard tab imports with real tab implementations.
- Added scanner, pantry, health, meal-plan, history, and settings tab components.
- Removed `/api/debug`.
- Fixed React effect patterns that were blocking lint.
- Fixed TypeScript issues introduced by the dashboard split.
- Removed hard runtime dependence on live Google Font fetches in the root layout.
- Restored a clean `eslint` and `tsc --noEmit` baseline.

## Maturity Levels

```text
Level 0: Prototype
Level 1: Foundation
Level 2: Core Product
Level 3: Full Feature
Level 4: Production Ready
Level 5: Growth
```

NutriMoment is currently between Level 1 and Level 2:
- strong prototype UX
- real Firestore-backed user data for key surfaces
- still missing core production hardening

## Roadmap

### Phase 1 - Security and Consolidation
Goal: make the current app safe and coherent before adding many more features.

Tasks:
- Add Firebase ID token verification middleware to all AI routes
- Add rate limiting to AI routes
- Review Firestore security rules against the actual collections in use
- Consolidate overlapping route handlers:
  - `scan` and `analyze-image`
  - `recipes` and `generate-recipes`
- Remove or merge legacy inventory paths

Definition of done:
- unauthenticated users cannot hit protected AI endpoints
- duplicate route responsibilities are reduced to one route per concern

### Phase 2 - Product Data Depth
Goal: strengthen the current feature set instead of only adding new screens.

Tasks:
- Extend pantry items with unit, category, and expiry metadata
- Add pantry freshness calculation and visual status
- Add scanner-to-pantry import action
- Persist meal plans to Firestore
- Add a saved recipe library separate from history
- Add favorites

Definition of done:
- pantry becomes a real kitchen inventory model
- recipe data has a long-lived home beyond generation history
- meal plans survive page refreshes and sign-in sessions

### Phase 3 - Personalization and Tracking
Goal: deepen user value through health-aware behavior and outcome tracking.

Tasks:
- Add allergies to the health model
- Add macro targets
- Improve recipe prompt construction using richer health profile data
- Build nutrition log collection
- Add daily totals and weekly summaries

Definition of done:
- NutriMoment moves from recipe generation to actual nutrition guidance workflow

### Phase 4 - UX and Reliability
Goal: polish first-run experience and operational stability.

Tasks:
- Add onboarding
- Add richer empty states and skeletons
- Add error tracking and structured logging
- Add monitoring
- Add accessibility pass
- Add camera capture flow where supported

Definition of done:
- users can reach first value quickly
- issues can be observed and triaged in production

## Milestone Summary
| Milestone | Version | Target Outcome |
|---|---|---|
| Stabilized prototype | v0.2.0 | Split tabs, clean lint/typecheck, no debug route |
| Secured AI layer | v0.3.0 | Authenticated and rate-limited AI routes |
| Real pantry and saved recipes | v0.4.0 | Stronger persistence and inventory fidelity |
| Personalized meal workflows | v0.5.0 | Richer health profile plus persisted meal plans |
| Nutrition tracking | v0.6.0 | Logging and progress metrics |
| Production-ready baseline | v1.0.0 | Security, observability, UX, and deployment readiness |

## Production-Ready Checklist

### Security
- [ ] No exposed secrets in committed history
- [ ] AI routes verify Firebase ID tokens
- [ ] Rate limiting is active
- [ ] Firestore security rules match the real data model
- [x] Debug route removed

### Quality
- [x] ESLint clean
- [x] TypeScript clean
- [ ] Strong automated test coverage
- [ ] Duplicate route responsibilities removed
- [ ] No legacy unused state paths

### Reliability
- [ ] Structured logging
- [ ] Error monitoring
- [ ] Graceful handling of auth failures and quota failures

### UX
- [x] Real dashboard tabs exist
- [x] Key flows render through the current app architecture
- [ ] Onboarding
- [ ] Nutrition tracking
- [ ] Rich pantry metadata and freshness states
