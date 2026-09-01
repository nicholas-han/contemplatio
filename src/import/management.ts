import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { EquityArchive } from '../archive/archive-service.js'
import { EquityDataEngine } from '../data/data-engine.js'

export interface ManagementCsvRow {
  nameZh?: string | undefined; nameEn?: string | undefined; birthYear?: number | undefined; biography?: string | undefined
  unitName?: string | undefined; unitType?: string | undefined; roleTitleRaw: string; roleType?: string | undefined; positionNameNormalized?: string | undefined
  startDate: string; endDate?: string | undefined; isCurrent: boolean; sourceId?: string | undefined; evidenceId?: string | undefined
  managerRoleTitleRaw?: string | undefined; managerRoleType?: string | undefined; managerUnitName?: string | undefined; managerUnitType?: string | undefined
  reportingRelationshipType?: 'solid' | 'dotted' | undefined; reportingStartDate?: string | undefined; reportingEndDate?: string | undefined
}

export async function importManagementCsv(filePath: string, archive: EquityArchive, companyId: string, apply = false): Promise<{ filePath: string; rows: number; imported: number; assignmentIds: string[]; reportingLineIds: string[] }> {
  const rows = parseManagementCsv(await readFile(resolve(filePath), 'utf8'))
  const result = apply ? importManagementRows(rows, archive, companyId) : { assignmentIds: [], reportingLineIds: [] }
  return { filePath: resolve(filePath), rows: rows.length, imported: result.assignmentIds.length, ...result }
}

export function importManagementCsvText(csv: string, archive: EquityArchive, companyId: string, apply = false): { rows: number; imported: number; assignmentIds: string[]; reportingLineIds: string[] } {
  const rows = parseManagementCsv(csv); const result = apply ? importManagementRows(rows, archive, companyId) : { assignmentIds: [], reportingLineIds: [] }
  return { rows: rows.length, imported: result.assignmentIds.length, ...result }
}

function importManagementRows(rows: ManagementCsvRow[], archive: EquityArchive, companyId: string): { assignmentIds: string[]; reportingLineIds: string[] } {
  const engine = new EquityDataEngine(archive)
  const people = new Map<string, string>(), units = new Map<string, string>(), positions = new Map<string, string>(), existingAssignments = new Map<string, string>(), existingReportingLines = new Map<string, string>()
  for (const person of engine.listPeople(companyId)) {
    for (const key of personAliases(person.nameZh, person.nameEn)) people.set(key, person.personId)
    for (const assignment of person.assignments) existingAssignments.set(`${person.personId}|${assignment.positionId}|${assignment.startDate}|${assignment.endDate ?? ''}`, assignment.assignmentId)
  }
  for (const unit of engine.listOrganizationUnits(companyId)) units.set(normalize(unit.name), unit.organizationUnitId)
  for (const position of engine.listPositions(companyId)) positions.set(`${normalize(position.roleTitleRaw)}|${normalize(position.roleType)}|${position.organizationUnitId ?? ''}`, position.positionId)
  for (const line of engine.listReportingLines(companyId)) existingReportingLines.set(`${line.subordinatePositionId}|${line.managerPositionId}|${line.startDate}|${line.endDate ?? ''}|${line.relationshipType}`, line.reportingLineId)
  const assignmentIds: string[] = [], reportingLineIds: string[] = []
  return engine.withTransaction(companyId, (database) => {
  for (const row of rows) {
    const personKeys = personAliases(row.nameZh, row.nameEn)
    let personId = personKeys.map((key) => people.get(key)).find((id): id is string => Boolean(id))
    if (!personId) { personId = engine.createPerson(companyId, { nameZh: row.nameZh, nameEn: row.nameEn, birthYear: row.birthYear, biography: row.biography }, database); for (const key of personKeys) people.set(key, personId) }
    const unitId = ensureUnit(row.unitName, row.unitType, database)
    const positionId = ensurePosition(row.roleTitleRaw, row.roleType, row.positionNameNormalized, unitId, database)
    const assignmentKey = `${personId}|${positionId}|${row.startDate}|${row.endDate ?? ''}`
    const existingAssignment = existingAssignments.get(assignmentKey)
    if (existingAssignment) assignmentIds.push(existingAssignment)
    else {
      const assignmentId = engine.assignRole(companyId, { personId, positionId, startDate: row.startDate, endDate: row.endDate, isCurrent: row.isCurrent, sourceId: row.sourceId, evidenceId: row.evidenceId }, database)
      existingAssignments.set(assignmentKey, assignmentId); assignmentIds.push(assignmentId)
    }
    if (row.managerRoleTitleRaw) {
      const managerUnitId = ensureUnit(row.managerUnitName, row.managerUnitType, database)
      const managerPositionId = ensurePosition(row.managerRoleTitleRaw, row.managerRoleType, undefined, managerUnitId, database)
      const startDate = row.reportingStartDate ?? row.startDate; const endDate = row.reportingEndDate ?? row.endDate; const relationshipType = row.reportingRelationshipType ?? 'solid'
      const lineKey = `${positionId}|${managerPositionId}|${startDate}|${endDate ?? ''}|${relationshipType}`
      const existingLine = existingReportingLines.get(lineKey)
      if (existingLine) reportingLineIds.push(existingLine)
      else {
        const reportingLineId = engine.addReportingLine(companyId, { subordinatePositionId: positionId, managerPositionId, relationshipType, startDate, endDate, evidenceId: row.evidenceId }, database)
        existingReportingLines.set(lineKey, reportingLineId); reportingLineIds.push(reportingLineId)
      }
    }
  }
  return { assignmentIds, reportingLineIds }
  })

  function ensureUnit(name: string | undefined, type: string | undefined, database: DatabaseSync): string | undefined {
    if (!name) return undefined
    const key = normalize(name); const existing = units.get(key)
    if (existing) return existing
    const id = engine.createOrganizationUnit(companyId, { name, unitType: type ?? 'department' }, database); units.set(key, id); return id
  }

  function ensurePosition(title: string, type: string | undefined, normalizedTitle: string | undefined, organizationUnitId: string | undefined, database: DatabaseSync): string {
    const key = `${normalize(title)}|${normalize(type)}|${organizationUnitId ?? ''}`; const existing = positions.get(key)
    if (existing) return existing
    const id = engine.createPosition(companyId, { roleTitleRaw: title, roleType: type, positionNameNormalized: normalizedTitle, organizationUnitId }, database); positions.set(key, id); return id
  }
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
    const reportingStartDate = get(row, 'reporting_start_date'); if (reportingStartDate) validateIsoDate(reportingStartDate, `Management CSV row ${position + 2} reporting_start_date`)
    const reportingEndDate = get(row, 'reporting_end_date'); if (reportingEndDate) validateIsoDate(reportingEndDate, `Management CSV row ${position + 2} reporting_end_date`)
    if (reportingStartDate && reportingEndDate && reportingStartDate > reportingEndDate) throw new Error(`Management CSV row ${position + 2} has reporting_end_date before reporting_start_date`)
    const relationship = get(row, 'reporting_relationship_type'); if (relationship && relationship !== 'solid' && relationship !== 'dotted') throw new Error(`Management CSV row ${position + 2} has invalid reporting_relationship_type`)
    return { nameZh: get(row, 'name_zh'), nameEn: get(row, 'name_en'), birthYear, biography: get(row, 'biography'), unitName: get(row, 'unit_name'), unitType: get(row, 'unit_type'), roleTitleRaw, roleType: get(row, 'role_type'), positionNameNormalized: get(row, 'position_name_normalized'), startDate, endDate, isCurrent: ['1', 'true', 'yes'].includes((get(row, 'is_current') ?? '').toLowerCase()), sourceId: get(row, 'source_id'), evidenceId: get(row, 'evidence_id'), managerRoleTitleRaw: get(row, 'manager_role_title_raw'), managerRoleType: get(row, 'manager_role_type'), managerUnitName: get(row, 'manager_unit_name'), managerUnitType: get(row, 'manager_unit_type'), reportingRelationshipType: relationship as 'solid' | 'dotted' | undefined, reportingStartDate, reportingEndDate }
  })
}

function parseCsv(input: string): string[][] { const rows: string[][] = []; let row: string[] = [], field = '', quoted = false; for (let i = 0; i < input.length; i += 1) { const char = input[i]; if (char === '"') { if (quoted && input[i + 1] === '"') { field += '"'; i += 1 } else quoted = !quoted } else if (char === ',' && !quoted) { row.push(field); field = '' } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && input[i + 1] === '\n') i += 1; row.push(field); rows.push(row); row = []; field = '' } else field += char } if (field || row.length) { row.push(field); rows.push(row) } return rows }

function validateIsoDate(value: string, field: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); const parsed = match ? new Date(`${value}T00:00:00Z`) : undefined
  if (!match || !parsed || Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() !== Number(match[1]) || parsed.getUTCMonth() + 1 !== Number(match[2]) || parsed.getUTCDate() !== Number(match[3])) throw new Error(`${field} must be an ISO date (YYYY-MM-DD)`)
}

function normalize(value: string | null | undefined): string { return (value ?? '').trim().toLocaleLowerCase() }

function personAliases(nameZh: string | null | undefined, nameEn: string | null | undefined): string[] {
  return [nameZh, nameEn].map((name) => normalize(name)).filter(Boolean).map((name) => `name:${name}`)
}
