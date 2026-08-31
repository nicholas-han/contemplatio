import { z } from 'zod'
import type { Context } from 'cordis'
import { EquityArchive } from '../archive/archive-service.js'

export const name = 'conte-equity-archive'
export const Config = z.object({
  root: z.string().trim().min(1).default(() => process.env.CONTE_EQUITY_ARCHIVE ?? './companies'),
})
export type Config = z.infer<typeof Config>

export async function apply(ctx: Context, config: Config): Promise<void> {
  const archive = new EquityArchive(config)
  await archive.initialize()
  ctx.reflect.provide('equityArchive', archive)
}

export * from '../archive/archive-service.js'
