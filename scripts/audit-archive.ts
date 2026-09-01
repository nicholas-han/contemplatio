import { resolve } from 'node:path'
import { EquityArchive } from '../src/archive/archive-service.js'

const sourceRoot = resolve(process.env.CONTE_EQUITY_ARCHIVE ?? './companies')
const targetRoot = resolve(process.env.CONTE_EQUITY_WEB_ROOT ?? resolve(sourceRoot, '.conte-staging'))
const companyId = process.argv.find((arg) => arg.startsWith('--company='))?.slice('--company='.length) ?? 'yankuang-energy'
console.log(JSON.stringify(await new EquityArchive({ root: targetRoot }).auditCompany(companyId), null, 2))
