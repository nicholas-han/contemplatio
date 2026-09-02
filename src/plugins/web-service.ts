import type { Context } from 'cordis'
import { EquityArchive } from '../archive/archive-service.js'
import { EquityDataEngine } from '../data/data-engine.js'
import type { EquityModelEngine } from '../model-engine/service.js'
import { EquityWebServer } from '../web/server.js'

export const name = 'conte-equity-web-service'
export const inject = ['equityArchive', 'equityDataEngine', 'equityModelEngine'] as const

export async function apply(ctx: Context, config: { root?: string; host?: string; port?: number } = {}): Promise<() => Promise<void>> {
  const archive = ctx.reflect.get('equityArchive') as EquityArchive | undefined
  const dataEngine = ctx.reflect.get('equityDataEngine') as EquityDataEngine | undefined
  const modelEngine = ctx.reflect.get('equityModelEngine') as EquityModelEngine | undefined
  if (!archive || !dataEngine || !modelEngine) throw new Error('conte-equity-web-service requires archive, data engine, and model engine plugins')
  const server = new EquityWebServer(dataEngine, { modelEngine })
  const address = await server.start(config.host ?? '127.0.0.1', config.port ?? 4173)
  ctx.logger.info(`Conte Equity Research UI listening at http://${address.host}:${address.port}`)
  return () => server.close()
}

export * from '../web/server.js'
