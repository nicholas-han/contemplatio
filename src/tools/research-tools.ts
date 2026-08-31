import type { EquityArchive } from '../archive/archive-service.js'
import { EquityDataEngine } from '../data/data-engine.js'
import { EquityModelEngine } from '../model-engine/service.js'
import type { CoalScenarioInput } from '../model-engine/coal.js'

export function createEquityResearchTools(archive: EquityArchive) {
  const data = new EquityDataEngine(archive)
  const models = new EquityModelEngine(archive)
  return {
    getCompany: async (companyId: string) => (await archive.openCompany(companyId)).manifest,
    getFinancials: (companyId: string, metricId?: string, limit?: number) => data.listFacts(companyId, { ...factFilter(metricId, limit), category: 'financial' }),
    getOperatingMetrics: (companyId: string, metricId?: string, limit?: number) => data.listFacts(companyId, { ...factFilter(metricId, limit), category: 'operating' }),
    getEstimates: (companyId: string, metricId?: string) => data.listEstimates(companyId, metricId),
    getManagement: (companyId: string) => data.listPeople(companyId),
    getCapTable: (companyId: string) => data.listCapTable(companyId),
    getSources: (companyId: string) => data.listSources(companyId),
    getEvidence: (companyId: string, evidenceId: string) => data.getEvidence(companyId, evidenceId),
    runCoalScenario: (companyId: string, input: CoalScenarioInput, notes?: string) => models.runCoalScenario(companyId, input, undefined, notes),
    runBankPbRoe: (companyId: string, input: Parameters<EquityModelEngine['runBankPbRoe']>[1], notes?: string) => models.runBankPbRoe(companyId, input, notes),
    runInsurancePEv: (companyId: string, input: Parameters<EquityModelEngine['runInsurancePEv']>[1], notes?: string) => models.runInsurancePEv(companyId, input, notes),
    runSotp: (companyId: string, components: Parameters<EquityModelEngine['runSotp']>[1], adjustments?: number, notes?: string) => models.runSotp(companyId, components, adjustments, notes),
    getModelRuns: (companyId: string) => models.listRuns(companyId),
  }
}

function factFilter(metricId?: string, limit?: number): { metricId?: string; limit?: number } {
  return { ...(metricId ? { metricId } : {}), ...(limit !== undefined ? { limit } : {}) }
}

export type EquityResearchTools = ReturnType<typeof createEquityResearchTools>
