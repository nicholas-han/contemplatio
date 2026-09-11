BEGIN IMMEDIATE;

ALTER TABLE companies
ADD COLUMN incorporation_year INTEGER
CHECK (incorporation_year IS NULL OR incorporation_year BETWEEN 1000 AND 9999);

PRAGMA user_version = 6;
COMMIT;
