import { resolve } from 'node:path'
import { EquityArchive } from '../src/archive/archive-service.js'

const companyId = process.argv.find((arg) => arg.startsWith('--company='))?.slice('--company='.length)
const destination = process.argv.find((arg) => arg.startsWith('--destination='))?.slice('--destination='.length)
if (!companyId || !destination) throw new Error('Usage: npm run archive:export -- --company=company-id --destination=/path/to/export-root')
const sourceRoot = resolve(process.env.CONTE_EQUITY_ARCHIVE ?? './companies')
const targetRoot = resolve(process.env.CONTE_EQUITY_WEB_ROOT ?? resolve(sourceRoot, '.conte-staging'))
const exportedPath = await new EquityArchive({ root: targetRoot }).exportCompany(companyId, destination)
console.log(JSON.stringify({ companyId, exportedPath }, null, 2))
