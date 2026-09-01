import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { URL } from 'node:url'
import type { EquityDataEngine, EstimateFilter, FactFilter, LegacyObservationRecord } from '../data/data-engine.js'
import type { CompanyManifest } from '../domain/company.js'
import { importEstimatesCsvText } from '../import/estimates.js'
import { importManagementCsvText } from '../import/management.js'
import { importCapTableCsvText } from '../import/cap-table.js'
import { importFactsCsvText } from '../import/facts.js'
import { bulkPromoteLegacyUnverified, planLegacyPromotions, promoteLegacyObservations } from '../import/promote.js'
import { getLegacyObservation, reviewLegacyObservation, reviewStatuses, type ReviewStatus } from '../import/review.js'
import { EquityModelEngine } from '../model-engine/service.js'
import { bankPbRoeSchema, coalScenarioSchema, insurancePEvSchema, saveScenarioSchema, sotpSchema } from '../tools/schema.js'

export interface WebServerConfig { host?: string; port?: number; companyId?: string; modelEngine?: EquityModelEngine }

export class EquityWebServer {
  private server: Server | undefined
  readonly companyId: string

  readonly modelEngine: EquityModelEngine
  constructor(readonly dataEngine: EquityDataEngine, config: WebServerConfig = {}) {
    this.companyId = config.companyId ?? 'yankuang-energy'
    this.modelEngine = config.modelEngine ?? new EquityModelEngine(dataEngine)
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
      if (request.method === 'GET' && url.pathname === '/api/observations') {
        const observations = this.dataEngine.listLegacyObservations(companyId, url.searchParams.get('status') ?? undefined)
        return sendJson(response, observations)
      }
      if (url.pathname === '/api/companies') return void this.handleCompanies(response)
      if (url.pathname.startsWith('/api/companies/')) return void this.handleCompany(response, decodeURIComponent(url.pathname.slice('/api/companies/'.length)))
      if (url.pathname === '/api/facts') return sendJson(response, this.dataEngine.listFacts(companyId, factFilterFromUrl(url)))
      if (url.pathname.endsWith('/evidence') && url.pathname.startsWith('/api/facts/')) return sendJson(response, this.dataEngine.listFactEvidence(companyId, decodeURIComponent(url.pathname.slice('/api/facts/'.length, -'/evidence'.length))))
      if (url.pathname === '/api/estimates') return sendJson(response, this.dataEngine.listEstimates(companyId, { ...(url.searchParams.get('metric') ? { metricId: url.searchParams.get('metric')! } : {}), ...(url.searchParams.get('company_industry_id') ? { companyIndustryId: url.searchParams.get('company_industry_id')! } : {}), ...(url.searchParams.get('business_line_id') ? { businessLineId: url.searchParams.get('business_line_id')! } : {}), ...(url.searchParams.get('target_period_end') ? { targetPeriodEnd: url.searchParams.get('target_period_end')! } : {}), ...(url.searchParams.get('as_of_from') ? { asOfFrom: url.searchParams.get('as_of_from')! } : {}), ...(url.searchParams.get('as_of_to') ? { asOfTo: url.searchParams.get('as_of_to')! } : {}), ...(url.searchParams.has('limit') ? { limit: Number(url.searchParams.get('limit')) } : {}) }))
      if (url.pathname.endsWith('/evidence') && url.pathname.startsWith('/api/estimates/')) return sendJson(response, this.dataEngine.listEstimateEvidence(companyId, decodeURIComponent(url.pathname.slice('/api/estimates/'.length, -'/evidence'.length))))
      if (url.pathname === '/api/metrics') return sendJson(response, this.dataEngine.listMetricDefinitions(companyId, url.searchParams.get('category') === 'financial' || url.searchParams.get('category') === 'operating' ? url.searchParams.get('category') as 'financial' | 'operating' : undefined))
      if (url.pathname === '/api/taxonomy') return sendJson(response, this.dataEngine.listTaxonomy(companyId))
      if (url.pathname === '/api/business-line-types') return sendJson(response, this.dataEngine.listBusinessLineTypes(companyId, url.searchParams.get('industry') ?? undefined))
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
      if (request.method === 'POST' && url.pathname === '/api/facts/import') return void this.handleFactsImport(request, response)
      if (request.method === 'POST' && url.pathname === '/api/observations/review') return void this.handleObservationReview(request, response)
      if (request.method === 'POST' && url.pathname === '/api/observations/promote') return void this.handleObservationPromote(request, response)
      if (request.method === 'POST' && url.pathname === '/api/observations/promote-unverified') return void this.handleObservationPromoteUnverified(request, response)
      if (request.method === 'POST' && url.pathname === '/api/taxonomy/industries') return void this.handleIndustryAdd(request, response)
      if (request.method === 'POST' && url.pathname === '/api/taxonomy/business-lines') return void this.handleBusinessLineAdd(request, response)
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
        return void this.handlePage(response, pathCompanyId, url)
      }
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found')
    } catch (error) {
      sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 500)
    }
  }

  private async handlePage(response: ServerResponse, companyId: string, url: URL): Promise<void> {
    try {
      const filter = factFilterFromUrl(url)
      const estimateFilter = estimateFilterFromUrl(url)
      const [manifest, companies] = await Promise.all([this.dataEngine.getCompany(companyId), this.dataEngine.listCompanies()])
      sendHtml(response, renderPage(companyId, manifest, companies, this.dataEngine.listLegacyObservations(companyId), this.dataEngine.listFacts(companyId, filter), this.dataEngine.listTaxonomy(companyId), this.dataEngine.listBusinessLineTypes(companyId), this.dataEngine.listPeople(companyId), this.dataEngine.listReportingLines(companyId), this.dataEngine.listCapTable(companyId), this.dataEngine.listSources(companyId), this.dataEngine.listArtifacts(companyId), this.dataEngine.listEstimates(companyId, estimateFilter), this.modelEngine.listScenarios(companyId), this.modelEngine.listRuns(companyId), filter, estimateFilter))
    } catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 404) }
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

  private async handleFactsImport(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const payload = parseImportPayload(await readBody(request))
      sendJson(response, importFactsCsvText(payload.csv, this.dataEngine.archive, payload.companyId ?? this.companyId, payload.apply))
    } catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleObservationReview(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const parsed = parsePayload(await readBody(request), (form) => ({ companyId: form.get('company_id') ?? undefined, observationId: form.get('observation_id') ?? '', mappedMetricId: form.get('mapped_metric_id') || undefined, reviewStatus: form.get('review_status') ?? '', note: form.get('note') || undefined })) as { companyId?: unknown; company_id?: unknown; observationId?: unknown; observation_id?: unknown; mappedMetricId?: unknown; mapped_metric_id?: unknown; reviewStatus?: unknown; review_status?: unknown; note?: unknown }
      const companyIdValue = parsed.companyId ?? parsed.company_id
      const observationIdValue = parsed.observationId ?? parsed.observation_id
      const mappedMetricIdValue = parsed.mappedMetricId ?? parsed.mapped_metric_id
      const reviewStatusValue = parsed.reviewStatus ?? parsed.review_status
      const companyId = typeof companyIdValue === 'string' ? companyIdValue : this.companyId
      const observationId = typeof observationIdValue === 'string' ? observationIdValue.trim() : ''
      const reviewStatus = typeof reviewStatusValue === 'string' ? reviewStatusValue : ''
      if (!observationId) throw new Error('observationId is required')
      if (!reviewStatuses.includes(reviewStatus as ReviewStatus)) throw new Error(`reviewStatus must be one of: ${reviewStatuses.join(', ')}`)
      reviewLegacyObservation(this.dataEngine.archive, {
        observationId, reviewStatus: reviewStatus as ReviewStatus,
        ...(typeof mappedMetricIdValue === 'string' && mappedMetricIdValue.trim() ? { mappedMetricId: mappedMetricIdValue.trim() } : {}),
        ...(typeof parsed.note === 'string' && parsed.note.trim() ? { note: parsed.note.trim() } : {}),
      }, companyId)
      sendJson(response, { observation: getLegacyObservation(this.dataEngine.archive, observationId, companyId) })
    } catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleObservationPromote(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const parsed = parsePayload(await readBody(request), (form) => ({ companyId: form.get('company_id') ?? undefined, observationIds: form.get('observation_ids') ?? '', apply: form.get('apply') === 'true' })) as { companyId?: unknown; company_id?: unknown; observationIds?: unknown; observation_ids?: unknown; apply?: unknown }
      const companyIdValue = parsed.companyId ?? parsed.company_id
      const idsValue = parsed.observationIds ?? parsed.observation_ids
      const companyId = typeof companyIdValue === 'string' ? companyIdValue : this.companyId
      const observationIds = Array.isArray(idsValue)
        ? idsValue.filter((id): id is string => typeof id === 'string').flatMap((id) => id.split(/[;,\s]+/))
        : typeof idsValue === 'string' ? idsValue.split(/[;,\s]+/) : []
      const ids = [...new Set(observationIds.map((id) => id.trim()).filter(Boolean))]
      if (!ids.length) throw new Error('observationIds is required')
      const plans = planLegacyPromotions(this.dataEngine.archive, ids, companyId)
      const apply = parsed.apply === true || parsed.apply === 'true'
      if (!apply) return sendJson(response, { mode: 'dry-run', companyId, plans })
      const promoted = promoteLegacyObservations(this.dataEngine.archive, ids, companyId)
      sendJson(response, { mode: 'apply', companyId, promoted, plans })
    } catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleObservationPromoteUnverified(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const parsed = parsePayload(await readBody(request), (form) => ({ companyId: form.get('company_id') ?? undefined, apply: form.get('apply') === 'true' })) as { companyId?: unknown; company_id?: unknown; apply?: unknown }
      const companyIdValue = parsed.companyId ?? parsed.company_id
      const companyId = typeof companyIdValue === 'string' ? companyIdValue : this.companyId
      const apply = parsed.apply === true || parsed.apply === 'true'
      if (!apply) return sendJson(response, { mode: 'dry-run', companyId, message: 'Preview only. This promotes mapped scalar observations as legacy_unverified facts.' })
      sendJson(response, { mode: 'apply', companyId, ...bulkPromoteLegacyUnverified(this.dataEngine.archive, companyId) })
    } catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleIndustryAdd(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const parsed = parsePayload(await readBody(request), (form) => ({ companyId: form.get('company_id') ?? undefined, industryId: form.get('industry_id') ?? '', isPrimary: form.get('is_primary') === 'true' })) as { companyId?: unknown; company_id?: unknown; industryId?: unknown; industry_id?: unknown; isPrimary?: unknown; is_primary?: unknown }
      const companyIdValue = parsed.companyId ?? parsed.company_id
      const industryIdValue = parsed.industryId ?? parsed.industry_id
      const companyId = typeof companyIdValue === 'string' ? companyIdValue : this.companyId
      const industryId = typeof industryIdValue === 'string' ? industryIdValue : ''
      if (!industryId.trim()) throw new Error('industryId is required')
      sendJson(response, { companyIndustryId: this.dataEngine.addIndustry(companyId, { industryId: industryId.trim(), isPrimary: parsed.isPrimary === true || parsed.is_primary === true }) })
    } catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleBusinessLineAdd(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const parsed = parsePayload(await readBody(request), (form) => ({ companyId: form.get('company_id') ?? undefined, companyIndustryId: form.get('company_industry_id') ?? '', businessLineTypeId: form.get('business_line_type_id') ?? '', displayName: form.get('display_name') ?? '' })) as { companyId?: unknown; company_id?: unknown; companyIndustryId?: unknown; company_industry_id?: unknown; businessLineTypeId?: unknown; business_line_type_id?: unknown; displayName?: unknown; display_name?: unknown }
      const companyIdValue = parsed.companyId ?? parsed.company_id
      const companyIndustryIdValue = parsed.companyIndustryId ?? parsed.company_industry_id
      const businessLineTypeIdValue = parsed.businessLineTypeId ?? parsed.business_line_type_id
      const displayNameValue = parsed.displayName ?? parsed.display_name
      const companyId = typeof companyIdValue === 'string' ? companyIdValue : this.companyId
      if (typeof companyIndustryIdValue !== 'string' || !companyIndustryIdValue.trim()) throw new Error('companyIndustryId is required')
      if (typeof businessLineTypeIdValue !== 'string' || !businessLineTypeIdValue.trim()) throw new Error('businessLineTypeId is required')
      if (typeof displayNameValue !== 'string' || !displayNameValue.trim()) throw new Error('displayName is required')
      sendJson(response, { businessLineId: this.dataEngine.addBusinessLine(companyId, companyIndustryIdValue, { businessLineTypeId: businessLineTypeIdValue, displayName: displayNameValue.trim() }) })
    } catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleCoalRun(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const parsed = parsePayload(await readBody(request), (form) => ({ companyId: form.get('company_id') ?? undefined, input: JSON.parse(form.get('input') ?? '{}'), scenarioId: form.get('scenario_id') ?? undefined, notes: form.get('notes') ?? undefined })) as { companyId?: unknown; input?: unknown; scenarioId?: unknown; notes?: unknown }
      const payload = coalScenarioSchema.parse({ ...parsed, companyId: parsed.companyId ?? this.companyId }) as { companyId: string; input: Parameters<EquityModelEngine['runCoalScenario']>[1]; scenarioId?: string; notes?: string }
      sendJson(response, this.modelEngine.runCoalScenario(payload.companyId ?? this.companyId, payload.input, payload.scenarioId, payload.notes))
    } catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleBankRun(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const parsed = parsePayload(await readBody(request), (form) => ({ companyId: form.get('company_id') ?? undefined, input: JSON.parse(form.get('input') ?? '{}') })) as { companyId?: unknown; input?: unknown; notes?: unknown }
      const payload = bankPbRoeSchema.parse({ ...parsed, companyId: parsed.companyId ?? this.companyId })
      sendJson(response, this.modelEngine.runBankPbRoe(payload.companyId ?? this.companyId, payload.input, payload.notes))
    } catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleInsuranceRun(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const parsed = parsePayload(await readBody(request), (form) => ({ companyId: form.get('company_id') ?? undefined, input: JSON.parse(form.get('input') ?? '{}') })) as { companyId?: unknown; input?: unknown; notes?: unknown }
      const payload = insurancePEvSchema.parse({ ...parsed, companyId: parsed.companyId ?? this.companyId })
      sendJson(response, this.modelEngine.runInsurancePEv(payload.companyId ?? this.companyId, payload.input, payload.notes))
    }
    catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleSotpRun(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try { const parsed = parsePayload(await readBody(request), (form) => ({ companyId: form.get('company_id') ?? undefined, components: JSON.parse(form.get('components') ?? '[]'), adjustments: Number(form.get('adjustments') ?? 0), notes: form.get('notes') ?? undefined })) as { companyId?: unknown; components?: unknown; adjustments?: unknown; notes?: unknown }; const payload = sotpSchema.parse({ ...parsed, companyId: parsed.companyId ?? this.companyId }) as { companyId: string; components: Parameters<EquityModelEngine['runSotp']>[1]; adjustments?: number; notes?: string }; sendJson(response, this.modelEngine.runSotp(payload.companyId, payload.components, payload.adjustments, payload.notes)) }
    catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }

  private async handleScenarioSave(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const parsed = parsePayload(await readBody(request), (form) => ({ companyId: form.get('company_id') ?? undefined, name: form.get('name') ?? '', modelId: form.get('modelId') ?? '', parameters: JSON.parse(form.get('parameters') ?? '{}') })) as { companyId?: unknown; name?: unknown; modelId?: unknown; parameters?: unknown }
      const payload = saveScenarioSchema.parse({ companyId: parsed.companyId ?? this.companyId, input: { name: parsed.name ?? '', modelId: parsed.modelId ?? '', parameters: parsed.parameters ?? {} } })
      sendJson(response, { scenarioId: this.modelEngine.saveScenario(payload.companyId, { name: payload.input.name, modelId: payload.input.modelId, parameters: payload.input.parameters, ...(payload.input.modelVersion !== undefined ? { modelVersion: payload.input.modelVersion } : {}) }) })
    }
    catch (error) { sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400) }
  }
}

function renderPage(companyId: string, manifest: CompanyManifest, companies: CompanyManifest[], observations: LegacyObservationRecord[], facts: ReturnType<EquityDataEngine['listFacts']>, taxonomy: ReturnType<EquityDataEngine['listTaxonomy']>, businessLineTypes: ReturnType<EquityDataEngine['listBusinessLineTypes']>, people: ReturnType<EquityDataEngine['listPeople']>, reportingLines: ReturnType<EquityDataEngine['listReportingLines']>, capTable: ReturnType<EquityDataEngine['listCapTable']>, sources: ReturnType<EquityDataEngine['listSources']>, artifacts: ReturnType<EquityDataEngine['listArtifacts']>, estimates: ReturnType<EquityDataEngine['listEstimates']>, scenarios: ReturnType<EquityModelEngine['listScenarios']>, runs: ReturnType<EquityModelEngine['listRuns']>, factFilter: FactFilter, estimateFilter: EstimateFilter): string {
  const rows = observations.map((observation) => `<tr>
    <td><code>${escapeHtml(observation.observationId)}</code></td>
    <td>${escapeHtml(observation.legacyMetricId)}</td>
    <td>${escapeHtml(observation.mappedMetricId ?? '-')}</td>
    <td>${escapeHtml(observation.periodStart ?? observation.periodEnd ?? '-')}</td>
    <td>${escapeHtml(observation.value ?? '-')} ${escapeHtml(observation.unit ?? '')}</td>
    <td><span class="status status-${escapeHtml(observation.reviewStatus)}">${escapeHtml(observation.reviewStatus)}</span></td>
    <td>${observation.evidenceId ? `<a href="/api/evidence/${encodeURIComponent(observation.evidenceId)}?company_id=${encodeURIComponent(companyId)}">${escapeHtml(observation.sourceLocator ?? observation.evidenceId)}</a>` : escapeHtml(observation.sourceLocator ?? '-')}</td>
  </tr>`).join('')
  const numericFacts = facts.filter((fact): fact is typeof fact & { value: number } => typeof fact.value === 'number').slice(-24)
  const chartMax = Math.max(...numericFacts.map((fact) => Math.abs(fact.value)), 1)
  const chart = numericFacts.length ? `<div class="chart" aria-label="Fact value trend">${numericFacts.map((fact) => `<div class="bar-wrap" title="${escapeHtml(fact.metricId)} ${escapeHtml(fact.periodEnd)}"><div class="bar" style="height:${Math.max(4, Math.round(Math.abs(fact.value) / chartMax * 100))}%"></div><small>${escapeHtml(fact.periodEnd.slice(0, 7))}</small></div>`).join('')}</div>` : '<p>No numeric facts for chart</p>'
  const dimensionKeys = [...new Set(facts.flatMap((fact) => Object.keys(fact.dimensions ?? {})))].sort()
  const dimensionFilters = dimensionKeys.map((key) => `<label>${escapeHtml(key)}<input name="dimension_${escapeHtml(key)}" value="${escapeHtml(factFilter.dimensions?.[key] ?? '')}"></label>`).join('')
  const companyIndustryOptions = taxonomy.map((industry) => `<option value="${escapeHtml(industry.companyIndustryId)}">${escapeHtml(industry.industryId)}${industry.isPrimary ? ' (primary)' : ''}</option>`).join('')
  const businessLineTypeOptions = businessLineTypes.map((type) => `<option value="${escapeHtml(type.businessLineTypeId)}">${escapeHtml(type.labelEn ?? type.labelZh ?? type.businessLineTypeId)} (${escapeHtml(type.industryId)})</option>`).join('')
  const reviewStatusOptions = reviewStatuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join('')
  const query = new URLSearchParams({ ...(factFilter.metricId ? { metric: factFilter.metricId } : {}), ...(factFilter.category ? { category: factFilter.category } : {}), ...(factFilter.periodStartFrom ? { from: factFilter.periodStartFrom } : {}), ...(factFilter.periodEndTo ? { to: factFilter.periodEndTo } : {}), ...(factFilter.limit ? { limit: String(factFilter.limit) } : {}), ...Object.fromEntries(Object.entries(factFilter.dimensions ?? {}).map(([key, value]) => [`dimension_${key}`, value])) }).toString()
  const estimateQuery = new URLSearchParams({ ...(estimateFilter.metricId ? { estimate_metric: estimateFilter.metricId } : {}), ...(estimateFilter.companyIndustryId ? { estimate_company_industry_id: estimateFilter.companyIndustryId } : {}), ...(estimateFilter.businessLineId ? { estimate_business_line_id: estimateFilter.businessLineId } : {}), ...(estimateFilter.targetPeriodEnd ? { estimate_target_period_end: estimateFilter.targetPeriodEnd } : {}), ...(estimateFilter.asOfFrom ? { estimate_as_of_from: estimateFilter.asOfFrom } : {}), ...(estimateFilter.asOfTo ? { estimate_as_of_to: estimateFilter.asOfTo } : {}) }).toString()
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Conte Equity Research</title><style>
    :root{font-family:Inter,system-ui,sans-serif;color:#1e293b;background:#f8fafc}body{margin:0;padding:32px}main{max-width:1400px;margin:auto}h1{margin:0 0 4px;font-size:26px}h2{margin-top:32px;font-size:18px}p{color:#64748b}table{width:100%;border-collapse:collapse;background:white;border:1px solid #e2e8f0;font-size:13px}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top}th{background:#f1f5f9;font-weight:600}tr:last-child td{border-bottom:0}code{font-size:12px}.status{display:inline-block;padding:3px 6px;border-radius:4px;background:#fef3c7;color:#92400e;font-size:11px}.status-confirmed,.status-verified{background:#dcfce7;color:#166534}.status-rejected{background:#fee2e2;color:#991b1b}.empty{padding:24px;text-align:center;color:#64748b}.filters{display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin:10px 0 16px}.filters label{display:grid;gap:4px;font-size:12px;color:#64748b}.filters input,.filters select,.filters button{font:inherit;padding:6px 8px;border:1px solid #cbd5e1;border-radius:4px;background:white}.chart{height:150px;display:flex;align-items:end;gap:5px;padding:12px 8px 0;border:1px solid #e2e8f0;background:white;overflow-x:auto}.bar-wrap{height:100%;min-width:30px;display:flex;flex-direction:column;justify-content:end;align-items:center;gap:4px}.bar{width:22px;min-height:4px;background:#2563eb;border-radius:3px 3px 0 0}.bar-wrap small{font-size:9px;color:#64748b;writing-mode:vertical-rl;transform:rotate(180deg)}form{margin:10px 0;padding:12px 0;border-top:1px solid #e2e8f0}textarea{max-width:100%;box-sizing:border-box}button{cursor:pointer;padding:7px 10px;border:1px solid #94a3b8;border-radius:4px;background:#fff}.action-result{display:block;white-space:pre-wrap;background:#0f172a;color:#e2e8f0;padding:10px;overflow:auto;max-height:180px}</style></head>
    <body><main><h1>${escapeHtml(manifest.name_en ?? manifest.name_zh ?? companyId)}</h1><p>Company: <code>${escapeHtml(companyId)}</code> · <a href="/">default workspace</a> · <a href="/api/companies">company API</a></p><form class="filters" aria-label="Company selector"><label>Workspace<select onchange="if(this.value)location.href='/companies/'+encodeURIComponent(this.value)">${companies.map((company) => `<option value="${escapeHtml(company.company_id)}"${company.company_id === companyId ? ' selected' : ''}>${escapeHtml(company.name_en ?? company.name_zh ?? company.company_id)}</option>`).join('')}</select></label></form><section><h2>Overview</h2><table><tbody><tr><th>Jurisdiction</th><td>${escapeHtml(manifest.jurisdiction)}</td><th>Accounting standard</th><td>${escapeHtml(manifest.accounting_standard)}</td><th>Primary industry</th><td>${escapeHtml(manifest.primary_industry ?? '-')}</td></tr><tr><th>Securities</th><td colspan="5">${manifest.securities.map((security) => `${escapeHtml(security.exchange)}:${escapeHtml(security.ticker)} (${escapeHtml(security.security_type)})`).join(', ') || '-'}</td></tr></tbody></table></section>
    <h2>Legacy Observations (${observations.length})</h2><table><thead><tr><th>ID</th><th>Legacy metric</th><th>Mapped metric</th><th>Period</th><th>Value</th><th>Status</th><th>Source locator</th></tr></thead><tbody>${rows || '<tr><td class="empty" colspan="7">No observations</td></tr>'}</tbody></table><form method="post" action="/api/observations/review"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><label>Observation ID <input name="observation_id" required placeholder="obs-0001"></label><label>Mapped metric <input name="mapped_metric_id" placeholder="coal.production"></label><label>Status <select name="review_status" required>${reviewStatusOptions}</select></label><label>Note <input name="note"></label><button type="submit">Save review</button></form><form method="post" action="/api/observations/promote"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><label>Observation IDs <input name="observation_ids" required placeholder="obs-0001,obs-0002"></label><button name="apply" value="false" type="submit">Preview promotion</button> <button name="apply" value="true" type="submit">Promote reviewed</button></form><form method="post" action="/api/observations/promote-unverified"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><button name="apply" value="false" type="submit">Preview unverified</button> <button name="apply" value="true" type="submit">Promote unverified</button></form>
    <h2>Facts (${facts.length})</h2><form class="filters" method="get" action="/companies/${encodeURIComponent(companyId)}"><label>Metric<input name="metric" value="${escapeHtml(factFilter.metricId ?? '')}" placeholder="coal.production"></label><label>Category<select name="category"><option value="">all</option><option value="financial"${factFilter.category === 'financial' ? ' selected' : ''}>financial</option><option value="operating"${factFilter.category === 'operating' ? ' selected' : ''}>operating</option></select></label><label>From<input name="from" type="date" value="${escapeHtml(factFilter.periodStartFrom ?? '')}"></label><label>To<input name="to" type="date" value="${escapeHtml(factFilter.periodEndTo ?? '')}"></label>${dimensionFilters}<label>Limit<input name="limit" type="number" min="1" max="5000" value="${escapeHtml(String(factFilter.limit ?? 500))}"></label><button type="submit">Filter</button>${query ? `<a href="/companies/${encodeURIComponent(companyId)}">Clear</a>` : ''}</form>${chart}<table><thead><tr><th>ID</th><th>Metric</th><th>Period</th><th>Value</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${facts.map((fact) => `<tr><td><code>${escapeHtml(fact.factId)}</code></td><td>${escapeHtml(fact.metricId)}</td><td>${escapeHtml(fact.periodStart ?? fact.periodEnd)} to ${escapeHtml(fact.periodEnd)}</td><td>${escapeHtml(String(fact.value))} ${escapeHtml(fact.unit ?? '')}</td><td>${escapeHtml(fact.verificationStatus)}</td><td><a href="/api/facts/${encodeURIComponent(fact.factId)}/evidence?company_id=${encodeURIComponent(companyId)}">source</a></td></tr>`).join('') || '<tr><td class="empty" colspan="6">No facts</td></tr>'}</tbody></table>
    <h2>Taxonomy (${taxonomy.length} industries)</h2><table><thead><tr><th>Industry</th><th>Primary</th><th>Business lines</th></tr></thead><tbody>${taxonomy.map((industry) => `<tr><td>${escapeHtml(industry.industryId)}</td><td>${industry.isPrimary ? 'yes' : 'no'}</td><td>${escapeHtml(industry.businessLines.map((line) => line.displayName).join(', ') || '-')}</td></tr>`).join('') || '<tr><td class="empty" colspan="3">No taxonomy configured</td></tr>'}</tbody></table><h3>Available business-line types (${businessLineTypes.length})</h3><table><thead><tr><th>ID</th><th>Industry</th><th>Label</th><th>Metric Pack</th></tr></thead><tbody>${businessLineTypes.map((type) => `<tr><td><code>${escapeHtml(type.businessLineTypeId)}</code></td><td>${escapeHtml(type.industryId)}</td><td>${escapeHtml(type.labelEn ?? type.labelZh ?? '-')}</td><td>${escapeHtml(type.originPackId)}@${escapeHtml(type.originPackVersion)}</td></tr>`).join('') || '<tr><td class="empty" colspan="4">No business-line types from applied packs</td></tr>'}</tbody></table><form method="post" action="/api/taxonomy/industries"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><label>Industry ID <input name="industry_id" required pattern="[a-z0-9._-]+"></label><label><input type="checkbox" name="is_primary" value="true"> primary</label><button type="submit">Add industry</button></form><form method="post" action="/api/taxonomy/business-lines"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><label>Company industry <select name="company_industry_id" required>${companyIndustryOptions || '<option value="">Add an industry first</option>'}</select></label><label>Business-line type <select name="business_line_type_id" required>${businessLineTypeOptions || '<option value="">Apply a metric pack first</option>'}</select></label><label>Display name <input name="display_name" required></label><button type="submit">Add business line</button></form>
    <h2>Analyst Estimates (${estimates.length})</h2><form class="filters" method="get" action="/companies/${encodeURIComponent(companyId)}"><label>Metric<input name="estimate_metric" value="${escapeHtml(estimateFilter.metricId ?? '')}" placeholder="financial.net_profit"></label><label>Company industry ID<input name="estimate_company_industry_id" value="${escapeHtml(estimateFilter.companyIndustryId ?? '')}"></label><label>Business line ID<input name="estimate_business_line_id" value="${escapeHtml(estimateFilter.businessLineId ?? '')}"></label><label>Target period<input name="estimate_target_period_end" type="date" value="${escapeHtml(estimateFilter.targetPeriodEnd ?? '')}"></label><label>As of from<input name="estimate_as_of_from" type="date" value="${escapeHtml(estimateFilter.asOfFrom ?? '')}"></label><label>As of to<input name="estimate_as_of_to" type="date" value="${escapeHtml(estimateFilter.asOfTo ?? '')}"></label><button type="submit">Filter</button>${estimateQuery ? `<a href="/companies/${encodeURIComponent(companyId)}">Clear</a>` : ''}</form><table><thead><tr><th>Metric</th><th>Scope</th><th>Target period</th><th>As of</th><th>Provider</th><th>Type</th><th>Value</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${estimates.map((estimate) => `<tr><td>${escapeHtml(estimate.metricId)}</td><td>${escapeHtml(estimate.businessLineId ?? estimate.companyIndustryId ?? 'company')}</td><td>${escapeHtml(estimate.targetPeriodStart ?? estimate.targetPeriodEnd)} to ${escapeHtml(estimate.targetPeriodEnd)}</td><td>${escapeHtml(estimate.asOf)}</td><td>${escapeHtml(estimate.provider)}</td><td>${escapeHtml(estimate.estimateType)}</td><td>${escapeHtml(String(estimate.value))} ${escapeHtml(estimate.unit ?? '')}</td><td>${escapeHtml(estimate.verificationStatus)}</td><td><a href="/api/estimates/${encodeURIComponent(estimate.estimateId)}/evidence?company_id=${encodeURIComponent(companyId)}">source</a></td></tr>`).join('') || '<tr><td class="empty" colspan="9">No estimates</td></tr>'}</tbody></table>
    <h2>Management (${people.length})</h2><table><thead><tr><th>Person</th><th>Position</th><th>Start</th><th>End</th><th>Current</th></tr></thead><tbody>${people.flatMap((person) => person.assignments.length ? person.assignments.map((assignment) => `<tr><td>${escapeHtml(person.nameZh ?? person.nameEn ?? person.personId)}</td><td>${escapeHtml(assignment.position?.positionNameNormalized ?? assignment.position?.roleTitleRaw ?? assignment.positionId)}</td><td>${escapeHtml(assignment.startDate)}</td><td>${escapeHtml(assignment.endDate ?? '-')}</td><td>${assignment.isCurrent ? 'yes' : 'no'}</td></tr>`) : [`<tr><td>${escapeHtml(person.nameZh ?? person.nameEn ?? person.personId)}</td><td colspan="4">No assignments</td></tr>`]).join('')}</tbody></table><h2>Reporting Lines (${reportingLines.length})</h2><table><thead><tr><th>Subordinate position</th><th>Manager position</th><th>Relationship</th><th>Start</th><th>End</th></tr></thead><tbody>${reportingLines.map((line) => `<tr><td><code>${escapeHtml(line.subordinatePositionId)}</code></td><td><code>${escapeHtml(line.managerPositionId)}</code></td><td>${escapeHtml(line.relationshipType)}</td><td>${escapeHtml(line.startDate)}</td><td>${escapeHtml(line.endDate ?? '-')}</td></tr>`).join('') || '<tr><td class="empty" colspan="5">No reporting lines</td></tr>'}</tbody></table>
    <h2>Cap Table (${capTable.length} snapshots)</h2>${capTable.map((snapshot) => `<h3>${escapeHtml(snapshot.asOfDate)}</h3><table><thead><tr><th>Share class</th><th>Outstanding</th><th>Holder</th><th>Shares</th><th>Ownership</th></tr></thead><tbody>${snapshot.shareClasses.map((shareClass) => `<tr><td>${escapeHtml(shareClass.name)}</td><td>${escapeHtml(String(shareClass.sharesOutstanding))}</td><td colspan="3">${escapeHtml(shareClass.exchange ?? '')} ${escapeHtml(shareClass.ticker ?? '')}</td></tr>`).join('')}${snapshot.positions.map((position) => `<tr><td></td><td></td><td>${escapeHtml(position.holderName)}</td><td>${escapeHtml(String(position.shares ?? '-'))}</td><td>${escapeHtml(String(position.ownershipPct ?? '-'))}%</td></tr>`).join('')}</tbody></table>`).join('') || '<p>No cap table snapshots</p>'}
    <h2>Sources (${sources.length})</h2><table><thead><tr><th>ID</th><th>Type</th><th>Title</th><th>Publisher</th><th>Published</th></tr></thead><tbody>${sources.map((source) => `<tr><td><code>${escapeHtml(source.sourceId)}</code></td><td>${escapeHtml(source.sourceType)}</td><td>${escapeHtml(source.title)}</td><td>${escapeHtml(source.publisher)}</td><td>${escapeHtml(source.publishedAt ?? '-')}</td></tr>`).join('') || '<tr><td class="empty" colspan="5">No sources</td></tr>'}</tbody></table><h2>Retained Artifacts (${artifacts.length})</h2><table><thead><tr><th>ID</th><th>Source</th><th>Kind</th><th>SHA-256</th><th>Open</th></tr></thead><tbody>${artifacts.map((artifact) => `<tr><td><code>${escapeHtml(artifact.artifactId)}</code></td><td><code>${escapeHtml(artifact.sourceId)}</code></td><td>${escapeHtml(artifact.artifactKind)}</td><td><code>${escapeHtml(artifact.sha256)}</code></td><td><a href="/api/artifacts/${encodeURIComponent(artifact.artifactId)}?company_id=${encodeURIComponent(companyId)}">open</a></td></tr>`).join('') || '<tr><td class="empty" colspan="5">No retained artifacts</td></tr>'}</tbody></table>
    <h2>Scenarios (${scenarios.length})</h2><table><thead><tr><th>Name</th><th>Model</th><th>Version</th><th>Updated</th></tr></thead><tbody>${scenarios.map((scenario) => `<tr><td>${escapeHtml(scenario.name)}</td><td>${escapeHtml(scenario.modelId)}</td><td>${escapeHtml(scenario.modelVersion)}</td><td>${escapeHtml(scenario.updatedAt)}</td></tr>`).join('') || '<tr><td class="empty" colspan="4">No scenarios</td></tr>'}</tbody></table><form method="post" action="/api/models/scenarios"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><input name="name" placeholder="Scenario name" required><input name="modelId" value="coal-scenario" required><textarea name="parameters" rows="3" style="width:100%;font-family:monospace" placeholder='{"coalPrice":700,"annualProduction":100}' required></textarea><button type="submit">Save scenario</button></form>
    <h2>Model Runs (${runs.length})</h2><table><thead><tr><th>Model</th><th>Run at</th><th>Output</th></tr></thead><tbody>${runs.map((run) => `<tr><td>${escapeHtml(run.modelId)}</td><td>${escapeHtml(run.runAt)}</td><td><code>${escapeHtml(JSON.stringify(run.outputs))}</code></td></tr>`).join('') || '<tr><td class="empty" colspan="3">No model runs</td></tr>'}</tbody></table><form method="post" action="/api/models/coal/run"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><textarea name="input" rows="6" style="width:100%;font-family:monospace" placeholder='{"coalPrice":700,"annualProduction":100,"years":5,"ebitdaMargin":0.25,"taxRate":0.25,"discountRate":0.1,"terminalGrowth":0.02,"netDebt":1000,"sharesOutstanding":100}' required></textarea><button type="submit">Run coal scenario</button></form>
    <h2>Import Facts CSV</h2><form method="post" action="/api/facts/import"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><textarea name="csv" rows="8" style="width:100%;font-family:monospace" placeholder="metric_id,period_type,period_start,period_end,value,unit,evidence_id,dimensions"></textarea><p><button name="apply" value="false" type="submit">Preview</button> <button name="apply" value="true" type="submit">Import</button></p></form>
    <h2>Bank P/B-ROE</h2><form method="post" action="/api/models/bank/pb-roe"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><textarea name="input" rows="3" style="width:100%;font-family:monospace" placeholder='{"bookValuePerShare":10,"sustainableRoe":0.12,"costOfEquity":0.1,"terminalGrowth":0.03,"targetPb":1.1}' required></textarea><button type="submit">Run bank model</button></form>
    <h2>Insurance P/EV</h2><form method="post" action="/api/models/insurance/p-ev"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><textarea name="input" rows="3" style="width:100%;font-family:monospace" placeholder='{"embeddedValue":100,"targetPEv":1.2,"netDebt":20,"sharesOutstanding":10}' required></textarea><button type="submit">Run insurance model</button></form>
    <h2>Sum of the Parts</h2><form method="post" action="/api/models/sotp"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><textarea name="components" rows="3" style="width:100%;font-family:monospace" placeholder='[{"name":"Coal","value":100},{"name":"Bank","value":50,"weight":0.5}]' required></textarea><input name="adjustments" type="number" value="0" step="any"><button type="submit">Run SOTP</button></form>
    <h2>Import Estimates CSV</h2><form method="post" action="/api/estimates/import"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><textarea name="csv" rows="8" style="width:100%;font-family:monospace" placeholder="metric_id,target_period_type,target_period_start,target_period_end,as_of,provider,estimate_type,value,evidence_id"></textarea><p><button name="apply" value="false" type="submit">Preview</button> <button name="apply" value="true" type="submit">Import</button></p></form>
    <h2>Import Management CSV</h2><form method="post" action="/api/management/import"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><textarea name="csv" rows="6" style="width:100%;font-family:monospace" placeholder="name_zh,name_en,birth_year,unit_name,unit_type,role_title_raw,role_type,position_name_normalized,start_date,end_date,is_current,manager_role_title_raw,manager_role_type,manager_unit_name,reporting_relationship_type,reporting_start_date,reporting_end_date,source_id,evidence_id"></textarea><p><button name="apply" value="false" type="submit">Preview</button> <button name="apply" value="true" type="submit">Import</button></p></form>
    <h2>Import Cap Table CSV</h2><form method="post" action="/api/cap-table/import"><input type="hidden" name="company_id" value="${escapeHtml(companyId)}"><textarea name="csv" rows="6" style="width:100%;font-family:monospace" placeholder="as_of_date,share_class_name,security_type,exchange,ticker,currency,shares_outstanding,percentage_of_total_equity,holder_name,holder_id,shares,ownership_pct,rank,source_id,evidence_id"></textarea><p><button name="apply" value="false" type="submit">Preview</button> <button name="apply" value="true" type="submit">Import</button></p></form></main><script>for(const form of document.querySelectorAll('form[method="post"]')){const result=document.createElement('pre');result.className='action-result';result.hidden=true;form.append(result);form.addEventListener('submit',async(event)=>{event.preventDefault();result.hidden=false;result.textContent='Running...';try{const formData=new FormData(form);if(event.submitter instanceof HTMLButtonElement&&event.submitter.name)formData.set(event.submitter.name,event.submitter.value);const response=await fetch(form.action,{method:'POST',body:new URLSearchParams(formData)});const text=await response.text();result.textContent=text}catch(error){result.textContent=String(error)}})}</script></body></html>`
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

function factFilterFromUrl(url: URL): FactFilter {
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

function estimateFilterFromUrl(url: URL): EstimateFilter {
  return {
    ...(url.searchParams.get('estimate_metric') ? { metricId: url.searchParams.get('estimate_metric')! } : {}),
    ...(url.searchParams.get('estimate_company_industry_id') ? { companyIndustryId: url.searchParams.get('estimate_company_industry_id')! } : {}),
    ...(url.searchParams.get('estimate_business_line_id') ? { businessLineId: url.searchParams.get('estimate_business_line_id')! } : {}),
    ...(url.searchParams.get('estimate_target_period_end') ? { targetPeriodEnd: url.searchParams.get('estimate_target_period_end')! } : {}),
    ...(url.searchParams.get('estimate_as_of_from') ? { asOfFrom: url.searchParams.get('estimate_as_of_from')! } : {}),
    ...(url.searchParams.get('estimate_as_of_to') ? { asOfTo: url.searchParams.get('estimate_as_of_to')! } : {}),
  }
}
