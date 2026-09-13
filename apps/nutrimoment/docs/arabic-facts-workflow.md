# Arabic facts workflow

Implementation scope: Arabic ingredient resolution, structured recipe facts, read-only reference/editor-cache access, bounded generation, independent validation/cache versions, and automatic persistent Arabic pictures. English generation services, endpoints, prompts and content stores remain unchanged. The only shared UI edits are three import changes in ScannerTab, HistoryTab and MealPlanTab. The wrapper passes English props directly to the original, unchanged MealRevealCard.

Validation sequence: regression tests first; local checkpoint after the intended RED failure; focused GREEN tests; full relevant regression/type/build checks; browser checks where a signed-in local session is available. Production activation and staging validation require a separate configured environment; neither is implied by local validation.

Storage: existing Arabic recipe/history/weekly/image collections, plus Arabic-only ingredient-resolution and reference-variant indexes. Source eligibility and content fingerprints must be checked on read and in the publication transaction. No migrations or bulk translations.

Billing: caches remain available without credits. Unresolved ambiguous inputs fail before credit reservation. Entitled generation uses one existing action reservation across bounded internal requests. Image cache hits do not consume generation grants. New images use the Arabic storage prefix.

## Generation and validation

1. Authenticate, load saved restrictions, normalize English/Arabic/mixed ingredients, and apply an Arabic request bucket. Local food identities are derived from existing dictionaries, the taxonomy, ingredient knowledge graph and cuisine catalogs. They do not modify those sources.
2. Unclear input can use one bounded semantic resolution request for entitled users. It must select an existing food ID at high confidence. Cache that resolution only in `ingredientResolutionsArabicV1`; free users can read it. Ambiguous shawarma protein always requires clarification.
3. Revalidate Arabic recipe candidates. Read eligible English references and exact editor semantic-cache entries directly, without repair, promotion, normalization writes, memory warming or generation on a cache miss. Reference-linked Arabic variants use `recipeVariantsArabicV1`.
4. For fresh generation, ask Gemini for short dish/ingredient manifests. Check ingredient IDs, pantry overlap and the missing-ingredient budget before asking for full instructions. There is no Egyptian/vegan special branch in this pipeline.
5. Generate one structured facts object per accepted manifest: ingredient IDs, amounts, units, preparation state, ordered actions, references to earlier preparations, times, temperatures and nutrition. The server renders internal English and visible Arabic from that same object. The model cannot rename a plan or add ingredients during completion.
6. Run unchanged pure dietary/health checks plus Arabic property, language and preparation checks. Unknown Arabic labels and unclassified foods under dietary restrictions require independent semantic verification. Receipts bind to facts and, for safety, the effective restrictions. One bounded instruction/language repair preserves ingredient quantities, state, nutrition and source identity.
7. Deduplicate validated recipes; return safe partial results with shortages when appropriate. Weekly generation uses three parallel meal-slot batches under one action/deadline. Save only after selecting 21 distinct compatible meals, building an Arabic shopping list from the validated quantities and checking the complete plan.

Shopping quantities aggregate by ingredient, preparation state and compatible unit dimension. Measured pantry stock is subtracted once. The adapter does not invent package weights, food density or raw-to-cooked conversions. Existing validated Arabic recipe pairs and fractional quantities remain readable.

Arabic requests retain the configured Gemini model/transport, with bounded attempts and a deadline that respects Gemini's minimum request timeout. Internal planning, resolution, verification and repair do not create additional app actions.

## Images

The Arabic photo endpoint previously used the undefined `recipe_image` rate-limit name. It now uses the existing photo-limit configuration with an Arabic-only bucket. The rate limiter's English configuration and buckets are unchanged.

The Arabic card automatically requests a photo when visible, shows a useful failure/retry message, and restores images by Arabic recipe ID in scanner, history and weekly-plan views. English cards do not enter that component's network path.

Eligible English source images and editor images may be reused read-only after identity/diet/source checks. New images use a separate literal recipe-facts prompt and the configured Replicate transport settings. This avoids the shared fuzzy prompt builder remapping a dish to a nearby identity. New images persist under `arabic-recipe-photos-v1/` with a durable association in `recipePhotoCacheArabicV1`. A transaction lease coalesces workers; existing validated photo hits do not regenerate or consume grants. Polling URLs and downloaded image origins/types/sizes are checked. Source eligibility is rechecked before publication.

`ar-image-v2-facts` identifies the Arabic image prompt. Earlier Arabic generated-photo cache entries without that receipt are refreshed on demand; there is no bulk image job. English photos and their receipts are untouched.

## Verification and rollout

- Final local Arabic regression suite: all 153 tests passed across 22 files, including fractional-shopping compatibility and complete weekly-plan publication.
- Measured Arabic coverage: 87.55% statements, 80.95% branches, 89.15% functions and 94.46% lines before the small fractional-shopping follow-up.
- TypeScript, scoped ESLint and the production build passed. The build reports an existing Turbopack tracing warning through the English meal-plan artifact loader.
- English regression selection: 112 passed, two existing kofta photo-compatibility expectations failed. The identical two failures were reproduced by exporting and running untouched commit `952fb40` in a separate directory. No English fix was included.
- Read-only live isolation audit: 31 sampled English recipe/photo/user-cache/history/plan record hashes and their collection counts were unchanged after Arabic generation and automatic image tests.
- Live browser: Mina's Arabic photo endpoint returned success; pictures rendered in saved Arabic history and were checked after a page reload. Existing generated recipes retain their original content.
- Synthetic live Gemini check: Indian vegetarian generation returned distinct Dal Tadka, Palak Tofu and Vegan Tikka Masala recipes, each validated with five missing ingredients. Other generated candidates that changed their accepted manifests were rejected.
- Mina's final exact-case diagnostic after adding ingredient manifests is pending renewed authorization: automatic approval review limited the earlier diagnostic approval to one transmission. Earlier browser results must not be presented as a test of the final manifest stage.

The implementation is local. Staging validation and production activation remain separate, and no deployment or production feature-flag change was performed. The feature flag stays off by default. Before enabling in production, run the documented staging cases, source/hash comparison and rollback check. Disabling Arabic leaves English APIs and content usable; validated saved Arabic images can still be read.
