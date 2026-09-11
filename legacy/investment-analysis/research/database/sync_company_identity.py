#!/usr/bin/env python3
"""Sync company_id into JSON and rename company folders to catalog common names."""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from archive_config import load_archive_config, validate_company_folder


CATALOG_VERSION = 8


def backup_catalog(source: Path) -> Path:
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    backup = source.with_name(f"catalog.backup-before-folder-rename-{timestamp}.sqlite")
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


def sync() -> None:
    config = load_archive_config()
    root = config.investment_archive_root
    catalog = config.catalog_database_path()
    connection = sqlite3.connect(catalog)
    connection.row_factory = sqlite3.Row
    try:
        if connection.execute("PRAGMA user_version").fetchone()[0] != CATALOG_VERSION:
            raise RuntimeError(f"Catalog must be at schema version {CATALOG_VERSION}")
        companies = connection.execute(
            "SELECT company_id, common_name, folder_name FROM companies ORDER BY company_id"
        ).fetchall()
    finally:
        connection.close()

    targets = [row["common_name"] for row in companies]
    if len(targets) != len(set(targets)):
        raise RuntimeError("Common names are not unique and cannot all be folder names")
    old_names = {row["folder_name"] for row in companies}
    for row in companies:
        validate_company_folder(row["common_name"])
        old_root = root / row["folder_name"]
        new_root = root / row["common_name"]
        if not old_root.is_dir():
            raise RuntimeError(f"Current company folder is missing: {old_root}")
        if new_root.exists() and new_root != old_root and row["common_name"] not in old_names:
            raise RuntimeError(f"Target company folder already exists: {new_root}")
        for required in ("company.json", "company.sqlite"):
            if not (old_root / required).is_file():
                raise RuntimeError(f"Missing {required}: {old_root}")

    backup = backup_catalog(catalog)
    renamed: list[tuple[Path, Path]] = []
    originals: dict[Path, bytes] = {}
    connection = sqlite3.connect(catalog)
    try:
        connection.execute("BEGIN IMMEDIATE")
        for row in companies:
            old_root = root / row["folder_name"]
            new_root = root / row["common_name"]
            if old_root != new_root:
                old_root.rename(new_root)
                renamed.append((old_root, new_root))

            json_path = new_root / "company.json"
            originals[json_path] = json_path.read_bytes()
            company_info = json.loads(originals[json_path].decode("utf-8"))
            company_info = {**company_info, "company_id": row["company_id"]}
            json_path.write_text(
                json.dumps(company_info, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            connection.execute(
                "UPDATE companies SET folder_name = ? WHERE company_id = ?",
                (row["common_name"], row["company_id"]),
            )
        connection.commit()
    except Exception:
        connection.rollback()
        for json_path, content in originals.items():
            if json_path.exists():
                json_path.write_bytes(content)
        for old_root, new_root in reversed(renamed):
            if new_root.exists():
                new_root.rename(old_root)
        raise
    finally:
        connection.close()

    print(f"synced: {len(companies)}")
    print(f"renamed: {len(renamed)}")
    print(f"backup: {backup}")


if __name__ == "__main__":
    sync()
