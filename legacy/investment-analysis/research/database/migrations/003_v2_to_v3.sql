PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

-- V3 phase A: evidence, entities, metric definitions, observations, and
-- coverage. This migration deliberately excludes business/risk models,
-- forecasting, valuation, and thesis tables.

ALTER TABLE company_names RENAME TO company_names_v2;
ALTER TABLE securities RENAME TO securities_v2;

CREATE TABLE entities (
    entity_id            INTEGER PRIMARY KEY AUTOINCREMENT,
    catalog_company_id   INTEGER,
    entity_type          TEXT NOT NULL,
    canonical_label      TEXT NOT NULL,
    status               TEXT NOT NULL DEFAULT 'active',
    is_research_subject  INTEGER NOT NULL DEFAULT 0,

    CHECK (entity_id BETWEEN 100000 AND 999999999),
    CHECK (entity_type IN (
        'company', 'organization', 'person', 'government', 'regulator', 'other'
    )),
    CHECK (length(trim(canonical_label)) > 0),
    CHECK (status IN ('active', 'inactive', 'dissolved', 'unknown')),
    CHECK (is_research_subject IN (0, 1)),
    UNIQUE (catalog_company_id)
);

INSERT INTO entities (
    entity_id, entity_type, canonical_label, status, is_research_subject
)
SELECT
    100000,
    'company',
    COALESCE(
        (
            SELECT name
            FROM company_names_v2
            WHERE name_type = 'common' AND is_current = 1
            ORDER BY
                CASE language WHEN 'zh-CN' THEN 0 WHEN 'zh' THEN 1 ELSE 2 END,
                company_name_id
            LIMIT 1
        ),
        (
            SELECT name
            FROM company_names_v2
            WHERE is_current = 1
            ORDER BY company_name_id
            LIMIT 1
        ),
        'Research subject'
    ),
    'active',
    1;

CREATE UNIQUE INDEX idx_entities_one_research_subject
    ON entities (is_research_subject)
    WHERE is_research_subject = 1;
CREATE INDEX idx_entities_label
    ON entities (canonical_label, entity_type);

CREATE TABLE research_items (
    item_id              INTEGER PRIMARY KEY AUTOINCREMENT,
    item_type            TEXT NOT NULL,
    information_class    TEXT NOT NULL,
    topic_code           TEXT,
    review_status        TEXT NOT NULL DEFAULT 'unreviewed',
    confidence_level     TEXT NOT NULL DEFAULT 'unknown',
    valid_from           TEXT,
    valid_to             TEXT,
    date_precision       TEXT,
    known_from           TEXT,
    recorded_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    superseded_at        TEXT,
    supersedes_item_id   INTEGER REFERENCES research_items(item_id),
    created_by_type      TEXT NOT NULL DEFAULT 'system',
    created_by           TEXT,

    CHECK (item_id BETWEEN 100000 AND 999999999),
    CHECK (length(trim(item_type)) > 0),
    CHECK (information_class IN (
        'disclosed_fact', 'standardized_fact', 'derived_result',
        'ai_inference', 'analyst_estimate', 'management_guidance',
        'market_consensus', 'analyst_assumption', 'analyst_judgment',
        'investment_conclusion', 'question'
    )),
    CHECK (review_status IN (
        'unreviewed', 'needs_review', 'confirmed', 'rejected', 'superseded'
    )),
    CHECK (confidence_level IN ('unknown', 'low', 'medium', 'high')),
    CHECK (date_precision IS NULL OR date_precision IN (
        'day', 'month', 'quarter', 'year', 'unknown'
    )),
    CHECK (created_by_type IN ('human', 'ai', 'system', 'import', 'migration')),
    CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to)
);

INSERT INTO research_items (
    item_id, item_type, information_class, topic_code,
    review_status, confidence_level, valid_from, valid_to,
    date_precision, created_by_type
)
SELECT
    company_name_id,
    'entity_name',
    'disclosed_fact',
    'company.identity',
    'needs_review',
    'unknown',
    valid_from,
    valid_to,
    CASE
        WHEN valid_from IS NOT NULL OR valid_to IS NOT NULL THEN 'day'
        ELSE NULL
    END,
    'migration'
FROM company_names_v2;

CREATE INDEX idx_research_items_class_status
    ON research_items (information_class, review_status);
CREATE INDEX idx_research_items_topic
    ON research_items (topic_code, item_type);
CREATE INDEX idx_research_items_temporal
    ON research_items (valid_from, valid_to, known_from);

CREATE TABLE entity_names (
    item_id       INTEGER PRIMARY KEY REFERENCES research_items(item_id) ON DELETE CASCADE,
    entity_id     INTEGER NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    language      TEXT NOT NULL,
    name_type     TEXT NOT NULL,
    is_current    INTEGER NOT NULL DEFAULT 1,
    is_official   INTEGER NOT NULL DEFAULT 0,

    CHECK (length(trim(name)) > 0),
    CHECK (
        length(language) <= 35
        AND language NOT GLOB '*[^A-Za-z0-9-]*'
        AND language NOT LIKE '-%'
        AND language NOT LIKE '%-'
        AND language NOT LIKE '%--%'
    ),
    CHECK (name_type IN ('legal', 'common', 'former', 'brand', 'other')),
    CHECK (is_current IN (0, 1)),
    CHECK (is_official IN (0, 1))
);

INSERT INTO entity_names (
    item_id, entity_id, name, language, name_type, is_current, is_official
)
SELECT
    company_name_id, 100000, name, language, name_type, is_current, is_official
FROM company_names_v2;

DROP TABLE company_names_v2;

CREATE INDEX idx_entity_names_lookup
    ON entity_names (name, language, is_current);
CREATE INDEX idx_entity_names_entity
    ON entity_names (entity_id, language, name_type, is_current);
CREATE UNIQUE INDEX idx_entity_names_one_current_per_entity_language_type
    ON entity_names (entity_id, language, name_type)
    WHERE is_current = 1 AND name_type IN ('legal', 'common');

-- Compatibility view for catalog validation and existing read-only queries.
CREATE VIEW company_names AS
SELECT
    n.item_id AS company_name_id,
    n.name,
    n.language,
    n.name_type,
    n.is_current,
    n.is_official,
    r.valid_from,
    r.valid_to
FROM entity_names n
JOIN research_items r USING (item_id)
JOIN entities e USING (entity_id)
WHERE e.is_research_subject = 1;

CREATE TABLE securities (
    security_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    issuer_entity_id  INTEGER NOT NULL REFERENCES entities(entity_id),
    security_type     TEXT NOT NULL DEFAULT 'ordinary_share',
    exchange_mic      TEXT NOT NULL,
    ticker            TEXT NOT NULL,
    share_class       TEXT,
    trading_currency  TEXT,
    isin              TEXT,
    listing_date      TEXT,
    delisting_date    TEXT,
    status            TEXT NOT NULL DEFAULT 'active',

    CHECK (security_id BETWEEN 100000 AND 999999),
    CHECK (security_type IN (
        'ordinary_share', 'preferred_share', 'adr', 'gdr', 'fund', 'other'
    )),
    CHECK (length(trim(exchange_mic)) > 0),
    CHECK (length(trim(ticker)) > 0),
    CHECK (listing_date IS NULL OR listing_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CHECK (delisting_date IS NULL OR delisting_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CHECK (listing_date IS NULL OR delisting_date IS NULL OR listing_date <= delisting_date),
    CHECK (status IN ('active', 'suspended', 'delisted', 'cancelled', 'unknown'))
);

INSERT INTO securities (
    security_id, issuer_entity_id, security_type, exchange_mic, ticker,
    share_class, trading_currency, isin, listing_date, delisting_date, status
)
SELECT
    security_id, 100000, security_type, exchange_mic, ticker,
    share_class, trading_currency, isin, listing_date, delisting_date, status
FROM securities_v2;

DROP TABLE securities_v2;

CREATE INDEX idx_securities_issuer
    ON securities (issuer_entity_id, status);
CREATE UNIQUE INDEX idx_securities_active_exchange_ticker
    ON securities (exchange_mic, ticker)
    WHERE status IN ('active', 'suspended');
CREATE UNIQUE INDEX idx_securities_isin
    ON securities (isin)
    WHERE isin IS NOT NULL;

CREATE TABLE entity_identifiers (
    item_id           INTEGER PRIMARY KEY REFERENCES research_items(item_id) ON DELETE CASCADE,
    entity_id         INTEGER NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    identifier_type   TEXT NOT NULL,
    identifier_value  TEXT NOT NULL,
    jurisdiction      TEXT,

    CHECK (length(trim(identifier_type)) > 0),
    CHECK (length(trim(identifier_value)) > 0),
    UNIQUE (identifier_type, identifier_value, jurisdiction)
);

CREATE TABLE entity_legal_states (
    item_id            INTEGER PRIMARY KEY REFERENCES research_items(item_id) ON DELETE CASCADE,
    entity_id          INTEGER NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    jurisdiction_code  TEXT NOT NULL,
    legal_form_code    TEXT,
    legal_status_code  TEXT NOT NULL,

    CHECK (length(trim(jurisdiction_code)) > 0),
    CHECK (legal_status_code IN (
        'active', 'dissolved', 'liquidating', 'reorganized', 'unknown'
    ))
);

CREATE INDEX idx_entity_legal_states_entity
    ON entity_legal_states (entity_id, jurisdiction_code, legal_status_code);

CREATE TABLE entity_events (
    item_id         INTEGER PRIMARY KEY REFERENCES research_items(item_id) ON DELETE CASCADE,
    entity_id       INTEGER NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL,
    event_date      TEXT,
    date_precision  TEXT NOT NULL DEFAULT 'day',
    title           TEXT NOT NULL,
    description     TEXT,

    CHECK (length(trim(event_type)) > 0),
    CHECK (date_precision IN ('day', 'month', 'quarter', 'year', 'unknown')),
    CHECK (length(trim(title)) > 0)
);

CREATE INDEX idx_entity_events_entity_date
    ON entity_events (entity_id, event_date, event_type);

CREATE TABLE entity_locations (
    item_id        INTEGER PRIMARY KEY REFERENCES research_items(item_id) ON DELETE CASCADE,
    entity_id      INTEGER NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    location_type  TEXT NOT NULL,
    country_code   TEXT,
    region_code    TEXT,
    city           TEXT,
    address_text   TEXT,
    postal_code    TEXT,

    CHECK (location_type IN (
        'registered_address', 'headquarters', 'principal_operation',
        'facility', 'mailing_address', 'other'
    )),
    CHECK (country_code IS NULL OR length(country_code) = 2)
);

CREATE INDEX idx_entity_locations_entity
    ON entity_locations (entity_id, location_type);

CREATE TABLE entity_websites (
    item_id          INTEGER PRIMARY KEY REFERENCES research_items(item_id) ON DELETE CASCADE,
    entity_id        INTEGER NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    website_type     TEXT NOT NULL,
    url              TEXT NOT NULL,
    normalized_host  TEXT NOT NULL,
    is_official      INTEGER NOT NULL DEFAULT 0,

    CHECK (website_type IN (
        'corporate', 'investor_relations', 'product', 'support',
        'careers', 'corporate_alias', 'other'
    )),
    CHECK (length(trim(url)) > 0),
    CHECK (length(trim(normalized_host)) > 0),
    CHECK (is_official IN (0, 1)),
    UNIQUE (entity_id, url, item_id)
);

CREATE TABLE entity_relationships (
    item_id             INTEGER PRIMARY KEY REFERENCES research_items(item_id) ON DELETE CASCADE,
    subject_entity_id   INTEGER NOT NULL REFERENCES entities(entity_id),
    object_entity_id    INTEGER NOT NULL REFERENCES entities(entity_id),
    relationship_type   TEXT NOT NULL,
    relationship_status TEXT NOT NULL DEFAULT 'active',
    details             TEXT,

    CHECK (subject_entity_id <> object_entity_id),
    CHECK (length(trim(relationship_type)) > 0),
    CHECK (relationship_status IN (
        'planned', 'active', 'ended', 'disputed', 'unknown'
    ))
);

CREATE INDEX idx_entity_relationships_subject
    ON entity_relationships (subject_entity_id, relationship_type);
CREATE INDEX idx_entity_relationships_object
    ON entity_relationships (object_entity_id, relationship_type);

CREATE TABLE document_families (
    document_family_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    publisher_entity_id INTEGER REFERENCES entities(entity_id),
    publisher_name      TEXT,
    document_type       TEXT NOT NULL,
    canonical_title     TEXT NOT NULL,
    external_key        TEXT,

    CHECK (document_family_id BETWEEN 100000 AND 999999999),
    CHECK (length(trim(document_type)) > 0),
    CHECK (length(trim(canonical_title)) > 0)
);

CREATE TABLE documents (
    document_id           INTEGER PRIMARY KEY AUTOINCREMENT,
    document_family_id    INTEGER NOT NULL REFERENCES document_families(document_family_id),
    version_label         TEXT,
    title                 TEXT NOT NULL,
    language              TEXT,
    source_url            TEXT,
    publication_date      TEXT,
    publication_precision TEXT NOT NULL DEFAULT 'unknown',
    accessed_at           TEXT,
    valid_from            TEXT,
    valid_to              TEXT,
    status                TEXT NOT NULL DEFAULT 'active',

    CHECK (document_id BETWEEN 100000 AND 999999999),
    CHECK (length(trim(title)) > 0),
    CHECK (publication_precision IN ('day', 'month', 'quarter', 'year', 'unknown')),
    CHECK (status IN ('active', 'superseded', 'withdrawn', 'unavailable')),
    CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to)
);

CREATE INDEX idx_documents_family
    ON documents (document_family_id, publication_date);
CREATE INDEX idx_documents_type_date
    ON documents (publication_date, status);

CREATE TABLE document_files (
    document_file_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id         INTEGER NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
    representation      TEXT NOT NULL,
    relative_path       TEXT NOT NULL,
    sha256              TEXT NOT NULL,
    mime_type           TEXT,
    byte_size           INTEGER,
    extractor_name      TEXT,
    extractor_version   TEXT,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CHECK (document_file_id BETWEEN 100000 AND 999999999),
    CHECK (representation IN (
        'original', 'snapshot', 'extracted_text', 'extracted_table',
        'transcript', 'thumbnail', 'other'
    )),
    CHECK (relative_path NOT LIKE '/%'),
    CHECK (relative_path NOT LIKE '../%'),
    CHECK (relative_path NOT LIKE '%/../%'),
    CHECK (length(sha256) = 64 AND lower(sha256) NOT GLOB '*[^0-9a-f]*'),
    CHECK (byte_size IS NULL OR byte_size >= 0),
    UNIQUE (sha256, representation)
);

CREATE TABLE document_relations (
    source_document_id  INTEGER NOT NULL REFERENCES documents(document_id),
    target_document_id  INTEGER NOT NULL REFERENCES documents(document_id),
    relation_type       TEXT NOT NULL,
    PRIMARY KEY (source_document_id, target_document_id, relation_type),
    CHECK (source_document_id <> target_document_id),
    CHECK (relation_type IN (
        'revises', 'translation_of', 'attachment_to', 'duplicates',
        'cites', 'replaces', 'derived_from'
    ))
);

CREATE TABLE evidence_links (
    evidence_link_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id           INTEGER NOT NULL REFERENCES research_items(item_id) ON DELETE CASCADE,
    document_id       INTEGER NOT NULL REFERENCES documents(document_id),
    locator_type      TEXT NOT NULL,
    locator_value     TEXT NOT NULL,
    evidence_role     TEXT NOT NULL DEFAULT 'supports',
    excerpt           TEXT,
    extraction_method TEXT NOT NULL DEFAULT 'manual',
    review_status     TEXT NOT NULL DEFAULT 'unreviewed',

    CHECK (evidence_link_id BETWEEN 100000 AND 999999999),
    CHECK (locator_type IN (
        'page', 'page_line', 'table', 'paragraph', 'section',
        'webpage_section', 'timestamp', 'cell_range', 'dataset_row', 'other'
    )),
    CHECK (length(trim(locator_value)) > 0),
    CHECK (evidence_role IN ('supports', 'contradicts', 'context', 'defines')),
    CHECK (extraction_method IN ('manual', 'parser', 'ocr', 'asr', 'ai')),
    CHECK (review_status IN ('unreviewed', 'confirmed', 'rejected')),
    UNIQUE (item_id, document_id, locator_type, locator_value, evidence_role)
);

CREATE INDEX idx_evidence_links_document
    ON evidence_links (document_id, locator_type);

CREATE TABLE processing_runs (
    processing_run_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    process_type          TEXT NOT NULL,
    tool_name             TEXT NOT NULL,
    tool_version          TEXT,
    input_document_file_id INTEGER REFERENCES document_files(document_file_id),
    output_document_file_id INTEGER REFERENCES document_files(document_file_id),
    started_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at          TEXT,
    run_status            TEXT NOT NULL DEFAULT 'running',
    error_message         TEXT,

    CHECK (processing_run_id BETWEEN 100000 AND 999999999),
    CHECK (length(trim(process_type)) > 0),
    CHECK (length(trim(tool_name)) > 0),
    CHECK (run_status IN ('running', 'succeeded', 'failed', 'cancelled')),
    CHECK ((run_status = 'running') = (completed_at IS NULL))
);

CREATE TABLE units (
    unit_code          TEXT PRIMARY KEY,
    unit_name          TEXT NOT NULL,
    dimension_type     TEXT NOT NULL,
    scale_to_base_text TEXT NOT NULL DEFAULT '1',
    base_unit_code     TEXT REFERENCES units(unit_code),
    currency_code      TEXT,

    CHECK (length(trim(unit_code)) > 0),
    CHECK (length(trim(unit_name)) > 0),
    CHECK (length(trim(dimension_type)) > 0)
);

INSERT INTO units (
    unit_code, unit_name, dimension_type, scale_to_base_text,
    base_unit_code, currency_code
)
VALUES
    ('CNY', '人民币元', 'currency', '1', NULL, 'CNY'),
    ('CNY_10K', '人民币万元', 'currency', '10000', 'CNY', 'CNY'),
    ('percent', '百分比', 'ratio', '0.01', NULL, NULL),
    ('unit', '台/件', 'count', '1', NULL, NULL),
    ('count', '个', 'count', '1', NULL, NULL),
    ('kg', '千克', 'mass', '1', NULL, NULL),
    ('hour', '小时', 'time', '1', NULL, NULL);

CREATE TABLE metric_definitions (
    metric_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_code      TEXT NOT NULL UNIQUE,
    canonical_name   TEXT NOT NULL,
    metric_category  TEXT NOT NULL,
    owner_scope      TEXT NOT NULL DEFAULT 'company',

    CHECK (metric_id BETWEEN 100000 AND 999999999),
    CHECK (length(trim(metric_code)) > 0),
    CHECK (metric_code NOT GLOB '*[^a-z0-9_.]*'),
    CHECK (metric_code NOT LIKE '.%' AND metric_code NOT LIKE '%.'),
    CHECK (metric_code NOT LIKE '%..%'),
    CHECK (length(trim(canonical_name)) > 0),
    CHECK (owner_scope IN (
        'company', 'industry', 'market', 'product', 'security', 'other'
    ))
);

CREATE TABLE metric_definition_versions (
    metric_version_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_id          INTEGER NOT NULL REFERENCES metric_definitions(metric_id) ON DELETE CASCADE,
    version_number     INTEGER NOT NULL,
    definition         TEXT NOT NULL,
    period_type        TEXT NOT NULL,
    value_type         TEXT NOT NULL,
    default_unit_code  TEXT REFERENCES units(unit_code),
    consolidation_rule TEXT,
    allowed_dimensions TEXT,
    valid_from         TEXT,
    valid_to           TEXT,
    formula_expression TEXT,
    status             TEXT NOT NULL DEFAULT 'active',

    CHECK (metric_version_id BETWEEN 100000 AND 999999999),
    CHECK (version_number >= 1),
    CHECK (period_type IN ('instant', 'duration', 'event', 'timeless')),
    CHECK (value_type IN ('decimal', 'integer', 'boolean', 'text', 'date')),
    CHECK (status IN ('draft', 'active', 'superseded', 'retired')),
    CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to),
    UNIQUE (metric_id, version_number),
    UNIQUE (metric_version_id, metric_id)
);

CREATE TABLE dimension_types (
    dimension_type_id INTEGER PRIMARY KEY AUTOINCREMENT,
    dimension_code    TEXT NOT NULL UNIQUE,
    name              TEXT NOT NULL,
    applies_to        TEXT NOT NULL DEFAULT 'observation',

    CHECK (dimension_type_id BETWEEN 100000 AND 999999999),
    CHECK (length(trim(dimension_code)) > 0),
    CHECK (dimension_code NOT GLOB '*[^a-z0-9_]*')
);

CREATE TABLE dimension_members (
    dimension_member_id INTEGER PRIMARY KEY AUTOINCREMENT,
    dimension_type_id   INTEGER NOT NULL REFERENCES dimension_types(dimension_type_id),
    parent_member_id    INTEGER REFERENCES dimension_members(dimension_member_id),
    member_code         TEXT NOT NULL,
    name                TEXT NOT NULL,
    valid_from          TEXT,
    valid_to            TEXT,

    CHECK (dimension_member_id BETWEEN 100000 AND 999999999),
    CHECK (length(trim(member_code)) > 0),
    CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to),
    UNIQUE (dimension_type_id, member_code, valid_from),
    UNIQUE (dimension_member_id, dimension_type_id)
);

CREATE TABLE observations (
    item_id               INTEGER PRIMARY KEY REFERENCES research_items(item_id) ON DELETE CASCADE,
    subject_entity_id     INTEGER REFERENCES entities(entity_id),
    metric_id             INTEGER NOT NULL REFERENCES metric_definitions(metric_id),
    metric_version_id     INTEGER NOT NULL,
    period_start          TEXT,
    period_end            TEXT,
    as_of_date            TEXT,
    fiscal_period_label   TEXT,
    date_precision        TEXT NOT NULL DEFAULT 'day',
    value_kind            TEXT NOT NULL DEFAULT 'actual',
    comparison_operator   TEXT NOT NULL DEFAULT 'eq',
    raw_value_text        TEXT,
    decimal_value_text    TEXT,
    decimal_low_text      TEXT,
    decimal_high_text     TEXT,
    text_value            TEXT,
    boolean_value         INTEGER,
    unit_code             TEXT REFERENCES units(unit_code),
    currency_code         TEXT,
    data_status           TEXT NOT NULL DEFAULT 'reported',
    consolidation_scope   TEXT,
    notes                 TEXT,

    FOREIGN KEY (metric_version_id, metric_id)
        REFERENCES metric_definition_versions(metric_version_id, metric_id),
    CHECK (period_start IS NULL OR period_end IS NULL OR period_start <= period_end),
    CHECK (date_precision IN ('day', 'month', 'quarter', 'year', 'unknown')),
    CHECK (value_kind IN (
        'actual', 'guidance', 'forecast', 'consensus', 'model_output',
        'target', 'event_amount', 'other'
    )),
    CHECK (comparison_operator IN ('eq', 'approx', 'gt', 'gte', 'lt', 'lte', 'range')),
    CHECK (boolean_value IS NULL OR boolean_value IN (0, 1)),
    CHECK (data_status IN (
        'reported', 'estimated', 'not_reported', 'not_available',
        'not_applicable', 'not_yet_researched'
    )),
    CHECK (
        data_status IN ('not_reported', 'not_available', 'not_applicable', 'not_yet_researched')
        OR raw_value_text IS NOT NULL
        OR decimal_value_text IS NOT NULL
        OR decimal_low_text IS NOT NULL
        OR decimal_high_text IS NOT NULL
        OR text_value IS NOT NULL
        OR boolean_value IS NOT NULL
    ),
    CHECK (
        comparison_operator <> 'range'
        OR (decimal_low_text IS NOT NULL AND decimal_high_text IS NOT NULL)
    )
);

CREATE INDEX idx_observations_metric_period
    ON observations (metric_id, period_end, as_of_date);
CREATE INDEX idx_observations_subject
    ON observations (subject_entity_id, metric_id);

CREATE TABLE observation_dimensions (
    observation_item_id INTEGER NOT NULL REFERENCES observations(item_id) ON DELETE CASCADE,
    dimension_type_id   INTEGER NOT NULL REFERENCES dimension_types(dimension_type_id),
    dimension_member_id INTEGER NOT NULL,
    PRIMARY KEY (observation_item_id, dimension_type_id),
    FOREIGN KEY (dimension_member_id, dimension_type_id)
        REFERENCES dimension_members(dimension_member_id, dimension_type_id)
);

CREATE TABLE item_relations (
    source_item_id   INTEGER NOT NULL REFERENCES research_items(item_id) ON DELETE CASCADE,
    target_item_id   INTEGER NOT NULL REFERENCES research_items(item_id) ON DELETE CASCADE,
    relation_type    TEXT NOT NULL,
    relation_nature  TEXT NOT NULL DEFAULT 'system_defined',
    notes            TEXT,
    PRIMARY KEY (source_item_id, target_item_id, relation_type),
    CHECK (source_item_id <> target_item_id),
    CHECK (relation_type IN (
        'supports', 'contradicts', 'depends_on', 'derived_from', 'normalizes',
        'corrects', 'supersedes', 'causes', 'impacts', 'invalidates',
        'monitors', 'answers', 'context_for'
    )),
    CHECK (relation_nature IN (
        'source_disclosed', 'analyst_judgment', 'formula_defined',
        'system_defined', 'ai_suggested'
    ))
);

CREATE TABLE quality_issues (
    item_id          INTEGER PRIMARY KEY REFERENCES research_items(item_id) ON DELETE CASCADE,
    issue_type       TEXT NOT NULL,
    severity         TEXT NOT NULL DEFAULT 'medium',
    title            TEXT NOT NULL,
    description      TEXT,
    issue_status     TEXT NOT NULL DEFAULT 'open',
    resolution       TEXT,
    resolved_at      TEXT,

    CHECK (issue_type IN (
        'missing_data', 'conflicting_evidence', 'duplicate', 'outlier',
        'stale', 'definition_mismatch', 'integrity_error', 'other'
    )),
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CHECK (issue_status IN ('open', 'investigating', 'resolved', 'accepted', 'wont_fix')),
    CHECK (
        (issue_status IN ('resolved', 'accepted', 'wont_fix'))
        = (resolved_at IS NOT NULL)
    )
);

CREATE TABLE research_questions (
    item_id          INTEGER PRIMARY KEY REFERENCES research_items(item_id) ON DELETE CASCADE,
    question         TEXT NOT NULL,
    priority         TEXT NOT NULL DEFAULT 'medium',
    question_status  TEXT NOT NULL DEFAULT 'open',
    close_condition  TEXT,
    answer_summary   TEXT,
    closed_at        TEXT,

    CHECK (length(trim(question)) > 0),
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    CHECK (question_status IN ('open', 'in_progress', 'answered', 'unanswerable', 'deferred')),
    CHECK ((question_status IN ('answered', 'unanswerable')) = (closed_at IS NOT NULL))
);

CREATE TABLE coverage_scopes (
    coverage_scope_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL,
    start_date        TEXT,
    end_date          TEXT,
    status            TEXT NOT NULL DEFAULT 'active',

    CHECK (coverage_scope_id BETWEEN 100000 AND 999999999),
    CHECK (status IN ('draft', 'active', 'retired')),
    CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);

CREATE TABLE coverage_requirements (
    coverage_requirement_id INTEGER PRIMARY KEY AUTOINCREMENT,
    coverage_scope_id       INTEGER NOT NULL REFERENCES coverage_scopes(coverage_scope_id) ON DELETE CASCADE,
    requirement_type        TEXT NOT NULL,
    requirement_key         TEXT NOT NULL,
    required_frequency      TEXT,
    materiality             TEXT NOT NULL DEFAULT 'medium',
    requires_human_review   INTEGER NOT NULL DEFAULT 0,

    CHECK (coverage_requirement_id BETWEEN 100000 AND 999999999),
    CHECK (requirement_type IN (
        'document_type', 'metric', 'topic', 'source', 'period', 'custom'
    )),
    CHECK (materiality IN ('low', 'medium', 'high', 'critical')),
    CHECK (requires_human_review IN (0, 1)),
    UNIQUE (coverage_scope_id, requirement_type, requirement_key)
);

CREATE TABLE coverage_results (
    coverage_requirement_id INTEGER PRIMARY KEY REFERENCES coverage_requirements(coverage_requirement_id) ON DELETE CASCADE,
    coverage_status         TEXT NOT NULL,
    current_through         TEXT,
    checked_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    details                 TEXT,

    CHECK (coverage_status IN (
        'covered', 'partially_covered', 'missing', 'unprocessed',
        'conflicted', 'not_available', 'not_applicable'
    ))
);

CREATE VIEW v_observations AS
SELECT
    o.*,
    m.metric_code,
    m.canonical_name,
    r.information_class,
    r.review_status,
    r.known_from,
    r.recorded_at
FROM observations o
JOIN research_items r USING (item_id)
JOIN metric_definitions m USING (metric_id);

DELETE FROM sqlite_sequence
WHERE name IN (
    'entities', 'research_items', 'securities', 'document_families',
    'documents', 'document_files', 'evidence_links', 'processing_runs',
    'metric_definitions', 'metric_definition_versions', 'dimension_types',
    'dimension_members', 'coverage_scopes', 'coverage_requirements'
);

INSERT INTO sqlite_sequence (name, seq) VALUES
    ('entities', COALESCE((SELECT MAX(entity_id) FROM entities), 99999)),
    ('research_items', COALESCE((SELECT MAX(item_id) FROM research_items), 99999)),
    ('securities', COALESCE((SELECT MAX(security_id) FROM securities), 99999)),
    ('document_families', 99999),
    ('documents', 99999),
    ('document_files', 99999),
    ('evidence_links', 99999),
    ('processing_runs', 99999),
    ('metric_definitions', 99999),
    ('metric_definition_versions', 99999),
    ('dimension_types', 99999),
    ('dimension_members', 99999),
    ('coverage_scopes', 99999),
    ('coverage_requirements', 99999);

PRAGMA user_version = 3;
COMMIT;
PRAGMA foreign_keys = ON;
