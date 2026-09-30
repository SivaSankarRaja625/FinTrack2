# UI standards

FinTrack uses a calm, information-first interface.

## Required qualities

- One obvious primary action per screen.
- Home puts direct expense entry and the leading actionable alert before its
  supporting lists. Activity starts with the ledger, not account management.
  Ledger date filters start at All dates and never silently change monthly totals.
- Android phone widths are the design target. The app remains a centered,
  520px-max single-column workspace on tablets and desktops, including the browser
  preview; larger displays do not introduce a separate sidebar or multi-column
  dashboard.
- Keep Home, Activity, Plan, and Worth in the persistent bottom navigation, with
  other sections in an accessible drawer. Touch targets are at least 44px and
  dialogs open as bottom sheets without hiding their actions.
- Bottom navigation links expose their visible labels to assistive technology.
  Dismissing the drawer restores focus to its opener; selecting a section moves
  focus to the destination heading, including after a section finishes loading.
- Neutral surfaces, one teal accent, semantic status colors, and tabular numerals.
- A shared spacing/type/radius scale and consistent alignment.
- Light, dark, and system themes with WCAG AA contrast.
- Use scannable, labelled rows for day-to-day records on all screens. Dense
  analytical or import tables may scroll horizontally inside their section,
  without scrolling the page itself.
- Exact totals beside charts and a text/table alternative for every chart.
- Worth starts with the total and composition, with dated history below records.
  Manual valuations and recurring entries use name/amount rows rather than
  horizontally hidden amounts. Reports keeps period controls and bars together;
  View values retains the exact interval table.
- Analytical tables use a labelled, keyboard-focusable scroll region. Dialogs
  skip collapsed controls when trapping focus and keep the current field focused
  during ordinary rerenders.
- Purposeful empty, locked, loading, error, permission, and restore states.
- Transaction entry starts with Amount. Notes, splits, and cleared status live
  under More details; collapsing the group retains input and validation reveals
  the affected field before focusing it.
- Policy forms distinguish basic terms and real premium dates from optional
  coverage and nominee/claim details. Existing details remain editable, and
  validation opens the relevant section without clearing it.
- Direct copy that explains the consequence and recovery action.
- Complete backup creation leads to reopening the saved file for verification.
  Pending export/share status is never a saved-file claim; verification failures
  remain actionable, and destructive restore is a separate disclosure.
- In calculators, distinguish contractual bank terms from hypothetical market
  paths. Show entered assumptions, dated external money, transfers, withdrawals,
  possible corpus depletion and an accessible schedule; label stale results
  after an input changes.
- After calculation, focus the result and collapse rather than discard its
  assumptions. Change calculator exposes the picker on demand. Only comparable
  results offer Add scenario; previously saved scenarios stay accessible.
- Compare at a common evaluation date and label the shared purchasing-power
  base date; show differences in funding, not a "best investment" badge. Use
  editable copies of goals without changing saved records. Never prefill an
  assumed investment return as a recommendation.

## Financial visualizations

- Forecast and valuation charts space observations by calendar date, not row
  number. Forecast cash movements use steps; valuation points connect recorded
  observations. Axes retain readable phone-size text, and View values exposes
  every exact amount and date, including multiple observations on one date.

- Reports show income and expenses on a shared zero-based scale for each
  recorded day or financial-year month. Interval buttons work by touch and
  keyboard; the selected interval exposes exact income, expenses, net flow,
  and source transactions. Keep the exact-value table alongside the chart;
  transfers and adjustments are not cash flow.
- Net-worth composition uses the calculated included totals, with positive
  components and deductions on one scale. Negative cash is a deduction, not an
  asset. Selected components show exact amounts; mark included holdings with
  prices older than 30 days and manual valuations older than 90 days on their
  pickers, with names and dates in the detail. Do not call undated account or
  loan balances fresh valuations.
- Loan prepayment comparisons start at EMI 0 and show remaining principal for
  the same EMI number in both scenarios. The selector provides exact balances;
  once prepaid principal reaches zero, show zero without inventing more EMIs.
  Keep the repayment schedules as exact-value alternatives. Do not imply a
  payoff calendar date without a user-provided start date.

## Prohibited patterns

- Decorative gradients, glass effects, excessive shadows, nested cards, or repeated
  dashboard tiles with no decision value.
- Generic slogans, fake “insights,” invented production data, unexplained scores,
  emojis as controls, and filler prose.
- Motion that delays work or ignores reduced-motion settings.
- Charts that do not answer a user question.
- AI-generated runtime text or financial advice.

Feature review uses real long labels, large INR values, zero/negative values,
320px and regular phone widths, desktop preview, keyboard-only use, and both color
themes. Screenshot baselines are reviewed rather than blindly regenerated.

Functional browser tests assert exact amounts under their metric labels and in
repayment/cash-flow rows, using independently calculated fixtures rather than
calling production calculators for expected values. Cover edits, transfers,
missed instalments, charges, rate changes, filtered reports, and restored balances;
finding a currency string somewhere on the page is not sufficient verification.
Layout and accessibility assertions supplement these financial checks.

## Connected financial records

- Current loan payments, premiums and investment activity explicitly create or
  match a cash entry. Historical-only mode is an explicit warning-bearing choice,
  not a silent default. A matched statement entry is not posted a second time.
- Principal plus loan prepayment cannot exceed live outstanding. Goals may share
  an account through explicit fixed allocations and at most one goal following
  the unallocated remainder. New allocations cannot exceed available cash; if
  cash later falls, priority then creation order determines funded amounts and
  visible shortfalls. Legacy duplicate full-balance links require review.
- Post or match scheduled occurrences in Plan. Suspected duplicate schedules or
  already-posted cash require review before displaying a reliable forecast.
  Loan EMIs, premiums and confirmed deposit payouts are included; hypothetical
  loan prepayments and unconfirmed renewals are not cash inflows.
- Receivable settlement reduces the asset while crediting cash. Reimbursements
  offset expense in the receipt period, including original split categories,
  without rewriting old periods or treating refunds as earned income.
- Deposit terms are user-confirmed amounts and dates, not assumed product rates.
  Maturity clears the carrying value; principal is a capital movement and cash
  interest is income. Renewal or unknown instructions do not forecast principal payout.
- Linked cash cannot be edited separately. Undo is conditional on unchanged
  financial state and restores original matched entries. Finalizing links keeps
  real cash history while permitting source corrections; source deletion never
  silently removes bank transactions. Imports flag likely matches to linked cash.
