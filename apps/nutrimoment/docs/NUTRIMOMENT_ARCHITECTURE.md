# NutriMoment Architecture and Maturity Plan

This document is the canonical technical and operational reference for the NutriMoment application. It replaces the former product, requirements, offline-engine, deployment, QA, and maturity notes.

## 1. Product Contract

NutriMoment is a recipe discovery, personalization, and localization platform. It is not a chatbot that invents recipes by default.

Core priorities:

1. Safety and dietary compatibility.
2. Authentic source recipes and realistic instructions.
3. Native Arabic or English output with no mixed-language cards.
4. Exact requested card counts when enough safe candidates exist.
5. Variety across cuisines, dish families, proteins, and techniques.
6. Fail-open delivery: an optional enhancement must not erase a valid source recipe.

## 2. Runtime Architecture

The application is a Next.js App Router application hosted on Vercel. Firebase Authentication identifies users; Cloud Firestore stores profiles, entitlements, usage, history, caches, and operational data. Firebase Admin is used only on the server. Gemini edits recipes and performs image-to-text extraction. Replicate supplies generated food images. Validated Replicate images are persisted to Firebase Storage and reused through the V2 shared recipe pool; external photo-search fallbacks are not used.

Main boundaries:

- `src/app`: pages and API routes.
- `src/components`: presentation and dashboard workflows.
- `src/services`: discovery, ranking, validation, personalization, caching, and tracing.
- `src/lib`: normalization, localization, safety enforcement, Firebase, Gemini, images, and shared domain logic.
- `src/data/offline`: bundled recipe and taxonomy sources.
- `src/food`: deterministic ingredient knowledge and cuisine relationships.
- `src/ai/PromptBuilder.ts`: the only production prompt assembly path.

## 3. Access Workflows

### Free user

1. The user may type ingredients manually in the scanner tab.
2. Fridge/photo scanning and weekly meal-plan generation remain visible but require premium access.
3. The backend authenticates the request and checks the entitlement and usage documents.
4. Recipe discovery uses validated local/reference candidates and deterministic adaptation where possible.
5. Images reuse Firestore cache records first. The currently enabled free-image suppliers may provide a result only through the configured server image route.
6. Free usage limits are enforced server-side; UI state is not trusted for authorization.

### Premium user

1. Manual ingredients, image scanning, and weekly meal plans are enabled.
2. Search and ranking still occur before Gemini.
3. Gemini Flash Lite edits one validated source recipe per call when health, allergy, diet, or localization work is required.
4. Editor calls run with bounded concurrency and semantic caching.
5. Replicate may generate an image only when no suitable reusable image exists or personalization materially changes the plated appearance.

## 4. Recipe Request Pipeline

Every `/api/generate-recipes` request follows this order:

1. Authenticate and resolve access tier.
2. Validate the payload and detect/lock output language.
3. Normalize ingredient aliases and quantities.
4. Categorize ingredients and select compatible primary proteins.
5. Infer dish intent, cuisine candidates, and cooking techniques.
6. Search sources using the fallback ladder: exact ingredients, synonyms, protein family, dish family, cuisine, then AI generation only when no authentic compatible source exists.
7. Rank by ingredient fit, cuisine, health/diet compatibility, source quality, recipe quality, recency, and diversity.
8. Preserve a valid search baseline for fail-open delivery.
9. Repair source formatting deterministically without changing dish identity.
10. Optionally edit one recipe per Gemini call.
11. Validate structure, ingredient usage, time, safety, language, nutrition, and duplicates.
12. Re-rank and fill from the last valid source candidates when an enhancement fails.
13. Resolve an image independently for each returned recipe.
14. Persist history/cache/usage and return the recipe array plus trace metadata.

The frontend may show “No matching recipes” only when search found zero compatible candidates. Partial enhancement success must return the successful cards.

## 5. Gemini Contract

Gemini may:

- rewrite and simplify one supplied source recipe;
- localize natural wording;
- personalize for explicit diet, allergy, exclusion, health, or calorie constraints;
- return the configured structured JSON response;
- extract ingredients from a user-supplied image.

Gemini must not choose or rank recipes, select proteins/cuisines, invent source facts, calculate nutrition from scratch, build shopping lists, or search Firestore. Source identity, ingredient dictionaries, culinary terminology, nutrition, ranking, caching, and validation are backend responsibilities.

`PromptBuilder` assembles a stable system instruction, one source recipe, applicable user constraints, language-specific localization rules, and the minimal output contract. Arabic and English localization modules are mutually exclusive. No URLs, Firestore metadata, image rules, or backend implementation details belong in an editor prompt.

## 6. Localization Contract

- Detect language once and lock the whole card to `ar` or `en`.
- Ingredient names come from deterministic bilingual dictionaries.
- Arabic titles are localized cookbook titles, not English transliterations.
- Arabic steps use established culinary verbs and units.
- No Latin characters are allowed in an Arabic card’s visible title, cuisine, ingredients, steps, time, difficulty, or preference labels.
- A missing deterministic translation is a localization failure; it must not silently become mixed text.

## 7. Validation and Fail-Open Rules

Safety filters may reject a recipe. Non-safety concerns should normally apply score penalties. Each selected recipe is tracked independently with source ID, search score, selection status, Gemini status, validation status, repair status, image status, returned status, and a specific rejection reason.

Quality gates verify:

- required fields and valid JSON;
- source-backed title and dish identity;
- listed ingredients are referenced by realistic steps;
- no duplicate ingredients or steps;
- credible preparation form, temperature, and cooking time;
- plausible complete nutrition;
- diet, allergen, exclusion, and health constraints;
- language purity;
- non-duplicate card and image identities.

When Gemini, localization, validation enhancement, image generation, persistence, or cache access fails, log it and continue from the last valid recipe version. Never convert partial success into a total failure.

## 8. Caching and Images

Cache layers include normalized ingredients, source-search results, localized names, semantic Gemini edits, recipe cards, and image matches. The semantic editor key is derived from source recipe identity, language, diet, exclusions, health conditions, and material personalization fields.

Image resolution is independent from recipe discovery:

1. Reuse a suitable recipe image already attached to the recipe.
2. Query the Firestore recipe photo cache using normalized dish identity, query/signature, main ingredient category, cuisine, and visual keywords.
3. Use the active supplier policy for an external cached/search result.
4. Premium may call Replicate when no suitable image exists or the final appearance changed materially.
5. Return a deliberate placeholder when identity confidence is insufficient; never attach a random historical image.

Every card displays recipe source and photo source labels. `photo supplier` means the upstream origin of the image URL, while `shared pool` means a previously stored reusable cache record.

## 9. Data and Persistence

Important Firestore areas include users and their profile/usage/history subcollections, entitlements, shared recipe caches, recipe photo cache, ingredient taxonomy/aliases/indexes, scans, metrics, and health tags. Security rules and Admin SDK boundaries are authoritative.

Bundled catalogs and Firestore are production recipe sources. Local/test audits may also load `.generated/real-source-import-import-2026-04-25T22-14-20-757Z.json`; the ignored 36 MB artifact is deliberately excluded from production bundles. Do not delete it until its validated records are migrated to a versioned production data store.

Required production configuration is documented by `.env.example` and validated with `npm run validate:prod-env`. Never commit `.env.local`, service-account material, API keys, recovery codes, or user inspection exports.

## 10. Observability

Each request receives a `requestId`. Stage logs report candidate counts entering/leaving, selected IDs, score snapshots, per-recipe enhancement status, rejection reasons, API timing, and final client count. Debug reports must identify the first stage below the requested count.

Monitor at least:

- p50/p95 total generation latency;
- source loading, ranking, editor, post-processing, and image timing;
- candidates and cards per stage;
- Gemini calls, cache hits, failures, and retries;
- language, safety, cuisine, and duplicate rejection rates;
- exact-count success rate by tier and scenario;
- source and photo supplier distribution.

Logs must never contain secrets, auth tokens, full uploaded images, or unnecessary personal data.

## 11. Verification Commands

```bash
npm run lint
npx tsc --noEmit
npm test
npm run test:rules
npm run qa:matrix
npm run qa:launch-recipes -- --all
npm run qa:launch-recipes -- --free --all
npm run build
npm run validate:prod-env
```

Chrome release checks cover Arabic/English switching, both themes, legal routes, desktop/mobile layout, sign-in boundary, scanner/manual entry, premium gates, recipe expansion, source labels, images, history, and console/network errors. API audits use temporary Firebase users and delete them after each run.

## 12. Audit Baseline: 2026-07-31

- Static QA matrix: 90/90 cases passed.
- Unit and integration suite: 210/210 non-emulator tests passed on Vitest 4.1.10 after correcting language metadata drops, canonical ingredient labels, and semantic duplicate filling.
- Firestore rules remain unverified locally because Java is not installed; the Firebase CLI cannot start the emulator without it.
- Chrome: English and Arabic landing flows, theme switch, privacy route, and 390 x 844 responsive layout passed. Logged message-channel errors originated from the browser extension listener, not an application request.
- Premium live matrix: 2/8 scenarios passed. All scenarios returned recipes, but four returned 7-9 of 10 cards. Cuisine fidelity and diet enforcement failed in several mixed cases.
- Free live matrix: 1/8 passed and 1/8 warned. Counts were 10/10, but selected-cuisine fidelity and diet enforcement were frequently wrong.
- Local source import: 127 usable recipes loaded from the current 2,000-record artifact; 1,873 were rejected during import validation.
- Production build and environment validation passed. Dependency audit has no critical findings, but 3 high and 8 moderate transitive findings remain in Next.js and Firebase Admin dependency chains; upstream-compatible upgrades must be regression-tested before release.

This baseline is not release-ready for health/diet marketing claims. The application is fail-open and observable, but source quality and deterministic constraint enforcement need stronger release gates.

## 13. Maturity Plan

### M0: Stabilize correctness

- Make safety/diet validation authoritative before final selection.
- Backfill from safe ranked candidates until exact count is reached.
- Prevent cross-cuisine fallback when a selected cuisine has enough compatible candidates.
- Reject malformed source titles and ingredient aliases during import.
- Exit gate: 100% safety tests, at least 95% exact-count success, and at least 90% selected-cuisine compliance across the live matrix.

### M1: Source quality and localization

- Increase validated authentic coverage for every supported cuisine and common ingredient family.
- Classify cuisine once during import with confidence and provenance.
- Complete bilingual ingredients, units, techniques, and approved title dictionaries.
- Exit gate: zero mixed-language cards and at least 90% authentic-title/instruction acceptance in human review.

### M2: Performance and cost

- Move the large import artifact to a versioned indexed store.
- Eliminate repeated full-pool mapping and keep response mapping proportional to selected candidates.
- Measure semantic-cache hit rate and enforce bounded editor/image concurrency.
- Exit gate: cached p95 under 3 seconds, uncached source-only p95 under 8 seconds, premium personalized p95 under 20 seconds.

### M3: Images and diversity

- Complete query/signature/category backfill and image identity scoring.
- Enforce ten-scan recipe rotation windows and supplier provenance.
- Exit gate: at least 95% correct-image human review and 50 distinct cards across ten repeated identical searches when source coverage permits.

### M4: Production operations

- Add dashboards, alerts, data-retention policy, restore drills, dependency/security remediation, and staged deployment checks.
- Run accessibility, mobile, load, and disaster-recovery suites in CI.
- Exit gate: no critical dependency vulnerabilities, tested rollback, passing Firestore rules, and signed production release checklist.

## 14. Change Discipline

Keep UI and API contracts backward compatible unless a versioned migration is approved. Add tests for every behavior change. Generated logs and user inspection exports are disposable and must stay ignored. Architectural decisions and current maturity evidence belong in this file; do not create competing instruction documents.
