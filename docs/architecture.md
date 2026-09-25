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

Dexie upgrades structural stores. Business-payload migrations run after unlock,
because payloads are encrypted. Migrations are ordered, idempotent, tested against
released fixtures, and complete before the current UI can write data.
