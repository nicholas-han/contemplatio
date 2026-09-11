#!/usr/bin/env python3
"""Add company folders, minimal company files, and catalog entries from a manifest."""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from archive_config import load_archive_config, validate_company_folder


HERE = Path(__file__).resolve().parent
COMPANY_SCHEMA = HERE / "schema.sql"
CATALOG_VERSION = 8


def load_manifest(path: Path) -> list[dict]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list) or not raw:
        raise ValueError("Manifest must be a non-empty JSON array")
    folders: set[str] = set()
    for company in raw:
        required = {
            "folder_name", "legal_name", "legal_name_language",
            "common_name", "common_name_language", "status",
            "company_info", "names", "securities",
        }
        missing = required - company.keys()
        if missing:
            raise ValueError(f"Missing fields for company: {sorted(missing)}")
        validate_company_folder(company["folder_name"])
        if company["folder_name"] in folders:
            raise ValueError(f"Duplicate folder in manifest: {company['folder_name']}")
        folders.add(company["folder_name"])
        expected = {
            (company["legal_name"], company["legal_name_language"], "legal"),
            (company["common_name"], company["common_name_language"], "common"),
        }
        actual = {(n["name"], n["language"], n["name_type"]) for n in company["names"]}
        if not expected <= actual:
            raise ValueError(f"Default names missing for {company['folder_name']}")
    return raw


def backup_database(source: Path) -> Path:
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    backup = source.with_name(f"catalog.backup-before-bulk-add-{timestamp}.sqlite")
    source_connection = sqlite3.connect(source)
    backup_connection = sqlite3.connect(backup)
    try:
        source_connection.backup(backup_connection)
        if backup_connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("Catalog backup integrity check failed")
    finally:
        backup_connection.close()
        source_connection.close()
    return backup


def create_company_database(path: Path, company: dict) -> None:
    connection = sqlite3.connect(path)
    try:
        connection.executescript(COMPANY_SCHEMA.read_text(encoding="utf-8"))
        for name in company["names"]:
            connection.execute(
                """
                INSERT INTO company_names (
                    name, language, name_type, is_current, is_official,
                    valid_from, valid_to
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    name["name"], name["language"], name["name_type"],
                    name.get("is_current", 1), name.get("is_official", 0),
                    name.get("valid_from"), name.get("valid_to"),
                ),
            )
        for security in company["securities"]:
            connection.execute(
                """
                INSERT INTO securities (
                    security_type, exchange_mic, ticker, share_class,
                    trading_currency, isin, listing_date, delisting_date, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    security.get("security_type", "ordinary_share"),
                    security["exchange_mic"], security["ticker"],
                    security.get("share_class"), security.get("trading_currency"),
                    security.get("isin"), security.get("listing_date"),
                    security.get("delisting_date"), security.get("status", "active"),
                ),
            )
        connection.commit()
        tables = [
            row[0] for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
        ]
        if tables != ["company_names", "securities"]:
            raise RuntimeError(f"Unexpected tables in {path}: {tables}")
        if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError(f"Integrity check failed: {path}")
    finally:
        connection.close()


def add_companies(manifest_path: Path) -> None:
    config = load_archive_config()
    archive_root = config.investment_archive_root
    catalog_path = config.catalog_database_path()
    companies = load_manifest(manifest_path)
    connection = sqlite3.connect(catalog_path)
    connection.row_factory = sqlite3.Row
    try:
        if connection.execute("PRAGMA user_version").fetchone()[0] != CATALOG_VERSION:
            raise RuntimeError(f"Catalog must be at schema version {CATALOG_VERSION}")
        existing_folders = {row[0] for row in connection.execute("SELECT folder_name FROM companies")}
        requested_folders = {company["folder_name"] for company in companies}
        conflicts = existing_folders & requested_folders
        if conflicts:
            raise RuntimeError(f"Companies already exist: {sorted(conflicts)}")
        for company in companies:
            source_name = company.get("source_folder")
            if source_name is None:
                if (archive_root / company["folder_name"]).exists():
                    raise RuntimeError(f"Folder already exists: {company['folder_name']}")
                continue
            if (
                not isinstance(source_name, str)
                or not source_name
                or Path(source_name).name != source_name
                or source_name in {".", ".."}
            ):
                raise ValueError(f"Invalid source_folder: {source_name!r}")
            source_path = archive_root / source_name
            target_path = archive_root / company["folder_name"]
            if not source_path.is_dir():
                raise RuntimeError(f"Source folder does not exist: {source_name}")
            if target_path != source_path and target_path.exists():
                raise RuntimeError(f"Target folder already exists: {company['folder_name']}")
            for managed_name in ("company.json", "company.sqlite"):
                if (source_path / managed_name).exists():
                    raise RuntimeError(
                        f"Source already contains managed file: {source_name}/{managed_name}"
                    )
        next_company_id = connection.execute(
            "SELECT COALESCE(MAX(company_id), 99999) + 1 FROM companies"
        ).fetchone()[0]
        if next_company_id + len(companies) - 1 > 999999:
            raise RuntimeError("Six-digit company_id range is exhausted")
        for offset, company in enumerate(companies):
            company["company_id"] = next_company_id + offset
            existing_id = company["company_info"].get("company_id")
            if existing_id is not None and existing_id != company["company_id"]:
                raise RuntimeError(
                    f"Unexpected company_id for {company['folder_name']}: {existing_id}"
                )
            company["company_info"]["company_id"] = company["company_id"]
    finally:
        connection.close()

    backup = backup_database(catalog_path)
    created: list[Path] = []
    moved: list[tuple[Path, Path]] = []
    managed_files: list[Path] = []
    try:
        for company in companies:
            company_root = archive_root / company["folder_name"]
            source_name = company.get("source_folder")
            if source_name is None:
                company_root.mkdir()
                created.append(company_root)
            else:
                source_root = archive_root / source_name
                if source_root != company_root:
                    source_root.rename(company_root)
                    moved.append((company_root, source_root))
            json_path = company_root / "company.json"
            database_path = company_root / "company.sqlite"
            json_path.write_text(
                json.dumps(company["company_info"], ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            managed_files.append(json_path)
            create_company_database(database_path, company)
            managed_files.append(database_path)

        connection = sqlite3.connect(catalog_path)
        try:
            connection.execute("BEGIN IMMEDIATE")
            for company in companies:
                connection.execute(
                    """
                    INSERT INTO companies (
                        company_id, legal_name, legal_name_language, common_name,
                        common_name_language, status, gics_sub_industry_code,
                        custom_industry_id, folder_name
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        company["company_id"], company["legal_name"],
                        company["legal_name_language"],
                        company["common_name"], company["common_name_language"],
                        company["status"], company.get("gics_sub_industry_code"),
                        company.get("custom_industry_id"), company["folder_name"],
                    ),
                )
            connection.commit()
        finally:
            connection.close()
    except Exception:
        for path in reversed(managed_files):
            path.unlink(missing_ok=True)
        for path in reversed(created):
            shutil.rmtree(path)
        for target, source in reversed(moved):
            target.rename(source)
        raise

    print(f"added: {len(companies)}")
    print(f"backup: {backup}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    add_companies(args.manifest)


if __name__ == "__main__":
    main()
