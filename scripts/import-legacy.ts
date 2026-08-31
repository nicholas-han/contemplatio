import { access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { EquityArchive } from '../src/archive/archive-service.js'
import { applyLegacyImport, scanLegacyArchive } from '../src/import/legacy.js'

const sourceRoot = resolve(process.env.CONTE_EQUITY_ARCHIVE ?? './companies')
const apply = process.argv.includes('--apply')
const targetArgument = process.argv.find((arg) => arg.startsWith('--target='))?.slice('--target='.length)
const targetRoot = resolve(targetArgument || join(sourceRoot, '.conte-staging'))

const inventory = await scanLegacyArchive(sourceRoot)
console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run', sourceRoot, companyDirectory: inventory.companyDirectory,
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
const result = await applyLegacyImport(inventory, archive, targetRoot)
console.log(`\nStaging workspace created: ${result.companyPath}`)
console.log(`Copied ${result.copiedArtifacts} retained artifacts; imported ${result.observationRows} observations as unpromoted legacy material.`)
