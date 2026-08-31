import type { DatabaseSync } from 'node:sqlite'
import type { MetricPack } from './types.js'

export function applyMetricPack(database: DatabaseSync, pack: MetricPack): void {
  const now = new Date().toISOString()
  const insert = database.prepare(`INSERT INTO metric_definitions (
    metric_id, namespace, name, label_zh, label_en, category, value_type,
    canonical_unit, period_behavior, aggregation_rule, origin_pack_id,
    origin_pack_version, allowed_dimensions_json, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(metric_id) DO UPDATE SET
    label_zh = excluded.label_zh, label_en = excluded.label_en,
    canonical_unit = excluded.canonical_unit,
    allowed_dimensions_json = excluded.allowed_dimensions_json, updated_at = excluded.updated_at
  WHERE metric_definitions.origin_pack_id = excluded.origin_pack_id
    AND metric_definitions.origin_pack_version = excluded.origin_pack_version`)

  database.exec('BEGIN IMMEDIATE')
  try {
    for (const metric of pack.metrics) {
      insert.run(
        metric.metric_id, metric.namespace, metric.name, metric.label_zh ?? null,
        metric.label_en ?? null, metric.category, metric.value_type, metric.canonical_unit ?? null,
        metric.period_behavior, metric.aggregation_rule ?? null, metric.origin_pack_id,
        metric.origin_pack_version, JSON.stringify(metric.allowed_dimensions), now, now,
      )
    }
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

