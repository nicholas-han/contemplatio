import { resolve } from 'node:path'
import type { Context } from 'cordis'
import { EquityArchive } from '../archive/archive-service.js'
import { EquityDataEngine } from '../data/data-engine.js'
import { EquityWebServer } from '../web/server.js'

export const name = 'conte-equity-web-service'

export async function apply(ctx: Context, config: { root?: string; host?: string; port?: number } = {}): Promise<() => Promise<void>> {
  const archive = new EquityArchive({ root: resolve(config.root ?? process.env.CONTE_EQUITY_WEB_ROOT ?? './companies') })
  const server = new EquityWebServer(new EquityDataEngine(archive))
  const address = await server.start(config.host ?? '127.0.0.1', config.port ?? 4173)
  ctx.logger.info(`Conte Equity Research UI listening at http://${address.host}:${address.port}`)
  return () => server.close()
}

export * from '../web/server.js'
