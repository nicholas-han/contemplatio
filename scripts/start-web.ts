import { resolve } from 'node:path'
import { EquityArchive } from '../src/archive/archive-service.js'
import { EquityDataEngine } from '../src/data/data-engine.js'
import { EquityWebServer } from '../src/web/server.js'

const sourceRoot = resolve(process.env.CONTE_EQUITY_ARCHIVE ?? './companies')
const archiveRoot = resolve(process.env.CONTE_EQUITY_WEB_ROOT ?? resolve(sourceRoot, '.conte-staging'))
const host = process.env.CONTE_EQUITY_WEB_HOST ?? '127.0.0.1'
const port = Number(process.env.CONTE_EQUITY_WEB_PORT ?? 4173)
const server = new EquityWebServer(new EquityDataEngine(new EquityArchive({ root: archiveRoot })))
const address = await server.start(host, port)
console.log(`Conte Equity Research UI: http://${address.host}:${address.port}`)
const shutdown = async () => { await server.close(); process.exit(0) }
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

