#!/usr/bin/env python3
"""Load Unitree's reviewed Phase A evidence, entities, and observations."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path

from archive_config import load_archive_config
from company_database import connect, validate_connection


COMPANY_FOLDER = "宇树科技"
SEED_NAME = "宇树科技 Phase A 基线"
KNOWN_FROM_SPONSOR = "2026-05-25"
ACCESSED_AT = "2026-08-12"

SOURCE_FILES = {
    "prospectus_pdf": {
        "relative_path": "_materials/regulatory/2026/2026-03-20-unitree-prospectus.pdf",
        "sha256": "bfc09ad6fc98a2d3a76096c3411b90f0990b047d1fec11cee0d10fd9bb76ac5d",
        "representation": "original",
        "mime_type": "application/pdf",
    },
    "prospectus_text": {
        "relative_path": "_research/extracted/2026-03-20-unitree-prospectus.txt",
        "sha256": "30a8e4cdf0688035c02c9c34acc674c8b0c4a4ef861c7dec9abe424ec63b1256",
        "representation": "extracted_text",
        "mime_type": "text/plain; charset=utf-8",
        "extractor_name": "pdftotext",
        "extractor_version": "26.06.0",
    },
    "sponsor_pdf": {
        "relative_path": "_materials/regulatory/2026/2026-05-25-unitree-listing-sponsor-letter.pdf",
        "sha256": "81403109453142e24dce5328c664555d648992a5c23aa8cc29aba0143f613a5f",
        "representation": "original",
        "mime_type": "application/pdf",
    },
    "sponsor_text": {
        "relative_path": "_research/extracted/2026-05-25-unitree-listing-sponsor-letter.txt",
        "sha256": "b7508239fbeecdc192e64eee55346dfa39af3b94c153e87a1a455d86badd8832",
        "representation": "extracted_text",
        "mime_type": "text/plain; charset=utf-8",
        "extractor_name": "pdftotext",
        "extractor_version": "26.06.0",
    },
    "csrc_html": {
        "relative_path": "_materials/regulatory/2026/2026-07-01-csrc-registration-approval.html",
        "sha256": "e2b0c973c65711d1992e859c7411ec918061194f60183b10d96a34877a517441",
        "representation": "snapshot",
        "mime_type": "text/html; charset=utf-8",
    },
    "company_html": {
        "relative_path": "_materials/web/2026/2026-08-12-unitree-company-page.html",
        "sha256": "a6d4ddc7a6e84c5cc5d6a9ad4078dd2afa6c94497c586fdf621ac20e8ba0235d",
        "representation": "snapshot",
        "mime_type": "text/html; charset=utf-8",
    },
    "g1_html": {
        "relative_path": "_materials/web/2026/2026-08-12-unitree-g1-page.html",
        "sha256": "be051f7d0d540c22f5f955774b725212054ffd3f7fa3f4dd41e2861464582dac",
        "representation": "snapshot",
        "mime_type": "text/html; charset=utf-8",
    },
}


def file_sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def verify_source_files(company_root: Path) -> None:
    for metadata in SOURCE_FILES.values():
        path = company_root / metadata["relative_path"]
        if not path.is_file():
            raise FileNotFoundError(f"Missing Unitree source file: {path}")
        actual = file_sha256(path)
        if actual != metadata["sha256"]:
            raise RuntimeError(f"SHA-256 mismatch for Unitree source file: {path}")


def add_item(
    connection: sqlite3.Connection,
    item_type: str,
    information_class: str,
    topic_code: str,
    *,
    review_status: str = "confirmed",
    confidence_level: str = "high",
    valid_from: str | None = None,
    valid_to: str | None = None,
    date_precision: str | None = None,
    known_from: str | None = None,
    created_by_type: str = "import",
) -> int:
    cursor = connection.execute(
        """
        INSERT INTO research_items (
            item_type, information_class, topic_code, review_status,
            confidence_level, valid_from, valid_to, date_precision,
            known_from, created_by_type, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            item_type,
            information_class,
            topic_code,
            review_status,
            confidence_level,
            valid_from,
            valid_to,
            date_precision,
            known_from,
            created_by_type,
            "seed_unitree_phase_a.py",
        ),
    )
    return int(cursor.lastrowid)


def add_evidence(
    connection: sqlite3.Connection,
    item_id: int,
    document_id: int,
    locator_type: str,
    locator_value: str,
    excerpt: str,
    *,
    evidence_role: str = "supports",
) -> None:
    connection.execute(
        """
        INSERT INTO evidence_links (
            item_id, document_id, locator_type, locator_value,
            evidence_role, excerpt, extraction_method, review_status
        ) VALUES (?, ?, ?, ?, ?, ?, 'manual', 'confirmed')
        """,
        (
            item_id,
            document_id,
            locator_type,
            locator_value,
            evidence_role,
            excerpt,
        ),
    )


def add_entity(
    connection: sqlite3.Connection, entity_type: str, canonical_label: str
) -> int:
    cursor = connection.execute(
        """
        INSERT INTO entities (entity_type, canonical_label, status)
        VALUES (?, ?, 'active')
        """,
        (entity_type, canonical_label),
    )
    return int(cursor.lastrowid)


def add_document_family(
    connection: sqlite3.Connection,
    publisher_entity_id: int,
    document_type: str,
    canonical_title: str,
    external_key: str,
) -> int:
    cursor = connection.execute(
        """
        INSERT INTO document_families (
            publisher_entity_id, document_type, canonical_title, external_key
        ) VALUES (?, ?, ?, ?)
        """,
        (publisher_entity_id, document_type, canonical_title, external_key),
    )
    return int(cursor.lastrowid)


def add_document(
    connection: sqlite3.Connection,
    family_id: int,
    title: str,
    source_url: str,
    *,
    version_label: str | None = None,
    publication_date: str | None = None,
    publication_precision: str = "unknown",
) -> int:
    cursor = connection.execute(
        """
        INSERT INTO documents (
            document_family_id, version_label, title, language, source_url,
            publication_date, publication_precision, accessed_at, status
        ) VALUES (?, ?, ?, 'zh-CN', ?, ?, ?, ?, 'active')
        """,
        (
            family_id,
            version_label,
            title,
            source_url,
            publication_date,
            publication_precision,
            ACCESSED_AT,
        ),
    )
    return int(cursor.lastrowid)


def add_document_file(
    connection: sqlite3.Connection,
    company_root: Path,
    document_id: int,
    key: str,
) -> int:
    metadata = SOURCE_FILES[key]
    path = company_root / metadata["relative_path"]
    cursor = connection.execute(
        """
        INSERT INTO document_files (
            document_id, representation, relative_path, sha256, mime_type,
            byte_size, extractor_name, extractor_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            document_id,
            metadata["representation"],
            metadata["relative_path"],
            metadata["sha256"],
            metadata["mime_type"],
            path.stat().st_size,
            metadata.get("extractor_name"),
            metadata.get("extractor_version"),
        ),
    )
    return int(cursor.lastrowid)


def add_metric(
    connection: sqlite3.Connection,
    metric_code: str,
    name: str,
    category: str,
    owner_scope: str,
    definition: str,
    period_type: str,
    default_unit: str,
    *,
    allowed_dimensions: list[str] | None = None,
) -> tuple[int, int]:
    cursor = connection.execute(
        """
        INSERT INTO metric_definitions (
            metric_code, canonical_name, metric_category, owner_scope
        ) VALUES (?, ?, ?, ?)
        """,
        (metric_code, name, category, owner_scope),
    )
    metric_id = int(cursor.lastrowid)
    cursor = connection.execute(
        """
        INSERT INTO metric_definition_versions (
            metric_id, version_number, definition, period_type, value_type,
            default_unit_code, consolidation_rule, allowed_dimensions,
            valid_from, status
        ) VALUES (?, 1, ?, ?, 'decimal', ?, ?, ?, '2023-01-01', 'active')
        """,
        (
            metric_id,
            definition,
            period_type,
            default_unit,
            "use_explicit_reported_scope",
            json.dumps(allowed_dimensions, ensure_ascii=False)
            if allowed_dimensions
            else None,
        ),
    )
    return metric_id, int(cursor.lastrowid)


def add_observation(
    connection: sqlite3.Connection,
    subject_entity_id: int,
    metric: tuple[int, int],
    topic_code: str,
    *,
    raw_value_text: str,
    comparison_operator: str = "eq",
    decimal_value_text: str | None = None,
    decimal_low_text: str | None = None,
    decimal_high_text: str | None = None,
    unit_code: str | None = None,
    currency_code: str | None = None,
    period_start: str | None = None,
    period_end: str | None = None,
    as_of_date: str | None = None,
    fiscal_period_label: str | None = None,
    consolidation_scope: str | None = None,
    notes: str | None = None,
    known_from: str = KNOWN_FROM_SPONSOR,
) -> int:
    item_id = add_item(
        connection,
        "observation",
        "disclosed_fact",
        topic_code,
        known_from=known_from,
    )
    connection.execute(
        """
        INSERT INTO observations (
            item_id, subject_entity_id, metric_id, metric_version_id,
            period_start, period_end, as_of_date, fiscal_period_label,
            date_precision, value_kind, comparison_operator, raw_value_text,
            decimal_value_text, decimal_low_text, decimal_high_text,
            unit_code, currency_code, data_status, consolidation_scope, notes
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, 'day', 'actual', ?, ?, ?, ?, ?,
            ?, ?, 'reported', ?, ?
        )
        """,
        (
            item_id,
            subject_entity_id,
            metric[0],
            metric[1],
            period_start,
            period_end,
            as_of_date,
            fiscal_period_label,
            comparison_operator,
            raw_value_text,
            decimal_value_text,
            decimal_low_text,
            decimal_high_text,
            unit_code,
            currency_code,
            consolidation_scope,
            notes,
        ),
    )
    return item_id


def add_observation_dimension(
    connection: sqlite3.Connection,
    observation_item_id: int,
    dimension: tuple[int, int],
) -> None:
    connection.execute(
        """
        INSERT INTO observation_dimensions (
            observation_item_id, dimension_type_id, dimension_member_id
        ) VALUES (?, ?, ?)
        """,
        (observation_item_id, dimension[0], dimension[1]),
    )


def add_dimension(
    connection: sqlite3.Connection,
    dimension_type_id: int,
    member_code: str,
    name: str,
) -> tuple[int, int]:
    cursor = connection.execute(
        """
        INSERT INTO dimension_members (
            dimension_type_id, member_code, name
        ) VALUES (?, ?, ?)
        """,
        (dimension_type_id, member_code, name),
    )
    return dimension_type_id, int(cursor.lastrowid)


def seed_documents(
    connection: sqlite3.Connection,
    company_root: Path,
    root_entity_id: int,
    publisher_entities: dict[str, int],
) -> dict[str, int]:
    families = {
        "prospectus": add_document_family(
            connection,
            publisher_entities["sse"],
            "prospectus",
            "宇树科技首次公开发行股票并在科创板上市招股说明书",
            "sse:002178:prospectus",
        ),
        "sponsor": add_document_family(
            connection,
            publisher_entities["citic"],
            "listing_sponsor_letter",
            "中信证券关于宇树科技首次公开发行并在科创板上市之上市保荐书",
            "sse:002178:listing-sponsor-letter",
        ),
        "csrc": add_document_family(
            connection,
            publisher_entities["csrc"],
            "regulatory_decision",
            "关于同意宇树科技首次公开发行股票注册的批复",
            "csrc:2026:1612",
        ),
        "company": add_document_family(
            connection,
            root_entity_id,
            "corporate_webpage",
            "宇树科技公司信息页",
            "https://www.unitree.com/operate/company/",
        ),
        "g1": add_document_family(
            connection,
            root_entity_id,
            "product_webpage",
            "Unitree G1 产品页",
            "https://www.unitree.com/cn/g1/",
        ),
    }
    documents = {
        "prospectus": add_document(
            connection,
            families["prospectus"],
            "宇树科技股份有限公司首次公开发行股票并在科创板上市招股说明书（申报稿）",
            "https://static.sse.com.cn/stock/disclosure/announcement/c/202603/002178_20260320_QY8F.pdf",
            version_label="2026-03-20 申报稿",
            publication_date="2026-03-20",
            publication_precision="day",
        ),
        "sponsor": add_document(
            connection,
            families["sponsor"],
            "中信证券股份有限公司关于宇树科技股份有限公司首次公开发行股票并在科创板上市之上市保荐书",
            "https://static.sse.com.cn/stock/disclosure/announcement/c/202605/002178_20260525_X2BM.pdf",
            version_label="2026-05-25",
            publication_date="2026-05-25",
            publication_precision="day",
        ),
        "csrc": add_document(
            connection,
            families["csrc"],
            "关于同意宇树科技股份有限公司首次公开发行股票注册的批复",
            "https://www.csrc.gov.cn/csrc/c105906/c7642867/content.shtml",
            version_label="证监许可〔2026〕1612号；批复日期 2026-07-01",
            publication_date="2026-07-02",
            publication_precision="day",
        ),
        "company": add_document(
            connection,
            families["company"],
            "宇树科技公司信息页快照",
            "https://www.unitree.com/operate/company/",
            version_label="访问快照 2026-08-12",
        ),
        "g1": add_document(
            connection,
            families["g1"],
            "Unitree G1 产品页快照",
            "https://www.unitree.com/cn/g1/",
            version_label="访问快照 2026-08-12",
        ),
    }
    file_ids = {
        "prospectus_pdf": add_document_file(
            connection, company_root, documents["prospectus"], "prospectus_pdf"
        ),
        "prospectus_text": add_document_file(
            connection, company_root, documents["prospectus"], "prospectus_text"
        ),
        "sponsor_pdf": add_document_file(
            connection, company_root, documents["sponsor"], "sponsor_pdf"
        ),
        "sponsor_text": add_document_file(
            connection, company_root, documents["sponsor"], "sponsor_text"
        ),
        "csrc_html": add_document_file(
            connection, company_root, documents["csrc"], "csrc_html"
        ),
        "company_html": add_document_file(
            connection, company_root, documents["company"], "company_html"
        ),
        "g1_html": add_document_file(
            connection, company_root, documents["g1"], "g1_html"
        ),
    }
    for source_key, output_key in (
        ("prospectus_pdf", "prospectus_text"),
        ("sponsor_pdf", "sponsor_text"),
    ):
        connection.execute(
            """
            INSERT INTO processing_runs (
                process_type, tool_name, tool_version,
                input_document_file_id, output_document_file_id,
                started_at, completed_at, run_status
            ) VALUES (
                'pdf_text_extraction', 'pdftotext', '26.06.0', ?, ?,
                '2026-08-12T23:52:00+08:00',
                '2026-08-12T23:52:30+08:00', 'succeeded'
            )
            """,
            (file_ids[source_key], file_ids[output_key]),
        )
    return documents


def seed_identity(
    connection: sqlite3.Connection,
    root_entity_id: int,
    person_entity_id: int,
    documents: dict[str, int],
) -> None:
    name_evidence = {
        "宇树科技股份有限公司": (
            documents["prospectus"],
            "page",
            "physical PDF p.56 (printed p.55), 第四节/二",
            "2025年10月23日完成工商更名，名称变更为宇树科技股份有限公司。",
            "2026-03-20",
        ),
        "宇树科技": (
            documents["sponsor"],
            "page",
            "physical PDF p.4 (printed 3-1-3-3), 第一节/二",
            "文件将发行人简称为宇树科技。",
            KNOWN_FROM_SPONSOR,
        ),
        "Yushu Technology Co., Ltd.": (
            documents["sponsor"],
            "page",
            "physical PDF p.4 (printed 3-1-3-3), 第一节/一",
            "英文名称：Yushu Technology Co., Ltd.",
            KNOWN_FROM_SPONSOR,
        ),
        "杭州宇树科技有限公司": (
            documents["prospectus"],
            "page",
            "physical PDF p.12 (printed 1-1-11), 第一节释义",
            "宇树有限指杭州宇树科技有限公司，系公司改制前身。",
            "2026-03-20",
        ),
        "杭州宇树科技股份有限公司": (
            documents["prospectus"],
            "page",
            "physical PDF p.56 (printed p.55), 第四节/二",
            "公司曾用名杭州宇树科技股份有限公司，2025年10月23日完成更名。",
            "2026-03-20",
        ),
    }
    for name, evidence in name_evidence.items():
        row = connection.execute(
            "SELECT item_id FROM entity_names WHERE entity_id = ? AND name = ?",
            (root_entity_id, name),
        ).fetchone()
        if row is None:
            raise RuntimeError(f"Migrated Unitree name is missing: {name}")
        item_id = int(row[0])
        connection.execute(
            """
            UPDATE research_items
            SET review_status = 'confirmed', confidence_level = 'high',
                known_from = ?, created_by_type = 'import',
                created_by = 'seed_unitree_phase_a.py'
            WHERE item_id = ?
            """,
            (evidence[4], item_id),
        )
        add_evidence(connection, item_id, *evidence[:4])

    person_name_item = add_item(
        connection,
        "entity_name",
        "disclosed_fact",
        "company.leadership",
        known_from=KNOWN_FROM_SPONSOR,
    )
    connection.execute(
        """
        INSERT INTO entity_names (
            item_id, entity_id, name, language, name_type,
            is_current, is_official
        ) VALUES (?, ?, '王兴兴', 'zh-CN', 'common', 1, 1)
        """,
        (person_name_item, person_entity_id),
    )
    add_evidence(
        connection,
        person_name_item,
        documents["sponsor"],
        "page",
        "physical PDF p.4 (printed 3-1-3-3), 第一节/一",
        "法定代表人：王兴兴。",
    )

    identifier_item = add_item(
        connection,
        "entity_identifier",
        "disclosed_fact",
        "company.identity",
        valid_from="2016-08-26",
        date_precision="day",
        known_from=KNOWN_FROM_SPONSOR,
    )
    connection.execute(
        """
        INSERT INTO entity_identifiers (
            item_id, entity_id, identifier_type, identifier_value, jurisdiction
        ) VALUES (?, ?, 'cn_uscc', '91330108MA27YJ5H56', 'CN')
        """,
        (identifier_item, root_entity_id),
    )
    add_evidence(
        connection,
        identifier_item,
        documents["sponsor"],
        "page",
        "physical PDF p.4 (printed 3-1-3-3), 第一节/一",
        "统一社会信用代码：91330108MA27YJ5H56。",
    )

    for legal_form, start, end, document_key, locator, excerpt in (
        (
            "limited_liability_company",
            "2016-08-26",
            "2025-05-27",
            "prospectus",
            "physical PDF p.12 (printed 1-1-11), 第一节释义",
            "杭州宇树科技有限公司系公司改制前身。",
        ),
        (
            "joint_stock_limited_company",
            "2025-05-28",
            None,
            "prospectus",
            "physical PDF p.39 (printed 1-1-38), 第四节/二（二）",
            "2025年5月28日完成整体变更设立股份有限公司的工商登记。",
        ),
    ):
        item_id = add_item(
            connection,
            "entity_legal_state",
            "disclosed_fact",
            "company.legal_form",
            valid_from=start,
            valid_to=end,
            date_precision="day",
            known_from="2026-03-20",
        )
        connection.execute(
            """
            INSERT INTO entity_legal_states (
                item_id, entity_id, jurisdiction_code,
                legal_form_code, legal_status_code
            ) VALUES (?, ?, 'CN-ZJ', ?, 'active')
            """,
            (item_id, root_entity_id, legal_form),
        )
        add_evidence(
            connection,
            item_id,
            documents[document_key],
            "page",
            locator,
            excerpt,
        )

    for event_type, event_date, title, description, document_key, locator, excerpt in (
        (
            "incorporation",
            "2016-08-26",
            "杭州宇树科技有限公司成立",
            "有限公司成立日期。",
            "sponsor",
            "physical PDF p.4 (printed 3-1-3-3), 第一节/一",
            "有限公司成立日期：2016年8月26日。",
        ),
        (
            "legal_form_conversion",
            "2025-05-28",
            "整体变更为股份有限公司",
            "工商变更登记完成。",
            "prospectus",
            "physical PDF p.39 (printed 1-1-38), 第四节/二（二）",
            "2025年5月28日完成整体变更设立股份有限公司的工商登记。",
        ),
        (
            "legal_name_change",
            "2025-10-23",
            "公司更名为宇树科技股份有限公司",
            "公司名称去除地域前缀“杭州”。",
            "prospectus",
            "physical PDF p.56 (printed p.55), 第四节/二",
            "2025年10月23日完成更名工商登记。",
        ),
        (
            "ipo_registration_approved",
            "2026-07-01",
            "首次公开发行股票注册获同意",
            "证监许可〔2026〕1612号；不代表已发行或已上市。",
            "csrc",
            "证监许可〔2026〕1612号/第一项",
            "中国证监会同意公司首次公开发行股票的注册申请。",
        ),
    ):
        known_from = "2026-07-02" if document_key == "csrc" else (
            KNOWN_FROM_SPONSOR if document_key == "sponsor" else "2026-03-20"
        )
        item_id = add_item(
            connection,
            "entity_event",
            "disclosed_fact",
            "market.listing" if document_key == "csrc" else "company.history",
            valid_from=event_date,
            valid_to=event_date,
            date_precision="day",
            known_from=known_from,
        )
        connection.execute(
            """
            INSERT INTO entity_events (
                item_id, entity_id, event_type, event_date,
                date_precision, title, description
            ) VALUES (?, ?, ?, ?, 'day', ?, ?)
            """,
            (item_id, root_entity_id, event_type, event_date, title, description),
        )
        add_evidence(
            connection,
            item_id,
            documents[document_key],
            "webpage_section" if document_key == "csrc" else "page",
            locator,
            excerpt,
        )

    relationship_item = add_item(
        connection,
        "entity_relationship",
        "disclosed_fact",
        "company.leadership",
        known_from=KNOWN_FROM_SPONSOR,
    )
    connection.execute(
        """
        INSERT INTO entity_relationships (
            item_id, subject_entity_id, object_entity_id,
            relationship_type, relationship_status, details
        ) VALUES (?, ?, ?, 'legal_representative', 'active', '披露时点现任')
        """,
        (relationship_item, root_entity_id, person_entity_id),
    )
    add_evidence(
        connection,
        relationship_item,
        documents["sponsor"],
        "page",
        "physical PDF p.4 (printed 3-1-3-3), 第一节/一",
        "法定代表人：王兴兴。",
    )

    for location_type, address, city, postal_code, document_key, locator, excerpt in (
        (
            "registered_address",
            "浙江省杭州市滨江区西兴街道东流路88号1幢306室",
            "杭州",
            "310000",
            "sponsor",
            "physical PDF p.4 (printed 3-1-3-3), 第一节/一",
            "注册地为杭州市滨江区西兴街道东流路88号1幢306室。",
        ),
        (
            "headquarters",
            "中国浙江省杭州市滨江区东流路88号峰达创意园1号楼",
            "杭州",
            None,
            "company",
            "公司信息/总部地点",
            "总部地点为滨江区东流路88号峰达创意园1号楼。",
        ),
    ):
        item_id = add_item(
            connection,
            "entity_location",
            "disclosed_fact",
            "company.location",
            known_from=(
                KNOWN_FROM_SPONSOR if document_key == "sponsor" else ACCESSED_AT
            ),
        )
        connection.execute(
            """
            INSERT INTO entity_locations (
                item_id, entity_id, location_type, country_code,
                region_code, city, address_text, postal_code
            ) VALUES (?, ?, ?, 'CN', 'CN-ZJ', ?, ?, ?)
            """,
            (item_id, root_entity_id, location_type, city, address, postal_code),
        )
        add_evidence(
            connection,
            item_id,
            documents[document_key],
            "page" if document_key == "sponsor" else "webpage_section",
            locator,
            excerpt,
        )

    website_item = add_item(
        connection,
        "entity_website",
        "disclosed_fact",
        "company.website",
        known_from=KNOWN_FROM_SPONSOR,
    )
    connection.execute(
        """
        INSERT INTO entity_websites (
            item_id, entity_id, website_type, url, normalized_host, is_official
        ) VALUES (?, ?, 'corporate', 'https://www.unitree.com/', 'unitree.com', 1)
        """,
        (website_item, root_entity_id),
    )
    add_evidence(
        connection,
        website_item,
        documents["sponsor"],
        "page",
        "physical PDF p.4 (printed 3-1-3-3), 第一节/一",
        "互联网地址：www.unitree.com。",
    )


def seed_metrics_and_observations(
    connection: sqlite3.Connection,
    root_entity_id: int,
    documents: dict[str, int],
) -> dict[str, int]:
    metric_specs = (
        ("cn_gaap.total_assets", "资产总额", "financial_position", "company", "期末合并资产总额。", "instant", "CNY_10K", None),
        ("cn_gaap.equity_attributable_to_parent", "归属于母公司所有者权益", "financial_position", "company", "期末归属于母公司所有者的权益。", "instant", "CNY_10K", None),
        ("cn_gaap.debt_to_asset_ratio_consolidated", "资产负债率（合并）", "financial_ratio", "company", "合并口径负债总额除以资产总额。", "instant", "percent", None),
        ("cn_gaap.revenue", "营业收入", "financial_performance", "company", "按中国企业会计准则披露的营业收入。", "duration", "CNY_10K", None),
        ("operating.main_business_gross_margin", "主营业务毛利率", "operating", "company", "主营业务毛利除以主营业务收入。", "duration", "percent", None),
        ("cn_gaap.net_profit", "净利润", "financial_performance", "company", "合并利润表净利润。", "duration", "CNY_10K", None),
        ("cn_gaap.net_profit_attributable_to_parent", "归属于母公司所有者净利润", "financial_performance", "company", "归属于母公司所有者的净利润。", "duration", "CNY_10K", None),
        ("cn_gaap.adjusted_net_profit_attributable_to_parent", "扣非归母净利润", "financial_performance", "company", "扣除非经常性损益后归属于母公司所有者的净利润。", "duration", "CNY_10K", None),
        ("cn_gaap.operating_cash_flow_net", "经营活动产生的现金流量净额", "cash_flow", "company", "合并现金流量表经营活动产生的现金流量净额。", "duration", "CNY_10K", None),
        ("operating.rd_expense_to_revenue", "研发投入占营业收入比例", "operating", "company", "研发投入除以营业收入。", "duration", "percent", None),
        ("operating.quadruped_robot_sales_volume", "四足机器人销量", "operating", "company", "指定期间四足机器人销量；范围和比较符必须随观测值保存。", "duration", "unit", ["product_family"]),
        ("operating.humanoid_robot_shipments", "人形机器人出货量", "operating", "company", "指定期间纯人形机器人出货量；排除项必须随观测值保存。", "duration", "unit", ["product_family"]),
        ("product.list_price_tax_inclusive", "含税产品标价", "product", "product", "官网展示的含税标价，不等于实际成交均价。", "instant", "CNY", ["product_family", "product_variant"]),
        ("product.weight_with_battery", "带电池重量", "product", "product", "整机包含电池时的重量。", "instant", "kg", ["product_variant"]),
        ("product.total_joint_motor_dof", "总自由度（关节电机）", "product", "product", "产品配置对应的关节电机总自由度。", "instant", "count", ["product_variant"]),
        ("product.endurance", "续航时间", "product", "product", "公司产品参数页披露的标称续航时间。", "instant", "hour", ["product_variant"]),
    )
    metrics = {
        code: add_metric(
            connection,
            code,
            name,
            category,
            owner_scope,
            definition,
            period_type,
            unit,
            allowed_dimensions=dimensions,
        )
        for code, name, category, owner_scope, definition, period_type, unit, dimensions
        in metric_specs
    }

    dimension_types = {}
    for code, name in (
        ("product_family", "产品族"),
        ("product_variant", "产品变体"),
    ):
        cursor = connection.execute(
            """
            INSERT INTO dimension_types (dimension_code, name, applies_to)
            VALUES (?, ?, 'observation')
            """,
            (code, name),
        )
        dimension_types[code] = int(cursor.lastrowid)
    dimensions = {
        "quadruped": add_dimension(
            connection, dimension_types["product_family"], "quadruped_robot", "四足机器人"
        ),
        "humanoid": add_dimension(
            connection, dimension_types["product_family"], "humanoid_robot", "人形机器人"
        ),
        "g1": add_dimension(
            connection, dimension_types["product_variant"], "g1", "G1"
        ),
        "g1_edu": add_dimension(
            connection, dimension_types["product_variant"], "g1_edu", "G1 EDU"
        ),
    }

    financial_data = {
        "2023": {
            "cn_gaap.total_assets": "39127.15",
            "cn_gaap.equity_attributable_to_parent": "29904.49",
            "cn_gaap.debt_to_asset_ratio_consolidated": "23.57",
            "cn_gaap.revenue": "15913.44",
            "operating.main_business_gross_margin": "44.22",
            "cn_gaap.net_profit": "-1114.51",
            "cn_gaap.net_profit_attributable_to_parent": "-1114.51",
            "cn_gaap.adjusted_net_profit_attributable_to_parent": "-1801.91",
            "cn_gaap.operating_cash_flow_net": "494.25",
            "operating.rd_expense_to_revenue": "31.39",
        },
        "2024": {
            "cn_gaap.total_assets": "152786.94",
            "cn_gaap.equity_attributable_to_parent": "128054.90",
            "cn_gaap.debt_to_asset_ratio_consolidated": "16.19",
            "cn_gaap.revenue": "39277.07",
            "operating.main_business_gross_margin": "56.74",
            "cn_gaap.net_profit": "9547.47",
            "cn_gaap.net_profit_attributable_to_parent": "9547.47",
            "cn_gaap.adjusted_net_profit_attributable_to_parent": "7847.65",
            "cn_gaap.operating_cash_flow_net": "19239.13",
            "operating.rd_expense_to_revenue": "17.83",
        },
        "2025": {
            "cn_gaap.total_assets": "320853.83",
            "cn_gaap.equity_attributable_to_parent": "260465.85",
            "cn_gaap.debt_to_asset_ratio_consolidated": "18.82",
            "cn_gaap.revenue": "169926.93",
            "operating.main_business_gross_margin": "60.13",
            "cn_gaap.net_profit": "27821.05",
            "cn_gaap.net_profit_attributable_to_parent": "27821.05",
            "cn_gaap.adjusted_net_profit_attributable_to_parent": "59075.28",
            "cn_gaap.operating_cash_flow_net": "66998.18",
            "operating.rd_expense_to_revenue": "8.53",
        },
    }
    financial_observations: dict[str, int] = {}
    instant_metrics = {
        "cn_gaap.total_assets",
        "cn_gaap.equity_attributable_to_parent",
        "cn_gaap.debt_to_asset_ratio_consolidated",
    }
    percent_metrics = {
        "cn_gaap.debt_to_asset_ratio_consolidated",
        "operating.main_business_gross_margin",
        "operating.rd_expense_to_revenue",
    }
    for year, values in financial_data.items():
        for metric_code, value in values.items():
            is_percent = metric_code in percent_metrics
            item_id = add_observation(
                connection,
                root_entity_id,
                metrics[metric_code],
                metric_code,
                raw_value_text=(f"{value}%" if is_percent else f"{value} 万元"),
                decimal_value_text=value,
                unit_code="percent" if is_percent else "CNY_10K",
                currency_code=None if is_percent else "CNY",
                period_start=None if metric_code in instant_metrics else f"{year}-01-01",
                period_end=None if metric_code in instant_metrics else f"{year}-12-31",
                as_of_date=f"{year}-12-31" if metric_code in instant_metrics else None,
                fiscal_period_label=f"FY{year}",
                consolidation_scope="consolidated",
            )
            financial_observations[f"{year}:{metric_code}"] = item_id
            add_evidence(
                connection,
                item_id,
                documents["sponsor"],
                "table",
                "physical PDF pp.7-8 (printed 3-1-3-6 to 3-1-3-7), 主要财务数据及指标",
                f"{year}年度/年末：{metric_code} = {value}{'%' if is_percent else '万元'}。",
            )

    quadruped_item = add_observation(
        connection,
        root_entity_id,
        metrics["operating.quadruped_robot_sales_volume"],
        "operations.shipments",
        raw_value_text="报告期内四足机器人销量合计超33,000台",
        comparison_operator="gt",
        decimal_value_text="33000",
        unit_code="unit",
        period_start="2023-01-01",
        period_end="2025-12-31",
        fiscal_period_label="报告期（2023-2025）",
        consolidation_scope="company_disclosed_product_scope",
        notes="保荐书的报告期为2023年至2025年。",
    )
    add_observation_dimension(connection, quadruped_item, dimensions["quadruped"])
    add_evidence(
        connection,
        quadruped_item,
        documents["sponsor"],
        "page",
        "physical PDF p.5 (printed 3-1-3-4), 第一节/三",
        "报告期内，公司四足机器人销量合计超33,000台。",
    )

    humanoid_item = add_observation(
        connection,
        root_entity_id,
        metrics["operating.humanoid_robot_shipments"],
        "operations.shipments",
        raw_value_text="2025年度人形机器人出货量已超5,500台（纯人形，不含轮式双臂机器人）",
        comparison_operator="gt",
        decimal_value_text="5500",
        unit_code="unit",
        period_start="2025-01-01",
        period_end="2025-12-31",
        fiscal_period_label="FY2025",
        consolidation_scope="company_disclosed_product_scope",
        notes="明确排除轮式双臂机器人。",
    )
    add_observation_dimension(connection, humanoid_item, dimensions["humanoid"])
    add_evidence(
        connection,
        humanoid_item,
        documents["sponsor"],
        "page",
        "physical PDF p.5 (printed 3-1-3-4), 第一节/三",
        "2025年度纯人形机器人出货量已超5,500台，不含轮式双臂机器人。",
    )

    product_specs = (
        (
            "product.list_price_tax_inclusive",
            "售价（含税）¥8.5万元",
            "eq",
            "85000",
            None,
            None,
            "CNY",
            "CNY",
            dimensions["g1"],
            "产品参数/G1与G1 EDU/售价（含税）",
            "G1含税标价为8.5万元；页面顶部表述为8.5万元起。",
        ),
        (
            "product.weight_with_battery",
            "带电池重量约35kg",
            "approx",
            "35",
            None,
            None,
            "kg",
            None,
            dimensions["g1"],
            "产品参数/G1与G1 EDU/带电池重量",
            "G1带电池重量约35kg。",
        ),
        (
            "product.total_joint_motor_dof",
            "总自由度（关节电机）23",
            "eq",
            "23",
            None,
            None,
            "count",
            None,
            dimensions["g1"],
            "产品参数/G1与G1 EDU/总自由度",
            "G1总自由度（关节电机）为23。",
        ),
        (
            "product.total_joint_motor_dof",
            "总自由度（关节电机）23-43",
            "range",
            None,
            "23",
            "43",
            "count",
            None,
            dimensions["g1_edu"],
            "产品参数/G1与G1 EDU/总自由度",
            "G1 EDU总自由度（关节电机）为23-43。",
        ),
        (
            "product.endurance",
            "续航时间约2h",
            "approx",
            "2",
            None,
            None,
            "hour",
            None,
            dimensions["g1"],
            "产品参数/G1与G1 EDU/续航时间",
            "G1续航时间约2小时。",
        ),
    )
    for (
        metric_code,
        raw,
        operator,
        value,
        low,
        high,
        unit,
        currency,
        variant_dimension,
        locator,
        excerpt,
    ) in product_specs:
        item_id = add_observation(
            connection,
            root_entity_id,
            metrics[metric_code],
            "product.g1",
            raw_value_text=raw,
            comparison_operator=operator,
            decimal_value_text=value,
            decimal_low_text=low,
            decimal_high_text=high,
            unit_code=unit,
            currency_code=currency,
            as_of_date=ACCESSED_AT,
            consolidation_scope="G1 product page",
            known_from=ACCESSED_AT,
        )
        add_observation_dimension(connection, item_id, dimensions["humanoid"])
        add_observation_dimension(connection, item_id, variant_dimension)
        add_evidence(
            connection,
            item_id,
            documents["g1"],
            "webpage_section",
            locator,
            excerpt,
        )

    issue_item = add_item(
        connection,
        "quality_issue",
        "standardized_fact",
        "data_quality.financials",
        review_status="needs_review",
        confidence_level="high",
        known_from=KNOWN_FROM_SPONSOR,
        created_by_type="system",
    )
    connection.execute(
        """
        INSERT INTO quality_issues (
            item_id, issue_type, severity, title, description, issue_status
        ) VALUES (
            ?, 'conflicting_evidence', 'medium',
            '2024年财务数值在两版申报材料间存在差异',
            '2026-03-20招股书与2026-05-25上市保荐书对2024年营业收入、净利润等数值存在差异。当前首批观测采用日期更晚的上市保荐书，后续需结合更新后的审计报告确认差异性质。',
            'open'
        )
        """,
        (issue_item,),
    )
    add_evidence(
        connection,
        issue_item,
        documents["prospectus"],
        "table",
        "physical PDF p.28 (printed p.27), 主要财务数据和财务指标",
        "招股书披露2024年营业收入39,237.06万元。",
        evidence_role="context",
    )
    add_evidence(
        connection,
        issue_item,
        documents["sponsor"],
        "table",
        "physical PDF p.8 (printed 3-1-3-7), 主要财务数据及指标",
        "上市保荐书披露2024年营业收入39,277.07万元。",
        evidence_role="context",
    )
    connection.execute(
        """
        INSERT INTO item_relations (
            source_item_id, target_item_id, relation_type,
            relation_nature, notes
        ) VALUES (?, ?, 'context_for', 'system_defined', '提示同期间多版本数值')
        """,
        (issue_item, financial_observations["2024:cn_gaap.revenue"]),
    )
    return financial_observations


def seed_questions_and_coverage(
    connection: sqlite3.Connection,
    documents: dict[str, int],
) -> None:
    question_item = add_item(
        connection,
        "research_question",
        "question",
        "market.listing",
        review_status="unreviewed",
        confidence_level="unknown",
        known_from=ACCESSED_AT,
        created_by_type="human",
    )
    connection.execute(
        """
        INSERT INTO research_questions (
            item_id, question, priority, question_status, close_condition
        ) VALUES (
            ?,
            '宇树何时完成发行并正式挂牌，最终证券代码、发行价与发行股数是什么？',
            'high', 'open',
            '取得上交所或发行人正式发行结果及上市公告；注册批复本身不视为已发行或已上市。'
        )
        """,
        (question_item,),
    )
    add_evidence(
        connection,
        question_item,
        documents["csrc"],
        "webpage_section",
        "证监许可〔2026〕1612号/第一至第四项",
        "批复同意注册并规定后续发行义务，未提供最终证券代码或上市日期。",
        evidence_role="context",
    )

    cursor = connection.execute(
        """
        INSERT INTO coverage_scopes (name, start_date, end_date, status)
        VALUES (?, '2023-01-01', ?, 'active')
        """,
        (SEED_NAME, ACCESSED_AT),
    )
    scope_id = int(cursor.lastrowid)
    requirements = [
        ("document_type", "prospectus", "covered", "2026-03-20"),
        ("document_type", "listing_sponsor_letter", "covered", "2026-05-25"),
        ("document_type", "csrc_registration_approval", "covered", "2026-07-02"),
        ("document_type", "official_company_webpage", "covered", ACCESSED_AT),
        ("document_type", "g1_product_webpage", "covered", ACCESSED_AT),
        ("topic", "company.identity", "covered", ACCESSED_AT),
        ("topic", "company.legal_history", "covered", ACCESSED_AT),
        ("topic", "market.listing_status", "partially_covered", ACCESSED_AT),
        ("topic", "financials.2023_2025", "partially_covered", "2025-12-31"),
        ("topic", "operations.shipments", "partially_covered", "2025-12-31"),
        ("topic", "product.g1", "partially_covered", ACCESSED_AT),
    ]
    for requirement_type, key, status, current_through in requirements:
        cursor = connection.execute(
            """
            INSERT INTO coverage_requirements (
                coverage_scope_id, requirement_type, requirement_key,
                required_frequency, materiality, requires_human_review
            ) VALUES (?, ?, ?, 'initial_baseline', 'high', 1)
            """,
            (scope_id, requirement_type, key),
        )
        connection.execute(
            """
            INSERT INTO coverage_results (
                coverage_requirement_id, coverage_status,
                current_through, details
            ) VALUES (?, ?, ?, 'Unitree Phase A first reviewed batch')
            """,
            (int(cursor.lastrowid), status, current_through),
        )


def seed() -> None:
    config = load_archive_config()
    company_root = config.company_root(COMPANY_FOLDER)
    database_path = company_root / "company.sqlite"
    verify_source_files(company_root)
    connection = connect(database_path)
    try:
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        if version not in (3, 4):
            raise RuntimeError(
                f"Unitree company database must be V3 or V4, found V{version}"
            )
        existing_scope = connection.execute(
            "SELECT coverage_scope_id FROM coverage_scopes WHERE name = ?",
            (SEED_NAME,),
        ).fetchone()
        if existing_scope is not None:
            validate_connection(connection, company_root)
            print(f"already seeded: {SEED_NAME}")
            return
        unexpected_rows = connection.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM documents)
              + (SELECT COUNT(*) FROM observations)
              + (SELECT COUNT(*) FROM entity_events)
              + (SELECT COUNT(*) FROM metric_definitions)
            """
        ).fetchone()[0]
        if unexpected_rows:
            raise RuntimeError(
                "Refusing to seed a non-empty Unitree V3/V4 database without its seed marker"
            )

        connection.execute("BEGIN IMMEDIATE")
        root = connection.execute(
            """
            SELECT entity_id FROM entities
            WHERE is_research_subject = 1 AND canonical_label = '宇树科技'
            """
        ).fetchone()
        if root is None:
            raise RuntimeError("Unitree research subject entity is missing")
        root_entity_id = int(root[0])
        publisher_entities = {
            "wang": add_entity(connection, "person", "王兴兴"),
            "sse": add_entity(connection, "regulator", "上海证券交易所"),
            "csrc": add_entity(connection, "regulator", "中国证券监督管理委员会"),
            "citic": add_entity(connection, "organization", "中信证券股份有限公司"),
        }
        documents = seed_documents(
            connection, company_root, root_entity_id, publisher_entities
        )
        seed_identity(
            connection,
            root_entity_id,
            publisher_entities["wang"],
            documents,
        )
        seed_metrics_and_observations(connection, root_entity_id, documents)
        seed_questions_and_coverage(connection, documents)
        connection.commit()
        validate_connection(connection, company_root)
        counts = connection.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM entities),
                (SELECT COUNT(*) FROM documents),
                (SELECT COUNT(*) FROM evidence_links),
                (SELECT COUNT(*) FROM metric_definitions),
                (SELECT COUNT(*) FROM observations)
            """
        ).fetchone()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
    print(
        "seeded: "
        f"entities={counts[0]}, documents={counts[1]}, evidence_links={counts[2]}, "
        f"metrics={counts[3]}, observations={counts[4]}"
    )


if __name__ == "__main__":
    seed()
