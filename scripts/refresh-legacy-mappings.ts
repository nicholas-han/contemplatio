import { resolve } from 'node:path'
import { EquityArchive } from '../src/archive/archive-service.js'
import { applyMetricPack } from '../src/metric-packs/apply.js'
import { bankPack } from '../src/metric-packs/bank/index.js'
import { coalPack } from '../src/metric-packs/coal/index.js'
import { financialCommonPack } from '../src/metric-packs/financial-common/index.js'
import { insurancePack } from '../src/metric-packs/insurance/index.js'
import type { MetricPack } from '../src/metric-packs/types.js'
import { defaultLegacyMetricPackNames, refreshLegacyMappings } from '../src/import/legacy.js'

const argument = (name: string): string | undefined => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const sourceRoot = resolve(process.env.CONTE_EQUITY_ARCHIVE ?? './companies')
const targetArgument = argument('target')
const targetRoot = resolve(targetArgument || resolve(sourceRoot, '.conte-staging'))
const companyId = argument('company') ?? 'yankuang-energy'
const availablePacks: Record<string, MetricPack> = { 'financial-common': financialCommonPack, coal: coalPack, bank: bankPack, insurance: insurancePack }
const selectedPackNames = (argument('packs')?.split(',') ?? defaultLegacyMetricPackNames(companyId)).map((name) => name.trim()).filter(Boolean)
for (const name of selectedPackNames) if (!availablePacks[name]) throw new Error(`Unknown metric pack: ${name}`)
const archive = new EquityArchive({ root: targetRoot })
const updated = archive.withDatabase(companyId, (database) => {
  for (const name of selectedPackNames) applyMetricPack(database, availablePacks[name]!)
  return refreshLegacyMappings(database)
})
console.log(JSON.stringify({ targetRoot, companyId, packs: selectedPackNames, updated }, null, 2))
