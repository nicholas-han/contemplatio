import { resolve } from 'node:path'
import { EquityArchive } from '../src/archive/archive-service.js'

const sourceRoot = resolve(process.env.CONTE_EQUITY_ARCHIVE ?? './companies')
const targetArgument = process.argv.find((arg) => arg.startsWith('--target='))?.slice('--target='.length)
const targetRoot = resolve(targetArgument || resolve(sourceRoot, '.conte-staging'))
const archive = new EquityArchive({ root: targetRoot })
const updated = archive.withDatabase('yankuang-energy', (database) => database.prepare(`UPDATE legacy_observations
  SET period_end = as_of_date
  WHERE period_end IS NULL AND period_kind = 'instant' AND as_of_date IS NOT NULL`).run().changes)
console.log(JSON.stringify({ targetRoot, updated }, null, 2))

