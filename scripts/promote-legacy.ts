import { resolve } from 'node:path'
import { EquityArchive } from '../src/archive/archive-service.js'
import { planLegacyPromotions, promoteLegacyObservations } from '../src/import/promote.js'

const sourceRoot = resolve(process.env.CONTE_EQUITY_ARCHIVE ?? './companies')
const targetArgument = process.argv.find((arg) => arg.startsWith('--target='))?.slice('--target='.length)
const targetRoot = resolve(targetArgument || resolve(sourceRoot, '.conte-staging'))
const companyId = process.argv.find((arg) => arg.startsWith('--company='))?.slice('--company='.length) ?? 'yankuang-energy'
const ids = process.argv.filter((arg) => arg.startsWith('--observation='))
  .map((arg) => arg.slice('--observation='.length)).filter(Boolean)
const apply = process.argv.includes('--apply')
const archive = new EquityArchive({ root: targetRoot })
const plans = planLegacyPromotions(archive, ids, companyId)
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', targetRoot, companyId, plans }, null, 2))

if (!apply) {
  console.log('\nDry-run complete. No facts were written. Add --apply with explicit --observation=... IDs after review.')
  process.exit(0)
}
if (!ids.length) throw new Error('--apply requires at least one --observation=... ID')
console.log(`Promoted ${promoteLegacyObservations(archive, ids, companyId)} observation(s) to facts.`)
