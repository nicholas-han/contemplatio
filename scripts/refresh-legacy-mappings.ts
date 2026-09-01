import { resolve } from 'node:path'
import { EquityArchive } from '../src/archive/archive-service.js'
import { applyMetricPack } from '../src/metric-packs/apply.js'
import { coalPack } from '../src/metric-packs/coal/index.js'
import { financialCommonPack } from '../src/metric-packs/financial-common/index.js'
import { legacyMetricMap } from '../src/import/legacy.js'

const sourceRoot = resolve(process.env.CONTE_EQUITY_ARCHIVE ?? './companies')
const targetArgument = process.argv.find((arg) => arg.startsWith('--target='))?.slice('--target='.length)
const targetRoot = resolve(targetArgument || resolve(sourceRoot, '.conte-staging'))
const companyId = process.argv.find((arg) => arg.startsWith('--company='))?.slice('--company='.length) ?? 'yankuang-energy'
const archive = new EquityArchive({ root: targetRoot })
const updated = archive.withDatabase(companyId, (database) => {
  applyMetricPack(database, financialCommonPack)
  applyMetricPack(database, coalPack)
  const update = database.prepare(`UPDATE legacy_observations SET mapped_metric_id = ?
    WHERE legacy_metric_id = ? AND mapped_metric_id IS NULL`)
  let count = 0
  database.exec('BEGIN IMMEDIATE')
  try {
    for (const [legacyMetricId, mappedMetricId] of Object.entries(legacyMetricMap)) {
      count += Number(update.run(mappedMetricId, legacyMetricId).changes)
    }
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
  return count
})
console.log(JSON.stringify({ targetRoot, companyId, updated }, null, 2))
