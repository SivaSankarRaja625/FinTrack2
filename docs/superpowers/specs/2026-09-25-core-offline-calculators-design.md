# Offline calculators: core design

**Status:** Proposed written specification for review, 25 September 2026.
**Parent research:** [Calculator research](../../calculator-research.md).

## Intent and boundaries

FinTrack's user is an Indian working professional who wants to check how
contributions, deposits, transfers, withdrawals and inflation could affect
financial goals. Success means the user can reproduce each illustrated result
from its inputs and dated cash flows, compare like-for-like scenarios, and spot
unaffordable contributions or a possible corpus shortfall without mistaking a
projection for a product recommendation.

The user approved a phased direction that includes **both** the initial and
later calculator families. This specification covers the shared calculation
foundation and the initial FD, RD, SIP, step-up SIP, STP, SWP, goal and
wealth-multiple tools. Government savings, pensions, bonds, protection and debt
are committed scope for **subsequent, separately reviewed rule-pack designs**:
their eligibility, rate history, tax and exit rules cannot safely be inferred
from a generic compound-interest formula. They must not be advertised as
implemented when this first module ships.

Calculators are private, offline, educational what-if tools. They do not fetch
rates, NAVs, government notifications or product data, execute transactions,
recommend specific securities, rank products by expected return, or compute
personal tax liability. The app retains no network permission.

## Alternatives and decision

1. **Shared cash-flow engine with small, typed instrument adapters (selected):**
   one date/money convention and comparison contract; each product supplies its
   schedule and rules. Enables staged delivery without contradictory arithmetic.
2. **Independent one-off formulas for every instrument:** quick to demo but
   prone to inconsistent rounding, compounding and double-counted transfers.
3. **General-purpose cash-flow spreadsheet:** flexible but demanding on a
   phone and unable to explain scheme-specific assumptions by default.

The selected approach fits FinTrack's existing pure `src/domain` calculations,
integer-paise amounts, decimal arithmetic and phone-first React navigation.

## Components and contracts

- `src/domain/calculators/` owns validated input types, a date-based schedule
  engine, per-instrument adapters and a comparison service. It imports no React,
  storage, browser APIs or Capacitor. Existing `money.ts`, `dates.ts` and EMI/goal
  calculations remain authoritative; do not duplicate their behavior.
- Each adapter accepts explicit inputs and produces a common result: assumption
  summary with rate convention and start/end dates, dated events with external
  contribution/withdrawal versus internal transfer/interest/fee classification,
  amounts contributed and withdrawn, end balance, gains or interest, optional
  XIRR, warnings, and a reproducible calculation version. A domain error names
  the invalid field or unsupported case; it never returns a success-shaped zero.
- An event belongs to one or more named scenario accounts. A transfer debits
  one and credits another but contributes **zero** external capital. Cash flows
  retain full `Decimal` precision between posting boundaries, rounding to
  integer paise when interest is credited, a fee charged, units transacted, or
  money paid. Validate every displayed and persisted amount as a safe integer.
- All calculators accept dates in local `yyyy-MM-dd`, not UTC instants. Monthly
  schedules derive each due date from the original start date and the event
  index, clamping end-of-month dates explicitly to avoid drift. They reject
  inverted dates, unbounded horizons, unsafe amounts, non-finite rates,
  impossible withdrawals and malformed day-count settings. A supported horizon
  of up to 60 years limits event volume without excluding long careers.
- An assumed **effective annual** market return converts to period growth
  consistently. The return path is either one explicitly entered effective
  annual rate or a dated sequence of user-entered monthly rates; missing periods
  are errors, not silently filled. Unit-based cases keep units as validated
  decimal strings. FD/RD instead use the entered **nominal annual bank rate**
  and the selected contract's compounding, payout and day-count rules. The UI
  names the convention and payment timing; a constant market return is
  explicitly illustrative and never called a forecast.

## Initial instruments

### Deposits

- **FD:** principal, open/maturity dates, annual contracted rate, cumulative
  or periodic payout, compounding interval and day-count convention as specified
  by the bank. Show dated interest credits/payouts, maturity or payouts plus
  principal, total interest and effective annual yield. For a non-cumulative
  FD, compute any annualized yield from the dated payouts without assuming
  they were reinvested. Early-withdrawal what-if requests the bank's rate for
  the actual holding period and disclosed penalty; it does not reuse the
  original rate or invent a universal penalty.
  Where bank terms cannot be represented, show "cannot reproduce this bank's
  quote" and the missing input, not an apparently exact maturity amount.
- **RD:** instalment amount, schedule, deposit date, end date, rate and bank
  credit rules. Calculate interest from **each** instalment's own date; show all
  contributions, accrued interest and maturity. Missed or delayed instalments
  are explicit inputs, never silently filled or assumed paid.

### Mutual-fund illustrations

- **SIP/goal SIP:** amount, frequency, start/end dates, instalment timing and
  user-supplied return path. Show nominal invested capital, illustrative end
  value, gain and dated schedule; invert the same engine to find a required
  contribution for an inflation-adjusted goal. If a zero/negative return or
  cash-flow constraint makes the goal impossible, state that explicitly.
- **Step-up SIP:** increment by percentage or fixed amount at a chosen annual
  or half-yearly boundary. Show the first and final instalment and the cash
  needed at each step; validate affordability only against the user's locally
  entered budget if they elect to use it. It is a what-if, not proof that an
  AMC will accept a particular top-up mandate.
- **STP:** starting source investment, source and target return paths,
  amount- or unit-based transfer, cadence and end date. Unit-based mode
  additionally requires starting NAV and units for the source and a target
  NAV; use decimal units and each date's simulated NAV for subscriptions.
  Each movement is a redemption from the source and subscription into the
  target, within the same simulated fund house. Show both balances and the
  combined total. Stop or cap transfers only according to an explicit user
  choice when source funds are insufficient. Loads and tax consequences are
  disclosed but tax is not calculated.
- **SWP:** starting capital or starting units and NAV, fixed amount or units
  withdrawn, cadence, inflation escalation and illustrative return path.
  Display cash received separately from end balance, and the first date the
  requested withdrawal cannot be met. Include a poor-early-returns scenario
  to reveal sequence risk. Never show negative units or suggest payouts are
  guaranteed income or profit.

### Wealth and goals

- **Lump-sum growth and wealth multiple:** at an assumed rate, calculate dated
  projected balances and time to a 2x/3x target; if no finite crossing occurs
  within the supported horizon, say "not reached." Show end value, external
  money paid in, gain and a separately labelled money multiple. Do not treat
  that multiple as an annualized return on periodic contributions.
- **Inflation, cost of delay and retirement:** adjust a chosen goal/expense
  by user-supplied inflation; compare starting now versus a stated delay using
  the _same_ horizon and contribution budget; show accumulation and planned
  withdrawals with an explicit depletion condition. Link to existing Goals
  calculations rather than writing a second current-balance formula.

## Comparison, presentation and storage

Add a lazy `/calculators` destination under **More**, retaining the four
bottom tabs. The screen groups tools by purpose, not by a grid of promotional
tiles. Each tool has one primary action: edit assumptions or compare. A
collapsible schedule explains each result, with a text table as the accessible
alternative to any chart. Use the existing INR formatting, screen-reader
heading focus, theme and 320px phone constraints.

Compare two or three user-created scenarios at a common evaluation date.
Show differences in total external contributions, withdrawals, end value,
inflation-adjusted value, liquidity and explicit risk caveats. Where funding
or horizons differ, label the comparison "different cash flows" rather than
claiming the larger end balance is the better choice. Display XIRR only for
dated cash flows with a unique, meaningful solution; otherwise explain why it
is unavailable. Do not auto-select a product or give a "best investment" badge.

Inputs and comparisons remain in in-memory UI state initially, cleared on app
lock; no plaintext browser storage, database migration, system-backup change or
export change. Users may opt to import an existing local goal's target, date
and balance as **editable copies**, never silently alter the actual goal.
Saving named comparisons for later sessions is a separate encrypted-data
design, including backup and migration, and is not part of this first module.

The help text bundled with the app names the source authority and review date
for rules; no calculator opens an external site or retrieves live rates. An
explicit disclosure distinguishes market scenarios from FD/RD contractual
illustrations, and shows that actual taxes, loads and bank rounding may differ.
Do not turn TDS withholding into a supposed final after-tax return.

## Error handling and verification

Form validation identifies the specific field and preserves previous results
as visibly **outdated** until recalculated; it never reuses a stale number as
if it came from new inputs. An out-of-range horizon, missing bank convention,
ambiguous XIRR, unsupported rule or depleted corpus has a clear explanatory
state. No broad catches or silent defaults conceal financial errors.

Unit tests cover exact dated schedules and identities (external contributions
minus withdrawals plus gains equals total ending value across accounts),
zero/negative/very large rates and amounts, 29 February, 31st-of-month,
quarterly payout versus capitalization, RD instalment timing, SIP step-up
boundaries, STP source/target conservation, SWP depletion and early losses,
money-multiple versus XIRR, and non-solvable goals. Property-based tests
exercise rounding and conservation; known examples are independently derived
from documented conventions rather than copied from a third-party script.
Playwright checks phone navigation, label/focus accessibility, assumption
editing, comparisons, offline reload, lock clearing, and 320px overflow.
Build, offline-policy and final Android permission checks must remain green.

## Later modules, in committed scope but separate designs

1. **Government small savings:** PPF, NSC, KVP, SCSS, Sukanya Samriddhi,
   post-office time/recurring deposits. Verify current Ministry of Finance,
   National Savings Institute and India Post primary rules per scheme: rate
   periods, contribution limits, dates, compounding versus payouts, eligibility
   and early exit. A quarterly rate change must not retroactively alter fixed
   tranches. No unreviewed static rate is presented as current.
2. **Workplace and personal pensions:** EPF/VPF via EPFO sources; NPS via
   PFRDA/NPS Trust rules. Model contributions, source-specific interest or NAV
   assumptions, annuity versus lump-sum paths and current exit limits only
   after the exact applicable subscriber type and rule version are verified.
3. **Debt securities:** T-bill discount yield and government-bond coupon
   cash flows, purchase price, settlement date, accrued interest, yield to
   maturity and early-sale price risk, referencing RBI's government-securities
   primer and current security terms. Coupon does not equal yield.
4. **Protection and debt decisions:** insurance coverage-gap estimator (not
   investment growth), loan prepayment versus interest saved (reusing the
   current EMI schedule), debt-to-income and emergency-fund runway. These
   require different inputs and must not be sold as yield comparisons.

Each group gets its own narrowly scoped written spec, source-date review,
implementation plan and tests **before** its code is built. This ordering is
necessary to deliver the requested later calculators without presenting
outdated regulatory rules as validated results. The core engine must not embed
product-specific rates or limits from those future groups.
