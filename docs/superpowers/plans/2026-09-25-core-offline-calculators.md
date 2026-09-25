# Core Offline Calculators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add private, reproducible FD, RD, SIP, step-up SIP, STP, SWP, goal and wealth what-if calculators to FinTrack.

**Architecture:** Implement a pure, date-based calculation kernel using integer paise and `decimal.js`, with separate bank-deposit, market-cash-flow and time-value adapters. Add a lazy phone-first `/calculators` page with editable, temporary comparisons; do not persist scenarios or change Android permissions. Government schemes, pensions, bonds, protection and debt require their own subsequent source-verified specifications and plans.

**Tech Stack:** TypeScript, `decimal.js`, `date-fns`, Zod, React 19, React Router 7, Vitest/fast-check, Playwright, Capacitor Android.

**Spec:** [Core offline calculators design](../specs/2026-09-25-core-offline-calculators-design.md) (read it together with [primary-source research](../../calculator-research.md)).

## Global Constraints

- Entirely offline; no `fetch`, remote asset, rate feed, bank connection or Android network permission.
- Every financial event uses local `yyyy-MM-dd`; the supported horizon is up to 60 years.
- Store and display money as safe integer paise; use `Decimal` for rates and intermediate compounding and string decimals for fund units.
- Market return inputs are either an explicit effective annual rate or a complete user-entered sequence of monthly rates; missing months are errors.
- FD/RD use an explicitly entered nominal annual bank rate, compounding/payout convention, day-count rule and relevant actual bank terms, never an invented current rate.
- Scenarios remain in memory and clear on app lock; never persist plaintext or add a backup/schema migration for this module.
- No personalized investment recommendations, product rankings, invented after-tax yield, promised investment results or automatic execution.
- Existing Home, Activity, Plan and Worth tabs and the centered 520px mobile shell stay unchanged; calculators belong in **More**.
- A later instrument may enter this page only after its own authority-specific, reviewed rule pack and independent tests exist.

## Review Focus

1. A 31 January monthly start must schedule 28 February and **31 March**, not drift permanently to the 28th (Task 1 test).
2. A zero-rate SIP must equal the sum of its deposits; an unsafe amount must throw rather than produce a rounded success value (Task 1/3 tests).
3. A quarterly-payout FD must not compound interest that has already been paid out (Task 2 test).
4. An STP with insufficient source funds must stop or cap only as the user selected and must not double-count transfers as contributions (Task 4 test).
5. A poor-first-year SWP must report exhaustion before any negative balance or units are displayed (Task 4 test).

---

## Files and responsibility map

- `src/domain/calculators/types.ts`: shared validated input/result/event types; no React or storage.
- `src/domain/calculators/schedule.ts`: original-anchor dates, horizon/paise/rate validation and dated market growth.
- `src/domain/calculators/result.ts`: event ledger, totals and conservation invariants.
- `src/domain/calculators/deposits.ts`: configurable FD, RD, payout and early-withdrawal bank conventions.
- `src/domain/calculators/market.ts`: SIP, step-up, goal SIP, amount/unit STP and SWP.
- `src/domain/calculators/wealth.ts`: wealth multiples, inflation, cost-of-delay and retirement illustration.
- `src/domain/calculators/compare.ts`: comparable dates/cash flows, XIRR when unique, scenario explanations.
- `src/features/calculators/CalculatorsPage.tsx`: grouped phone-first chooser and temporary comparison state.
- `src/features/calculators/types.ts`: UI-only output union for single, paired and scalar illustrations.
- `src/features/calculators/CalculatorForm.tsx`: type-specific, labelled input groups and validation.
- `src/features/calculators/CalculatorResult.tsx`: reproducible result, assumptions, warnings and schedule.
- `src/App.tsx`, `src/app/AppShell.tsx`: lazy route and one drawer item; no new bottom tab.
- `e2e/calculators.spec.ts`: phone navigation, calculations, accessible detail, lock and offline smoke tests.
- `docs/ui-standards.md`, `docs/architecture.md`: concise calculator UI and calculation-boundary documentation.

All domain tests sit next to their owners as `schedule.test.ts`, `result.test.ts`,
`deposits.test.ts`, `market.test.ts`, `wealth.test.ts` and `compare.test.ts`.
Use the existing `pnpm test`, `pnpm check` and `pnpm test:e2e` scripts; do not
add packages unless a chosen command fails for a genuinely missing dependency.

### Task 1: Dated calculation kernel and invariant ledger

**Files:** Create `src/domain/calculators/{types,schedule,result}.ts` and
`src/domain/calculators/{schedule,result}.test.ts`.

**Interfaces:** Consumes `Paise`/`ISODate` from `src/domain/types.ts`,
`assertPaise` from `src/domain/money.ts`, `isIsoDate` from
`src/domain/dates.ts`. Produces:

```ts
export type ReturnPath =
  | { kind: 'constant'; annualPercent: string }
  | { kind: 'monthly'; months: readonly { month: string; percent: string }[] }
export type ScenarioKind =
  | 'fd'
  | 'rd'
  | 'sip'
  | 'step-up-sip'
  | 'goal-sip'
  | 'stp'
  | 'swp'
  | 'lump-sum'
  | 'retirement'
export type EventKind =
  'contribution' | 'withdrawal' | 'transfer' | 'interest' | 'valuation' | 'fee'
export interface CashEvent {
  date: ISODate
  account: string
  kind: EventKind
  deltaPaise: Paise
  label: string
  transferId?: string
}
export interface ScenarioResult {
  version: 1
  kind: ScenarioKind
  startDate: ISODate
  endDate: ISODate
  assumptions: readonly string[]
  events: readonly CashEvent[]
  endingBalancesPaise: Readonly<Record<string, Paise>>
  contributedPaise: Paise
  withdrawnPaise: Paise
  gainPaise: Paise
  warnings: readonly string[]
  xirrPercent: number | null
}
export function monthlyDate(anchor: ISODate, index: number): ISODate
export function validateHorizon(start: ISODate, end: ISODate): void
export function marketGrowth(path: ReturnPath, start: ISODate, end: ISODate): Decimal
export function buildResult(
  kind: ScenarioKind,
  startDate: ISODate,
  endDate: ISODate,
  assumptions: readonly string[],
  events: readonly CashEvent[],
  warnings?: readonly string[],
): ScenarioResult
```

- [ ] **Step 1: Write failing tests** in `schedule.test.ts` and
      `result.test.ts`. Start with these exact assertions and add the same-file
      out-of-order date, unpaired transfer, unsafe total, missing return month and
      negative-beyond-100%-rate cases:

  ```ts
  expect(monthlyDate('2026-01-31', 1)).toBe('2026-02-28')
  expect(monthlyDate('2026-01-31', 2)).toBe('2026-03-31')
  expect(monthlyDate('2024-02-29', 48)).toBe('2028-02-29')
  expect(() => validateHorizon('2026-02-01', '2026-01-01')).toThrow()
  expect(() => validateHorizon('2026-01-01', '2087-01-01')).toThrow()
  expect(
    buildResult(
      'stp',
      '2026-01-01',
      '2026-01-02',
      [],
      [
        {
          date: '2026-01-01',
          account: 'a',
          kind: 'contribution',
          deltaPaise: 10000,
          label: 'Fund',
        },
        {
          date: '2026-01-02',
          account: 'a',
          kind: 'transfer',
          transferId: 'move-1',
          deltaPaise: -2000,
          label: 'Move',
        },
        {
          date: '2026-01-02',
          account: 'b',
          kind: 'transfer',
          transferId: 'move-1',
          deltaPaise: 2000,
          label: 'Move',
        },
      ],
    ),
  ).toMatchObject({ contributedPaise: 10000, endingBalancesPaise: { a: 8000, b: 2000 } })
  expect(() =>
    buildResult(
      'sip',
      '2026-01-01',
      '2026-02-01',
      [],
      [
        {
          date: '2026-01-01',
          account: 'main',
          kind: 'contribution',
          deltaPaise: Number.MAX_SAFE_INTEGER,
          label: 'Fund',
        },
        {
          date: '2026-01-02',
          account: 'main',
          kind: 'contribution',
          deltaPaise: 1,
          label: 'Extra',
        },
      ],
    ),
  ).toThrow(/safe integer/u)
  ```

- [ ] **Step 2: Verify the red state:** run
      `pnpm exec vitest run src/domain/calculators/schedule.test.ts src/domain/calculators/result.test.ts`;
      expect imports/functions not found, not an unrelated environment failure.

- [ ] **Step 3: Implement the interfaces** using original-anchor month
      arithmetic and explicit per-month coverage. The production snippets show
      the boundary behavior, not a license to accept invalid inputs:

  ```ts
  export function monthlyDate(anchor: ISODate, index: number): ISODate {
    if (!isIsoDate(anchor) || !Number.isSafeInteger(index) || index < 0) {
      throw new Error('Enter a valid start date and month index')
    }
    return format(addMonths(parseISO(anchor), index), 'yyyy-MM-dd')
  }
  export function validateHorizon(start: ISODate, end: ISODate): void {
    if (
      !isIsoDate(start) ||
      !isIsoDate(end) ||
      start >= end ||
      end > format(addYears(parseISO(start), 60), 'yyyy-MM-dd')
    ) {
      throw new Error('Choose a valid end date within 60 years')
    }
  }
  ```

  Implement `marketGrowth` as a `Decimal` factor: for a constant effective
  annual rate use `(1 + rate/100) ^ (elapsedDays/365)`; for monthly rates
  multiply factors for calendar-month intersections, prorating each by
  `coveredDays/daysInCalendarMonth`. Require a rate for **every** intersected
  month and reject rates below -100%. `buildResult` sums signed account deltas,
  verifies each paired transfer's net zero by date/`transferId`, computes
  `gain = endingBalancesTotal + withdrawals - contributions`, checks
  `assertPaise` after each posting and leaves `xirrPercent: null` until Task 5.
  Reject an event dated outside `startDate` through `endDate`.
  `valuation` represents a market gain **or loss**, not bank interest;
  `fee` debits lower the gain without counting as a user withdrawal.

- [ ] **Step 4: Run the two test files** with the Step 2 command; expect all
      assertions to pass. Run `pnpm typecheck` to check exported types.

- [ ] **Step 5: Commit** the tested kernel:
      `git add src/domain/calculators/{types,schedule,result}* &&
git commit -m "feat: add dated calculator kernel" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`.

### Task 2: FD and RD contract illustrations

**Files:** Create `src/domain/calculators/deposits.ts` and
`src/domain/calculators/deposits.test.ts`.

**Interfaces:** Consumes Task 1's `monthlyDate`, `validateHorizon`,
`CashEvent`, `ScenarioResult`, `buildResult`. Produces:

```ts
export interface BankTerms {
  annualNominalPercent: string
  rest: 'monthly-anniversary' | 'quarterly-anniversary' | 'calendar-quarter'
  dayCount: 'actual-365' | 'actual-actual'
}
export interface FixedDepositInput extends BankTerms {
  principalPaise: Paise
  opened: ISODate
  matures: ISODate
  payout: 'cumulative' | 'monthly' | 'quarterly'
  withdrawal?: {
    date: ISODate
    applicableAnnualPercent: string
    disclosedPenaltyPercent: string
  }
}
export interface RecurringDepositInput extends BankTerms {
  installmentPaise: Paise
  opened: ISODate
  matures: ISODate
  installmentCount: number
  actualDates?: readonly (ISODate | null)[]
}
export function calculateFixedDeposit(input: FixedDepositInput): ScenarioResult
export function calculateRecurringDeposit(input: RecurringDepositInput): ScenarioResult
```

- [ ] **Step 1: Write failing tests** covering a zero-rate FD (maturity equals
      principal), four complete quarterly rests at a stated nominal rate, a
      quarterly-payout FD (principal unchanged, payouts excluded from future
      capitalization), an RD of one instalment, a missed instalment via
      `actualDates` (one nullable entry per scheduled instalment),
      a leap-year 365-versus-actual difference, invalid rates,
      missing bank day-count and an early withdrawal requiring both applicable
      rate and disclosed penalty. Example:

  ```ts
  expect(
    calculateFixedDeposit({
      principalPaise: 100_00_00,
      opened: '2026-01-01',
      matures: '2027-01-01',
      annualNominalPercent: '0',
      rest: 'quarterly-anniversary',
      dayCount: 'actual-365',
      payout: 'cumulative',
    }).endingBalancesPaise.main,
  ).toBe(100_00_00)
  const bankTerms = {
    principalPaise: 1_000_000,
    opened: '2026-01-01',
    matures: '2027-01-01',
    annualNominalPercent: '8',
    rest: 'quarterly-anniversary' as const,
    dayCount: 'actual-365' as const,
  }
  const payout = calculateFixedDeposit({ ...bankTerms, payout: 'quarterly' })
  const cumulative = calculateFixedDeposit({ ...bankTerms, payout: 'cumulative' })
  expect(payout.endingBalancesPaise.main).toBe(bankTerms.principalPaise)
  expect(payout.withdrawnPaise).toBeGreaterThan(0)
  expect(cumulative.endingBalancesPaise.main).toBeGreaterThan(
    bankTerms.principalPaise + payout.withdrawnPaise,
  )
  ```

- [ ] **Step 2: Run** `pnpm exec vitest run src/domain/calculators/deposits.test.ts`;
      expect the missing-module red failure.

- [ ] **Step 3: Implement** `calculateFixedDeposit` and
      `calculateRecurringDeposit` using a shared private
      `accrueBankBalance(balance: Decimal, from: ISODate, to: ISODate,
terms: BankTerms)` function. At a complete rest, credit
      `balance * nominalRate / restsPerYear`; for a broken period credit
      `balance * nominalRate * elapsedDays / (100 * selectedYearBasis)`.
      Derive each rest from the original deposit date or the selected calendar
      quarter; a paid-out interest event must be matched by a withdrawal event
      so the principal stops earning interest on that payout. RD events use the
      actual date of **each** instalment, not the whole contribution on day one.
      Require exactly `installmentCount` entries in `actualDates` when supplied:
      `null` means missed, a later local date means delayed. Validate each date
      against the maturity date and preserve the schedule in the result.
      Reject missing bank rules rather than assuming a "standard" convention.
      Keep bank penalty and run-period rate separate from the contracted rate:

  ```ts
  if (input.withdrawal) {
    if (input.withdrawal.date <= input.opened || input.withdrawal.date >= input.matures) {
      throw new Error('Choose a withdrawal date during the deposit')
    }
    const runRate = new Decimal(input.withdrawal.applicableAnnualPercent)
    const penalty = new Decimal(input.withdrawal.disclosedPenaltyPercent)
    if (
      !runRate.isFinite() ||
      !penalty.isFinite() ||
      runRate.isNegative() ||
      penalty.isNegative()
    ) {
      throw new Error('Enter the bank rate and disclosed penalty')
    }
  }
  ```

- [ ] **Step 4: Run** `pnpm exec vitest run src/domain/calculators/deposits.test.ts src/domain/calculators/result.test.ts`
      and `pnpm typecheck`; ensure conservation remains exact after payouts.

- [ ] **Step 5: Commit**:
      `git add src/domain/calculators/deposits* &&
git commit -m "feat: simulate contracted deposits" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`.

### Task 3: SIP, step-up and required-goal contribution

**Files:** Create `src/domain/calculators/market.ts` and
`src/domain/calculators/market.test.ts`.

**Interfaces:** Consumes Task 1's `ReturnPath`, `marketGrowth`,
`monthlyDate`, `validateHorizon`, `buildResult`; exports:

```ts
export interface SipInput {
  instalmentPaise: Paise
  openingPaise?: Paise
  opened: ISODate
  matures: ISODate
  cadenceMonths: 1 | 3
  returnPath: ReturnPath
  stepUp?: { everyMonths: 6 | 12; percent?: string; paise?: Paise }
}
export function calculateSip(input: SipInput): ScenarioResult
export function requiredGoalSip(
  input: Omit<SipInput, 'instalmentPaise'> & { targetPaise: Paise },
): Paise
```

- [ ] **Step 1: Write failing tests:** 12 deposits of INR 1,000 at 0%
      equal INR 12,000; a 12-month step-up changes only the 13th instalment;
      6-month step-up changes only the 7th; an opening balance is counted only
      once; a negative return does not create a positive gain; an unsafe
      instalment throws; `requiredGoalSip` at 0%
      rounds **up** to the least paise meeting the target.

  ```ts
  expect(
    calculateSip({
      instalmentPaise: 100_000,
      cadenceMonths: 1,
      opened: '2026-01-01',
      matures: '2027-01-01',
      returnPath: { kind: 'constant', annualPercent: '0' },
    }).contributedPaise,
  ).toBe(12 * 100_000)
  expect(
    calculateSip({
      instalmentPaise: 100_000,
      cadenceMonths: 1,
      opened: '2026-01-01',
      matures: '2027-01-01',
      returnPath: { kind: 'constant', annualPercent: '0' },
    }).endingBalancesPaise.main,
  ).toBe(12 * 100_000)
  expect(() =>
    calculateSip({
      instalmentPaise: Number.MAX_SAFE_INTEGER,
      cadenceMonths: 1,
      opened: '2026-01-01',
      matures: '2026-03-01',
      returnPath: { kind: 'constant', annualPercent: '0' },
    }),
  ).toThrow(/safe integer/u)
  ```

- [ ] **Step 2: Run** `pnpm exec vitest run src/domain/calculators/market.test.ts`;
      expect missing exports.

- [ ] **Step 3: Implement** the dated ledger with contributions posted
      on `monthlyDate(opened, index * cadenceMonths)` **before** growth to the next date,
      non-mutating return paths, and paise rounding at each contribution. Treat
      an optional `openingPaise` as a dated opening contribution:

  ```ts
  let balance = new Decimal(input.openingPaise ?? 0)
  let postedPaise = balance.toNumber()
  if (postedPaise > 0) {
    events.push({
      date: input.opened,
      account: 'main',
      kind: 'contribution',
      deltaPaise: postedPaise,
      label: 'Opening amount',
    })
  }
  for (
    let index = 0;
    monthlyDate(input.opened, index * input.cadenceMonths) < input.matures;
    index++
  ) {
    const elapsedMonths = index * input.cadenceMonths
    const date = monthlyDate(input.opened, elapsedMonths)
    const next = monthlyDate(input.opened, elapsedMonths + input.cadenceMonths)
    const stepCount = input.stepUp
      ? Math.floor(elapsedMonths / input.stepUp.everyMonths)
      : 0
    const amount =
      input.stepUp?.percent !== undefined
        ? new Decimal(input.instalmentPaise).mul(
            new Decimal(1)
              .plus(new Decimal(input.stepUp.percent).div(100))
              .pow(stepCount),
          )
        : new Decimal(input.instalmentPaise).plus(
            new Decimal(input.stepUp?.paise ?? 0).mul(stepCount),
          )
    const contribution = amount.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
    assertPaise(contribution)
    events.push({
      date,
      account: 'main',
      kind: 'contribution',
      deltaPaise: contribution,
      label: 'Contribution',
    })
    balance = balance.plus(contribution)
    postedPaise += contribution
    assertPaise(postedPaise)
    const growthEnd = next < input.matures ? next : input.matures
    balance = balance.mul(marketGrowth(input.returnPath, date, growthEnd))
    const shownPaise = balance.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
    assertPaise(shownPaise)
    if (shownPaise !== postedPaise) {
      events.push({
        date: growthEnd,
        account: 'main',
        kind: 'valuation',
        deltaPaise: shownPaise - postedPaise,
        label: 'Illustrative value change',
      })
    }
    postedPaise = shownPaise
  }
  ```

  `requiredGoalSip` uses bounded integer-paise binary search over this same
  calculation, accepts the smallest installment with ending value at least
  `targetPaise`, and raises a goal-unreachable error when the maximum safe
  installment or horizon is exceeded. Reject step-ups with both `percent`
  and `paise` (or neither); the goal screen applies `futureCost` in Task 5
  before passing the inflated target to this inverse calculator.

- [ ] **Step 4: Run** `pnpm exec vitest run src/domain/calculators/market.test.ts src/domain/calculators/schedule.test.ts`
      and `pnpm typecheck`; inspect the dated schedule, not only the final total.

- [ ] **Step 5: Commit**:
      `git add src/domain/calculators/market* &&
git commit -m "feat: simulate SIP and goal contributions" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`.

### Task 4: STP and SWP cash-flow adapters

**Files:** Modify `src/domain/calculators/market.ts` and its adjacent test.

**Interfaces:** Consumes `CashEvent`, `ReturnPath`, `marketGrowth`,
`buildResult`, `monthlyDate`; produces:

```ts
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
    | {
        kind: 'units'
        units: string
        sourceNavPaise: Paise
        targetNavPaise: Paise
      }
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
    | {
        kind: 'units'
        units: string
        initialNavPaise: Paise
      }
  annualIncreasePercent: string
}
export function calculateStp(input: StpInput): ScenarioResult
export function calculateSwp(input: SwpInput): ScenarioResult
```

- [ ] **Step 1: Write failing tests** for an STP at zero returns with
      INR 12,000 initially in source and three INR 1,000 transfers: total
      ending balance remains INR 12,000 and `contributedPaise` is INR 12,000,
      **not** INR 15,000. Insufficient source with `stop` has no partial last
      transfer, with `cap` transfers only the remaining balance. Add
      amount-based and unit-based SWP tests; a poor first month and large
      withdrawal must return depletion rather than a negative unit count.

  ```ts
  const stp = calculateStp({
    sourcePaise: 1_200_000,
    opened: '2026-01-01',
    matures: '2026-04-01',
    cadenceMonths: 1,
    sourceFundHouse: 'Illustrative AMC',
    targetFundHouse: 'Illustrative AMC',
    sourceReturn: { kind: 'constant', annualPercent: '0' },
    targetReturn: { kind: 'constant', annualPercent: '0' },
    transfer: { kind: 'amount', paise: 100_000 },
    insufficient: 'stop',
  })
  expect(stp.contributedPaise).toBe(1_200_000)
  expect(Object.values(stp.endingBalancesPaise).reduce((a, b) => a + b, 0)).toBe(
    1_200_000,
  )
  const short = {
    sourcePaise: 100_000,
    opened: '2026-01-01',
    matures: '2026-04-01',
    cadenceMonths: 1 as const,
    sourceFundHouse: 'Same AMC',
    targetFundHouse: 'Same AMC',
    sourceReturn: { kind: 'constant' as const, annualPercent: '0' },
    targetReturn: { kind: 'constant' as const, annualPercent: '0' },
    transfer: { kind: 'amount' as const, paise: 70_000 },
  }
  expect(
    calculateStp({ ...short, insufficient: 'stop' }).endingBalancesPaise.target,
  ).toBe(70_000)
  expect(calculateStp({ ...short, insufficient: 'cap' }).endingBalancesPaise.target).toBe(
    100_000,
  )
  const poorStart = calculateSwp({
    capitalPaise: 1_000_000,
    opened: '2026-01-01',
    matures: '2026-04-01',
    cadenceMonths: 1,
    returnPath: {
      kind: 'monthly',
      months: [
        { month: '2026-01', percent: '-50' },
        { month: '2026-02', percent: '0' },
        { month: '2026-03', percent: '0' },
      ],
    },
    withdrawal: { kind: 'amount', paise: 600_000 },
    annualIncreasePercent: '0',
  })
  expect(poorStart.endingBalancesPaise.main).toBeGreaterThanOrEqual(0)
  expect(poorStart.warnings.join(' ')).toMatch(/depleted on 2026-02-01/u)
  ```

- [ ] **Step 2: Run** `pnpm exec vitest run src/domain/calculators/market.test.ts`;
      expect the new STP/SWP tests to fail on missing exports.

- [ ] **Step 3: Implement** two signed STP transfer events per installment with the same `transferId`,
      source negative and target positive on the same date. Schedule from the
      original date at `cadenceMonths` intervals; reject unequal source and
      target fund-house identifiers (STP is within one AMC). Seed source capital
      as exactly **one** external contribution. For unit mode convert the chosen
      redeemed units to paise at the **simulated dated source NAV**, buy target
      units at its simulated dated NAV with decimal-string precision, and reject
      zero/negative NAV. For unit mode require `sourceUnits` and
      `sourceNavPaise` and reconcile their starting value to `sourcePaise`;
      require `initialUnits` and reconcile `initialNavPaise` to `capitalPaise`
      for unit-based SWP. Update NAV by the chosen return path each interval;
      do not hold the initial NAV fixed. In SWP post each
      payout as a withdrawal; apply the selected monthly return before the next
      payout, explicitly recording a warning/date for the first insufficient
      balance and never allowing negative units:

  ```ts
  const requested = new Decimal(
    input.withdrawal.kind === 'amount'
      ? input.withdrawal.paise
      : new Decimal(input.withdrawal.units).mul(currentNavPaise),
  )
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber()
  if (requested > availablePaise) {
    warnings.push(`Corpus depleted on ${date}; requested withdrawal unavailable`)
    break
  }
  events.push({
    date,
    account: 'main',
    kind: 'withdrawal',
    deltaPaise: -requested,
    label: 'Withdrawal',
  })
  ```

- [ ] **Step 4: Run** `pnpm exec vitest run src/domain/calculators/market.test.ts src/domain/calculators/result.test.ts`
      and `pnpm typecheck`; check the non-negative result and transfer totals.

- [ ] **Step 5: Commit**:
      `git add src/domain/calculators/market* &&
git commit -m "feat: simulate transfers and withdrawals" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`.

### Task 5: Wealth, inflation, XIRR and comparisons

**Files:** Create `src/domain/calculators/{wealth,compare}.ts` and
`src/domain/calculators/{wealth,compare}.test.ts`.

**Interfaces:** Consumes `ScenarioResult`, `marketGrowth`, `buildResult`,
`requiredGoalSip`. Produces:

```ts
export function futureCost(
  todayPaise: Paise,
  annualInflationPercent: string,
  years: number,
): Paise
export function wealthMultiple(
  initialPaise: Paise,
  annualPercent: string,
  multiple: 2 | 3,
  horizonYears: number,
): number | null
export function projectLumpSum(input: {
  principalPaise: Paise
  opened: ISODate
  matures: ISODate
  returnPath: ReturnPath
}): ScenarioResult
export function costOfDelay(
  input: SipInput,
  delayMonths: number,
): {
  now: ScenarioResult
  delayed: ScenarioResult
}
export function retirementProjection(
  input: SipInput & {
    monthlyWithdrawalPaise: Paise
    withdrawalMonths: number
  },
): ScenarioResult
export function xirr(
  events: readonly CashEvent[],
  endingValuePaise: Paise,
  asOf: ISODate,
): number | null
export function withDatedYield(result: ScenarioResult, asOf: ISODate): ScenarioResult
export function compareScenarios(
  scenarios: readonly ScenarioResult[],
  asOf: ISODate,
  inflationPercent: string,
): readonly {
  result: ScenarioResult
  realEndPaise: Paise | null
  differentCashFlows: boolean
}[]
```

- [ ] **Step 1: Write failing tests:** 0% inflation returns the input value;
      doubling is "not reached" (`null`) at 0% or negative growth; a 10% lump-sum
      one-year gain is 10%; periodic investments use an
      XIRR based on **dates** rather than `ending/invested`; a cash-flow series
      without both signs or with multiple sign changes yields `null`; identical
      market paths but a delayed start cannot use extra time beyond the shared
      evaluation date; retirement SWP depletion remains non-negative.

  ```ts
  expect(futureCost(100_000, '0', 10)).toBe(100_000)
  expect(wealthMultiple(100_000, '0', 2, 60)).toBeNull()
  const oneYear = projectLumpSum({
    principalPaise: 100_000,
    opened: '2026-01-01',
    matures: '2027-01-01',
    returnPath: { kind: 'constant', annualPercent: '10' },
  })
  expect(oneYear.endingBalancesPaise.main).toBe(110_000)
  expect(oneYear.contributedPaise).toBe(100_000)
  ```

- [ ] **Step 2: Run** `pnpm exec vitest run src/domain/calculators/wealth.test.ts src/domain/calculators/compare.test.ts`;
      expect missing modules.

- [ ] **Step 3: Implement** the named exports. `futureCost` uses
      `Decimal(todayPaise).mul(1 + inflation/100).pow(years)` then rounds to
      paise and checks safe integer. `wealthMultiple` finds the first
      within-horizon crossing for positive rates and `null` otherwise.
      `projectLumpSum` posts one contribution and dated valuation changes
      through maturity. `costOfDelay` advances the start date by original-anchor months while
      preserving the same maturity date and contribution amount/cadence.
      `retirementProjection` composes
      accumulation and the Task 4 SWP ledger, without recording the transfer
      to drawdown as an external contribution. `xirr` solves:

  ```ts
  function npv(
    rate: Decimal,
    cashFlows: readonly {
      days: number
      paise: Paise
    }[],
  ): Decimal {
    return cashFlows.reduce(
      (total, flow) =>
        total.plus(
          new Decimal(flow.paise).div(rate.plus(1).pow(new Decimal(flow.days).div(365))),
        ),
      new Decimal(0),
    )
  }
  ```

  Append the positive terminal value at `asOf`, require exactly one
  change of cash-flow sign, bracket a valid root with rate greater than
  -100%, then use bounded bisection and verify residual tolerance.
  `compareScenarios` explicitly marks different external contributions,
  withdrawals or horizons and uses the same inflation assumption/date
  for each result; it never sorts by a "best" result. The UI attaches
  XIRR using a pure `withDatedYield(result, asOf)` function exported here
  which returns a new `ScenarioResult` (no circular import from adapters).
  If the scenario ends before the comparison date, set `realEndPaise: null`
  and explain why a common-date value cannot be inferred without more
  assumptions; do not imply the earlier value remained invested.
  `withDatedYield` supplies `xirrPercent: null` if `asOf` differs from
  `result.endDate` and explains that a same-date terminal value is needed.
  Add a fast-check
  conservation property: for any safe paise contribution, transfer or
  withdrawal ledger, ending total plus withdrawals equals contributions
  plus net gain.

- [ ] **Step 4: Run** the Task 5 tests and the combined domain files with
      `pnpm exec vitest run src/domain/calculators`, then `pnpm typecheck`.

- [ ] **Step 5: Commit**:
      `git add src/domain/calculators/{wealth,compare}* &&
git commit -m "feat: compare illustrative finance scenarios" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`.

### Task 6: Mobile route and usable FD/SIP forms

**Files:** Create `src/features/calculators/{CalculatorsPage,CalculatorForm,CalculatorResult}.tsx`,
`src/features/calculators/types.ts`,
`e2e/calculators.spec.ts`; modify `src/App.tsx`, `src/app/AppShell.tsx`.

**Interfaces:** Uses `calculateFixedDeposit`, `calculateSip`, `withDatedYield`,
`rupeesToPaise`, `formatMoney`, `PageHeader`, `ScenarioResult`. The UI output
contract is:

```ts
export type CalculatorOutput =
  | { kind: 'scenario'; result: ScenarioResult }
  | { kind: 'paired'; label: string; results: readonly ScenarioResult[] }
  | { kind: 'metric'; label: string; value: string; note: string }
```

Produces a
working `/calculators` page with temporary results and labelled bank and
market assumptions. `CalculatorForm` accepts `kind`, `onCalculated(output)`
and `onError(message)`; `CalculatorResult` accepts `CalculatorOutput`.

- [ ] **Step 1: Write failing Playwright tests** in
      `e2e/calculators.spec.ts` with a local `createWorkspace` helper using the
      same onboarding fields as `e2e/app.spec.ts`. Check drawer navigation
      focuses the heading, an FD at 0% shows its principal, missing bank
      convention shows a field error and no new number, and a 12-payment SIP
      at 0% shows contribution equal to ending balance.

  ```ts
  await page.getByRole('button', { name: /More sections/u }).click()
  await page.getByRole('link', { name: 'Calculators' }).click()
  await expect(page.getByRole('heading', { name: 'Calculators' })).toBeFocused()
  await page.getByLabel('Calculator').selectOption('sip')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2027-01-01')
  await page.getByLabel('Monthly contribution').fill('1000')
  await page.getByLabel('Assumed annual return').fill('0')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText('No return is assumed')).toBeVisible()
  ```

- [ ] **Step 2: Run**
      `pnpm exec playwright test e2e/calculators.spec.ts --project=chromium-mobile --grep "navigation|deposit|SIP"`;
      expect a missing route or control.

- [ ] **Step 3: Implement** the lazy route, the `Review` drawer entry,
      `PageHeader`, FD/SIP selector, explicit input action, Zod forms and
      `CalculatorResult` summary with labelled paise values and assumptions.
      Require entered market return (0 is valid), dates, FD rest/day-count/payout
      and the SIP cadence; no suggested return value. Display domain errors
      verbatim in an error notice and Zod errors next to their fields; never
      render zero after an invalid input:

  ```tsx
  const CalculatorsPage = lazy(async () => ({
    default: (await import('./features/calculators/CalculatorsPage')).CalculatorsPage,
  }))
  // In <Routes>:
  <Route path="/calculators" element={<CalculatorsPage />} />
  // In the Review drawer group:
  { to: '/calculators', label: 'Calculators', icon: 'investment' }
  ```

- [ ] **Step 4: Run** the Step 2 Playwright command and `pnpm typecheck`;
      ensure the FD and SIP smoke scenarios show exact contributions and
      accessible, readable assumptions.

- [ ] **Step 5: Commit**:
      `git add src/App.tsx src/app/AppShell.tsx src/features/calculators e2e/calculators.spec.ts &&
git commit -m "feat: open offline deposit and SIP calculators" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`.

### Task 7: Remaining core instrument forms and dated detail

**Files:** Modify `src/features/calculators/{CalculatorForm,CalculatorResult,CalculatorsPage}.tsx`,
`e2e/calculators.spec.ts`.

**Interfaces:** Add `calculateRecurringDeposit`, `requiredGoalSip`,
`calculateStp`, `calculateSwp`, `projectLumpSum`, `wealthMultiple`,
`futureCost`, `costOfDelay`, `retirementProjection` and the existing
`calculateAccountBalances`, `requiredMonthlyForGoal` from
`src/domain/calculations.ts`. Keep the Task 6 form callbacks and result
props unchanged.

- [ ] **Step 1: Write failing Playwright tests** named `instruments ...`.
      Check that each type can be selected and that its unique control appears:
      RD `Actual instalment dates`, step-up `Increase every`, goal SIP
      `Target amount`, STP `Source fund house`, SWP `Withdrawal amount`,
      lump sum `Initial amount`, multiple `2x or 3x`, inflation `Inflation rate`,
      cost of delay `Delay (months)`, retirement `Monthly withdrawal`. For RD,
      STP and SWP run one zero-rate illustration and inspect a disclosure and
      a dated, accessible schedule:

  ```ts
  await page.getByLabel('Calculator').selectOption('swp')
  await expect(page.getByLabel('Withdrawal amount')).toBeVisible()
  await page.getByLabel('Calculator').selectOption('stp')
  await expect(page.getByLabel('Source fund house')).toBeVisible()
  await page.getByLabel('Calculator').selectOption('rd')
  await expect(page.getByLabel('Actual instalment dates')).toBeVisible()
  ```

- [ ] **Step 2: Run**
      `pnpm exec playwright test e2e/calculators.spec.ts --project=chromium-mobile --grep instruments`;
      expect the absent type-specific controls.

- [ ] **Step 3: Add** type-specific input groups with a Zod schema per
      type and dispatch to the exact domain adapter listed in Interfaces.
      For custom returns, parse local `YYYY-MM,rate` lines, show a preview
      and reject any missing covered month. For unit modes require starting
      NAV/units; for STP require the same AMC and an explicit stop/cap policy;
      for deposits require bank term and optional early-withdrawal data.
      Copy an existing goal's target/date/resolved linked balance into editable
      fields, without a write; use `requiredMonthlyForGoal` as its no-return
      baseline, not as an assumed-return formula. Show optional affordability
      context from existing cash-flow data without an approval or recommendation.
      `CalculatorForm` wraps `futureCost`/`wealthMultiple` in the UI-only
      `metric` output (displaying `null` as "Not reached", not as zero),
      wraps cost-of-delay
      pairs in `paired`, and wraps the other projections in `scenario`;
      never pretend a scalar has dated cash flows. `CalculatorResult` renders
      a collapsible dated-event `<table>` for scenario/paired outputs and labels
      first/final step-up, source/target balances, SWP depletion, money multiple
      versus XIRR, and cash received separately from corpus:

  ```tsx
  <details>
    <summary>Calculation schedule</summary>
    <table>
      <caption>Dated cash flows and illustrative changes</caption>
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Event</th>
          <th scope="col">Amount</th>
        </tr>
      </thead>
      <tbody>
        {result.events.map((event, index) => (
          <tr key={`${event.date}-${event.account}-${index}`}>
            <td>{event.date}</td>
            <td>{event.label}</td>
            <td>{formatMoney(event.deltaPaise)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </details>
  ```

  Include exact assumptions and copy: market results are hypothetical;
  bank contracts/rounding can differ; STP is a redemption and subscription;
  SWP withdrawals are not guaranteed income. State that loads, taxes and
  actual fund NAVs are excluded. Link bundled source-authority/review-date
  help, never an outbound link.

- [ ] **Step 4: Run** the Step 2 Playwright command, then
      `pnpm exec vitest run src/domain/calculators` and `pnpm typecheck`.

- [ ] **Step 5: Commit**:
      `git add src/features/calculators e2e/calculators.spec.ts &&
git commit -m "feat: expose core dated what-if tools" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`.

### Task 8: Comparisons, lifecycle, accessibility and offline gate

**Files:** Modify `src/features/calculators/{CalculatorsPage,CalculatorForm,CalculatorResult}.tsx`,
`e2e/calculators.spec.ts`, `docs/ui-standards.md`, `docs/architecture.md`.

**Interfaces:** Uses `compareScenarios`, `withDatedYield`, `ScenarioResult`
from Tasks 1/5; uses existing security lifecycle in `src/App.tsx`.
Produces two- or three-scenario comparison with no persistence.

- [ ] **Step 1: Write failing Playwright tests** named `comparison ...`,
      `lock ...`, `accessibility ...` and `offline ...`: changing any assumption
      marks the last result `Outdated`; comparisons reject outdated results;
      unequal cash flows show `Different cash flows` and no "best" badge;
      a good and a poor early-return SWP visibly differ; lock/unlock clears
      scenarios; reload offline works; axe reports no serious/critical issues;
      at 320px document width does not exceed viewport:

  ```ts
  await page.getByLabel('Monthly contribution').fill('2000')
  await expect(page.getByText('Outdated')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Compare scenarios' })).toBeDisabled()
  await page.setViewportSize({ width: 320, height: 720 })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320)
  ```

- [ ] **Step 2: Run**
      `pnpm exec playwright test e2e/calculators.spec.ts --project=chromium-mobile --grep "comparison|lock|accessibility|offline"`;
      expect unmet comparison/lifecycle behavior.

- [ ] **Step 3: Store** at most three labelled `scenario` results in
      `CalculatorsPage` local React state. On every input change mark the
      current result outdated and disable comparison until recalculation.
      On a route departure or `FinanceApplication` unmount, discard the
      state; do not use session/local storage or add a migration.
      Present comparison rows for contributed, withdrawn, end value,
      inflation-adjusted end, liquidity/depletion, and unavailable XIRR.
      Reject mismatched dates or explicitly label them without inventing
      an interim valuation. Never choose a winner or rank instruments:

  ```tsx
  <button
    type="button"
    disabled={currentOutdated || scenarios.length < 2}
    onClick={() =>
      setCompared(
        compareScenarios(
          scenarios.map((scenario) => scenario.result),
          evaluationDate,
          inflation,
        ),
      )
    }
  >
    Compare scenarios
  </button>
  ```

  Add mobile density/accessibility and calculation-boundary notes to
  `docs/ui-standards.md` and `docs/architecture.md` respectively.

- [ ] **Step 4: Run** the Step 2 Playwright selector for all three
      projects, `pnpm check`, `pnpm test:e2e`, `pnpm build:android` and
      `pnpm check:android-permissions`. Inspect the final APK manifest if
      available; any network permission is a release blocker.

- [ ] **Step 5: Commit**:
      `git add src/features/calculators e2e/calculators.spec.ts docs/ui-standards.md docs/architecture.md &&
git commit -m "feat: compare private financial scenarios" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`.

After each task, inspect its diff and only commit verified, in-scope files.
After Task 8, review the entire branch against the spec, Android offline
requirements and primary-source caveats. The separately planned government
savings, EPF/NPS, government bonds, insurance and loan modules are **not**
implemented by this core plan; start their own source-verified design/review
cycles before claiming the full requested catalogue is done.
