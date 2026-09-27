# Architecture

FinTrack is a single strict-TypeScript application with a responsive React UI and a
Capacitor Android host. Domain calculations are pure and import no React, Dexie,
browser, or Capacitor APIs.

## Boundaries

- `domain` owns entities, value rules, calculations, and alert evaluation.
- `data` owns encrypted records, schema migrations, attachments, and backup formats.
- `platform` owns lifecycle, local notifications, downloads, and Android system
  backup.
- `features` composes domain services into user workflows.
- `ui` contains source-owned primitives, tokens, icons, charts, and layout.

Features access data through `FinanceContext` and typed repository methods; only the
data layer accesses Dexie.
Persisted business records use stable IDs and schema-versioned encrypted envelopes.
Money is integer paise. Fractional units and rates use decimal arithmetic.

## Illustrative calculators

`src/domain/calculators` is a pure, date-based cash-flow module. Bank deposit
adapters take the user's nominal rate, payout and day-count terms; market
adapters take an explicit assumed return path. Internal STP transfers move
money between scenario accounts without creating new contributions. The shared
ledger exposes dated events, external cash flows, gains, balances and warnings;
comparisons use the same evaluation date, express inflation-adjusted values
in the earliest scenario start date's rupees, and do not rank products.

`/calculators` is lazy-loaded under More. Inputs and comparisons exist only in
React memory and disappear when the application locks or leaves the screen.
They do not add an encrypted database schema, backup content, live market
data, or Android permissions. Scheme-specific government savings, pensions,
bonds, protection and debt calculations require separate verified rule packs.

## Runtime profiles

The browser build is an installable offline PWA for local or optional static use.
The production Android build excludes the service worker, bundles all assets, and
has no network permission. App updates are external package replacements.

## Data upgrades

Dexie upgrades structural stores. The current encrypted-data schema is 2.
After authenticating the PIN, an installation with schema 1 validates all
records and document relationships, then atomically advances the metadata
marker to 2 without rewriting the encrypted rows or attachments. Android
system snapshots are validated and promoted while staged, before import.
Unsupported newer or invalid schema markers block unlock without modifying
data. Future **breaking** schema changes require an ordered, tested migration
before incrementing this marker; treating an older schema as already current
would strand users after an in-place APK update.
