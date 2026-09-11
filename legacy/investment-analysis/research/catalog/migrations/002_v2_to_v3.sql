PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

ALTER TABLE company_archives RENAME TO company_archives_v2;
ALTER TABLE securities RENAME TO securities_v2;
ALTER TABLE company_names RENAME TO company_names_v2;
ALTER TABLE companies RENAME TO companies_v2;

CREATE TABLE company_id_map (
    old_company_id  TEXT PRIMARY KEY,
    new_company_id  INTEGER NOT NULL UNIQUE CHECK (new_company_id BETWEEN 100000 AND 999999)
);

INSERT INTO company_id_map (old_company_id, new_company_id)
SELECT company_id, 99999 + ROW_NUMBER() OVER (ORDER BY company_id)
FROM companies_v2;

CREATE TABLE companies (
    company_id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    legal_name                 TEXT,
    legal_name_language        TEXT,
    common_name                TEXT NOT NULL,
    common_name_language       TEXT NOT NULL,
    inc_region                 TEXT,
    status                     TEXT NOT NULL DEFAULT 'active',
    gics_sub_industry_code     TEXT,
    custom_industry_id         INTEGER,

    CHECK (company_id BETWEEN 100000 AND 999999),
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
    CHECK (status IN ('active', 'inactive', 'merged', 'liquidated', 'unknown')),
    CHECK (gics_sub_industry_code IS NULL OR (
        length(gics_sub_industry_code) = 8
        AND gics_sub_industry_code NOT GLOB '*[^0-9]*'
    )),
    CHECK (custom_industry_id IS NULL OR custom_industry_id BETWEEN 100000 AND 999999)
);

CREATE TABLE company_names (
    company_name_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id       INTEGER NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    language         TEXT NOT NULL,
    name_type        TEXT NOT NULL,
    is_current       INTEGER NOT NULL DEFAULT 1,
    is_official      INTEGER NOT NULL DEFAULT 0,
    valid_from       TEXT,
    valid_to         TEXT,

    CHECK (company_name_id BETWEEN 100000 AND 999999),
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
    CHECK (is_official IN (0, 1)),
    CHECK (valid_from IS NULL OR valid_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CHECK (valid_to IS NULL OR valid_to GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to),
    UNIQUE (company_id, name, language, name_type, valid_from)
);

CREATE TABLE securities (
    security_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id        INTEGER NOT NULL REFERENCES companies(company_id) ON DELETE RESTRICT,
    security_type     TEXT NOT NULL DEFAULT 'ordinary_share',
    exchange_mic      TEXT NOT NULL,
    ticker            TEXT NOT NULL,
    share_class       TEXT,
    trading_currency  TEXT,
    isin              TEXT,
    listing_date      TEXT,
    delisting_date    TEXT,
    status             TEXT NOT NULL DEFAULT 'active',

    CHECK (security_id BETWEEN 100000 AND 999999),
    CHECK (length(trim(exchange_mic)) > 0),
    CHECK (length(trim(ticker)) > 0),
    CHECK (security_type IN ('ordinary_share', 'preferred_share', 'adr', 'gdr', 'fund', 'other')),
    CHECK (listing_date IS NULL OR listing_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CHECK (delisting_date IS NULL OR delisting_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CHECK (listing_date IS NULL OR delisting_date IS NULL OR listing_date <= delisting_date),
    CHECK (status IN ('active', 'suspended', 'delisted', 'cancelled', 'unknown'))
);

CREATE TABLE company_archives (
    company_id   INTEGER PRIMARY KEY REFERENCES companies(company_id) ON DELETE CASCADE,
    folder_name  TEXT NOT NULL UNIQUE,

    CHECK (company_id BETWEEN 100000 AND 999999),
    CHECK (folder_name GLOB '[A-Za-z0-9]*' AND folder_name NOT GLOB '*[^A-Za-z0-9-]*'),
    CHECK (folder_name NOT LIKE '-%' AND folder_name NOT LIKE '%-' AND folder_name NOT LIKE '%--%')
);

INSERT INTO companies (
    company_id, legal_name, legal_name_language, common_name,
    common_name_language, inc_region, status,
    gics_sub_industry_code, custom_industry_id
)
SELECT
    m.new_company_id, c.legal_name, c.legal_name_language, c.common_name,
    c.common_name_language, c.inc_region, c.status, NULL, NULL
FROM companies_v2 c
JOIN company_id_map m ON m.old_company_id = c.company_id;

-- Keep names not represented in companies, discard short names, and when both
-- current legal/common names exist in one language prefer the legal name.
WITH eligible_names AS (
    SELECT
        n.*,
        ROW_NUMBER() OVER (
            PARTITION BY n.company_id, n.language,
                         CASE WHEN n.is_current = 1 AND n.name_type IN ('legal', 'common')
                              THEN 1 ELSE n.rowid + 1 END
            ORDER BY CASE n.name_type WHEN 'legal' THEN 0 ELSE 1 END,
                     n.company_name_id
        ) AS preference_rank
    FROM company_names_v2 n
    JOIN companies_v2 c ON c.company_id = n.company_id
    WHERE n.name_type <> 'short'
      AND NOT (
          n.language = c.legal_name_language
          OR n.language = c.common_name_language
      )
), retained_names AS (
    SELECT *
    FROM eligible_names
    WHERE NOT (is_current = 1 AND name_type IN ('legal', 'common'))
       OR preference_rank = 1
), numbered_names AS (
    SELECT *, 99999 + ROW_NUMBER() OVER (ORDER BY company_id, language, name_type, company_name_id) AS new_name_id
    FROM retained_names
)
INSERT INTO company_names (
    company_name_id, company_id, name, language, name_type,
    is_current, is_official, valid_from, valid_to
)
SELECT
    n.new_name_id, m.new_company_id, n.name, n.language, n.name_type,
    n.is_current, n.is_official, n.valid_from, n.valid_to
FROM numbered_names n
JOIN company_id_map m ON m.old_company_id = n.company_id;

WITH numbered_securities AS (
    SELECT s.*, 99999 + ROW_NUMBER() OVER (ORDER BY s.exchange_mic, s.ticker, s.security_id) AS new_security_id
    FROM securities_v2 s
)
INSERT INTO securities (
    security_id, company_id, security_type, exchange_mic, ticker,
    share_class, trading_currency, isin, listing_date, delisting_date, status
)
SELECT
    s.new_security_id, m.new_company_id, s.security_type, s.exchange_mic, s.ticker,
    s.share_class, s.trading_currency, s.isin, s.listing_date, s.delisting_date, s.status
FROM numbered_securities s
JOIN company_id_map m ON m.old_company_id = s.company_id;

INSERT INTO company_archives (company_id, folder_name)
SELECT m.new_company_id, a.folder_name
FROM company_archives_v2 a
JOIN company_id_map m ON m.old_company_id = a.company_id;

DROP TABLE company_archives_v2;
DROP TABLE securities_v2;
DROP TABLE company_names_v2;
DROP TABLE companies_v2;
DROP TABLE company_id_map;

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
CREATE UNIQUE INDEX idx_company_names_one_current_primary_per_language
    ON company_names (company_id, language)
    WHERE is_current = 1 AND name_type IN ('legal', 'common');
CREATE TRIGGER trg_company_names_no_default_overlap_insert
BEFORE INSERT ON company_names
FOR EACH ROW
WHEN EXISTS (
    SELECT 1
    FROM companies c
    WHERE c.company_id = NEW.company_id
      AND (
          NEW.name = c.common_name
          OR (c.legal_name IS NOT NULL AND NEW.name = c.legal_name)
          OR (
              NEW.is_current = 1
              AND NEW.name_type IN ('legal', 'common')
              AND NEW.language IN (c.common_name_language, c.legal_name_language)
          )
      )
)
BEGIN
    SELECT RAISE(ABORT, 'company_names overlaps a default company name or language');
END;
CREATE TRIGGER trg_company_names_no_default_overlap_update
BEFORE UPDATE ON company_names
FOR EACH ROW
WHEN EXISTS (
    SELECT 1
    FROM companies c
    WHERE c.company_id = NEW.company_id
      AND (
          NEW.name = c.common_name
          OR (c.legal_name IS NOT NULL AND NEW.name = c.legal_name)
          OR (
              NEW.is_current = 1
              AND NEW.name_type IN ('legal', 'common')
              AND NEW.language IN (c.common_name_language, c.legal_name_language)
          )
      )
)
BEGIN
    SELECT RAISE(ABORT, 'company_names overlaps a default company name or language');
END;
CREATE TRIGGER trg_companies_no_name_overlap_update
BEFORE UPDATE OF legal_name, legal_name_language, common_name, common_name_language ON companies
FOR EACH ROW
WHEN EXISTS (
    SELECT 1
    FROM company_names n
    WHERE n.company_id = NEW.company_id
      AND (
          n.name = NEW.common_name
          OR (NEW.legal_name IS NOT NULL AND n.name = NEW.legal_name)
          OR (
              n.is_current = 1
              AND n.name_type IN ('legal', 'common')
              AND n.language IN (NEW.common_name_language, NEW.legal_name_language)
          )
      )
)
BEGIN
    SELECT RAISE(ABORT, 'default company name overlaps company_names');
END;
CREATE INDEX idx_securities_company
    ON securities (company_id, status);

DELETE FROM sqlite_sequence
WHERE name IN ('companies', 'company_names', 'securities');
INSERT INTO sqlite_sequence (name, seq)
VALUES ('companies', COALESCE((SELECT MAX(company_id) FROM companies), 99999));
INSERT INTO sqlite_sequence (name, seq)
VALUES ('company_names', COALESCE((SELECT MAX(company_name_id) FROM company_names), 99999));
INSERT INTO sqlite_sequence (name, seq)
VALUES ('securities', COALESCE((SELECT MAX(security_id) FROM securities), 99999));

PRAGMA user_version = 3;
COMMIT;
PRAGMA foreign_keys = ON;
