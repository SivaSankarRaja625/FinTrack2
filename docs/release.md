# Release policy

Every release must pass:

1. Formatting, lint, strict TypeScript, offline policy, unit/component tests, and
   production builds.
2. Browser workflows at phone and desktop widths, accessibility checks, and reviewed
   visual changes.
3. Android installation, lock/unlock, persistence, notification, attachment, manual
   backup, and system-snapshot restore smoke tests.
4. Inspection of the merged release manifest and built APK/AAB for forbidden network
   permissions, package-install capability, exact-alarm privileges, and over-broad
   shared-file paths.
5. Migration and restore tests from every released schema/backup fixture.
6. Dependency, license, secret, and source-map review.

Run `pnpm check` and `pnpm test:e2e` locally before pushing or tagging; GitHub
Actions builds Android artifacts but does not run the lint, unit, or browser test
suites. Signing keys and passwords are never committed.

## Local Android verification

Use Java 21 and an Android SDK containing API 36 and Build Tools 35:

```sh
pnpm android:sync
cd android
./gradlew assembleRelease bundleRelease --no-daemon
cd ..
pnpm check:android-permissions
```

The permission check reads both merged manifests and the final APK with `aapt2`. It
also verifies cleartext denial and the encryption-gated snapshot allowlist. An
unsigned local release is suitable only for inspection, not distribution.

Finance reminders must be scheduled as inexact alarms. They may be delivered within
Android's batching window and must not request or open settings for an exact-alarm
privilege. Reminder refresh runs on foreground, local day change and timezone
change; overdue dates remain visible in the app even if Android has delayed a
notification. Catch-up scheduling records deduplication keys in encrypted
settings to avoid repeatedly re-alerting after a delivered notification.
Verify an insurance premium/renewal and card statement reminder
before and after a device reboot. A browser test checks scheduling decisions, not
actual Android notification delivery.

Verify an exported complete `.finapp` backup from the saved location, including
its attachments, then perform a destructive restore rehearsal using a separately
saved and reselected safety copy. Export/share initiation alone is not evidence
of recovery.

## Signed GitHub artifacts

The `main` push/pull-request workflow builds and uploads a **debug APK** that
uses the separate package `com.fintrack.app.preview` and is labelled **FinTrack
Preview**. It can be installed alongside production but its runner-generated
debug key cannot be relied on for updates even between preview builds. It also
builds an unsigned release variant to inspect the final Android permissions and
backup rules. Do not keep irreplaceable data in a preview or distribute it as
a production release.
Both Android workflows use the preinstalled SDK on the Ubuntu 24.04 runner
and check for API 36 and Build Tools 35.0.0 before building.

### First signed release

Generate the persistent release keystore **offline** and keep two secure,
independent offline copies of its keystore file, alias and passwords. From one
backup copy, obtain its public certificate SHA-256 fingerprint with
`keytool -list -v -keystore <file> -alias <alias>`. The public fingerprint from
the newly generated FinTrack keystore is pinned in
`scripts/verify-release-apk.mjs` and must match that offline copy; do not
replace the signing key after distribution. Add the encrypted repository secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Only an immutable `vMAJOR.MINOR.PATCH` tag on `main` whose version matches
`package.json` can be built. Protect `v*` tags against deletion or retargeting
in the GitHub repository settings. To release `v0.1.0`, first set
`package.json` to `0.1.0`, commit and push to `main`, then create and push that
tag. To release `v0.1.1`, bump the package version and repeat. Manual workflow
dispatch from `main` can rebuild an **existing tag**; enter `v0.1.0` as
`release_tag`. It cannot sign an arbitrary branch or version string.

The Android `versionCode` is `MAJOR * 1,000,000 + MINOR * 1,000 + PATCH`
(major 0–2099, minor/patch 0–999; code must be positive). No prerelease
tags are accepted. This is independent of GitHub run numbers and must never be
changed after a signed APK is distributed. If an earlier locally signed APK
was distributed, check its package ID, signing certificate and version code
before issuing the first release: a lower or mismatched APK cannot update it.
Signed local builds must set both `FINTRACK_VERSION_CODE` and
`FINTRACK_VERSION_NAME`; unsigned inspection builds may use defaults.
Unsigned build names and exported-backup app-version metadata follow
`package.json`, so the declared release version is not duplicated in those paths.

The workflow verifies package ID `com.fintrack.app`, version, absence of the
debuggable flag, exactly one signer, the pinned certificate, and offline
permissions before uploading the signed APK/AAB, SBOM and SHA-256 checksums.
Missing or replaced signing credentials and a missing certificate pin fail the
build. Archive each signed APK, its checksum and certificate fingerprint outside
GitHub: workflow artifacts expire after 30 days. This workflow does not publish
to Google Play or offer automatic downloads from inside the offline app.

### Existing preview users and upgrade drill

The previously distributed debug APKs used `com.fintrack.app` but an unstable
signing key. Android **cannot** install the new signed release over one of these
debug APKs. Before removing the old installation, export a complete `.finapp`
backup to storage **outside the app** (not the app's cache or share-sheet
preview), open it from that saved location and verify its PIN and contents.
Older previews lacking in-app verification can be test-restored into the new
separately installed preview. Keep the old APK and saved backup until recovery
has been checked. Then uninstall the old debug installation, install the signed
release, and restore the `.finapp` backup with documents. Android system
backup is not a substitute: it omits documents and may not restore across a
signing-key change. Uninstalling without a saved backup deletes local data.

For each pair of signed releases, install version A, create an account,
transaction, policy document and PIN, and make/verify a complete backup.
Without uninstalling, install version B using Android's package installer or
`adb install -r FinTrack-B.apk`. Confirm that Android accepts the update, the
PIN still unlocks, the records and document remain intact, and a new complete
backup can be verified/restored. Repeat after a reboot and for any new data
schema. Device installation and OS notification delivery cannot be proven by
browser or unit tests alone; do not claim that drill passed unless it ran.
