import { z } from 'zod'

export const companyIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
export const factQuerySchema = z.object({ companyId: companyIdSchema, metricId: z.string().optional(), limit: z.number().int().positive().max(5000).optional() })
export const estimateQuerySchema = factQuerySchema.extend({ targetPeriodEnd: z.string().optional(), asOfFrom: z.string().optional(), asOfTo: z.string().optional() })
export const evidenceQuerySchema = z.object({ companyId: companyIdSchema, evidenceId: z.string().min(1) })
export const coalScenarioSchema = z.object({ companyId: companyIdSchema, input: z.object({ coalPrice: z.number(), annualProduction: z.number(), years: z.number().int().min(1).max(50), ebitdaMargin: z.number(), taxRate: z.number(), discountRate: z.number(), terminalGrowth: z.number(), netDebt: z.number(), sharesOutstanding: z.number().positive() }), notes: z.string().optional() })
export const bankPbRoeSchema = z.object({ companyId: companyIdSchema, input: z.object({ bookValuePerShare: z.number().nonnegative(), sustainableRoe: z.number(), costOfEquity: z.number().positive(), terminalGrowth: z.number(), targetPb: z.number().nonnegative() }), notes: z.string().optional() })
export const insurancePEvSchema = z.object({ companyId: companyIdSchema, input: z.object({ embeddedValue: z.number().nonnegative(), targetPEv: z.number().nonnegative(), netDebt: z.number(), sharesOutstanding: z.number().positive() }), notes: z.string().optional() })
export const sotpSchema = z.object({ companyId: companyIdSchema, components: z.array(z.object({ name: z.string().min(1), value: z.number(), weight: z.number().nonnegative().optional() })).min(1), adjustments: z.number().optional(), notes: z.string().optional() })
export const metricQuerySchema = z.object({ companyId: companyIdSchema, category: z.enum(['financial', 'operating']).optional() })

export interface ResearchToolDefinition { name: string; description: string; inputSchema: z.ZodType }

export const researchToolDefinitions: ResearchToolDefinition[] = [
  { name: 'listCompanies', description: 'List available company workspaces.', inputSchema: z.object({}) },
  { name: 'getCompany', description: 'Get a company manifest.', inputSchema: z.object({ companyId: companyIdSchema }) },
  { name: 'getFinancials', description: 'Query financial facts for a company.', inputSchema: factQuerySchema },
  { name: 'getOperatingMetrics', description: 'Query operating facts for a company.', inputSchema: factQuerySchema },
  { name: 'getMetrics', description: 'List active metric definitions available in a company workspace.', inputSchema: metricQuerySchema },
  { name: 'getEstimates', description: 'Query point-in-time analyst estimates, including historical as-of windows.', inputSchema: estimateQuerySchema },
  { name: 'getManagement', description: 'Get management people and role assignments.', inputSchema: z.object({ companyId: companyIdSchema }) },
  { name: 'getReportingLines', description: 'Get historical management reporting lines.', inputSchema: z.object({ companyId: companyIdSchema }) },
  { name: 'getCapTable', description: 'Get historical cap table snapshots.', inputSchema: z.object({ companyId: companyIdSchema }) },
  { name: 'getSources', description: 'List retained source metadata.', inputSchema: z.object({ companyId: companyIdSchema }) },
  { name: 'getArtifacts', description: 'List retained local artifacts and their integrity hashes.', inputSchema: z.object({ companyId: companyIdSchema }) },
  { name: 'getEvidence', description: 'Get the evidence locator and excerpt for an observation.', inputSchema: evidenceQuerySchema },
  { name: 'runCoalScenario', description: 'Run and persist a coal scenario valuation.', inputSchema: coalScenarioSchema },
  { name: 'runBankPbRoe', description: 'Run and persist a bank price-to-book / ROE valuation.', inputSchema: bankPbRoeSchema },
  { name: 'runInsurancePEv', description: 'Run and persist an insurance price-to-embedded-value valuation.', inputSchema: insurancePEvSchema },
  { name: 'runSotp', description: 'Run and persist a sum-of-the-parts valuation.', inputSchema: sotpSchema },
  { name: 'getModelRuns', description: 'List reproducible historical model runs.', inputSchema: z.object({ companyId: companyIdSchema }) },
  { name: 'getScenarios', description: 'List saved model scenarios.', inputSchema: z.object({ companyId: companyIdSchema }) },
]
