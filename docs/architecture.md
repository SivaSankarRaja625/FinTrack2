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

## Runtime profiles

The browser build is an installable offline PWA for local or optional static use.
The production Android build excludes the service worker, bundles all assets, and
has no network permission. App updates are external package replacements.

## Data upgrades

Dexie upgrades structural stores. Business-payload migrations run after unlock,
because payloads are encrypted. Migrations are ordered, idempotent, tested against
released fixtures, and complete before the current UI can write data.
