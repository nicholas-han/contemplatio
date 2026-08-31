import { resolve } from 'node:path'
import { EquityArchive } from '../src/archive/archive-service.js'
import { scanLegacyArchive, stageLegacyObservations } from '../src/import/legacy.js'

const sourceRoot = resolve(process.env.CONTE_EQUITY_ARCHIVE ?? './companies')
const targetArgument = process.argv.find((arg) => arg.startsWith('--target='))?.slice('--target='.length)
const targetRoot = resolve(targetArgument || resolve(sourceRoot, '.conte-staging'))
const inventory = await scanLegacyArchive(sourceRoot)
const archive = new EquityArchive({ root: targetRoot })
const result = await stageLegacyObservations(inventory, archive)
console.log(JSON.stringify({ mode: 'stage-observations', targetRoot, ...result }, null, 2))
