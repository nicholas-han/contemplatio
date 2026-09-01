import { randomUUID } from 'node:crypto'
import type { EquityArchive } from '../archive/archive-service.js'
import { EquityDataEngine, type DataModelRunRecord, type ScenarioRecord, type ModelRunInput } from '../data/data-engine.js'
import { runCoalScenario, type CoalScenarioInput, type CoalScenarioOutput } from './coal.js'
import { runBankPbRoe, type BankPbRoeInput, type BankPbRoeOutput } from './bank.js'
import { runInsurancePEv, runSotp, type InsurancePEvInput, type InsurancePEvOutput, type SotpComponent, type SotpOutput } from './insurance.js'

export type ModelRunRecord = DataModelRunRecord

export class EquityModelEngine {
  readonly data: EquityDataEngine

  constructor(data: EquityDataEngine)
  /** @deprecated Pass the shared EquityDataEngine so model persistence stays behind the data boundary. */
  constructor(archive: EquityArchive)
  constructor(dataOrArchive: EquityDataEngine | EquityArchive) {
    this.data = dataOrArchive instanceof EquityDataEngine ? dataOrArchive : new EquityDataEngine(dataOrArchive)
  }

  runCoalScenario(companyId: string, input: CoalScenarioInput, scenarioId?: string, notes?: string): { modelRunId: string; output: CoalScenarioOutput } {
    const output = runCoalScenario(input)
    const modelRunId = `model-run-${randomUUID()}`
    const record: ModelRunInput = { modelRunId, modelId: 'coal-scenario', inputs: input as unknown as Record<string, unknown>, outputs: output as unknown as Record<string, unknown>, ...(scenarioId ? { scenarioId } : {}), ...(notes ? { notes } : {}) }
    this.data.persistModelRun(companyId, record)
    return { modelRunId, output }
  }

  saveScenario(companyId: string, input: { name: string; modelId: string; modelVersion?: string; parameters: Record<string, unknown> }): string {
    return this.data.saveScenario(companyId, input)
  }

  listScenarios(companyId: string): ScenarioRecord[] {
    return this.data.listScenarios(companyId)
  }

  listRuns(companyId: string): ModelRunRecord[] {
    return this.data.listModelRuns(companyId)
  }

  runBankPbRoe(companyId: string, input: BankPbRoeInput, notes?: string): { modelRunId: string; output: BankPbRoeOutput } {
    const output = runBankPbRoe(input)
    const modelRunId = `model-run-${randomUUID()}`
    this.data.persistModelRun(companyId, { modelRunId, modelId: 'bank-pb-roe', inputs: input as unknown as Record<string, unknown>, outputs: output as unknown as Record<string, unknown>, ...(notes ? { notes } : {}) })
    return { modelRunId, output }
  }

  runInsurancePEv(companyId: string, input: InsurancePEvInput, notes?: string): { modelRunId: string; output: InsurancePEvOutput } {
    const output = runInsurancePEv(input)
    return this.persistRun(companyId, 'insurance-p-ev', input, output, notes)
  }

  runSotp(companyId: string, components: SotpComponent[], adjustments = 0, notes?: string): { modelRunId: string; output: SotpOutput } {
    const output = runSotp(components, adjustments)
    return this.persistRun(companyId, 'sotp', { components, adjustments }, output, notes)
  }

  private persistRun<TInput, TOutput>(companyId: string, modelId: string, input: TInput, output: TOutput, notes?: string): { modelRunId: string; output: TOutput } {
    const modelRunId = `model-run-${randomUUID()}`
    this.data.persistModelRun(companyId, { modelRunId, modelId, inputs: input as unknown as Record<string, unknown>, outputs: output as unknown as Record<string, unknown>, ...(notes ? { notes } : {}) })
    return { modelRunId, output }
  }
}

export * from './coal.js'
export * from './bank.js'
export * from './insurance.js'
