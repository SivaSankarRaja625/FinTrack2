# Calculator research (not an approved design)

Research snapshot: 25 September 2026. FinTrack is an offline personal-finance
application, not a broker, bank, tax adviser, or source of live rates. The catalogue
below identifies useful _illustrative_ calculations; it does not endorse products
or authorize implementation. All proposed returns, inflation rates, fees, dates,
and bank terms must come from the user or from a clearly dated, bundled reference,
never a runtime network request.

## Candidate calculators

- **Bank deposits:** FD maturity, cumulative versus periodic interest,
  effective annual yield, and premature-withdrawal what-if; RD maturity and
  interest on each dated instalment. Bank-specific rates, dates, compounding,
  payouts, and penalties matter. An RD is not an FD opened with all instalments
  on day one. Deposit insurance is not a separate ₹5 lakh allowance for each FD.
- **Mutual-fund accumulation:** SIP contributions versus illustrative corpus;
  step-up SIP with annual instalment increases; and the contribution required
  for a dated goal. A constant assumed return is a scenario, not a forecast.
  Show the contribution dates, step-up date, and gross versus after-fee assumptions.
  Actual top-up SIP eligibility and minimum increments depend on the fund house.
- **Mutual-fund transfers and drawdown:** STP balances and cash flows in _both_
  source and destination funds; SWP cumulative withdrawals, remaining
  units/corpus, and possible depletion date under variable-return scenarios.
  SEBI describes STP as a redemption from one scheme followed by subscription
  into another scheme of the same mutual fund. STP moves existing money; it is
  not a new contribution. SWP can redeem a fixed amount or a fixed number of
  units; it is a withdrawal, not automatically profit. NAV changes, exit loads,
  and taxes affect outcomes.
- **Time value and goals:** Lump-sum compound growth; time to 2x/3x at an
  _assumed_ rate; inflation-adjusted purchasing power; cost of delay; goal
  contributions; and retirement accumulation/drawdown. For recurring
  investments, corpus divided by total contributions is **not** an annualized
  return. Label money multiples separately from date-based return measures.
- **Government savings and pensions (later rule-specific research):** PPF, NSC,
  KVP, SCSS, Sukanya Samriddhi, post-office time/recurring deposits, EPF/VPF,
  and NPS. Eligibility, deposit limits, credit dates, payout/compounding, tax,
  and exit rules differ. Use Ministry of Finance/India Post, EPFO, and PFRDA
  primary rules; SEBI and RBI are not the sole authorities. Today's rate is not
  a promise for a long-term account.
- **Bonds (later):** Treasury-bill discount yield and dated government-security
  coupon cash flows and yield to maturity using price and settlement date.
  Coupon rate, current yield, and yield to maturity differ. Early sale exposes
  the holder to price risk; reinvesting coupons at the same rate is not assured.
- **Protection and debt (later):** Term-insurance cover gap, loan prepayment
  versus scheduled interest saved, debt-to-income, and emergency-fund runway.
  Insurance cover is not an asset or investment return. A loan-prepayment
  scenario needs changed term or EMI, fees, and liquidity. FinTrack already
  calculates baseline EMI schedules.
- **Existing FinTrack tools:** Loan EMI/schedule, goal contributions, net-worth
  composition/history, and cash-flow forecast. Extend or link these instead
  of publishing duplicate calculators with conflicting formulas.

### Verification and comparison principles

- Compare scenarios with the **same horizon and dated net cash flows**. Show the
  inputs, schedule, total contributed, total withdrawn, nominal end value, and
  inflation-adjusted value separately; expose the assumed fee and tax treatment.
  Never sort products by an invented “best opportunity” score, recommend a
  specific security, or imply guaranteed wealth creation. SEBI describes
  tailored investment advice as a distinct activity.
- A money multiple answers “how many times the cash put in?”; annualized return
  answers a different question. For dated irregular cash flows, use a carefully
  validated date-based return calculation only when a meaningful solution exists.
  Identify STP transfers so capital is not counted twice.
- For market-linked illustrations, let the user compare more than one explicitly
  hypothetical path, including poor early returns during SWP. Show when a plan
  runs out of money rather than allowing negative holdings. Keep actual balances
  and hypothetical projections clearly separate. Do not mistake AMFI's 2023
  guidance on **AMC promotional material** (which discusses selectable
  illustrative returns of 2%–13%) for a guarantee, live market forecast, or a
  statutory bound on every private what-if calculation. Downside and zero-return
  scenarios remain important for an independent educational tool.
- Do not present "gross interest minus TDS" as an after-tax return: withholding
  is not the user's final tax liability. Tax effects belong in a separately
  verified, dated set of assumptions rather than a baked-in tax rate.
- Preserve the app's existing integer-paise storage and decimal arithmetic.
  Scheme-specific day counts, instalment dates, rounding, payout frequency, and
  cash-flow direction need explicit tests against the applicable primary rules.
- RBI's 2025 commercial-bank deposit directions expressly **exclude** small
  finance banks, payments banks, regional rural banks and local area banks from
  that direction's definition of "commercial banks." Do not apply a rule pack
  from one bank category to all institutions or freeze a dynamic rule into an
  unversioned generic calculation. Banks set their own card rates and premature
  withdrawal penalties; use the user's actual contract to verify an FD/RD
  result.

## Primary references checked

- [SEBI Investor calculator index](https://investor.sebi.gov.in/calculators/index.html):
  lists future value, bond yield, SIP and goal SIP, inflation, increasing
  contributions, retirement, compounding, cost of delay, net worth, and annuity
  illustrations. This is a source of _topics_, not a specification for copying
  a third-party calculator.
- [SEBI SIP calculator](https://investor.sebi.gov.in/calculators/sip_calculator.html)
  and [Goal SIP calculator](https://investor.sebi.gov.in/calculators/goal_sip_calculator.html):
  identify contributions, duration, and expected annual return as scenario
  inputs. SEBI explicitly says its illustrations do not represent actual returns
  and that stock-market returns cannot be predicted.
- [SEBI Increasing Contribution calculator](https://investor.sebi.gov.in/calculators/Increasing_Contribution_Calculator.html):
  uses an initial monthly contribution and annual percentage change; an
  appropriate reference for a step-up _scenario_, not evidence of a fixed return.
- [SEBI Inflation calculator](https://investor.sebi.gov.in/calculators/inflation_calculator.html):
  illustrates future expenses using current expenses, an assumed annual inflation
  rate, and a chosen horizon.
- [SEBI July 2026 circular on demat SWP/STP standing instructions](https://www.sebi.gov.in/legal/circulars/jul-2026/extending-facility-of-creating-standing-instructions-for-systematic-withdrawal-plan-swp-systematic-transfer-plan-stp-for-mutual-fund-units-held-in-demat-form_102914.html):
  describes periodic redemptions for SWP and the redemption/subscription legs
  of an STP between schemes of the same mutual fund. Distinguishes unit-based
  from amount-based standing instructions; this circular addresses units held
  in demat form, not a universal scheme-specific transaction timetable.
- [AMFI Best Practices Guidelines Circular 109 (1 November 2023)](https://portal.amfiindia.com/spages/CU148-AMFI%20BP%20cir%20109%20dt.%2001-Nov-23-Usage%20of%20illustrations%20for%20depicting%20future%20returns.pdf):
  permits member AMCs to use general educational SIP/STP/SWP compounding
  illustrations under explicit limits and warnings, but not to illustrate future
  returns for a specific mutual-fund scheme. Treat its audience and date
  carefully; do not present its historical benchmark rates as current returns.
- [SEBI investor guide to investment advisers](https://investor.sebi.gov.in/investment_advisor.html):
  distinguishes advice tailored to a person's goals and risk tolerance from an
  educational calculation; personalized product recommendations would need a
  separate regulatory review.
- [RBI Commercial Banks – Interest Rate on Deposits Directions, 2025](https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=13157)
  (updated 25 August 2026): defines recurring and reinvestment deposits as term
  deposits; sets a seven-day minimum tenor for the commercial banks it covers;
  says premature withdrawal interest uses the rate applicable to the amount and
  time actually held, not the original contracted rate; requires board-approved
  penalty policies. It is **not** a universal bank interest-rate table.
- [RBI domestic-deposit FAQ](https://www.rbi.org.in/commonman/english/scripts/FAQs.aspx?Id=325):
  explains quarterly term-deposit interest and discounted monthly payouts as
  banking practice. This older FAQ is useful background, not a substitute for
  a current bank's specific payout, day-count or compounding terms.
- [RBI guide to DICGC deposit insurance](https://www.rbi.org.in/SCRIPTs/FAQView.aspx?Id=64):
  up to ₹5 lakh **including principal and interest**, aggregated across
  deposits at the same bank held by one depositor in the same right and capacity.
  Different banks are considered separately. The current app's free-text
  institution names and account owners are not enough for a reliable personal
  insurance-limit calculation.
- [RBI Government Securities Market primer](https://www.rbi.org.in/Scripts/FAQView.aspx?Id=79):
  explains T-bills issued at a discount and redeemed at face value, dated
  securities' coupons, and the distinction between instruments. Its own disclaimer
  directs readers to current circulars; examples in the primer are not live rates.
- [India Post savings schemes](https://www.indiapost.gov.in/banking-services/savings),
  [PFRDA NPS FAQ](https://www.pfrda.org.in/web/pfrda/w/faqs/corporate-model),
  and [SEBI investor education](https://investor.sebi.gov.in/iematerial.html)
  identify authorities to consult for future scheme-specific rules. Verify current
  eligibility, rates, limits and exit rules at implementation time.

The first design decision is breadth: a reliable initial set of FD, RD, SIP,
step-up SIP, STP, SWP and general goal/growth scenarios, or a wider first release
with separately maintained, source-versioned government/pension rule packs.
The user has not approved a design or implementation plan.
