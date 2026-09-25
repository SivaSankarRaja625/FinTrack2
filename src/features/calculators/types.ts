import type { PrepaymentResult } from '../../domain/calculators/debt'
import type { ScenarioResult } from '../../domain/calculators/types'

export type CoreCalculatorKind =
  | 'fd'
  | 'rd'
  | 'sip'
  | 'step-up-sip'
  | 'goal-sip'
  | 'stp'
  | 'swp'
  | 'lump-sum'
  | 'multiple'
  | 'inflation'
  | 'delay'
  | 'retirement'

export type NextCalculatorKind = 'ppf' | 'scss' | 'frsb' | 'cover-gap' | 'loan-prepayment'

export type CalculatorKind = CoreCalculatorKind | NextCalculatorKind

export function isNextCalculatorKind(kind: CalculatorKind): kind is NextCalculatorKind {
  return (
    kind === 'ppf' ||
    kind === 'scss' ||
    kind === 'frsb' ||
    kind === 'cover-gap' ||
    kind === 'loan-prepayment'
  )
}

export type CalculatorOutput =
  | {
      kind: 'scenario'
      result: ScenarioResult
      details?: readonly { label: string; value: string }[]
    }
  | {
      kind: 'paired'
      label: string
      results: readonly ScenarioResult[]
      resultLabels?: readonly [string, string]
      details?: readonly { label: string; value: string }[]
    }
  | { kind: 'metric'; label: string; value: string; note: string }
  | {
      kind: 'breakdown'
      label: string
      value: string
      details: readonly { label: string; value: string }[]
      note: string
    }
  | {
      kind: 'loan'
      result: PrepaymentResult
      feePaise: number
    }

export const calculatorNames: Record<CalculatorKind, string> = {
  fd: 'Fixed deposit',
  rd: 'Recurring deposit',
  sip: 'SIP',
  'step-up-sip': 'Step-up SIP',
  'goal-sip': 'Goal SIP',
  stp: 'Systematic transfer',
  swp: 'Systematic withdrawal',
  'lump-sum': 'Lump-sum growth',
  multiple: 'Wealth multiple',
  inflation: 'Future cost of inflation',
  delay: 'Cost of delay',
  retirement: 'Retirement drawdown',
  ppf: 'Public Provident Fund',
  scss: 'Senior Citizens Savings Scheme',
  frsb: 'RBI floating-rate savings bond',
  'cover-gap': 'Life cover gap',
  'loan-prepayment': 'Loan prepayment',
}
