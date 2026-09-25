# FinTrack

FinTrack is a private, offline-first personal finance manager for a single user in
India. It tracks accounts, transactions, budgets, cash flow, net worth, loans,
investments, insurance, documents, goals, and deterministic alerts.
The interface is designed for Android phones first; a wider browser or tablet
centers the same compact app rather than expanding into a desktop dashboard.

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

Quality checks:

```sh
pnpm check
pnpm test:e2e
```

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
