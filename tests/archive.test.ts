import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Context } from 'cordis'
import { EquityArchive } from '../src/archive/archive-service.js'
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
  assert.equal(result.migrations, 7)
  assert.ok(result.tables >= 8)

  await archive.openCompany(manifest.company_id)
  assert.equal(archive.withDatabase(manifest.company_id, (database) =>
    (database.prepare('SELECT count(*) AS count FROM schema_migrations').get() as { count: number }).count,
  ), 7)
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
  await cp(join(root, manifest.company_id), join(copiedRoot, manifest.company_id), { recursive: true })
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
  const factId = engine.createFact(manifest.company_id, {
    metricId: 'coal.production', periodType: 'duration', periodStart: '2025-01-01', periodEnd: '2025-12-31',
    value: 10, unit: 'tonne', dimensions: { geography: 'Shandong' }, evidenceIds: ['evidence-fact'],
    ingestionMethod: 'test', verificationStatus: 'confirmed',
  })
  assert.equal(engine.getFact(manifest.company_id, factId).value, 10)
  assert.equal(engine.listFacts(manifest.company_id, { metricId: 'coal.production' }).length, 1)
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
  assert.throws(() => engine.createFact(manifest.company_id, {
    metricId: 'coal.production', periodType: 'duration', periodStart: '2025-01-01', periodEnd: '2025-12-31',
    value: 10, dimensions: { unsupported: 'x' }, evidenceIds: ['evidence-fact'],
    ingestionMethod: 'test', verificationStatus: 'confirmed',
  }), /does not allow/)
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
  const tools = createEquityResearchTools(archive)
  assert.equal((await tools.getCompany(manifest.company_id)).company_id, manifest.company_id)
  assert.equal(tools.getModelRuns(manifest.company_id).length, 1)
  const bank = runBankPbRoe({ bookValuePerShare: 10, sustainableRoe: 0.12, costOfEquity: 0.1, terminalGrowth: 0.03, targetPb: 1.1 })
  assert.equal(bank.valuePerShare, 11)
  assert.ok(bank.justifiedPb > 1)
  assert.equal(runInsurancePEv({ embeddedValue: 100, targetPEv: 1.2, netDebt: 20, sharesOutstanding: 10 }).valuePerShare, 10)
  assert.equal(runSotp([{ name: 'Coal', value: 100 }, { name: 'Bank', value: 50, weight: 0.5 }], -10).adjustedValue, 115)
})
