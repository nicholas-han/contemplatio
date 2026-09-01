import { resolve } from 'node:path'
import { EquityArchive } from '../src/archive/archive-service.js'
import { EquityDataEngine } from '../src/data/data-engine.js'
import { bankPack } from '../src/metric-packs/bank/index.js'
import { coalPack } from '../src/metric-packs/coal/index.js'
import { financialCommonPack } from '../src/metric-packs/financial-common/index.js'
import { insurancePack } from '../src/metric-packs/insurance/index.js'
import type { MetricPack } from '../src/metric-packs/types.js'

const argument = (name: string): string | undefined => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const companyId = argument('company')
if (!companyId) throw new Error('Usage: npm run metric-pack:apply -- --company=company-id [--packs=financial-common,coal] [--company-industry=industry-id] [--apply]')
const packs: Record<string, MetricPack> = { 'financial-common': financialCommonPack, coal: coalPack, bank: bankPack, insurance: insurancePack }
const selected = (argument('packs') ?? 'financial-common').split(',').map((name) => name.trim()).filter(Boolean)
for (const name of selected) if (!packs[name]) throw new Error(`Unknown metric pack: ${name}`)
const sourceRoot = resolve(process.env.CONTE_EQUITY_ARCHIVE ?? './companies')
const root = resolve(process.env.CONTE_EQUITY_WEB_ROOT ?? resolve(sourceRoot, '.conte-staging'))
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ mode: 'dry-run', root, companyId, packs: selected.map((name) => ({ id: name, version: packs[name]!.version, metrics: packs[name]!.metrics.length })) }, null, 2))
} else {
  const engine = new EquityDataEngine(new EquityArchive({ root }))
  const applications = selected.map((name) => engine.applyMetricPack(companyId, packs[name]!, argument('company-industry')))
  console.log(JSON.stringify({ mode: 'apply', root, companyId, applications }, null, 2))
}
