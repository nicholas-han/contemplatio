PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

DROP VIEW IF EXISTS v_open_quality_issues;
DROP VIEW IF EXISTS v_observations;

ALTER TABLE company_names RENAME TO company_names_v1;
ALTER TABLE securities RENAME TO securities_v1;

DROP TABLE observation_lineage;
DROP TABLE observation_evidence;
DROP TABLE research_item_evidence;
DROP TABLE observations;
DROP TABLE formulas;
DROP TABLE metric_definitions;
DROP TABLE research_items;
DROP TABLE positions;
DROP TABLE persons;
DROP TABLE entity_relationships;
DROP TABLE documents;
DROP TABLE entities;

CREATE TABLE company_names (
    company_name_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT NOT NULL,
    language         TEXT NOT NULL,
    name_type        TEXT NOT NULL,
    is_current       INTEGER NOT NULL DEFAULT 1,
    is_official      INTEGER NOT NULL DEFAULT 0,
    valid_from       TEXT,
    valid_to         TEXT,
    CHECK (company_name_id BETWEEN 100000 AND 999999),
    CHECK (length(trim(name)) > 0),
    CHECK (length(language) <= 35 AND language NOT GLOB '*[^A-Za-z0-9-]*'),
    CHECK (name_type IN ('legal', 'common', 'former', 'brand', 'other')),
    CHECK (is_current IN (0, 1)),
    CHECK (is_official IN (0, 1)),
    CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to),
    UNIQUE (name, language, name_type, valid_from)
);

CREATE TABLE securities (
    security_id       INTEGER PRIMARY KEY AUTOINCREMENT,
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
    CHECK (security_type IN ('ordinary_share', 'preferred_share', 'adr', 'gdr', 'fund', 'other')),
    CHECK (length(trim(exchange_mic)) > 0),
    CHECK (length(trim(ticker)) > 0),
    CHECK (listing_date IS NULL OR delisting_date IS NULL OR listing_date <= delisting_date),
    CHECK (status IN ('active', 'suspended', 'delisted', 'cancelled', 'unknown'))
);

INSERT INTO company_names
SELECT company_name_id, name, language, name_type, is_current, is_official, valid_from, valid_to
FROM company_names_v1;

INSERT INTO securities
SELECT security_id, security_type, exchange_mic, ticker, share_class,
       trading_currency, isin, listing_date, delisting_date, status
FROM securities_v1;

DROP TABLE company_names_v1;
DROP TABLE securities_v1;

CREATE INDEX idx_company_names_lookup
    ON company_names (name, language, is_current);
CREATE UNIQUE INDEX idx_company_names_unique_record
    ON company_names (name, language, name_type, COALESCE(valid_from, ''));
CREATE UNIQUE INDEX idx_company_names_one_current_per_language_type
    ON company_names (language, name_type)
    WHERE is_current = 1 AND name_type IN ('legal', 'common');
CREATE UNIQUE INDEX idx_securities_active_exchange_ticker
    ON securities (exchange_mic, ticker)
    WHERE status IN ('active', 'suspended');
CREATE UNIQUE INDEX idx_securities_isin
    ON securities (isin)
    WHERE isin IS NOT NULL;

DELETE FROM sqlite_sequence WHERE name IN ('company_names', 'securities');
INSERT INTO sqlite_sequence (name, seq)
VALUES ('company_names', COALESCE((SELECT MAX(company_name_id) FROM company_names), 99999));
INSERT INTO sqlite_sequence (name, seq)
VALUES ('securities', COALESCE((SELECT MAX(security_id) FROM securities), 99999));

PRAGMA user_version = 2;
COMMIT;
PRAGMA foreign_keys = ON;
