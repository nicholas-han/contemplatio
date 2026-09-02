import { access } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { EquityArchive } from '../src/archive/archive-service.js'
import { applyLegacyImport, defaultLegacyMetricPackNames, legacyManifest, scanLegacyArchive } from '../src/import/legacy.js'
import { bankPack } from '../src/metric-packs/bank/index.js'
import { coalPack } from '../src/metric-packs/coal/index.js'
import { financialCommonPack } from '../src/metric-packs/financial-common/index.js'
import { insurancePack } from '../src/metric-packs/insurance/index.js'
import type { MetricPack } from '../src/metric-packs/types.js'

const sourceRoot = resolve(process.env.CONTE_EQUITY_ARCHIVE ?? './companies')
const apply = process.argv.includes('--apply')
const targetArgument = process.argv.find((arg) => arg.startsWith('--target='))?.slice('--target='.length)
const targetRoot = resolve(targetArgument || join(sourceRoot, '.conte-staging'))
const companyDirectory = process.argv.find((arg) => arg.startsWith('--company-dir='))?.slice('--company-dir='.length)
const companyId = process.argv.find((arg) => arg.startsWith('--company='))?.slice('--company='.length)
const observationPath = process.argv.find((arg) => arg.startsWith('--observation-file='))?.slice('--observation-file='.length)
const argument = (name: string): string | undefined => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const availablePacks: Record<string, MetricPack> = { 'financial-common': financialCommonPack, coal: coalPack, bank: bankPack, insurance: insurancePack }

const inventory = await scanLegacyArchive(sourceRoot, {
  ...(companyDirectory ? { companyDirectory } : {}),
  ...(companyId ? { companyId } : {}),
  ...(observationPath ? { observationPath } : {}),
})
const selectedPackNames = (argument('packs')?.split(',') ?? defaultLegacyMetricPackNames(inventory.companyId)).map((name) => name.trim()).filter(Boolean)
for (const name of selectedPackNames) if (!availablePacks[name]) throw new Error(`Unknown metric pack: ${name}`)
console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run', sourceRoot, companyDirectory: inventory.companyDirectory,
  companyId: inventory.companyId, observationPath: inventory.observationPath, packs: selectedPackNames,
  files: inventory.files.length, extensionCounts: inventory.extensionCounts,
  observationRows: inventory.observationRows, observationStatuses: inventory.observationStatuses,
}, null, 2))

if (!apply) {
  console.log('\nDry-run complete. No files were written. Pass --apply to create the staging workspace.')
  process.exit(0)
}

try {
  await access(targetRoot)
  throw new Error(`Target already exists; refusing to overwrite: ${targetRoot}`)
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}

const archive = new EquityArchive({ root: targetRoot })
const manifest = legacyManifest({
  companyId: inventory.companyId,
  ...(argument('name-zh') ? { nameZh: argument('name-zh')! } : {}),
  nameEn: argument('name-en') ?? basename(inventory.companyDirectory),
  ...(argument('website') ? { website: argument('website')! } : {}),
  ...(argument('jurisdiction') ? { jurisdiction: argument('jurisdiction')! } : {}),
  ...(argument('accounting-standard') ? { accountingStandard: argument('accounting-standard') as 'CAS' | 'IFRS' | 'US-GAAP' } : {}),
  ...(argument('industry') ? { primaryIndustry: argument('industry')! } : {}),
})
const result = await applyLegacyImport(inventory, archive, targetRoot, { manifest, metricPacks: selectedPackNames.map((name) => availablePacks[name]!) })
console.log(`\nStaging workspace created: ${result.companyPath}`)
console.log(`Copied ${result.copiedArtifacts} retained artifacts; imported ${result.observationRows} observations as unpromoted legacy material.`)
