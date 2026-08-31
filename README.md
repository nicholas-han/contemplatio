# Contemplatio: Equity Research

Local-first, company-centric equity research for DeepSeek Harness / Cordis. The current implementation covers the v0.1 bootstrap slice: portable company workspaces, manifest validation, SQLite migrations, retained artifacts, SHA-256 integrity, provenance tables, and minimal financial/coal metric packs.

## Requirements

- Node.js 22.5 or newer (`node:sqlite` is used directly)
- npm 11 or newer

## Development

```sh
npm install
npm run check
npm test
npm run build
```

Copy `.env.example` to `.env` and set the external archive root:

```sh
CONTE_EQUITY_ARCHIVE="/absolute/path/to/Equity Research Archive"
```

The local `.env` is ignored by Git. Harness deployments should provide the same variable in their runtime environment, or pass `root` directly to `conte-equity-archive`.

Create the minimal Yankuang Energy workspace under the configured archive root:

```sh
npm run seed:yankuang
```

The final command argument overrides `CONTE_EQUITY_ARCHIVE` when needed:

```sh
npm run seed:yankuang -- /path/to/companies
```

Inventory the legacy archive without writing anything:

```sh
npm run import:legacy
```

Create a new staging workspace only after reviewing the dry-run output:

```sh
npm run import:legacy -- --apply
```

The importer refuses to overwrite an existing target. It defaults to `.conte-staging/` under the archive root, copies legacy files as retained artifacts with SHA-256 provenance, and leaves legacy CSV observations unpromoted until metric definitions and primary sources are reviewed.

After staging files, register the legacy CSV as reviewable observations and Evidence:

```sh
npm run stage:legacy-observations
```

This adds `legacy_observations` rows and local-artifact Evidence only. It does not promote any row into `facts`.

Review promotion candidates without writing facts:

```sh
npm run promote:legacy
```

Promotion is explicit and requires a reviewed observation ID whose status is `confirmed` or `verified`:

```sh
npm run promote:legacy -- --observation=obs-0001 --apply
```

Update a staging observation after manual review (dry-run by default):

```sh
npm run review:legacy -- --observation=obs-0011 \
  --metric=coal.production --status=confirmed \
  --note='Verified against the 2023 annual report' --apply
```

Review updates only affect the staging SQLite. The original CSV and source archive remain unchanged.

To skip manual review and import only structurally representable mapped rows as explicitly unverified facts:

```sh
npm run promote:legacy-unverified -- --apply
```

These facts use `verification_status=legacy_unverified`; guidance, target, range-valued, and unmapped observations remain in staging.

Refresh the explicit legacy metric mapping after Metric Packs are expanded:

```sh
npm run refresh:legacy-mappings
npm run promote:legacy-unverified -- --apply
```

For legacy instant observations whose date is stored in `as_of_date`, normalize it to the required fact `period_end` first:

```sh
npm run normalize:legacy-periods
npm run promote:legacy-unverified -- --apply
```

Each workspace contains `company.json`, `company.sqlite`, retained files under `documents/`, and disposable output under `exports/`. The fallback `./companies` directory is intentionally ignored by Git because it contains local research data.

Import point-in-time estimates from a CSV. Required columns are `metric_id,target_period_type,target_period_end,as_of,provider,estimate_type,value,evidence_id`; optional columns include `target_period_start,analyst,unit,published_at,observed_at,dimensions,ingestion_method,verification_status`.

```sh
npm run import:estimates -- --file=/path/to/estimates.csv
npm run import:estimates -- --file=/path/to/estimates.csv --apply
```

Use semicolon-separated values for multiple Evidence IDs or dimensions, for example `evidence-a;evidence-b` and `geography=China;scenario=base`.
