#!/usr/bin/env python3
"""Preserve the old repo and selected archive assets without writing to sources.

This is an offline migration utility, not part of the application runtime.
Unselected archive files receive metadata inventory only, not a backup claim.
Only final working files are retained; Git history is not exported.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def readonly(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
    connection.execute('PRAGMA query_only=ON')
    return connection


def table_counts(connection: sqlite3.Connection) -> dict[str, int]:
    tables = [row[0] for row in connection.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    return {name: connection.execute('SELECT count(*) FROM "' + name.replace('"', '""') + '"').fetchone()[0]
            for name in tables}


def copy_verified(source: Path, target: Path) -> dict:
    target.parent.mkdir(parents=True, exist_ok=True)
    before = source.stat()
    copied_hash = hashlib.sha256()
    with source.open('rb') as incoming, target.open('xb') as outgoing:
        for chunk in iter(lambda: incoming.read(1024 * 1024), b''):
            outgoing.write(chunk)
            copied_hash.update(chunk)
    after = source.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise RuntimeError(f'Source changed while copying: {source}')
    expected = copied_hash.hexdigest()
    if digest(target) != expected or digest(source) != expected:
        raise RuntimeError(f'Copy verification failed: {source}')
    return {'method': 'byte_copy', 'sha256': expected, 'size': target.stat().st_size}


def backup_database(source: Path, target: Path) -> dict:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        raise FileExistsError(target)
    incoming = readonly(source)
    outgoing = sqlite3.connect(target)
    try:
        incoming.execute('BEGIN')
        version = incoming.execute('PRAGMA user_version').fetchone()[0]
        counts = table_counts(incoming)
        incoming.backup(outgoing)
        integrity = [row[0] for row in outgoing.execute('PRAGMA integrity_check')]
        if integrity != ['ok'] or counts != table_counts(outgoing):
            raise RuntimeError(f'Database backup verification failed: {source}')
        if outgoing.execute('PRAGMA user_version').fetchone()[0] != version:
            raise RuntimeError(f'Database version differs: {source}')
        foreign_key_errors = len(outgoing.execute('PRAGMA foreign_key_check').fetchall())
    finally:
        outgoing.close()
        incoming.close()
    return {'method': 'sqlite_backup_api', 'sha256': digest(target),
            'size': target.stat().st_size, 'schema_version': version,
            'table_counts': counts, 'integrity_check': 'ok',
            'foreign_key_errors': foreign_key_errors}


def preserve(repo: Path, archive: Path, destination: Path) -> dict:
    repo, archive, destination = repo.resolve(), archive.resolve(), destination.resolve()
    if not repo.is_dir() or not archive.is_dir():
        raise FileNotFoundError('Source repository and archive must exist')
    if destination.is_relative_to(repo) or destination.is_relative_to(archive):
        raise ValueError('Destination must be outside both sources')
    destination.mkdir(parents=True, exist_ok=False)
    report = {'status': 'in_progress', 'scope': 'repo_and_databases_and_unitree_evidence',
              'created_at': datetime.now(timezone.utc).isoformat(),
              'source_repo': str(repo), 'source_archive': str(archive), 'files': []}
    write_json(destination / 'preservation.json', report)
    try:
        report['history_policy'] = 'final_files_only'
        for source in sorted(repo.rglob('*')):
            relative = source.relative_to(repo)
            if any(part in {'.git', '__pycache__'} for part in relative.parts) or source.name == '.DS_Store':
                continue
            if source.is_symlink():
                raise ValueError(f'Repository symlink requires explicit handling: {source}')
            if source.is_file():
                target = destination / 'repository' / relative
                report['files'].append({'source': str(source), 'target': str(target.relative_to(destination)),
                                        **copy_verified(source, target)})
        inventory = []
        sources = []
        for source in sorted(archive.rglob('*')):
            if source.is_symlink():
                raise ValueError(f'Archive symlink requires explicit handling: {source}')
            if source.is_file():
                stat = source.stat()
                relative = source.relative_to(archive)
                inventory.append({'path': relative.as_posix(), 'size': stat.st_size,
                                  'mtime_ns': stat.st_mtime_ns, 'status': 'inventory_only'})
                sources.append(source)
        write_json(destination / 'archive-inventory.json', inventory)
        # Select registered Unitree evidence only; reject traversal and check retained hashes.
        unitree = archive / '宇树科技'
        connection = readonly(unitree / 'company.sqlite')
        try:
            evidence = list(connection.execute('SELECT relative_path, sha256, byte_size FROM document_files'))
        finally:
            connection.close()
        evidence_paths = {}
        for relative, sha, size in evidence:
            path = (unitree / relative).resolve()
            if not path.is_relative_to(unitree) or not path.is_file():
                raise ValueError(f'Unsafe or missing registered evidence: {relative}')
            evidence_paths[path] = (sha, size)
        for index, source in enumerate(sources):
            relative = source.relative_to(archive)
            database = source.suffix in {'.sqlite', '.sqlite3', '.db'}
            selected = database or source.name == 'company.json' or source in evidence_paths or relative.as_posix() == '_GICS_by_MSCI/gics_structure.json'
            if not selected:
                continue
            target = destination / 'archive' / relative
            metadata = backup_database(source, target) if database else copy_verified(source, target)
            if source in evidence_paths:
                sha, size = evidence_paths[source]
                if metadata['sha256'] != sha or metadata['size'] != size:
                    raise RuntimeError(f'Registered evidence checksum mismatch: {source}')
            report['files'].append({'source': str(source), 'target': str(target.relative_to(destination)), **metadata})
            inventory[index]['status'] = 'backed_up'
            print(f'Preserved {relative}', flush=True)
        write_json(destination / 'archive-inventory.json', inventory)
        report.update(status='complete', archive_file_count=len(inventory),
                      archive_logical_bytes=sum(item['size'] for item in inventory),
                      inventory_only_count=sum(item['status'] == 'inventory_only' for item in inventory),
                      backed_up_file_count=len(report['files']),
                      backed_up_bytes=sum(item['size'] for item in report['files']))
        write_json(destination / 'preservation.json', report)
        return report
    except Exception as error:
        report.update(status='failed', error=str(error))
        write_json(destination / 'preservation.json', report)
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True, type=Path)
    parser.add_argument('--archive', required=True, type=Path)
    parser.add_argument('--destination', required=True, type=Path)
    args = parser.parse_args()
    result = preserve(args.repo, args.archive, args.destination)
    print(json.dumps({key: value for key, value in result.items() if key != 'files'}, ensure_ascii=False, indent=2))
