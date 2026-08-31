import { resolve } from 'node:path'
import { EquityArchive } from '../src/archive/archive-service.js'
import { applyMetricPack } from '../src/metric-packs/apply.js'
import { coalPack } from '../src/metric-packs/coal/index.js'
import { financialCommonPack } from '../src/metric-packs/financial-common/index.js'

const root = resolve(process.argv[2] ?? process.env.CONTE_EQUITY_ARCHIVE ?? './companies')
const archive = new EquityArchive({ root })
await archive.initialize()

const workspace = await archive.createCompany({
  schema_version: '0.1',
  company_id: 'yankuang-energy',
  name_zh: '兖矿能源集团股份有限公司',
  name_en: 'Yankuang Energy Group Company Limited',
  website: 'https://www.yanzhoucoal.com.cn/',
  jurisdiction: 'CN',
  accounting_standard: 'CAS',
  primary_industry: 'coal',
  securities: [
    { exchange: 'SSE', ticker: '600188', security_type: 'common_equity' },
    { exchange: 'HKEX', ticker: '01171', security_type: 'common_equity' },
  ],
})

archive.withDatabase('yankuang-energy', (database) => {
  applyMetricPack(database, financialCommonPack)
  applyMetricPack(database, coalPack)
})

console.log(`Created ${workspace.path}`)
