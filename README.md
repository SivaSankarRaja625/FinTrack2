# FinTrack

FinTrack is a private, offline-first personal finance manager for a single user in
India. It tracks accounts, transactions, budgets, cash flow, net worth, loans,
investments, insurance, documents, goals, and deterministic alerts.
Add credit cards under **Loans & credit** to record their last four digits, credit
limit, statement day, and payment due day. Card balances come from the account
ledger: enter an amount owed as a negative opening balance and record payments
as transfers, not income. Cycle days are informational; check the latest statement
for the actual due amount and date.
The interface is designed for Android phones first; a wider browser or tablet
centers the same compact app rather than expanding into a desktop dashboard.
The **Calculators** section under More offers local what-if illustrations for
bank deposits, investment contributions, transfers, withdrawals and financial
goals, plus PPF and SCSS government savings, RBI floating-rate savings bonds,
life-cover needs and reducing-loan prepayment. Choose a category, then a calculator to show its inputs. Rates and
bank terms are entered by the user; market scenarios are not forecasts.
Government savings rates are **not** live: PPF applies the entered annual rate to
future quarters unless you enter overrides, while SCSS fixes the opening-date
rate for the modelled five years. PPF credits interest each March 31 on the
monthly fifth-day eligible balance; SCSS pays interest separately each calendar
quarter without compounding. RBI floating bond coupons use the entered NSC
benchmark plus 0.35 percentage points, reset each January and July (the first
coupon paid in January 2021 was fixed at 7.15%); future
benchmarks must be entered rather than fetched. For payments from 2 April 2026,
partial bond coupons use RBI's 30/360 convention (the treatment of month-ends is
stated in the result); older broken periods use an illustrative day-count
assumption. Bond purchases require ₹1,000 face-value multiples. These tools do not check eligibility,
other accounts, tax, early exit, or extension. The 2019 PPF and SCSS rule packs
reject earlier account openings; SCSS applies the ₹15 lakh limit to openings
before 1 April 2023 and ₹30 lakh thereafter. Loan prepayment models monthly reducing interest,
not daily lender accrual; any disclosed prepayment fee must be entered. Term
cover needs are illustrative, not a suggested product or underwriting result.
Saved comparison scenarios remain available while switching calculators, but
inputs and comparisons are cleared when the screen is left or the app locks and
do not become saved financial records.

The scheme rules were reviewed on 25 September 2026 against the
[Public Provident Fund Scheme, 2019](https://www.indiapost.gov.in/documents/offerings/schemesandservices/posb/PublicProvidentFundScheme2019English.pdf)
(paragraphs 4, 7, 11) and the
[Senior Citizens Savings Scheme, 2019](https://www.indiapost.gov.in/documents/offerings/schemesandservices/posb/SeniorCitizensSavingsScheme2019English.pdf)
(paragraphs 4, 5, 7; deposit limit amended in 2023).
Bond resets, seven-year tenure and non-cumulative payouts follow the
[RBI FRSB 2020 (Taxable) revised operational guidelines of 2 April 2026](https://www.rbi.org.in/Scripts/BS_CircularIndexDisplay.aspx?Id=13365),
sections 4–7, which supersede the 2020 operating instructions and explicitly
specify 30/360. The month-end variant used for broken periods is disclosed in
the calculator.
The [RBI Pre-payment Charges on Loans Directions, 2025](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12878)
apply to qualifying loans sanctioned or renewed from 1 January 2026; the
calculator does not determine eligibility for the no-charge rule. NPS exit
calculations are deferred pending an authenticated primary source for the
December 2025 changes; the existing generic retirement drawdown illustration
does not apply NPS exit rules.

## Privacy model

- The Android application has no internet or network-state permission.
- All runtime assets are bundled; there are no remote fonts, analytics, telemetry,
  account registration, or API calls.
- Structured records and attachments are encrypted before local persistence.
- Complete backups are exported as PIN-encrypted `.finapp` files.
- Android system backup is optional and includes only an encrypted structured-data
  snapshot when device-lock-backed backup encryption is available.

Google Play or the device package installer handles application updates outside the
app process.

## Development

Requirements:

- Node.js 20.19 or later
- pnpm 10.17.1
- Java 21 and an Android SDK for Android builds

```sh
pnpm install
pnpm dev
```

Run all quality checks locally before pushing or tagging:

```sh
pnpm check
pnpm test:e2e
```

GitHub Actions does not run lint, unit, or Playwright tests. A push to `main` or
a pull request builds and uploads an installable **debug APK** for review. Its
temporary debug signing key may change between runs, so it is not an updatable
production release. The tag/manual release workflow produces signed APK/AAB
artifacts after local checks; Android builds still compile the app and inspect
packaged permissions.

Android debug artifact:

```sh
pnpm android:build:debug
```

The Android build script compiles the web bundle in Capacitor mode, which excludes
the browser service worker. `pnpm android:verify:release` builds APK/AAB outputs and
inspects the merged manifest, backup allowlist, file-sharing boundary, and final APK;
it fails if a network, package-install, or exact-alarm permission appears. See
`docs/release.md` for signing and artifact workflow details.

## Project structure

- `src/domain`: framework-independent finance types and calculations
- `src/data`: encrypted IndexedDB, backup, and migration code
- `src/platform`: Capacitor/browser adapters
- `src/features`: route-level finance features
- `src/ui`: source-owned components and design tokens
- `android`: Capacitor Android project
- `docs`: architecture, privacy, backup, UI, and release decisions

Financial calculations are informational and are not investment, insurance, tax, or
legal advice.
