import type { Context } from 'cordis'
import type { EquityArchive } from '../archive/archive-service.js'
import { EquityDataEngine } from '../data/data-engine.js'

export const name = 'conte-equity-data-engine'
export const inject = ['equityArchive'] as const

declare module 'cordis' { interface Context { equityDataEngine: EquityDataEngine } }

export function apply(ctx: Context, _config: unknown): void {
  const archive = ctx.reflect.get('equityArchive') as EquityArchive | undefined
  if (!archive) throw new Error('conte-equity-data-engine requires conte-equity-archive')
  ctx.reflect.provide('equityDataEngine', new EquityDataEngine(archive))
}

export * from '../data/data-engine.js'
