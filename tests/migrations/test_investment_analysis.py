"""Offline migration tests; all databases and copied files live in temporary dirs."""
import json
from contextlib import closing
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts/migrations'))
from preserve_investment_analysis import backup_database, digest, preserve
from preview_investment_analysis import preview


class MigrationTests(unittest.TestCase):
    def test_backup_includes_committed_wal_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, target = root / 'source.sqlite', root / 'copy.sqlite'
            database = sqlite3.connect(source)
            try:
                database.execute('PRAGMA journal_mode=WAL')
                database.executescript('CREATE TABLE sample(value TEXT); PRAGMA user_version=4;')
                database.execute("INSERT INTO sample VALUES ('retained')")
                database.commit()
                result = backup_database(source, target)
                self.assertEqual(result['table_counts']['sample'], 1)
                self.assertEqual(result['schema_version'], 4)
                self.assertEqual(result['foreign_key_errors'], 0)
                with self.assertRaises(FileExistsError):
                    backup_database(source, target)
            finally:
                database.close()

    def test_preserve_final_files_without_git_and_exclude_history(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            repo, archive = root / 'repo', root / 'archive'
            repo.mkdir()
            (repo / 'README.md').write_text('final working file')
            unitree = archive / '宇树科技'
            unitree.mkdir(parents=True)
            with closing(sqlite3.connect(unitree / 'company.sqlite')) as c:
                c.execute('CREATE TABLE document_files(relative_path TEXT, sha256 TEXT, byte_size INTEGER)')
            result = preserve(repo, archive, root / 'copy')
            self.assertEqual(result['status'], 'complete')
            self.assertEqual(result['history_policy'], 'final_files_only')
            self.assertEqual((root / 'copy/repository/README.md').read_text(), 'final working file')
            self.assertFalse(list((root / 'copy').rglob('*.bundle')))
            (repo / '.git').mkdir()
            (repo / '.git/config').write_text('old repository metadata')
            preserve(repo, archive, root / 'second-copy')
            self.assertFalse((root / 'second-copy/repository/.git').exists())

    def test_preserve_evidence_with_optional_size_and_required_hash(self):
        cases = [(None, True, True), (8, True, True),
                 (None, False, False), (0, True, False)]
        for size, correct_hash, accepted in cases:
            with self.subTest(size=size, correct_hash=correct_hash), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                repo, archive = root / 'repo', root / 'archive'
                repo.mkdir()
                unitree = archive / '宇树科技'
                unitree.mkdir(parents=True)
                evidence = unitree / 'evidence.txt'
                evidence.write_bytes(b'evidence')
                sha = digest(evidence) if correct_hash else '0' * 64
                with closing(sqlite3.connect(unitree / 'company.sqlite')) as c:
                    c.execute('CREATE TABLE document_files(relative_path TEXT, sha256 TEXT, byte_size INTEGER)')
                    c.execute('INSERT INTO document_files VALUES (?, ?, ?)',
                              ('evidence.txt', sha, size))
                    c.commit()
                destination = root / 'copy'
                if accepted:
                    result = preserve(repo, archive, destination)
                    self.assertEqual(result['status'], 'complete')
                    copied = destination / 'archive/宇树科技/evidence.txt'
                    self.assertEqual(copied.read_bytes(), evidence.read_bytes())
                    entry = next(item for item in result['files']
                                 if item['target'] == 'archive/宇树科技/evidence.txt')
                    self.assertEqual(entry['size'], 8)
                    self.assertEqual(entry['sha256'], digest(evidence))
                else:
                    with self.assertRaisesRegex(RuntimeError, 'Registered evidence checksum mismatch'):
                        preserve(repo, archive, destination)
                    report = json.loads((destination / 'preservation.json').read_text())
                    self.assertEqual(report['status'], 'failed')

    def make_fixture(self, root):
        archive, target = root / 'archive', root / 'target'
        company = archive / '测试公司'
        company.mkdir(parents=True)
        target.mkdir()
        (company / 'company.json').write_text(json.dumps({'inc_region': 'US-DE'}))
        with closing(sqlite3.connect(archive / 'catalog.sqlite')) as c:
            c.executescript("CREATE TABLE companies(company_id INTEGER,common_name TEXT,legal_name TEXT,folder_name TEXT); INSERT INTO companies VALUES(100000,'测试公司','测试公司有限公司','测试公司');")
        with closing(sqlite3.connect(company / 'company.sqlite')) as c:
            c.executescript("PRAGMA user_version=2; CREATE TABLE company_names(name TEXT); INSERT INTO company_names VALUES('测试公司有限公司'); CREATE TABLE securities(exchange_mic TEXT,ticker TEXT,status TEXT); INSERT INTO securities VALUES('XHKG','3968','active');")
        mapping = root / 'map.json'
        mapping.write_text(json.dumps({'companies': [{'legacy_company_id': 100000, 'proposed_company_id': 'test-company'}]}))
        return archive, target, mapping

    def add_target(self, root, identifier):
        folder = root / identifier
        folder.mkdir()
        (folder / 'company.json').write_text(json.dumps({
            'schema_version': '0.1', 'company_id': identifier, 'name_en': 'Different Display Name',
            'jurisdiction': 'HK', 'accounting_standard': 'IFRS',
            'securities': [{'exchange': 'HKEX', 'ticker': '03968'}]}))

    def test_preview_preserves_raw_fields_without_guessing_accounting_or_writing_sources(self):
        with tempfile.TemporaryDirectory() as temp:
            archive, target, mapping = self.make_fixture(Path(temp))
            before = {str(path): digest(path) for path in archive.rglob('*') if path.is_file()}
            result = preview(archive, [target], mapping)
            row = result['companies'][0]
            self.assertEqual(row['jurisdiction'], 'US')
            self.assertIsNone(row['accounting_standard'])
            self.assertIn('accounting_standard_missing', row['blockers'])
            self.assertEqual(row['preserved_manifest']['inc_region'], 'US-DE')
            self.assertEqual(row['preserved_securities'][0]['ticker'], '3968')
            self.assertEqual(before, {str(path): digest(path) for path in archive.rglob('*') if path.is_file()})

    def test_preview_matches_exchange_alias_and_zero_padded_ticker(self):
        with tempfile.TemporaryDirectory() as temp:
            archive, target, mapping = self.make_fixture(Path(temp))
            self.add_target(target, 'test-company')
            row = preview(archive, [target], mapping)['companies'][0]
            self.assertEqual(row['action'], 'merge_existing')
            self.assertEqual(row['accounting_standard'], 'IFRS')
            self.assertEqual(row['matches'][0]['reasons'], ['exchange_and_ticker'])

    def test_missing_names_do_not_match_unrelated_company(self):
        for identifier in ['test-company', 'unrelated-company']:
            with self.subTest(identifier=identifier), tempfile.TemporaryDirectory() as temp:
                archive, target, mapping = self.make_fixture(Path(temp))
                with closing(sqlite3.connect(archive / 'catalog.sqlite')) as c:
                    c.execute('UPDATE companies SET legal_name=NULL')
                    c.commit()
                self.add_target(target, identifier)
                path = target / identifier / 'company.json'
                manifest = json.loads(path.read_text())
                manifest['securities'] = []
                path.write_text(json.dumps(manifest))
                row = preview(archive, [target], mapping)['companies'][0]
                self.assertEqual(row['matches'], [])
                self.assertIsNone(row['accounting_standard'])
                if identifier == 'test-company':
                    self.assertEqual(row['action'], 'conflict')
                    self.assertIn('target_id_collision_without_identity_match', row['blockers'])
                else:
                    self.assertEqual(row['action'], 'new_company_pending_metadata')

    def test_ambiguous_matches_and_mapping_collisions_are_not_auto_merged(self):
        with tempfile.TemporaryDirectory() as temp:
            archive, target, mapping = self.make_fixture(Path(temp))
            self.add_target(target, 'test-company')
            self.add_target(target, 'second-company')
            row = preview(archive, [target], mapping)['companies'][0]
            self.assertEqual(row['action'], 'conflict')
            self.assertIn('ambiguous_existing_company', row['blockers'])
            mapping.write_text(json.dumps({'companies': [
                {'legacy_company_id': 100000, 'proposed_company_id': 'duplicate'},
                {'legacy_company_id': 100001, 'proposed_company_id': 'duplicate'}]}))
            with self.assertRaisesRegex(ValueError, 'Duplicate'):
                preview(archive, [target], mapping)


if __name__ == '__main__':
    unittest.main()
