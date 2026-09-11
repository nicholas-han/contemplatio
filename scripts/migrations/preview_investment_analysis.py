#!/usr/bin/env python3
"""Read-only V2/V4 identity preview; never creates or opens a writable company DB."""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
from pathlib import Path

from preserve_investment_analysis import readonly, write_json


EXCHANGES = {'XHKG': 'HKEX', 'HKEX': 'HKEX', 'XSHG': 'SSE', 'SSE': 'SSE',
             'XSHE': 'SZSE', 'SZSE': 'SZSE', 'XNAS': 'NASDAQ', 'NASDAQ': 'NASDAQ',
             'XNYS': 'NYSE', 'NYSE': 'NYSE'}


def security_key(security: dict, old: bool = False) -> tuple[str, str] | None:
    exchange = security.get('exchange_mic' if old else 'exchange')
    ticker = security.get('ticker')
    if not exchange or not ticker:
        return None
    exchange = EXCHANGES.get(exchange, exchange)
    ticker = str(ticker).upper()
    if exchange == 'HKEX' and ticker.isdigit():
        ticker = ticker.zfill(5)
    return exchange, ticker


def scan_targets(roots: list[Path]) -> tuple[list[dict], list[dict]]:
    targets, ignored = [], []
    seen = set()
    for root in roots:
        if not root.is_dir():
            ignored.append({'path': str(root), 'reason': 'root_missing'})
            continue
        for path in sorted(root.glob('*/company.json')):
            if path.resolve() in seen:
                continue
            seen.add(path.resolve())
            value = json.loads(path.read_text())
            if value.get('schema_version') != '0.1' or not isinstance(value.get('company_id'), str):
                ignored.append({'path': str(path), 'reason': 'not_current_manifest', 'company_id': value.get('company_id')})
                continue
            targets.append({'path': str(path), 'manifest': value})
    return targets, ignored


def preview(archive: Path, target_roots: list[Path], mapping_path: Path) -> dict:
    archive = archive.resolve()
    mapping = json.loads(mapping_path.read_text())['companies']
    ids = [item['proposed_company_id'] for item in mapping]
    if len(ids) != len(set(ids)) or any(not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', value) for value in ids):
        raise ValueError('Duplicate or unsafe target company IDs')
    by_id = {item['legacy_company_id']: item for item in mapping}
    if len(by_id) != len(mapping):
        raise ValueError('Duplicate legacy company IDs')
    targets, ignored = scan_targets([root.resolve() for root in target_roots])
    catalog = readonly(archive / 'catalog.sqlite')
    catalog.row_factory = sqlite3.Row
    try:
        rows = [dict(row) for row in catalog.execute('SELECT * FROM companies ORDER BY company_id')]
    finally:
        catalog.close()
    if set(by_id) != {row['company_id'] for row in rows}:
        raise ValueError('Mapping must cover exactly the source catalog IDs')
    results = []
    for company in rows:
        folder = (archive / company['folder_name']).resolve()
        if folder.parent != archive:
            raise ValueError('Unsafe company directory')
        manifest = json.loads((folder / 'company.json').read_text())
        database = readonly(folder / 'company.sqlite')
        database.row_factory = sqlite3.Row
        try:
            version = database.execute('PRAGMA user_version').fetchone()[0]
            if version not in (2, 4):
                raise ValueError(f'Unsupported source schema version: {version}')
            names = [dict(row) for row in database.execute('SELECT * FROM company_names')]
            securities = [dict(row) for row in database.execute('SELECT * FROM securities')]
            research_counts = {}
            if version == 4:
                for table in ['observations', 'evidence_links', 'document_files', 'quality_issues', 'research_questions']:
                    research_counts[table] = database.execute(f'SELECT count(*) FROM {table}').fetchone()[0]
        finally:
            database.close()
        name_values = {name for name in [company['common_name'], company['legal_name'],
                                         *[row['name'] for row in names]]
                       if isinstance(name, str) and name.strip()}
        old_keys = {key for row in securities if row.get('status') == 'active' and (key := security_key(row, old=True))}
        matches = []
        for target in targets:
            current = target['manifest']
            reasons = []
            current_names = {name for name in [current.get('name_zh'), current.get('name_en')]
                             if isinstance(name, str) and name.strip()}
            if current_names & name_values:
                reasons.append('exact_name')
            current_keys = {key for row in current.get('securities', []) if (key := security_key(row))}
            if old_keys & current_keys:
                reasons.append('exchange_and_ticker')
            if reasons:
                matches.append({'target': target, 'reasons': reasons})
        entry = by_id[company['company_id']]
        proposed = entry['proposed_company_id']
        blockers = []
        matched = matches[0]['target']['manifest'] if len(matches) == 1 else None
        action = 'merge_existing' if matched else 'new_company_pending_metadata'
        if len(matches) > 1:
            blockers.append('ambiguous_existing_company')
            action = 'conflict'
        if matched and matched['company_id'] != proposed:
            blockers.append('proposed_id_differs_from_existing')
            action = 'conflict'
        if not matched and any(target['manifest']['company_id'] == proposed for target in targets):
            blockers.append('target_id_collision_without_identity_match')
            action = 'conflict'
        # Source registration country is a proposal with retained provenance; no report basis inference.
        region = manifest.get('inc_region') or manifest.get('incorporation', {}).get('jurisdiction')
        jurisdiction = matched.get('jurisdiction') if matched else (region.split('-')[0] if isinstance(region, str) else None)
        accounting = matched.get('accounting_standard') if matched else None
        if not jurisdiction:
            blockers.append('jurisdiction_missing')
        if not accounting:
            blockers.append('accounting_standard_missing')
        unmapped = ['historical_and_multilingual_names', 'security_class_currency_status', 'gics_classification']
        if version == 4:
            unmapped += ['source_candidates_and_conflicts', 'comparison_operators_and_decimal_values',
                         'entity_history', 'research_questions_and_coverage']
        results.append({'legacy_company_id': company['company_id'], 'common_name': company['common_name'],
                        'proposed_company_id': proposed, 'action': action, 'source_schema_version': version,
                        'jurisdiction': jurisdiction, 'jurisdiction_source': 'existing_manifest' if matched else ('legacy_manifest' if region else None),
                        'accounting_standard': accounting, 'blockers': blockers,
                        'matches': [{'path': item['target']['path'], 'company_id': item['target']['manifest']['company_id'], 'reasons': item['reasons']} for item in matches],
                        'preserved_catalog_row': company, 'preserved_manifest': manifest,
                        'preserved_names': names, 'preserved_securities': securities,
                        'research_counts': research_counts, 'not_yet_mapped_to_current_schema': unmapped})
    return {'mode': 'read_only_preview', 'source_archive': str(archive), 'companies': results,
            'ignored_target_manifests': ignored,
            'summary': {'companies': len(results), 'merge_existing': sum(row['action'] == 'merge_existing' for row in results),
                        'new_company_pending_metadata': sum(row['action'] == 'new_company_pending_metadata' for row in results),
                        'conflicts': sum(row['action'] == 'conflict' for row in results),
                        'missing_accounting_standard': sum('accounting_standard_missing' in row['blockers'] for row in results),
                        'missing_jurisdiction': sum('jurisdiction_missing' in row['blockers'] for row in results)}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', required=True, type=Path)
    parser.add_argument('--target-root', action='append', required=True, type=Path)
    parser.add_argument('--mapping', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError(args.output)
    result = preview(args.archive, args.target_root, args.mapping)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    write_json(args.output, result)
    print(json.dumps(result['summary'], ensure_ascii=False, indent=2))
