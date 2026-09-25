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
suites. Signing keys and passwords live only in GitHub encrypted secrets or the
release operator's secure local environment. They are never committed.

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
privilege. Verify one future reminder before and after a device reboot.

## Signed GitHub artifacts

The `main` push/pull-request workflow builds and uploads a **debug APK** that
can be installed for review, but its runner-generated debug key cannot be
relied on for in-place updates. It also builds an unsigned release variant to
inspect the final Android permissions and backup rules. Do not distribute the
debug artifact as a production release.

`.github/workflows/android-release.yml` runs for `v*` tags or manual dispatch. Add
these encrypted repository secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

The workflow validates the requested version, builds signed APK and AAB files,
verifies the APK signature and final permissions, creates a CycloneDX SBOM and
SHA-256 checksums, and uploads one versioned artifact bundle. It does not publish to
Google Play.
