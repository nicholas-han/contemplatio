import type { Context } from 'cordis'
import type { EquityArchive } from '../archive/archive-service.js'
import { EquityModelEngine } from '../model-engine/service.js'
import { createEquityResearchTools } from '../tools/research-tools.js'

export const name = 'conte-equity-model-engine'
export const inject = ['equityArchive'] as const

declare module 'cordis' { interface Context { equityModelEngine: EquityModelEngine; equityResearchTools: ReturnType<typeof createEquityResearchTools> } }

export function apply(ctx: Context, _config: unknown): void {
  const archive = ctx.reflect.get('equityArchive') as EquityArchive | undefined
  if (!archive) throw new Error('conte-equity-model-engine requires conte-equity-archive')
  const modelEngine = new EquityModelEngine(archive)
  ctx.reflect.provide('equityModelEngine', modelEngine)
  ctx.reflect.provide('equityResearchTools', createEquityResearchTools(archive))
}

export * from '../model-engine/service.js'
export * from '../tools/research-tools.js'
