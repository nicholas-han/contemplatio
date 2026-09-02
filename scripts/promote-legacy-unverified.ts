import { resolve } from 'node:path'
import { EquityArchive } from '../src/archive/archive-service.js'
import { bulkPromoteLegacyUnverified } from '../src/import/promote.js'

const sourceRoot = resolve(process.env.CONTE_EQUITY_ARCHIVE ?? './companies')
const targetArgument = process.argv.find((arg) => arg.startsWith('--target='))?.slice('--target='.length)
const targetRoot = resolve(targetArgument || resolve(sourceRoot, '.conte-staging'))
const companyId = process.argv.find((arg) => arg.startsWith('--company='))?.slice('--company='.length) ?? 'yankuang-energy'
const apply = process.argv.includes('--apply')
const archive = new EquityArchive({ root: targetRoot })

if (!apply) {
  console.log(JSON.stringify({
    mode: 'dry-run', targetRoot, companyId,
    message: 'This command will promote all mapped scalar duration/instant observations as legacy_unverified.',
  }, null, 2))
  console.log('\nDry-run complete. Add --apply to write unverified facts.')
  process.exit(0)
}

const result = bulkPromoteLegacyUnverified(archive, companyId)
console.log(JSON.stringify({ mode: 'apply', targetRoot, companyId, ...result }, null, 2))
