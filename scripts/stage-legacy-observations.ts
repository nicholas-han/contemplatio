import { resolve } from 'node:path'
import { EquityArchive } from '../src/archive/archive-service.js'
import { scanLegacyArchive, stageLegacyObservations } from '../src/import/legacy.js'

const sourceRoot = resolve(process.env.CONTE_EQUITY_ARCHIVE ?? './companies')
const targetArgument = process.argv.find((arg) => arg.startsWith('--target='))?.slice('--target='.length)
const targetRoot = resolve(targetArgument || resolve(sourceRoot, '.conte-staging'))
const companyDirectory = process.argv.find((arg) => arg.startsWith('--company-dir='))?.slice('--company-dir='.length)
const companyId = process.argv.find((arg) => arg.startsWith('--company='))?.slice('--company='.length)
const observationPath = process.argv.find((arg) => arg.startsWith('--observation-file='))?.slice('--observation-file='.length)
const inventory = await scanLegacyArchive(sourceRoot, {
  ...(companyDirectory ? { companyDirectory } : {}),
  ...(companyId ? { companyId } : {}),
  ...(observationPath ? { observationPath } : {}),
})
const archive = new EquityArchive({ root: targetRoot })
const result = await stageLegacyObservations(inventory, archive)
console.log(JSON.stringify({ mode: 'stage-observations', targetRoot, companyId: inventory.companyId, observationPath: inventory.observationPath, ...result }, null, 2))
