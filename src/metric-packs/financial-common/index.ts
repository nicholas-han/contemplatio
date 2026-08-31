import type { MetricDefinition, MetricPack } from '../types.js'

const commonMetric = (
  name: string,
  labelZh: string,
  labelEn: string,
  unit: string,
  periodBehavior: 'duration' | 'instant',
): MetricDefinition => ({
  metric_id: `financial.${name}`, namespace: 'financial', name,
  label_zh: labelZh, label_en: labelEn, category: 'financial', value_type: 'number',
  canonical_unit: unit, period_behavior: periodBehavior,
  origin_pack_id: 'financial-common', origin_pack_version: '0.1.0', allowed_dimensions: [],
})

const additionalMetrics: MetricDefinition[] = [
  commonMetric('operating_cash_flow', '经营活动现金流量净额', 'Operating cash flow', 'CNY', 'duration'),
  commonMetric('capital_expenditure', '资本性支出', 'Capital expenditure', 'CNY', 'duration'),
  commonMetric('adjusted_net_profit', '扣非归母净利润', 'Adjusted net profit', 'CNY', 'duration'),
  commonMetric('non_recurring_profit', '非经常性损益', 'Non-recurring profit', 'CNY', 'duration'),
  commonMetric('revenue_share', '营业收入占比', 'Revenue share', 'percent', 'duration'),
  commonMetric('revenue_yoy_change', '营业收入同比变化', 'Revenue YoY change', 'percent', 'duration'),
  commonMetric('operating_cost_yoy_change', '营业成本同比变化', 'Operating cost YoY change', 'percent', 'duration'),
  commonMetric('gross_margin', '毛利率', 'Gross margin', 'percent', 'duration'),
  commonMetric('dividend_payout_ratio', '现金分红比例', 'Dividend payout ratio', 'percent', 'duration'),
  commonMetric('dividend_per_share', '每股现金股利', 'Dividend per share', 'CNY_per_share', 'duration'),
  commonMetric('asset_liability_ratio', '资产负债率', 'Asset-liability ratio', 'percent', 'instant'),
  commonMetric('attributable_equity', '股东应占权益', 'Attributable equity', 'CNY', 'instant'),
  commonMetric('total_borrowings', '总借款', 'Total borrowings', 'CNY', 'instant'),
  commonMetric('capital_gearing', '资本负债比率', 'Capital gearing', 'percent', 'instant'),
  commonMetric('unused_credit_facilities', '未使用授信额度', 'Unused credit facilities', 'CNY', 'instant'),
  commonMetric('employee_count', '员工人数', 'Employee count', 'person', 'instant'),
  commonMetric('average_borrowing_rate', '平均借款利率', 'Average borrowing rate', 'percent', 'instant'),
  commonMetric('five_year_borrowing_rate', '五年期借款利率', 'Five-year borrowing rate', 'percent', 'instant'),
]

export const financialCommonPack: MetricPack = {
  id: 'financial-common',
  version: '0.1.0',
  metrics: [
    {
      metric_id: 'financial.revenue', namespace: 'financial', name: 'revenue',
      label_zh: '营业收入', label_en: 'Revenue', category: 'financial', value_type: 'number',
      canonical_unit: 'CNY', period_behavior: 'duration', origin_pack_id: 'financial-common',
      origin_pack_version: '0.1.0', allowed_dimensions: [],
    },
    {
      metric_id: 'financial.net_profit', namespace: 'financial', name: 'net_profit',
      label_zh: '归母净利润', label_en: 'Net profit attributable to shareholders',
      category: 'financial', value_type: 'number', canonical_unit: 'CNY',
      period_behavior: 'duration', origin_pack_id: 'financial-common',
      origin_pack_version: '0.1.0', allowed_dimensions: [],
    },
    ...additionalMetrics,
  ],
}
