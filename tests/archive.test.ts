import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { Context } from 'cordis'
import { EquityArchive } from '../src/archive/archive-service.js'
import { migrateDatabase, migrations } from '../src/archive/migrations.js'
import { companyManifestSchema, type CompanyManifest } from '../src/domain/company.js'
import { applyMetricPack } from '../src/metric-packs/apply.js'
import { coalPack } from '../src/metric-packs/coal/index.js'
import { financialCommonPack } from '../src/metric-packs/financial-common/index.js'
import * as archivePlugin from '../src/plugins/archive.js'
import * as modelPlugin from '../src/plugins/model-engine.js'
import { EquityDataEngine } from '../src/data/data-engine.js'
import { EquityModelEngine, runCoalScenario } from '../src/model-engine/service.js'
import { runBankPbRoe, runInsurancePEv, runSotp } from '../src/model-engine/service.js'
import { createEquityResearchTools } from '../src/tools/research-tools.js'
import { importManagementCsvText, parseManagementCsv } from '../src/import/management.js'
import { importCapTableCsvText, parseCapTableCsv } from '../src/import/cap-table.js'
import { parseEstimatesCsv } from '../src/import/estimates.js'
import { importFactsCsvText, parseFactsCsv } from '../src/import/facts.js'
import { applyLegacyImport, legacyManifest, scanLegacyArchive, stageLegacyObservations } from '../src/import/legacy.js'
import { researchToolDefinitions } from '../src/tools/schema.js'
import { EquityWebServer } from '../src/web/server.js'

const manifest: CompanyManifest = {
  schema_version: '0.1',
  company_id: 'yankuang-energy',
  name_zh: '兖矿能源集团股份有限公司',
  name_en: 'Yankuang Energy Group Company Limited',
  jurisdiction: 'CN',
  accounting_standard: 'CAS',
  primary_industry: 'coal',
  securities: [{ exchange: 'SSE', ticker: '600188', security_type: 'common_equity' }],
}

async function createArchive(): Promise<{ archive: EquityArchive; root: string }> {
  const root = await mkdtemp(join(tmpdir(), 'conte-archive-'))
  const archive = new EquityArchive({ root })
  await archive.initialize()
  return { archive, root }
}

test('manifest validation rejects unsafe company identifiers and requires a name', () => {
  assert.equal(companyManifestSchema.safeParse({ ...manifest, company_id: '../escape' }).success, false)
  assert.equal(companyManifestSchema.safeParse({ ...manifest, name_zh: undefined, name_en: undefined }).success, false)
})

test('archive plugin provides the shared Cordis service', async () => {
  const root = await mkdtemp(join(tmpdir(), 'conte-cordis-'))
  const ctx = new Context()
  await archivePlugin.apply(ctx, { root })
  assert.ok(ctx.reflect.get('equityArchive') instanceof EquityArchive)
})

test('model plugin provides high-level research tools', async () => {
  const root = await mkdtemp(join(tmpdir(), 'conte-tools-'))
  const ctx = new Context()
  await archivePlugin.apply(ctx, { root })
  modelPlugin.apply(ctx, {})
  assert.equal(typeof ctx.reflect.get('equityResearchTools')?.getEstimates, 'function')
  assert.ok((ctx.reflect.get('equityResearchToolDefinitions') as typeof researchToolDefinitions).some((tool) => tool.name === 'runSotp'))
})

test('model plugin registers object-shaped tools with an available Harness registry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'conte-harness-tools-'))
  const ctx = new Context()
  await archivePlugin.apply(ctx, { root })
  await ctx.reflect.get('equityArchive').createCompany(manifest)
  const registered: Array<{ name: string; parameters: Record<string, unknown>; execute(args: unknown, exec: unknown): Promise<unknown> }> = []
  ;(ctx as Context & { tools?: unknown }).tools = {
    register(definition: typeof registered[number]) { registered.push(definition); return () => {} },
  }
  modelPlugin.apply(ctx, {})
  assert.equal(registered.length, researchToolDefinitions.length)
  assert.ok(registered.some((tool) => tool.name === 'saveScenario'))
  const getCompany = registered.find((tool) => tool.name === 'getCompany')!
  const company = await getCompany.execute({ companyId: manifest.company_id }, {}) as { company_id: string }
  assert.equal(company.company_id, manifest.company_id)
  assert.equal(Object.hasOwn(getCompany.parameters, '$schema'), false)
  assert.equal(JSON.stringify(getCompany.parameters).includes('pattern'), false)
})

test('model plugin remains active without optional services and disposes Harness registrations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'conte-optional-model-'))
  const ctx = new Context()
  await archivePlugin.apply(ctx, { root })
  const registered: string[] = []
  let disposed = 0
  const modelFiber = ctx.plugin(modelPlugin, {})
  await modelFiber
  assert.equal(typeof ctx.reflect.get('equityModelEngine')?.runCoalScenario, 'function')
  assert.equal(registered.length, 0)

  const toolsDispose = ctx.reflect.provide('tools', {
    register(definition: { name: string }) {
      registered.push(definition.name)
      return () => { disposed += 1 }
    },
  })
  assert.equal(registered.length, researchToolDefinitions.length)
  await modelFiber.dispose()
  assert.equal(disposed, researchToolDefinitions.length)
  await toolsDispose()
})

test('migrations reconcile duplicate natural keys before adding unique indexes', () => {
  const database = new DatabaseSync(':memory:')
  try {
    database.exec(`PRAGMA foreign_keys = ON; CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL) STRICT;`)
    const record = database.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
    for (const migration of migrations.slice(0, 7)) {
      database.exec(migration.sql)
      record.run(migration.version, migration.name, new Date().toISOString())
    }
    const now = new Date().toISOString()
    database.prepare(`INSERT INTO companies (company_id, name_en, jurisdiction, accounting_standard, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run('test-co', 'Test Co', 'CN', 'CAS', now, now)
    database.prepare(`INSERT INTO people (person_id, name_en, created_at, updated_at) VALUES (?, ?, ?, ?)`).run('person-1', 'Person One', now, now)
    database.prepare(`INSERT INTO positions (position_id, company_id, role_title_raw) VALUES (?, ?, ?)`).run('position-1', 'test-co', 'CEO')
    database.prepare(`INSERT INTO positions (position_id, company_id, role_title_raw) VALUES (?, ?, ?)`).run('position-2', 'test-co', 'Chairman')
    const assignment = database.prepare(`INSERT INTO role_assignments (assignment_id, company_id, person_id, position_id, start_date) VALUES (?, ?, ?, ?, ?)`)
    assignment.run('assignment-1', 'test-co', 'person-1', 'position-1', '2025-01-01')
    assignment.run('assignment-2', 'test-co', 'person-1', 'position-1', '2025-01-01')
    const reportingLine = database.prepare(`INSERT INTO reporting_lines (reporting_line_id, company_id, subordinate_position_id, manager_position_id, relationship_type, start_date) VALUES (?, ?, ?, ?, ?, ?)`)
    reportingLine.run('line-1', 'test-co', 'position-1', 'position-2', 'solid', '2025-01-01')
    reportingLine.run('line-2', 'test-co', 'position-1', 'position-2', 'solid', '2025-01-01')
    database.prepare(`INSERT INTO share_classes (share_class_id, company_id, name, security_type) VALUES (?, ?, ?, ?)`).run('class-1', 'test-co', 'A shares', 'common_equity')
    database.prepare(`INSERT INTO share_classes (share_class_id, company_id, name, security_type) VALUES (?, ?, ?, ?)`).run('class-2', 'test-co', 'B shares', 'common_equity')
    const snapshot = database.prepare(`INSERT INTO captable_snapshots (captable_snapshot_id, company_id, as_of_date, created_at) VALUES (?, ?, ?, ?)`)
    snapshot.run('snapshot-1', 'test-co', '2025-12-31', now)
    snapshot.run('snapshot-2', 'test-co', '2025-12-31', now)
    database.prepare(`INSERT INTO captable_class_totals (captable_snapshot_id, share_class_id, shares_outstanding) VALUES (?, ?, ?)`).run('snapshot-1', 'class-1', 100)
    database.prepare(`INSERT INTO captable_positions (captable_position_id, captable_snapshot_id, holder_name, share_class_id, shares) VALUES (?, ?, ?, ?, ?)`).run('position-1', 'snapshot-1', 'Holder One', 'class-1', 25)
    database.prepare(`INSERT INTO captable_class_totals (captable_snapshot_id, share_class_id, shares_outstanding) VALUES (?, ?, ?)`).run('snapshot-2', 'class-1', 150)
    database.prepare(`INSERT INTO captable_class_totals (captable_snapshot_id, share_class_id, shares_outstanding) VALUES (?, ?, ?)`).run('snapshot-2', 'class-2', 200)
    database.prepare(`INSERT INTO captable_positions (captable_position_id, captable_snapshot_id, holder_name, share_class_id, shares) VALUES (?, ?, ?, ?, ?)`).run('position-2', 'snapshot-2', 'Holder Two', 'class-2', 50)

    assert.doesNotThrow(() => migrateDatabase(database))
    assert.equal((database.prepare('SELECT count(*) AS count FROM role_assignments').get() as { count: number }).count, 1)
    assert.equal((database.prepare('SELECT count(*) AS count FROM reporting_lines').get() as { count: number }).count, 1)
    assert.equal((database.prepare('SELECT count(*) AS count FROM captable_snapshots').get() as { count: number }).count, 1)
    assert.equal((database.prepare('SELECT count(*) AS count FROM captable_class_totals').get() as { count: number }).count, 2)
    assert.equal((database.prepare('SELECT count(*) AS count FROM captable_positions').get() as { count: number }).count, 1)
    assert.equal((database.prepare('SELECT captable_snapshot_id FROM captable_class_totals WHERE share_class_id = ?').get('class-1') as { captable_snapshot_id: string }).captable_snapshot_id, 'snapshot-2')
    assert.equal((database.prepare('SELECT shares_outstanding FROM captable_class_totals WHERE captable_snapshot_id = ? AND share_class_id = ?').get('snapshot-2', 'class-1') as { shares_outstanding: number }).shares_outstanding, 150)
    assert.equal((database.prepare('SELECT share_class_id FROM captable_positions').get() as { share_class_id: string }).share_class_id, 'class-2')
    assert.equal((database.prepare('SELECT count(*) AS count FROM schema_migrations').get() as { count: number }).count, 10)
  } finally {
    database.close()
  }
})

test('company initialization creates an inspectable workspace and applies migrations once', async () => {
  const { archive } = await createArchive()
  const company = await archive.createCompany(manifest)
  assert.equal(company.manifest.company_id, manifest.company_id)

  const storedManifest = JSON.parse(await readFile(join(company.path, 'company.json'), 'utf8')) as CompanyManifest
  assert.deepEqual(storedManifest, manifest)

  const result = archive.withDatabase(manifest.company_id, (database) => {
    const migrations = database.prepare('SELECT count(*) AS count FROM schema_migrations').get() as { count: number }
    const tables = database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table'").get() as { count: number }
    return { migrations: migrations.count, tables: tables.count }
  })
  assert.equal(result.migrations, 10)
  assert.ok(result.tables >= 8)

  await archive.openCompany(manifest.company_id)
  assert.equal(archive.withDatabase(manifest.company_id, (database) =>
    (database.prepare('SELECT count(*) AS count FROM schema_migrations').get() as { count: number }).count,
  ), 10)
})

test('retained artifact provenance remains valid after copying a company workspace', async () => {
  const { archive, root } = await createArchive()
  await archive.createCompany(manifest)
  const now = new Date().toISOString()
  archive.withDatabase(manifest.company_id, (database) => {
    applyMetricPack(database, financialCommonPack)
    applyMetricPack(database, coalPack)
    database.prepare(`INSERT INTO sources (
      source_id, source_type, title, publisher, accessed_at, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'source-seed-note', 'manual', 'Seed provenance note', 'Conte', now,
      'Test fixture retained inside the workspace', now,
    )
  })

  const artifact = await archive.storeArtifact(manifest.company_id, '# Seed evidence\nProduction: 1 tonne\n', {
    artifactId: 'artifact-seed-note', sourceId: 'source-seed-note', artifactKind: 'curated',
    mediaType: 'text/markdown', category: 'curated', fileName: 'seed.md',
    originalRetained: false, transformationMethod: 'manual_edit',
  })
  assert.equal(await archive.verifyArtifact(manifest.company_id, artifact.artifactId), true)

  archive.withDatabase(manifest.company_id, (database) => {
    database.exec('BEGIN IMMEDIATE')
    try {
      database.prepare(`INSERT INTO evidence (
        evidence_id, artifact_id, locator_type, locator_json, excerpt_text, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`).run(
        'evidence-seed-production', artifact.artifactId, 'markdown',
        JSON.stringify({ heading: 'Seed evidence', line_start: 2, line_end: 2 }),
        'Production: 1 tonne', now,
      )
      database.prepare(`INSERT INTO facts (
        fact_id, metric_id, period_type, period_start, period_end, value_number, unit,
        ingestion_method, verification_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'fact-seed-production', 'coal.production', 'duration', '2025-01-01', '2025-12-31',
        1, 'tonne', 'manual', 'fixture', now, now,
      )
      database.prepare('INSERT INTO fact_evidence (fact_id, evidence_id) VALUES (?, ?)').run(
        'fact-seed-production', 'evidence-seed-production',
      )
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  })

  const copiedRoot = await mkdtemp(join(tmpdir(), 'conte-copy-'))
  const exportedPath = await archive.exportCompany(manifest.company_id, copiedRoot)
  assert.equal(exportedPath, join(copiedRoot, manifest.company_id))
  const copiedArchive = new EquityArchive({ root: copiedRoot })
  const copiedCompany = await copiedArchive.openCompany(manifest.company_id)
  assert.equal(copiedCompany.manifest.name_en, manifest.name_en)
  assert.equal(await copiedArchive.verifyArtifact(manifest.company_id, artifact.artifactId), true)
  assert.equal(copiedArchive.withDatabase(manifest.company_id, (database) =>
    (database.prepare(`SELECT count(*) AS count FROM facts
      JOIN fact_evidence USING (fact_id)
      JOIN evidence USING (evidence_id)
      JOIN source_artifacts USING (artifact_id)`).get() as { count: number }).count,
  ), 1)

  const copiedArtifact = await copiedArchive.resolveArtifact(manifest.company_id, artifact.artifactId)
  await writeFile(copiedArtifact, 'tampered')
  assert.equal(await copiedArchive.verifyArtifact(manifest.company_id, artifact.artifactId), false)
  const audit = await archive.auditCompany(manifest.company_id)
  assert.deepEqual({ artifactCount: audit.artifactCount, validArtifactCount: audit.validArtifactCount, ok: audit.ok }, { artifactCount: 1, validArtifactCount: 1, ok: true })
})

test('database constraints enforce known metrics and local artifact evidence', async () => {
  const { archive } = await createArchive()
  await archive.createCompany(manifest)
  assert.throws(() => archive.withDatabase(manifest.company_id, (database) => {
    const now = new Date().toISOString()
    database.prepare(`INSERT INTO facts (
      fact_id, metric_id, period_type, period_start, period_end, value_number,
      ingestion_method, verification_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'bad-fact', 'unknown.metric', 'duration', '2025-01-01', '2025-12-31', 1,
      'manual', 'unverified', now, now,
    )
  }), /FOREIGN KEY constraint failed/)
})

test('data engine validates and queries facts through the archive boundary', async () => {
  const { archive } = await createArchive()
  await archive.createCompany(manifest)
  const now = new Date().toISOString()
  archive.withDatabase(manifest.company_id, (database) => {
    applyMetricPack(database, coalPack)
    database.prepare(`INSERT INTO sources (
      source_id, source_type, title, publisher, created_at
    ) VALUES (?, ?, ?, ?, ?)`).run('source-fact', 'filing', 'Annual report', 'Test publisher', now)
  })
  const artifact = await archive.storeArtifact(manifest.company_id, 'Production: 10 tonnes\n', {
    artifactId: 'artifact-fact', sourceId: 'source-fact', artifactKind: 'original',
    mediaType: 'text/markdown', category: 'filings', fileName: 'annual.md', originalRetained: true,
  })
  archive.withDatabase(manifest.company_id, (database) => {
    database.prepare(`INSERT INTO evidence (
      evidence_id, artifact_id, locator_type, locator_json, created_at
    ) VALUES (?, ?, ?, ?, ?)`).run(
      'evidence-fact', artifact.artifactId, 'markdown', JSON.stringify({ line_start: 1, line_end: 1 }), now,
    )
  })
  const engine = new EquityDataEngine(archive)
  const packApplicationId = engine.applyMetricPack(manifest.company_id, financialCommonPack)
  assert.match(packApplicationId, /^metric-pack-application-/)
  assert.equal(engine.applyMetricPack(manifest.company_id, financialCommonPack), packApplicationId)
  assert.ok(engine.listMetricDefinitions(manifest.company_id, 'financial').some((metric) => metric.metricId === 'financial.revenue'))
  assert.equal(engine.listTaxonomy(manifest.company_id).length, 0)
  const industryId = engine.addIndustry(manifest.company_id, { industryId: 'coal', isPrimary: true })
  assert.equal(engine.listBusinessLineTypes(manifest.company_id, 'coal').length, 3)
  const businessLineId = engine.addBusinessLine(manifest.company_id, industryId, { businessLineTypeId: 'coal.coal_mining_and_sales', displayName: 'Coal Mining & Sales' })
  assert.equal(engine.listTaxonomy(manifest.company_id)[0]?.businessLines[0]?.businessLineId, businessLineId)
  const factId = engine.createFact(manifest.company_id, {
    metricId: 'coal.production', periodType: 'duration', periodStart: '2025-01-01', periodEnd: '2025-12-31',
    value: 10, unit: 'tonne', dimensions: { geography: 'Shandong' }, evidenceIds: ['evidence-fact'],
    ingestionMethod: 'test', verificationStatus: 'confirmed',
  })
  assert.equal(engine.getFact(manifest.company_id, factId).value, 10)
  assert.equal(engine.listFactEvidence(manifest.company_id, factId)[0]?.evidenceId, 'evidence-fact')
  assert.equal(engine.getFact(manifest.company_id, factId).companyIndustryId, null)
  assert.equal(engine.listArtifacts(manifest.company_id)[0]?.artifactId, artifact.artifactId)
  assert.throws(() => engine.listFacts(manifest.company_id, { limit: 0 }), /positive integer/)
  assert.equal(engine.listFacts(manifest.company_id, { metricId: 'coal.production' }).length, 1)
  assert.equal(engine.listFacts(manifest.company_id, { dimensions: { geography: 'Shandong' } }).length, 1)
  const firstEstimate = engine.createEstimate(manifest.company_id, {
    metricId: 'coal.production', targetPeriodType: 'duration', targetPeriodStart: '2026-01-01', targetPeriodEnd: '2026-12-31',
    asOf: '2026-06-30', provider: 'Test desk', estimateType: 'base', value: 12, unit: 'million_tonne',
    evidenceIds: ['evidence-fact'], ingestionMethod: 'test', verificationStatus: 'unverified',
  })
  engine.createEstimate(manifest.company_id, {
    metricId: 'coal.production', targetPeriodType: 'duration', targetPeriodStart: '2026-01-01', targetPeriodEnd: '2026-12-31',
    asOf: '2026-07-31', provider: 'Test desk', estimateType: 'base', value: 13, unit: 'million_tonne',
    evidenceIds: ['evidence-fact'], ingestionMethod: 'test', verificationStatus: 'unverified',
  })
  const estimates = engine.listEstimates(manifest.company_id, 'coal.production')
  assert.equal(estimates.length, 2)
  assert.equal(estimates[0]?.estimateId, firstEstimate)
  assert.equal(estimates[1]?.value, 13)
  assert.equal(engine.listEstimates(manifest.company_id, { targetPeriodEnd: '2026-12-31', asOfFrom: '2026-07-01', asOfTo: '2026-07-31' }).length, 1)
  const personId = engine.createPerson(manifest.company_id, { nameEn: 'Test Executive' })
  const unitId = engine.createOrganizationUnit(manifest.company_id, { name: 'Group Management', unitType: 'management' })
  const positionId = engine.createPosition(manifest.company_id, { roleTitleRaw: 'Chief Executive Officer', roleType: 'ceo', organizationUnitId: unitId })
  const assignmentId = engine.assignRole(manifest.company_id, { personId, positionId, startDate: '2025-01-01', isCurrent: true, evidenceId: 'evidence-fact' })
  assert.equal(engine.listPeople(manifest.company_id)[0]?.assignments[0]?.assignmentId, assignmentId)
  const managerPositionId = engine.createPosition(manifest.company_id, { roleTitleRaw: 'Chairman', roleType: 'chairman' })
  assert.match(engine.addReportingLine(manifest.company_id, { subordinatePositionId: positionId, managerPositionId, relationshipType: 'solid', startDate: '2025-01-01' }), /^reporting-line-/)
  const shareClassId = engine.createShareClass(manifest.company_id, { name: 'A shares', securityType: 'common_equity', exchange: 'SSE', ticker: '600188', currency: 'CNY' })
  const snapshotId = engine.createCapTableSnapshot(manifest.company_id, { asOfDate: '2025-12-31', classTotals: [{ shareClassId, sharesOutstanding: 1000, percentageOfTotalEquity: 100 }], positions: [{ holderName: 'Test holder', shareClassId, shares: 100, ownershipPct: 10, rank: 1 }] })
  assert.equal(engine.listCapTable(manifest.company_id)[0]?.snapshotId, snapshotId)
  assert.throws(() => engine.createCapTableSnapshot(manifest.company_id, { asOfDate: '2026-01-01', classTotals: [{ shareClassId, sharesOutstanding: 1, percentageOfTotalEquity: 101 }] }), /percentageOfTotalEquity/)
  assert.throws(() => engine.createCapTableSnapshot(manifest.company_id, { asOfDate: '2026-01-02', classTotals: [{ shareClassId, sharesOutstanding: 1 }], positions: [{ holderName: 'Invalid shares', shareClassId, shares: -1 }] }), /shares must be non-negative/)
  assert.throws(() => engine.createCapTableSnapshot(manifest.company_id, { asOfDate: '2026-01-03', classTotals: [{ shareClassId, sharesOutstanding: 1 }], positions: [{ holderName: 'Invalid ownership', shareClassId, ownershipPct: 101 }] }), /ownershipPct/)
  assert.throws(() => engine.createCapTableSnapshot(manifest.company_id, { asOfDate: '2026-01-04', classTotals: [{ shareClassId, sharesOutstanding: 1 }], positions: [{ holderName: 'Invalid rank', shareClassId, rank: 1.5 }] }), /rank must be a non-negative integer/)
  assert.throws(() => engine.createFact(manifest.company_id, {
    metricId: 'coal.production', periodType: 'duration', periodStart: '2025-01-01', periodEnd: '2025-12-31',
    value: 10, dimensions: { unsupported: 'x' }, evidenceIds: ['evidence-fact'],
    ingestionMethod: 'test', verificationStatus: 'confirmed',
  }), /does not allow/)
})

test('Facts CSV import rolls back the whole batch when a later row is invalid', async () => {
  const { archive } = await createArchive()
  await archive.createCompany(manifest)
  const now = new Date().toISOString()
  archive.withDatabase(manifest.company_id, (database) => {
    applyMetricPack(database, coalPack)
    database.prepare(`INSERT INTO sources (source_id, source_type, title, publisher, created_at) VALUES (?, ?, ?, ?, ?)`).run('source-facts-import', 'filing', 'Facts import fixture', 'Test publisher', now)
  })
  const artifact = await archive.storeArtifact(manifest.company_id, 'Production: 10 tonnes\n', {
    artifactId: 'artifact-facts-import', sourceId: 'source-facts-import', artifactKind: 'original',
    mediaType: 'text/markdown', category: 'filings', fileName: 'facts.md', originalRetained: true,
  })
  archive.withDatabase(manifest.company_id, (database) => {
    database.prepare(`INSERT INTO evidence (evidence_id, artifact_id, locator_type, locator_json, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      'evidence-facts-import', artifact.artifactId, 'markdown', JSON.stringify({ line_start: 1, line_end: 1 }), now,
    )
  })
  const csv = [
    'metric_id,period_type,period_start,period_end,value,unit,evidence_id',
    'coal.production,duration,2025-01-01,2025-12-31,10,tonne,evidence-facts-import',
    'unknown.metric,duration,2025-01-01,2025-12-31,20,tonne,evidence-facts-import',
  ].join('\n')
  assert.throws(() => importFactsCsvText(csv, archive, manifest.company_id, true), /Unknown active metric definition: unknown\.metric/)
  assert.equal(new EquityDataEngine(archive).listFacts(manifest.company_id).length, 0)
})

test('web workbench keeps legacy evidence links scoped and preserves import submitters', async () => {
  const { archive } = await createArchive()
  await archive.createCompany(manifest)
  const now = new Date().toISOString()
  archive.withDatabase(manifest.company_id, (database) => {
    database.prepare(`INSERT INTO sources (source_id, source_type, title, publisher, created_at) VALUES (?, ?, ?, ?, ?)`).run('source-legacy-web', 'manual', 'Legacy web fixture', 'Test publisher', now)
  })
  const artifact = await archive.storeArtifact(manifest.company_id, 'Legacy observation\n', {
    artifactId: 'artifact-legacy-web', sourceId: 'source-legacy-web', artifactKind: 'curated',
    mediaType: 'text/markdown', category: 'curated', fileName: 'legacy.md', originalRetained: false,
  })
  archive.withDatabase(manifest.company_id, (database) => {
    database.prepare(`INSERT INTO evidence (evidence_id, artifact_id, locator_type, locator_json, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      'evidence-legacy-web', artifact.artifactId, 'markdown', JSON.stringify({ line_start: 1, line_end: 1 }), now,
    )
    database.prepare(`INSERT INTO legacy_observations (observation_id, entity_id, legacy_metric_id, period_kind, value_nature, review_status, evidence_id, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'observation-legacy-web', manifest.company_id, 'legacy.revenue', 'FY', '10', 'unreviewed', 'evidence-legacy-web', now,
    )
  })
  const server = new EquityWebServer(new EquityDataEngine(archive), { companyId: manifest.company_id })
  const address = await server.start('127.0.0.1', 0)
  try {
    const html = await (await fetch(`http://${address.host}:${address.port}/companies/${manifest.company_id}`)).text()
    assert.match(html, /\/api\/evidence\/evidence-legacy-web\?company_id=yankuang-energy/)
    assert.match(html, /event\.submitter/)
    const invalidBank = await fetch(`http://${address.host}:${address.port}/api/models/bank/pb-roe`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: {} }),
    })
    assert.equal(invalidBank.status, 400)
    const invalidInsurance = await fetch(`http://${address.host}:${address.port}/api/models/insurance/p-ev`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: {} }),
    })
    assert.equal(invalidInsurance.status, 400)
    assert.equal(new EquityDataEngine(archive).listModelRuns(manifest.company_id).length, 0)
  } finally {
    await server.close()
  }
})

test('web server reuses the shared model engine when provided', async () => {
  const { archive } = await createArchive()
  const dataEngine = new EquityDataEngine(archive)
  const modelEngine = new EquityModelEngine(dataEngine)
  const server = new EquityWebServer(dataEngine, { modelEngine })
  assert.equal(server.modelEngine, modelEngine)
})

test('coal model calculates and persists historical model runs', async () => {
  const { archive } = await createArchive()
  await archive.createCompany(manifest)
  const output = runCoalScenario({ coalPrice: 700, annualProduction: 100, years: 5, ebitdaMargin: 0.25, taxRate: 0.25, discountRate: 0.1, terminalGrowth: 0.02, netDebt: 1000, sharesOutstanding: 100 })
  assert.equal(output.projectedFcf.length, 5)
  const engine = new EquityModelEngine(archive)
  const run = engine.runCoalScenario(manifest.company_id, { coalPrice: 700, annualProduction: 100, years: 5, ebitdaMargin: 0.25, taxRate: 0.25, discountRate: 0.1, terminalGrowth: 0.02, netDebt: 1000, sharesOutstanding: 100 })
  assert.equal(engine.listRuns(manifest.company_id)[0]?.modelRunId, run.modelRunId)
  const scenarioId = engine.saveScenario(manifest.company_id, { name: 'Base', modelId: 'coal-scenario', parameters: { coalPrice: 700 } })
  assert.equal(engine.listScenarios(manifest.company_id)[0]?.scenarioId, scenarioId)
  assert.equal(engine.saveScenario(manifest.company_id, { name: 'Base', modelId: 'coal-scenario', parameters: { coalPrice: 750 } }), scenarioId)
  assert.equal(engine.listScenarios(manifest.company_id)[0]?.parameters.coalPrice, 750)
  const tools = createEquityResearchTools(archive)
  assert.equal((await tools.getCompany(manifest.company_id)).company_id, manifest.company_id)
  assert.equal(tools.getModelRuns(manifest.company_id).length, 1)
  const bank = runBankPbRoe({ bookValuePerShare: 10, sustainableRoe: 0.12, costOfEquity: 0.1, terminalGrowth: 0.03, targetPb: 1.1 })
  assert.equal(bank.valuePerShare, 11)
  assert.ok(bank.justifiedPb > 1)
  assert.equal(runInsurancePEv({ embeddedValue: 100, targetPEv: 1.2, netDebt: 20, sharesOutstanding: 10 }).valuePerShare, 10)
  assert.equal(runSotp([{ name: 'Coal', value: 100 }, { name: 'Bank', value: 50, weight: 0.5 }], -10).adjustedValue, 115)
})

test('management and cap table CSV parsers preserve temporal input', () => {
  const management = parseManagementCsv('name_en,role_title_raw,start_date,is_current\nAlice,CFO,2024-01-01,true')
  assert.equal(management[0]?.roleTitleRaw, 'CFO')
  const capTable = parseCapTableCsv('as_of_date,share_class_name,security_type,shares_outstanding,holder_name,shares\n2025-12-31,A shares,common_equity,1000,Holder,100')
  assert.equal(capTable[0]?.shares, 100)
  assert.throws(() => parseManagementCsv('name_en,role_title_raw,start_date\nAlice,CFO,2024-02-30'), /ISO date/)
  assert.throws(() => parseCapTableCsv('as_of_date,share_class_name,security_type,shares_outstanding\n2025-13-31,A,common_equity,1'), /ISO date/)
  assert.throws(() => parseEstimatesCsv('metric_id,target_period_type,target_period_end,as_of,provider,estimate_type,value,evidence_id\ncoal.production,duration,2026-12-31,2026-07-01,Desk,base,1,evidence'), /target_period_start/)
  const facts = parseFactsCsv('metric_id,period_type,period_start,period_end,value,evidence_id\ncoal.production,duration,2025-01-01,2025-12-31,10,evidence')
  assert.equal(facts[0]?.value, 10)
  assert.throws(() => parseFactsCsv('metric_id,period_type,period_end,value,evidence_id\ncoal.production,duration,2025-12-31,10,evidence'), /period_start/)
  assert.throws(() => parseFactsCsv('metric_id,period_type,period_start,period_end,value,evidence_id\ncoal.production,duration,2025-02-30,2025-12-31,10,evidence'), /ISO date/)
  assert.ok(researchToolDefinitions.some((tool) => tool.name === 'getCapTable'))
})

test('data engine can create retained provenance records without raw SQL', async () => {
  const { archive } = await createArchive()
  await archive.createCompany(manifest)
  const engine = new EquityDataEngine(archive)
  const sourceId = engine.createSource(manifest.company_id, { sourceType: 'filing', title: 'Annual report', publisher: 'Test issuer' })
  const artifact = await engine.storeArtifact(manifest.company_id, 'Revenue: 100\n', { sourceId, artifactKind: 'curated', mediaType: 'text/markdown', category: 'curated', fileName: 'annual.md', originalRetained: false, transformationMethod: 'manual_edit' })
  const evidenceId = engine.createEvidence(manifest.company_id, { artifactId: artifact.artifactId, locatorType: 'markdown', locator: { line_start: 1, line_end: 1 }, excerptText: 'Revenue: 100' })
  assert.equal(engine.listSources(manifest.company_id)[0]?.sourceId, sourceId)
  assert.equal(engine.getEvidence(manifest.company_id, evidenceId).artifactId, artifact.artifactId)
})

test('domain imports are idempotent for repeated management and cap table files', async () => {
  const { archive } = await createArchive()
  await archive.createCompany(manifest)
  const managementCsv = 'name_en,unit_name,unit_type,role_title_raw,role_type,start_date,is_current,manager_role_title_raw,manager_role_type,reporting_relationship_type\nAlice Chen,Executive Office,management,Chief Financial Officer,cfo,2024-01-01,true,Chief Executive Officer,ceo,solid'
  const firstManagement = importManagementCsvText(managementCsv, archive, manifest.company_id, true)
  const secondManagement = importManagementCsvText(managementCsv, archive, manifest.company_id, true)
  assert.equal(firstManagement.imported, 1)
  assert.equal(secondManagement.imported, 1)
  assert.equal(firstManagement.reportingLineIds.length, 1)
  assert.equal(secondManagement.reportingLineIds.length, 1)
  assert.equal(archive.withDatabase(manifest.company_id, (database) => (database.prepare('SELECT count(*) AS count FROM people').get() as { count: number }).count), 1)
  assert.equal(archive.withDatabase(manifest.company_id, (database) => (database.prepare('SELECT count(*) AS count FROM role_assignments').get() as { count: number }).count), 1)
  assert.equal(archive.withDatabase(manifest.company_id, (database) => (database.prepare('SELECT count(*) AS count FROM reporting_lines').get() as { count: number }).count), 1)
  const capTableCsv = 'as_of_date,share_class_name,security_type,exchange,ticker,shares_outstanding,holder_name,shares\n2025-12-31,A shares,common_equity,SSE,600188,1000,State Capital,100'
  const firstCapTable = importCapTableCsvText(capTableCsv, archive, manifest.company_id, true)
  const secondCapTable = importCapTableCsvText(capTableCsv, archive, manifest.company_id, true)
  assert.equal(firstCapTable.snapshotIds.length, 1)
  assert.equal(secondCapTable.snapshotIds.length, 0)
  assert.equal(secondCapTable.skippedSnapshots, 1)
  assert.equal(archive.withDatabase(manifest.company_id, (database) => (database.prepare('SELECT count(*) AS count FROM captable_snapshots').get() as { count: number }).count), 1)
})

test('management import rolls back all rows when a later assignment is invalid', async () => {
  const { archive } = await createArchive()
  await archive.createCompany(manifest)
  const csv = [
    'name_en,role_title_raw,start_date,evidence_id',
    'First Executive,Chief Executive Officer,2025-01-01,',
    'Second Executive,Chief Financial Officer,2025-01-01,missing-evidence',
  ].join('\n')
  assert.throws(() => importManagementCsvText(csv, archive, manifest.company_id, true), /FOREIGN KEY constraint failed/)
  const engine = new EquityDataEngine(archive)
  assert.equal(engine.listPeople(manifest.company_id).length, 0)
  assert.equal(engine.listPositions(manifest.company_id).length, 0)
  assert.equal(engine.listOrganizationUnits(manifest.company_id).length, 0)
  assert.equal(engine.listPeople(manifest.company_id).flatMap((person) => person.assignments).length, 0)
})

test('cap table import rolls back all rows when a later snapshot is invalid', async () => {
  const { archive } = await createArchive()
  await archive.createCompany(manifest)
  const csv = [
    'as_of_date,share_class_name,security_type,shares_outstanding,holder_name,shares,evidence_id',
    '2024-12-31,A shares,common_equity,1000,Holder One,100,',
    '2025-12-31,A shares,common_equity,1100,Holder Two,110,missing-evidence',
  ].join('\n')
  assert.throws(() => importCapTableCsvText(csv, archive, manifest.company_id, true), /FOREIGN KEY constraint failed/)
  const engine = new EquityDataEngine(archive)
  assert.equal(engine.listCapTable(manifest.company_id).length, 0)
  assert.equal(engine.listShareClasses(manifest.company_id).length, 0)
})

test('legacy import supports a configured company directory and binds observations to its retained artifact', async () => {
  const sourceRoot = await mkdtemp(join(tmpdir(), 'conte-legacy-source-'))
  const companyDirectory = join(sourceRoot, 'Acme Research Archive')
  const observationDirectory = join(companyDirectory, '_research', 'imports')
  await mkdir(observationDirectory, { recursive: true })
  await writeFile(join(companyDirectory, 'annual-report.pdf'), 'retained report')
  await writeFile(join(observationDirectory, 'observations.csv'), [
    'observation_id,entity_id,metric_id,period_kind,value_nature,review_status,period_start,period_end,value,unit,source_locator,notes',
    'obs-acme-1,acme-co,revenue,duration,reported,unreviewed,2024-01-01,2024-12-31,123,CNY,"page 1, table 2","note, with comma"',
  ].join('\n'))

  const inventory = await scanLegacyArchive(sourceRoot, { companyDirectory: 'Acme Research Archive', companyId: 'acme-co' })
  assert.equal(inventory.companyId, 'acme-co')
  assert.equal(inventory.observationRelativePath, '_research/imports/observations.csv')
  assert.equal(inventory.observationRows, 1)
  assert.equal(inventory.observationStatuses.unreviewed, 1)

  const targetRoot = await mkdtemp(join(tmpdir(), 'conte-legacy-target-'))
  const archive = new EquityArchive({ root: targetRoot })
  const workspace = await applyLegacyImport(inventory, archive, targetRoot, {
    manifest: legacyManifest({ companyId: 'acme-co', nameEn: 'Acme Research Archive', primaryIndustry: 'industrial' }),
    metricPacks: [financialCommonPack],
  })
  assert.equal(workspace.companyPath, join(targetRoot, 'acme-co'))
  const staged = await stageLegacyObservations(inventory, archive)
  assert.deepEqual(staged, { observationRows: 1, evidenceRows: 1, mappedRows: 1 })
  assert.equal(archive.withDatabase('acme-co', (database) => (database.prepare('SELECT count(*) AS count FROM legacy_observations').get() as { count: number }).count), 1)
  assert.equal(archive.withDatabase('acme-co', (database) => (database.prepare('SELECT count(*) AS count FROM evidence').get() as { count: number }).count), 1)
})
