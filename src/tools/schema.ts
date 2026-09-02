import { z } from 'zod'

export const companyIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
export const factQuerySchema = z.object({ companyId: companyIdSchema, metricId: z.string().optional(), limit: z.number().int().positive().max(5000).optional(), periodStartFrom: z.string().optional(), periodEndTo: z.string().optional(), dimensions: z.record(z.string(), z.string()).optional() })
export const estimateQuerySchema = z.object({ companyId: companyIdSchema, metricId: z.string().optional(), companyIndustryId: z.string().min(1).optional(), businessLineId: z.string().min(1).optional(), targetPeriodEnd: z.string().optional(), asOfFrom: z.string().optional(), asOfTo: z.string().optional(), limit: z.number().int().positive().max(5000).optional() })
export const evidenceQuerySchema = z.object({ companyId: companyIdSchema, evidenceId: z.string().min(1) })
export const factEvidenceQuerySchema = z.object({ companyId: companyIdSchema, factId: z.string().min(1) })
export const estimateEvidenceQuerySchema = z.object({ companyId: companyIdSchema, estimateId: z.string().min(1) })
export const coalScenarioSchema = z.object({ companyId: companyIdSchema, input: z.object({ coalPrice: z.number(), annualProduction: z.number(), years: z.number().int().min(1).max(50), ebitdaMargin: z.number(), taxRate: z.number(), discountRate: z.number(), terminalGrowth: z.number(), netDebt: z.number(), sharesOutstanding: z.number().positive() }), scenarioId: z.string().min(1).optional(), notes: z.string().optional() })
export const bankPbRoeSchema = z.object({ companyId: companyIdSchema, input: z.object({ bookValuePerShare: z.number().nonnegative(), sustainableRoe: z.number(), costOfEquity: z.number().positive(), terminalGrowth: z.number(), targetPb: z.number().nonnegative() }), notes: z.string().optional() })
export const insurancePEvSchema = z.object({ companyId: companyIdSchema, input: z.object({ embeddedValue: z.number().nonnegative(), targetPEv: z.number().nonnegative(), netDebt: z.number(), sharesOutstanding: z.number().positive() }), notes: z.string().optional() })
export const sotpSchema = z.object({ companyId: companyIdSchema, components: z.array(z.object({ name: z.string().min(1), value: z.number(), weight: z.number().nonnegative().optional() })).min(1), adjustments: z.number().optional(), notes: z.string().optional() })
export const metricQuerySchema = z.object({ companyId: companyIdSchema, category: z.enum(['financial', 'operating']).optional() })
export const businessLineTypeQuerySchema = z.object({ companyId: companyIdSchema, industryId: z.string().min(1).optional() })
export const addIndustrySchema = z.object({ companyId: companyIdSchema, input: z.object({ industryId: z.string().trim().min(1), isPrimary: z.boolean().optional() }) })
export const addBusinessLineSchema = z.object({ companyId: companyIdSchema, companyIndustryId: z.string().min(1), input: z.object({ businessLineTypeId: z.string().min(1), displayName: z.string().trim().min(1) }) })
export const saveScenarioSchema = z.object({ companyId: companyIdSchema, input: z.object({ name: z.string().min(1), modelId: z.string().min(1), modelVersion: z.string().optional(), parameters: z.record(z.string(), z.unknown()) }) })

export interface ResearchToolDefinition { name: string; description: string; inputSchema: z.ZodType }

export const researchToolDefinitions: ResearchToolDefinition[] = [
  { name: 'listCompanies', description: 'List available company workspaces.', inputSchema: z.object({}) },
  { name: 'getCompany', description: 'Get a company manifest.', inputSchema: z.object({ companyId: companyIdSchema }) },
  { name: 'getFinancials', description: 'Query financial facts for a company.', inputSchema: factQuerySchema },
  { name: 'getOperatingMetrics', description: 'Query operating facts for a company.', inputSchema: factQuerySchema },
  { name: 'getMetrics', description: 'List active metric definitions available in a company workspace.', inputSchema: metricQuerySchema },
  { name: 'getBusinessLineTypes', description: 'List reusable business-line types available from applied Metric Packs.', inputSchema: businessLineTypeQuerySchema },
  { name: 'addIndustry', description: 'Add an investor-defined industry to a company taxonomy.', inputSchema: addIndustrySchema },
  { name: 'addBusinessLine', description: 'Enable a reusable business-line type under a company industry.', inputSchema: addBusinessLineSchema },
  { name: 'getTaxonomy', description: 'List configured industries and business lines.', inputSchema: z.object({ companyId: companyIdSchema }) },
  { name: 'getEstimates', description: 'Query point-in-time analyst estimates, including historical as-of windows.', inputSchema: estimateQuerySchema },
  { name: 'getManagement', description: 'Get management people and role assignments.', inputSchema: z.object({ companyId: companyIdSchema }) },
  { name: 'getReportingLines', description: 'Get historical management reporting lines.', inputSchema: z.object({ companyId: companyIdSchema }) },
  { name: 'getCapTable', description: 'Get historical cap table snapshots.', inputSchema: z.object({ companyId: companyIdSchema }) },
  { name: 'getSources', description: 'List retained source metadata.', inputSchema: z.object({ companyId: companyIdSchema }) },
  { name: 'getArtifacts', description: 'List retained local artifacts and their integrity hashes.', inputSchema: z.object({ companyId: companyIdSchema }) },
  { name: 'getEvidence', description: 'Get the evidence locator and excerpt for an observation.', inputSchema: evidenceQuerySchema },
  { name: 'getFactEvidence', description: 'Get retained evidence supporting an actual fact.', inputSchema: factEvidenceQuerySchema },
  { name: 'getEstimateEvidence', description: 'Get retained evidence supporting an analyst estimate.', inputSchema: estimateEvidenceQuerySchema },
  { name: 'runCoalScenario', description: 'Run and persist a coal scenario valuation.', inputSchema: coalScenarioSchema },
  { name: 'runBankPbRoe', description: 'Run and persist a bank price-to-book / ROE valuation.', inputSchema: bankPbRoeSchema },
  { name: 'runInsurancePEv', description: 'Run and persist an insurance price-to-embedded-value valuation.', inputSchema: insurancePEvSchema },
  { name: 'runSotp', description: 'Run and persist a sum-of-the-parts valuation.', inputSchema: sotpSchema },
  { name: 'saveScenario', description: 'Create or update a named model scenario.', inputSchema: saveScenarioSchema },
  { name: 'getModelRuns', description: 'List reproducible historical model runs.', inputSchema: z.object({ companyId: companyIdSchema }) },
  { name: 'getScenarios', description: 'List saved model scenarios.', inputSchema: z.object({ companyId: companyIdSchema }) },
]
