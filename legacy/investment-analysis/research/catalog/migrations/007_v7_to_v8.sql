BEGIN IMMEDIATE;

ALTER TABLE companies RENAME TO companies_v7;

CREATE TABLE companies (
    company_id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    legal_name                 TEXT,
    legal_name_language        TEXT,
    common_name                TEXT NOT NULL,
    common_name_language       TEXT NOT NULL,
    status                     TEXT NOT NULL DEFAULT 'active',
    gics_sub_industry_code     TEXT,
    custom_industry_id         INTEGER,
    folder_name                TEXT NOT NULL UNIQUE,

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
    CHECK (status IN ('active', 'inactive', 'merged', 'liquidated', 'unknown')),
    CHECK (gics_sub_industry_code IS NULL OR (
        length(gics_sub_industry_code) = 8
        AND gics_sub_industry_code NOT GLOB '*[^0-9]*'
    )),
    CHECK (custom_industry_id IS NULL OR custom_industry_id BETWEEN 100000 AND 999999),
    CHECK (length(trim(folder_name)) > 0),
    CHECK (folder_name = trim(folder_name)),
    CHECK (folder_name NOT IN ('.', '..')),
    CHECK (folder_name NOT GLOB '*[/\\:*?"<>|]*')
);

INSERT INTO companies SELECT * FROM companies_v7;
DROP TABLE companies_v7;

DELETE FROM sqlite_sequence WHERE name = 'companies';
INSERT INTO sqlite_sequence (name, seq)
VALUES ('companies', COALESCE((SELECT MAX(company_id) FROM companies), 99999));

PRAGMA user_version = 8;
COMMIT;
