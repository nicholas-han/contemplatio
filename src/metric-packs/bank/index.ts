import type { MetricDefinition, MetricPack } from '../types.js'

const metric = (name: string, zh: string, en: string, unit: string, period: 'duration' | 'instant' = 'instant'): MetricDefinition => ({
  metric_id: `bank.${name}`, namespace: 'bank', name, label_zh: zh, label_en: en, category: 'financial',
  value_type: 'number', canonical_unit: unit, period_behavior: period, origin_pack_id: 'bank', origin_pack_version: '0.1.0', allowed_dimensions: [],
})

export const bankPack: MetricPack = {
  id: 'bank', version: '0.1.0', metrics: [
    metric('total_assets', '总资产', 'Total assets', 'CNY'), metric('loan_balance', '贷款余额', 'Loan balance', 'CNY'),
    metric('deposit_balance', '存款余额', 'Deposit balance', 'CNY'), metric('net_interest_margin', '净息差', 'Net interest margin', 'percent'),
    metric('non_performing_loan_ratio', '不良贷款率', 'Non-performing loan ratio', 'percent'), metric('provision_coverage_ratio', '拨备覆盖率', 'Provision coverage ratio', 'percent'),
    metric('common_equity_tier1_ratio', '核心一级资本充足率', 'Common equity tier 1 ratio', 'percent'), metric('roe', '净资产收益率', 'Return on equity', 'percent', 'duration'),
    metric('net_profit', '归母净利润', 'Net profit', 'CNY', 'duration'), metric('dividend_per_share', '每股股利', 'Dividend per share', 'CNY_per_share', 'duration'),
  ],
}
