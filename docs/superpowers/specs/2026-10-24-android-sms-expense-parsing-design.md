# Android native SMS expense parsing and daily reminder

**Status:** Proposed written specification for review, 24 October 2026.
**Feature:** Native Android SMS expense extraction and end-of-day reminder.

## Intent and boundaries

FinTrack is an offline-first, private personal finance manager for an individual in India. The user wants to effortlessly capture daily expenses by parsing transaction SMS notifications received from Indian banks, card issuers, and UPI services, avoiding repetitive manual data entry.

Success means:
1. The user can on-demand scan messages received within a custom date range (defaulting to the past 24 hours / 1 day).
2. The parser accurately extracts debit amounts, merchant/payee descriptions, transaction dates, and account/card last-4 digits from standard Indian transactional SMS messages while ignoring OTPs, promos, and non-financial text.
3. Candidate transactions are presented in an interactive review dialog where the user verifies accounts, selects categories, checks duplicate warnings, and confirms import into the encrypted ledger.
4. A daily end-of-day reminder notification prompts the user to review and scan the day's expenses before retiring for the night.
5. All operations remain strictly on-device, offline, and zero-network.

## Alternatives and decision

1. **Interactive on-demand scan and review dialog (Selected):**
   The user triggers the scan when convenient. A custom Capacitor plugin queries the device SMS inbox for the requested timeframe, a pure domain module parses the messages, and a review dialog allows the user to inspect, categorize, and approve transactions before they are committed to the encrypted database.
   *Why selected:* Preserves FinTrack's deterministic accounting and privacy-first model. Eliminates unintended ledger corruption and duplicate entries while keeping the user in full control.

2. **Background SMS receiver with automated auto-commit:**
   A background `BroadcastReceiver` catches `SMS_RECEIVED` events and writes directly to the ledger.
   *Why rejected:* Bypasses user oversight, risks silent errors or incorrect categorization, requires intrusive background listeners and extra `RECEIVE_SMS` permissions, and complicates encryption key lifecycles when the app is locked.

3. **Background SMS staging queue with notification badge:**
   Background listener writes candidate rows to an unencrypted staging store; user reviews later.
   *Why rejected:* Unnecessary background battery drain and stores sensitive transaction drafts in an unencrypted state while the app PIN is locked.

## Architecture and components

### 1. Native Android Plugin (`FinTrackSmsPlugin.java`)
- **Location:** `android/app/src/main/java/com/fintrack/app/FinTrackSmsPlugin.java`
- **Registration:** In `MainActivity.java` via `registerPlugin(FinTrackSmsPlugin.class)`.
- **Permissions:** Declares `@CapacitorPlugin(name = "FinTrackSms", permissions = { @Permission(strings = { Manifest.permission.READ_SMS }, alias = "sms") })`.
- **Manifest:** Adds `<uses-permission android:name="android.permission.READ_SMS" />` to `android/app/src/main/AndroidManifest.xml`. Does not request any internet or network permissions.
- **Methods:**
  - `checkPermissions(PluginCall call)`: Returns current permission status (`granted`, `denied`, `prompt`).
  - `requestPermissions(PluginCall call)`: Triggers the native Android permission prompt.
  - `listMessages(PluginCall call)`: Accepts `sinceMs` (timestamp) and optional `untilMs` (timestamp). Queries `Telephony.Sms.Inbox.CONTENT_URI` with projection `[Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE]`. Returns an array of `{ id, address, body, dateMs }` sorted by date descending.
  - Safety cap: Limits scan results to a maximum of 500 messages per call to prevent memory pressure.

### 2. Platform Adapter (`src/platform/sms.ts`)
- Provides TypeScript contract:
  ```ts
  export interface RawSmsMessage {
    id: string
    address: string
    body: string
    dateMs: number
  }

  export interface SmsCapability {
    available: boolean
    platform: 'android' | 'web'
  }
  ```
- Gracefully handles non-Android environments: returns `available: false` on Web so the UI adapts cleanly without crashes.
- Methods: `getSmsCapability()`, `requestSmsPermission()`, and `readInboxMessages({ sinceMs, untilMs })`.

### 3. Pure Domain Parser & Deduplication (`src/domain/sms.ts`)
- **Purity:** Pure TypeScript module; zero React, DOM, or Capacitor imports. Fully testable via Vitest.
- **Message Filtering:**
  - Excludes messages matching OTP / authentication patterns (e.g. `otp`, `one time password`, `verification code`, `secret code`).
  - Excludes promotional text, balance inquiries, and spam.
- **Extraction Rules (Indian Banking & UPI Formats):**
  - **Amount:** Extracts Indian rupee amounts (`Rs.`, `INR`, `Rs`, `₹`) formatted with commas/decimals into integer paise.
  - **Kind:** Distinguishes debits (`debited`, `spent`, `paid`, `sent`, `txn of`, `withdrawn`) as `expense`, and credits (`credited`, `refund`, `received`) as `income`.
  - **Account / Card Matching:** Identifies account or card numbers (`ending xx1234`, `A/c *1234`, `Card ..1234`, `Card ending in 1234`) and attempts exact match against `accounts[].creditCardDetails.lastFour` or account names ending with those digits.
  - **Payee / Merchant:** Extracts payee/merchant names from standard formats (e.g. `at <MERCHANT>`, `to <MERCHANT/VPA>`, `VPA <vpa>`, `info: <merchant>`).
  - **Date:** Converts SMS timestamp (`dateMs`) to ISO date `yyyy-MM-dd`.
  - **Reference:** Captures UPI reference or UTR numbers when available.
- **Duplicate Detection:**
  - Compares candidate `{ date, amountPaise, accountId }` with `existingTransactions`.
  - Marks matched candidates as `duplicate: true` with a pointer to the existing transaction so the user can easily omit them.

### 4. Interactive Review Dialog (`src/features/transactions/SmsImportDialog.tsx`)
- Triggered by a **"Scan SMS"** button in `TransactionsPage.tsx` (visible when on Android or SMS capability is present).
- **Time Window Filter:**
  - Defaults to **Last 24 Hours** (1 day).
  - Quick presets: "Last 24 hours", "Last 3 days", "Last 7 days", "Custom range".
- **Candidate Staging Table:**
  - Checkbox column to toggle inclusion.
  - Displays Date, Payee/Merchant, Detected Amount (formatted in ₹), Account selector (prefilled if card/account matched), Category selector (auto-suggested based on merchant keywords).
  - Warning pill for duplicates already recorded in the ledger.
- **Commit Action:**
  - "Import Selected (N)" button writes valid transactions to the encrypted database using `commitImport` from `FinanceContext`.

### 5. Daily End-of-Day Reminder Notification
- **Configuration in `AppSettings`:**
  - `smsExpenseReminderEnabled: boolean` (default: `true`).
  - `smsExpenseReminderTime: string` (HH:mm format, default: `'21:00'` / 9:00 PM).
- **Domain Reminder (`src/domain/reminders.ts`):**
  - Adds a daily recurring reminder rule `sms-expense-reminder`.
  - Creates a dated reminder scheduled for today's configured reminder time if not yet passed, or tomorrow's reminder time.
  - Tapping notification directs user to `/transactions?action=scan-sms`.
- **Scheduled via `syncLocalNotifications`:**
  - Utilizes existing `LocalNotifications` infrastructure with `finance-reminders` channel and non-exact alarms (`isExactNotification: false`), respecting quiet hours.

## Security, Privacy, and Performance Constraints

1. **Zero-Network:** No external network requests; all regex and natural text heuristics run locally on-device.
2. **Permission Boundary:** Only `android.permission.READ_SMS` is added. No `RECEIVE_SMS`, no `INTERNET`, no exact alarms.
3. **Data Protection:** Scanned SMS bodies exist transiently in JavaScript memory during the review dialog lifecycle and are never persisted to disk or IndexedDB. Only the final user-approved transaction records are encrypted and stored.
4. **Android Build Verification:** `scripts/check-android-manifest.mjs` must continue to pass, ensuring no forbidden permissions are introduced.

## Implementation Plan Outline

1. **Domain Logic:**
   - Create `src/domain/sms.ts` and test suite `src/domain/sms.test.ts` covering HDFC, SBI, ICICI, Axis, and UPI debit/credit patterns.
   - Update `src/domain/types.ts` and `src/domain/reminders.ts` for end-of-day reminder settings and scheduling.
2. **Platform & Native Code:**
   - Implement `FinTrackSmsPlugin.java` and register in `MainActivity.java`.
   - Add `READ_SMS` permission to `android/app/src/main/AndroidManifest.xml`.
   - Implement TypeScript bridge `src/platform/sms.ts`.
3. **UI & User Experience:**
   - Create `SmsImportDialog.tsx` with date range filter, preview table, and bulk commit.
   - Add "Scan SMS" entry point on `TransactionsPage.tsx`.
   - Add daily reminder toggle and time picker in `SettingsPage.tsx`.
4. **Verification & Testing:**
   - Vitest unit tests for SMS extraction, duplicate detection, and reminder planning.
   - Run `pnpm check` (linting, tests, build).
   - Verify Android build and permissions with `scripts/check-android-manifest.mjs`.
