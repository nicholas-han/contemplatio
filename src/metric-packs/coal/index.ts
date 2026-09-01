import type { MetricDefinition, MetricPack } from '../types.js'

const allowedDimensions = ['subsidiary', 'coal_type', 'mine', 'geography']

const coalMetric = (name: string, labelZh: string, unit: string, periodBehavior: 'duration' | 'instant'): MetricDefinition => ({
  metric_id: `coal.${name}`, namespace: 'coal', name, label_zh: labelZh,
  category: 'operating', value_type: 'number', canonical_unit: unit,
  period_behavior: periodBehavior, origin_pack_id: 'coal', origin_pack_version: '0.1.0',
  allowed_dimensions: allowedDimensions,
})

const additionalMetrics: MetricDefinition[] = [
  coalMetric('resource', '煤炭原地资源量', 'tonne', 'instant'),
  coalMetric('capacity_approved', '煤炭核定产能', 'tonne_per_year', 'instant'),
  coalMetric('capacity_planned', '煤炭规划产能', 'tonne_per_year', 'instant'),
  coalMetric('cash_cost', '煤炭现金成本', 'currency_per_tonne', 'duration'),
  coalMetric('unit_cost_yoy_change', '自产煤单位销售成本同比变化', 'percent', 'duration'),
  coalMetric('internal_consumption', '自产煤内部消耗量', 'tonne', 'duration'),
  coalMetric('inventory_change', '煤炭库存变化量', 'tonne', 'duration'),
  coalMetric('chemical_output', '化工产品产量', 'tonne', 'duration'),
  coalMetric('installed_generation_capacity', '发电装机容量', 'MW', 'instant'),
  coalMetric('market_sales_share', '市场煤销量占比', 'percent', 'duration'),
]

export const coalPack: MetricPack = {
  id: 'coal',
  version: '0.1.0',
  business_lines: [
    { business_line_type_id: 'coal.coal_mining_and_sales', industry_id: 'coal', label_zh: '煤炭开采与销售', label_en: 'Coal Mining & Sales' },
    { business_line_type_id: 'coal.coal_chemicals', industry_id: 'coal', label_zh: '煤炭化工', label_en: 'Coal Chemicals' },
    { business_line_type_id: 'coal.power_generation', industry_id: 'coal', label_zh: '发电', label_en: 'Power Generation' },
  ],
  metrics: (['production', 'sales_volume', 'asp', 'unit_cost', 'reserve'].map((name) => ({
    metric_id: `coal.${name}`, namespace: 'coal', name, category: 'operating' as const,
    value_type: 'number' as const,
    canonical_unit: name === 'asp' || name === 'unit_cost' ? 'CNY/tonne' : 'tonne',
    period_behavior: name === 'reserve' ? 'instant' as const : 'duration' as const,
    origin_pack_id: 'coal', origin_pack_version: '0.1.0', allowed_dimensions: allowedDimensions,
  })) as MetricDefinition[]).concat(additionalMetrics),
}
