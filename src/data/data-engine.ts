import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { ArtifactMetadata, EquityArchive, StoredArtifact } from '../archive/archive-service.js'
import { applyMetricPack as applyMetricPackToDatabase } from '../metric-packs/apply.js'
import type { MetricPack } from '../metric-packs/types.js'

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
  companyIndustryId: string | null
  businessLineId: string | null
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
  companyIndustryId?: string
  businessLineId?: string
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
  companyIndustryId: string | null
  businessLineId: string | null
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
export interface RoleAssignmentRecord { assignmentId: string; personId: string; positionId: string; startDate: string; endDate: string | null; isCurrent: boolean; position?: PositionRecord }
export interface ReportingLineRecord { reportingLineId: string; subordinatePositionId: string; managerPositionId: string; relationshipType: 'solid' | 'dotted'; startDate: string; endDate: string | null }
export interface ShareClassRecord { shareClassId: string; name: string; securityType: string; exchange: string | null; ticker: string | null; currency: string | null }
export interface CapTableSnapshotRecord { snapshotId: string; asOfDate: string; shareClasses: Array<ShareClassRecord & { sharesOutstanding: number; percentageOfTotalEquity: number | null }>; positions: Array<{ holderName: string; holderId: string | null; shareClassId: string; shares: number | null; ownershipPct: number | null; rank: number | null }> }
export interface SourceRecord { sourceId: string; sourceType: string; title: string; publisher: string; publishedAt: string | null; originalUrl: string | null }
export interface ArtifactRecord { artifactId: string; sourceId: string; artifactKind: string; mediaType: string; localPath: string; sha256: string; originalRetained: boolean; transformationMethod: string | null }
export interface SourceInput { sourceType: 'filing' | 'earnings' | 'company_release' | 'analyst_report' | 'media' | 'api' | 'manual' | 'other'; title: string; publisher: string; author?: string; publishedAt?: string; accessedAt?: string; originalUrl?: string; accountingStandard?: string; upstreamSourceId?: string; notes?: string }
export interface EvidenceInput { artifactId: string; locatorType: 'pdf' | 'markdown' | 'spreadsheet' | 'api' | 'other'; locator: Record<string, unknown>; excerptText?: string; notes?: string }
export interface OrganizationUnitRecord { organizationUnitId: string; name: string; unitType: string; parentUnitId: string | null }
export interface MetricDefinitionRecord { metricId: string; namespace: string; name: string; labelZh: string | null; labelEn: string | null; category: string; valueType: string; canonicalUnit: string | null; periodBehavior: string; aggregationRule: string | null; originPackId: string; originPackVersion: string; allowedDimensions: string[] }
export interface BusinessLineTypeRecord { businessLineTypeId: string; industryId: string; labelZh: string | null; labelEn: string | null; originPackId: string; originPackVersion: string }
export interface ScenarioRecord { scenarioId: string; name: string; modelId: string; modelVersion: string; parameters: Record<string, unknown>; updatedAt: string }
export interface DataModelRunRecord { modelRunId: string; modelId: string; runAt: string; inputs: Record<string, unknown>; outputs: Record<string, unknown> }
export interface ModelRunInput { modelRunId: string; modelId: string; modelVersion?: string; scenarioId?: string; inputs: Record<string, unknown>; outputs: Record<string, unknown>; notes?: string }

export interface FactFilter {
  metricId?: string
  category?: 'financial' | 'operating'
  periodStartFrom?: string
  periodEndTo?: string
  dimensions?: Record<string, string>
  limit?: number
}

export interface EstimateFilter {
  metricId?: string
  companyIndustryId?: string
  businessLineId?: string
  targetPeriodEnd?: string
  asOfFrom?: string
  asOfTo?: string
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

  withTransaction<T>(companyId: string, callback: (database: DatabaseSync) => T): T {
    return this.archive.withDatabase(companyId, (database) => {
      database.exec('BEGIN IMMEDIATE')
      try {
        const result = callback(database)
        database.exec('COMMIT')
        return result
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    })
  }

  private withScopedDatabase<T>(companyId: string, database: DatabaseSync | undefined, callback: (database: DatabaseSync) => T): T {
    return database ? callback(database) : this.archive.withDatabase(companyId, callback)
  }

  async listCompanies(): Promise<Awaited<ReturnType<EquityArchive['listCompanies']>>> {
    return this.archive.listCompanies()
  }

  async getCompany(companyId: string): Promise<Awaited<ReturnType<EquityArchive['openCompany']>>['manifest']> {
    return (await this.archive.openCompany(companyId)).manifest
  }

  listMetricDefinitions(companyId: string, category?: 'financial' | 'operating'): MetricDefinitionRecord[] {
    return this.archive.withDatabase(companyId, (database) => {
      const rows = category
        ? database.prepare('SELECT * FROM metric_definitions WHERE active = 1 AND category = ? ORDER BY metric_id').all(category)
        : database.prepare('SELECT * FROM metric_definitions WHERE active = 1 ORDER BY metric_id').all()
      return (rows as Array<Record<string, unknown>>).map((row) => ({
        metricId: String(row.metric_id), namespace: String(row.namespace), name: String(row.name),
        labelZh: row.label_zh ? String(row.label_zh) : null, labelEn: row.label_en ? String(row.label_en) : null,
        category: String(row.category), valueType: String(row.value_type), canonicalUnit: row.canonical_unit ? String(row.canonical_unit) : null,
        periodBehavior: String(row.period_behavior), aggregationRule: row.aggregation_rule ? String(row.aggregation_rule) : null,
        originPackId: String(row.origin_pack_id), originPackVersion: String(row.origin_pack_version),
        allowedDimensions: JSON.parse(String(row.allowed_dimensions_json)) as string[],
      }))
    })
  }

  listBusinessLineTypes(companyId: string, industryId?: string): BusinessLineTypeRecord[] {
    return this.archive.withDatabase(companyId, (database) => {
      const rows = industryId
        ? database.prepare('SELECT business_line_type_id, industry_id, label_zh, label_en, origin_pack_id, origin_pack_version FROM business_line_types WHERE active = 1 AND industry_id = ? ORDER BY business_line_type_id').all(industryId)
        : database.prepare('SELECT business_line_type_id, industry_id, label_zh, label_en, origin_pack_id, origin_pack_version FROM business_line_types WHERE active = 1 ORDER BY business_line_type_id').all()
      return (rows as Array<Record<string, unknown>>).map((row) => ({
        businessLineTypeId: String(row.business_line_type_id), industryId: String(row.industry_id),
        labelZh: row.label_zh ? String(row.label_zh) : null, labelEn: row.label_en ? String(row.label_en) : null,
        originPackId: String(row.origin_pack_id), originPackVersion: String(row.origin_pack_version),
      }))
    })
  }

  listOrganizationUnits(companyId: string): OrganizationUnitRecord[] {
    return this.archive.withDatabase(companyId, (database) => (database.prepare('SELECT organization_unit_id, name, unit_type, parent_unit_id FROM organization_units WHERE company_id = ? AND active = 1 ORDER BY name, organization_unit_id').all(companyId) as Array<Record<string, unknown>>).map((row) => ({
      organizationUnitId: String(row.organization_unit_id), name: String(row.name), unitType: String(row.unit_type), parentUnitId: row.parent_unit_id ? String(row.parent_unit_id) : null,
    })))
  }

  listPositions(companyId: string): PositionRecord[] {
    return this.archive.withDatabase(companyId, (database) => (database.prepare('SELECT position_id, role_type, role_title_raw, position_name_normalized, organization_unit_id FROM positions WHERE company_id = ? ORDER BY role_title_raw, position_id').all(companyId) as Array<Record<string, unknown>>).map((row) => ({
      positionId: String(row.position_id), roleType: row.role_type ? String(row.role_type) : null, roleTitleRaw: String(row.role_title_raw),
      positionNameNormalized: row.position_name_normalized ? String(row.position_name_normalized) : null, organizationUnitId: row.organization_unit_id ? String(row.organization_unit_id) : null,
    })))
  }

  applyMetricPack(companyId: string, pack: MetricPack, companyIndustryId?: string | undefined): string {
    return this.archive.withDatabase(companyId, (database) => {
      assertCompany(database, companyId)
      if (companyIndustryId) assertCompanyIndustry(database, companyId, companyIndustryId)
      const applicationId = `metric-pack-application-${randomUUID()}`
      const now = new Date().toISOString()
      database.exec('BEGIN IMMEDIATE')
      try {
        const existing = database.prepare(`SELECT application_id FROM template_applications
          WHERE metric_pack_id = ? AND metric_pack_version = ? AND company_industry_id IS ?`).get(pack.id, pack.version, companyIndustryId ?? null) as { application_id: string } | undefined
        if (existing) { database.exec('COMMIT'); return existing.application_id }
        applyMetricPackToDatabase(database, pack, { transaction: false })
        database.prepare(`INSERT INTO template_applications (
          application_id, template_type, metric_pack_id, metric_pack_version, company_industry_id, applied_at
        ) VALUES (?, ?, ?, ?, ?, ?)`).run(
          applicationId, 'metric_pack', pack.id, pack.version, companyIndustryId ?? null, now,
        )
        database.exec('COMMIT')
      } catch (error) { database.exec('ROLLBACK'); throw error }
      return applicationId
    })
  }

  listFacts(companyId: string, filter: FactFilter = {}): FactRecord[] {
    return this.archive.withDatabase(companyId, (database) => {
      const clauses = ['1 = 1']
      const parameters: Array<string | number> = []
      if (filter.metricId) { clauses.push('f.metric_id = ?'); parameters.push(filter.metricId) }
      if (filter.category) { clauses.push('m.category = ?'); parameters.push(filter.category) }
      if (filter.periodStartFrom) { clauses.push('(f.period_start >= ? OR (f.period_start IS NULL AND f.period_end >= ?))'); parameters.push(filter.periodStartFrom, filter.periodStartFrom) }
      if (filter.periodEndTo) { clauses.push('f.period_end <= ?'); parameters.push(filter.periodEndTo) }
      for (const [key, value] of Object.entries(filter.dimensions ?? {})) {
        if (!/^[A-Za-z0-9_]+$/.test(key)) throw new Error(`Invalid dimension key: ${key}`)
        clauses.push('json_extract(f.dimensions_json, ?) = ?')
        parameters.push(`$.${key}`, value)
      }
      const limit = boundedLimit(filter.limit)
      parameters.push(limit)
      const rows = database.prepare(`SELECT f.fact_id, f.metric_id, f.company_industry_id, f.business_line_id, f.period_type, f.period_start, f.period_end,
          f.value_number, f.value_text, f.value_boolean, f.unit, f.dimensions_json, f.verification_status
        FROM facts f JOIN metric_definitions m ON m.metric_id = f.metric_id WHERE ${clauses.join(' AND ')} ORDER BY f.period_end, f.fact_id LIMIT ?`).all(...parameters) as Array<Record<string, unknown>>
      return rows.map(toFactRecord)
    })
  }

  getFact(companyId: string, factId: string): FactRecord {
    return this.archive.withDatabase(companyId, (database) => {
      const row = database.prepare(`SELECT fact_id, metric_id, company_industry_id, business_line_id, period_type, period_start, period_end,
          value_number, value_text, value_boolean, unit, dimensions_json, verification_status
        FROM facts WHERE fact_id = ?`).get(factId) as Record<string, unknown> | undefined
      if (!row) throw new Error(`Unknown fact: ${factId}`)
      return toFactRecord(row)
    })
  }

  listEstimates(companyId: string, filter: string | EstimateFilter = {}): EstimateRecord[] {
    return this.archive.withDatabase(companyId, (database) => {
      const normalized: EstimateFilter = typeof filter === 'string' ? { metricId: filter } : filter
      const clauses = ['1 = 1']; const parameters: Array<string | number> = []
      if (normalized.metricId) { clauses.push('metric_id = ?'); parameters.push(normalized.metricId) }
      if (normalized.companyIndustryId) { clauses.push('company_industry_id = ?'); parameters.push(normalized.companyIndustryId) }
      if (normalized.businessLineId) { clauses.push('business_line_id = ?'); parameters.push(normalized.businessLineId) }
      if (normalized.targetPeriodEnd) { validateDate(normalized.targetPeriodEnd, 'targetPeriodEnd'); clauses.push('target_period_end = ?'); parameters.push(normalized.targetPeriodEnd) }
      if (normalized.asOfFrom) { validateDate(normalized.asOfFrom, 'asOfFrom'); clauses.push('as_of >= ?'); parameters.push(normalized.asOfFrom) }
      if (normalized.asOfTo) { validateDate(normalized.asOfTo, 'asOfTo'); clauses.push('as_of <= ?'); parameters.push(normalized.asOfTo) }
      if (normalized.asOfFrom && normalized.asOfTo && normalized.asOfFrom > normalized.asOfTo) throw new Error('asOfFrom must not be after asOfTo')
      parameters.push(boundedLimit(normalized.limit))
      const rows = database.prepare(`SELECT * FROM estimates WHERE ${clauses.join(' AND ')} ORDER BY target_period_end, as_of, estimate_id LIMIT ?`).all(...parameters)
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
      const metric = database.prepare(`SELECT value_type, period_behavior, allowed_dimensions_json FROM metric_definitions WHERE metric_id = ? AND active = 1`).get(input.metricId) as {
        value_type: 'number' | 'text' | 'boolean'; period_behavior: 'duration' | 'instant'; allowed_dimensions_json: string
      } | undefined
      if (!metric || metric.value_type === 'boolean') throw new Error(`Estimate metric must be an active number or text metric: ${input.metricId}`)
      if (metric.period_behavior !== input.targetPeriodType) throw new Error(`Metric ${input.metricId} requires ${metric.period_behavior} estimate target period`)
      if (input.dimensions && Object.keys(input.dimensions).some((key) => !(JSON.parse(metric.allowed_dimensions_json) as string[]).includes(key))) {
        throw new Error(`Metric ${input.metricId} does not allow one or more dimensions`)
      }
      if (metric.value_type === 'number' && (typeof input.value !== 'number' || !Number.isFinite(input.value))) throw new Error('Estimate value must be a finite number')
      if (metric.value_type === 'text' && typeof input.value !== 'string') throw new Error('Estimate value must be text')
      for (const evidenceId of input.evidenceIds) {
        if (!database.prepare('SELECT evidence_id FROM evidence WHERE evidence_id = ?').get(evidenceId)) throw new Error(`Unknown Evidence: ${evidenceId}`)
      }
      if (input.companyIndustryId) assertCompanyIndustry(database, companyId, input.companyIndustryId)
      if (input.businessLineId) assertBusinessLine(database, companyId, input.businessLineId, input.companyIndustryId)
      const estimateId = `estimate-${randomUUID()}`
      const now = new Date().toISOString()
      database.exec('BEGIN IMMEDIATE')
      try {
        database.prepare(`INSERT INTO estimates (
          estimate_id, metric_id, company_industry_id, business_line_id, target_period_type, target_period_start, target_period_end, as_of,
          published_at, observed_at, provider, analyst, estimate_type, value_number, value_text,
          unit, dimensions_json, ingestion_method, verification_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          estimateId, input.metricId, input.companyIndustryId ?? null, input.businessLineId ?? null,
          input.targetPeriodType, input.targetPeriodStart ?? null, input.targetPeriodEnd,
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

  createEstimatesBatch(companyId: string, inputs: EstimateInput[]): string[] {
    if (!inputs.length) return []
    return this.archive.withDatabase(companyId, (database) => {
      const prepared = inputs.map((input) => {
        validateEstimateShape(input)
        const metric = database.prepare('SELECT value_type, period_behavior, allowed_dimensions_json FROM metric_definitions WHERE metric_id = ? AND active = 1').get(input.metricId) as { value_type: 'number' | 'text' | 'boolean'; period_behavior: 'duration' | 'instant'; allowed_dimensions_json: string } | undefined
        if (!metric || metric.value_type === 'boolean') throw new Error(`Estimate metric must be an active number or text metric: ${input.metricId}`)
        if (metric.period_behavior !== input.targetPeriodType) throw new Error(`Metric ${input.metricId} requires ${metric.period_behavior} estimate target period`)
        const allowed = JSON.parse(metric.allowed_dimensions_json) as string[]
        if (input.dimensions && Object.keys(input.dimensions).some((key) => !allowed.includes(key))) throw new Error(`Metric ${input.metricId} does not allow one or more dimensions`)
        if (metric.value_type === 'number' && (typeof input.value !== 'number' || !Number.isFinite(input.value))) throw new Error('Estimate value must be a finite number')
        if (metric.value_type === 'text' && typeof input.value !== 'string') throw new Error('Estimate value must be text')
        for (const evidenceId of input.evidenceIds) if (!database.prepare('SELECT evidence_id FROM evidence WHERE evidence_id = ?').get(evidenceId)) throw new Error(`Unknown Evidence: ${evidenceId}`)
        if (input.companyIndustryId) assertCompanyIndustry(database, companyId, input.companyIndustryId)
        if (input.businessLineId) assertBusinessLine(database, companyId, input.businessLineId, input.companyIndustryId)
        return { input, id: `estimate-${randomUUID()}` }
      })
      const insert = database.prepare(`INSERT INTO estimates (estimate_id, metric_id, company_industry_id, business_line_id, target_period_type, target_period_start, target_period_end, as_of, published_at, observed_at, provider, analyst, estimate_type, value_number, value_text, unit, dimensions_json, ingestion_method, verification_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      const link = database.prepare('INSERT INTO estimate_evidence (estimate_id, evidence_id) VALUES (?, ?)')
      const now = new Date().toISOString()
      database.exec('BEGIN IMMEDIATE')
      try {
        for (const { input, id } of prepared) {
          insert.run(id, input.metricId, input.companyIndustryId ?? null, input.businessLineId ?? null, input.targetPeriodType, input.targetPeriodStart ?? null, input.targetPeriodEnd, input.asOf, input.publishedAt ?? null, input.observedAt ?? null, input.provider, input.analyst ?? null, input.estimateType, typeof input.value === 'number' ? input.value : null, typeof input.value === 'string' ? input.value : null, input.unit ?? null, input.dimensions ? JSON.stringify(input.dimensions) : null, input.ingestionMethod, input.verificationStatus, now)
          for (const evidenceId of input.evidenceIds) link.run(id, evidenceId)
        }
        database.exec('COMMIT')
      } catch (error) { database.exec('ROLLBACK'); throw error }
      return prepared.map(({ id }) => id)
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
      return toEvidenceRecord(row)
    })
  }

  listPeople(companyId: string): Array<PersonRecord & { assignments: RoleAssignmentRecord[] }> {
    return this.archive.withDatabase(companyId, (database) => {
      const people = database.prepare('SELECT person_id, name_zh, name_en, birth_year, biography FROM people ORDER BY person_id').all() as Array<Record<string, unknown>>
      const assignments = database.prepare(`SELECT ra.assignment_id, ra.person_id, ra.position_id, ra.start_date, ra.end_date, ra.is_current,
          p.role_type, p.role_title_raw, p.position_name_normalized, p.organization_unit_id
        FROM role_assignments ra JOIN positions p ON p.position_id = ra.position_id
        WHERE ra.company_id = ? ORDER BY ra.start_date, ra.assignment_id`).all(companyId) as Array<Record<string, unknown>>
      return people.map((person) => ({
        personId: String(person.person_id), nameZh: person.name_zh ? String(person.name_zh) : null,
        nameEn: person.name_en ? String(person.name_en) : null, birthYear: person.birth_year === null ? null : Number(person.birth_year),
        biography: person.biography ? String(person.biography) : null,
        assignments: assignments.filter((assignment) => assignment.person_id === person.person_id).map(toAssignmentRecord),
      }))
    })
  }

  listReportingLines(companyId: string): ReportingLineRecord[] {
    return this.archive.withDatabase(companyId, (database) => (database.prepare(`SELECT reporting_line_id, subordinate_position_id, manager_position_id,
      relationship_type, start_date, end_date FROM reporting_lines WHERE company_id = ? ORDER BY start_date, reporting_line_id`).all(companyId) as Array<Record<string, unknown>>).map((row) => ({
      reportingLineId: String(row.reporting_line_id), subordinatePositionId: String(row.subordinate_position_id), managerPositionId: String(row.manager_position_id),
      relationshipType: row.relationship_type as ReportingLineRecord['relationshipType'], startDate: String(row.start_date), endDate: row.end_date ? String(row.end_date) : null,
    })))
  }

  createPerson(companyId: string, input: { nameZh?: string | undefined; nameEn?: string | undefined; birthYear?: number | undefined; biography?: string | undefined }, database?: DatabaseSync): string {
    if (!input.nameZh?.trim() && !input.nameEn?.trim()) throw new Error('person requires nameZh or nameEn')
    return this.withScopedDatabase(companyId, database, (database) => {
      assertCompany(database, companyId)
      const id = `person-${randomUUID()}`; const now = new Date().toISOString()
      database.prepare('INSERT INTO people (person_id, name_zh, name_en, birth_year, biography, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, input.nameZh ?? null, input.nameEn ?? null, input.birthYear ?? null, input.biography ?? null, now, now)
      return id
    })
  }

  createPosition(companyId: string, input: { roleTitleRaw: string; roleType?: string | undefined; positionNameNormalized?: string | undefined; organizationUnitId?: string | undefined }, database?: DatabaseSync): string {
    if (!input.roleTitleRaw.trim()) throw new Error('position requires roleTitleRaw')
    return this.withScopedDatabase(companyId, database, (database) => {
      assertCompany(database, companyId)
      if (input.organizationUnitId && !database.prepare('SELECT organization_unit_id FROM organization_units WHERE organization_unit_id = ? AND company_id = ?').get(input.organizationUnitId, companyId)) throw new Error('Unknown organization unit')
      const id = `position-${randomUUID()}`
      database.prepare('INSERT INTO positions (position_id, company_id, organization_unit_id, role_type, role_title_raw, position_name_normalized) VALUES (?, ?, ?, ?, ?, ?)').run(id, companyId, input.organizationUnitId ?? null, input.roleType ?? null, input.roleTitleRaw, input.positionNameNormalized ?? null)
      return id
    })
  }

  createOrganizationUnit(companyId: string, input: { name: string; unitType: string; parentUnitId?: string | undefined }, database?: DatabaseSync): string {
    if (!input.name.trim() || !input.unitType.trim()) throw new Error('organization unit requires name and unitType')
    return this.withScopedDatabase(companyId, database, (database) => {
      assertCompany(database, companyId)
      if (input.parentUnitId && !database.prepare('SELECT organization_unit_id FROM organization_units WHERE organization_unit_id = ? AND company_id = ?').get(input.parentUnitId, companyId)) throw new Error('Unknown parent organization unit')
      const id = `org-unit-${randomUUID()}`
      database.prepare('INSERT INTO organization_units (organization_unit_id, company_id, parent_unit_id, name, unit_type) VALUES (?, ?, ?, ?, ?)').run(id, companyId, input.parentUnitId ?? null, input.name, input.unitType)
      return id
    })
  }

  assignRole(companyId: string, input: { personId: string; positionId: string; startDate: string; endDate?: string | undefined; isCurrent?: boolean | undefined; sourceId?: string | undefined; evidenceId?: string | undefined }, database?: DatabaseSync): string {
    validateDate(input.startDate, 'startDate'); if (input.endDate) validateDate(input.endDate, 'endDate')
    if (input.endDate && input.startDate > input.endDate) throw new Error('startDate must not be after endDate')
    return this.withScopedDatabase(companyId, database, (database) => {
      assertCompany(database, companyId)
      if (!database.prepare('SELECT person_id FROM people WHERE person_id = ?').get(input.personId)) throw new Error('Unknown person')
      if (!database.prepare('SELECT position_id FROM positions WHERE position_id = ? AND company_id = ?').get(input.positionId, companyId)) throw new Error('Unknown position')
      const id = `assignment-${randomUUID()}`
      database.prepare('INSERT INTO role_assignments (assignment_id, company_id, person_id, position_id, start_date, end_date, is_current, source_id, evidence_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, companyId, input.personId, input.positionId, input.startDate, input.endDate ?? null, input.isCurrent ? 1 : 0, input.sourceId ?? null, input.evidenceId ?? null)
      return id
    })
  }

  addReportingLine(companyId: string, input: { subordinatePositionId: string; managerPositionId: string; relationshipType: 'solid' | 'dotted'; startDate: string; endDate?: string | undefined; evidenceId?: string | undefined }, database?: DatabaseSync): string {
    validateDate(input.startDate, 'startDate'); if (input.endDate) validateDate(input.endDate, 'endDate')
    if (input.subordinatePositionId === input.managerPositionId) throw new Error('A position cannot report to itself')
    return this.withScopedDatabase(companyId, database, (database) => {
      assertCompany(database, companyId)
      for (const positionId of [input.subordinatePositionId, input.managerPositionId]) if (!database.prepare('SELECT position_id FROM positions WHERE position_id = ? AND company_id = ?').get(positionId, companyId)) throw new Error(`Unknown position: ${positionId}`)
      const id = `reporting-line-${randomUUID()}`
      database.prepare('INSERT INTO reporting_lines (reporting_line_id, company_id, subordinate_position_id, manager_position_id, relationship_type, start_date, end_date, evidence_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, companyId, input.subordinatePositionId, input.managerPositionId, input.relationshipType, input.startDate, input.endDate ?? null, input.evidenceId ?? null)
      return id
    })
  }

  createShareClass(companyId: string, input: { name: string; securityType: string; exchange?: string | undefined; ticker?: string | undefined; currency?: string | undefined }, database?: DatabaseSync): string {
    if (!input.name.trim() || !input.securityType.trim()) throw new Error('share class requires name and securityType')
    return this.withScopedDatabase(companyId, database, (database) => {
      assertCompany(database, companyId)
      const id = `share-class-${randomUUID()}`
      database.prepare('INSERT INTO share_classes (share_class_id, company_id, name, security_type, exchange, ticker, currency) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, companyId, input.name, input.securityType, input.exchange ?? null, input.ticker ?? null, input.currency ?? null)
      return id
    })
  }

  createCapTableSnapshot(companyId: string, input: { asOfDate: string; sourceId?: string | undefined; evidenceId?: string | undefined; classTotals: Array<{ shareClassId: string; sharesOutstanding: number; percentageOfTotalEquity?: number | undefined }>; positions?: Array<{ holderName: string; holderId?: string | undefined; shareClassId: string; shares?: number | undefined; ownershipPct?: number | undefined; rank?: number | undefined }> }, transactionDatabase?: DatabaseSync): string {
    validateDate(input.asOfDate, 'asOfDate')
    if (!input.classTotals.length) throw new Error('cap table snapshot requires class totals')
    return this.withScopedDatabase(companyId, transactionDatabase, (database) => {
      assertCompany(database, companyId)
      for (const total of input.classTotals) {
        if (!Number.isFinite(total.sharesOutstanding) || total.sharesOutstanding < 0) throw new Error('sharesOutstanding must be non-negative')
        if (total.percentageOfTotalEquity !== undefined && (!Number.isFinite(total.percentageOfTotalEquity) || total.percentageOfTotalEquity < 0 || total.percentageOfTotalEquity > 100)) throw new Error('percentageOfTotalEquity must be between 0 and 100')
        if (!database.prepare('SELECT share_class_id FROM share_classes WHERE share_class_id = ? AND company_id = ? AND active = 1').get(total.shareClassId, companyId)) throw new Error(`Unknown share class: ${total.shareClassId}`)
      }
      for (const position of input.positions ?? []) {
        if (position.shares !== undefined && (!Number.isFinite(position.shares) || position.shares < 0)) throw new Error('shares must be non-negative')
        if (position.ownershipPct !== undefined && (!Number.isFinite(position.ownershipPct) || position.ownershipPct < 0 || position.ownershipPct > 100)) throw new Error('ownershipPct must be between 0 and 100')
        if (position.rank !== undefined && (!Number.isFinite(position.rank) || !Number.isInteger(position.rank) || position.rank < 0)) throw new Error('rank must be a non-negative integer')
        if (!database.prepare('SELECT share_class_id FROM share_classes WHERE share_class_id = ? AND company_id = ? AND active = 1').get(position.shareClassId, companyId)) throw new Error(`Unknown share class: ${position.shareClassId}`)
      }
      const snapshotId = `captable-snapshot-${randomUUID()}`; const now = new Date().toISOString()
      if (transactionDatabase !== undefined) {
        database.prepare('INSERT INTO captable_snapshots (captable_snapshot_id, company_id, as_of_date, source_id, evidence_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(snapshotId, companyId, input.asOfDate, input.sourceId ?? null, input.evidenceId ?? null, now)
        const total = database.prepare('INSERT INTO captable_class_totals (captable_snapshot_id, share_class_id, shares_outstanding, percentage_of_total_equity) VALUES (?, ?, ?, ?)')
        for (const item of input.classTotals) total.run(snapshotId, item.shareClassId, item.sharesOutstanding, item.percentageOfTotalEquity ?? null)
        const position = database.prepare('INSERT INTO captable_positions (captable_position_id, captable_snapshot_id, holder_name, holder_id, share_class_id, shares, ownership_pct, rank) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        for (const item of input.positions ?? []) position.run(`captable-position-${randomUUID()}`, snapshotId, item.holderName, item.holderId ?? null, item.shareClassId, item.shares ?? null, item.ownershipPct ?? null, item.rank ?? null)
        return snapshotId
      }
      database.exec('BEGIN IMMEDIATE')
      try {
        database.prepare('INSERT INTO captable_snapshots (captable_snapshot_id, company_id, as_of_date, source_id, evidence_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(snapshotId, companyId, input.asOfDate, input.sourceId ?? null, input.evidenceId ?? null, now)
        const total = database.prepare('INSERT INTO captable_class_totals (captable_snapshot_id, share_class_id, shares_outstanding, percentage_of_total_equity) VALUES (?, ?, ?, ?)')
        for (const item of input.classTotals) total.run(snapshotId, item.shareClassId, item.sharesOutstanding, item.percentageOfTotalEquity ?? null)
        const position = database.prepare('INSERT INTO captable_positions (captable_position_id, captable_snapshot_id, holder_name, holder_id, share_class_id, shares, ownership_pct, rank) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        for (const item of input.positions ?? []) position.run(`captable-position-${randomUUID()}`, snapshotId, item.holderName, item.holderId ?? null, item.shareClassId, item.shares ?? null, item.ownershipPct ?? null, item.rank ?? null)
        database.exec('COMMIT')
      } catch (error) { database.exec('ROLLBACK'); throw error }
      return snapshotId
    })
  }

  listCapTable(companyId: string): CapTableSnapshotRecord[] {
    return this.archive.withDatabase(companyId, (database) => {
      const snapshots = database.prepare('SELECT captable_snapshot_id, as_of_date FROM captable_snapshots WHERE company_id = ? ORDER BY as_of_date DESC').all(companyId) as Array<Record<string, unknown>>
      const totals = database.prepare(`SELECT t.captable_snapshot_id, t.share_class_id, t.shares_outstanding, t.percentage_of_total_equity, s.name, s.security_type, s.exchange, s.ticker, s.currency FROM captable_class_totals t JOIN share_classes s ON s.share_class_id = t.share_class_id`).all() as Array<Record<string, unknown>>
      const positions = database.prepare('SELECT captable_snapshot_id, holder_name, holder_id, share_class_id, shares, ownership_pct, rank FROM captable_positions').all() as Array<Record<string, unknown>>
      return snapshots.map((snapshot) => ({ snapshotId: String(snapshot.captable_snapshot_id), asOfDate: String(snapshot.as_of_date), shareClasses: totals.filter((row) => row.captable_snapshot_id === snapshot.captable_snapshot_id).map((row) => ({ shareClassId: String(row.share_class_id), name: String(row.name), securityType: String(row.security_type), exchange: row.exchange ? String(row.exchange) : null, ticker: row.ticker ? String(row.ticker) : null, currency: row.currency ? String(row.currency) : null, sharesOutstanding: Number(row.shares_outstanding), percentageOfTotalEquity: row.percentage_of_total_equity === null ? null : Number(row.percentage_of_total_equity) })), positions: positions.filter((row) => row.captable_snapshot_id === snapshot.captable_snapshot_id).map((row) => ({ holderName: String(row.holder_name), holderId: row.holder_id ? String(row.holder_id) : null, shareClassId: String(row.share_class_id), shares: row.shares === null ? null : Number(row.shares), ownershipPct: row.ownership_pct === null ? null : Number(row.ownership_pct), rank: row.rank === null ? null : Number(row.rank) })) }))
    })
  }

  listShareClasses(companyId: string): ShareClassRecord[] {
    return this.archive.withDatabase(companyId, (database) => (database.prepare('SELECT share_class_id, name, security_type, exchange, ticker, currency FROM share_classes WHERE company_id = ? AND active = 1 ORDER BY name, share_class_id').all(companyId) as Array<Record<string, unknown>>).map((row) => ({
      shareClassId: String(row.share_class_id), name: String(row.name), securityType: String(row.security_type), exchange: row.exchange ? String(row.exchange) : null,
      ticker: row.ticker ? String(row.ticker) : null, currency: row.currency ? String(row.currency) : null,
    })))
  }

  listSources(companyId: string): SourceRecord[] {
    return this.archive.withDatabase(companyId, (database) => (database.prepare('SELECT source_id, source_type, title, publisher, published_at, original_url FROM sources ORDER BY published_at DESC, source_id').all() as Array<Record<string, unknown>>).map((row) => ({
      sourceId: String(row.source_id), sourceType: String(row.source_type), title: String(row.title), publisher: String(row.publisher),
      publishedAt: row.published_at ? String(row.published_at) : null, originalUrl: row.original_url ? String(row.original_url) : null,
    })))
  }

  createSource(companyId: string, input: SourceInput): string {
    if (!input.title.trim() || !input.publisher.trim()) throw new Error('source requires title and publisher')
    return this.archive.withDatabase(companyId, (database) => {
      assertCompany(database, companyId)
      if (input.upstreamSourceId && !database.prepare('SELECT source_id FROM sources WHERE source_id = ?').get(input.upstreamSourceId)) throw new Error(`Unknown upstream source: ${input.upstreamSourceId}`)
      const sourceId = `source-${randomUUID()}`
      database.prepare(`INSERT INTO sources (source_id, source_type, title, publisher, author, published_at, accessed_at, original_url, accounting_standard, upstream_source_id, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        sourceId, input.sourceType, input.title.trim(), input.publisher.trim(), input.author ?? null, input.publishedAt ?? null,
        input.accessedAt ?? null, input.originalUrl ?? null, input.accountingStandard ?? null, input.upstreamSourceId ?? null,
        input.notes ?? null, new Date().toISOString(),
      )
      return sourceId
    })
  }

  async storeArtifact(companyId: string, content: string | Uint8Array | { sourcePath: string }, metadata: ArtifactMetadata): Promise<StoredArtifact> {
    return this.archive.storeArtifact(companyId, content, metadata)
  }

  createEvidence(companyId: string, input: EvidenceInput): string {
    if (!input.locator || typeof input.locator !== 'object' || Array.isArray(input.locator)) throw new Error('evidence locator must be an object')
    let locatorJson: string
    try { locatorJson = JSON.stringify(input.locator) } catch { throw new Error('evidence locator must be JSON serializable') }
    return this.archive.withDatabase(companyId, (database) => {
      assertCompany(database, companyId)
      if (!database.prepare('SELECT artifact_id FROM source_artifacts WHERE artifact_id = ?').get(input.artifactId)) throw new Error(`Unknown artifact: ${input.artifactId}`)
      const evidenceId = `evidence-${randomUUID()}`
      database.prepare(`INSERT INTO evidence (evidence_id, artifact_id, locator_type, locator_json, excerpt_text, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(evidenceId, input.artifactId, input.locatorType, locatorJson, input.excerptText ?? null, input.notes ?? null, new Date().toISOString())
      return evidenceId
    })
  }

  listArtifacts(companyId: string): ArtifactRecord[] {
    return this.archive.withDatabase(companyId, (database) => (database.prepare(`SELECT artifact_id, source_id, artifact_kind, media_type, local_path, sha256,
      original_retained, transformation_method FROM source_artifacts ORDER BY created_at, artifact_id`).all() as Array<Record<string, unknown>>).map((row) => ({
      artifactId: String(row.artifact_id), sourceId: String(row.source_id), artifactKind: String(row.artifact_kind), mediaType: String(row.media_type),
      localPath: String(row.local_path), sha256: String(row.sha256), originalRetained: Boolean(row.original_retained), transformationMethod: row.transformation_method ? String(row.transformation_method) : null,
    })))
  }

  listFactEvidence(companyId: string, factId: string): EvidenceRecord[] {
    return this.archive.withDatabase(companyId, (database) => {
      if (!database.prepare('SELECT fact_id FROM facts WHERE fact_id = ?').get(factId)) throw new Error(`Unknown fact: ${factId}`)
      const rows = database.prepare(`SELECT e.evidence_id, e.artifact_id, e.locator_type, e.locator_json, e.excerpt_text, e.notes
        FROM fact_evidence fe JOIN evidence e ON e.evidence_id = fe.evidence_id
        WHERE fe.fact_id = ? ORDER BY e.evidence_id`).all(factId) as Array<Record<string, unknown>>
      return rows.map(toEvidenceRecord)
    })
  }

  listEstimateEvidence(companyId: string, estimateId: string): EvidenceRecord[] {
    return this.archive.withDatabase(companyId, (database) => {
      if (!database.prepare('SELECT estimate_id FROM estimates WHERE estimate_id = ?').get(estimateId)) throw new Error(`Unknown estimate: ${estimateId}`)
      const rows = database.prepare(`SELECT e.evidence_id, e.artifact_id, e.locator_type, e.locator_json, e.excerpt_text, e.notes
        FROM estimate_evidence ee JOIN evidence e ON e.evidence_id = ee.evidence_id
        WHERE ee.estimate_id = ? ORDER BY e.evidence_id`).all(estimateId) as Array<Record<string, unknown>>
      return rows.map(toEvidenceRecord)
    })
  }

  saveScenario(companyId: string, input: { name: string; modelId: string; modelVersion?: string; parameters: Record<string, unknown> }): string {
    if (!input.name.trim() || !input.modelId.trim()) throw new Error('scenario requires name and modelId')
    return this.archive.withDatabase(companyId, (database) => {
      assertCompany(database, companyId)
      const scenarioId = `scenario-${randomUUID()}`
      const now = new Date().toISOString()
      database.exec('BEGIN IMMEDIATE')
      try {
        const existing = database.prepare('SELECT scenario_id FROM scenarios WHERE company_id = ? AND model_id = ? AND name = ?').get(companyId, input.modelId, input.name) as { scenario_id: string } | undefined
        if (existing) {
          database.prepare('UPDATE scenarios SET model_version = ?, parameters_json = ?, updated_at = ? WHERE scenario_id = ?').run(input.modelVersion ?? '0.1.0', JSON.stringify(input.parameters), now, existing.scenario_id)
        } else {
          database.prepare(`INSERT INTO scenarios (scenario_id, company_id, name, model_id, model_version, parameters_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(scenarioId, companyId, input.name, input.modelId, input.modelVersion ?? '0.1.0', JSON.stringify(input.parameters), now, now)
        }
        database.exec('COMMIT')
        return existing?.scenario_id ?? scenarioId
      } catch (error) { database.exec('ROLLBACK'); throw error }
    })
  }

  listScenarios(companyId: string): ScenarioRecord[] {
    return this.archive.withDatabase(companyId, (database) => (database.prepare(`SELECT scenario_id, name, model_id, model_version, parameters_json, updated_at
      FROM scenarios WHERE company_id = ? ORDER BY updated_at DESC`).all(companyId) as Array<Record<string, unknown>>).map((row) => ({
      scenarioId: String(row.scenario_id), name: String(row.name), modelId: String(row.model_id), modelVersion: String(row.model_version),
      parameters: JSON.parse(String(row.parameters_json)) as Record<string, unknown>, updatedAt: String(row.updated_at),
    })))
  }

  persistModelRun(companyId: string, input: ModelRunInput): void {
    this.archive.withDatabase(companyId, (database) => {
      assertCompany(database, companyId)
      database.prepare(`INSERT INTO model_runs (model_run_id, company_id, model_id, model_version, scenario_id, run_at, inputs_json, outputs_json, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        input.modelRunId, companyId, input.modelId, input.modelVersion ?? '0.1.0', input.scenarioId ?? null,
        new Date().toISOString(), JSON.stringify(input.inputs), JSON.stringify(input.outputs), input.notes ?? null,
      )
    })
  }

  listModelRuns(companyId: string): DataModelRunRecord[] {
    return this.archive.withDatabase(companyId, (database) => (database.prepare(`SELECT model_run_id, model_id, run_at, inputs_json, outputs_json
      FROM model_runs WHERE company_id = ? ORDER BY run_at DESC`).all(companyId) as Array<Record<string, unknown>>).map((row) => ({
      modelRunId: String(row.model_run_id), modelId: String(row.model_id), runAt: String(row.run_at),
      inputs: JSON.parse(String(row.inputs_json)) as Record<string, unknown>, outputs: JSON.parse(String(row.outputs_json)) as Record<string, unknown>,
    })))
  }

  createFact(companyId: string, input: FactInput): string {
    validateFactShape(input)
    return this.archive.withDatabase(companyId, (database) => {
      const valueColumns = validateFactForDatabase(database, companyId, input)
      const now = new Date().toISOString()
      database.exec('BEGIN IMMEDIATE')
      try {
        const targetFactId = writeFact(database, input, valueColumns, now)
        database.exec('COMMIT')
        return targetFactId
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    })
  }

  createFactsBatch(companyId: string, inputs: FactInput[]): string[] {
    if (!inputs.length) return []
    inputs.forEach(validateFactShape)
    return this.archive.withDatabase(companyId, (database) => {
      // Validate every row before opening the write transaction so a bad later row cannot leave a partial import.
      const prepared = inputs.map((input) => ({ input, valueColumns: validateFactForDatabase(database, companyId, input) }))
      const now = new Date().toISOString()
      database.exec('BEGIN IMMEDIATE')
      try {
        const factIds = prepared.map(({ input, valueColumns }) => writeFact(database, input, valueColumns, now))
        database.exec('COMMIT')
        return factIds
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    })
  }

  addIndustry(companyId: string, input: IndustryInput): string {
    validateTaxonomyId(input.industryId, 'industryId')
    const normalizedIndustryId = input.industryId.trim()
    return this.archive.withDatabase(companyId, (database) => {
      const company = database.prepare('SELECT company_id FROM companies WHERE company_id = ?').get(companyId)
      if (!company) throw new Error(`Unknown company: ${companyId}`)
      const companyIndustryId = `industry-${randomUUID()}`
      const now = new Date().toISOString()
      database.prepare(`INSERT INTO company_industries
        (company_industry_id, company_id, industry_id, is_primary, created_at)
        VALUES (?, ?, ?, ?, ?)`).run(companyIndustryId, companyId, normalizedIndustryId, input.isPrimary ? 1 : 0, now)
      return companyIndustryId
    })
  }

  addBusinessLine(companyId: string, companyIndustryId: string, input: BusinessLineInput): string {
    validateTaxonomyId(input.businessLineTypeId, 'businessLineTypeId')
    if (!input.displayName.trim()) throw new Error('displayName is required')
    const businessLineTypeId = input.businessLineTypeId.trim()
    return this.archive.withDatabase(companyId, (database) => {
      assertCompanyIndustry(database, companyId, companyIndustryId)
      const industry = database.prepare('SELECT industry_id FROM company_industries WHERE company_industry_id = ?').get(companyIndustryId) as { industry_id: string } | undefined
      const type = database.prepare('SELECT industry_id FROM business_line_types WHERE business_line_type_id = ? AND active = 1').get(businessLineTypeId) as { industry_id: string } | undefined
      if (type && type.industry_id !== industry?.industry_id) throw new Error(`Business line type ${businessLineTypeId} does not belong to industry ${industry?.industry_id ?? companyIndustryId}`)
      const businessLineId = `business-line-${randomUUID()}`
      const now = new Date().toISOString()
      database.prepare(`INSERT INTO business_lines
        (business_line_id, company_industry_id, business_line_type_id, display_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(
        businessLineId, companyIndustryId, businessLineTypeId, input.displayName.trim(), now, now,
      )
      return businessLineId
    })
  }

  listTaxonomy(companyId: string): Array<{ companyIndustryId: string; industryId: string; isPrimary: boolean; businessLines: Array<{ businessLineId: string; businessLineTypeId: string; displayName: string; typeLabelZh?: string; typeLabelEn?: string }> }> {
    return this.archive.withDatabase(companyId, (database) => {
      const industries = database.prepare('SELECT company_industry_id, industry_id, is_primary FROM company_industries WHERE company_id = ? AND active = 1 ORDER BY is_primary DESC, industry_id').all(companyId) as Array<Record<string, unknown>>
      const lines = database.prepare(`SELECT b.business_line_id, b.company_industry_id, b.business_line_type_id, b.display_name,
          t.label_zh AS type_label_zh, t.label_en AS type_label_en
        FROM business_lines b LEFT JOIN business_line_types t ON t.business_line_type_id = b.business_line_type_id
        WHERE b.active = 1 ORDER BY b.display_name, b.business_line_id`).all() as Array<Record<string, unknown>>
      return industries.map((industry) => ({
        companyIndustryId: String(industry.company_industry_id), industryId: String(industry.industry_id), isPrimary: Boolean(industry.is_primary),
        businessLines: lines.filter((line) => line.company_industry_id === industry.company_industry_id).map((line) => ({
          businessLineId: String(line.business_line_id), businessLineTypeId: String(line.business_line_type_id), displayName: String(line.display_name),
          ...(line.type_label_zh ? { typeLabelZh: String(line.type_label_zh) } : {}),
          ...(line.type_label_en ? { typeLabelEn: String(line.type_label_en) } : {}),
        })),
      }))
    })
  }
}

function validateFactShape(input: FactInput): void {
  validateDate(input.periodEnd, 'periodEnd')
  if (input.periodType === 'duration') {
    if (!input.periodStart) throw new Error('duration facts require periodStart')
    validateDate(input.periodStart, 'periodStart')
    if (input.periodStart > input.periodEnd) throw new Error('periodStart must not be after periodEnd')
  } else if (input.periodStart) throw new Error('instant facts must not have periodStart')
  if (!input.evidenceIds.length) throw new Error('facts require at least one local Evidence')
}

function validateFactForDatabase(database: DatabaseSync, companyId: string, input: FactInput): { number: number | null; text: string | null; boolean: number | null } {
  const metric = database.prepare(`SELECT value_type, period_behavior, allowed_dimensions_json
    FROM metric_definitions WHERE metric_id = ? AND active = 1`).get(input.metricId) as {
      value_type: 'number' | 'text' | 'boolean'; period_behavior: 'duration' | 'instant'; allowed_dimensions_json: string
    } | undefined
  if (!metric) throw new Error(`Unknown active metric definition: ${input.metricId}`)
  if (metric.period_behavior !== input.periodType) throw new Error(`Metric ${input.metricId} requires ${metric.period_behavior} period`)
  const dimensions = input.dimensions
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
  if (input.businessLineId) assertBusinessLine(database, companyId, input.businessLineId, input.companyIndustryId)
  return valueColumns
}

function writeFact(
  database: DatabaseSync,
  input: FactInput,
  valueColumns: { number: number | null; text: string | null; boolean: number | null },
  now: string,
): string {
  const factId = `fact-${randomUUID()}`
  let targetFactId = factId
  const existing = database.prepare(`SELECT fact_id FROM facts
    WHERE metric_id = ? AND company_industry_id IS ? AND business_line_id IS ?
      AND period_type = ? AND period_start IS ? AND period_end = ? AND dimensions_json IS ?`).get(
    input.metricId, input.companyIndustryId ?? null, input.businessLineId ?? null, input.periodType,
    input.periodStart ?? null, input.periodEnd, input.dimensions ? JSON.stringify(input.dimensions) : null,
  ) as { fact_id: string } | undefined
  targetFactId = existing?.fact_id ?? factId
  if (existing) {
    database.prepare(`UPDATE facts SET value_number = ?, value_text = ?, value_boolean = ?, unit = ?, source_reported_at = ?, observed_at = ?, ingestion_method = ?, verification_status = ?, updated_at = ? WHERE fact_id = ?`).run(
      valueColumns.number, valueColumns.text, valueColumns.boolean, input.unit ?? null, input.sourceReportedAt ?? null,
      input.observedAt ?? null, input.ingestionMethod, input.verificationStatus, now, targetFactId,
    )
    database.prepare('DELETE FROM fact_evidence WHERE fact_id = ?').run(targetFactId)
  } else database.prepare(`INSERT INTO facts (
    fact_id, metric_id, company_industry_id, business_line_id, period_type, period_start,
    period_end, value_number, value_text, value_boolean, unit, source_reported_at,
    observed_at, dimensions_json, ingestion_method, verification_status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    factId, input.metricId, input.companyIndustryId ?? null, input.businessLineId ?? null,
    input.periodType, input.periodStart ?? null, input.periodEnd, valueColumns.number,
    valueColumns.text, valueColumns.boolean, input.unit ?? null, input.sourceReportedAt ?? null,
    input.observedAt ?? null, input.dimensions ? JSON.stringify(input.dimensions) : null,
    input.ingestionMethod, input.verificationStatus, now, now,
  )
  const link = database.prepare('INSERT INTO fact_evidence (fact_id, evidence_id) VALUES (?, ?)')
  for (const evidenceId of input.evidenceIds) link.run(targetFactId, evidenceId)
  return targetFactId
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
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const parsed = match ? new Date(`${value}T00:00:00Z`) : undefined
  if (!match || !parsed || Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() !== Number(match[1]) || parsed.getUTCMonth() + 1 !== Number(match[2]) || parsed.getUTCDate() !== Number(match[3])) {
    throw new Error(`${field} must be an ISO date (YYYY-MM-DD)`)
  }
}

function validateTaxonomyId(value: string, field: string): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(value.trim())) throw new Error(`${field} must use lowercase letters, numbers, dots, underscores, or hyphens`)
}

function boundedLimit(value: number | undefined): number {
  if (value === undefined) return 500
  if (!Number.isInteger(value) || value < 1) throw new Error('limit must be a positive integer')
  return Math.min(value, 5000)
}

function validateEstimateShape(input: EstimateInput): void {
  validateDate(input.targetPeriodEnd, 'targetPeriodEnd'); validateDate(input.asOf, 'asOf')
  if (input.targetPeriodType === 'duration') {
    if (!input.targetPeriodStart) throw new Error('duration estimates require targetPeriodStart')
    validateDate(input.targetPeriodStart, 'targetPeriodStart')
    if (input.targetPeriodStart > input.targetPeriodEnd) throw new Error('targetPeriodStart must not be after targetPeriodEnd')
  } else if (input.targetPeriodStart) throw new Error('instant estimates must not have targetPeriodStart')
  if (!input.provider.trim()) throw new Error('estimates require provider')
  if (!input.estimateType.trim()) throw new Error('estimates require estimateType')
  if (!input.evidenceIds.length) throw new Error('estimates require at least one local Evidence')
}

function assertCompanyIndustry(database: DatabaseSync, companyId: string, id: string): void {
  const row = database.prepare('SELECT company_industry_id FROM company_industries WHERE company_industry_id = ? AND company_id = ? AND active = 1').get(id, companyId)
  if (!row) throw new Error(`Unknown company industry: ${id}`)
}

function assertCompany(database: DatabaseSync, companyId: string): void {
  if (!database.prepare('SELECT company_id FROM companies WHERE company_id = ?').get(companyId)) throw new Error(`Unknown company: ${companyId}`)
}

function assertBusinessLine(database: DatabaseSync, companyId: string, id: string, companyIndustryId?: string): void {
  const row = database.prepare(`SELECT b.business_line_id FROM business_lines b
    JOIN company_industries ci ON ci.company_industry_id = b.company_industry_id
    WHERE b.business_line_id = ? AND ci.company_id = ? AND b.active = 1${companyIndustryId ? ' AND b.company_industry_id = ?' : ''}`).get(...(companyIndustryId ? [id, companyId, companyIndustryId] : [id, companyId]))
  if (!row) throw new Error(`Unknown business line: ${id}`)
}

function toFactRecord(row: Record<string, unknown>): FactRecord {
  const dimensions = row.dimensions_json ? JSON.parse(String(row.dimensions_json)) as Record<string, string> : null
  let value: number | string | boolean
  if (row.value_number !== null && row.value_number !== undefined) value = Number(row.value_number)
  else if (row.value_text !== null && row.value_text !== undefined) value = String(row.value_text)
  else value = Boolean(row.value_boolean)
  return {
    factId: String(row.fact_id), metricId: String(row.metric_id), companyIndustryId: row.company_industry_id ? String(row.company_industry_id) : null,
    businessLineId: row.business_line_id ? String(row.business_line_id) : null, periodType: row.period_type as FactRecord['periodType'],
    periodStart: row.period_start ? String(row.period_start) : null, periodEnd: String(row.period_end), value,
    unit: row.unit ? String(row.unit) : null, dimensions, verificationStatus: String(row.verification_status),
  }
}

function toEvidenceRecord(row: Record<string, unknown>): EvidenceRecord {
  return {
    evidenceId: String(row.evidence_id), artifactId: String(row.artifact_id), locatorType: String(row.locator_type),
    locator: JSON.parse(String(row.locator_json)) as Record<string, unknown>,
    excerptText: row.excerpt_text ? String(row.excerpt_text) : null, notes: row.notes ? String(row.notes) : null,
  }
}

function toEstimateRecord(row: Record<string, unknown>): EstimateRecord {
  const dimensions = row.dimensions_json ? JSON.parse(String(row.dimensions_json)) as Record<string, string> : null
  return {
    estimateId: String(row.estimate_id), metricId: String(row.metric_id),
    companyIndustryId: row.company_industry_id ? String(row.company_industry_id) : null,
    businessLineId: row.business_line_id ? String(row.business_line_id) : null,
    targetPeriodType: row.target_period_type as EstimateRecord['targetPeriodType'],
    targetPeriodStart: row.target_period_start ? String(row.target_period_start) : null,
    targetPeriodEnd: String(row.target_period_end), asOf: String(row.as_of), provider: String(row.provider),
    analyst: row.analyst ? String(row.analyst) : null, estimateType: String(row.estimate_type),
    value: row.value_number !== null && row.value_number !== undefined ? Number(row.value_number) : String(row.value_text),
    unit: row.unit ? String(row.unit) : null, dimensions, verificationStatus: String(row.verification_status),
  }
}

function toAssignmentRecord(row: Record<string, unknown>): RoleAssignmentRecord {
  const position = row.role_title_raw ? {
    positionId: String(row.position_id), roleType: row.role_type ? String(row.role_type) : null,
    roleTitleRaw: String(row.role_title_raw), positionNameNormalized: row.position_name_normalized ? String(row.position_name_normalized) : null,
    organizationUnitId: row.organization_unit_id ? String(row.organization_unit_id) : null,
  } satisfies PositionRecord : undefined
  return {
    assignmentId: String(row.assignment_id), personId: String(row.person_id), positionId: String(row.position_id),
    startDate: String(row.start_date), endDate: row.end_date ? String(row.end_date) : null, isCurrent: Boolean(row.is_current),
    ...(position ? { position } : {}),
  }
}
