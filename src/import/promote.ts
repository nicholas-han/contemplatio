import type { EquityArchive } from '../archive/archive-service.js'

export interface PromotionPlan {
  observationId: string
  allowed: boolean
  reason?: string
  mappedMetricId: string | null
  reviewStatus: string
}

export interface BulkPromotionResult {
  promoted: number
  skipped: Array<{ observationId: string; reason: string }>
}

export function planLegacyPromotions(archive: EquityArchive, observationIds?: string[], companyId = 'yankuang-energy'): PromotionPlan[] {
  return archive.withDatabase(companyId, (database) => {
    const rows = observationIds?.length
      ? database.prepare(`SELECT observation_id, mapped_metric_id, review_status, period_kind, period_start, value, period_end, evidence_id, promoted_fact_id
          FROM legacy_observations WHERE observation_id IN (${observationIds.map(() => '?').join(',')})`).all(...observationIds)
      : database.prepare(`SELECT observation_id, mapped_metric_id, review_status, period_kind, period_start, value, period_end, evidence_id, promoted_fact_id
          FROM legacy_observations WHERE promoted_fact_id IS NULL ORDER BY observation_id`).all()
    return (rows as Array<{
      observation_id: string; mapped_metric_id: string | null; review_status: string; period_kind: string; period_start: string | null;
      value: string | null; period_end: string | null; evidence_id: string | null; promoted_fact_id: string | null
    }>).map((row) => {
      let reason: string | undefined
      if (row.promoted_fact_id) reason = `already promoted as ${row.promoted_fact_id}`
      else if (!row.mapped_metric_id) reason = 'no mapped metric definition'
      else if (!['confirmed', 'verified'].includes(row.review_status)) reason = `review status is ${row.review_status}`
      else if (!['duration', 'instant'].includes(row.period_kind)) reason = `period kind ${row.period_kind} is not an actual fact`
      else if (row.period_kind === 'duration' && !row.period_start) reason = 'duration facts require period_start'
      else if (row.period_kind === 'instant' && row.period_start) reason = 'instant facts must not have period_start'
      else if (!row.value || Number.isNaN(Number(row.value))) reason = 'value is not a single numeric value'
      else if (!row.period_end) reason = 'period_end is required for a fact'
      else if (!row.evidence_id) reason = 'local Evidence is required'
      return {
        observationId: row.observation_id, allowed: !reason, ...(reason ? { reason } : {}),
        mappedMetricId: row.mapped_metric_id, reviewStatus: row.review_status,
      }
    })
  })
}

export function promoteLegacyObservations(archive: EquityArchive, observationIds: string[], companyId = 'yankuang-energy'): number {
  const plans = planLegacyPromotions(archive, observationIds, companyId)
  const blocked = plans.filter((plan) => !plan.allowed)
  if (blocked.length) {
    throw new Error(blocked.map((plan) => `${plan.observationId}: ${plan.reason}`).join('; '))
  }

  return archive.withDatabase(companyId, (database) => {
    const rows = database.prepare(`SELECT observation_id, mapped_metric_id, period_kind, period_start, period_end, value, unit, dimensions_text,
        evidence_id, imported_at FROM legacy_observations WHERE observation_id IN (${observationIds.map(() => '?').join(',')})`).all(...observationIds) as Array<{
      observation_id: string; mapped_metric_id: string; period_kind: string; period_start: string | null; period_end: string;
      value: string; unit: string | null; dimensions_text: string | null; evidence_id: string; imported_at: string
    }>
    const insert = database.prepare(`INSERT INTO facts (
      fact_id, metric_id, period_type, period_start, period_end, value_number, unit,
      dimensions_json, ingestion_method, verification_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    const link = database.prepare('INSERT INTO fact_evidence (fact_id, evidence_id) VALUES (?, ?)')
    const mark = database.prepare('UPDATE legacy_observations SET promoted_fact_id = ? WHERE observation_id = ?')
    const now = new Date().toISOString()
    database.exec('BEGIN IMMEDIATE')
    try {
      for (const row of rows) {
        const factId = `fact-${row.observation_id}`
        insert.run(
          factId, row.mapped_metric_id, row.period_kind as 'duration' | 'instant', row.period_start,
          row.period_end, Number(row.value), row.unit, dimensionsToJson(row.dimensions_text),
          'legacy_import_reviewed', 'confirmed', row.imported_at, now,
        )
        link.run(factId, row.evidence_id)
        mark.run(factId, row.observation_id)
      }
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
    return rows.length
  })
}

export function bulkPromoteLegacyUnverified(archive: EquityArchive, companyId = 'yankuang-energy'): BulkPromotionResult {
  return archive.withDatabase(companyId, (database) => {
    const rows = database.prepare(`SELECT observation_id, mapped_metric_id, period_kind, period_start, period_end,
        value, unit, dimensions_text, evidence_id, imported_at, promoted_fact_id
      FROM legacy_observations WHERE promoted_fact_id IS NULL ORDER BY observation_id`).all() as Array<{
      observation_id: string; mapped_metric_id: string | null; period_kind: string; period_start: string | null;
      period_end: string | null; value: string | null; unit: string | null; dimensions_text: string | null;
      evidence_id: string | null; imported_at: string; promoted_fact_id: string | null
    }>
    const skipped: Array<{ observationId: string; reason: string }> = []
    const promotable = rows.filter((row) => {
      let reason: string | undefined
      if (!row.mapped_metric_id) reason = 'no mapped metric definition'
      else if (!['duration', 'instant'].includes(row.period_kind)) reason = `period kind ${row.period_kind} is not an actual fact`
      else if (row.period_kind === 'duration' && !row.period_start) reason = 'duration facts require period_start'
      else if (row.period_kind === 'instant' && row.period_start) reason = 'instant facts must not have period_start'
      else if (!row.value || Number.isNaN(Number(row.value))) reason = 'value is not a single numeric value'
      else if (!row.period_end) reason = 'period_end is required for a fact'
      else if (!row.evidence_id) reason = 'local Evidence is required'
      if (reason) skipped.push({ observationId: row.observation_id, reason })
      return !reason
    })
    const insert = database.prepare(`INSERT INTO facts (
      fact_id, metric_id, period_type, period_start, period_end, value_number, unit,
      dimensions_json, ingestion_method, verification_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    const link = database.prepare('INSERT INTO fact_evidence (fact_id, evidence_id) VALUES (?, ?)')
    const mark = database.prepare('UPDATE legacy_observations SET promoted_fact_id = ? WHERE observation_id = ?')
    const now = new Date().toISOString()
    database.exec('BEGIN IMMEDIATE')
    try {
      for (const row of promotable) {
        const factId = `fact-${row.observation_id}`
        insert.run(
          factId, row.mapped_metric_id, row.period_kind as 'duration' | 'instant', row.period_start,
          row.period_end, Number(row.value), row.unit, dimensionsToJson(row.dimensions_text),
          'legacy_import_unverified', 'legacy_unverified', row.imported_at, now,
        )
        link.run(factId, row.evidence_id)
        mark.run(factId, row.observation_id)
      }
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
    return { promoted: promotable.length, skipped }
  })
}

function dimensionsToJson(value: string | null): string | null {
  if (!value) return null
  const dimensions: Record<string, string> = {}
  for (const pair of value.split(';')) {
    const separator = pair.indexOf('=')
    if (separator > 0) dimensions[pair.slice(0, separator)] = pair.slice(separator + 1)
  }
  return Object.keys(dimensions).length ? JSON.stringify(dimensions) : null
}
