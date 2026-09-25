import Decimal from 'decimal.js'

import { assertPaise } from '../money'
import type { ISODate, Paise } from '../types'
import { buildResult } from './result'
import { marketGrowth, monthlyDate, ratePercent, validateHorizon } from './schedule'
import type { CashEvent, ReturnPath, ScenarioResult } from './types'

export interface SipInput {
  instalmentPaise: Paise
  openingPaise?: Paise
  opened: ISODate
  matures: ISODate
  cadenceMonths: 1 | 3
  returnPath: ReturnPath
  stepUp?: { everyMonths: 6 | 12; percent?: string; paise?: Paise }
}

function nonnegativePaise(value: Paise, name: string): void {
  assertPaise(value)
  if (value < 0) throw new Error(`${name} must not be negative`)
}

function validateCadence(months: number): void {
  if (months !== 1 && months !== 3)
    throw new Error('Cadence must be monthly or quarterly')
}

function postedPaise(value: Decimal): Paise {
  const paise = value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
  assertPaise(paise)
  return paise
}

function returnAssumption(path: ReturnPath, account: string): string {
  return path.kind === 'constant'
    ? `${account} illustrative effective annual return: ${path.annualPercent}%`
    : `${account} user-entered monthly returns: ${path.months.map(({ month, percent }) => `${month}: ${percent}%`).join(', ')}`
}

export function calculateSip(input: SipInput): ScenarioResult {
  validateHorizon(input.opened, input.matures)
  validateCadence(input.cadenceMonths)
  nonnegativePaise(input.instalmentPaise, 'SIP instalment')
  nonnegativePaise(input.openingPaise ?? 0, 'Opening amount')
  const step = input.stepUp
  if (step) {
    if (
      (step.everyMonths !== 6 && step.everyMonths !== 12) ||
      (step.percent === undefined) === (step.paise === undefined)
    ) {
      throw new Error('Choose exactly one valid step-up amount or percentage')
    }
    if (step.paise !== undefined) nonnegativePaise(step.paise, 'Step-up')
    if (
      step.percent !== undefined &&
      ratePercent(step.percent, 'Step-up percentage').lt(0)
    ) {
      throw new Error('Step-up percentage must not be negative')
    }
  }

  const events: CashEvent[] = []
  let balance = new Decimal(input.openingPaise ?? 0)
  let posted = input.openingPaise ?? 0
  if (posted > 0) {
    events.push({
      date: input.opened,
      account: 'main',
      kind: 'contribution',
      deltaPaise: posted,
      label: 'Opening amount',
    })
  }

  for (let index = 0; ; index++) {
    const elapsedMonths = index * input.cadenceMonths
    const date = monthlyDate(input.opened, elapsedMonths)
    if (date >= input.matures) break
    const steps = step ? Math.floor(elapsedMonths / step.everyMonths) : 0
    const amount =
      step?.percent !== undefined
        ? new Decimal(input.instalmentPaise).mul(
            new Decimal(1).plus(new Decimal(step.percent).div(100)).pow(steps),
          )
        : new Decimal(input.instalmentPaise).plus(
            new Decimal(step?.paise ?? 0).mul(steps),
          )
    const contribution = postedPaise(amount)
    events.push({
      date,
      account: 'main',
      kind: 'contribution',
      deltaPaise: contribution,
      label: 'SIP instalment',
    })
    balance = balance.plus(contribution)
    posted += contribution
    assertPaise(posted)

    const next = monthlyDate(input.opened, elapsedMonths + input.cadenceMonths)
    const growthEnd = next < input.matures ? next : input.matures
    balance = balance.mul(marketGrowth(input.returnPath, date, growthEnd))
    const valued = postedPaise(balance)
    if (valued !== posted) {
      events.push({
        date: growthEnd,
        account: 'main',
        kind: 'valuation',
        deltaPaise: valued - posted,
        label: 'Illustrative value change',
      })
    }
    posted = valued
  }

  return buildResult(
    step ? 'step-up-sip' : 'sip',
    input.opened,
    input.matures,
    [
      `Contributions every ${input.cadenceMonths} month(s), at the start of each interval`,
      returnAssumption(input.returnPath, 'SIP'),
      ...(step
        ? [
            `Step-up every ${step.everyMonths} months: ${step.percent !== undefined ? `${step.percent}%` : `${step.paise} paise`}`,
          ]
        : []),
    ],
    events,
  )
}

export function requiredGoalSip(
  input: Omit<SipInput, 'instalmentPaise'> & { targetPaise: Paise },
): Paise {
  nonnegativePaise(input.targetPaise, 'Goal target')
  const ending = (instalmentPaise: Paise): Paise =>
    calculateSip({ ...input, instalmentPaise }).endingBalancesPaise.main ?? 0
  if (ending(0) >= input.targetPaise) return 0

  let lower = 1
  let upper = 1
  const reachesGoal = (instalmentPaise: Paise): boolean | null => {
    try {
      return ending(instalmentPaise) >= input.targetPaise
    } catch (error) {
      if (error instanceof Error && error.message.includes('safe integer')) return null
      throw error
    }
  }
  while (upper < Number.MAX_SAFE_INTEGER && reachesGoal(upper) === false) {
    lower = upper + 1
    upper = Math.min(Number.MAX_SAFE_INTEGER, upper * 2)
  }
  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2)
    const reached = reachesGoal(middle)
    if (reached === false) lower = middle + 1
    else upper = middle
  }
  if (reachesGoal(lower) !== true) {
    throw new Error(
      'Goal unreachable with safe integer contributions and the selected return path',
    )
  }
  return lower
}

export interface StpInput {
  sourcePaise: Paise
  sourceUnits?: string
  opened: ISODate
  matures: ISODate
  cadenceMonths: 1 | 3
  sourceFundHouse: string
  targetFundHouse: string
  sourceReturn: ReturnPath
  targetReturn: ReturnPath
  transfer:
    | { kind: 'amount'; paise: Paise }
    | { kind: 'units'; units: string; sourceNavPaise: Paise; targetNavPaise: Paise }
  insufficient: 'stop' | 'cap'
}

export interface SwpInput {
  capitalPaise: Paise
  initialUnits?: string
  opened: ISODate
  matures: ISODate
  cadenceMonths: 1 | 3
  returnPath: ReturnPath
  withdrawal:
    | { kind: 'amount'; paise: Paise }
    | { kind: 'units'; units: string; initialNavPaise: Paise }
  annualIncreasePercent: string
}

function positivePaise(value: Paise, name: string): void {
  nonnegativePaise(value, name)
  if (value === 0) throw new Error(`${name} must be positive`)
}

function positiveUnits(value: string, name: string): Decimal {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/u.test(value)) {
    throw new Error(`${name} must be a positive decimal string`)
  }
  const units = new Decimal(value)
  if (!units.isFinite() || units.lte(0)) {
    throw new Error(`${name} must be a positive decimal string`)
  }
  return units
}

function startingUnits(
  units: string | undefined,
  navPaise: Paise,
  capitalPaise: Paise,
): Decimal {
  positivePaise(navPaise, 'Initial NAV')
  const count = positiveUnits(units ?? '', 'Starting units')
  if (postedPaise(count.mul(navPaise)) !== capitalPaise) {
    throw new Error('Units and initial NAV must reconcile with the starting value')
  }
  return count
}

function recordValue(
  events: CashEvent[],
  date: ISODate,
  account: string,
  value: Decimal,
  previouslyPosted: Paise,
): Paise {
  if (value.lt(0)) throw new Error('An illustrative account cannot become negative')
  const current = postedPaise(value)
  if (current !== previouslyPosted) {
    events.push({
      date,
      account,
      kind: 'valuation',
      deltaPaise: current - previouslyPosted,
      label: 'Illustrative value change',
    })
  }
  return current
}

export function calculateStp(input: StpInput): ScenarioResult {
  validateHorizon(input.opened, input.matures)
  validateCadence(input.cadenceMonths)
  positivePaise(input.sourcePaise, 'Starting source amount')
  if (
    !input.sourceFundHouse.trim() ||
    input.sourceFundHouse.trim() !== input.targetFundHouse.trim()
  ) {
    throw new Error('Source and target must belong to the same fund house')
  }
  if (input.insufficient !== 'stop' && input.insufficient !== 'cap') {
    throw new Error('Choose whether to stop or cap insufficient transfers')
  }

  const unitMode = input.transfer.kind === 'units'
  if (!unitMode && input.sourceUnits !== undefined) {
    throw new Error('Source units require unit-based transfers')
  }
  let sourceUnits = new Decimal(0)
  let targetUnits = new Decimal(0)
  let sourceNav = new Decimal(0)
  let targetNav = new Decimal(0)
  let requestedUnits = new Decimal(0)
  if (input.transfer.kind === 'units') {
    positivePaise(input.transfer.targetNavPaise, 'Target NAV')
    sourceUnits = startingUnits(
      input.sourceUnits,
      input.transfer.sourceNavPaise,
      input.sourcePaise,
    )
    sourceNav = new Decimal(input.transfer.sourceNavPaise)
    targetNav = new Decimal(input.transfer.targetNavPaise)
    requestedUnits = positiveUnits(input.transfer.units, 'Transfer units')
  } else {
    positivePaise(input.transfer.paise, 'Transfer amount')
  }

  let source = new Decimal(input.sourcePaise)
  let target = new Decimal(0)
  const events: CashEvent[] = [
    {
      date: input.opened,
      account: 'source',
      kind: 'contribution',
      deltaPaise: input.sourcePaise,
      label: 'Starting source investment',
    },
    {
      date: input.opened,
      account: 'target',
      kind: 'valuation',
      deltaPaise: 0,
      label: 'Target opening value',
    },
  ]
  const warnings: string[] = ['Actual redemption loads and taxes are not calculated']
  let sourcePosted = input.sourcePaise
  let targetPosted = 0
  let previous = input.opened
  let stopped = false

  const growTo = (date: ISODate): void => {
    const sourceFactor = marketGrowth(input.sourceReturn, previous, date)
    const targetFactor = marketGrowth(input.targetReturn, previous, date)
    if (unitMode) {
      sourceNav = sourceNav.mul(sourceFactor)
      targetNav = targetNav.mul(targetFactor)
      source = sourceUnits.mul(sourceNav)
      target = targetUnits.mul(targetNav)
    } else {
      source = source.mul(sourceFactor)
      target = target.mul(targetFactor)
    }
    sourcePosted = recordValue(events, date, 'source', source, sourcePosted)
    targetPosted = recordValue(events, date, 'target', target, targetPosted)
    previous = date
  }

  for (let index = 0; ; index++) {
    const date = monthlyDate(input.opened, index * input.cadenceMonths)
    if (date >= input.matures) break
    if (date !== previous) growTo(date)
    if (stopped) continue

    const tooManyUnits = unitMode && requestedUnits.gt(sourceUnits)
    const requested =
      input.transfer.kind === 'amount'
        ? input.transfer.paise
        : tooManyUnits
          ? 0
          : postedPaise(requestedUnits.mul(sourceNav))
    const insufficient = requested > sourcePosted || tooManyUnits
    if (insufficient) {
      warnings.push(
        `Transfer ${input.insufficient === 'cap' ? 'capped' : 'stopped'} on ${date}: insufficient source balance`,
      )
      stopped = true
      if (input.insufficient === 'stop' || sourcePosted === 0) continue
    }
    const redeemedUnits = unitMode && insufficient ? sourceUnits : requestedUnits
    const amount = insufficient
      ? unitMode
        ? postedPaise(redeemedUnits.mul(sourceNav))
        : sourcePosted
      : requested
    if (amount === 0) {
      warnings.push(
        `Transfer stopped on ${date}: the requested units have no payable value`,
      )
      stopped = true
      continue
    }
    if (unitMode) {
      if (targetNav.lte(0)) throw new Error(`Target NAV must be positive on ${date}`)
      sourceUnits = sourceUnits.minus(redeemedUnits)
      targetUnits = targetUnits.plus(new Decimal(amount).div(targetNav))
      source = sourceUnits.mul(sourceNav)
      target = targetUnits.mul(targetNav)
    } else {
      source = Decimal.max(0, source.minus(amount))
      target = target.plus(amount)
    }
    sourcePosted -= amount
    targetPosted += amount
    assertPaise(targetPosted)
    const transferId = `transfer-${index + 1}`
    events.push(
      {
        date,
        account: 'source',
        kind: 'transfer',
        transferId,
        deltaPaise: -amount,
        label: 'Redeem source',
      },
      {
        date,
        account: 'target',
        kind: 'transfer',
        transferId,
        deltaPaise: amount,
        label: 'Subscribe target',
      },
    )
    sourcePosted = recordValue(events, date, 'source', source, sourcePosted)
    targetPosted = recordValue(events, date, 'target', target, targetPosted)
  }
  growTo(input.matures)

  return buildResult(
    'stp',
    input.opened,
    input.matures,
    [
      `Internal ${unitMode ? 'unit' : 'amount'} transfer every ${input.cadenceMonths} month(s) within ${input.sourceFundHouse.trim()}`,
      input.transfer.kind === 'units'
        ? `Opening source units: ${input.sourceUnits}; initial source NAV: ${input.transfer.sourceNavPaise} paise/unit; initial target NAV: ${input.transfer.targetNavPaise} paise/unit; transfer: ${input.transfer.units} units`
        : `Transfer: ${input.transfer.paise} paise`,
      returnAssumption(input.sourceReturn, 'Source'),
      returnAssumption(input.targetReturn, 'Target'),
      `Insufficient source: ${input.insufficient}`,
    ],
    events,
    warnings,
  )
}

export function calculateSwp(input: SwpInput): ScenarioResult {
  validateHorizon(input.opened, input.matures)
  validateCadence(input.cadenceMonths)
  positivePaise(input.capitalPaise, 'Starting capital')
  const annualIncrease = ratePercent(input.annualIncreasePercent, 'Annual increase')
  if (annualIncrease.lt(0)) throw new Error('Annual increase must not be negative')

  const unitMode = input.withdrawal.kind === 'units'
  if (!unitMode && input.initialUnits !== undefined) {
    throw new Error('Initial units require unit-based withdrawals')
  }
  let units = new Decimal(0)
  let nav = new Decimal(0)
  let requestedUnits = new Decimal(0)
  if (input.withdrawal.kind === 'units') {
    units = startingUnits(
      input.initialUnits,
      input.withdrawal.initialNavPaise,
      input.capitalPaise,
    )
    nav = new Decimal(input.withdrawal.initialNavPaise)
    requestedUnits = positiveUnits(input.withdrawal.units, 'Withdrawal units')
  } else {
    positivePaise(input.withdrawal.paise, 'Withdrawal amount')
  }

  let balance = new Decimal(input.capitalPaise)
  let posted = input.capitalPaise
  const events: CashEvent[] = [
    {
      date: input.opened,
      account: 'main',
      kind: 'contribution',
      deltaPaise: posted,
      label: 'Starting capital',
    },
  ]
  const warnings: string[] = [
    'Market withdrawals are not guaranteed income; loads and taxes are not calculated',
  ]
  let previous = input.opened
  let stopped = false

  const stopAt = (date: ISODate, reason: string): void => {
    warnings.push(
      posted === 0
        ? `Corpus depleted on ${date}; requested withdrawal unavailable`
        : `Requested withdrawal unavailable on ${date}: ${reason}`,
    )
    stopped = true
  }

  const growTo = (date: ISODate): void => {
    const factor = marketGrowth(input.returnPath, previous, date)
    if (unitMode) {
      nav = nav.mul(factor)
      balance = units.mul(nav)
    } else {
      balance = balance.mul(factor)
    }
    posted = recordValue(events, date, 'main', balance, posted)
    previous = date
  }

  for (let index = 0; ; index++) {
    const elapsedMonths = index * input.cadenceMonths
    const date = monthlyDate(input.opened, elapsedMonths)
    if (date >= input.matures) break
    if (date !== previous) growTo(date)
    if (stopped) continue

    const stepCount = Math.floor(elapsedMonths / 12)
    const multiplier = new Decimal(1).plus(annualIncrease.div(100)).pow(stepCount)
    const unitsToWithdraw = requestedUnits.mul(multiplier)
    if (unitMode && unitsToWithdraw.gt(units)) {
      stopAt(date, 'insufficient units')
      continue
    }
    const amount = postedPaise(
      unitMode
        ? unitsToWithdraw.mul(nav)
        : new Decimal(
            input.withdrawal.kind === 'amount' ? input.withdrawal.paise : 0,
          ).mul(multiplier),
    )
    if (amount === 0 || amount > posted) {
      stopAt(date, amount === 0 ? 'no payable value' : 'insufficient corpus')
      continue
    }
    if (unitMode) {
      units = units.minus(unitsToWithdraw)
      balance = units.mul(nav)
    } else {
      balance = Decimal.max(0, balance.minus(amount))
    }
    posted -= amount
    events.push({
      date,
      account: 'main',
      kind: 'withdrawal',
      deltaPaise: -amount,
      label: 'Withdrawal',
    })
    posted = recordValue(events, date, 'main', balance, posted)
  }
  growTo(input.matures)

  return buildResult(
    'swp',
    input.opened,
    input.matures,
    [
      `${unitMode ? 'Unit' : 'Amount'} withdrawal every ${input.cadenceMonths} month(s), starting on the opening date`,
      input.withdrawal.kind === 'units'
        ? `Opening units: ${input.initialUnits}; initial NAV: ${input.withdrawal.initialNavPaise} paise/unit; withdrawal: ${input.withdrawal.units} units`
        : `Withdrawal: ${input.withdrawal.paise} paise`,
      `Annual withdrawal increase: ${input.annualIncreasePercent}%`,
      returnAssumption(input.returnPath, 'SWP'),
    ],
    events,
    warnings,
  )
}
