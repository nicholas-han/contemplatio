import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { EquityArchive } from '../archive/archive-service.js'
import { EquityDataEngine, type FactInput } from '../data/data-engine.js'

export interface FactCsvRow extends FactInput { factId?: string }

export async function importFactsCsv(filePath: string, archive: EquityArchive, companyId: string, apply = false): Promise<{ filePath: string; rows: number; imported: number; factIds: string[] }> {
  const rows = parseFactsCsv(await readFile(resolve(filePath), 'utf8'))
  const result = importFactRows(rows, archive, companyId, apply)
  return { filePath: resolve(filePath), rows: rows.length, ...result }
}

export function importFactsCsvText(csv: string, archive: EquityArchive, companyId: string, apply = false): { rows: number; imported: number; factIds: string[] } {
  const rows = parseFactsCsv(csv)
  return { rows: rows.length, ...importFactRows(rows, archive, companyId, apply) }
}

function importFactRows(rows: FactCsvRow[], archive: EquityArchive, companyId: string, apply: boolean): { imported: number; factIds: string[] } {
  if (!apply) return { imported: 0, factIds: [] }
  const engine = new EquityDataEngine(archive)
  const factIds = rows.map((row) => engine.createFact(companyId, row))
  return { imported: factIds.length, factIds }
}

export function parseFactsCsv(csv: string): FactCsvRow[] {
  const rows = parseCsv(csv).filter((row) => row.some((value) => value.trim() !== ''))
  if (rows.length < 2) return []
  const headers = rows[0]!.map((header) => header.trim())
  const index = new Map(headers.map((header, position) => [header, position]))
  for (const field of ['metric_id', 'period_type', 'period_end', 'value', 'evidence_id']) if (index.get(field) === undefined) throw new Error(`Facts CSV is missing required column: ${field}`)
  const get = (row: string[], name: string): string | undefined => {
    const value = row[index.get(name) ?? -1]?.trim()
    return value || undefined
  }
  return rows.slice(1).map((row, position) => {
    const metricId = get(row, 'metric_id'), periodType = get(row, 'period_type'), periodEnd = get(row, 'period_end'), rawValue = get(row, 'value'), evidenceText = get(row, 'evidence_id')
    if (!metricId || !periodType || !periodEnd || rawValue === undefined || !evidenceText) throw new Error(`Facts CSV row ${position + 2} is missing a required value`)
    if (periodType !== 'duration' && periodType !== 'instant') throw new Error(`Facts CSV row ${position + 2} has invalid period_type`)
    validateIsoDate(periodEnd, `Facts CSV row ${position + 2} period_end`)
    const periodStart = get(row, 'period_start')
    if (periodType === 'duration' && !periodStart) throw new Error(`Facts CSV row ${position + 2} is missing period_start for a duration fact`)
    if (periodType === 'instant' && periodStart) throw new Error(`Facts CSV row ${position + 2} must not set period_start for an instant fact`)
    if (periodStart) { validateIsoDate(periodStart, `Facts CSV row ${position + 2} period_start`); if (periodStart > periodEnd) throw new Error(`Facts CSV row ${position + 2} has period_start after period_end`) }
    const numericValue = Number(rawValue)
    const value: number | string | boolean = rawValue.toLowerCase() === 'true' ? true : rawValue.toLowerCase() === 'false' ? false : Number.isFinite(numericValue) && rawValue !== '' ? numericValue : rawValue
    const unit = get(row, 'unit'), dimensions = parseDimensions(get(row, 'dimensions')), sourceReportedAt = get(row, 'source_reported_at'), observedAt = get(row, 'observed_at'), companyIndustryId = get(row, 'company_industry_id'), businessLineId = get(row, 'business_line_id')
    return {
      metricId, periodType, periodEnd, value, ...(periodStart ? { periodStart } : {}), ...(unit ? { unit } : {}), ...(dimensions ? { dimensions } : {}),
      evidenceIds: evidenceText.split(';').map((id) => id.trim()).filter(Boolean), ingestionMethod: get(row, 'ingestion_method') ?? 'csv_import', verificationStatus: get(row, 'verification_status') ?? 'unverified',
      ...(sourceReportedAt ? { sourceReportedAt } : {}), ...(observedAt ? { observedAt } : {}), ...(companyIndustryId ? { companyIndustryId } : {}), ...(businessLineId ? { businessLineId } : {}),
    }
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
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (char === '"') { if (quoted && input[i + 1] === '"') { field += '"'; i += 1 } else quoted = !quoted }
    else if (char === ',' && !quoted) { row.push(field); field = '' }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && input[i + 1] === '\n') i += 1; row.push(field); rows.push(row); row = []; field = '' }
    else field += char
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

function validateIsoDate(value: string, field: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); const parsed = match ? new Date(`${value}T00:00:00Z`) : undefined
  if (!match || !parsed || Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() !== Number(match[1]) || parsed.getUTCMonth() + 1 !== Number(match[2]) || parsed.getUTCDate() !== Number(match[3])) throw new Error(`${field} must be an ISO date (YYYY-MM-DD)`)
}
