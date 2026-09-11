PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

ALTER TABLE companies RENAME TO companies_v4;

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
    CHECK (inc_region IS NULL OR length(trim(inc_region)) > 0),
    CHECK (status IN ('active', 'inactive', 'merged', 'liquidated', 'unknown')),
    CHECK (gics_sub_industry_code IS NULL OR (
        length(gics_sub_industry_code) = 8
        AND gics_sub_industry_code NOT GLOB '*[^0-9]*'
    )),
    CHECK (custom_industry_id IS NULL OR custom_industry_id BETWEEN 100000 AND 999999),
    CHECK (folder_name GLOB '[A-Za-z0-9]*' AND folder_name NOT GLOB '*[^A-Za-z0-9-]*'),
    CHECK (folder_name NOT LIKE '-%' AND folder_name NOT LIKE '%-' AND folder_name NOT LIKE '%--%')
);

INSERT INTO companies (
    company_id, legal_name, legal_name_language, common_name,
    common_name_language, inc_region, status,
    gics_sub_industry_code, custom_industry_id, folder_name
)
SELECT
    c.company_id, c.legal_name, c.legal_name_language, c.common_name,
    c.common_name_language, c.inc_region, c.status,
    c.gics_sub_industry_code, c.custom_industry_id, a.folder_name
FROM companies_v4 c
JOIN company_archives a USING (company_id);

DROP TABLE company_archives;
DROP TABLE securities;
DROP TABLE company_names;
DROP TABLE companies_v4;

DELETE FROM sqlite_sequence
WHERE name IN ('companies', 'company_names', 'securities');
INSERT INTO sqlite_sequence (name, seq)
VALUES ('companies', COALESCE((SELECT MAX(company_id) FROM companies), 99999));

PRAGMA user_version = 5;
COMMIT;
PRAGMA foreign_keys = ON;
