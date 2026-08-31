import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { URL } from 'node:url'
import type { EquityDataEngine, LegacyObservationRecord } from '../data/data-engine.js'
import { importEstimatesCsvText } from '../import/estimates.js'
import { EquityModelEngine } from '../model-engine/service.js'

export interface WebServerConfig { host?: string; port?: number; companyId?: string }

export class EquityWebServer {
  private server: Server | undefined
  readonly companyId: string

  readonly modelEngine: EquityModelEngine
  constructor(readonly dataEngine: EquityDataEngine, config: WebServerConfig = {}) {
    this.companyId = config.companyId ?? 'yankuang-energy'
    this.modelEngine = new EquityModelEngine(dataEngine.archive)
  }

  async start(host = '127.0.0.1', port = 4173): Promise<{ host: string; port: number }> {
    this.server = createServer((request, response) => this.handle(request, response))
    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject).listen(port, host, resolve)
    })
    const address = this.server.address()
    if (!address || typeof address === 'string') throw new Error('Unable to determine web server address')
    return { host, port: address.port }
  }

  async close(): Promise<void> {
    if (!this.server) return
    await new Promise<void>((resolve, reject) => this.server?.close((error) => error ? reject(error) : resolve()))
    this.server = undefined
  }

  private handle(request: IncomingMessage, response: ServerResponse): void {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost')
      if (url.pathname === '/api/observations') {
        const observations = this.dataEngine.listLegacyObservations(this.companyId, url.searchParams.get('status') ?? undefined)
        return sendJson(response, observations)
      }
      if (url.pathname === '/api/facts') return sendJson(response, this.dataEngine.listFacts(this.companyId))
      if (url.pathname === '/api/estimates') return sendJson(response, this.dataEngine.listEstimates(this.companyId, url.searchParams.get('metric') ?? undefined))
      if (url.pathname === '/api/people') return sendJson(response, this.dataEngine.listPeople(this.companyId))
      if (url.pathname === '/api/cap-table') return sendJson(response, this.dataEngine.listCapTable(this.companyId))
      if (url.pathname === '/api/sources') return sendJson(response, this.dataEngine.listSources(this.companyId))
      if (url.pathname.startsWith('/api/evidence/')) return sendJson(response, this.dataEngine.getEvidence(this.companyId, decodeURIComponent(url.pathname.slice('/api/evidence/'.length))))
      if (request.method === 'POST' && url.pathname === '/api/estimates/import') return void this.handleEstimateImport(request, response)
      if (request.method === 'POST' && url.pathname === '/api/models/coal/run') return void this.handleCoalRun(request, response)
      if (request.method === 'POST' && url.pathname === '/api/models/bank/pb-roe') return void this.handleBankRun(request, response)
      if (request.method === 'POST' && url.pathname === '/api/models/insurance/p-ev') return void this.handleInsuranceRun(request, response)
      if (request.method === 'POST' && url.pathname === '/api/models/sotp') return void this.handleSotpRun(request, response)
      if (url.pathname === '/api/models/runs') return sendJson(response, this.modelEngine.listRuns(this.companyId))
      if (request.method === 'POST' && url.pathname === '/api/models/scenarios') return void this.handleScenarioSave(request, response)
      if (url.pathname === '/api/models/scenarios') return sendJson(response, this.modelEngine.listScenarios(this.companyId))
      if (url.pathname === '/' || url.pathname === `/companies/${this.companyId}`) {
        return sendHtml(response, renderPage(this.companyId, this.dataEngine.listLegacyObservations(this.companyId), this.dataEngine.listFacts(this.companyId), this.dataEngine.listPeople(this.companyId), this.dataEngine.listCapTable(this.companyId), this.dataEngine.listSources(this.companyId)))
      }
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found')
    } catch (error) {
      sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 500)
    }
  }

  private async handleEstimateImport(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const body = await readBody(request)
      const form = new URLSearchParams(body)
      const result = importEstimatesCsvText(form.get('csv') ?? '', this.dataEngine.archive, this.companyId, form.get('apply') === 'true')
      sendJson(response, result)
    } catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleCoalRun(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const payload = JSON.parse(await readBody(request)) as { input: Parameters<EquityModelEngine['runCoalScenario']>[1]; scenarioId?: string; notes?: string }
      sendJson(response, this.modelEngine.runCoalScenario(this.companyId, payload.input, payload.scenarioId, payload.notes))
    } catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleBankRun(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const payload = JSON.parse(await readBody(request)) as { input: Parameters<EquityModelEngine['runBankPbRoe']>[1]; notes?: string }
      sendJson(response, this.modelEngine.runBankPbRoe(this.companyId, payload.input, payload.notes))
    } catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleInsuranceRun(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try { const payload = JSON.parse(await readBody(request)) as { input: Parameters<EquityModelEngine['runInsurancePEv']>[1]; notes?: string }; sendJson(response, this.modelEngine.runInsurancePEv(this.companyId, payload.input, payload.notes)) }
    catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleSotpRun(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try { const payload = JSON.parse(await readBody(request)) as { components: Parameters<EquityModelEngine['runSotp']>[1]; adjustments?: number; notes?: string }; sendJson(response, this.modelEngine.runSotp(this.companyId, payload.components, payload.adjustments, payload.notes)) }
    catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleScenarioSave(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try { const payload = JSON.parse(await readBody(request)) as Parameters<EquityModelEngine['saveScenario']>[1]; sendJson(response, { scenarioId: this.modelEngine.saveScenario(this.companyId, payload) }) }
    catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }
}

function renderPage(companyId: string, observations: LegacyObservationRecord[], facts: ReturnType<EquityDataEngine['listFacts']>, people: ReturnType<EquityDataEngine['listPeople']>, capTable: ReturnType<EquityDataEngine['listCapTable']>, sources: ReturnType<EquityDataEngine['listSources']>): string {
  const rows = observations.map((observation) => `<tr>
    <td><code>${escapeHtml(observation.observationId)}</code></td>
    <td>${escapeHtml(observation.legacyMetricId)}</td>
    <td>${escapeHtml(observation.mappedMetricId ?? '-')}</td>
    <td>${escapeHtml(observation.periodStart ?? observation.periodEnd ?? '-')}</td>
    <td>${escapeHtml(observation.value ?? '-')} ${escapeHtml(observation.unit ?? '')}</td>
    <td><span class="status status-${escapeHtml(observation.reviewStatus)}">${escapeHtml(observation.reviewStatus)}</span></td>
    <td>${escapeHtml(observation.sourceLocator ?? '-')}</td>
  </tr>`).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Conte Equity Research</title><style>
    :root{font-family:Inter,system-ui,sans-serif;color:#1e293b;background:#f8fafc}body{margin:0;padding:32px}main{max-width:1400px;margin:auto}h1{margin:0 0 4px;font-size:26px}h2{margin-top:32px;font-size:18px}p{color:#64748b}table{width:100%;border-collapse:collapse;background:white;border:1px solid #e2e8f0;font-size:13px}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top}th{background:#f1f5f9;font-weight:600}tr:last-child td{border-bottom:0}code{font-size:12px}.status{display:inline-block;padding:3px 6px;border-radius:4px;background:#fef3c7;color:#92400e;font-size:11px}.status-confirmed,.status-verified{background:#dcfce7;color:#166534}.status-rejected{background:#fee2e2;color:#991b1b}.empty{padding:24px;text-align:center;color:#64748b}</style></head>
    <body><main><h1>Conte Equity Research</h1><p>Company: <code>${escapeHtml(companyId)}</code> · staging observations and authoritative facts</p>
    <h2>Legacy Observations (${observations.length})</h2><table><thead><tr><th>ID</th><th>Legacy metric</th><th>Mapped metric</th><th>Period</th><th>Value</th><th>Status</th><th>Source locator</th></tr></thead><tbody>${rows || '<tr><td class="empty" colspan="7">No observations</td></tr>'}</tbody></table>
    <h2>Facts (${facts.length})</h2><table><thead><tr><th>ID</th><th>Metric</th><th>Period</th><th>Value</th><th>Status</th></tr></thead><tbody>${facts.map((fact) => `<tr><td><code>${escapeHtml(fact.factId)}</code></td><td>${escapeHtml(fact.metricId)}</td><td>${escapeHtml(fact.periodStart ?? fact.periodEnd)} to ${escapeHtml(fact.periodEnd)}</td><td>${escapeHtml(String(fact.value))} ${escapeHtml(fact.unit ?? '')}</td><td>${escapeHtml(fact.verificationStatus)}</td></tr>`).join('') || '<tr><td class="empty" colspan="5">No facts</td></tr>'}</tbody></table>
    <h2>Management (${people.length})</h2><table><thead><tr><th>Person</th><th>Position</th><th>Start</th><th>End</th><th>Current</th></tr></thead><tbody>${people.flatMap((person) => person.assignments.length ? person.assignments.map((assignment) => `<tr><td>${escapeHtml(person.nameZh ?? person.nameEn ?? person.personId)}</td><td><code>${escapeHtml(assignment.positionId)}</code></td><td>${escapeHtml(assignment.startDate)}</td><td>${escapeHtml(assignment.endDate ?? '-')}</td><td>${assignment.isCurrent ? 'yes' : 'no'}</td></tr>`) : [`<tr><td>${escapeHtml(person.nameZh ?? person.nameEn ?? person.personId)}</td><td colspan="4">No assignments</td></tr>`]).join('')}</tbody></table>
    <h2>Cap Table (${capTable.length} snapshots)</h2>${capTable.map((snapshot) => `<h3>${escapeHtml(snapshot.asOfDate)}</h3><table><thead><tr><th>Share class</th><th>Outstanding</th><th>Holder</th><th>Shares</th><th>Ownership</th></tr></thead><tbody>${snapshot.shareClasses.map((shareClass) => `<tr><td>${escapeHtml(shareClass.name)}</td><td>${escapeHtml(String(shareClass.sharesOutstanding))}</td><td colspan="3">${escapeHtml(shareClass.exchange ?? '')} ${escapeHtml(shareClass.ticker ?? '')}</td></tr>`).join('')}${snapshot.positions.map((position) => `<tr><td></td><td></td><td>${escapeHtml(position.holderName)}</td><td>${escapeHtml(String(position.shares ?? '-'))}</td><td>${escapeHtml(String(position.ownershipPct ?? '-'))}%</td></tr>`).join('')}</tbody></table>`).join('') || '<p>No cap table snapshots</p>'}
    <h2>Sources (${sources.length})</h2><table><thead><tr><th>ID</th><th>Type</th><th>Title</th><th>Publisher</th><th>Published</th></tr></thead><tbody>${sources.map((source) => `<tr><td><code>${escapeHtml(source.sourceId)}</code></td><td>${escapeHtml(source.sourceType)}</td><td>${escapeHtml(source.title)}</td><td>${escapeHtml(source.publisher)}</td><td>${escapeHtml(source.publishedAt ?? '-')}</td></tr>`).join('') || '<tr><td class="empty" colspan="5">No sources</td></tr>'}</tbody></table>
    <h2>Import Estimates CSV</h2><form method="post" action="/api/estimates/import"><textarea name="csv" rows="8" style="width:100%;font-family:monospace" placeholder="metric_id,target_period_type,target_period_start,target_period_end,as_of,provider,estimate_type,value,evidence_id"></textarea><p><button name="apply" value="false" type="submit">Preview</button> <button name="apply" value="true" type="submit">Import</button></p></form></main></body></html>`
}

function sendHtml(response: ServerResponse, body: string): void { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body) }
function sendJson(response: ServerResponse, body: unknown, status = 200): void { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(body, null, 2)) }
function escapeHtml(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;') }

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => { body += chunk; if (body.length > 2_000_000) reject(new Error('Request body is too large')) })
    request.on('end', () => resolve(body))
    request.on('error', reject)
  })
}
