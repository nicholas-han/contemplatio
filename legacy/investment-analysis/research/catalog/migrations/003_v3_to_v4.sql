BEGIN IMMEDIATE;

DROP INDEX idx_company_names_one_current_primary_per_language;

CREATE UNIQUE INDEX idx_company_names_one_current_per_language_type
    ON company_names (company_id, language, name_type)
    WHERE is_current = 1 AND name_type IN ('legal', 'common');

PRAGMA user_version = 4;
COMMIT;
