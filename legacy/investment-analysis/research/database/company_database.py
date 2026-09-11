#!/usr/bin/env python3
"""Migrate and validate one company's SQLite research database."""

from __future__ import annotations

import argparse
import hashlib
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

try:
    from .archive_config import load_archive_config
except ImportError:  # Support direct execution as a script.
    from archive_config import load_archive_config


HERE = Path(__file__).resolve().parent
CURRENT_SCHEMA_VERSION = 4
SUPPORTED_SCHEMA_VERSIONS = {2, 3, 4}
MIGRATIONS = {
    0: HERE / "migrations" / "001_v0_to_v1.sql",
    1: HERE / "migrations" / "002_v1_to_v2.sql",
    2: HERE / "migrations" / "003_v2_to_v3.sql",
    3: HERE / "migrations" / "004_v3_to_v4.sql",
}

V3_TABLES = [
        "coverage_requirements",
        "coverage_results",
        "coverage_scopes",
        "dimension_members",
        "dimension_types",
        "document_families",
        "document_files",
        "document_relations",
        "documents",
        "entities",
        "entity_events",
        "entity_identifiers",
        "entity_legal_states",
        "entity_locations",
        "entity_names",
        "entity_relationships",
        "entity_websites",
        "evidence_links",
        "item_relations",
        "metric_definition_versions",
        "metric_definitions",
        "observation_dimensions",
        "observations",
        "processing_runs",
        "quality_issues",
        "research_items",
        "research_questions",
        "securities",
        "units",
]

EXPECTED_TABLES = {
    2: ["company_names", "securities"],
    3: V3_TABLES,
    4: V3_TABLES,
}

EXPECTED_VIEWS = {
    3: ["company_names", "v_observations"],
    4: [
        "company_names",
        "v_observation_candidates",
        "v_observation_current",
        "v_observations",
    ],
}


def database_path(company_folder: str) -> Path:
    return load_archive_config().company_database_path(company_folder)


def connect(path: Path) -> sqlite3.Connection:
    if not path.is_file():
        raise FileNotFoundError(f"Company database does not exist: {path}")
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def validate_research_item_types(connection: sqlite3.Connection) -> None:
    extensions = {
        "entity_names": "entity_name",
        "entity_identifiers": "entity_identifier",
        "entity_legal_states": "entity_legal_state",
        "entity_events": "entity_event",
        "entity_locations": "entity_location",
        "entity_websites": "entity_website",
        "entity_relationships": "entity_relationship",
        "observations": "observation",
        "quality_issues": "quality_issue",
        "research_questions": "research_question",
    }
    for table, expected_type in extensions.items():
        mismatches = connection.execute(
            f"""
            SELECT e.item_id, r.item_type
            FROM {table} e
            JOIN research_items r USING (item_id)
            WHERE r.item_type <> ?
            ORDER BY e.item_id
            """,
            (expected_type,),
        ).fetchall()
        if mismatches:
            raise RuntimeError(
                f"Unexpected research item types in {table}: {mismatches}"
            )


def validate_document_files(connection: sqlite3.Connection, company_root: Path) -> None:
    for row in connection.execute(
        "SELECT relative_path, sha256, byte_size FROM document_files ORDER BY document_file_id"
    ):
        path = company_root / row["relative_path"]
        if not path.is_file():
            raise RuntimeError(f"Document file does not exist: {path}")
        size = path.stat().st_size
        if row["byte_size"] is not None and row["byte_size"] != size:
            raise RuntimeError(f"Document file size mismatch: {path}")
        hasher = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                hasher.update(chunk)
        digest = hasher.hexdigest()
        if digest != row["sha256"]:
            raise RuntimeError(f"Document file hash mismatch: {path}")


def validate_confirmed_evidence(connection: sqlite3.Connection) -> None:
    missing = connection.execute(
        """
        SELECT r.item_id, r.item_type, r.topic_code
        FROM research_items r
        WHERE r.review_status = 'confirmed'
          AND r.information_class IN (
              'disclosed_fact', 'management_guidance', 'market_consensus'
          )
          AND NOT EXISTS (
              SELECT 1
              FROM evidence_links e
              WHERE e.item_id = r.item_id
                AND e.review_status = 'confirmed'
                AND e.evidence_role IN ('supports', 'defines')
          )
        ORDER BY r.item_id
        """
    ).fetchall()
    if missing:
        raise RuntimeError(
            f"Confirmed source facts without confirmed evidence: {missing}"
        )


def validate_v3(
    connection: sqlite3.Connection,
    version: int,
    company_root: Path | None = None,
) -> None:
    views = [
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name"
        ).fetchall()
    ]
    if views != EXPECTED_VIEWS[version]:
        raise RuntimeError(f"Unexpected company database views: {views}")

    subjects = connection.execute(
        """
        SELECT entity_id, catalog_company_id
        FROM entities
        WHERE is_research_subject = 1
        """
    ).fetchall()
    if len(subjects) != 1:
        raise RuntimeError(f"Expected one research subject, found: {subjects}")
    if subjects[0]["catalog_company_id"] is None:
        raise RuntimeError("Research subject is not linked to catalog company_id")

    orphan_names = connection.execute(
        """
        SELECT n.item_id
        FROM entity_names n
        JOIN research_items r USING (item_id)
        WHERE r.item_type <> 'entity_name'
        """
    ).fetchall()
    if orphan_names:
        raise RuntimeError(f"Invalid entity name research items: {orphan_names}")

    validate_research_item_types(connection)
    validate_confirmed_evidence(connection)
    if company_root is not None:
        validate_document_files(connection, company_root)


def validate_connection(
    connection: sqlite3.Connection, company_root: Path | None = None
) -> None:
    version = connection.execute("PRAGMA user_version").fetchone()[0]
    foreign_key_issues = connection.execute("PRAGMA foreign_key_check").fetchall()
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    if version not in SUPPORTED_SCHEMA_VERSIONS:
        raise RuntimeError(f"Unsupported company database schema version: {version}")
    if foreign_key_issues:
        raise RuntimeError(f"Foreign key errors: {foreign_key_issues}")
    if integrity != "ok":
        raise RuntimeError(f"Integrity check failed: {integrity}")
    business_tables = [
        row[0]
        for row in connection.execute(
            """
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
            """
        ).fetchall()
    ]
    if business_tables != EXPECTED_TABLES[version]:
        raise RuntimeError(f"Unexpected company database tables: {business_tables}")
    if version in (3, 4):
        validate_v3(connection, version, company_root)


def bind_research_subject(company_folder: str, path: Path) -> None:
    config = load_archive_config()
    catalog = sqlite3.connect(config.catalog_database_path())
    try:
        row = catalog.execute(
            "SELECT company_id, common_name FROM companies WHERE folder_name = ?",
            (company_folder,),
        ).fetchone()
    finally:
        catalog.close()
    if row is None:
        raise RuntimeError(f"Company is missing from catalog: {company_folder}")

    connection = connect(path)
    try:
        subject = connection.execute(
            """
            SELECT entity_id, catalog_company_id
            FROM entities
            WHERE is_research_subject = 1
            """
        ).fetchone()
        if subject is None:
            raise RuntimeError("Research subject entity is missing")
        if subject["catalog_company_id"] not in (None, row[0]):
            raise RuntimeError(
                f"Research subject already links to company_id "
                f"{subject['catalog_company_id']}, expected {row[0]}"
            )
        connection.execute(
            """
            UPDATE entities
            SET catalog_company_id = ?, canonical_label = ?
            WHERE entity_id = ?
            """,
            (row[0], row[1], subject["entity_id"]),
        )
        connection.commit()
    finally:
        connection.close()


def backup_database(source: Path, schema_version: int) -> Path:
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    backup = source.with_name(f"company.backup-v{schema_version}-{timestamp}.sqlite")
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


def migrate(company_folder: str) -> None:
    path = database_path(company_folder)
    connection = connect(path)
    try:
        version = connection.execute("PRAGMA user_version").fetchone()[0]
    finally:
        connection.close()
    if version == CURRENT_SCHEMA_VERSION:
        print(f"already at schema version {CURRENT_SCHEMA_VERSION}")
        return

    original_version = version
    backup = backup_database(path, original_version)
    while version < CURRENT_SCHEMA_VERSION:
        migration = MIGRATIONS.get(version)
        if migration is None:
            raise RuntimeError(f"No migration path from company schema version {version}")
        connection = connect(path)
        try:
            connection.executescript(migration.read_text(encoding="utf-8"))
            new_version = connection.execute("PRAGMA user_version").fetchone()[0]
        finally:
            connection.close()
        if new_version <= version:
            raise RuntimeError(f"Migration did not advance schema version {version}")
        version = new_version

    if version >= 3:
        bind_research_subject(company_folder, path)

    connection = connect(path)
    try:
        validate_connection(connection, path.parent)
    finally:
        connection.close()
    print(f"migrated: {original_version} -> {CURRENT_SCHEMA_VERSION}")
    print(f"backup: {backup}")


def validate(company_folder: str) -> None:
    path = database_path(company_folder)
    connection = connect(path)
    try:
        validate_connection(connection, path.parent)
    finally:
        connection.close()
    print("ok")


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    for command in ("migrate", "validate"):
        command_parser = subparsers.add_parser(command)
        command_parser.add_argument("company_folder")
    args = parser.parse_args()

    if args.command == "migrate":
        migrate(args.company_folder)
    elif args.command == "validate":
        validate(args.company_folder)


if __name__ == "__main__":
    main()
