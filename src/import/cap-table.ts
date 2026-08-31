import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { EquityArchive } from '../archive/archive-service.js'
import { EquityDataEngine } from '../data/data-engine.js'

export interface CapTableCsvRow { asOfDate: string; shareClassName: string; securityType: string; exchange?: string | undefined; ticker?: string | undefined; currency?: string | undefined; sharesOutstanding: number; percentageOfTotalEquity?: number | undefined; holderName?: string | undefined; holderId?: string | undefined; shares?: number | undefined; ownershipPct?: number | undefined; rank?: number | undefined; sourceId?: string | undefined; evidenceId?: string | undefined }

export async function importCapTableCsv(filePath: string, archive: EquityArchive, companyId: string, apply = false): Promise<{ filePath: string; rows: number; snapshots: number; snapshotIds: string[]; skippedSnapshots: number }> {
  const rows = parseCapTableCsv(await readFile(resolve(filePath), 'utf8')); const result = apply ? importCapTableRows(rows, archive, companyId) : { snapshotIds: [], skippedSnapshots: 0 }
  return { filePath: resolve(filePath), rows: rows.length, snapshots: new Set(rows.map((row) => row.asOfDate)).size, ...result }
}

export function importCapTableCsvText(csv: string, archive: EquityArchive, companyId: string, apply = false): { rows: number; snapshots: number; snapshotIds: string[]; skippedSnapshots: number } {
  const rows = parseCapTableCsv(csv); const result = apply ? importCapTableRows(rows, archive, companyId) : { snapshotIds: [], skippedSnapshots: 0 }
  return { rows: rows.length, snapshots: new Set(rows.map((row) => row.asOfDate)).size, ...result }
}

function importCapTableRows(rows: CapTableCsvRow[], archive: EquityArchive, companyId: string): { snapshotIds: string[]; skippedSnapshots: number } {
  const engine = new EquityDataEngine(archive), shareClasses = new Map<string, string>()
  for (const shareClass of engine.listShareClasses(companyId)) shareClasses.set(shareClassKey(shareClass.name, shareClass.securityType, shareClass.exchange, shareClass.ticker, shareClass.currency), shareClass.shareClassId)
  const snapshots = new Map<string, CapTableCsvRow[]>(); for (const row of rows) snapshots.set(row.asOfDate, [...(snapshots.get(row.asOfDate) ?? []), row])
  const existingDates = new Set(engine.listCapTable(companyId).map((snapshot) => snapshot.asOfDate))
  let skippedSnapshots = 0
  const snapshotIds = [...snapshots.entries()].flatMap(([asOfDate, snapshotRows]) => {
    if (existingDates.has(asOfDate)) { skippedSnapshots += 1; return [] }
    for (const row of snapshotRows) {
      const key = shareClassKey(row.shareClassName, row.securityType, row.exchange ?? null, row.ticker ?? null, row.currency ?? null)
      if (!shareClasses.has(key)) shareClasses.set(key, engine.createShareClass(companyId, { name: row.shareClassName, securityType: row.securityType, exchange: row.exchange, ticker: row.ticker, currency: row.currency }))
    }
    return [engine.createCapTableSnapshot(companyId, { asOfDate, sourceId: snapshotRows[0]?.sourceId, evidenceId: snapshotRows[0]?.evidenceId, classTotals: [...new Map(snapshotRows.map((row) => [shareClassKey(row.shareClassName, row.securityType, row.exchange ?? null, row.ticker ?? null, row.currency ?? null), row])).values()].map((row) => ({ shareClassId: shareClasses.get(shareClassKey(row.shareClassName, row.securityType, row.exchange ?? null, row.ticker ?? null, row.currency ?? null))!, sharesOutstanding: row.sharesOutstanding, percentageOfTotalEquity: row.percentageOfTotalEquity })), positions: snapshotRows.filter((row) => row.holderName).map((row) => ({ holderName: row.holderName!, holderId: row.holderId, shareClassId: shareClasses.get(shareClassKey(row.shareClassName, row.securityType, row.exchange ?? null, row.ticker ?? null, row.currency ?? null))!, shares: row.shares, ownershipPct: row.ownershipPct, rank: row.rank })) })]
  })
  return { snapshotIds, skippedSnapshots }
}

export function parseCapTableCsv(csv: string): CapTableCsvRow[] {
  const rows = parseCsv(csv); if (rows.length < 2) return []
  const headers = rows[0]!.map((header) => header.trim()); const index = new Map(headers.map((header, position) => [header, position]))
  for (const field of ['as_of_date', 'share_class_name', 'security_type', 'shares_outstanding']) if (index.get(field) === undefined) throw new Error(`Cap table CSV is missing required column: ${field}`)
  const get = (row: string[], name: string): string | undefined => { const value = row[index.get(name) ?? -1]?.trim(); return value || undefined }
  const number = (value: string | undefined, field: string, position: number, required = false): number | undefined => { if (!value) { if (required) throw new Error(`Cap table CSV row ${position + 2} is missing ${field}`); return undefined } const result = Number(value); if (!Number.isFinite(result) || result < 0) throw new Error(`Cap table CSV row ${position + 2} has invalid ${field}`); return result }
  return rows.slice(1).filter((row) => row.some(Boolean)).map((row, position) => {
    const asOfDate = get(row, 'as_of_date') ?? (() => { throw new Error(`Cap table CSV row ${position + 2} is missing as_of_date`) })()
    const shareClassName = get(row, 'share_class_name') ?? (() => { throw new Error(`Cap table CSV row ${position + 2} is missing share_class_name`) })()
    const securityType = get(row, 'security_type') ?? (() => { throw new Error(`Cap table CSV row ${position + 2} is missing security_type`) })()
    validateIsoDate(asOfDate, `Cap table CSV row ${position + 2} as_of_date`)
    const percentageOfTotalEquity = number(get(row, 'percentage_of_total_equity'), 'percentage_of_total_equity', position)
    const ownershipPct = number(get(row, 'ownership_pct'), 'ownership_pct', position)
    const rank = number(get(row, 'rank'), 'rank', position)
    if (percentageOfTotalEquity !== undefined && percentageOfTotalEquity > 100) throw new Error(`Cap table CSV row ${position + 2} has percentage_of_total_equity above 100`)
    if (ownershipPct !== undefined && ownershipPct > 100) throw new Error(`Cap table CSV row ${position + 2} has ownership_pct above 100`)
    if (rank !== undefined && !Number.isInteger(rank)) throw new Error(`Cap table CSV row ${position + 2} has non-integer rank`)
    return { asOfDate, shareClassName, securityType, exchange: get(row, 'exchange'), ticker: get(row, 'ticker'), currency: get(row, 'currency'), sharesOutstanding: number(get(row, 'shares_outstanding'), 'shares_outstanding', position, true)!, percentageOfTotalEquity, holderName: get(row, 'holder_name'), holderId: get(row, 'holder_id'), shares: number(get(row, 'shares'), 'shares', position), ownershipPct, rank, sourceId: get(row, 'source_id'), evidenceId: get(row, 'evidence_id') }
  })
}

function parseCsv(input: string): string[][] { const rows: string[][] = []; let row: string[] = [], field = '', quoted = false; for (let i = 0; i < input.length; i += 1) { const char = input[i]; if (char === '"') { if (quoted && input[i + 1] === '"') { field += '"'; i += 1 } else quoted = !quoted } else if (char === ',' && !quoted) { row.push(field); field = '' } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && input[i + 1] === '\n') i += 1; row.push(field); rows.push(row); row = []; field = '' } else field += char } if (field || row.length) { row.push(field); rows.push(row) } return rows }

function validateIsoDate(value: string, field: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); const parsed = match ? new Date(`${value}T00:00:00Z`) : undefined
  if (!match || !parsed || Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() !== Number(match[1]) || parsed.getUTCMonth() + 1 !== Number(match[2]) || parsed.getUTCDate() !== Number(match[3])) throw new Error(`${field} must be an ISO date (YYYY-MM-DD)`)
}

function shareClassKey(name: string, securityType: string, exchange: string | null, ticker: string | null, currency: string | null): string {
  return [name, securityType, exchange ?? '', ticker ?? '', currency ?? ''].map((value) => value.trim().toLocaleLowerCase()).join('|')
}
