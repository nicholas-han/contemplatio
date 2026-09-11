#!/usr/bin/env python3
"""Regression tests for company database migrations and V3/V4 validation."""

from __future__ import annotations

import hashlib
import sqlite3
import tempfile
import unittest
from pathlib import Path

try:
    from . import company_database
except ImportError:  # Support direct execution as a script.
    import company_database


HERE = Path(__file__).resolve().parent


class CompanyDatabaseV4Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.path = self.root / "company.sqlite"
        connection = sqlite3.connect(self.path)
        try:
            connection.executescript((HERE / "schema.sql").read_text(encoding="utf-8"))
            connection.executemany(
                """
                INSERT INTO company_names (
                    name, language, name_type, is_current, is_official, valid_from
                ) VALUES (?, ?, ?, 1, 1, ?)
                """,
                [
                    ("测试科技股份有限公司", "zh-CN", "legal", "2025-01-01"),
                    ("测试科技", "zh-CN", "common", "2025-01-01"),
                    ("Test Technology Co., Ltd.", "en", "legal", "2025-01-01"),
                ],
            )
            connection.execute(
                """
                INSERT INTO securities (
                    security_type, exchange_mic, ticker, trading_currency, status
                ) VALUES ('ordinary_share', 'XSHG', '688999', 'CNY', 'active')
                """
            )
            connection.commit()
            connection.executescript(
                (HERE / "migrations" / "003_v2_to_v3.sql").read_text(encoding="utf-8")
            )
            connection.executescript(
                (HERE / "migrations" / "004_v3_to_v4.sql").read_text(encoding="utf-8")
            )
            connection.execute(
                """
                UPDATE entities
                SET catalog_company_id = 123456
                WHERE is_research_subject = 1
                """
            )
            connection.commit()
        finally:
            connection.close()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def test_v2_data_survives_v3_migration(self) -> None:
        connection = self.connect()
        try:
            company_database.validate_connection(connection, self.root)
            names = connection.execute(
                "SELECT name FROM company_names ORDER BY company_name_id"
            ).fetchall()
            security = connection.execute(
                "SELECT issuer_entity_id, ticker FROM securities"
            ).fetchone()
            self.assertEqual(
                [row["name"] for row in names],
                [
                    "测试科技股份有限公司",
                    "测试科技",
                    "Test Technology Co., Ltd.",
                ],
            )
            self.assertEqual(security["issuer_entity_id"], 100000)
            self.assertEqual(security["ticker"], "688999")
        finally:
            connection.close()

    def test_validator_checks_research_item_extension_type(self) -> None:
        connection = self.connect()
        try:
            item_id = connection.execute(
                """
                INSERT INTO research_items (
                    item_type, information_class, created_by_type
                ) VALUES ('wrong_type', 'disclosed_fact', 'system')
                """
            ).lastrowid
            connection.execute(
                """
                INSERT INTO entity_websites (
                    item_id, entity_id, website_type, url,
                    normalized_host, is_official
                ) VALUES (?, 100000, 'corporate', 'https://example.com/',
                          'example.com', 1)
                """,
                (item_id,),
            )
            connection.commit()
            with self.assertRaisesRegex(RuntimeError, "entity_websites"):
                company_database.validate_connection(connection, self.root)
        finally:
            connection.close()

    def test_validator_checks_document_hash(self) -> None:
        source = self.root / "_materials" / "source.txt"
        source.parent.mkdir()
        source.write_text("source evidence\n", encoding="utf-8")
        digest = hashlib.sha256(source.read_bytes()).hexdigest()

        connection = self.connect()
        try:
            family_id = connection.execute(
                """
                INSERT INTO document_families (
                    publisher_name, document_type, canonical_title
                ) VALUES ('Test Publisher', 'filing', 'Test Filing')
                """
            ).lastrowid
            document_id = connection.execute(
                """
                INSERT INTO documents (
                    document_family_id, title, publication_precision
                ) VALUES (?, 'Test Filing', 'unknown')
                """,
                (family_id,),
            ).lastrowid
            connection.execute(
                """
                INSERT INTO document_files (
                    document_id, representation, relative_path,
                    sha256, mime_type, byte_size
                ) VALUES (?, 'original', '_materials/source.txt', ?,
                          'text/plain', ?)
                """,
                (document_id, digest, source.stat().st_size),
            )
            connection.commit()
            company_database.validate_connection(connection, self.root)

            source.write_text("changed\n", encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "size mismatch|hash mismatch"):
                company_database.validate_connection(connection, self.root)
        finally:
            connection.close()

    def test_validator_requires_evidence_for_confirmed_source_facts(self) -> None:
        connection = self.connect()
        try:
            item_id = connection.execute(
                """
                INSERT INTO research_items (
                    item_type, information_class, topic_code,
                    review_status, created_by_type
                ) VALUES (
                    'entity_website', 'disclosed_fact', 'company.website',
                    'confirmed', 'system'
                )
                """
            ).lastrowid
            connection.execute(
                """
                INSERT INTO entity_websites (
                    item_id, entity_id, website_type, url,
                    normalized_host, is_official
                ) VALUES (?, 100000, 'corporate', 'https://example.com/',
                          'example.com', 1)
                """,
                (item_id,),
            )
            connection.commit()
            with self.assertRaisesRegex(RuntimeError, "without confirmed evidence"):
                company_database.validate_connection(connection, self.root)
        finally:
            connection.close()

    def test_observation_recommendation_prefers_later_source_version(self) -> None:
        connection = self.connect()
        try:
            metric_id = connection.execute(
                """
                INSERT INTO metric_definitions (
                    metric_code, canonical_name, metric_category, owner_scope
                ) VALUES ('cn_gaap.revenue', '营业收入', 'financial', 'company')
                """
            ).lastrowid
            version_id = connection.execute(
                """
                INSERT INTO metric_definition_versions (
                    metric_id, version_number, definition, period_type,
                    value_type, default_unit_code, status
                ) VALUES (?, 1, '测试营业收入。', 'duration', 'decimal',
                          'CNY_10K', 'active')
                """,
                (metric_id,),
            ).lastrowid
            item_ids = []
            for known_from, value in (
                ('2026-03-20', '39237.06'),
                ('2026-05-25', '39277.07'),
            ):
                item_id = connection.execute(
                    """
                    INSERT INTO research_items (
                        item_type, information_class, review_status,
                        confidence_level, known_from, created_by_type
                    ) VALUES (
                        'observation', 'disclosed_fact', 'needs_review',
                        'high', ?, 'system'
                    )
                    """,
                    (known_from,),
                ).lastrowid
                connection.execute(
                    """
                    INSERT INTO observations (
                        item_id, subject_entity_id, metric_id, metric_version_id,
                        period_start, period_end, fiscal_period_label,
                        raw_value_text, decimal_value_text, unit_code,
                        currency_code, consolidation_scope
                    ) VALUES (
                        ?, 100000, ?, ?, '2024-01-01', '2024-12-31',
                        'FY2024', ?, ?, 'CNY_10K', 'CNY', 'consolidated'
                    )
                    """,
                    (item_id, metric_id, version_id, value, value),
                )
                item_ids.append(item_id)
            connection.commit()
            company_database.validate_connection(connection, self.root)

            candidates = connection.execute(
                """
                SELECT item_id, recommendation_rank, candidate_count,
                       has_value_conflict, recommendation_status
                FROM v_observation_candidates
                WHERE metric_code = 'cn_gaap.revenue'
                ORDER BY recommendation_rank
                """
            ).fetchall()
            current = connection.execute(
                """
                SELECT item_id, decimal_value_text, recommendation_status
                FROM v_observation_current
                WHERE metric_code = 'cn_gaap.revenue'
                """
            ).fetchone()
            self.assertEqual(len(candidates), 2)
            self.assertEqual(candidates[0]["item_id"], item_ids[1])
            self.assertEqual(candidates[0]["candidate_count"], 2)
            self.assertEqual(candidates[0]["has_value_conflict"], 1)
            self.assertEqual(
                candidates[0]["recommendation_status"], "default_needs_review"
            )
            self.assertEqual(current["decimal_value_text"], "39277.07")
        finally:
            connection.close()


if __name__ == "__main__":
    unittest.main()
