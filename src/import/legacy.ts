import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import type { EquityArchive, DocumentCategory } from '../archive/archive-service.js'
import { applyMetricPack } from '../metric-packs/apply.js'
import { coalPack } from '../metric-packs/coal/index.js'
import { financialCommonPack } from '../metric-packs/financial-common/index.js'
import type { MetricPack } from '../metric-packs/types.js'
import type { CompanyManifest } from '../domain/company.js'

export interface LegacyFile {
  absolutePath: string
  relativePath: string
  size: number
  category: DocumentCategory
  sourceType: 'filing' | 'earnings' | 'analyst_report' | 'manual' | 'other'
}

export interface LegacyInventory {
  sourceRoot: string
  companyDirectory: string
  companyId: string
  observationPath: string | null
  observationRelativePath: string | null
  files: LegacyFile[]
  extensionCounts: Record<string, number>
  observationRows: number
  observationStatuses: Record<string, number>
}

export interface ImportResult {
  targetRoot: string
  companyPath: string
  copiedArtifacts: number
  observationRows: number
  observationStatuses: Record<string, number>
}

export interface StagedObservationResult {
  observationRows: number
  evidenceRows: number
  mappedRows: number
}

export interface LegacyScanOptions {
  /** Directory relative to sourceRoot, or an absolute directory, containing one company archive. */
  companyDirectory?: string
  companyId?: string
  /** Explicit observation CSV path, relative to the company directory or absolute. */
  observationPath?: string
}

export interface LegacyManifestOptions {
  companyId?: string
  nameZh?: string
  nameEn?: string
  website?: string
  jurisdiction?: string
  accountingStandard?: CompanyManifest['accounting_standard']
  primaryIndustry?: string
  securities?: CompanyManifest['securities']
}

export interface LegacyImportOptions {
  manifest?: CompanyManifest
  metricPacks?: readonly MetricPack[]
}

export async function scanLegacyArchive(sourceRoot: string, options: LegacyScanOptions = {}): Promise<LegacyInventory> {
  const root = resolve(sourceRoot)
  const companyDirectory = resolveCompanyDirectory(root, options.companyDirectory)
  const companyId = options.companyId ?? slugifyCompanyId(basename(companyDirectory))
  const files: LegacyFile[] = []
  await collectFiles(companyDirectory, companyDirectory, files)
  const extensionCounts: Record<string, number> = {}
  for (const file of files) {
    const extension = extnameSafe(file.relativePath)
    extensionCounts[extension] = (extensionCounts[extension] ?? 0) + 1
  }

  const observationPath = await findObservationPath(companyDirectory, files, options.observationPath)
  let observationRows = 0
  const observationStatuses: Record<string, number> = {}
  if (observationPath) {
    const rows = parseCsv(await readFile(observationPath, 'utf8'))
    if (rows.length > 1) {
      const headers = rows[0]!.map((header) => header.trim())
      const statusIndex = headers.indexOf('review_status')
      observationRows = rows.slice(1).filter((row) => row.some((value) => value !== '')).length
      for (const row of rows.slice(1)) {
        if (!row.some((value) => value !== '')) continue
        const status = (statusIndex >= 0 ? row[statusIndex] : undefined)?.trim() || '[empty]'
        observationStatuses[status] = (observationStatuses[status] ?? 0) + 1
      }
    }
  }

  return {
    sourceRoot: root,
    companyDirectory,
    companyId,
    observationPath,
    observationRelativePath: observationPath ? relative(companyDirectory, observationPath).replaceAll('\\', '/') : null,
    files,
    extensionCounts,
    observationRows,
    observationStatuses,
  }
}

export function legacyManifest(options: LegacyManifestOptions = {}): CompanyManifest {
  const companyId = options.companyId ?? 'yankuang-energy'
  const isYankuang = companyId === 'yankuang-energy'
  return {
    schema_version: '0.1',
    company_id: companyId,
    ...(options.nameZh || isYankuang ? { name_zh: options.nameZh ?? '兖矿能源集团股份有限公司' } : {}),
    ...(options.nameEn || isYankuang ? { name_en: options.nameEn ?? 'Yankuang Energy Group Company Limited' } : {}),
    ...(options.website || isYankuang ? { website: options.website ?? 'https://www.ykenergy.com/' } : {}),
    jurisdiction: options.jurisdiction ?? 'CN',
    accounting_standard: options.accountingStandard ?? 'CAS',
    ...(options.primaryIndustry || isYankuang ? { primary_industry: options.primaryIndustry ?? 'coal' } : {}),
    securities: options.securities ?? (isYankuang ? [
      { exchange: 'HKEX', ticker: '01171', security_type: 'common_equity' },
      { exchange: 'SSE', ticker: '600188', security_type: 'common_equity' },
    ] : []),
  }
}

export async function applyLegacyImport(
  inventory: LegacyInventory,
  archive: EquityArchive,
  targetRoot: string,
  options: LegacyImportOptions = {},
): Promise<ImportResult> {
  const target = resolve(targetRoot)
  const companyId = inventory.companyId || 'yankuang-energy'
  const manifest = options.manifest ?? legacyManifest({ companyId, nameEn: basename(inventory.companyDirectory) })
  const companyPath = join(target, manifest.company_id)
  await archive.initialize()
  const workspace = await archive.createCompany(manifest)
  archive.withDatabase(manifest.company_id, (database) => {
    for (const pack of options.metricPacks ?? defaultLegacyMetricPacks(manifest.company_id)) applyMetricPack(database, pack)
  })

  let copiedArtifacts = 0
  for (const [index, file] of inventory.files.entries()) {
    const sourceId = `legacy-source-${String(index + 1).padStart(4, '0')}`
    const artifactId = `legacy-artifact-${String(index + 1).padStart(4, '0')}`
    archive.withDatabase(manifest.company_id, (database) => {
      const now = new Date().toISOString()
      database.prepare(`INSERT INTO sources (
        source_id, source_type, title, publisher, accessed_at, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        sourceId, file.sourceType, basename(file.relativePath), 'Legacy archive import', now,
        `Original relative path: ${file.relativePath}`, now,
      )
    })
    await archive.storeArtifact(manifest.company_id, { sourcePath: file.absolutePath }, {
      artifactId, sourceId, artifactKind: 'original', mediaType: mediaTypeFor(file.relativePath),
      category: file.category, fileName: basename(file.relativePath), originalRetained: true,
    })
    copiedArtifacts += 1
  }

  const report = {
    importedAt: new Date().toISOString(),
    sourceRoot: inventory.sourceRoot,
    targetRoot: target,
    sourceCompanyDirectory: inventory.companyDirectory,
    companyId: manifest.company_id,
    copiedArtifacts,
    observationRows: inventory.observationRows,
    observationStatuses: inventory.observationStatuses,
    policy: 'Legacy observations remain retained artifacts and are not promoted to facts automatically.',
  }
  await writeFile(join(workspace.path, 'exports', 'legacy-import-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  return {
    targetRoot: target, companyPath, copiedArtifacts,
    observationRows: inventory.observationRows, observationStatuses: inventory.observationStatuses,
  }
}

export async function stageLegacyObservations(
  inventory: LegacyInventory,
  archive: EquityArchive,
): Promise<StagedObservationResult> {
  if (!inventory.observationPath || !inventory.observationRelativePath) return { observationRows: 0, evidenceRows: 0, mappedRows: 0 }
  const companyId = inventory.companyId || 'yankuang-energy'
  const csvPath = inventory.observationPath
  const rows = parseCsv(await readFile(csvPath, 'utf8'))
  if (rows.length < 2) return { observationRows: 0, evidenceRows: 0, mappedRows: 0 }
  const headers = rows[0] ?? []
  const index = new Map(headers.map((header, position) => [header, position]))
  const required = ['observation_id', 'entity_id', 'metric_id', 'period_kind', 'value_nature', 'review_status']
  for (const header of required) {
    if (index.get(header) === undefined) throw new Error(`Legacy CSV is missing required column: ${header}`)
  }

  const result = archive.withDatabase(companyId, (database) => {
    const artifactRows = database.prepare(`SELECT sa.artifact_id, s.notes
      FROM source_artifacts sa JOIN sources s ON s.source_id = sa.source_id`).all() as Array<{ artifact_id: string; notes: string | null }>
    const noteArtifact = artifactRows.find((row) => row.notes?.includes(`Original relative path: ${inventory.observationRelativePath}`))
      ?? artifactRows.find((row) => row.notes?.includes('src-legacy-master-note-v1'))
    if (!noteArtifact) throw new Error(`Staging workspace is missing the retained observation artifact: ${inventory.observationRelativePath}`)
    const insertEvidence = database.prepare(`INSERT INTO evidence (
      evidence_id, artifact_id, locator_type, locator_json, excerpt_text, created_at
    ) VALUES (?, ?, 'markdown', ?, ?, ?)`)
    const insertObservation = database.prepare(`INSERT INTO legacy_observations (
      observation_id, entity_id, legacy_metric_id, mapped_metric_id, period_start, period_end,
      as_of_date, period_kind, value, value_min, value_max, unit, currency, scope,
      dimensions_text, value_nature, source_id, source_locator, review_status, notes,
      evidence_id, imported_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    let evidenceRows = 0
    let mappedRows = 0
    const now = new Date().toISOString()
    database.exec('BEGIN IMMEDIATE')
    try {
      for (const row of rows.slice(1)) {
        const get = (name: string): string | null => {
          const value = row[index.get(name) ?? -1]
          return value === undefined || value === '' ? null : value
        }
        const observationId = get('observation_id')
        if (!observationId) throw new Error('Legacy CSV contains a row without observation_id')
        const legacyMetricId = get('metric_id')
        if (!legacyMetricId) throw new Error(`Observation ${observationId} has no metric_id`)
        const mappedMetricId = legacyMetricMap[legacyMetricId] ?? null
        const evidenceId = `legacy-evidence-${observationId}`
        const sourceLocator = get('source_locator')
        insertEvidence.run(
          evidenceId, noteArtifact.artifact_id,
          JSON.stringify({ legacy_source_id: get('source_id'), source_locator: sourceLocator }),
          get('notes'), now,
        )
        insertObservation.run(
          observationId, get('entity_id'), legacyMetricId, mappedMetricId,
          get('period_start'), get('period_end'), get('as_of_date'), get('period_kind'),
          get('value'), get('value_min'), get('value_max'), get('unit'), get('currency'),
          get('scope'), get('dimensions'), get('value_nature'), get('source_id'), sourceLocator,
          get('review_status'), get('notes'), evidenceId, now,
        )
        evidenceRows += 1
        if (mappedMetricId) mappedRows += 1
      }
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
    return { observationRows: rows.length - 1, evidenceRows, mappedRows }
  })
  return result
}

function resolveCompanyDirectory(sourceRoot: string, configuredDirectory?: string): string {
  const candidate = configuredDirectory
    ? (isAbsolute(configuredDirectory) ? configuredDirectory : join(sourceRoot, configuredDirectory))
    : join(sourceRoot, 'Yankuang-Energy')
  return resolve(candidate)
}

async function findObservationPath(companyDirectory: string, files: LegacyFile[], configuredPath?: string): Promise<string | null> {
  if (configuredPath) {
    const candidate = resolve(isAbsolute(configuredPath) ? configuredPath : join(companyDirectory, configuredPath))
    if (!files.some((file) => resolve(file.absolutePath) === candidate)) throw new Error(`Observation CSV does not exist inside the selected company archive: ${candidate}`)
    return candidate
  }
  const preferred = files.find((file) => file.relativePath.replaceAll('\\', '/') === '_research/imports/observations.csv')
  const fallback = files.find((file) => basename(file.relativePath).toLowerCase() === 'observations.csv')
  return preferred?.absolutePath ?? fallback?.absolutePath ?? null
}

function slugifyCompanyId(directoryName: string): string {
  const slug = directoryName.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
  return slug || 'legacy-company'
}

function defaultLegacyMetricPacks(companyId: string): readonly MetricPack[] {
  return companyId === 'yankuang-energy' ? [financialCommonPack, coalPack] : [financialCommonPack]
}

async function collectFiles(directory: string, base: string, files: LegacyFile[]): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === '.DS_Store' || entry.name.startsWith('.conte-staging')) continue
    const absolutePath = join(directory, entry.name)
    if (entry.isDirectory()) {
      await collectFiles(absolutePath, base, files)
      continue
    }
    if (!entry.isFile()) continue
    const relativePath = relative(base, absolutePath)
    const size = (await stat(absolutePath)).size
    files.push({ absolutePath, relativePath, size, ...classification(relativePath) })
  }
}

function classification(relativePath: string): Pick<LegacyFile, 'category' | 'sourceType'> {
  const normalized = relativePath.replaceAll('\\', '/').toLowerCase()
  if (normalized.startsWith('_reports/')) return { category: 'analyst', sourceType: 'analyst_report' }
  if (normalized.includes('/periodic reports/') || normalized.includes('/annual shareholder meetings/')) {
    return { category: 'filings', sourceType: 'filing' }
  }
  if (normalized.includes('/earning calls/')) return { category: 'earnings', sourceType: 'earnings' }
  if (normalized.endsWith('.md') || normalized.endsWith('.csv') || normalized.endsWith('.sql')) {
    return { category: 'curated', sourceType: 'manual' }
  }
  return { category: 'other', sourceType: 'other' }
}

function extnameSafe(path: string): string {
  const name = basename(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '[no extension]'
}

function mediaTypeFor(path: string): string {
  switch (extnameSafe(path)) {
    case 'pdf': return 'application/pdf'
    case 'doc': return 'application/msword'
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'xls': return 'application/vnd.ms-excel'
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case 'csv': return 'text/csv'
    case 'json': return 'application/json'
    case 'md': return 'text/markdown'
    case 'sql': return 'application/sql'
    default: return 'application/octet-stream'
  }
}

export const legacyMetricMap: Record<string, string> = {
  revenue: 'financial.revenue',
  attributable_net_profit: 'financial.net_profit',
  coal_production: 'coal.production',
  coal_sales_self_produced: 'coal.sales_volume',
  coal_average_sales_price: 'coal.asp',
  coal_unit_sales_cost: 'coal.unit_cost',
  coal_reserve_recoverable: 'coal.reserve',
  adjusted_attributable_net_profit: 'financial.adjusted_net_profit',
  operating_cash_flow: 'financial.operating_cash_flow',
  capital_expenditure: 'financial.capital_expenditure',
  revenue_share: 'financial.revenue_share',
  revenue_yoy_change: 'financial.revenue_yoy_change',
  non_recurring_profit: 'financial.non_recurring_profit',
  operating_cost_yoy_change: 'financial.operating_cost_yoy_change',
  gross_margin: 'financial.gross_margin',
  dividend_payout_ratio: 'financial.dividend_payout_ratio',
  dividend_per_share: 'financial.dividend_per_share',
  asset_liability_ratio: 'financial.asset_liability_ratio',
  attributable_equity: 'financial.attributable_equity',
  total_borrowings: 'financial.total_borrowings',
  capital_gearing: 'financial.capital_gearing',
  unused_credit_facilities: 'financial.unused_credit_facilities',
  employee_count: 'financial.employee_count',
  average_borrowing_rate: 'financial.average_borrowing_rate',
  five_year_borrowing_rate: 'financial.five_year_borrowing_rate',
  coal_resource_in_situ: 'coal.resource',
  coal_capacity_approved: 'coal.capacity_approved',
  coal_capacity_planned: 'coal.capacity_planned',
  coal_cash_cost: 'coal.cash_cost',
  coal_unit_sales_cost_yoy_change: 'coal.unit_cost_yoy_change',
  coal_internal_consumption: 'coal.internal_consumption',
  coal_inventory_change: 'coal.inventory_change',
  chemical_output: 'coal.chemical_output',
  installed_generation_capacity: 'coal.installed_generation_capacity',
  market_coal_sales_share: 'coal.market_sales_share',
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let position = 0; position < content.length; position += 1) {
    const character = content[position]
    if (character === '"') {
      if (quoted && content[position + 1] === '"') { field += '"'; position += 1 }
      else quoted = !quoted
    } else if (character === ',' && !quoted) {
      row.push(field); field = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && content[position + 1] === '\n') position += 1
      if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
      row = []; field = ''
    } else field += character
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}
