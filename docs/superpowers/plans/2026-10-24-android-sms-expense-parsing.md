# Android Native SMS Expense Parsing & Daily Reminder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement native Android SMS inbox querying and pure-domain financial parsing to let users scan and import recent expenses (default 24h window) with an interactive review dialog and an end-of-day reminder notification.

**Architecture:** A native Capacitor plugin (`FinTrackSmsPlugin.java`) queries Android's `content://sms/inbox` for timestamps within a requested window and returns raw SMS headers and bodies. A pure TypeScript domain parser (`src/domain/sms.ts`) extracts amounts (integer paise), merchant/payee names, transaction kinds (debit/credit), and account/card last-4 digits, while filtering OTPs and non-financial spam. An interactive review dialog (`SmsImportDialog.tsx`) lets users categorize, verify, and commit transactions into the encrypted ledger. A scheduled end-of-day reminder in `reminders.ts` and `AppSettings` alerts users daily to log their expenses.

**Tech Stack:** Java (Android Telephony ContentProvider, Capacitor Plugin), TypeScript, React 19, Vitest, Capacitor Local Notifications.

**Spec:** [`docs/superpowers/specs/2026-10-24-android-sms-expense-parsing-design.md`](file:///workspace/quiet-hopper/docs/superpowers/specs/2026-10-24-android-sms-expense-parsing-design.md)

## Global Constraints

- Android app must never declare `INTERNET`, `ACCESS_NETWORK_STATE`, or exact-alarm permissions.
- All monetary amounts must be stored and computed as integer paise (`Paise`).
- Domain logic in `src/domain/` must remain pure: zero imports of React, DOM, Dexie, or Capacitor.
- Scanned raw SMS message bodies must remain in ephemeral React state during review and must never be persisted to disk or IndexedDB.
- Offline and capability audits (`scripts/check-android-manifest.mjs` and `scripts/check-offline.mjs`) must pass cleanly.

## Review Focus

- Non-financial messages or OTPs that contain numbers (e.g. "OTP 45210 for txn of Rs 100") must be strictly ignored and never suggested as expenses.
- Reversal or refund SMS messages (e.g. "Refund of Rs 250 credited...") must be recognized as `income` or marked accordingly, never misclassified as debit expenses.
- Messages without a recognizable rupee amount or currency token must be skipped.
- Duplicate detection must reliably match existing transactions by account, date, and amount in paise so users are warned before adding identical records.
- On non-Android platforms (e.g. web preview), the feature must fail open/gracefully: SMS capability reports `available: false` and the UI hides the scan action without throwing runtime errors.

---

### Task 1: Domain SMS Parsing and Candidate Preview

**Files:**
- Create: `src/domain/sms.ts`
- Test: `src/domain/sms.test.ts`

**Interfaces:**
- Consumes: `Account`, `Category`, `Transaction`, `Paise`, `ISODate` from `src/domain/types.ts`.
- Produces:
  ```ts
  export interface RawSmsMessage {
    id: string
    address: string
    body: string
    dateMs: number
  }

  export interface ParsedSmsTransaction {
    smsId: string
    date: ISODate
    amountPaise: Paise
    kind: 'expense' | 'income'
    merchant: string
    rawAccountDigits: string | null
    reference: string | null
  }

  export interface SmsCandidatePreview extends ParsedSmsTransaction {
    matchedAccountId: string | null
    suggestedCategoryId: string | null
    duplicate: boolean
    matchedTransactionId: string | null
  }

  export function parseFinancialSms(sms: RawSmsMessage): ParsedSmsTransaction | null
  export function previewSmsTransactions(options: {
    messages: RawSmsMessage[]
    accounts: Account[]
    categories: Category[]
    existingTransactions: Transaction[]
    importBatchId?: string
  }): SmsCandidatePreview[]
  ```

- [ ] **Step 1: Write failing unit tests for `src/domain/sms.test.ts`**
  Cover:
  - Debit SMS formats: HDFC card spent, SBI UPI debit, ICICI bank debit, Axis bank debit.
  - Credit/refund SMS format: "credited with Rs ...", "refund of Rs ...".
  - OTP and authentication filtering: messages containing "OTP", "verification code", "secret code" return `null`.
  - Account matching: matching `rawAccountDigits` against account `creditCardDetails.lastFour` or account name.
  - Category suggestion: heuristics (e.g., "SWIGGY", "ZOMATO" -> Food category).
  - Duplicate detection: marking `duplicate: true` when a transaction with same `accountId`, `date`, and `amountPaise` already exists.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm vitest run src/domain/sms.test.ts`
  Expected: FAIL with missing module `src/domain/sms.ts`.

- [ ] **Step 3: Implement `src/domain/sms.ts`**
  - Implement regex parsers for Indian financial SMS messages:
    - Currency patterns: `(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)`
    - Debit keywords: `\b(?:debited|spent|paid|sent|txn\s+of|withdrawn)\b`
    - Credit keywords: `\b(?:credited|refund|received)\b`
    - OTP guard: reject if `/(\botp\b|one\s*time\s*password|verification\s*code)/i.test(body)`
    - Account digits extractor: `(?:a/c|acct|account|card|ending)\s*(?:no\.?)?\s*(?:[*xX]+|\.{2,})?(\d{4})\b`
    - Merchant extractor: `(?:at|to|info:?|vpa)\s+([A-Za-z0-9\s._\-@]+?)(?=\s+(?:on|avail|bal|ref|upi|via|\.|$))`
  - Implement `previewSmsTransactions` mapping candidates to accounts, categories, and checking duplicate collisions.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm vitest run src/domain/sms.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/domain/sms.ts src/domain/sms.test.ts
  git commit -m "feat(domain): add Indian financial SMS parser and candidate preview"
  ```

---

### Task 2: Daily End-of-Day SMS Expense Reminder in Domain & Settings

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/defaults.ts`
- Modify: `src/domain/schemas.ts`
- Modify: `src/domain/reminders.ts`
- Test: `src/domain/reminders.test.ts` (or add unit test)

**Interfaces:**
- Consumes: `AppSettings`, `DatedReminder` from `src/domain/types.ts`.
- Produces:
  - `AppSettings.smsExpenseReminderEnabled: boolean`
  - `AppSettings.smsExpenseReminderTime: string` (e.g. `'21:00'`)
  - Reminder entry with `ruleType: 'recurring-due'` (or dedicated key `sms-expense-reminder`) scheduled at the user's chosen evening time.

- [ ] **Step 1: Write failing test for daily SMS expense reminder**
  In `src/domain/reminders.test.ts`, add test verifying that when `settings.smsExpenseReminderEnabled` is `true`, `collectDatedReminders(data, settings)` includes a reminder for today (or tomorrow if past the time) pointing to `/transactions?action=scan-sms`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm vitest run src/domain/reminders.test.ts`
  Expected: FAIL (missing settings properties and reminder).

- [ ] **Step 3: Update `src/domain/types.ts`, `defaults.ts`, `schemas.ts`, and `reminders.ts`**
  - Add `smsExpenseReminderEnabled?: boolean` and `smsExpenseReminderTime?: string` to `AppSettings` in `src/domain/types.ts`.
  - Default `smsExpenseReminderEnabled: true`, `smsExpenseReminderTime: '21:00'` in `src/domain/defaults.ts`.
  - Update `appSettingsSchema` in `src/domain/schemas.ts`.
  - Add `smsExpenseReminder(...)` generator in `src/domain/reminders.ts` and include it in `collectDatedReminders`.

- [ ] **Step 4: Run tests to verify they pass**
  Run: `pnpm vitest run src/domain/reminders.test.ts src/domain/schemas.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/domain/types.ts src/domain/defaults.ts src/domain/schemas.ts src/domain/reminders.ts src/domain/reminders.test.ts
  git commit -m "feat(domain): add daily end-of-day SMS expense reminder"
  ```

---

### Task 3: Native Android Capacitor SMS Plugin

**Files:**
- Create: `android/app/src/main/java/com/fintrack/app/FinTrackSmsPlugin.java`
- Modify: `android/app/src/main/java/com/fintrack/app/MainActivity.java`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `src/platform/sms.ts`
- Create: `src/platform/sms.test.ts`

**Interfaces:**
- Consumes: Android ContentResolver, Capacitor Plugin bridge.
- Produces:
  ```ts
  export interface SmsCapability {
    available: boolean
    platform: 'android' | 'web'
  }
  export function getSmsCapability(): SmsCapability
  export function requestSmsPermission(): Promise<boolean>
  export function fetchInboxSms(options: { sinceMs: number; untilMs?: number }): Promise<RawSmsMessage[]>
  ```

- [ ] **Step 1: Write unit tests for `src/platform/sms.test.ts`**
  Mock Capacitor platform and plugin calls to verify:
  - On web platform: `getSmsCapability()` returns `{ available: false, platform: 'web' }` and `fetchInboxSms` returns empty array.
  - On android platform: delegates to plugin `checkPermissions`, `requestPermissions`, and `listMessages`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm vitest run src/platform/sms.test.ts`
  Expected: FAIL (missing `src/platform/sms.ts`).

- [ ] **Step 3: Implement `FinTrackSmsPlugin.java`, register in `MainActivity.java`, and update `AndroidManifest.xml`**
  - Add `<uses-permission android:name="android.permission.READ_SMS" />` to `android/app/src/main/AndroidManifest.xml`.
  - In `FinTrackSmsPlugin.java`:
    - Annotate with `@CapacitorPlugin(name = "FinTrackSms", permissions = { @Permission(strings = { Manifest.permission.READ_SMS }, alias = "sms") })`.
    - Implement `listMessages(PluginCall call)`:
      - Reads `sinceMs` (long) and optional `untilMs` (long, defaults to current time).
      - Queries `Telephony.Sms.Inbox.CONTENT_URI` with projection `[_ID, ADDRESS, BODY, DATE]`.
      - Selection: `DATE >= ? AND DATE <= ?`, sorted by `DATE DESC`, limit 500.
      - Returns `JSArray` of messages.
  - Register `FinTrackSmsPlugin.class` in `MainActivity.java`.
  - Implement `src/platform/sms.ts` to wrap `registerPlugin('FinTrackSms')`.

- [ ] **Step 4: Run platform tests and permission check**
  Run: `pnpm vitest run src/platform/sms.test.ts`
  Run: `node scripts/check-android-manifest.mjs` (or verify that no forbidden permissions are added).
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add android/app/src/main/java/com/fintrack/app/FinTrackSmsPlugin.java android/app/src/main/java/com/fintrack/app/MainActivity.java android/app/src/main/AndroidManifest.xml src/platform/sms.ts src/platform/sms.test.ts
  git commit -m "feat(android): implement FinTrackSmsPlugin and platform adapter"
  ```

---

### Task 4: Interactive SMS Import Review Dialog UI

**Files:**
- Create: `src/features/transactions/SmsImportDialog.tsx`
- Modify: `src/features/transactions/TransactionsPage.tsx`
- Test: `src/features/transactions/SmsImportDialog.test.tsx` (or component test)

**Interfaces:**
- Consumes:
  - `useFinance()` for `data.accounts`, `data.categories`, `data.transactions`, and `commitImport`.
  - `fetchInboxSms` from `src/platform/sms.ts`.
  - `previewSmsTransactions` from `src/domain/sms.ts`.
  - `Dialog`, `ScrollableTable`, `Icon`, `Toast` from `src/ui/`.
- Produces:
  - Rendered modal with preset timeframe filters (24 hours default, 3 days, 7 days, custom).
  - Editable candidate list with inclusion toggle, account selection, category selection, duplicate indicator.
  - Bulk commit creating structured `Transaction` entities with an import batch.

- [ ] **Step 1: Write component tests for `SmsImportDialog.test.tsx`**
  - Verify that when opened, it fetches messages for the default 24h window and previews candidates.
  - Verify that changing timeframe refreshes the preview.
  - Verify that clicking "Import Selected" calls `commitImport` with selected transactions.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm vitest run src/features/transactions/SmsImportDialog.test.tsx`
  Expected: FAIL

- [ ] **Step 3: Implement `SmsImportDialog.tsx` and integrate into `TransactionsPage.tsx`**
  - Create `SmsImportDialog.tsx` matching the design and layout of `CsvImportDialog.tsx`.
  - In `TransactionsPage.tsx`:
    - Add "Scan SMS" button next to "Import CSV".
    - Check URL query parameter `?action=scan-sms` on mount (so tapping the reminder notification automatically opens the scan modal).
    - Render `SmsImportDialog` when `scanSmsOpen` is true.

- [ ] **Step 4: Run tests to verify they pass**
  Run: `pnpm vitest run src/features/transactions/`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/features/transactions/SmsImportDialog.tsx src/features/transactions/TransactionsPage.tsx src/features/transactions/SmsImportDialog.test.tsx
  git commit -m "feat(ui): add interactive SMS scan and review dialog"
  ```

---

### Task 5: Settings UI for Daily Expense Reminder & Notification Sync

**Files:**
- Modify: `src/features/settings/SettingsPage.tsx`
- Modify: `src/app/FinanceContext.tsx` (if needed for settings update)
- Test: `src/features/settings/SettingsPage.test.tsx` (or existing settings test)

**Interfaces:**
- Consumes: `updateSettings` from `FinanceContext`.
- Produces:
  - Toggle for `smsExpenseReminderEnabled` under Reminders.
  - Time input for `smsExpenseReminderTime` (default `21:00`).

- [ ] **Step 1: Write test for reminder settings in `SettingsPage`**
  Verify toggling daily SMS reminder and editing time updates app settings.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm vitest run src/features/settings/`
  Expected: FAIL

- [ ] **Step 3: Update `SettingsPage.tsx`**
  Add daily SMS expense reminder toggle and time picker in the Reminders section.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm vitest run src/features/settings/`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/features/settings/SettingsPage.tsx
  git commit -m "feat(ui): add SMS expense reminder controls to Settings"
  ```

---

### Task 6: Full Verification and Quality Audit

**Files:**
- Run all checks and tests across the workspace.

- [ ] **Step 1: Run linter and formatting checks**
  Run: `pnpm lint`
  Expected: PASS

- [ ] **Step 2: Run offline and permission security checks**
  Run: `pnpm check:offline`
  Expected: PASS

- [ ] **Step 3: Run all unit and integration tests**
  Run: `pnpm test`
  Expected: PASS

- [ ] **Step 4: Verify typecheck and production build**
  Run: `pnpm typecheck`
  Expected: PASS

- [ ] **Step 5: Commit any final test or build adjustments**
  ```bash
  git commit --allow-empty -m "chore: verify end-to-end SMS expense parsing and daily reminder"
  ```
