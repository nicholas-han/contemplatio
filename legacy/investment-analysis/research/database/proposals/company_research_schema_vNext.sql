-- Company research database vNext proposal.
--
-- DESIGN-ONLY: this file is not a migration and must not be applied to a
-- production company.sqlite. It validates the core relational boundaries in
-- docs/design/company-research-data-model.md. Later implementation phases may
-- split this proposal into multiple versioned migrations.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = DELETE;

-- --------------------------------------------------------------------------
-- Common research item identity and audit semantics
-- --------------------------------------------------------------------------

CREATE TABLE research_items (
    item_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    item_type           TEXT NOT NULL,
    information_class   TEXT NOT NULL,
    topic_code          TEXT,
    review_status       TEXT NOT NULL DEFAULT 'unreviewed',
    confidence_level    TEXT NOT NULL DEFAULT 'unknown',
    valid_from          TEXT,
    valid_to            TEXT,
    date_precision      TEXT,
    known_from          TEXT,
    recorded_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    superseded_at       TEXT,
    supersedes_item_id  INTEGER REFERENCES research_items(item_id),
    created_by_type     TEXT NOT NULL DEFAULT 'system',
    created_by          TEXT,

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
    CHECK (created_by_type IN ('human', 'ai', 'system', 'import')),
    CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to)
);

CREATE INDEX idx_research_items_class_status
    ON research_items (information_class, review_status);
CREATE INDEX idx_research_items_topic
    ON research_items (topic_code, item_type);

-- --------------------------------------------------------------------------
-- Sources, immutable document versions, and evidence
-- --------------------------------------------------------------------------

CREATE TABLE document_families (
    document_family_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    publisher_name      TEXT,
    document_type       TEXT NOT NULL,
    canonical_title     TEXT NOT NULL,
    external_key        TEXT,

    CHECK (document_family_id BETWEEN 100000 AND 999999999),
    CHECK (length(trim(document_type)) > 0),
    CHECK (length(trim(canonical_title)) > 0)
);

CREATE TABLE documents (
    document_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    document_family_id   INTEGER NOT NULL REFERENCES document_families(document_family_id),
    version_label        TEXT,
    title                TEXT NOT NULL,
    language             TEXT,
    source_url           TEXT,
    publication_date     TEXT,
    publication_precision TEXT NOT NULL DEFAULT 'unknown',
    accessed_at          TEXT,
    valid_from           TEXT,
    valid_to             TEXT,
    status               TEXT NOT NULL DEFAULT 'active',

    CHECK (document_id BETWEEN 100000 AND 999999999),
    CHECK (length(trim(title)) > 0),
    CHECK (publication_precision IN ('day', 'month', 'quarter', 'year', 'unknown')),
    CHECK (status IN ('active', 'superseded', 'withdrawn', 'unavailable')),
    CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to)
);

CREATE INDEX idx_documents_family
    ON documents (document_family_id, publication_date);

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

-- --------------------------------------------------------------------------
-- Entities, names, identifiers, people, and time-bound relationships
-- --------------------------------------------------------------------------

CREATE TABLE entities (
    entity_id            INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type          TEXT NOT NULL,
    canonical_label      TEXT NOT NULL,
    catalog_company_id   INTEGER,
    status               TEXT NOT NULL DEFAULT 'active',

    CHECK (entity_id BETWEEN 100000 AND 999999999),
    CHECK (entity_type IN (
        'company', 'organization', 'person', 'government', 'regulator',
        'market', 'business_unit', 'other'
    )),
    CHECK (length(trim(canonical_label)) > 0),
    CHECK (status IN ('active', 'inactive', 'dissolved', 'unknown')),
    UNIQUE (catalog_company_id)
);

CREATE TABLE entity_names (
    item_id       INTEGER PRIMARY KEY REFERENCES research_items(item_id) ON DELETE CASCADE,
    entity_id     INTEGER NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    language      TEXT NOT NULL,
    name_type     TEXT NOT NULL,
    is_official   INTEGER NOT NULL DEFAULT 0,

    CHECK (length(trim(name)) > 0),
    CHECK (language NOT GLOB '*[^A-Za-z0-9-]*'),
    CHECK (name_type IN ('legal', 'common', 'former', 'brand', 'trade', 'other')),
    CHECK (is_official IN (0, 1)),
    UNIQUE (entity_id, name, language, name_type, item_id)
);

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

CREATE TABLE entity_locations (
    item_id          INTEGER PRIMARY KEY REFERENCES research_items(item_id) ON DELETE CASCADE,
    entity_id        INTEGER NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    location_type    TEXT NOT NULL,
    country_code     TEXT,
    region           TEXT,
    city             TEXT,
    address_text     TEXT,
    postal_code      TEXT,

    CHECK (location_type IN (
        'registered_address', 'headquarters', 'principal_operation',
        'facility', 'mailing', 'other'
    )),
    CHECK (country_code IS NULL OR length(country_code) = 2)
);

CREATE TABLE entity_relationships (
    item_id          INTEGER PRIMARY KEY REFERENCES research_items(item_id) ON DELETE CASCADE,
    subject_entity_id INTEGER NOT NULL REFERENCES entities(entity_id),
    object_entity_id INTEGER NOT NULL REFERENCES entities(entity_id),
    relationship_type TEXT NOT NULL,
    relation_status  TEXT NOT NULL DEFAULT 'active',
    details          TEXT,

    CHECK (subject_entity_id <> object_entity_id),
    CHECK (length(trim(relationship_type)) > 0),
    CHECK (relation_status IN ('planned', 'active', 'ended', 'disputed', 'unknown'))
);

CREATE INDEX idx_entity_relationships_subject
    ON entity_relationships (subject_entity_id, relationship_type);
CREATE INDEX idx_entity_relationships_object
    ON entity_relationships (object_entity_id, relationship_type);

CREATE TABLE ownership_interests (
    item_id            INTEGER PRIMARY KEY REFERENCES research_items(item_id) ON DELETE CASCADE,
    owner_entity_id    INTEGER NOT NULL REFERENCES entities(entity_id),
    owned_entity_id    INTEGER NOT NULL REFERENCES entities(entity_id),
    interest_type      TEXT NOT NULL,
    ownership_pct_text TEXT,
    voting_pct_text    TEXT,
    control_type       TEXT,
    shares_text        TEXT,
    currency           TEXT,
    consideration_text TEXT,

    CHECK (owner_entity_id <> owned_entity_id),
    CHECK (interest_type IN ('direct', 'indirect', 'beneficial', 'voting_agreement', 'other')),
    CHECK (control_type IS NULL OR control_type IN (
        'control', 'joint_control', 'significant_influence', 'non_controlling', 'unknown'
    ))
);

CREATE TABLE positions (
    item_id               INTEGER PRIMARY KEY REFERENCES research_items(item_id) ON DELETE CASCADE,
    person_entity_id      INTEGER NOT NULL REFERENCES entities(entity_id),
    organization_entity_id INTEGER NOT NULL REFERENCES entities(entity_id),
    role_type             TEXT NOT NULL,
    title                 TEXT,
    is_primary            INTEGER NOT NULL DEFAULT 0,

    CHECK (length(trim(role_type)) > 0),
    CHECK (is_primary IN (0, 1))
);

-- --------------------------------------------------------------------------
-- Events, products, technologies, and business structure
-- --------------------------------------------------------------------------

CREATE TABLE events (
    item_id          INTEGER PRIMARY KEY REFERENCES research_items(item_id) ON DELETE CASCADE,
    event_type       TEXT NOT NULL,
    title            TEXT NOT NULL,
    announced_date   TEXT,
    effective_date   TEXT,
    completed_date   TEXT,
    date_precision   TEXT NOT NULL DEFAULT 'unknown',
    event_status     TEXT NOT NULL DEFAULT 'announced',
    summary          TEXT,

    CHECK (length(trim(event_type)) > 0),
    CHECK (length(trim(title)) > 0),
    CHECK (date_precision IN ('day', 'month', 'quarter', 'year', 'unknown')),
    CHECK (event_status IN (
        'rumored', 'proposed', 'announced', 'approved', 'in_progress',
        'completed', 'cancelled', 'rejected', 'unknown'
    ))
);

CREATE TABLE event_participants (
    event_item_id  INTEGER NOT NULL REFERENCES events(item_id) ON DELETE CASCADE,
    entity_id      INTEGER NOT NULL REFERENCES entities(entity_id),
    participant_role TEXT NOT NULL,
    PRIMARY KEY (event_item_id, entity_id, participant_role)
);

CREATE TABLE business_segments (
    segment_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_segment_id INTEGER REFERENCES business_segments(segment_id),
    segment_type     TEXT NOT NULL,
    name             TEXT NOT NULL,
    definition       TEXT,
    definition_status TEXT NOT NULL DEFAULT 'analyst_defined',

    CHECK (segment_id BETWEEN 100000 AND 999999999),
    CHECK (segment_type IN (
        'reported_segment', 'research_segment', 'product_family',
        'geography', 'channel', 'customer_group', 'other'
    )),
    CHECK (definition_status IN (
        'company_reported', 'regulatory_reported', 'analyst_defined', 'needs_review'
    )),
    UNIQUE (parent_segment_id, segment_type, name)
);

CREATE TABLE products (
    product_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    product_type     TEXT NOT NULL,
    product_name     TEXT NOT NULL,
    family_segment_id INTEGER REFERENCES business_segments(segment_id),
    launch_date      TEXT,
    end_date         TEXT,
    status           TEXT NOT NULL DEFAULT 'active',

    CHECK (product_id BETWEEN 100000 AND 999999999),
    CHECK (length(trim(product_type)) > 0),
    CHECK (length(trim(product_name)) > 0),
    CHECK (status IN ('planned', 'announced', 'active', 'discontinued', 'unknown')),
    CHECK (launch_date IS NULL OR end_date IS NULL OR launch_date <= end_date),
    UNIQUE (product_name, product_type)
);

CREATE TABLE product_variants (
    product_variant_id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id         INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    variant_name       TEXT NOT NULL,
    sku                TEXT,
    target_use         TEXT,
    valid_from         TEXT,
    valid_to           TEXT,
    status             TEXT NOT NULL DEFAULT 'active',

    CHECK (product_variant_id BETWEEN 100000 AND 999999999),
    CHECK (length(trim(variant_name)) > 0),
    CHECK (status IN ('planned', 'announced', 'active', 'discontinued', 'unknown')),
    CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to),
    UNIQUE (product_id, variant_name, valid_from)
);

CREATE TABLE technologies (
    item_id          INTEGER PRIMARY KEY REFERENCES research_items(item_id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    technology_type  TEXT NOT NULL,
    maturity_stage   TEXT,
    description      TEXT,

    CHECK (length(trim(name)) > 0),
    CHECK (length(trim(technology_type)) > 0),
    CHECK (maturity_stage IS NULL OR maturity_stage IN (
        'concept', 'basic_research', 'prototype', 'pilot',
        'trial_production', 'mass_production', 'mature', 'unknown'
    ))
);

CREATE TABLE product_technologies (
    product_id      INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    technology_item_id INTEGER NOT NULL REFERENCES technologies(item_id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL DEFAULT 'uses',
    PRIMARY KEY (product_id, technology_item_id, relationship_type),
    CHECK (relationship_type IN ('uses', 'enables', 'depends_on', 'replaces', 'other'))
);

-- --------------------------------------------------------------------------
-- Units, versioned metric definitions, dimensions, and observations
-- --------------------------------------------------------------------------

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

CREATE TABLE metric_definitions (
    metric_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_code        TEXT NOT NULL UNIQUE,
    canonical_name     TEXT NOT NULL,
    metric_category    TEXT NOT NULL,
    owner_scope        TEXT NOT NULL DEFAULT 'company',

    CHECK (metric_id BETWEEN 100000 AND 999999999),
    CHECK (length(trim(metric_code)) > 0),
    CHECK (metric_code NOT GLOB '*[^a-z0-9_.]*'),
    CHECK (metric_code NOT LIKE '.%' AND metric_code NOT LIKE '%.'),
    CHECK (metric_code NOT LIKE '%..%'),
    CHECK (length(trim(canonical_name)) > 0),
    CHECK (owner_scope IN ('company', 'industry', 'market', 'product', 'security', 'other'))
);

CREATE TABLE metric_definition_versions (
    metric_version_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_id           INTEGER NOT NULL REFERENCES metric_definitions(metric_id) ON DELETE CASCADE,
    version_number      INTEGER NOT NULL,
    definition          TEXT NOT NULL,
    period_type         TEXT NOT NULL,
    value_type          TEXT NOT NULL,
    default_unit_code   TEXT REFERENCES units(unit_code),
    consolidation_rule  TEXT,
    valid_from          TEXT,
    valid_to            TEXT,
    formula_expression  TEXT,
    status              TEXT NOT NULL DEFAULT 'active',

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
    applies_to        TEXT NOT NULL DEFAULT 'all',

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
    entity_id           INTEGER REFERENCES entities(entity_id),
    product_id          INTEGER REFERENCES products(product_id),
    product_variant_id  INTEGER REFERENCES product_variants(product_variant_id),
    segment_id          INTEGER REFERENCES business_segments(segment_id),
    valid_from          TEXT,
    valid_to            TEXT,

    CHECK (dimension_member_id BETWEEN 100000 AND 999999999),
    CHECK (length(trim(member_code)) > 0),
    CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to),
    CHECK (
        (entity_id IS NOT NULL) +
        (product_id IS NOT NULL) +
        (product_variant_id IS NOT NULL) +
        (segment_id IS NOT NULL) <= 1
    ),
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
        (data_status IN ('not_reported', 'not_available', 'not_applicable', 'not_yet_researched'))
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

-- --------------------------------------------------------------------------
-- Quality issues, questions, risks, and obligations
-- --------------------------------------------------------------------------

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

CREATE TABLE risks (
    item_id          INTEGER PRIMARY KEY REFERENCES research_items(item_id) ON DELETE CASCADE,
    title            TEXT NOT NULL,
    risk_category    TEXT NOT NULL,
    likelihood       TEXT NOT NULL DEFAULT 'unknown',
    impact_level     TEXT NOT NULL DEFAULT 'unknown',
    risk_status      TEXT NOT NULL DEFAULT 'open',
    time_horizon     TEXT,
    description      TEXT,

    CHECK (length(trim(title)) > 0),
    CHECK (length(trim(risk_category)) > 0),
    CHECK (likelihood IN ('unknown', 'low', 'medium', 'high')),
    CHECK (impact_level IN ('unknown', 'low', 'medium', 'high', 'critical')),
    CHECK (risk_status IN ('open', 'monitoring', 'mitigated', 'occurred', 'closed'))
);

CREATE TABLE obligations (
    item_id          INTEGER PRIMARY KEY REFERENCES research_items(item_id) ON DELETE CASCADE,
    obligation_type  TEXT NOT NULL,
    counterparty_entity_id INTEGER REFERENCES entities(entity_id),
    description      TEXT NOT NULL,
    probability      TEXT NOT NULL DEFAULT 'unknown',
    amount_low_text  TEXT,
    amount_high_text TEXT,
    currency_code    TEXT,
    due_date         TEXT,
    obligation_status TEXT NOT NULL DEFAULT 'open',

    CHECK (probability IN ('unknown', 'remote', 'possible', 'probable', 'certain')),
    CHECK (obligation_status IN ('open', 'triggered', 'settled', 'expired', 'disputed'))
);

-- --------------------------------------------------------------------------
-- Models, scenarios, assumptions, valuation, and research artifacts
-- --------------------------------------------------------------------------

CREATE TABLE models (
    model_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    model_type        TEXT NOT NULL,
    name              TEXT NOT NULL,
    description       TEXT,
    status            TEXT NOT NULL DEFAULT 'active',

    CHECK (model_id BETWEEN 100000 AND 999999999),
    CHECK (model_type IN (
        'forecast', 'valuation', 'financial_statement', 'sensitivity',
        'scoring', 'other'
    )),
    CHECK (status IN ('draft', 'active', 'retired')),
    UNIQUE (model_type, name)
);

CREATE TABLE model_versions (
    model_version_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id          INTEGER NOT NULL REFERENCES models(model_id) ON DELETE CASCADE,
    version_label     TEXT NOT NULL,
    relative_path     TEXT NOT NULL,
    sha256            TEXT NOT NULL,
    runtime_spec      TEXT,
    created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status            TEXT NOT NULL DEFAULT 'active',

    CHECK (model_version_id BETWEEN 100000 AND 999999999),
    CHECK (relative_path NOT LIKE '/%'),
    CHECK (length(sha256) = 64 AND lower(sha256) NOT GLOB '*[^0-9a-f]*'),
    CHECK (status IN ('draft', 'active', 'retired')),
    UNIQUE (model_id, version_label),
    UNIQUE (model_version_id, model_id)
);

CREATE TABLE scenarios (
    scenario_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL,
    scenario_type     TEXT NOT NULL,
    as_of_date        TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'draft',
    description       TEXT,

    CHECK (scenario_id BETWEEN 100000 AND 999999999),
    CHECK (scenario_type IN ('base', 'bull', 'bear', 'stress', 'custom')),
    CHECK (status IN ('draft', 'confirmed', 'retired')),
    UNIQUE (name, as_of_date)
);

CREATE TABLE assumptions (
    item_id           INTEGER PRIMARY KEY REFERENCES research_items(item_id) ON DELETE CASCADE,
    scenario_id       INTEGER NOT NULL REFERENCES scenarios(scenario_id) ON DELETE CASCADE,
    metric_id         INTEGER REFERENCES metric_definitions(metric_id),
    value_observation_item_id INTEGER REFERENCES observations(item_id),
    statement         TEXT NOT NULL,
    rationale         TEXT,
    confirmed_by      TEXT,
    confirmed_at      TEXT,

    CHECK (length(trim(statement)) > 0),
    CHECK ((confirmed_by IS NULL) = (confirmed_at IS NULL))
);

CREATE TABLE model_runs (
    model_run_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id          INTEGER NOT NULL REFERENCES models(model_id),
    model_version_id  INTEGER NOT NULL,
    scenario_id       INTEGER REFERENCES scenarios(scenario_id),
    data_cutoff_at    TEXT NOT NULL,
    started_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at      TEXT,
    run_status        TEXT NOT NULL DEFAULT 'running',
    environment_fingerprint TEXT,
    error_message     TEXT,

    FOREIGN KEY (model_version_id, model_id)
        REFERENCES model_versions(model_version_id, model_id),
    CHECK (model_run_id BETWEEN 100000 AND 999999999),
    CHECK (run_status IN ('running', 'succeeded', 'failed', 'cancelled')),
    CHECK ((run_status = 'running') = (completed_at IS NULL))
);

CREATE TABLE model_run_items (
    model_run_id     INTEGER NOT NULL REFERENCES model_runs(model_run_id) ON DELETE CASCADE,
    item_id          INTEGER NOT NULL REFERENCES research_items(item_id),
    item_role        TEXT NOT NULL,
    PRIMARY KEY (model_run_id, item_id, item_role),
    CHECK (item_role IN ('input', 'assumption', 'output', 'validation'))
);

CREATE TABLE valuation_runs (
    valuation_run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_run_id     INTEGER NOT NULL UNIQUE REFERENCES model_runs(model_run_id),
    subject_type     TEXT NOT NULL,
    subject_entity_id INTEGER REFERENCES entities(entity_id),
    security_id      INTEGER,
    valuation_date   TEXT NOT NULL,
    valuation_method TEXT NOT NULL,
    reporting_currency TEXT NOT NULL,
    conclusion_item_id INTEGER REFERENCES research_items(item_id),

    CHECK (valuation_run_id BETWEEN 100000 AND 999999999),
    CHECK (subject_type IN ('enterprise', 'equity', 'segment', 'security')),
    CHECK (length(trim(valuation_method)) > 0)
);

CREATE TABLE theses (
    item_id          INTEGER PRIMARY KEY REFERENCES research_items(item_id) ON DELETE CASCADE,
    thesis_type      TEXT NOT NULL,
    title            TEXT NOT NULL,
    statement        TEXT NOT NULL,
    time_horizon     TEXT,
    thesis_status    TEXT NOT NULL DEFAULT 'draft',
    analyst_owner    TEXT,

    CHECK (thesis_type IN (
        'investment', 'business', 'industry', 'management', 'risk',
        'counter_thesis', 'falsification_test', 'conclusion'
    )),
    CHECK (length(trim(title)) > 0),
    CHECK (length(trim(statement)) > 0),
    CHECK (thesis_status IN (
        'draft', 'active', 'strengthened', 'weakened', 'invalidated',
        'retired', 'unknown'
    ))
);

CREATE TABLE artifacts (
    artifact_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    artifact_type     TEXT NOT NULL,
    title             TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'draft',

    CHECK (artifact_id BETWEEN 100000 AND 999999999),
    CHECK (artifact_type IN (
        'one_pager', 'industry_map', 'investment_memo', 'valuation_sheet',
        'thesis_tracker', 'ic_memo', 'post_mortem', 'other'
    )),
    CHECK (status IN ('draft', 'in_review', 'approved', 'superseded', 'archived'))
);

CREATE TABLE artifact_versions (
    artifact_version_id INTEGER PRIMARY KEY AUTOINCREMENT,
    artifact_id         INTEGER NOT NULL REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
    version_number      INTEGER NOT NULL,
    relative_path       TEXT NOT NULL,
    sha256              TEXT NOT NULL,
    data_cutoff_at      TEXT NOT NULL,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    supersedes_version_id INTEGER REFERENCES artifact_versions(artifact_version_id),

    CHECK (artifact_version_id BETWEEN 100000 AND 999999999),
    CHECK (version_number >= 1),
    CHECK (relative_path NOT LIKE '/%'),
    CHECK (length(sha256) = 64 AND lower(sha256) NOT GLOB '*[^0-9a-f]*'),
    UNIQUE (artifact_id, version_number)
);

CREATE TABLE artifact_items (
    artifact_version_id INTEGER NOT NULL REFERENCES artifact_versions(artifact_version_id) ON DELETE CASCADE,
    item_id              INTEGER NOT NULL REFERENCES research_items(item_id),
    item_role            TEXT NOT NULL DEFAULT 'cited',
    PRIMARY KEY (artifact_version_id, item_id, item_role),
    CHECK (item_role IN ('cited', 'input', 'conclusion', 'question', 'risk'))
);

-- --------------------------------------------------------------------------
-- Coverage and update state
-- --------------------------------------------------------------------------

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

-- Keep AUTOINCREMENT-generated IDs out of the low range used by hand-written
-- temporary fixtures and consistent with the current six-plus-digit convention.
INSERT OR IGNORE INTO sqlite_sequence (name, seq) VALUES
    ('research_items', 99999),
    ('document_families', 99999),
    ('documents', 99999),
    ('document_files', 99999),
    ('evidence_links', 99999),
    ('entities', 99999),
    ('business_segments', 99999),
    ('products', 99999),
    ('product_variants', 99999),
    ('metric_definitions', 99999),
    ('metric_definition_versions', 99999),
    ('dimension_types', 99999),
    ('dimension_members', 99999),
    ('models', 99999),
    ('model_versions', 99999),
    ('scenarios', 99999),
    ('model_runs', 99999),
    ('valuation_runs', 99999),
    ('artifacts', 99999),
    ('artifact_versions', 99999),
    ('coverage_scopes', 99999),
    ('coverage_requirements', 99999);

PRAGMA user_version = 1000;
