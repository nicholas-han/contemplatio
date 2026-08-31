import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { EquityArchive } from '../archive/archive-service.js'

export interface FactInput {
  metricId: string
  periodType: 'duration' | 'instant'
  periodStart?: string
  periodEnd: string
  value: number | string | boolean
  unit?: string
  dimensions?: Record<string, string>
  evidenceIds: string[]
  ingestionMethod: string
  verificationStatus: string
  sourceReportedAt?: string
  observedAt?: string
  companyIndustryId?: string
  businessLineId?: string
}

export interface FactRecord {
  factId: string
  metricId: string
  periodType: 'duration' | 'instant'
  periodStart: string | null
  periodEnd: string
  value: number | string | boolean
  unit: string | null
  dimensions: Record<string, string> | null
  verificationStatus: string
}

export interface EstimateInput {
  metricId: string
  targetPeriodType: 'duration' | 'instant'
  targetPeriodStart?: string
  targetPeriodEnd: string
  asOf: string
  provider: string
  analyst?: string
  estimateType: string
  value: number | string
  unit?: string
  dimensions?: Record<string, string>
  evidenceIds: string[]
  ingestionMethod: string
  verificationStatus: string
  publishedAt?: string
  observedAt?: string
}

export interface EstimateRecord {
  estimateId: string
  metricId: string
  targetPeriodType: 'duration' | 'instant'
  targetPeriodStart: string | null
  targetPeriodEnd: string
  asOf: string
  provider: string
  analyst: string | null
  estimateType: string
  value: number | string
  unit: string | null
  dimensions: Record<string, string> | null
  verificationStatus: string
}

export interface EvidenceRecord {
  evidenceId: string
  artifactId: string
  locatorType: string
  locator: Record<string, unknown>
  excerptText: string | null
  notes: string | null
}

export interface PersonRecord { personId: string; nameZh: string | null; nameEn: string | null; birthYear: number | null; biography: string | null }
export interface PositionRecord { positionId: string; roleType: string | null; roleTitleRaw: string; positionNameNormalized: string | null; organizationUnitId: string | null }
export interface RoleAssignmentRecord { assignmentId: string; personId: string; positionId: string; startDate: string; endDate: string | null; isCurrent: boolean }
export interface ReportingLineRecord { reportingLineId: string; subordinatePositionId: string; managerPositionId: string; relationshipType: 'solid' | 'dotted'; startDate: string; endDate: string | null }

export interface FactFilter {
  metricId?: string
  periodStartFrom?: string
  periodEndTo?: string
  limit?: number
}

export interface LegacyObservationRecord {
  observationId: string
  legacyMetricId: string
  mappedMetricId: string | null
  periodKind: string
  periodStart: string | null
  periodEnd: string | null
  value: string | null
  unit: string | null
  dimensions: string | null
  reviewStatus: string
  sourceLocator: string | null
  evidenceId: string | null
  promotedFactId: string | null
}

export interface IndustryInput {
  industryId: string
  isPrimary?: boolean
}

export interface BusinessLineInput {
  businessLineTypeId: string
  displayName: string
}

export class EquityDataEngine {
  constructor(readonly archive: EquityArchive) {}

  listFacts(companyId: string, filter: FactFilter = {}): FactRecord[] {
    return this.archive.withDatabase(companyId, (database) => {
      const clauses = ['1 = 1']
      const parameters: Array<string | number> = []
      if (filter.metricId) { clauses.push('metric_id = ?'); parameters.push(filter.metricId) }
      if (filter.periodStartFrom) { clauses.push('(period_start IS NULL OR period_start >= ?)'); parameters.push(filter.periodStartFrom) }
      if (filter.periodEndTo) { clauses.push('period_end <= ?'); parameters.push(filter.periodEndTo) }
      const limit = Math.max(1, Math.min(filter.limit ?? 500, 5000))
      parameters.push(limit)
      const rows = database.prepare(`SELECT fact_id, metric_id, period_type, period_start, period_end,
          value_number, value_text, value_boolean, unit, dimensions_json, verification_status
        FROM facts WHERE ${clauses.join(' AND ')} ORDER BY period_end, fact_id LIMIT ?`).all(...parameters) as Array<Record<string, unknown>>
      return rows.map(toFactRecord)
    })
  }

  getFact(companyId: string, factId: string): FactRecord {
    return this.archive.withDatabase(companyId, (database) => {
      const row = database.prepare(`SELECT fact_id, metric_id, period_type, period_start, period_end,
          value_number, value_text, value_boolean, unit, dimensions_json, verification_status
        FROM facts WHERE fact_id = ?`).get(factId) as Record<string, unknown> | undefined
      if (!row) throw new Error(`Unknown fact: ${factId}`)
      return toFactRecord(row)
    })
  }

  listEstimates(companyId: string, metricId?: string): EstimateRecord[] {
    return this.archive.withDatabase(companyId, (database) => {
      const rows = metricId
        ? database.prepare('SELECT * FROM estimates WHERE metric_id = ? ORDER BY target_period_end, as_of, estimate_id').all(metricId)
        : database.prepare('SELECT * FROM estimates ORDER BY target_period_end, as_of, estimate_id').all()
      return (rows as Array<Record<string, unknown>>).map(toEstimateRecord)
    })
  }

  createEstimate(companyId: string, input: EstimateInput): string {
    validateDate(input.targetPeriodEnd, 'targetPeriodEnd')
    validateDate(input.asOf, 'asOf')
    if (input.targetPeriodType === 'duration') {
      if (!input.targetPeriodStart) throw new Error('duration estimates require targetPeriodStart')
      validateDate(input.targetPeriodStart, 'targetPeriodStart')
      if (input.targetPeriodStart > input.targetPeriodEnd) throw new Error('targetPeriodStart must not be after targetPeriodEnd')
    } else if (input.targetPeriodStart) throw new Error('instant estimates must not have targetPeriodStart')
    if (!input.provider.trim()) throw new Error('estimates require provider')
    if (!input.estimateType.trim()) throw new Error('estimates require estimateType')
    if (!input.evidenceIds.length) throw new Error('estimates require at least one local Evidence')

    return this.archive.withDatabase(companyId, (database) => {
      const metric = database.prepare(`SELECT value_type, allowed_dimensions_json FROM metric_definitions WHERE metric_id = ? AND active = 1`).get(input.metricId) as {
        value_type: 'number' | 'text' | 'boolean'; allowed_dimensions_json: string
      } | undefined
      if (!metric || metric.value_type === 'boolean') throw new Error(`Estimate metric must be an active number or text metric: ${input.metricId}`)
      if (input.dimensions && Object.keys(input.dimensions).some((key) => !(JSON.parse(metric.allowed_dimensions_json) as string[]).includes(key))) {
        throw new Error(`Metric ${input.metricId} does not allow one or more dimensions`)
      }
      if (metric.value_type === 'number' && (typeof input.value !== 'number' || !Number.isFinite(input.value))) throw new Error('Estimate value must be a finite number')
      if (metric.value_type === 'text' && typeof input.value !== 'string') throw new Error('Estimate value must be text')
      for (const evidenceId of input.evidenceIds) {
        if (!database.prepare('SELECT evidence_id FROM evidence WHERE evidence_id = ?').get(evidenceId)) throw new Error(`Unknown Evidence: ${evidenceId}`)
      }
      const estimateId = `estimate-${randomUUID()}`
      const now = new Date().toISOString()
      database.exec('BEGIN IMMEDIATE')
      try {
        database.prepare(`INSERT INTO estimates (
          estimate_id, metric_id, target_period_type, target_period_start, target_period_end, as_of,
          published_at, observed_at, provider, analyst, estimate_type, value_number, value_text,
          unit, dimensions_json, ingestion_method, verification_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          estimateId, input.metricId, input.targetPeriodType, input.targetPeriodStart ?? null, input.targetPeriodEnd,
          input.asOf, input.publishedAt ?? null, input.observedAt ?? null, input.provider, input.analyst ?? null,
          input.estimateType, typeof input.value === 'number' ? input.value : null, typeof input.value === 'string' ? input.value : null,
          input.unit ?? null, input.dimensions ? JSON.stringify(input.dimensions) : null, input.ingestionMethod,
          input.verificationStatus, now,
        )
        const link = database.prepare('INSERT INTO estimate_evidence (estimate_id, evidence_id) VALUES (?, ?)')
        for (const evidenceId of input.evidenceIds) link.run(estimateId, evidenceId)
        database.exec('COMMIT')
      } catch (error) { database.exec('ROLLBACK'); throw error }
      return estimateId
    })
  }

  listLegacyObservations(companyId: string, reviewStatus?: string): LegacyObservationRecord[] {
    return this.archive.withDatabase(companyId, (database) => {
      const rows = reviewStatus
        ? database.prepare('SELECT * FROM legacy_observations WHERE review_status = ? ORDER BY observation_id').all(reviewStatus)
        : database.prepare('SELECT * FROM legacy_observations ORDER BY observation_id').all()
      return (rows as Array<Record<string, unknown>>).map((row) => ({
        observationId: String(row.observation_id), legacyMetricId: String(row.legacy_metric_id),
        mappedMetricId: row.mapped_metric_id ? String(row.mapped_metric_id) : null,
        periodKind: String(row.period_kind), periodStart: row.period_start ? String(row.period_start) : null,
        periodEnd: row.period_end ? String(row.period_end) : null, value: row.value ? String(row.value) : null,
        unit: row.unit ? String(row.unit) : null, dimensions: row.dimensions_text ? String(row.dimensions_text) : null,
        reviewStatus: String(row.review_status), sourceLocator: row.source_locator ? String(row.source_locator) : null,
        evidenceId: row.evidence_id ? String(row.evidence_id) : null,
        promotedFactId: row.promoted_fact_id ? String(row.promoted_fact_id) : null,
      }))
    })
  }

  getEvidence(companyId: string, evidenceId: string): EvidenceRecord {
    return this.archive.withDatabase(companyId, (database) => {
      const row = database.prepare('SELECT evidence_id, artifact_id, locator_type, locator_json, excerpt_text, notes FROM evidence WHERE evidence_id = ?').get(evidenceId) as Record<string, unknown> | undefined
      if (!row) throw new Error(`Unknown Evidence: ${evidenceId}`)
      return {
        evidenceId: String(row.evidence_id), artifactId: String(row.artifact_id), locatorType: String(row.locator_type),
        locator: JSON.parse(String(row.locator_json)) as Record<string, unknown>,
        excerptText: row.excerpt_text ? String(row.excerpt_text) : null, notes: row.notes ? String(row.notes) : null,
      }
    })
  }

  listPeople(companyId: string): Array<PersonRecord & { assignments: RoleAssignmentRecord[] }> {
    return this.archive.withDatabase(companyId, (database) => {
      const people = database.prepare('SELECT person_id, name_zh, name_en, birth_year, biography FROM people ORDER BY person_id').all() as Array<Record<string, unknown>>
      const assignments = database.prepare('SELECT assignment_id, person_id, position_id, start_date, end_date, is_current FROM role_assignments ORDER BY start_date, assignment_id').all() as Array<Record<string, unknown>>
      return people.map((person) => ({
        personId: String(person.person_id), nameZh: person.name_zh ? String(person.name_zh) : null,
        nameEn: person.name_en ? String(person.name_en) : null, birthYear: person.birth_year === null ? null : Number(person.birth_year),
        biography: person.biography ? String(person.biography) : null,
        assignments: assignments.filter((assignment) => assignment.person_id === person.person_id).map(toAssignmentRecord),
      }))
    })
  }

  createPerson(companyId: string, input: { nameZh?: string; nameEn?: string; birthYear?: number; biography?: string }): string {
    if (!input.nameZh?.trim() && !input.nameEn?.trim()) throw new Error('person requires nameZh or nameEn')
    return this.archive.withDatabase(companyId, (database) => {
      assertCompany(database, companyId)
      const id = `person-${randomUUID()}`; const now = new Date().toISOString()
      database.prepare('INSERT INTO people (person_id, name_zh, name_en, birth_year, biography, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, input.nameZh ?? null, input.nameEn ?? null, input.birthYear ?? null, input.biography ?? null, now, now)
      return id
    })
  }

  createPosition(companyId: string, input: { roleTitleRaw: string; roleType?: string; positionNameNormalized?: string; organizationUnitId?: string }): string {
    if (!input.roleTitleRaw.trim()) throw new Error('position requires roleTitleRaw')
    return this.archive.withDatabase(companyId, (database) => {
      assertCompany(database, companyId)
      if (input.organizationUnitId && !database.prepare('SELECT organization_unit_id FROM organization_units WHERE organization_unit_id = ? AND company_id = ?').get(input.organizationUnitId, companyId)) throw new Error('Unknown organization unit')
      const id = `position-${randomUUID()}`
      database.prepare('INSERT INTO positions (position_id, company_id, organization_unit_id, role_type, role_title_raw, position_name_normalized) VALUES (?, ?, ?, ?, ?, ?)').run(id, companyId, input.organizationUnitId ?? null, input.roleType ?? null, input.roleTitleRaw, input.positionNameNormalized ?? null)
      return id
    })
  }

  createOrganizationUnit(companyId: string, input: { name: string; unitType: string; parentUnitId?: string }): string {
    if (!input.name.trim() || !input.unitType.trim()) throw new Error('organization unit requires name and unitType')
    return this.archive.withDatabase(companyId, (database) => {
      assertCompany(database, companyId)
      if (input.parentUnitId && !database.prepare('SELECT organization_unit_id FROM organization_units WHERE organization_unit_id = ? AND company_id = ?').get(input.parentUnitId, companyId)) throw new Error('Unknown parent organization unit')
      const id = `org-unit-${randomUUID()}`
      database.prepare('INSERT INTO organization_units (organization_unit_id, company_id, parent_unit_id, name, unit_type) VALUES (?, ?, ?, ?, ?)').run(id, companyId, input.parentUnitId ?? null, input.name, input.unitType)
      return id
    })
  }

  assignRole(companyId: string, input: { personId: string; positionId: string; startDate: string; endDate?: string; isCurrent?: boolean; sourceId?: string; evidenceId?: string }): string {
    validateDate(input.startDate, 'startDate'); if (input.endDate) validateDate(input.endDate, 'endDate')
    if (input.endDate && input.startDate > input.endDate) throw new Error('startDate must not be after endDate')
    return this.archive.withDatabase(companyId, (database) => {
      assertCompany(database, companyId)
      if (!database.prepare('SELECT person_id FROM people WHERE person_id = ?').get(input.personId)) throw new Error('Unknown person')
      if (!database.prepare('SELECT position_id FROM positions WHERE position_id = ? AND company_id = ?').get(input.positionId, companyId)) throw new Error('Unknown position')
      const id = `assignment-${randomUUID()}`
      database.prepare('INSERT INTO role_assignments (assignment_id, company_id, person_id, position_id, start_date, end_date, is_current, source_id, evidence_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, companyId, input.personId, input.positionId, input.startDate, input.endDate ?? null, input.isCurrent ? 1 : 0, input.sourceId ?? null, input.evidenceId ?? null)
      return id
    })
  }

  addReportingLine(companyId: string, input: { subordinatePositionId: string; managerPositionId: string; relationshipType: 'solid' | 'dotted'; startDate: string; endDate?: string; evidenceId?: string }): string {
    validateDate(input.startDate, 'startDate'); if (input.endDate) validateDate(input.endDate, 'endDate')
    if (input.subordinatePositionId === input.managerPositionId) throw new Error('A position cannot report to itself')
    return this.archive.withDatabase(companyId, (database) => {
      assertCompany(database, companyId)
      for (const positionId of [input.subordinatePositionId, input.managerPositionId]) if (!database.prepare('SELECT position_id FROM positions WHERE position_id = ? AND company_id = ?').get(positionId, companyId)) throw new Error(`Unknown position: ${positionId}`)
      const id = `reporting-line-${randomUUID()}`
      database.prepare('INSERT INTO reporting_lines (reporting_line_id, company_id, subordinate_position_id, manager_position_id, relationship_type, start_date, end_date, evidence_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, companyId, input.subordinatePositionId, input.managerPositionId, input.relationshipType, input.startDate, input.endDate ?? null, input.evidenceId ?? null)
      return id
    })
  }

  createFact(companyId: string, input: FactInput): string {
    validateDate(input.periodEnd, 'periodEnd')
    if (input.periodType === 'duration') {
      if (!input.periodStart) throw new Error('duration facts require periodStart')
      validateDate(input.periodStart, 'periodStart')
      if (input.periodStart > input.periodEnd) throw new Error('periodStart must not be after periodEnd')
    } else if (input.periodStart) throw new Error('instant facts must not have periodStart')
    if (!input.evidenceIds.length) throw new Error('facts require at least one local Evidence')

    return this.archive.withDatabase(companyId, (database) => {
      const metric = database.prepare(`SELECT metric_id, value_type, period_behavior, allowed_dimensions_json
        FROM metric_definitions WHERE metric_id = ? AND active = 1`).get(input.metricId) as {
          metric_id: string; value_type: 'number' | 'text' | 'boolean'; period_behavior: 'duration' | 'instant'; allowed_dimensions_json: string
        } | undefined
      if (!metric) throw new Error(`Unknown active metric definition: ${input.metricId}`)
      if (metric.period_behavior !== input.periodType) throw new Error(`Metric ${input.metricId} requires ${metric.period_behavior} period`) 
      const dimensions = input.dimensions ?? null
      const allowed = JSON.parse(metric.allowed_dimensions_json) as string[]
      if (dimensions && Object.keys(dimensions).some((key) => !allowed.includes(key))) {
        throw new Error(`Metric ${input.metricId} does not allow one or more dimensions`)
      }
      const valueColumns = valueColumnsFor(metric.value_type, input.value)
      for (const evidenceId of input.evidenceIds) {
        const evidence = database.prepare('SELECT evidence_id FROM evidence WHERE evidence_id = ?').get(evidenceId)
        if (!evidence) throw new Error(`Unknown Evidence: ${evidenceId}`)
      }
      if (input.companyIndustryId) assertCompanyIndustry(database, companyId, input.companyIndustryId)
      if (input.businessLineId) assertBusinessLine(database, companyId, input.businessLineId)
      const factId = `fact-${randomUUID()}`
      const now = new Date().toISOString()
      database.exec('BEGIN IMMEDIATE')
      try {
        database.prepare(`INSERT INTO facts (
          fact_id, metric_id, company_industry_id, business_line_id, period_type, period_start,
          period_end, value_number, value_text, value_boolean, unit, source_reported_at,
          observed_at, dimensions_json, ingestion_method, verification_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          factId, input.metricId, input.companyIndustryId ?? null, input.businessLineId ?? null,
          input.periodType, input.periodStart ?? null, input.periodEnd, valueColumns.number,
          valueColumns.text, valueColumns.boolean, input.unit ?? null, input.sourceReportedAt ?? null,
          input.observedAt ?? null, dimensions ? JSON.stringify(dimensions) : null,
          input.ingestionMethod, input.verificationStatus, now, now,
        )
        const link = database.prepare('INSERT INTO fact_evidence (fact_id, evidence_id) VALUES (?, ?)')
        for (const evidenceId of input.evidenceIds) link.run(factId, evidenceId)
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
      return factId
    })
  }

  addIndustry(companyId: string, input: IndustryInput): string {
    return this.archive.withDatabase(companyId, (database) => {
      const company = database.prepare('SELECT company_id FROM companies WHERE company_id = ?').get(companyId)
      if (!company) throw new Error(`Unknown company: ${companyId}`)
      const industryId = `industry-${randomUUID()}`
      const now = new Date().toISOString()
      database.prepare(`INSERT INTO company_industries
        (company_industry_id, company_id, industry_id, is_primary, created_at)
        VALUES (?, ?, ?, ?, ?)`).run(industryId, companyId, input.industryId, input.isPrimary ? 1 : 0, now)
      return industryId
    })
  }

  addBusinessLine(companyId: string, companyIndustryId: string, input: BusinessLineInput): string {
    return this.archive.withDatabase(companyId, (database) => {
      assertCompanyIndustry(database, companyId, companyIndustryId)
      const businessLineId = `business-line-${randomUUID()}`
      const now = new Date().toISOString()
      database.prepare(`INSERT INTO business_lines
        (business_line_id, company_industry_id, business_line_type_id, display_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(
        businessLineId, companyIndustryId, input.businessLineTypeId, input.displayName, now, now,
      )
      return businessLineId
    })
  }
}

function valueColumnsFor(valueType: 'number' | 'text' | 'boolean', value: number | string | boolean): {
  number: number | null; text: string | null; boolean: number | null
} {
  if (valueType === 'number' && typeof value === 'number' && Number.isFinite(value)) return { number: value, text: null, boolean: null }
  if (valueType === 'text' && typeof value === 'string') return { number: null, text: value, boolean: null }
  if (valueType === 'boolean' && typeof value === 'boolean') return { number: null, text: null, boolean: value ? 1 : 0 }
  throw new Error(`Value does not match metric value_type ${valueType}`)
}

function validateDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${field} must be an ISO date (YYYY-MM-DD)`)
  }
}

function assertCompanyIndustry(database: DatabaseSync, companyId: string, id: string): void {
  const row = database.prepare('SELECT company_industry_id FROM company_industries WHERE company_industry_id = ? AND company_id = ? AND active = 1').get(id, companyId)
  if (!row) throw new Error(`Unknown company industry: ${id}`)
}

function assertCompany(database: DatabaseSync, companyId: string): void {
  if (!database.prepare('SELECT company_id FROM companies WHERE company_id = ?').get(companyId)) throw new Error(`Unknown company: ${companyId}`)
}

function assertBusinessLine(database: DatabaseSync, companyId: string, id: string): void {
  const row = database.prepare(`SELECT b.business_line_id FROM business_lines b
    JOIN company_industries ci ON ci.company_industry_id = b.company_industry_id
    WHERE b.business_line_id = ? AND ci.company_id = ? AND b.active = 1`).get(id, companyId)
  if (!row) throw new Error(`Unknown business line: ${id}`)
}

function toFactRecord(row: Record<string, unknown>): FactRecord {
  const dimensions = row.dimensions_json ? JSON.parse(String(row.dimensions_json)) as Record<string, string> : null
  let value: number | string | boolean
  if (row.value_number !== null && row.value_number !== undefined) value = Number(row.value_number)
  else if (row.value_text !== null && row.value_text !== undefined) value = String(row.value_text)
  else value = Boolean(row.value_boolean)
  return {
    factId: String(row.fact_id), metricId: String(row.metric_id), periodType: row.period_type as FactRecord['periodType'],
    periodStart: row.period_start ? String(row.period_start) : null, periodEnd: String(row.period_end), value,
    unit: row.unit ? String(row.unit) : null, dimensions, verificationStatus: String(row.verification_status),
  }
}

function toEstimateRecord(row: Record<string, unknown>): EstimateRecord {
  const dimensions = row.dimensions_json ? JSON.parse(String(row.dimensions_json)) as Record<string, string> : null
  return {
    estimateId: String(row.estimate_id), metricId: String(row.metric_id),
    targetPeriodType: row.target_period_type as EstimateRecord['targetPeriodType'],
    targetPeriodStart: row.target_period_start ? String(row.target_period_start) : null,
    targetPeriodEnd: String(row.target_period_end), asOf: String(row.as_of), provider: String(row.provider),
    analyst: row.analyst ? String(row.analyst) : null, estimateType: String(row.estimate_type),
    value: row.value_number !== null && row.value_number !== undefined ? Number(row.value_number) : String(row.value_text),
    unit: row.unit ? String(row.unit) : null, dimensions, verificationStatus: String(row.verification_status),
  }
}

function toAssignmentRecord(row: Record<string, unknown>): RoleAssignmentRecord {
  return { assignmentId: String(row.assignment_id), personId: String(row.person_id), positionId: String(row.position_id), startDate: String(row.start_date), endDate: row.end_date ? String(row.end_date) : null, isCurrent: Boolean(row.is_current) }
}
