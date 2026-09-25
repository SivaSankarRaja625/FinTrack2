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
goals. Choose a category, then a calculator to show its inputs. Rates and bank
terms are entered by the user; market scenarios are not forecasts. Saved
comparison scenarios remain available while switching calculators, but inputs
and comparisons are cleared when the screen is left or the app locks and do not
become saved financial records.

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
