#!/usr/bin/env python3
"""Load the two-source FY2024 Unitree financial versioning pilot."""

from __future__ import annotations

import json
import sqlite3

from archive_config import load_archive_config
from company_database import connect, validate_connection


COMPANY_FOLDER = "宇树科技"
PILOT_SCOPE = "宇树科技 2024财务多版本试验"
PROSPECTUS_KNOWN_FROM = "2026-03-20"
SPONSOR_KNOWN_FROM = "2026-05-25"

PROSPECTUS_VALUES = {
    "cn_gaap.total_assets": ("152689.65", "152,689.65 万元"),
    "cn_gaap.equity_attributable_to_parent": (
        "127957.61",
        "127,957.61 万元",
    ),
    "cn_gaap.debt_to_asset_ratio_consolidated": ("16.20", "16.20%"),
    "cn_gaap.revenue": ("39237.06", "39,237.06 万元"),
    "operating.main_business_gross_margin": ("56.41", "56.41%"),
    "cn_gaap.net_profit": ("9450.18", "9,450.18 万元"),
    "cn_gaap.net_profit_attributable_to_parent": (
        "9450.18",
        "9,450.18 万元",
    ),
    "cn_gaap.adjusted_net_profit_attributable_to_parent": (
        "7750.36",
        "7,750.36 万元",
    ),
    "cn_gaap.operating_cash_flow_net": ("19239.13", "19,239.13 万元"),
    "operating.rd_expense_to_revenue": ("17.84", "17.84%"),
}


def add_research_item(
    connection: sqlite3.Connection,
    topic_code: str,
) -> int:
    cursor = connection.execute(
        """
        INSERT INTO research_items (
            item_type, information_class, topic_code, review_status,
            confidence_level, known_from, created_by_type, created_by
        ) VALUES (
            'observation', 'disclosed_fact', ?, 'confirmed',
            'high', ?, 'import', 'seed_unitree_2024_version_pilot.py'
        )
        """,
        (topic_code, PROSPECTUS_KNOWN_FROM),
    )
    return int(cursor.lastrowid)


def get_document_id(
    connection: sqlite3.Connection,
    external_key: str,
) -> int:
    rows = connection.execute(
        """
        SELECT d.document_id
        FROM document_families f
        JOIN documents d USING (document_family_id)
        WHERE f.external_key = ?
        """,
        (external_key,),
    ).fetchall()
    if len(rows) != 1:
        raise RuntimeError(
            f"Expected one document for {external_key}, found {len(rows)}"
        )
    return int(rows[0][0])


def get_sponsor_observation(
    connection: sqlite3.Connection,
    metric_code: str,
) -> sqlite3.Row:
    rows = connection.execute(
        """
        SELECT o.*, r.topic_code, r.known_from, r.review_status,
               m.metric_code
        FROM observations o
        JOIN research_items r USING (item_id)
        JOIN metric_definitions m USING (metric_id)
        WHERE m.metric_code = ?
          AND o.fiscal_period_label = 'FY2024'
          AND r.known_from = ?
        """,
        (metric_code, SPONSOR_KNOWN_FROM),
    ).fetchall()
    if len(rows) != 1:
        raise RuntimeError(
            f"Expected one FY2024 sponsor observation for {metric_code}, "
            f"found {len(rows)}"
        )
    if rows[0]["review_status"] != "confirmed":
        raise RuntimeError(f"Sponsor observation is not confirmed: {metric_code}")
    return rows[0]


def insert_prospectus_observation(
    connection: sqlite3.Connection,
    sponsor: sqlite3.Row,
    value: str,
    raw_value: str,
) -> int:
    item_id = add_research_item(connection, sponsor["topic_code"])
    connection.execute(
        """
        INSERT INTO observations (
            item_id, subject_entity_id, metric_id, metric_version_id,
            period_start, period_end, as_of_date, fiscal_period_label,
            date_precision, value_kind, comparison_operator, raw_value_text,
            decimal_value_text, unit_code, currency_code, data_status,
            consolidation_scope, notes
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        """,
        (
            item_id,
            sponsor["subject_entity_id"],
            sponsor["metric_id"],
            sponsor["metric_version_id"],
            sponsor["period_start"],
            sponsor["period_end"],
            sponsor["as_of_date"],
            sponsor["fiscal_period_label"],
            sponsor["date_precision"],
            sponsor["value_kind"],
            sponsor["comparison_operator"],
            raw_value,
            value,
            sponsor["unit_code"],
            sponsor["currency_code"],
            sponsor["data_status"],
            sponsor["consolidation_scope"],
            "招股说明书2026-03-20申报稿披露版本；与后续上市保荐书版本并存。",
        ),
    )
    return item_id


def add_evidence(
    connection: sqlite3.Connection,
    item_id: int,
    prospectus_document_id: int,
    metric_code: str,
    raw_value: str,
) -> None:
    connection.execute(
        """
        INSERT INTO evidence_links (
            item_id, document_id, locator_type, locator_value,
            evidence_role, excerpt, extraction_method, review_status
        ) VALUES (
            ?, ?, 'table',
            'physical PDF p.28 (printed p.27), 六、发行人报告期的主要财务数据和财务指标',
            'supports', ?, 'manual', 'confirmed'
        )
        """,
        (
            item_id,
            prospectus_document_id,
            f"2024年度/年末：{metric_code} = {raw_value}。",
        ),
    )


def add_version_relation(
    connection: sqlite3.Connection,
    sponsor_item_id: int,
    prospectus_item_id: int,
    values_differ: bool,
) -> None:
    if values_differ:
        relation_type = "contradicts"
        notes = (
            "同一指标、期间、单位和合并口径的数值不同；仅标识来源冲突，"
            "不据此认定差错更正或取代。"
        )
    else:
        relation_type = "context_for"
        notes = "同一指标、期间、单位和合并口径的两次披露数值一致。"
    connection.execute(
        """
        INSERT INTO item_relations (
            source_item_id, target_item_id, relation_type,
            relation_nature, notes
        ) VALUES (?, ?, ?, 'system_defined', ?)
        """,
        (sponsor_item_id, prospectus_item_id, relation_type, notes),
    )


def add_quality_issue_context(
    connection: sqlite3.Connection,
    quality_issue_item_id: int,
    observation_item_id: int,
) -> None:
    connection.execute(
        """
        INSERT OR IGNORE INTO item_relations (
            source_item_id, target_item_id, relation_type,
            relation_nature, notes
        ) VALUES (
            ?, ?, 'context_for', 'system_defined',
            '2024年两版主要财务数据对照试验'
        )
        """,
        (quality_issue_item_id, observation_item_id),
    )


def add_coverage(
    connection: sqlite3.Connection,
    conflict_count: int,
) -> None:
    cursor = connection.execute(
        """
        INSERT INTO coverage_scopes (name, start_date, end_date, status)
        VALUES (?, '2024-01-01', ?, 'active')
        """,
        (PILOT_SCOPE, SPONSOR_KNOWN_FROM),
    )
    scope_id = int(cursor.lastrowid)
    for metric_code in PROSPECTUS_VALUES:
        cursor = connection.execute(
            """
            INSERT INTO coverage_requirements (
                coverage_scope_id, requirement_type, requirement_key,
                required_frequency, materiality, requires_human_review
            ) VALUES (?, 'metric', ?, 'two_source_version_pilot', 'high', 1)
            """,
            (scope_id, metric_code),
        )
        connection.execute(
            """
            INSERT INTO coverage_results (
                coverage_requirement_id, coverage_status,
                current_through, details
            ) VALUES (?, 'covered', '2024-12-31', ?)
            """,
            (
                int(cursor.lastrowid),
                f"已保存招股书和上市保荐书两个来源版本；本批共{conflict_count}个冲突指标。",
            ),
        )


def seed() -> None:
    config = load_archive_config()
    company_root = config.company_root(COMPANY_FOLDER)
    database_path = company_root / "company.sqlite"
    connection = connect(database_path)
    try:
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        if version != 4:
            raise RuntimeError(f"Unitree company database must be V4, found V{version}")
        existing_scope = connection.execute(
            "SELECT coverage_scope_id FROM coverage_scopes WHERE name = ?",
            (PILOT_SCOPE,),
        ).fetchone()
        if existing_scope is not None:
            validate_connection(connection, company_root)
            print(f"already seeded: {PILOT_SCOPE}")
            return
        existing_candidates = connection.execute(
            """
            SELECT COUNT(*)
            FROM observations o
            JOIN research_items r USING (item_id)
            JOIN metric_definitions m USING (metric_id)
            WHERE o.fiscal_period_label = 'FY2024'
              AND r.known_from = ?
              AND m.metric_code IN (
                  SELECT json_each.value
                  FROM json_each(?)
              )
            """,
            (
                PROSPECTUS_KNOWN_FROM,
                json.dumps(list(PROSPECTUS_VALUES)),
            ),
        ).fetchone()[0]
        if existing_candidates:
            raise RuntimeError(
                "Prospectus pilot candidates exist without the coverage marker"
            )

        prospectus_document_id = get_document_id(
            connection, "sse:002178:prospectus"
        )
        get_document_id(connection, "sse:002178:listing-sponsor-letter")
        issue_rows = connection.execute(
            """
            SELECT item_id FROM quality_issues
            WHERE title = '2024年财务数值在两版申报材料间存在差异'
            """
        ).fetchall()
        if len(issue_rows) != 1:
            raise RuntimeError("Expected the existing FY2024 quality issue")
        quality_issue_item_id = int(issue_rows[0][0])

        connection.execute("BEGIN IMMEDIATE")
        conflict_count = 0
        for metric_code, (value, raw_value) in PROSPECTUS_VALUES.items():
            sponsor = get_sponsor_observation(connection, metric_code)
            prospectus_item_id = insert_prospectus_observation(
                connection, sponsor, value, raw_value
            )
            add_evidence(
                connection,
                prospectus_item_id,
                prospectus_document_id,
                metric_code,
                raw_value,
            )
            values_differ = sponsor["decimal_value_text"] != value
            conflict_count += int(values_differ)
            add_version_relation(
                connection,
                int(sponsor["item_id"]),
                prospectus_item_id,
                values_differ,
            )
            add_quality_issue_context(
                connection, quality_issue_item_id, int(sponsor["item_id"])
            )
            add_quality_issue_context(
                connection, quality_issue_item_id, prospectus_item_id
            )
            connection.execute(
                """
                UPDATE observations
                SET notes = CASE
                    WHEN notes IS NULL OR notes = '' THEN
                        '上市保荐书2026-05-25披露版本；默认推荐视图按较晚known_from排序。'
                    ELSE notes || ' 上市保荐书2026-05-25披露版本。'
                END
                WHERE item_id = ?
                """,
                (int(sponsor["item_id"]),),
            )

        connection.execute(
            """
            UPDATE quality_issues
            SET description = ?
            WHERE item_id = ?
            """,
            (
                "2026-03-20招股书与2026-05-25上市保荐书的10个同口径2024年主要财务指标中，9个数值不同、1个一致。两个来源版本均已保存；现有材料不足以断言属于差错更正或取代。默认推荐查询按复核状态、信息类别和known_from排序，并将冲突组标记为needs_review。",
                quality_issue_item_id,
            ),
        )
        add_coverage(connection, conflict_count)
        connection.commit()
        validate_connection(connection, company_root)

        summary = connection.execute(
            """
            SELECT
                COUNT(DISTINCT series_key) AS series_count,
                SUM(CASE WHEN recommendation_rank = 1
                              AND has_value_conflict = 1 THEN 1 ELSE 0 END)
                    AS conflict_series,
                SUM(CASE WHEN recommendation_rank = 1
                              AND has_value_conflict = 0 THEN 1 ELSE 0 END)
                    AS matching_series
            FROM v_observation_candidates
            WHERE fiscal_period_label = 'FY2024'
              AND metric_code IN (
                  SELECT json_each.value FROM json_each(?)
              )
            """,
            (json.dumps(list(PROSPECTUS_VALUES)),),
        ).fetchone()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
    print(
        "seeded: "
        f"series={summary['series_count']}, "
        f"conflicts={summary['conflict_series']}, "
        f"matching={summary['matching_series']}"
    )


if __name__ == "__main__":
    seed()
