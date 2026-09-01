import type { Context } from 'cordis'
import type { EquityArchive } from '../archive/archive-service.js'
import type { EquityDataEngine } from '../data/data-engine.js'
import { EquityModelEngine } from '../model-engine/service.js'
import { createEquityResearchTools } from '../tools/research-tools.js'
import { registerEquityResearchTools } from '../tools/harness.js'
import { researchToolDefinitions } from '../tools/schema.js'

export const name = 'conte-equity-model-engine'
export const inject = ['equityArchive', 'equityDataEngine', 'tools'] as const

declare module 'cordis' { interface Context { equityModelEngine: EquityModelEngine; equityResearchTools: ReturnType<typeof createEquityResearchTools>; equityResearchToolDefinitions: typeof researchToolDefinitions } }

export function apply(ctx: Context, _config: unknown): void {
  const archive = ctx.reflect.get('equityArchive') as EquityArchive | undefined
  if (!archive) throw new Error('conte-equity-model-engine requires conte-equity-archive')
  const dataEngine = ctx.reflect.get('equityDataEngine') as EquityDataEngine | undefined
  const modelEngine = dataEngine ? new EquityModelEngine(dataEngine) : new EquityModelEngine(archive)
  const tools = dataEngine ? createEquityResearchTools(dataEngine) : createEquityResearchTools(archive)
  ctx.reflect.provide('equityModelEngine', modelEngine)
  ctx.reflect.provide('equityResearchTools', tools)
  ctx.reflect.provide('equityResearchToolDefinitions', researchToolDefinitions)
  registerEquityResearchTools(ctx, tools)
}

export * from '../model-engine/service.js'
export * from '../tools/research-tools.js'
