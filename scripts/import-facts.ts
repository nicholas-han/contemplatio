import { resolve } from 'node:path'
import { EquityArchive } from '../src/archive/archive-service.js'
import { importFactsCsv } from '../src/import/facts.js'

const file = process.argv.find((arg) => arg.startsWith('--file='))?.slice('--file='.length)
if (!file) throw new Error('Usage: npm run import:facts -- --file=/path/facts.csv [--company=company-id] [--apply]')
const sourceRoot = resolve(process.env.CONTE_EQUITY_ARCHIVE ?? './companies')
const targetRoot = resolve(process.env.CONTE_EQUITY_WEB_ROOT ?? resolve(sourceRoot, '.conte-staging'))
const companyId = process.argv.find((arg) => arg.startsWith('--company='))?.slice('--company='.length) ?? 'yankuang-energy'
const apply = process.argv.includes('--apply')
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', targetRoot, companyId, ...(await importFactsCsv(file, new EquityArchive({ root: targetRoot }), companyId, apply)) }, null, 2))
