#!/usr/bin/env python3
"""Build one company's SQLite database inside the configured Investment Archive."""

from __future__ import annotations

import argparse
import csv
import json
import sqlite3
from pathlib import Path

from archive_config import load_archive_config


HERE = Path(__file__).resolve().parent


def nullable(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def number(value: str | None) -> float | None:
    value = nullable(value)
    return None if value is None else float(value)


def dimensions(raw: str | None, import_period_label: str) -> str:
    result: dict[str, str] = {}
    if raw:
        for item in raw.split(";"):
            if not item:
                continue
            key, separator, value = item.partition("=")
            if separator:
                result[key.strip()] = value.strip()
            else:
                result.setdefault("unparsed", item.strip())
    if import_period_label not in {"instant", "duration"}:
        result["import_period_label"] = import_period_label
    return json.dumps(result, ensure_ascii=False, sort_keys=True)


def observation_semantics(row: dict[str, str]) -> tuple[str, str]:
    raw = row["period_kind"]
    if raw in {"instant", "duration"}:
        return raw, "actual"
    if raw == "guidance":
        return "duration" if row["period_start"] or row["period_end"] else "instant", "guidance"
    if raw == "target":
        return "duration" if row["period_start"] or row["period_end"] else "instant", "target"
    if raw == "forecast":
        return "duration" if row["period_start"] or row["period_end"] else "instant", "forecast"
    if raw == "annualized_management_statement":
        return "duration", "management_indication"
    if raw == "event":
        return "instant", "event_amount"
    raise ValueError(f"Unsupported import period label: {raw!r}")


def comparison(row: dict[str, str]) -> str:
    if row["value_min"] and row["value_max"]:
        return "range"
    notes = row["notes"]
    if "以上" in notes:
        return "gte"
    if "以下" in notes or "不到" in notes:
        return "lte"
    if any(marker in notes for marker in ("约数", "大概", "左右", "多万吨")):
        return "approx"
    return "eq"


def raw_value_text(row: dict[str, str]) -> str | None:
    if row["value"]:
        return row["value"]
    if row["value_min"] or row["value_max"]:
        return f"{row['value_min']}..{row['value_max']}"
    return None


def import_observations(connection: sqlite3.Connection, observations_csv: Path) -> int:
    count = 0
    with observations_csv.open("r", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            if not row.get("observation_id"):
                continue
            period_kind, value_kind = observation_semantics(row)
            dims = dimensions(row["dimensions"], row["period_kind"])
            connection.execute(
                """
                INSERT INTO observations (
                    observation_id, subject_entity_id, metric_code,
                    period_start, period_end, as_of_date, period_kind, value_kind,
                    comparison_operator, raw_value_text, raw_unit,
                    normalized_value, normalized_low, normalized_high,
                    normalized_unit, currency, consolidation_scope,
                    dimensions_json, provenance_type, review_status, notes
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
                """,
                (
                    row["observation_id"],
                    row["entity_id"],
                    row["metric_id"],
                    nullable(row["period_start"]),
                    nullable(row["period_end"]),
                    nullable(row["as_of_date"]),
                    period_kind,
                    value_kind,
                    comparison(row),
                    raw_value_text(row),
                    nullable(row["unit"]),
                    number(row["value"]),
                    number(row["value_min"]),
                    number(row["value_max"]),
                    nullable(row["unit"]),
                    nullable(row["currency"]),
                    nullable(row["scope"]),
                    dims,
                    row["value_nature"],
                    row["review_status"],
                    nullable(row["notes"]),
                ),
            )
            connection.execute(
                """
                INSERT INTO observation_evidence (
                    observation_id, document_id, source_locator, evidence_role
                ) VALUES (?, ?, ?, 'supports')
                """,
                (
                    row["observation_id"],
                    row["source_id"],
                    nullable(row["source_locator"]),
                ),
            )
            count += 1
    return count


def build(output: Path, seed_sql: Path, observations_csv: Path, force: bool) -> None:
    output = output.resolve()
    for required_input in (seed_sql, observations_csv):
        if not required_input.is_file():
            raise FileNotFoundError(f"Required import file not found: {required_input}")
    if output.exists() and not force:
        raise SystemExit(f"Database already exists: {output}. Use --force to rebuild it.")

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".building")
    if temporary.exists():
        temporary.unlink()

    connection = sqlite3.connect(temporary)
    try:
        connection.executescript((HERE / "schema.sql").read_text(encoding="utf-8"))
        connection.executescript(seed_sql.read_text(encoding="utf-8"))
        imported = import_observations(connection, observations_csv)
        connection.commit()
        foreign_key_issues = connection.execute("PRAGMA foreign_key_check").fetchall()
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if foreign_key_issues:
            raise RuntimeError(f"Foreign key errors: {foreign_key_issues}")
        if integrity != "ok":
            raise RuntimeError(f"Integrity check failed: {integrity}")
    except Exception:
        connection.close()
        if temporary.exists():
            temporary.unlink()
        raise
    else:
        connection.close()
        temporary.replace(output)
        print(f"Built {output}")
        print(f"Imported {imported} observations")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("company_folder", help="For example: 兖矿能源")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--force", action="store_true")
    arguments = parser.parse_args()
    config = load_archive_config()
    company_root = config.company_root(arguments.company_folder)
    output = arguments.output or config.company_database_path(arguments.company_folder)
    build(
        output=output,
        seed_sql=company_root / "_research" / "imports" / "seed.sql",
        observations_csv=company_root / "_research" / "imports" / "observations.csv",
        force=arguments.force,
    )


if __name__ == "__main__":
    main()
