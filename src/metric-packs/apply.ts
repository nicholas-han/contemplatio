import type { DatabaseSync } from 'node:sqlite'
import type { MetricPack } from './types.js'

export function applyMetricPack(database: DatabaseSync, pack: MetricPack, options: { transaction?: boolean } = {}): void {
  const transaction = options.transaction ?? true
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
  const insertBusinessLine = database.prepare(`INSERT INTO business_line_types (
    business_line_type_id, industry_id, label_zh, label_en, origin_pack_id,
    origin_pack_version, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(business_line_type_id) DO UPDATE SET
    label_zh = excluded.label_zh, label_en = excluded.label_en,
    updated_at = excluded.updated_at
  WHERE business_line_types.origin_pack_id = excluded.origin_pack_id
    AND business_line_types.origin_pack_version = excluded.origin_pack_version`)

  if (transaction) database.exec('BEGIN IMMEDIATE')
  try {
    for (const metric of pack.metrics) {
      insert.run(
        metric.metric_id, metric.namespace, metric.name, metric.label_zh ?? null,
        metric.label_en ?? null, metric.category, metric.value_type, metric.canonical_unit ?? null,
        metric.period_behavior, metric.aggregation_rule ?? null, metric.origin_pack_id,
        metric.origin_pack_version, JSON.stringify(metric.allowed_dimensions), now, now,
      )
    }
    for (const businessLine of pack.business_lines ?? []) {
      insertBusinessLine.run(
        businessLine.business_line_type_id, businessLine.industry_id,
        businessLine.label_zh ?? null, businessLine.label_en ?? null,
        pack.id, pack.version, now, now,
      )
    }
    if (transaction) database.exec('COMMIT')
  } catch (error) {
    if (transaction) database.exec('ROLLBACK')
    throw error
  }
}
