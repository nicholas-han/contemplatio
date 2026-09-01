import { resolve } from 'node:path'
import { EquityArchive } from '../src/archive/archive-service.js'
import { importCapTableCsv } from '../src/import/cap-table.js'
const file = process.argv.find((arg) => arg.startsWith('--file='))?.slice(7)
if (!file) throw new Error('Usage: npm run import:cap-table -- --file=/path/cap-table.csv [--company=company-id] [--apply]')
const root = resolve(process.env.CONTE_EQUITY_ARCHIVE ?? './companies'); const target = resolve(process.env.CONTE_EQUITY_WEB_ROOT ?? resolve(root, '.conte-staging'))
const companyId = process.argv.find((arg) => arg.startsWith('--company='))?.slice('--company='.length) ?? 'yankuang-energy'
console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'dry-run', targetRoot: target, companyId, ...(await importCapTableCsv(file, new EquityArchive({ root: target }), companyId, process.argv.includes('--apply'))) }, null, 2))
