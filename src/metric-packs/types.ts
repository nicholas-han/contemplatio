export interface MetricDefinition {
  metric_id: string
  namespace: string
  name: string
  label_zh?: string
  label_en?: string
  category: 'financial' | 'operating'
  value_type: 'number' | 'text' | 'boolean'
  canonical_unit?: string
  period_behavior: 'duration' | 'instant'
  aggregation_rule?: string
  origin_pack_id: string
  origin_pack_version: string
  allowed_dimensions: string[]
}

export interface MetricPack { id: string; version: string; metrics: readonly MetricDefinition[] }

