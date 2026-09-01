import type { Context } from 'cordis'
import type { EquityResearchTools } from './research-tools.js'
import { researchToolDefinitions, type ResearchToolDefinition } from './schema.js'

/** Minimal structural view of the Harness dsh-tools registry.
 * Keeping this structural avoids making the standalone npm package depend on
 * the Harness monorepo while still producing registry-compatible definitions.
 */
export interface HarnessToolRegistry {
  register(definition: HarnessToolDefinition): () => void
}

export interface HarnessToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: {
    schema: Record<string, unknown>
    render(args: unknown, value: unknown): Array<{ type: 'text'; text: string }>
  }
  execute(args: unknown, exec: unknown): Promise<unknown>
}

export interface ContextWithTools extends Context {
  tools?: HarnessToolRegistry
}

/**
 * Register the high-level research tools when the host supplies the Harness
 * `tools` service. The returned disposers are owned by the Cordis plugin
 * lifecycle, just like native `ctx.tools.register` calls.
 */
export function registerEquityResearchTools(
  ctx: Context,
  tools: EquityResearchTools,
  definitions: readonly ResearchToolDefinition[] = researchToolDefinitions,
): Array<() => void> {
  const registry = (ctx as ContextWithTools).tools
  if (!registry) return []
  return definitions.map((definition) => {
    const handler = handlerFor(definition.name, tools)
    return registry.register({
      name: definition.name,
      description: definition.description,
      parameters: toHarnessJsonSchema(definition.inputSchema),
      output: {
        schema: {},
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      async execute(args, exec) {
        const parsed = definition.inputSchema.parse(args)
        return await handler(parsed, exec)
      },
    })
  })
}

function handlerFor(name: string, tools: EquityResearchTools): (args: any, exec: unknown) => unknown | Promise<unknown> {
  const handlers: Record<string, (args: any, exec: unknown) => unknown | Promise<unknown>> = {
    listCompanies: () => tools.listCompanies(),
    getCompany: (args) => tools.getCompany(args.companyId),
    getFinancials: (args) => tools.getFinancials(args.companyId, args.metricId, args.limit, args.dimensions, args.periodStartFrom, args.periodEndTo),
    getOperatingMetrics: (args) => tools.getOperatingMetrics(args.companyId, args.metricId, args.limit, args.dimensions, args.periodStartFrom, args.periodEndTo),
    getMetrics: (args) => tools.getMetrics(args.companyId, args.category),
    getTaxonomy: (args) => tools.getTaxonomy(args.companyId),
    getEstimates: (args) => tools.getEstimates(args.companyId, args.metricId, args.limit, args.asOfFrom, args.asOfTo, args.targetPeriodEnd),
    getManagement: (args) => tools.getManagement(args.companyId),
    getReportingLines: (args) => tools.getReportingLines(args.companyId),
    getCapTable: (args) => tools.getCapTable(args.companyId),
    getSources: (args) => tools.getSources(args.companyId),
    getArtifacts: (args) => tools.getArtifacts(args.companyId),
    getEvidence: (args) => tools.getEvidence(args.companyId, args.evidenceId),
    getFactEvidence: (args) => tools.getFactEvidence(args.companyId, args.factId),
    getEstimateEvidence: (args) => tools.getEstimateEvidence(args.companyId, args.estimateId),
    runCoalScenario: (args) => tools.runCoalScenario(args.companyId, args.input, args.notes),
    runBankPbRoe: (args) => tools.runBankPbRoe(args.companyId, args.input, args.notes),
    runInsurancePEv: (args) => tools.runInsurancePEv(args.companyId, args.input, args.notes),
    runSotp: (args) => tools.runSotp(args.companyId, args.components, args.adjustments, args.notes),
    saveScenario: (args) => tools.saveScenario(args.companyId, args.input),
    getModelRuns: (args) => tools.getModelRuns(args.companyId),
    getScenarios: (args) => tools.getScenarios(args.companyId),
  }
  const handler = handlers[name]
  if (!handler) throw new Error(`No Harness handler registered for research tool: ${name}`)
  return handler
}

function toHarnessJsonSchema(schema: { toJSONSchema?: () => unknown }): Record<string, unknown> {
  const raw = schema.toJSONSchema?.()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Research tool input schema must be an object schema')
  return stripUnsupportedSchemaKeywords(raw as Record<string, unknown>)
}

function stripUnsupportedSchemaKeywords(schema: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(['type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'description', 'title', 'default', 'examples'])
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema)) {
    if (!allowed.has(key)) continue
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, stripUnsupportedSchemaKeywords(child as Record<string, unknown>)]))
    } else if (key === 'items' && value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = stripUnsupportedSchemaKeywords(value as Record<string, unknown>)
    } else if (key === 'oneOf' && Array.isArray(value)) {
      result[key] = value.map((child) => stripUnsupportedSchemaKeywords(child as Record<string, unknown>))
    } else result[key] = value
  }
  return result
}
