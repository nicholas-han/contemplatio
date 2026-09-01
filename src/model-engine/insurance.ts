export interface InsurancePEvInput {
  embeddedValue: number
  targetPEv: number
  netDebt: number
  sharesOutstanding: number
}

export interface InsurancePEvOutput { enterpriseValue: number; equityValue: number; valuePerShare: number }

export function runInsurancePEv(input: InsurancePEvInput): InsurancePEvOutput {
  for (const [name, value] of Object.entries(input)) if (!Number.isFinite(value)) throw new Error(`${name} must be finite`)
  if (input.embeddedValue < 0 || input.targetPEv < 0) throw new Error('embeddedValue and targetPEv must be non-negative')
  if (input.sharesOutstanding <= 0) throw new Error('sharesOutstanding must be positive')
  const enterpriseValue = input.embeddedValue * input.targetPEv
  const equityValue = enterpriseValue - input.netDebt
  return { enterpriseValue, equityValue, valuePerShare: equityValue / input.sharesOutstanding }
}

export interface SotpComponent { name: string; value: number; weight?: number }
export interface SotpOutput { grossValue: number; adjustedValue: number; components: Array<SotpComponent & { contribution: number }> }

export function runSotp(components: SotpComponent[], adjustments = 0): SotpOutput {
  if (!components.length) throw new Error('SOTP requires at least one component')
  if (!Number.isFinite(adjustments)) throw new Error('adjustments must be finite')
  const normalized = components.map((component) => {
    if (!component.name.trim() || !Number.isFinite(component.value)) throw new Error('SOTP components require name and finite value')
    const weight = component.weight ?? 1
    if (!Number.isFinite(weight) || weight < 0) throw new Error('SOTP component weight must be non-negative')
    return { ...component, weight, contribution: component.value * weight }
  })
  const grossValue = normalized.reduce((sum, component) => sum + component.contribution, 0)
  return { grossValue, adjustedValue: grossValue + adjustments, components: normalized }
}
