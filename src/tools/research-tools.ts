import type { EquityArchive } from '../archive/archive-service.js'
import { EquityDataEngine } from '../data/data-engine.js'
import { EquityModelEngine } from '../model-engine/service.js'
import type { CoalScenarioInput } from '../model-engine/coal.js'

export function createEquityResearchTools(source: EquityArchive | EquityDataEngine) {
  const data = source instanceof EquityDataEngine ? source : new EquityDataEngine(source)
  const models = new EquityModelEngine(data)
  return {
    listCompanies: () => data.listCompanies(),
    getCompany: (companyId: string) => data.getCompany(companyId),
    getFinancials: (companyId: string, metricId?: string, limit?: number, dimensions?: Record<string, string>, periodStartFrom?: string, periodEndTo?: string) => data.listFacts(companyId, { ...factFilter(metricId, limit, dimensions, periodStartFrom, periodEndTo), category: 'financial' }),
    getOperatingMetrics: (companyId: string, metricId?: string, limit?: number, dimensions?: Record<string, string>, periodStartFrom?: string, periodEndTo?: string) => data.listFacts(companyId, { ...factFilter(metricId, limit, dimensions, periodStartFrom, periodEndTo), category: 'operating' }),
    getMetrics: (companyId: string, category?: 'financial' | 'operating') => data.listMetricDefinitions(companyId, category),
    getBusinessLineTypes: (companyId: string, industryId?: string) => data.listBusinessLineTypes(companyId, industryId),
    getTaxonomy: (companyId: string) => data.listTaxonomy(companyId),
    getEstimates: (companyId: string, metricId?: string, limit?: number, asOfFrom?: string, asOfTo?: string, targetPeriodEnd?: string) => data.listEstimates(companyId, { ...(metricId ? { metricId } : {}), ...(limit !== undefined ? { limit } : {}), ...(asOfFrom ? { asOfFrom } : {}), ...(asOfTo ? { asOfTo } : {}), ...(targetPeriodEnd ? { targetPeriodEnd } : {}) }),
    getManagement: (companyId: string) => data.listPeople(companyId),
    getReportingLines: (companyId: string) => data.listReportingLines(companyId),
    getCapTable: (companyId: string) => data.listCapTable(companyId),
    getSources: (companyId: string) => data.listSources(companyId),
    getArtifacts: (companyId: string) => data.listArtifacts(companyId),
    getEvidence: (companyId: string, evidenceId: string) => data.getEvidence(companyId, evidenceId),
    getFactEvidence: (companyId: string, factId: string) => data.listFactEvidence(companyId, factId),
    getEstimateEvidence: (companyId: string, estimateId: string) => data.listEstimateEvidence(companyId, estimateId),
    runCoalScenario: (companyId: string, input: CoalScenarioInput, notes?: string) => models.runCoalScenario(companyId, input, undefined, notes),
    runBankPbRoe: (companyId: string, input: Parameters<EquityModelEngine['runBankPbRoe']>[1], notes?: string) => models.runBankPbRoe(companyId, input, notes),
    runInsurancePEv: (companyId: string, input: Parameters<EquityModelEngine['runInsurancePEv']>[1], notes?: string) => models.runInsurancePEv(companyId, input, notes),
    runSotp: (companyId: string, components: Parameters<EquityModelEngine['runSotp']>[1], adjustments?: number, notes?: string) => models.runSotp(companyId, components, adjustments, notes),
    getModelRuns: (companyId: string) => models.listRuns(companyId),
    saveScenario: (companyId: string, input: Parameters<EquityModelEngine['saveScenario']>[1]) => models.saveScenario(companyId, input),
    getScenarios: (companyId: string) => models.listScenarios(companyId),
  }
}

function factFilter(metricId?: string, limit?: number, dimensions?: Record<string, string>, periodStartFrom?: string, periodEndTo?: string): { metricId?: string; limit?: number; dimensions?: Record<string, string>; periodStartFrom?: string; periodEndTo?: string } {
  return { ...(metricId ? { metricId } : {}), ...(limit !== undefined ? { limit } : {}), ...(dimensions ? { dimensions } : {}), ...(periodStartFrom ? { periodStartFrom } : {}), ...(periodEndTo ? { periodEndTo } : {}) }
}

export type EquityResearchTools = ReturnType<typeof createEquityResearchTools>
