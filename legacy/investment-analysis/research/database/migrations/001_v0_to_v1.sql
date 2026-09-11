PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

ALTER TABLE securities RENAME TO securities_v0;

CREATE TABLE company_names (
    company_name_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id        TEXT NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
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
    UNIQUE (entity_id, name, language, name_type, valid_from)
);

CREATE TABLE securities (
    security_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    issuer_entity_id   TEXT NOT NULL REFERENCES entities(entity_id),
    security_type      TEXT NOT NULL DEFAULT 'ordinary_share',
    exchange_mic       TEXT NOT NULL,
    ticker             TEXT NOT NULL,
    share_class        TEXT,
    trading_currency   TEXT,
    isin               TEXT,
    listing_date       TEXT,
    delisting_date     TEXT,
    status             TEXT NOT NULL DEFAULT 'active',
    attributes_json    TEXT NOT NULL DEFAULT '{}',

    CHECK (security_id BETWEEN 100000 AND 999999),
    CHECK (security_type IN ('ordinary_share', 'preferred_share', 'adr', 'gdr', 'fund', 'other')),
    CHECK (length(trim(exchange_mic)) > 0),
    CHECK (length(trim(ticker)) > 0),
    CHECK (listing_date IS NULL OR listing_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CHECK (delisting_date IS NULL OR delisting_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CHECK (listing_date IS NULL OR delisting_date IS NULL OR listing_date <= delisting_date),
    CHECK (status IN ('active', 'suspended', 'delisted', 'cancelled', 'unknown')),
    CHECK (json_valid(attributes_json))
);

INSERT INTO securities (
    security_id, issuer_entity_id, security_type, exchange_mic, ticker,
    share_class, trading_currency, isin, listing_date, delisting_date,
    status, attributes_json
)
SELECT
    99999 + ROW_NUMBER() OVER (ORDER BY exchange_mic, ticker, security_id),
    issuer_entity_id, 'ordinary_share', exchange_mic, ticker,
    share_class, currency, NULL, listing_date, delisting_date,
    status, attributes_json
FROM securities_v0;

DROP TABLE securities_v0;

CREATE INDEX idx_securities_issuer
    ON securities (issuer_entity_id);
CREATE UNIQUE INDEX idx_securities_active_exchange_ticker
    ON securities (exchange_mic, ticker)
    WHERE status IN ('active', 'suspended');
CREATE UNIQUE INDEX idx_securities_isin
    ON securities (isin)
    WHERE isin IS NOT NULL;
CREATE INDEX idx_company_names_lookup
    ON company_names (name, language, is_current);
CREATE UNIQUE INDEX idx_company_names_unique_record
    ON company_names (entity_id, name, language, name_type, COALESCE(valid_from, ''));
CREATE UNIQUE INDEX idx_company_names_one_current_per_language_type
    ON company_names (entity_id, language, name_type)
    WHERE is_current = 1 AND name_type IN ('legal', 'common');

DELETE FROM sqlite_sequence
WHERE name IN ('company_names', 'securities');
INSERT INTO sqlite_sequence (name, seq)
VALUES ('company_names', 99999);
INSERT INTO sqlite_sequence (name, seq)
VALUES ('securities', COALESCE((SELECT MAX(security_id) FROM securities), 99999));

PRAGMA user_version = 1;
COMMIT;
PRAGMA foreign_keys = ON;
