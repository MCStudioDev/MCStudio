# Cuisine Catalog v2

Versioned dish identity data for authenticity gating, recipe ranking, and image identity.

The catalog is not a static recipe database. Each entry is a dish family or variant template:
- required and optional ingredients
- Arabic/native and English aliases
- confidence level
- hard-gate eligibility
- meal types, region, and score

Build/update with:

```bash
npm run catalog:v2:build
```

Rules:
- `high` confidence entries can be used for hard authenticity rewrites.
- `medium` entries can rank and diversify recipe suggestions.
- `low` entries are reference-only until reviewed.
- Native names must be clean Unicode, not mojibake.
- Variants must have a `parentId`.

Current seed:
- American: 20 entries.
- Indian: 25 entries.
- Mediterranean: 20 entries.
- Thai: 20 entries.
- Egyptian: 100 entries, including a reviewed supplement.
- Middle Eastern, Asian, Mexican, Turkish, and Italian are generated from the current curated TypeScript catalogs.
- The current non-Egyptian source catalogs are smaller than the target future catalog. Expand them by adding reviewed entries to the source data or future per-cuisine import files, then rerun the builder.
