# V-Diagram - NutriMoment Development and Verification Model
**Version:** 1.2  
**Date:** 2026-05-11

This V-model is updated to match the current NutriMoment app rather than the older all-features vision.

## Practical V-Model

```text
DEFINITION                                      VERIFICATION
==============================================================

Product behavior                               Acceptance checks
- authenticated pantry-aware cooking app       - signed-in user can scan and get recipes
- offline-first recipe retrieval               - premium user can generate weekly plan (unmetered)
- weekly meal plans (3 free trials, premium)   - free user can use 3 lifetime weekly plans, then hits the upgrade wall
- public recipe-photo lookup                   - recipe images resolve or fail cleanly

System requirements                            System validation
- Firebase token verification                  - protected routes reject missing auth
- offline catalog retrieval                    - recipe route returns ranked results
- pantry quantity reconciliation               - shopping list subtracts pantry stock
- photo lookup order                           - Replicate-for-premium and cache/Unsplash/Pexels/Wikimedia-for-free paths behave correctly

Architecture and service design                Integration validation
- Next.js app router                           - UI tabs connect to real routes
- service/repository split                     - routes use shared business logic
- Firestore persistence                        - pantry/history/plan state round-trips
- shared recipe photo cache                    - image reuse behaves consistently

Detailed design                                Unit / focused verification
- ranking heuristics                           - recipe ordering logic is correct
- ingredient normalization                     - aliases normalize correctly
- pantry quantity math                         - shopping list subtraction is correct
- photo scoring                                - public image matches prefer exactness

Implementation                                 Current concrete checks
- scanner, pantry, meal plan, history tabs     - eslint
- protected API routes                         - next build
- catalog-first recipe engine                  - manual smoke tests
- Replicate + Unsplash/Pexels photo pipeline   - route-level log inspection
```

## Current Verification Reality
NutriMoment does not yet have the full automated test stack originally envisioned. The current verification baseline is:

### In Place Today
- `eslint`
- production `next build`
- manual smoke testing in the dashboard
- route log inspection for tricky flows like recipe photos and AI fallback

### Still Needed
- unit tests for ranking and normalization
- integration tests for pantry reconciliation and route auth
- end-to-end tests for recipe and meal-plan flows

## Traceability Summary
| Build Area | Current Verification |
|---|---|
| Authentication and access | backend route guards + manual smoke checks |
| Scanner flow | manual scan and result verification |
| Recipe retrieval | lint/build + manual ranking review |
| Meal plans | manual premium flow checks |
| Photo lookup | live route checks and source badges |
| Persistence | Firestore-backed smoke testing |

## Recommended Next Verification Layers
1. unit tests for ranking and ingredient normalization
2. unit tests for pantry shopping-list reconciliation
3. integration tests for protected routes with valid/invalid tokens
4. end-to-end tests for scanner -> recipes -> history
5. end-to-end tests for both free-trial and premium meal plan generation paths
