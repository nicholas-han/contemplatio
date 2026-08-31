import { randomUUID } from 'node:crypto'
import type { EquityArchive } from '../archive/archive-service.js'
import { runCoalScenario, type CoalScenarioInput, type CoalScenarioOutput } from './coal.js'
import { runBankPbRoe, type BankPbRoeInput, type BankPbRoeOutput } from './bank.js'
import { runInsurancePEv, runSotp, type InsurancePEvInput, type InsurancePEvOutput, type SotpComponent, type SotpOutput } from './insurance.js'

export interface ModelRunRecord { modelRunId: string; modelId: string; runAt: string; inputs: Record<string, unknown>; outputs: Record<string, unknown> }

export class EquityModelEngine {
  constructor(readonly archive: EquityArchive) {}

  runCoalScenario(companyId: string, input: CoalScenarioInput, scenarioId?: string, notes?: string): { modelRunId: string; output: CoalScenarioOutput } {
    const output = runCoalScenario(input)
    const modelRunId = `model-run-${randomUUID()}`
    this.archive.withDatabase(companyId, (database) => {
      const now = new Date().toISOString()
      database.prepare(`INSERT INTO model_runs (model_run_id, company_id, model_id, model_version, scenario_id, run_at, inputs_json, outputs_json, notes)
        VALUES (?, ?, 'coal-scenario', '0.1.0', ?, ?, ?, ?, ?)`).run(modelRunId, companyId, scenarioId ?? null, now, JSON.stringify(input), JSON.stringify(output), notes ?? null)
    })
    return { modelRunId, output }
  }

  saveScenario(companyId: string, input: { name: string; modelId: string; modelVersion?: string; parameters: Record<string, unknown> }): string {
    if (!input.name.trim() || !input.modelId.trim()) throw new Error('scenario requires name and modelId')
    const scenarioId = `scenario-${randomUUID()}`
    return this.archive.withDatabase(companyId, (database) => {
      const company = database.prepare('SELECT company_id FROM companies WHERE company_id = ?').get(companyId)
      if (!company) throw new Error(`Unknown company: ${companyId}`)
      const now = new Date().toISOString()
      database.exec('BEGIN IMMEDIATE')
      try {
        const existing = database.prepare('SELECT scenario_id FROM scenarios WHERE company_id = ? AND model_id = ? AND name = ?').get(companyId, input.modelId, input.name) as { scenario_id: string } | undefined
        if (existing) {
          database.prepare('UPDATE scenarios SET model_version = ?, parameters_json = ?, updated_at = ? WHERE scenario_id = ?').run(input.modelVersion ?? '0.1.0', JSON.stringify(input.parameters), now, existing.scenario_id)
        } else database.prepare(`INSERT INTO scenarios (scenario_id, company_id, name, model_id, model_version, parameters_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(scenarioId, companyId, input.name, input.modelId, input.modelVersion ?? '0.1.0', JSON.stringify(input.parameters), now, now)
        database.exec('COMMIT')
        return existing?.scenario_id ?? scenarioId
      } catch (error) { database.exec('ROLLBACK'); throw error }
    })
  }

  listScenarios(companyId: string): Array<{ scenarioId: string; name: string; modelId: string; modelVersion: string; parameters: Record<string, unknown>; updatedAt: string }> {
    return this.archive.withDatabase(companyId, (database) => (database.prepare('SELECT scenario_id, name, model_id, model_version, parameters_json, updated_at FROM scenarios WHERE company_id = ? ORDER BY updated_at DESC').all(companyId) as Array<Record<string, unknown>>).map((row) => ({
      scenarioId: String(row.scenario_id), name: String(row.name), modelId: String(row.model_id), modelVersion: String(row.model_version),
      parameters: JSON.parse(String(row.parameters_json)) as Record<string, unknown>, updatedAt: String(row.updated_at),
    })))
  }

  listRuns(companyId: string): ModelRunRecord[] {
    return this.archive.withDatabase(companyId, (database) => (database.prepare('SELECT * FROM model_runs WHERE company_id = ? ORDER BY run_at DESC').all(companyId) as Array<Record<string, unknown>>).map((row) => ({
      modelRunId: String(row.model_run_id), modelId: String(row.model_id), runAt: String(row.run_at),
      inputs: JSON.parse(String(row.inputs_json)) as Record<string, unknown>, outputs: JSON.parse(String(row.outputs_json)) as Record<string, unknown>,
    })))
  }

  runBankPbRoe(companyId: string, input: BankPbRoeInput, notes?: string): { modelRunId: string; output: BankPbRoeOutput } {
    const output = runBankPbRoe(input)
    const modelRunId = `model-run-${randomUUID()}`
    this.archive.withDatabase(companyId, (database) => {
      const now = new Date().toISOString()
      database.prepare(`INSERT INTO model_runs (model_run_id, company_id, model_id, model_version, run_at, inputs_json, outputs_json, notes)
        VALUES (?, ?, 'bank-pb-roe', '0.1.0', ?, ?, ?, ?)`).run(modelRunId, companyId, now, JSON.stringify(input), JSON.stringify(output), notes ?? null)
    })
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
    this.archive.withDatabase(companyId, (database) => {
      database.prepare(`INSERT INTO model_runs (model_run_id, company_id, model_id, model_version, run_at, inputs_json, outputs_json, notes) VALUES (?, ?, ?, '0.1.0', ?, ?, ?, ?)`).run(modelRunId, companyId, modelId, new Date().toISOString(), JSON.stringify(input), JSON.stringify(output), notes ?? null)
    })
    return { modelRunId, output }
  }
}

export * from './coal.js'
export * from './bank.js'
export * from './insurance.js'
