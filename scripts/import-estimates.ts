import { resolve } from 'node:path'
import { EquityArchive } from '../src/archive/archive-service.js'
import { importEstimatesCsv } from '../src/import/estimates.js'

const fileArgument = process.argv.find((arg) => arg.startsWith('--file='))?.slice('--file='.length)
if (!fileArgument) throw new Error('Usage: npm run import:estimates -- --file=/path/estimates.csv [--company=yankuang-energy] [--apply]')
const sourceRoot = resolve(process.env.CONTE_EQUITY_ARCHIVE ?? './companies')
const targetRoot = resolve(process.env.CONTE_EQUITY_WEB_ROOT ?? resolve(sourceRoot, '.conte-staging'))
const companyId = process.argv.find((arg) => arg.startsWith('--company='))?.slice('--company='.length) ?? 'yankuang-energy'
const apply = process.argv.includes('--apply')
const result = await importEstimatesCsv(fileArgument, new EquityArchive({ root: targetRoot }), companyId, apply)
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', targetRoot, companyId, ...result }, null, 2))
