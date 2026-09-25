import type { ScenarioResult } from '../../domain/calculators/types'

export type CalculatorKind =
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
}
