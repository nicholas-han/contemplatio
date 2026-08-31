import { resolve } from 'node:path'
import { EquityArchive } from '../src/archive/archive-service.js'
import { getLegacyObservation, reviewLegacyObservation, reviewStatuses, type ReviewStatus } from '../src/import/review.js'

const sourceRoot = resolve(process.env.CONTE_EQUITY_ARCHIVE ?? './companies')
const targetArgument = process.argv.find((arg) => arg.startsWith('--target='))?.slice('--target='.length)
const targetRoot = resolve(targetArgument || resolve(sourceRoot, '.conte-staging'))
const observationId = process.argv.find((arg) => arg.startsWith('--observation='))?.slice('--observation='.length)
const metricArgument = process.argv.find((arg) => arg.startsWith('--metric='))?.slice('--metric='.length)
const statusArgument = process.argv.find((arg) => arg.startsWith('--status='))?.slice('--status='.length)
const note = process.argv.find((arg) => arg.startsWith('--note='))?.slice('--note='.length)
const apply = process.argv.includes('--apply')

if (!observationId) throw new Error('--observation=obs-XXXX is required')
if (!statusArgument || !reviewStatuses.includes(statusArgument as ReviewStatus)) {
  throw new Error(`--status must be one of: ${reviewStatuses.join(', ')}`)
}
const archive = new EquityArchive({ root: targetRoot })
const before = getLegacyObservation(archive, observationId)
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', targetRoot, before, update: {
  observationId, mappedMetricId: metricArgument ?? null, reviewStatus: statusArgument, note: note ?? null,
} }, null, 2))

if (!apply) {
  console.log('\nDry-run complete. No staging rows were changed. Add --apply to write the review update.')
  process.exit(0)
}

const reviewUpdate = {
  observationId,
  mappedMetricId: metricArgument ?? null,
  reviewStatus: statusArgument as ReviewStatus,
  ...(note ? { note } : {}),
}
reviewLegacyObservation(archive, reviewUpdate)
console.log('\nReview update applied.')
