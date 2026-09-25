# Backup formats

## Complete `.finapp` export

The manual export is a JSON envelope containing:

- magic: `FINTRACK-BACKUP`
- format and data schema versions
- creation time and app version
- Argon2id salt and parameters
- AES-GCM nonce
- base64 ciphertext

The authenticated ciphertext contains compressed JSON records, settings, and
base64 attachment bytes. Import authenticates before parsing, validates every
record and relation, stages migrations, and replaces live data only after the
complete payload is valid.

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
