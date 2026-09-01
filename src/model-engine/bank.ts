export interface BankPbRoeInput {
  bookValuePerShare: number
  sustainableRoe: number
  costOfEquity: number
  terminalGrowth: number
  targetPb: number
}

export interface BankPbRoeOutput { justifiedPb: number; valuePerShare: number; impliedPremiumDiscount: number }

export function runBankPbRoe(input: BankPbRoeInput): BankPbRoeOutput {
  for (const [name, value] of Object.entries(input)) if (!Number.isFinite(value)) throw new Error(`${name} must be finite`)
  if (input.bookValuePerShare < 0) throw new Error('bookValuePerShare must be non-negative')
  if (input.costOfEquity <= input.terminalGrowth) throw new Error('costOfEquity must exceed terminalGrowth')
  if (input.costOfEquity <= 0 || input.targetPb < 0) throw new Error('costOfEquity must be positive and targetPb non-negative')
  const justifiedPb = (input.sustainableRoe - input.terminalGrowth) / (input.costOfEquity - input.terminalGrowth)
  const valuePerShare = input.bookValuePerShare * input.targetPb
  const justifiedValuePerShare = input.bookValuePerShare * justifiedPb
  return { justifiedPb, valuePerShare, impliedPremiumDiscount: justifiedValuePerShare === 0 ? 0 : valuePerShare / justifiedValuePerShare - 1 }
}
