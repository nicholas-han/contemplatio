PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

ALTER TABLE company_archives RENAME TO company_archives_v1;
ALTER TABLE securities RENAME TO securities_v1;
ALTER TABLE company_names RENAME TO company_names_v1;
ALTER TABLE companies RENAME TO companies_v1;

CREATE TABLE companies (
    company_id            TEXT PRIMARY KEY,
    legal_name            TEXT,
    legal_name_language   TEXT,
    common_name           TEXT NOT NULL,
    common_name_language  TEXT NOT NULL,
    inc_region            TEXT,
    status                TEXT NOT NULL DEFAULT 'active',

    CHECK (length(trim(company_id)) > 0),
    CHECK (legal_name IS NULL OR length(trim(legal_name)) > 0),
    CHECK ((legal_name IS NULL) = (legal_name_language IS NULL)),
    CHECK (length(trim(common_name)) > 0),
    CHECK (length(trim(common_name_language)) > 0),
    CHECK (legal_name_language IS NULL OR (
        length(legal_name_language) <= 35
        AND legal_name_language NOT GLOB '*[^A-Za-z0-9-]*'
        AND legal_name_language NOT LIKE '-%'
        AND legal_name_language NOT LIKE '%-'
        AND legal_name_language NOT LIKE '%--%'
    )),
    CHECK (
        length(common_name_language) <= 35
        AND common_name_language NOT GLOB '*[^A-Za-z0-9-]*'
        AND common_name_language NOT LIKE '-%'
        AND common_name_language NOT LIKE '%-'
        AND common_name_language NOT LIKE '%--%'
    ),
    CHECK (inc_region IS NULL OR length(trim(inc_region)) > 0),
    CHECK (status IN ('active', 'inactive', 'merged', 'liquidated', 'unknown'))
);

CREATE TABLE company_names (
    company_name_id  TEXT PRIMARY KEY,
    company_id       TEXT NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    language         TEXT NOT NULL,
    name_type        TEXT NOT NULL,
    is_current       INTEGER NOT NULL DEFAULT 1,
    is_official      INTEGER NOT NULL DEFAULT 0,
    valid_from       TEXT,
    valid_to         TEXT,

    CHECK (length(trim(company_name_id)) > 0),
    CHECK (length(trim(name)) > 0),
    CHECK (
        length(language) <= 35
        AND language NOT GLOB '*[^A-Za-z0-9-]*'
        AND language NOT LIKE '-%'
        AND language NOT LIKE '%-'
        AND language NOT LIKE '%--%'
    ),
    CHECK (name_type IN ('legal', 'common', 'short', 'former', 'brand', 'other')),
    CHECK (is_current IN (0, 1)),
    CHECK (is_official IN (0, 1)),
    CHECK (valid_from IS NULL OR valid_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CHECK (valid_to IS NULL OR valid_to GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to),
    UNIQUE (company_id, name, language, name_type, valid_from)
);

CREATE TABLE securities (
    security_id       TEXT PRIMARY KEY,
    company_id        TEXT NOT NULL REFERENCES companies(company_id) ON DELETE RESTRICT,
    security_type     TEXT NOT NULL DEFAULT 'ordinary_share',
    exchange_mic      TEXT NOT NULL,
    ticker            TEXT NOT NULL,
    share_class       TEXT,
    trading_currency  TEXT,
    isin              TEXT,
    listing_date      TEXT,
    delisting_date    TEXT,
    status            TEXT NOT NULL DEFAULT 'active',

    CHECK (length(trim(security_id)) > 0),
    CHECK (length(trim(exchange_mic)) > 0),
    CHECK (length(trim(ticker)) > 0),
    CHECK (security_type IN ('ordinary_share', 'preferred_share', 'adr', 'gdr', 'fund', 'other')),
    CHECK (listing_date IS NULL OR listing_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CHECK (delisting_date IS NULL OR delisting_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CHECK (listing_date IS NULL OR delisting_date IS NULL OR listing_date <= delisting_date),
    CHECK (status IN ('active', 'suspended', 'delisted', 'cancelled', 'unknown'))
);

CREATE TABLE company_archives (
    company_id                   TEXT PRIMARY KEY REFERENCES companies(company_id) ON DELETE CASCADE,
    folder_name                  TEXT NOT NULL UNIQUE,
    relative_path                TEXT NOT NULL UNIQUE,
    database_relative_path       TEXT UNIQUE,
    research_status              TEXT NOT NULL DEFAULT 'candidate',
    coverage_start               TEXT,
    information_current_through  TEXT,
    last_ingested_at             TEXT,
    last_reviewed_at             TEXT,

    CHECK (folder_name GLOB '[A-Za-z0-9]*' AND folder_name NOT GLOB '*[^A-Za-z0-9-]*'),
    CHECK (folder_name NOT LIKE '-%' AND folder_name NOT LIKE '%-' AND folder_name NOT LIKE '%--%'),
    CHECK (relative_path NOT LIKE '/%'),
    CHECK (relative_path NOT LIKE '%..%'),
    CHECK (database_relative_path IS NULL OR database_relative_path NOT LIKE '/%'),
    CHECK (database_relative_path IS NULL OR database_relative_path NOT LIKE '%..%'),
    CHECK (research_status IN ('candidate', 'building', 'active', 'paused', 'archived')),
    CHECK (coverage_start IS NULL OR coverage_start GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CHECK (information_current_through IS NULL OR information_current_through GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CHECK (coverage_start IS NULL OR information_current_through IS NULL OR coverage_start <= information_current_through)
);

INSERT INTO companies (
    company_id, legal_name, legal_name_language, common_name,
    common_name_language, inc_region, status
)
SELECT
    c.company_id,
    COALESCE(c.legal_name_zh, c.legal_name_en, c.legal_name_ja),
    CASE
        WHEN c.legal_name_zh IS NOT NULL THEN 'zh'
        WHEN c.legal_name_en IS NOT NULL THEN 'en'
        WHEN c.legal_name_ja IS NOT NULL THEN 'ja'
        ELSE NULL
    END,
    c.common_name,
    COALESCE(
        (
            SELECT n.language
            FROM company_names_v1 n
            WHERE n.company_id = c.company_id
              AND n.name = c.common_name
              AND n.is_current = 1
            ORDER BY CASE n.name_type WHEN 'common' THEN 0 WHEN 'short' THEN 1 ELSE 2 END,
                     n.company_name_id
            LIMIT 1
        ),
        'und'
    ),
    c.inc_region,
    c.status
FROM companies_v1 c;

INSERT INTO company_names (
    company_name_id, company_id, name, language, name_type,
    is_current, is_official, valid_from, valid_to
)
SELECT
    company_name_id, company_id, name, language, name_type,
    is_current,
    CASE WHEN name_type = 'legal' THEN 1 ELSE 0 END,
    valid_from, valid_to
FROM company_names_v1;

INSERT INTO securities SELECT * FROM securities_v1;
INSERT INTO company_archives SELECT * FROM company_archives_v1;

DROP TABLE company_archives_v1;
DROP TABLE securities_v1;
DROP TABLE company_names_v1;
DROP TABLE companies_v1;

CREATE UNIQUE INDEX idx_securities_active_exchange_ticker
    ON securities (exchange_mic, ticker)
    WHERE status IN ('active', 'suspended');
CREATE UNIQUE INDEX idx_securities_isin
    ON securities (isin)
    WHERE isin IS NOT NULL;
CREATE INDEX idx_company_names_lookup
    ON company_names (name, language, is_current);
CREATE UNIQUE INDEX idx_company_names_unique_record
    ON company_names (company_id, name, language, name_type, COALESCE(valid_from, ''));
CREATE INDEX idx_company_names_company
    ON company_names (company_id, language, name_type, is_current);
CREATE INDEX idx_securities_company
    ON securities (company_id, status);
CREATE INDEX idx_company_archives_status
    ON company_archives (research_status, information_current_through);

PRAGMA user_version = 2;
COMMIT;
PRAGMA foreign_keys = ON;
