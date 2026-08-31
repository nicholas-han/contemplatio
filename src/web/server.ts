import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { URL } from 'node:url'
import type { EquityDataEngine, LegacyObservationRecord } from '../data/data-engine.js'
import { importEstimatesCsvText } from '../import/estimates.js'
import { importManagementCsvText } from '../import/management.js'
import { importCapTableCsvText } from '../import/cap-table.js'
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
      const companyId = url.searchParams.get('company_id') ?? this.companyId
      if (url.pathname === '/api/observations') {
        const observations = this.dataEngine.listLegacyObservations(companyId, url.searchParams.get('status') ?? undefined)
        return sendJson(response, observations)
      }
      if (url.pathname === '/api/companies') return void this.handleCompanies(response)
      if (url.pathname.startsWith('/api/companies/')) return void this.handleCompany(response, decodeURIComponent(url.pathname.slice('/api/companies/'.length)))
      if (url.pathname === '/api/facts') return sendJson(response, this.dataEngine.listFacts(companyId, factFilterFromUrl(url)))
      if (url.pathname === '/api/estimates') return sendJson(response, this.dataEngine.listEstimates(companyId, { ...(url.searchParams.get('metric') ? { metricId: url.searchParams.get('metric')! } : {}), ...(url.searchParams.get('target_period_end') ? { targetPeriodEnd: url.searchParams.get('target_period_end')! } : {}), ...(url.searchParams.get('as_of_from') ? { asOfFrom: url.searchParams.get('as_of_from')! } : {}), ...(url.searchParams.get('as_of_to') ? { asOfTo: url.searchParams.get('as_of_to')! } : {}), ...(url.searchParams.has('limit') ? { limit: Number(url.searchParams.get('limit')) } : {}) }))
      if (url.pathname === '/api/metrics') return sendJson(response, this.dataEngine.listMetricDefinitions(companyId, url.searchParams.get('category') === 'financial' || url.searchParams.get('category') === 'operating' ? url.searchParams.get('category') as 'financial' | 'operating' : undefined))
      if (url.pathname === '/api/taxonomy') return sendJson(response, this.dataEngine.listTaxonomy(companyId))
      if (url.pathname === '/api/people') return sendJson(response, this.dataEngine.listPeople(companyId))
      if (url.pathname === '/api/reporting-lines') return sendJson(response, this.dataEngine.listReportingLines(companyId))
      if (url.pathname === '/api/cap-table') return sendJson(response, this.dataEngine.listCapTable(companyId))
      if (url.pathname === '/api/sources') return sendJson(response, this.dataEngine.listSources(companyId))
      if (url.pathname === '/api/artifacts') return sendJson(response, this.dataEngine.listArtifacts(companyId))
      if (url.pathname.startsWith('/api/evidence/')) return sendJson(response, this.dataEngine.getEvidence(companyId, decodeURIComponent(url.pathname.slice('/api/evidence/'.length))))
      if (url.pathname.startsWith('/api/artifacts/')) return void this.handleArtifact(response, decodeURIComponent(url.pathname.slice('/api/artifacts/'.length)), companyId)
      if (request.method === 'POST' && url.pathname === '/api/estimates/import') return void this.handleEstimateImport(request, response)
      if (request.method === 'POST' && url.pathname === '/api/management/import') return void this.handleManagementImport(request, response)
      if (request.method === 'POST' && url.pathname === '/api/cap-table/import') return void this.handleCapTableImport(request, response)
      if (request.method === 'POST' && url.pathname === '/api/models/coal/run') return void this.handleCoalRun(request, response)
      if (request.method === 'POST' && url.pathname === '/api/models/bank/pb-roe') return void this.handleBankRun(request, response)
      if (request.method === 'POST' && url.pathname === '/api/models/insurance/p-ev') return void this.handleInsuranceRun(request, response)
      if (request.method === 'POST' && url.pathname === '/api/models/sotp') return void this.handleSotpRun(request, response)
      if (url.pathname === '/api/models/runs') return sendJson(response, this.modelEngine.listRuns(companyId))
      if (request.method === 'POST' && url.pathname === '/api/models/scenarios') return void this.handleScenarioSave(request, response)
      if (url.pathname === '/api/models/scenarios') return sendJson(response, this.modelEngine.listScenarios(companyId))
      if (url.pathname === '/' || url.pathname.startsWith('/companies/')) {
        const pathCompanyId = url.pathname.startsWith('/companies/') ? decodeURIComponent(url.pathname.slice('/companies/'.length)) : this.companyId
        if (!pathCompanyId) throw new Error('Company id is required')
        return sendHtml(response, renderPage(pathCompanyId, this.dataEngine.listLegacyObservations(pathCompanyId), this.dataEngine.listFacts(pathCompanyId), this.dataEngine.listTaxonomy(pathCompanyId), this.dataEngine.listPeople(pathCompanyId), this.dataEngine.listCapTable(pathCompanyId), this.dataEngine.listSources(pathCompanyId), this.dataEngine.listEstimates(pathCompanyId), this.modelEngine.listScenarios(pathCompanyId), this.modelEngine.listRuns(pathCompanyId)))
      }
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found')
    } catch (error) {
      sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 500)
    }
  }

  private async handleCompanies(response: ServerResponse): Promise<void> {
    try { sendJson(response, await this.dataEngine.archive.listCompanies()) }
    catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 500) }
  }

  private async handleCompany(response: ServerResponse, companyId: string): Promise<void> {
    try { sendJson(response, await this.dataEngine.getCompany(companyId)) }
    catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 404) }
  }

  private async handleArtifact(response: ServerResponse, artifactId: string, companyId = this.companyId): Promise<void> {
    try { const artifact = await this.dataEngine.archive.readArtifact(companyId, artifactId); response.writeHead(200, { 'content-type': artifact.mediaType, 'content-length': artifact.content.byteLength }).end(artifact.content) }
    catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 404) }
  }

  private async handleEstimateImport(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const payload = parseImportPayload(await readBody(request))
      const result = importEstimatesCsvText(payload.csv, this.dataEngine.archive, payload.companyId ?? this.companyId, payload.apply)
      sendJson(response, result)
    } catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleManagementImport(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const payload = parseImportPayload(await readBody(request))
      sendJson(response, importManagementCsvText(payload.csv, this.dataEngine.archive, payload.companyId ?? this.companyId, payload.apply))
    } catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleCapTableImport(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const payload = parseImportPayload(await readBody(request))
      sendJson(response, importCapTableCsvText(payload.csv, this.dataEngine.archive, payload.companyId ?? this.companyId, payload.apply))
    } catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleCoalRun(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const payload = parsePayload(await readBody(request), (form) => ({ companyId: form.get('company_id') ?? undefined, input: JSON.parse(form.get('input') ?? '{}') })) as { companyId?: string; input: Parameters<EquityModelEngine['runCoalScenario']>[1]; scenarioId?: string; notes?: string }
      sendJson(response, this.modelEngine.runCoalScenario(payload.companyId ?? this.companyId, payload.input, payload.scenarioId, payload.notes))
    } catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleBankRun(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const payload = parsePayload(await readBody(request), (form) => ({ companyId: form.get('company_id') ?? undefined, input: JSON.parse(form.get('input') ?? '{}') })) as { companyId?: string; input: Parameters<EquityModelEngine['runBankPbRoe']>[1]; notes?: string }
      sendJson(response, this.modelEngine.runBankPbRoe(payload.companyId ?? this.companyId, payload.input, payload.notes))
    } catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleInsuranceRun(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try { const payload = parsePayload(await readBody(request), (form) => ({ companyId: form.get('company_id') ?? undefined, input: JSON.parse(form.get('input') ?? '{}') })) as { companyId?: string; input: Parameters<EquityModelEngine['runInsurancePEv']>[1]; notes?: string }; sendJson(response, this.modelEngine.runInsurancePEv(payload.companyId ?? this.companyId, payload.input, payload.notes)) }
    catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleSotpRun(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try { const payload = parsePayload(await readBody(request), (form) => ({ companyId: form.get('company_id') ?? undefined, components: JSON.parse(form.get('components') ?? '[]'), adjustments: Number(form.get('adjustments') ?? 0) })) as { companyId?: string; components: Parameters<EquityModelEngine['runSotp']>[1]; adjustments?: number; notes?: string }; sendJson(response, this.modelEngine.runSotp(payload.companyId ?? this.companyId, payload.components, payload.adjustments, payload.notes)) }
    catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleScenarioSave(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try { const parsed = parsePayload(await readBody(request), (form) => ({ companyId: form.get('company_id') ?? undefined, name: form.get('name') ?? '', modelId: form.get('modelId') ?? '', parameters: JSON.parse(form.get('parameters') ?? '{}') })) as Parameters<EquityModelEngine['saveScenario']>[1] & { companyId?: string }; sendJson(response, { scenarioId: this.modelEngine.saveScenario(parsed.companyId ?? this.companyId, parsed) }) }
    catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }
}

function renderPage(companyId: string, observations: LegacyObservationRecord[], facts: ReturnType<EquityDataEngine['listFacts']>, taxonomy: ReturnType<EquityDataEngine['listTaxonomy']>, people: ReturnType<EquityDataEngine['listPeople']>, capTable: ReturnType<EquityDataEngine['listCapTable']>, sources: ReturnType<EquityDataEngine['listSources']>, estimates: ReturnType<EquityDataEngine['listEstimates']>, scenarios: ReturnType<EquityModelEngine['listScenarios']>, runs: ReturnType<EquityModelEngine['listRuns']>): string {
  const rows = observations.map((observation) => `<tr>
    <td><code>${escapeHtml(observation.observationId)}</code></td>
    <td>${escapeHtml(observation.legacyMetricId)}</td>
    <td>${escapeHtml(observation.mappedMetricId ?? '-')}</td>
    <td>${escapeHtml(observation.periodStart ?? observation.periodEnd ?? '-')}</td>
    <td>${escapeHtml(observation.value ?? '-')} ${escapeHtml(observation.unit ?? '')}</td>
    <td><span class="status status-${escapeHtml(observation.reviewStatus)}">${escapeHtml(observation.reviewStatus)}</span></td>
    <td>${observation.evidenceId ? `<a href="/api/evidence/${encodeURIComponent(observation.evidenceId)}">${escapeHtml(observation.sourceLocator ?? observation.evidenceId)}</a>` : escapeHtml(observation.sourceLocator ?? '-')}</td>
  </tr>`).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Conte Equity Research</title><style>
    :root{font-family:Inter,system-ui,sans-serif;color:#1e293b;background:#f8fafc}body{margin:0;padding:32px}main{max-width:1400px;margin:auto}h1{margin:0 0 4px;font-size:26px}h2{margin-top:32px;font-size:18px}p{color:#64748b}table{width:100%;border-collapse:collapse;background:white;border:1px solid #e2e8f0;font-size:13px}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top}th{background:#f1f5f9;font-weight:600}tr:last-child td{border-bottom:0}code{font-size:12px}.status{display:inline-block;padding:3px 6px;border-radius:4px;background:#fef3c7;color:#92400e;font-size:11px}.status-confirmed,.status-verified{background:#dcfce7;color:#166534}.status-rejected{background:#fee2e2;color:#991b1b}.empty{padding:24px;text-align:center;color:#64748b}</style></head>
    <body><main><h1>Conte Equity Research</h1><p>Company: <code>${escapeHtml(companyId)}</code> · <a href="/">default workspace</a> · <a href="/api/companies">company API</a></p>
    <h2>Legacy Observations (${observations.length})</h2><table><thead><tr><th>ID</th><th>Legacy metric</th><th>Mapped metric</th><th>Period</th><th>Value</th><th>Status</th><th>Source locator</th></tr></thead><tbody>${rows || '<tr><td class="empty" colspan="7">No observations</td></tr>'}</tbody></table>
    <h2>Facts (${facts.length})</h2><table><thead><tr><th>ID</th><th>Metric</th><th>Period</th><th>Value</th><th>Status</th></tr></thead><tbody>${facts.map((fact) => `<tr><td><code>${escapeHtml(fact.factId)}</code></td><td>${escapeHtml(fact.metricId)}</td><td>${escapeHtml(fact.periodStart ?? fact.periodEnd)} to ${escapeHtml(fact.periodEnd)}</td><td>${escapeHtml(String(fact.value))} ${escapeHtml(fact.unit ?? '')}</td><td>${escapeHtml(fact.verificationStatus)}</td></tr>`).join('') || '<tr><td class="empty" colspan="5">No facts</td></tr>'}</tbody></table>
    <h2>Taxonomy (${taxonomy.length} industries)</h2><table><thead><tr><th>Industry</th><th>Primary</th><th>Business lines</th></tr></thead><tbody>${taxonomy.map((industry) => `<tr><td>${escapeHtml(industry.industryId)}</td><td>${industry.isPrimary ? 'yes' : 'no'}</td><td>${escapeHtml(industry.businessLines.map((line) => line.displayName).join(', ') || '-')}</td></tr>`).join('') || '<tr><td class="empty" colspan="3">No taxonomy configured</td></tr>'}</tbody></table>
    <h2>Analyst Estimates (${estimates.length})</h2><table><thead><tr><th>Metric</th><th>Target period</th><th>As of</th><th>Provider</th><th>Type</th><th>Value</th><th>Status</th></tr></thead><tbody>${estimates.map((estimate) => `<tr><td>${escapeHtml(estimate.metricId)}</td><td>${escapeHtml(estimate.targetPeriodStart ?? estimate.targetPeriodEnd)} to ${escapeHtml(estimate.targetPeriodEnd)}</td><td>${escapeHtml(estimate.asOf)}</td><td>${escapeHtml(estimate.provider)}</td><td>${escapeHtml(estimate.estimateType)}</td><td>${escapeHtml(String(estimate.value))} ${escapeHtml(estimate.unit ?? '')}</td><td>${escapeHtml(estimate.verificationStatus)}</td></tr>`).join('') || '<tr><td class="empty" colspan="7">No estimates</td></tr>'}</tbody></table>
    <h2>Management (${people.length})</h2><table><thead><tr><th>Person</th><th>Position</th><th>Start</th><th>End</th><th>Current</th></tr></thead><tbody>${people.flatMap((person) => person.assignments.length ? person.assignments.map((assignment) => `<tr><td>${escapeHtml(person.nameZh ?? person.nameEn ?? person.personId)}</td><td>${escapeHtml(assignment.position?.positionNameNormalized ?? assignment.position?.roleTitleRaw ?? assignment.positionId)}</td><td>${escapeHtml(assignment.startDate)}</td><td>${escapeHtml(assignment.endDate ?? '-')}</td><td>${assignment.isCurrent ? 'yes' : 'no'}</td></tr>`) : [`<tr><td>${escapeHtml(person.nameZh ?? person.nameEn ?? person.personId)}</td><td colspan="4">No assignments</td></tr>`]).join('')}</tbody></table>
    <h2>Cap Table (${capTable.length} snapshots)</h2>${capTable.map((snapshot) => `<h3>${escapeHtml(snapshot.asOfDate)}</h3><table><thead><tr><th>Share class</th><th>Outstanding</th><th>Holder</th><th>Shares</th><th>Ownership</th></tr></thead><tbody>${snapshot.shareClasses.map((shareClass) => `<tr><td>${escapeHtml(shareClass.name)}</td><td>${escapeHtml(String(shareClass.sharesOutstanding))}</td><td colspan="3">${escapeHtml(shareClass.exchange ?? '')} ${escapeHtml(shareClass.ticker ?? '')}</td></tr>`).join('')}${snapshot.positions.map((position) => `<tr><td></td><td></td><td>${escapeHtml(position.holderName)}</td><td>${escapeHtml(String(position.shares ?? '-'))}</td><td>${escapeHtml(String(position.ownershipPct ?? '-'))}%</td></tr>`).join('')}</tbody></table>`).join('') || '<p>No cap table snapshots</p>'}
    <h2>Sources (${sources.length})</h2><table><thead><tr><th>ID</th><th>Type</th><th>Title</th><th>Publisher</th><th>Published</th></tr></thead><tbody>${sources.map((source) => `<tr><td><code>${escapeHtml(source.sourceId)}</code></td><td>${escapeHtml(source.sourceType)}</td><td>${escapeHtml(source.title)}</td><td>${escapeHtml(source.publisher)}</td><td>${escapeHtml(source.publishedAt ?? '-')}</td></tr>`).join('') || '<tr><td class="empty" colspan="5">No sources</td></tr>'}</tbody></table>
    <h2>Scenarios (${scenarios.length})</h2><table><thead><tr><th>Name</th><th>Model</th><th>Version</th><th>Updated</th></tr></thead><tbody>${scenarios.map((scenario) => `<tr><td>${escapeHtml(scenario.name)}</td><td>${escapeHtml(scenario.modelId)}</td><td>${escapeHtml(scenario.modelVersion)}</td><td>${escapeHtml(scenario.updatedAt)}</td></tr>`).join('') || '<tr><td class="empty" colspan="4">No scenarios</td></tr>'}</tbody></table><form method="post" action="/api/models/scenarios"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><input name="name" placeholder="Scenario name" required><input name="modelId" value="coal-scenario" required><textarea name="parameters" rows="3" style="width:100%;font-family:monospace" placeholder='{"coalPrice":700,"annualProduction":100}' required></textarea><button type="submit">Save scenario</button></form>
    <h2>Model Runs (${runs.length})</h2><table><thead><tr><th>Model</th><th>Run at</th><th>Output</th></tr></thead><tbody>${runs.map((run) => `<tr><td>${escapeHtml(run.modelId)}</td><td>${escapeHtml(run.runAt)}</td><td><code>${escapeHtml(JSON.stringify(run.outputs))}</code></td></tr>`).join('') || '<tr><td class="empty" colspan="3">No model runs</td></tr>'}</tbody></table><form method="post" action="/api/models/coal/run"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><textarea name="input" rows="6" style="width:100%;font-family:monospace" placeholder='{"coalPrice":700,"annualProduction":100,"years":5,"ebitdaMargin":0.25,"taxRate":0.25,"discountRate":0.1,"terminalGrowth":0.02,"netDebt":1000,"sharesOutstanding":100}' required></textarea><button type="submit">Run coal scenario</button></form>
    <h2>Bank P/B-ROE</h2><form method="post" action="/api/models/bank/pb-roe"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><textarea name="input" rows="3" style="width:100%;font-family:monospace" placeholder='{"bookValuePerShare":10,"sustainableRoe":0.12,"costOfEquity":0.1,"terminalGrowth":0.03,"targetPb":1.1}' required></textarea><button type="submit">Run bank model</button></form>
    <h2>Insurance P/EV</h2><form method="post" action="/api/models/insurance/p-ev"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><textarea name="input" rows="3" style="width:100%;font-family:monospace" placeholder='{"embeddedValue":100,"targetPEv":1.2,"netDebt":20,"sharesOutstanding":10}' required></textarea><button type="submit">Run insurance model</button></form>
    <h2>Sum of the Parts</h2><form method="post" action="/api/models/sotp"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><textarea name="components" rows="3" style="width:100%;font-family:monospace" placeholder='[{"name":"Coal","value":100},{"name":"Bank","value":50,"weight":0.5}]' required></textarea><input name="adjustments" type="number" value="0" step="any"><button type="submit">Run SOTP</button></form>
    <h2>Import Estimates CSV</h2><form method="post" action="/api/estimates/import"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><textarea name="csv" rows="8" style="width:100%;font-family:monospace" placeholder="metric_id,target_period_type,target_period_start,target_period_end,as_of,provider,estimate_type,value,evidence_id"></textarea><p><button name="apply" value="false" type="submit">Preview</button> <button name="apply" value="true" type="submit">Import</button></p></form>
    <h2>Import Management CSV</h2><form method="post" action="/api/management/import"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><textarea name="csv" rows="6" style="width:100%;font-family:monospace" placeholder="name_zh,name_en,birth_year,unit_name,unit_type,role_title_raw,role_type,position_name_normalized,start_date,end_date,is_current,manager_role_title_raw,manager_role_type,manager_unit_name,reporting_relationship_type,reporting_start_date,reporting_end_date,source_id,evidence_id"></textarea><p><button name="apply" value="false" type="submit">Preview</button> <button name="apply" value="true" type="submit">Import</button></p></form>
    <h2>Import Cap Table CSV</h2><form method="post" action="/api/cap-table/import"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><textarea name="csv" rows="6" style="width:100%;font-family:monospace" placeholder="as_of_date,share_class_name,security_type,exchange,ticker,currency,shares_outstanding,percentage_of_total_equity,holder_name,holder_id,shares,ownership_pct,rank,source_id,evidence_id"></textarea><p><button name="apply" value="false" type="submit">Preview</button> <button name="apply" value="true" type="submit">Import</button></p></form></main></body></html>`
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

function parsePayload(body: string, fromForm: (form: URLSearchParams) => unknown): unknown {
  try { return JSON.parse(body) } catch { return fromForm(new URLSearchParams(body)) }
}

function parseImportPayload(body: string): { csv: string; companyId?: string; apply: boolean } {
  try {
    const payload = JSON.parse(body) as { csv?: unknown; companyId?: unknown; company_id?: unknown; apply?: unknown }
    return {
      csv: typeof payload.csv === 'string' ? payload.csv : '',
      ...(typeof (payload.companyId ?? payload.company_id) === 'string' ? { companyId: String(payload.companyId ?? payload.company_id) } : {}),
      apply: payload.apply === true || payload.apply === 'true',
    }
  } catch {
    const form = new URLSearchParams(body)
    return { csv: form.get('csv') ?? '', ...(form.get('company_id') ? { companyId: form.get('company_id')! } : {}), apply: form.get('apply') === 'true' }
  }
}

function factFilterFromUrl(url: URL): Parameters<EquityDataEngine['listFacts']>[1] {
  const category = url.searchParams.get('category')
  const dimensions = Object.fromEntries([...url.searchParams.entries()].filter(([key]) => key.startsWith('dimension_')).map(([key, value]) => [key.slice('dimension_'.length), value]))
  return {
    ...(url.searchParams.get('metric') ? { metricId: url.searchParams.get('metric')! } : {}),
    ...(category === 'financial' || category === 'operating' ? { category } : {}),
    ...(url.searchParams.get('from') ? { periodStartFrom: url.searchParams.get('from')! } : {}),
    ...(url.searchParams.get('to') ? { periodEndTo: url.searchParams.get('to')! } : {}),
    ...(Object.keys(dimensions).length ? { dimensions } : {}),
    ...(url.searchParams.has('limit') ? { limit: Number(url.searchParams.get('limit')) } : {}),
  }
}
