import type { MetricDefinition, MetricPack } from '../types.js'

const metric = (name: string, zh: string, en: string, unit: string, period: 'duration' | 'instant' = 'duration'): MetricDefinition => ({
  metric_id: `insurance.${name}`, namespace: 'insurance', name, label_zh: zh, label_en: en, category: 'financial',
  value_type: 'number', canonical_unit: unit, period_behavior: period, origin_pack_id: 'insurance', origin_pack_version: '0.1.0', allowed_dimensions: [],
})

export const insurancePack: MetricPack = {
  id: 'insurance', version: '0.1.0', business_lines: [
    { business_line_type_id: 'insurance.life_and_health', industry_id: 'insurance', label_zh: '寿险与健康险', label_en: 'Life & Health' },
    { business_line_type_id: 'insurance.p_and_c', industry_id: 'insurance', label_zh: '财产险', label_en: 'Property & Casualty' },
  ], metrics: [
    metric('gross_written_premium', '原保险保费收入', 'Gross written premium', 'CNY'), metric('new_business_value', '新业务价值', 'New business value', 'CNY'),
    metric('embedded_value', '内含价值', 'Embedded value', 'CNY', 'instant'), metric('value_of_new_business_margin', '新业务价值率', 'Value of new business margin', 'percent'),
    metric('solvency_ratio', '综合偿付能力充足率', 'Solvency ratio', 'percent', 'instant'), metric('combined_ratio', '综合成本率', 'Combined ratio', 'percent'),
    metric('investment_yield', '投资收益率', 'Investment yield', 'percent'), metric('net_profit', '归母净利润', 'Net profit', 'CNY'),
    metric('dividend_per_share', '每股股利', 'Dividend per share', 'CNY_per_share'),
  ],
}
