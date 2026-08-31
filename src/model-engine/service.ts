import { randomUUID } from 'node:crypto'
import type { EquityArchive } from '../archive/archive-service.js'
import { runCoalScenario, type CoalScenarioInput, type CoalScenarioOutput } from './coal.js'

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

  listRuns(companyId: string): Array<{ modelRunId: string; modelId: string; runAt: string; inputs: CoalScenarioInput; outputs: CoalScenarioOutput }> {
    return this.archive.withDatabase(companyId, (database) => (database.prepare('SELECT * FROM model_runs WHERE company_id = ? ORDER BY run_at DESC').all(companyId) as Array<Record<string, unknown>>).map((row) => ({
      modelRunId: String(row.model_run_id), modelId: String(row.model_id), runAt: String(row.run_at),
      inputs: JSON.parse(String(row.inputs_json)) as CoalScenarioInput, outputs: JSON.parse(String(row.outputs_json)) as CoalScenarioOutput,
    })))
  }
}

export * from './coal.js'
