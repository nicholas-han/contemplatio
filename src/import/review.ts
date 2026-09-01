import type { EquityArchive } from '../archive/archive-service.js'

export const reviewStatuses = [
  'needs_primary_source', 'needs_recalculation', 'needs_definition_check',
  'needs_metric_definition', 'reviewed', 'confirmed', 'verified', 'rejected',
] as const
export type ReviewStatus = (typeof reviewStatuses)[number]

export interface ReviewUpdate {
  observationId: string
  mappedMetricId?: string | null
  reviewStatus: ReviewStatus
  note?: string
}

export function reviewLegacyObservation(archive: EquityArchive, update: ReviewUpdate, companyId = 'yankuang-energy'): void {
  archive.withDatabase(companyId, (database) => {
    const observation = database.prepare(
      'SELECT observation_id FROM legacy_observations WHERE observation_id = ?',
    ).get(update.observationId)
    if (!observation) throw new Error(`Unknown observation: ${update.observationId}`)
    if (update.mappedMetricId) {
      const metric = database.prepare(
        'SELECT metric_id FROM metric_definitions WHERE metric_id = ? AND active = 1',
      ).get(update.mappedMetricId)
      if (!metric) throw new Error(`Unknown active metric definition: ${update.mappedMetricId}`)
    }
    const current = database.prepare(
      'SELECT notes FROM legacy_observations WHERE observation_id = ?',
    ).get(update.observationId) as { notes: string | null }
    const notes = update.note
      ? [current.notes, `[review] ${update.note}`].filter(Boolean).join('\n')
      : current.notes
    if (update.mappedMetricId === undefined) {
      database.prepare('UPDATE legacy_observations SET review_status = ?, notes = ? WHERE observation_id = ?').run(update.reviewStatus, notes, update.observationId)
    } else {
      database.prepare('UPDATE legacy_observations SET mapped_metric_id = ?, review_status = ?, notes = ? WHERE observation_id = ?').run(update.mappedMetricId, update.reviewStatus, notes, update.observationId)
    }
  })
}

export function getLegacyObservation(archive: EquityArchive, observationId: string, companyId = 'yankuang-energy'): Record<string, unknown> {
  return archive.withDatabase(companyId, (database) => {
    const row = database.prepare(
      'SELECT * FROM legacy_observations WHERE observation_id = ?',
    ).get(observationId) as Record<string, unknown> | undefined
    if (!row) throw new Error(`Unknown observation: ${observationId}`)
    return row
  })
}
