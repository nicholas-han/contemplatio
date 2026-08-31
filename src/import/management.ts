import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { EquityArchive } from '../archive/archive-service.js'
import { EquityDataEngine } from '../data/data-engine.js'

export interface ManagementCsvRow {
  nameZh?: string | undefined; nameEn?: string | undefined; birthYear?: number | undefined; biography?: string | undefined
  unitName?: string | undefined; unitType?: string | undefined; roleTitleRaw: string; roleType?: string | undefined; positionNameNormalized?: string | undefined
  startDate: string; endDate?: string | undefined; isCurrent: boolean; sourceId?: string | undefined; evidenceId?: string | undefined
}

export async function importManagementCsv(filePath: string, archive: EquityArchive, companyId: string, apply = false): Promise<{ filePath: string; rows: number; imported: number; assignmentIds: string[] }> {
  const rows = parseManagementCsv(await readFile(resolve(filePath), 'utf8'))
  const assignmentIds = apply ? importManagementRows(rows, archive, companyId) : []
  return { filePath: resolve(filePath), rows: rows.length, imported: assignmentIds.length, assignmentIds }
}

export function importManagementCsvText(csv: string, archive: EquityArchive, companyId: string, apply = false): { rows: number; imported: number; assignmentIds: string[] } {
  const rows = parseManagementCsv(csv); const assignmentIds = apply ? importManagementRows(rows, archive, companyId) : []
  return { rows: rows.length, imported: assignmentIds.length, assignmentIds }
}

function importManagementRows(rows: ManagementCsvRow[], archive: EquityArchive, companyId: string): string[] {
  const engine = new EquityDataEngine(archive)
  const people = new Map<string, string>(), units = new Map<string, string>(), positions = new Map<string, string>(), existingAssignments = new Map<string, string>()
  for (const person of engine.listPeople(companyId)) {
    const key = `${normalize(person.nameZh)}|${normalize(person.nameEn)}`
    if (key !== '|') people.set(key, person.personId)
    for (const assignment of person.assignments) existingAssignments.set(`${person.personId}|${assignment.positionId}|${assignment.startDate}|${assignment.endDate ?? ''}`, assignment.assignmentId)
  }
  for (const unit of engine.listOrganizationUnits(companyId)) units.set(normalize(unit.name), unit.organizationUnitId)
  for (const position of engine.listPositions(companyId)) positions.set(`${normalize(position.roleTitleRaw)}|${normalize(position.roleType)}|${position.organizationUnitId ?? ''}`, position.positionId)
  const assignments: string[] = []
  for (const row of rows) {
    const personKey = `${normalize(row.nameZh)}|${normalize(row.nameEn)}`
    let personId = people.get(personKey)
    if (!personId) { personId = engine.createPerson(companyId, { nameZh: row.nameZh, nameEn: row.nameEn, birthYear: row.birthYear, biography: row.biography }); people.set(personKey, personId) }
    let unitId: string | undefined
    if (row.unitName) { const unitKey = normalize(row.unitName); unitId = units.get(unitKey); if (!unitId) { unitId = engine.createOrganizationUnit(companyId, { name: row.unitName, unitType: row.unitType ?? 'department' }); units.set(unitKey, unitId) } }
    const positionKey = `${normalize(row.roleTitleRaw)}|${normalize(row.roleType)}|${unitId ?? ''}`
    let positionId = positions.get(positionKey)
    if (!positionId) { positionId = engine.createPosition(companyId, { roleTitleRaw: row.roleTitleRaw, roleType: row.roleType, positionNameNormalized: row.positionNameNormalized, organizationUnitId: unitId }); positions.set(positionKey, positionId) }
    const assignmentKey = `${personId}|${positionId}|${row.startDate}|${row.endDate ?? ''}`
    const existingAssignment = existingAssignments.get(assignmentKey)
    if (existingAssignment) assignments.push(existingAssignment)
    else {
      const assignmentId = engine.assignRole(companyId, { personId, positionId, startDate: row.startDate, endDate: row.endDate, isCurrent: row.isCurrent, sourceId: row.sourceId, evidenceId: row.evidenceId })
      existingAssignments.set(assignmentKey, assignmentId); assignments.push(assignmentId)
    }
  }
  return assignments
}

export function parseManagementCsv(csv: string): ManagementCsvRow[] {
  const rows = parseCsv(csv); if (rows.length < 2) return []
  const headers = rows[0]!.map((header) => header.trim()); const index = new Map(headers.map((header, position) => [header, position]))
  for (const field of ['role_title_raw', 'start_date']) if (index.get(field) === undefined) throw new Error(`Management CSV is missing required column: ${field}`)
  const get = (row: string[], name: string): string | undefined => { const value = row[index.get(name) ?? -1]?.trim(); return value || undefined }
  return rows.slice(1).filter((row) => row.some(Boolean)).map((row, position) => {
    const roleTitleRaw = get(row, 'role_title_raw'), startDate = get(row, 'start_date')
    if (!roleTitleRaw || !startDate || (!get(row, 'name_zh') && !get(row, 'name_en'))) throw new Error(`Management CSV row ${position + 2} is missing a name, role_title_raw, or start_date`)
    const birthYearRaw = get(row, 'birth_year'); const birthYear = birthYearRaw ? Number(birthYearRaw) : undefined
    if (birthYearRaw && (!Number.isInteger(birthYear) || birthYear! < 1800 || birthYear! > new Date().getUTCFullYear())) throw new Error(`Management CSV row ${position + 2} has invalid birth_year`)
    validateIsoDate(startDate, `Management CSV row ${position + 2} start_date`)
    const endDate = get(row, 'end_date'); if (endDate) validateIsoDate(endDate, `Management CSV row ${position + 2} end_date`)
    if (endDate && startDate > endDate) throw new Error(`Management CSV row ${position + 2} has end_date before start_date`)
    return { nameZh: get(row, 'name_zh'), nameEn: get(row, 'name_en'), birthYear, biography: get(row, 'biography'), unitName: get(row, 'unit_name'), unitType: get(row, 'unit_type'), roleTitleRaw, roleType: get(row, 'role_type'), positionNameNormalized: get(row, 'position_name_normalized'), startDate, endDate, isCurrent: ['1', 'true', 'yes'].includes((get(row, 'is_current') ?? '').toLowerCase()), sourceId: get(row, 'source_id'), evidenceId: get(row, 'evidence_id') }
  })
}

function parseCsv(input: string): string[][] { const rows: string[][] = []; let row: string[] = [], field = '', quoted = false; for (let i = 0; i < input.length; i += 1) { const char = input[i]; if (char === '"') { if (quoted && input[i + 1] === '"') { field += '"'; i += 1 } else quoted = !quoted } else if (char === ',' && !quoted) { row.push(field); field = '' } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && input[i + 1] === '\n') i += 1; row.push(field); rows.push(row); row = []; field = '' } else field += char } if (field || row.length) { row.push(field); rows.push(row) } return rows }

function validateIsoDate(value: string, field: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); const parsed = match ? new Date(`${value}T00:00:00Z`) : undefined
  if (!match || !parsed || Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() !== Number(match[1]) || parsed.getUTCMonth() + 1 !== Number(match[2]) || parsed.getUTCDate() !== Number(match[3])) throw new Error(`${field} must be an ISO date (YYYY-MM-DD)`)
}

function normalize(value: string | null | undefined): string { return (value ?? '').trim().toLocaleLowerCase() }
