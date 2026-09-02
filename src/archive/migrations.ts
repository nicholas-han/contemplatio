import type { DatabaseSync } from 'node:sqlite'

export interface Migration {
  version: number
  name: string
  sql: string
}

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_research_schema',
    sql: `
      CREATE TABLE companies (
        company_id TEXT PRIMARY KEY,
        name_zh TEXT,
        name_en TEXT,
        jurisdiction TEXT NOT NULL,
        accounting_standard TEXT NOT NULL CHECK (accounting_standard IN ('CAS', 'IFRS', 'US-GAAP')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (name_zh IS NOT NULL OR name_en IS NOT NULL)
      ) STRICT;

      CREATE TABLE metric_definitions (
        metric_id TEXT PRIMARY KEY,
        namespace TEXT NOT NULL,
        name TEXT NOT NULL,
        label_zh TEXT,
        label_en TEXT,
        category TEXT NOT NULL CHECK (category IN ('financial', 'operating')),
        value_type TEXT NOT NULL CHECK (value_type IN ('number', 'text', 'boolean')),
        canonical_unit TEXT,
        period_behavior TEXT NOT NULL CHECK (period_behavior IN ('duration', 'instant')),
        aggregation_rule TEXT,
        origin_pack_id TEXT,
        origin_pack_version TEXT,
        allowed_dimensions_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(allowed_dimensions_json)),
        metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (namespace, name)
      ) STRICT;

      CREATE TABLE sources (
        source_id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL CHECK (source_type IN ('filing', 'earnings', 'company_release', 'analyst_report', 'media', 'api', 'manual', 'other')),
        title TEXT NOT NULL,
        publisher TEXT NOT NULL,
        author TEXT,
        published_at TEXT,
        accessed_at TEXT,
        original_url TEXT,
        accounting_standard TEXT,
        upstream_source_id TEXT REFERENCES sources(source_id),
        notes TEXT,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE source_artifacts (
        artifact_id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES sources(source_id) ON DELETE RESTRICT,
        artifact_kind TEXT NOT NULL CHECK (artifact_kind IN ('original', 'curated', 'extracted', 'transformed')),
        media_type TEXT NOT NULL,
        local_path TEXT NOT NULL UNIQUE,
        sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
        original_retained INTEGER NOT NULL CHECK (original_retained IN (0, 1)),
        transformation_method TEXT CHECK (transformation_method IS NULL OR transformation_method IN ('manual_edit', 'ai_assisted_manual_edit', 'html_to_markdown', 'ocr', 'parser', 'other')),
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE evidence (
        evidence_id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL REFERENCES source_artifacts(artifact_id) ON DELETE RESTRICT,
        locator_type TEXT NOT NULL CHECK (locator_type IN ('pdf', 'markdown', 'spreadsheet', 'api', 'other')),
        locator_json TEXT NOT NULL CHECK (json_valid(locator_json)),
        excerpt_text TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE facts (
        fact_id TEXT PRIMARY KEY,
        metric_id TEXT NOT NULL REFERENCES metric_definitions(metric_id) ON DELETE RESTRICT,
        company_industry_id TEXT,
        business_line_id TEXT,
        period_type TEXT NOT NULL CHECK (period_type IN ('duration', 'instant')),
        period_start TEXT,
        period_end TEXT NOT NULL,
        value_number REAL,
        value_text TEXT,
        value_boolean INTEGER CHECK (value_boolean IS NULL OR value_boolean IN (0, 1)),
        unit TEXT,
        source_reported_at TEXT,
        observed_at TEXT,
        dimensions_json TEXT CHECK (dimensions_json IS NULL OR json_valid(dimensions_json)),
        ingestion_method TEXT NOT NULL,
        verification_status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK ((value_number IS NOT NULL) + (value_text IS NOT NULL) + (value_boolean IS NOT NULL) = 1),
        CHECK (
          (period_type = 'duration' AND period_start IS NOT NULL) OR
          (period_type = 'instant' AND period_start IS NULL)
        )
      ) STRICT;

      CREATE TABLE fact_evidence (
        fact_id TEXT NOT NULL REFERENCES facts(fact_id) ON DELETE CASCADE,
        evidence_id TEXT NOT NULL REFERENCES evidence(evidence_id) ON DELETE RESTRICT,
        PRIMARY KEY (fact_id, evidence_id)
      ) STRICT, WITHOUT ROWID;

      CREATE INDEX facts_metric_period_idx ON facts(metric_id, period_end);
      CREATE INDEX artifacts_source_idx ON source_artifacts(source_id);
      CREATE INDEX evidence_artifact_idx ON evidence(artifact_id);
    `,
  },
  {
    version: 2,
    name: 'legacy_observation_staging',
    sql: `
      CREATE TABLE legacy_observations (
        observation_id TEXT PRIMARY KEY,
        entity_id TEXT NOT NULL,
        legacy_metric_id TEXT NOT NULL,
        mapped_metric_id TEXT REFERENCES metric_definitions(metric_id) ON DELETE RESTRICT,
        period_start TEXT,
        period_end TEXT,
        as_of_date TEXT,
        period_kind TEXT NOT NULL,
        value TEXT,
        value_min TEXT,
        value_max TEXT,
        unit TEXT,
        currency TEXT,
        scope TEXT,
        dimensions_text TEXT,
        value_nature TEXT NOT NULL,
        source_id TEXT,
        source_locator TEXT,
        review_status TEXT NOT NULL,
        notes TEXT,
        evidence_id TEXT REFERENCES evidence(evidence_id) ON DELETE RESTRICT,
        imported_at TEXT NOT NULL,
        promoted_fact_id TEXT REFERENCES facts(fact_id) ON DELETE SET NULL
      ) STRICT;

      CREATE INDEX legacy_observations_metric_idx ON legacy_observations(legacy_metric_id);
      CREATE INDEX legacy_observations_review_idx ON legacy_observations(review_status);
    `,
  },
  {
    version: 3,
    name: 'company_taxonomy',
    sql: `
      CREATE TABLE company_industries (
        company_industry_id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
        industry_id TEXT NOT NULL,
        is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        UNIQUE (company_id, industry_id)
      ) STRICT;

      CREATE UNIQUE INDEX company_industries_primary_idx
        ON company_industries(company_id) WHERE is_primary = 1 AND active = 1;

      CREATE TABLE business_lines (
        business_line_id TEXT PRIMARY KEY,
        company_industry_id TEXT NOT NULL REFERENCES company_industries(company_industry_id) ON DELETE CASCADE,
        business_line_type_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (company_industry_id, business_line_type_id)
      ) STRICT;

      CREATE TABLE template_applications (
        application_id TEXT PRIMARY KEY,
        template_type TEXT NOT NULL,
        metric_pack_id TEXT NOT NULL,
        metric_pack_version TEXT NOT NULL,
        company_industry_id TEXT REFERENCES company_industries(company_industry_id) ON DELETE RESTRICT,
        applied_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX business_lines_industry_idx ON business_lines(company_industry_id);
    `,
  },
  {
    version: 4,
    name: 'point_in_time_estimates',
    sql: `
      CREATE TABLE estimates (
        estimate_id TEXT PRIMARY KEY,
        metric_id TEXT NOT NULL REFERENCES metric_definitions(metric_id) ON DELETE RESTRICT,
        company_industry_id TEXT,
        business_line_id TEXT,
        target_period_type TEXT NOT NULL CHECK (target_period_type IN ('duration', 'instant')),
        target_period_start TEXT,
        target_period_end TEXT NOT NULL,
        as_of TEXT NOT NULL,
        published_at TEXT,
        observed_at TEXT,
        provider TEXT NOT NULL,
        analyst TEXT,
        estimate_type TEXT NOT NULL,
        value_number REAL,
        value_text TEXT,
        unit TEXT,
        dimensions_json TEXT CHECK (dimensions_json IS NULL OR json_valid(dimensions_json)),
        ingestion_method TEXT NOT NULL,
        verification_status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        CHECK ((value_number IS NOT NULL) + (value_text IS NOT NULL) = 1),
        CHECK (
          (target_period_type = 'duration' AND target_period_start IS NOT NULL) OR
          (target_period_type = 'instant' AND target_period_start IS NULL)
        )
      ) STRICT;

      CREATE TABLE estimate_evidence (
        estimate_id TEXT NOT NULL REFERENCES estimates(estimate_id) ON DELETE CASCADE,
        evidence_id TEXT NOT NULL REFERENCES evidence(evidence_id) ON DELETE RESTRICT,
        PRIMARY KEY (estimate_id, evidence_id)
      ) STRICT, WITHOUT ROWID;

      CREATE INDEX estimates_metric_target_asof_idx ON estimates(metric_id, target_period_end, as_of);
      CREATE INDEX estimate_evidence_evidence_idx ON estimate_evidence(evidence_id);
    `,
  },
  {
    version: 5,
    name: 'corporate_management_temporal_model',
    sql: `
      CREATE TABLE people (
        person_id TEXT PRIMARY KEY,
        name_zh TEXT,
        name_en TEXT,
        birth_year INTEGER,
        biography TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (name_zh IS NOT NULL OR name_en IS NOT NULL)
      ) STRICT;

      CREATE TABLE organization_units (
        organization_unit_id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
        parent_unit_id TEXT REFERENCES organization_units(organization_unit_id) ON DELETE RESTRICT,
        name TEXT NOT NULL,
        unit_type TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        UNIQUE (company_id, name)
      ) STRICT;

      CREATE TABLE positions (
        position_id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
        organization_unit_id TEXT REFERENCES organization_units(organization_unit_id) ON DELETE RESTRICT,
        role_type TEXT,
        role_title_raw TEXT NOT NULL,
        position_name_normalized TEXT,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
      ) STRICT;

      CREATE TABLE role_assignments (
        assignment_id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
        person_id TEXT NOT NULL REFERENCES people(person_id) ON DELETE RESTRICT,
        position_id TEXT NOT NULL REFERENCES positions(position_id) ON DELETE RESTRICT,
        start_date TEXT NOT NULL,
        end_date TEXT,
        is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
        source_id TEXT REFERENCES sources(source_id) ON DELETE RESTRICT,
        evidence_id TEXT REFERENCES evidence(evidence_id) ON DELETE RESTRICT,
        CHECK (end_date IS NULL OR start_date <= end_date)
      ) STRICT;

      CREATE TABLE reporting_lines (
        reporting_line_id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
        subordinate_position_id TEXT NOT NULL REFERENCES positions(position_id) ON DELETE RESTRICT,
        manager_position_id TEXT NOT NULL REFERENCES positions(position_id) ON DELETE RESTRICT,
        relationship_type TEXT NOT NULL CHECK (relationship_type IN ('solid', 'dotted')),
        start_date TEXT NOT NULL,
        end_date TEXT,
        evidence_id TEXT REFERENCES evidence(evidence_id) ON DELETE RESTRICT,
        CHECK (subordinate_position_id <> manager_position_id),
        CHECK (end_date IS NULL OR start_date <= end_date)
      ) STRICT;

      CREATE INDEX role_assignments_person_idx ON role_assignments(person_id, start_date);
      CREATE INDEX role_assignments_position_idx ON role_assignments(position_id, start_date);
      CREATE INDEX reporting_lines_subordinate_idx ON reporting_lines(subordinate_position_id, start_date);
    `,
  },
  {
    version: 6,
    name: 'scenarios_and_model_runs',
    sql: `
      CREATE TABLE scenarios (
        scenario_id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        model_id TEXT NOT NULL,
        model_version TEXT NOT NULL,
        parameters_json TEXT NOT NULL CHECK (json_valid(parameters_json)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (company_id, model_id, name)
      ) STRICT;
      CREATE TABLE model_runs (
        model_run_id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
        model_id TEXT NOT NULL,
        model_version TEXT NOT NULL,
        scenario_id TEXT REFERENCES scenarios(scenario_id) ON DELETE SET NULL,
        run_at TEXT NOT NULL,
        inputs_json TEXT NOT NULL CHECK (json_valid(inputs_json)),
        outputs_json TEXT NOT NULL CHECK (json_valid(outputs_json)),
        notes TEXT
      ) STRICT;
      CREATE INDEX model_runs_company_idx ON model_runs(company_id, run_at);
    `,
  },
  {
    version: 7,
    name: 'cap_table_snapshots',
    sql: `
      CREATE TABLE share_classes (
        share_class_id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        security_type TEXT NOT NULL,
        exchange TEXT,
        ticker TEXT,
        currency TEXT,
        voting_rights_metadata TEXT CHECK (voting_rights_metadata IS NULL OR json_valid(voting_rights_metadata)),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        UNIQUE (company_id, name)
      ) STRICT;
      CREATE TABLE captable_snapshots (
        captable_snapshot_id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
        as_of_date TEXT NOT NULL,
        source_id TEXT REFERENCES sources(source_id) ON DELETE RESTRICT,
        evidence_id TEXT REFERENCES evidence(evidence_id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE captable_class_totals (
        captable_snapshot_id TEXT NOT NULL REFERENCES captable_snapshots(captable_snapshot_id) ON DELETE CASCADE,
        share_class_id TEXT NOT NULL REFERENCES share_classes(share_class_id) ON DELETE RESTRICT,
        shares_outstanding REAL NOT NULL,
        percentage_of_total_equity REAL,
        PRIMARY KEY (captable_snapshot_id, share_class_id)
      ) STRICT, WITHOUT ROWID;
      CREATE TABLE captable_positions (
        captable_position_id TEXT PRIMARY KEY,
        captable_snapshot_id TEXT NOT NULL REFERENCES captable_snapshots(captable_snapshot_id) ON DELETE CASCADE,
        holder_name TEXT NOT NULL,
        holder_id TEXT,
        share_class_id TEXT NOT NULL REFERENCES share_classes(share_class_id) ON DELETE RESTRICT,
        shares REAL,
        ownership_pct REAL,
        rank INTEGER
      ) STRICT;
      CREATE INDEX captable_snapshots_company_date_idx ON captable_snapshots(company_id, as_of_date);
      CREATE INDEX captable_positions_snapshot_idx ON captable_positions(captable_snapshot_id, rank);
    `,
  },
  {
    version: 8,
    name: 'natural_keys_for_temporal_imports',
    sql: `
      DELETE FROM role_assignments
      WHERE assignment_id NOT IN (
        SELECT MIN(assignment_id)
        FROM role_assignments
        GROUP BY company_id, person_id, position_id, start_date, ifnull(end_date, '')
      );
      CREATE TEMP TABLE captable_snapshot_dedup_map AS
      SELECT duplicate.captable_snapshot_id AS duplicate_id,
        (
          SELECT keeper.captable_snapshot_id
          FROM captable_snapshots keeper
          WHERE keeper.company_id = duplicate.company_id
            AND keeper.as_of_date = duplicate.as_of_date
          ORDER BY
            (
              (SELECT count(*) FROM captable_class_totals total
               WHERE total.captable_snapshot_id = keeper.captable_snapshot_id)
              +
              (SELECT count(*) FROM captable_positions position
               WHERE position.captable_snapshot_id = keeper.captable_snapshot_id)
            ) DESC,
            keeper.captable_snapshot_id
          LIMIT 1
        ) AS keeper_id
      FROM captable_snapshots duplicate
      WHERE duplicate.captable_snapshot_id <> (
        SELECT keeper.captable_snapshot_id
        FROM captable_snapshots keeper
        WHERE keeper.company_id = duplicate.company_id
          AND keeper.as_of_date = duplicate.as_of_date
        ORDER BY
          (
            (SELECT count(*) FROM captable_class_totals total
             WHERE total.captable_snapshot_id = keeper.captable_snapshot_id)
            +
            (SELECT count(*) FROM captable_positions position
             WHERE position.captable_snapshot_id = keeper.captable_snapshot_id)
          ) DESC,
          keeper.captable_snapshot_id
        LIMIT 1
      );
      INSERT OR IGNORE INTO captable_class_totals (
        captable_snapshot_id, share_class_id, shares_outstanding, percentage_of_total_equity
      )
      SELECT dedup.keeper_id, total.share_class_id, total.shares_outstanding, total.percentage_of_total_equity
      FROM captable_snapshot_dedup_map dedup
      JOIN captable_class_totals total ON total.captable_snapshot_id = dedup.duplicate_id;
      CREATE TEMP TABLE captable_snapshot_class_conflicts AS
      SELECT dedup.duplicate_id, dedup.keeper_id, duplicate_total.share_class_id
      FROM captable_snapshot_dedup_map dedup
      JOIN captable_class_totals duplicate_total
        ON duplicate_total.captable_snapshot_id = dedup.duplicate_id
      JOIN captable_class_totals keeper_total
        ON keeper_total.captable_snapshot_id = dedup.keeper_id
       AND keeper_total.share_class_id = duplicate_total.share_class_id
      WHERE duplicate_total.shares_outstanding IS NOT keeper_total.shares_outstanding
         OR duplicate_total.percentage_of_total_equity IS NOT keeper_total.percentage_of_total_equity;
      UPDATE captable_positions
      SET captable_snapshot_id = (
        SELECT dedup.keeper_id
        FROM captable_snapshot_dedup_map dedup
        WHERE dedup.duplicate_id = captable_positions.captable_snapshot_id
      )
      WHERE captable_snapshot_id IN (SELECT duplicate_id FROM captable_snapshot_dedup_map)
        AND NOT EXISTS (
          SELECT 1
          FROM captable_snapshot_class_conflicts conflict
          WHERE conflict.duplicate_id = captable_positions.captable_snapshot_id
            AND conflict.share_class_id = captable_positions.share_class_id
        );
      DELETE FROM captable_class_totals
      WHERE captable_snapshot_id IN (SELECT duplicate_id FROM captable_snapshot_dedup_map);
      DELETE FROM captable_snapshots
      WHERE captable_snapshot_id IN (SELECT duplicate_id FROM captable_snapshot_dedup_map);
      DROP TABLE captable_snapshot_class_conflicts;
      DROP TABLE captable_snapshot_dedup_map;
      CREATE UNIQUE INDEX role_assignments_natural_key_idx
        ON role_assignments(company_id, person_id, position_id, start_date, ifnull(end_date, ''));
      DROP INDEX captable_snapshots_company_date_idx;
      CREATE UNIQUE INDEX captable_snapshots_company_date_idx
        ON captable_snapshots(company_id, as_of_date);
    `,
  },
  {
    version: 9,
    name: 'reporting_line_natural_keys',
    sql: `
      DELETE FROM reporting_lines
      WHERE reporting_line_id NOT IN (
        SELECT MIN(reporting_line_id)
        FROM reporting_lines
        GROUP BY company_id, subordinate_position_id, manager_position_id, start_date, ifnull(end_date, ''), relationship_type
      );
      CREATE UNIQUE INDEX reporting_lines_natural_key_idx
        ON reporting_lines(company_id, subordinate_position_id, manager_position_id, start_date, ifnull(end_date, ''), relationship_type);
    `,
  },
  {
    version: 10,
    name: 'metric_pack_business_line_types',
    sql: `
      CREATE TABLE business_line_types (
        business_line_type_id TEXT PRIMARY KEY,
        industry_id TEXT NOT NULL,
        label_zh TEXT,
        label_en TEXT,
        origin_pack_id TEXT NOT NULL,
        origin_pack_version TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX business_line_types_industry_idx ON business_line_types(industry_id, business_line_type_id);

      WITH definitions (
        business_line_type_id, industry_id, label_zh, label_en, origin_pack_id, origin_pack_version
      ) AS (VALUES
        ('coal.coal_mining_and_sales', 'coal', '煤炭开采与销售', 'Coal Mining & Sales', 'coal', '0.1.0'),
        ('coal.coal_chemicals', 'coal', '煤炭化工', 'Coal Chemicals', 'coal', '0.1.0'),
        ('coal.power_generation', 'coal', '发电', 'Power Generation', 'coal', '0.1.0'),
        ('bank.retail_banking', 'bank', '零售银行', 'Retail Banking', 'bank', '0.1.0'),
        ('bank.wholesale_banking', 'bank', '批发银行', 'Wholesale Banking', 'bank', '0.1.0'),
        ('insurance.life_and_health', 'insurance', '寿险与健康险', 'Life & Health', 'insurance', '0.1.0'),
        ('insurance.p_and_c', 'insurance', '财产险', 'Property & Casualty', 'insurance', '0.1.0')
      )
      INSERT INTO business_line_types (
        business_line_type_id, industry_id, label_zh, label_en, origin_pack_id,
        origin_pack_version, created_at, updated_at
      )
      SELECT
        definition.business_line_type_id, definition.industry_id, definition.label_zh,
        definition.label_en, definition.origin_pack_id, definition.origin_pack_version,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      FROM definitions definition
      WHERE EXISTS (
        SELECT 1 FROM template_applications application
        WHERE application.template_type = 'metric_pack'
          AND application.metric_pack_id = definition.origin_pack_id
          AND application.metric_pack_version = definition.origin_pack_version
      ) OR EXISTS (
        SELECT 1 FROM metric_definitions metric
        WHERE metric.origin_pack_id = definition.origin_pack_id
          AND metric.origin_pack_version = definition.origin_pack_version
      );
    `,
  },
]

export function migrateDatabase(database: DatabaseSync): void {
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    ) STRICT;
  `)

  const rows = database.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>
  const applied = new Set(rows.map(({ version }) => version))
  const record = database.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue
    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(migration.sql)
      record.run(migration.version, migration.name, new Date().toISOString())
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }
}
