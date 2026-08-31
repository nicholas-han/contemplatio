# Contemplatio: Equity Research

Local-first, company-centric equity research for DeepSeek Harness / Cordis. The current implementation covers the v0.1 bootstrap slice: portable company workspaces, manifest validation, SQLite migrations, retained artifacts, SHA-256 integrity, provenance tables, reusable metric packs, point-in-time estimates, management history, cap table snapshots, valuation models, and a local inspection UI.

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

Create another company workspace with a validated manifest. This command previews by default and only writes to the staging root with `--apply`:

```sh
npm run company:create -- --company=china-merchants-bank --name-en="China Merchants Bank" --jurisdiction=CN --accounting-standard=CAS --industry=bank --security=SSE:600036:common_equity
npm run company:create -- --company=china-merchants-bank --name-en="China Merchants Bank" --jurisdiction=CN --accounting-standard=CAS --industry=bank --security=SSE:600036:common_equity --apply
```

Apply reusable metric packs through the Data Engine. The command previews by default and writes to the staging root only with `--apply`:

```sh
npm run metric-pack:apply -- --company=yankuang-energy --packs=financial-common,coal
npm run metric-pack:apply -- --company=yankuang-energy --packs=financial-common,coal --apply
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

Import management history from CSV (`name_zh` or `name_en`, `role_title_raw`, and `start_date` are required). Optional manager columns (`manager_role_title_raw`, `manager_role_type`, `manager_unit_name`, `reporting_relationship_type`, `reporting_start_date`, `reporting_end_date`) create temporal reporting lines:

```sh
npm run import:management -- --file=/path/to/management.csv
npm run import:management -- --file=/path/to/management.csv --company=yankuang-energy --apply
```

Import cap table snapshots from CSV (`as_of_date`, `share_class_name`, `security_type`, and `shares_outstanding` are required):

```sh
npm run import:cap-table -- --file=/path/to/cap-table.csv
npm run import:cap-table -- --file=/path/to/cap-table.csv --company=yankuang-energy --apply
```

Both management and cap table imports support a dry-run by default. Re-running an already applied file reuses matching people, positions, and share classes; snapshots with an existing `as_of_date` are skipped and reported as `skippedSnapshots`.

Start the local workbench against the staging workspace (the default `.env` in this checkout points at the configured Dropbox archive and uses `.conte-staging` as the writable target):

```sh
npm run web:dev
```

Open `http://127.0.0.1:4173/` for the default company, or `/companies/<company_id>` for another workspace. The same data services are available as JSON routes, including `/api/companies`, `/api/facts`, `/api/estimates`, `/api/metrics`, `/api/taxonomy`, `/api/people`, `/api/reporting-lines`, `/api/cap-table`, `/api/sources`, `/api/artifacts`, and the three CSV import endpoints.

The model plugin publishes both the callable `equityResearchTools` service and validated `equityResearchToolDefinitions` through Cordis reflection for Harness integration. Tool methods operate through the Data Engine and Model Engine; they do not expose SQLite or filesystem primitives.
