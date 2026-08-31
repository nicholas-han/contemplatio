export interface CoalScenarioInput {
  coalPrice: number
  annualProduction: number
  years: number
  ebitdaMargin: number
  taxRate: number
  discountRate: number
  terminalGrowth: number
  netDebt: number
  sharesOutstanding: number
}

export interface CoalScenarioOutput { enterpriseValue: number; equityValue: number; valuePerShare: number; projectedFcf: number[] }

export function runCoalScenario(input: CoalScenarioInput): CoalScenarioOutput {
  for (const [name, value] of Object.entries(input)) if (!Number.isFinite(value)) throw new Error(`${name} must be finite`)
  if (input.years < 1 || input.years > 50 || !Number.isInteger(input.years)) throw new Error('years must be an integer between 1 and 50')
  if (input.discountRate <= input.terminalGrowth) throw new Error('discountRate must exceed terminalGrowth')
  if (input.sharesOutstanding <= 0) throw new Error('sharesOutstanding must be positive')
  const revenue = input.coalPrice * input.annualProduction
  const fcf = revenue * input.ebitdaMargin * (1 - input.taxRate)
  const projectedFcf = Array.from({ length: input.years }, () => fcf)
  const discounted = projectedFcf.reduce((sum, value, index) => sum + value / (1 + input.discountRate) ** (index + 1), 0)
  const terminal = fcf * (1 + input.terminalGrowth) / (input.discountRate - input.terminalGrowth)
  const enterpriseValue = discounted + terminal / (1 + input.discountRate) ** input.years
  const equityValue = enterpriseValue - input.netDebt
  return { enterpriseValue, equityValue, valuePerShare: equityValue / input.sharesOutstanding, projectedFcf }
}
