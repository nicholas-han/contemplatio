import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { EquityArchive } from '../archive/archive-service.js'
import { EquityDataEngine, type EstimateInput } from '../data/data-engine.js'

export interface EstimateCsvRow extends EstimateInput { estimateId?: string }

export async function importEstimatesCsv(
  filePath: string,
  archive: EquityArchive,
  companyId: string,
  apply = false,
): Promise<{ filePath: string; rows: number; imported: number; estimateIds: string[] }> {
  const rows = parseEstimatesCsv(await readFile(resolve(filePath), 'utf8'))
  const result = importEstimateRows(rows, archive, companyId, apply, resolve(filePath))
  return { filePath: result.filePath ?? resolve(filePath), rows: result.rows, imported: result.imported, estimateIds: result.estimateIds }
}

export function importEstimatesCsvText(
  csv: string,
  archive: EquityArchive,
  companyId: string,
  apply = false,
): { rows: number; imported: number; estimateIds: string[] } {
  return importEstimateRows(parseEstimatesCsv(csv), archive, companyId, apply)
}

function importEstimateRows(
  rows: EstimateCsvRow[],
  archive: EquityArchive,
  companyId: string,
  apply: boolean,
  filePath?: string,
): { filePath?: string; rows: number; imported: number; estimateIds: string[] } {
  if (!apply) return { ...(filePath ? { filePath } : {}), rows: rows.length, imported: 0, estimateIds: [] }
  const engine = new EquityDataEngine(archive)
  const estimateIds = engine.createEstimatesBatch(companyId, rows)
  return { ...(filePath ? { filePath } : {}), rows: rows.length, imported: estimateIds.length, estimateIds }
}

export function parseEstimatesCsv(csv: string): EstimateCsvRow[] {
  const rows = parseCsv(csv).filter((row) => row.some((value) => value !== ''))
  if (rows.length < 2) return []
  const headers = rows[0] ?? []
  const index = new Map(headers.map((header, position) => [header.trim(), position]))
  const required = ['metric_id', 'target_period_type', 'target_period_end', 'as_of', 'provider', 'estimate_type', 'value', 'evidence_id']
  for (const name of required) if (index.get(name) === undefined) throw new Error(`Estimate CSV is missing required column: ${name}`)
  const get = (row: string[], name: string): string | undefined => {
    const value = row[index.get(name) ?? -1]?.trim()
    return value ? value : undefined
  }
  return rows.slice(1).map((row, position) => {
    const metricId = get(row, 'metric_id')
    const targetPeriodType = get(row, 'target_period_type')
    const targetPeriodEnd = get(row, 'target_period_end')
    const asOf = get(row, 'as_of')
    const provider = get(row, 'provider')
    const estimateType = get(row, 'estimate_type')
    const rawValue = get(row, 'value')
    const evidenceId = get(row, 'evidence_id')
    if (!metricId || !targetPeriodType || !targetPeriodEnd || !asOf || !provider || !estimateType || rawValue === undefined || !evidenceId) {
      throw new Error(`Estimate CSV row ${position + 2} is missing a required value`)
    }
    if (targetPeriodType !== 'duration' && targetPeriodType !== 'instant') throw new Error(`Estimate CSV row ${position + 2} has invalid target_period_type`)
    validateIsoDate(targetPeriodEnd, `Estimate CSV row ${position + 2} target_period_end`)
    validateIsoDate(asOf, `Estimate CSV row ${position + 2} as_of`)
    const targetPeriodStart = get(row, 'target_period_start')
    if (targetPeriodType === 'duration') {
      if (!targetPeriodStart) throw new Error(`Estimate CSV row ${position + 2} is missing target_period_start for a duration estimate`)
      validateIsoDate(targetPeriodStart, `Estimate CSV row ${position + 2} target_period_start`)
      if (targetPeriodStart > targetPeriodEnd) throw new Error(`Estimate CSV row ${position + 2} has target_period_start after target_period_end`)
    } else if (targetPeriodStart) throw new Error(`Estimate CSV row ${position + 2} must not set target_period_start for an instant estimate`)
    const numericValue = Number(rawValue)
    const value: number | string = rawValue !== '' && Number.isFinite(numericValue) ? numericValue : rawValue
    return {
      metricId, targetPeriodType, targetPeriodEnd, asOf, provider, estimateType, value,
      companyIndustryId: get(row, 'company_industry_id'), businessLineId: get(row, 'business_line_id'),
      ...(targetPeriodStart ? { targetPeriodStart } : {}), analyst: get(row, 'analyst'), unit: get(row, 'unit'),
      publishedAt: get(row, 'published_at'), observedAt: get(row, 'observed_at'),
      dimensions: parseDimensions(get(row, 'dimensions')), evidenceIds: evidenceId.split(';').map((id) => id.trim()).filter(Boolean),
      ingestionMethod: get(row, 'ingestion_method') ?? 'csv_import', verificationStatus: get(row, 'verification_status') ?? 'unverified',
    } as EstimateCsvRow
  })
}

function parseDimensions(value?: string): Record<string, string> | undefined {
  if (!value) return undefined
  const dimensions: Record<string, string> = {}
  for (const item of value.split(';')) {
    const [key, ...parts] = item.split('=')
    if (!key || !parts.length) throw new Error(`Invalid dimensions entry: ${item}`)
    dimensions[key.trim()] = parts.join('=').trim()
  }
  return dimensions
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { field += '"'; i += 1 } else quoted = !quoted
    } else if (char === ',' && !quoted) { row.push(field); field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i += 1
      row.push(field); rows.push(row); row = []; field = ''
    } else field += char
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

function validateIsoDate(value: string, field: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); const parsed = match ? new Date(`${value}T00:00:00Z`) : undefined
  if (!match || !parsed || Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() !== Number(match[1]) || parsed.getUTCMonth() + 1 !== Number(match[2]) || parsed.getUTCDate() !== Number(match[3])) throw new Error(`${field} must be an ISO date (YYYY-MM-DD)`)
}
