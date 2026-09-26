# Backup formats

## Complete `.finapp` export

The manual export is a JSON envelope containing:

- magic: `FINTRACK-BACKUP`
- format version and app version (unencrypted header)
- public creation time (informational only, **not authenticated**)
- Argon2id salt and parameters
- AES-GCM nonce
- base64 ciphertext

The authenticated ciphertext contains compressed JSON records, settings, base64
attachment bytes, the data schema version, and (from data schema v2) an authenticated
creation timestamp. The format version remains 1. Data-schema-v1 backups remain
readable, but their public timestamp cannot be trusted to prove freshness. Older
builds must reject newer data schemas rather than silently discard new fields.

Import authenticates before parsing, validates every record and relation, stages
migrations, and replaces live data only after the complete payload is valid. A
manually exported file is not considered saved just because encryption or a share
sheet completed. Reopening it under Settings authenticates its PIN, validates
records and document metadata without restoring, and checks the original
profile ID and creation date against the current workspace before recording its
authenticated creation date. The creation date also distinguishes pre-UUID
workspaces whose profile IDs were all `profile`. A future-dated, old, or legacy
undated file does not silence
freshness reminders. Before destructive restore the user must export a safety
backup, reselect the **same saved bytes**, and authenticate them with the safety
PIN; only then is replacement permitted. Store saved files separately from the
device and guard both PINs.

Restore clears backup-verification and local-notification catch-up history from
the imported device: the new installation cannot claim the old device checked a
file or delivered a notification. The Android snapshot's old “prepared” timestamp
is also cleared until a new local snapshot is written.

## Android system snapshot

The system snapshot contains the existing encrypted structured-record envelopes and
PIN-wrapped data key. It excludes attachments and device-specific state. Android
backup rules whitelist only `files/system-backup/finance.snapshot`; raw WebView data
is not eligible. The app displays the time the snapshot was prepared, never an
unverifiable “uploaded” status.

On a clean installation, the restored file remains outside the live database until
the user enters the app PIN. FinTrack imports it into a temporary database,
authenticates the wrapped key and every encrypted record, validates schemas and
relations, strips attachment references, and only then commits the checked rows.
Wrong PINs and malformed snapshots leave the installation empty and retryable.

Android 12+ cloud transport is disabled when encryption capabilities are
unavailable. The legacy rule requires `clientSideEncryption`. Device-to-device
transfer is separately allowed for the same single snapshot file.

Format versions are independent of the Dexie schema version. Released compatibility
fixtures must never be deleted.
