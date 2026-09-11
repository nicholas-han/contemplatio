#!/usr/bin/env python3
"""Initialize, inspect and validate the global company catalog."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import UTC, datetime
from pathlib import Path


HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "database"))
from archive_config import load_archive_config  # noqa: E402


SCHEMA_PATH = HERE / "schema.sql"
CURRENT_SCHEMA_VERSION = 8
MIGRATIONS = {
    1: HERE / "migrations" / "001_v1_to_v2.sql",
    2: HERE / "migrations" / "002_v2_to_v3.sql",
    3: HERE / "migrations" / "003_v3_to_v4.sql",
    4: HERE / "migrations" / "004_v4_to_v5.sql",
    5: HERE / "migrations" / "005_v5_to_v6.sql",
    6: HERE / "migrations" / "006_v6_to_v7.sql",
    7: HERE / "migrations" / "007_v7_to_v8.sql",
}


def catalog_path() -> Path:
    config = load_archive_config()
    return config.catalog_database_path()


def connect(require_exists: bool = True) -> sqlite3.Connection:
    path = catalog_path()
    if require_exists and not path.is_file():
        raise FileNotFoundError(f"Catalog does not exist: {path}. Run `catalog.py init` first.")
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize() -> None:
    path = catalog_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        existing = connect()
        try:
            version = existing.execute("PRAGMA user_version").fetchone()[0]
            if version != CURRENT_SCHEMA_VERSION:
                raise RuntimeError(
                    f"Catalog already exists at schema version {version}; "
                    "run `catalog.py migrate` instead of `init`."
                )
            validate_connection(existing)
        finally:
            existing.close()
        print(path)
        return
    connection = connect(require_exists=False)
    try:
        connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        connection.commit()
        validate_connection(connection)
    finally:
        connection.close()
    print(path)


def validate_connection(connection: sqlite3.Connection) -> None:
    foreign_key_issues = connection.execute("PRAGMA foreign_key_check").fetchall()
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    version = connection.execute("PRAGMA user_version").fetchone()[0]
    if foreign_key_issues:
        raise RuntimeError(f"Foreign key errors: {foreign_key_issues}")
    if integrity != "ok":
        raise RuntimeError(f"Integrity check failed: {integrity}")
    if version != CURRENT_SCHEMA_VERSION:
        raise RuntimeError(f"Unexpected catalog schema version: {version}")
    business_tables = [
        row[0]
        for row in connection.execute(
            """
            SELECT name
            FROM sqlite_master
            WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
            """
        ).fetchall()
    ]
    if business_tables != ["companies"]:
        raise RuntimeError(f"Unexpected catalog tables: {business_tables}")
    validate_gics_codes(connection)
    validate_default_names_in_company_databases(connection)


def validate_gics_codes(connection: sqlite3.Connection) -> None:
    """Validate assigned catalog codes against the archive's canonical GICS map."""
    assigned = {
        row[0]
        for row in connection.execute(
            """
            SELECT DISTINCT gics_sub_industry_code
            FROM companies
            WHERE gics_sub_industry_code IS NOT NULL
            """
        ).fetchall()
    }
    if not assigned:
        return

    archive_root = load_archive_config().investment_archive_root
    structure_path = archive_root / "_GICS_by_MSCI" / "gics_structure.json"
    if not structure_path.is_file():
        raise RuntimeError(f"Canonical GICS structure does not exist: {structure_path}")

    raw = json.loads(structure_path.read_text(encoding="utf-8"))
    valid_codes = {
        sub_industry["code"]
        for sector in raw["sectors"]
        for industry_group in sector["industry_groups"]
        for industry in industry_group["industries"]
        for sub_industry in industry["sub_industries"]
    }
    unknown = sorted(assigned - valid_codes)
    if unknown:
        raise RuntimeError(
            f"Catalog contains codes absent from {structure_path.name}: {unknown}"
        )


def validate_default_names_in_company_databases(connection: sqlite3.Connection) -> None:
    archive_root = load_archive_config().investment_archive_root
    companies = connection.execute("SELECT * FROM companies ORDER BY company_id").fetchall()
    for company in companies:
        path = archive_root / company["folder_name"] / "company.sqlite"
        if not path.is_file():
            raise RuntimeError(f"Company database does not exist: {path}")
        target = sqlite3.connect(path)
        try:
            expected = [
                (company["common_name"], company["common_name_language"], "common"),
            ]
            if company["legal_name"] is not None:
                expected.append(
                    (company["legal_name"], company["legal_name_language"], "legal")
                )
            for name, language, name_type in expected:
                found = target.execute(
                    """
                    SELECT 1
                    FROM company_names
                    WHERE name = ? AND language = ?
                      AND name_type = ? AND is_current = 1
                    """,
                    (name, language, name_type),
                ).fetchone()
                if found is None:
                    raise RuntimeError(
                        f"Default {name_type} name is missing from {company['folder_name']}: {name}"
                    )
        finally:
            target.close()


def validate_v5_relocation(connection: sqlite3.Connection) -> None:
    """Confirm catalog details exist in each company DB before V4 tables are dropped."""
    archive_root = load_archive_config().investment_archive_root
    companies = connection.execute(
        """
        SELECT c.*, a.folder_name
        FROM companies c
        JOIN company_archives a USING (company_id)
        ORDER BY c.company_id
        """
    ).fetchall()
    if connection.execute("SELECT COUNT(*) FROM companies").fetchone()[0] != len(companies):
        raise RuntimeError("Every catalog company must have a company_archives record")

    for company in companies:
        path = archive_root / company["folder_name"] / "company.sqlite"
        if not path.is_file():
            raise RuntimeError(f"Company database does not exist: {path}")
        target = sqlite3.connect(path)
        target.row_factory = sqlite3.Row
        target.execute("PRAGMA foreign_keys = ON")
        try:
            if target.execute("PRAGMA user_version").fetchone()[0] < 1:
                raise RuntimeError(f"Company database must be migrated before catalog: {path}")
            entities = target.execute(
                "SELECT entity_id FROM entities WHERE legal_name = ?",
                (company["legal_name"],),
            ).fetchall()
            if len(entities) != 1:
                raise RuntimeError(
                    f"Cannot identify one primary entity for company_id {company['company_id']}"
                )
            entity_id = entities[0]["entity_id"]

            source_securities = connection.execute(
                "SELECT * FROM securities WHERE company_id = ? ORDER BY exchange_mic, ticker",
                (company["company_id"],),
            ).fetchall()
            target_securities = target.execute(
                """
                SELECT * FROM securities
                WHERE issuer_entity_id = ?
                ORDER BY exchange_mic, ticker
                """,
                (entity_id,),
            ).fetchall()
            source_values = [
                (
                    row["security_type"], row["exchange_mic"], row["ticker"],
                    row["share_class"], row["trading_currency"], row["isin"],
                    row["listing_date"], row["delisting_date"], row["status"],
                )
                for row in source_securities
            ]
            target_values = [
                (
                    row["security_type"], row["exchange_mic"], row["ticker"],
                    row["share_class"], row["trading_currency"], row["isin"],
                    row["listing_date"], row["delisting_date"], row["status"],
                )
                for row in target_securities
            ]
            if source_values != target_values:
                raise RuntimeError(f"Securities were not fully relocated for {company['folder_name']}")

            source_names = connection.execute(
                """
                SELECT name, language, name_type, is_current, is_official, valid_from, valid_to
                FROM company_names
                WHERE company_id = ?
                ORDER BY language, name_type, name
                """,
                (company["company_id"],),
            ).fetchall()
            target_names = target.execute(
                """
                SELECT name, language, name_type, is_current, is_official, valid_from, valid_to
                FROM company_names
                WHERE entity_id = ?
                ORDER BY language, name_type, name
                """,
                (entity_id,),
            ).fetchall()
            if [tuple(row) for row in source_names] != [tuple(row) for row in target_names]:
                raise RuntimeError(f"Company names were not fully relocated for {company['folder_name']}")
        finally:
            target.close()


def validate() -> None:
    connection = connect()
    try:
        validate_connection(connection)
    finally:
        connection.close()
    print("ok")


def backup_catalog(source: Path, schema_version: int) -> Path:
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    backup = source.with_name(f"catalog.backup-v{schema_version}-{timestamp}.sqlite")
    source_connection = sqlite3.connect(source)
    backup_connection = sqlite3.connect(backup)
    try:
        source_connection.backup(backup_connection)
        integrity = backup_connection.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise RuntimeError(f"Backup integrity check failed: {integrity}")
    finally:
        backup_connection.close()
        source_connection.close()
    return backup


def migrate() -> None:
    path = catalog_path()
    connection = connect()
    try:
        version = connection.execute("PRAGMA user_version").fetchone()[0]
    finally:
        connection.close()
    if version == CURRENT_SCHEMA_VERSION:
        print(f"already at schema version {CURRENT_SCHEMA_VERSION}")
        return
    original_version = version
    backup = backup_catalog(path, original_version)
    while version < CURRENT_SCHEMA_VERSION:
        if version not in MIGRATIONS:
            raise RuntimeError(f"No migration path from catalog schema version {version}")
        connection = connect()
        try:
            if version == 4:
                validate_v5_relocation(connection)
            connection.executescript(MIGRATIONS[version].read_text(encoding="utf-8"))
            new_version = connection.execute("PRAGMA user_version").fetchone()[0]
        finally:
            connection.close()
        if new_version <= version:
            raise RuntimeError(f"Migration did not advance schema version {version}")
        version = new_version
    connection = connect()
    try:
        validate_connection(connection)
    finally:
        connection.close()
    print(f"migrated: {original_version} -> {CURRENT_SCHEMA_VERSION}")
    print(f"backup: {backup}")


def print_rows(rows: list[sqlite3.Row], columns: list[str]) -> None:
    if not rows:
        print("(no rows)")
        return
    def display(value: object) -> str:
        return "" if value is None else str(value)

    widths = {
        column: max(len(column), *(len(display(row[column])) for row in rows))
        for column in columns
    }
    print("  ".join(column.ljust(widths[column]) for column in columns))
    print("  ".join("-" * widths[column] for column in columns))
    for row in rows:
        print("  ".join(display(row[column]).ljust(widths[column]) for column in columns))


def list_companies() -> None:
    columns = [
        "company_id",
        "common_name",
        "status",
        "gics_sub_industry_code",
        "custom_industry_id",
        "folder_name",
    ]
    connection = connect()
    try:
        rows = connection.execute(
            """
            SELECT
                c.company_id,
                c.common_name,
                c.status,
                c.gics_sub_industry_code,
                c.custom_industry_id,
                c.folder_name
            FROM companies c
            ORDER BY c.common_name
            """
        ).fetchall()
    finally:
        connection.close()
    print_rows(rows, columns)


def show_company(company_id: int) -> None:
    connection = connect()
    try:
        company = connection.execute(
            "SELECT * FROM companies WHERE company_id = ?", (company_id,)
        ).fetchone()
        if company is None:
            raise SystemExit(f"Unknown company_id: {company_id}")
    finally:
        connection.close()

    print("[company]")
    for key in company.keys():
        print(f"{key}: {company[key] or ''}")


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("init")
    subparsers.add_parser("migrate")
    subparsers.add_parser("validate")
    subparsers.add_parser("list")
    show_parser = subparsers.add_parser("show")
    show_parser.add_argument("company_id", type=int)
    args = parser.parse_args()

    if args.command == "init":
        initialize()
    elif args.command == "migrate":
        migrate()
    elif args.command == "validate":
        validate()
    elif args.command == "list":
        list_companies()
    elif args.command == "show":
        show_company(args.company_id)


if __name__ == "__main__":
    main()
