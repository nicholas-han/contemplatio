import { resolve } from 'node:path'
import { EquityArchive } from '../src/archive/archive-service.js'
import { companyManifestSchema, type CompanyManifest } from '../src/domain/company.js'

const argument = (name: string): string | undefined => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const companyId = argument('company')
if (!companyId) throw new Error('Usage: npm run company:create -- --company=company-id [--name-zh=...] [--name-en=...] [--jurisdiction=CN] [--accounting-standard=CAS] [--industry=coal] [--security=SSE:600188:common_equity] [--apply]')
const securities = process.argv.filter((arg) => arg.startsWith('--security=')).map((arg) => {
  const [exchange, ticker, security_type] = arg.slice('--security='.length).split(':')
  if (!exchange || !ticker || !security_type) throw new Error(`Invalid security: ${arg}`)
  return { exchange, ticker, security_type }
})
const manifest = companyManifestSchema.parse({
  schema_version: '0.1', company_id: companyId, name_zh: argument('name-zh'), name_en: argument('name-en'),
  jurisdiction: argument('jurisdiction') ?? 'CN', accounting_standard: argument('accounting-standard') ?? 'CAS',
  primary_industry: argument('industry'), securities,
}) as CompanyManifest
const sourceRoot = resolve(process.env.CONTE_EQUITY_ARCHIVE ?? './companies')
const root = resolve(process.env.CONTE_EQUITY_WEB_ROOT ?? resolve(sourceRoot, '.conte-staging'))
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ mode: 'dry-run', root, manifest }, null, 2))
} else {
  const archive = new EquityArchive({ root })
  const company = await archive.createCompany(manifest)
  console.log(JSON.stringify({ mode: 'apply', root, companyId: manifest.company_id, path: company.path, databasePath: company.databasePath }, null, 2))
}
