import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { rupeesToPaise } from '../domain/money'
import { readFileBytes } from '../platform/files'
import { ConfirmDialog } from '../ui/Dialog'
import { Icon } from '../ui/Icon'
import { useSecurity } from './SecurityContext'

const setupSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name').max(100),
    monthlyIncome: z.string().trim().min(1, 'Enter expected monthly income'),
    essentialExpenses: z.string().trim().min(1, 'Enter essential monthly expenses'),
    payDay: z.coerce.number().int().min(1).max(31),
    emergencyFundMonths: z.coerce.number().min(0).max(36),
    pin: z
      .string()
      .min(6, 'Use at least six characters')
      .regex(/[a-z]/iu, 'Include at least one letter')
      .regex(/\d/u, 'Include at least one number'),
    confirmPin: z.string(),
    acknowledgeRecovery: z.boolean().refine((value) => value, {
      message: 'Confirm that you understand the recovery limitation',
    }),
  })
  .refine((values) => values.pin === values.confirmPin, {
    path: ['confirmPin'],
    message: 'PINs do not match',
  })
  .superRefine((values, context) => {
    for (const [field, value] of [
      ['monthlyIncome', values.monthlyIncome],
      ['essentialExpenses', values.essentialExpenses],
    ] as const) {
      try {
        if (rupeesToPaise(value) < 0) throw new Error('negative')
      } catch {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'Enter a valid non-negative INR amount',
        })
      }
    }
  })

type SetupInput = z.input<typeof setupSchema>
type SetupValues = z.output<typeof setupSchema>

function Brand() {
  return (
    <div className="auth-brand">
      <span className="brand-mark" aria-hidden="true">
        <Icon name="net-worth" size={22} />
      </span>
      <div>
        <strong>FinTrack</strong>
        <span>Private finance, on this device</span>
      </div>
    </div>
  )
}

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-layout">
      <aside className="auth-context">
        <Brand />
        <div className="auth-context-copy">
          <span className="badge badge-positive">No account or network required</span>
          <h1>Your financial records stay on this device.</h1>
          <p>
            Track income, expenses, debt, investments, policies, goals, and net worth in
            one encrypted workspace.
          </p>
        </div>
        <ul className="security-list">
          <li>
            <Icon name="lock" size={18} />
            PIN-protected encrypted records
          </li>
          <li>
            <Icon name="shield" size={18} />
            No analytics, advertising, or remote APIs
          </li>
          <li>
            <Icon name="backup" size={18} />
            Portable encrypted backups
          </li>
        </ul>
      </aside>
      <section className="auth-panel">{children}</section>
    </main>
  )
}

export function CheckingScreen() {
  return (
    <AuthFrame>
      <div className="auth-form">
        <span className="badge">Checking encrypted storage</span>
        <h1>Opening FinTrack</h1>
        <p className="muted">No data leaves this device.</p>
        <div className="loading-line" aria-label="Loading" />
      </div>
    </AuthFrame>
  )
}

export function SetupScreen() {
  const { setup, restoreNew, bootstrapNotice } = useSecurity()
  const [mode, setMode] = useState<'new' | 'restore'>('new')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [backupPin, setBackupPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmNewPin, setConfirmNewPin] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetupInput, unknown, SetupValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      name: '',
      monthlyIncome: '',
      essentialExpenses: '',
      payDay: 1,
      emergencyFundMonths: 6,
      pin: '',
      confirmPin: '',
      acknowledgeRecovery: false,
    },
  })

  const onSetup = handleSubmit(async (values) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await setup(values.pin, {
        name: values.name.trim(),
        locale: 'en-IN',
        currency: 'INR',
        monthlyIncomePaise: rupeesToPaise(values.monthlyIncome),
        essentialMonthlyPaise: rupeesToPaise(values.essentialExpenses),
        payDay: values.payDay,
        emergencyFundMonths: values.emergencyFundMonths,
      })
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'The workspace could not be created',
      )
    } finally {
      setSubmitting(false)
    }
  })

  const onRestore = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitError(null)
    if (!restoreFile) {
      setSubmitError('Choose a .finapp backup file')
      return
    }
    if (newPin.length < 6 || !/[a-z]/iu.test(newPin) || !/\d/u.test(newPin)) {
      setSubmitError(
        'The new app PIN needs at least six characters, a letter, and a number',
      )
      return
    }
    if (newPin !== confirmNewPin) {
      setSubmitError('The new app PINs do not match')
      return
    }
    setSubmitting(true)
    try {
      await restoreNew(await readFileBytes(restoreFile), backupPin, newPin)
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'The backup could not be restored',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthFrame>
      <div className="auth-form auth-form-wide">
        <div>
          <span className="eyebrow">First-time setup</span>
          <h1>{mode === 'new' ? 'Create your private workspace' : 'Restore a backup'}</h1>
          <p className="muted">
            {mode === 'new'
              ? 'Set the baseline used for cash-flow and reserve alerts. You can change it later.'
              : 'Restore a complete encrypted .finapp file and choose the PIN for this installation.'}
          </p>
        </div>

        {bootstrapNotice ? (
          <div className="notice notice-warning" role="status">
            <Icon name="alerts" size={18} />
            <span>{bootstrapNotice}</span>
          </div>
        ) : null}

        <div className="segmented" aria-label="Setup choice">
          <button
            type="button"
            className={mode === 'new' ? 'active' : ''}
            aria-pressed={mode === 'new'}
            onClick={() => setMode('new')}
          >
            New workspace
          </button>
          <button
            type="button"
            className={mode === 'restore' ? 'active' : ''}
            aria-pressed={mode === 'restore'}
            onClick={() => setMode('restore')}
          >
            Restore backup
          </button>
        </div>

        {mode === 'new' ? (
          <form className="stack" onSubmit={onSetup} noValidate>
            <div className="form-grid">
              <div className="field field-span">
                <label htmlFor="name">Name</label>
                <input
                  id="name"
                  className="input"
                  autoComplete="name"
                  {...register('name')}
                />
                {errors.name ? (
                  <p className="field-error">{errors.name.message}</p>
                ) : null}
              </div>
              <div className="field">
                <label htmlFor="monthlyIncome">Monthly take-home income</label>
                <div className="currency-field">
                  <span>₹</span>
                  <input
                    id="monthlyIncome"
                    className="input"
                    inputMode="decimal"
                    placeholder="1,00,000"
                    {...register('monthlyIncome')}
                  />
                </div>
                {errors.monthlyIncome ? (
                  <p className="field-error">{errors.monthlyIncome.message}</p>
                ) : null}
              </div>
              <div className="field">
                <label htmlFor="essentialExpenses">Essential monthly expenses</label>
                <div className="currency-field">
                  <span>₹</span>
                  <input
                    id="essentialExpenses"
                    className="input"
                    inputMode="decimal"
                    placeholder="40,000"
                    {...register('essentialExpenses')}
                  />
                </div>
                {errors.essentialExpenses ? (
                  <p className="field-error">{errors.essentialExpenses.message}</p>
                ) : null}
              </div>
              <div className="field">
                <label htmlFor="payDay">Usual payday</label>
                <input
                  id="payDay"
                  className="input"
                  type="number"
                  min="1"
                  max="31"
                  {...register('payDay')}
                />
              </div>
              <div className="field">
                <label htmlFor="emergencyFundMonths">Reserve target in months</label>
                <input
                  id="emergencyFundMonths"
                  className="input"
                  type="number"
                  min="0"
                  max="36"
                  step="0.5"
                  {...register('emergencyFundMonths')}
                />
              </div>
              <div className="field">
                <label htmlFor="pin">App PIN or passphrase</label>
                <input
                  id="pin"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  {...register('pin')}
                />
                <p className="field-hint">
                  At least six characters, including a letter and number.
                </p>
                {errors.pin ? <p className="field-error">{errors.pin.message}</p> : null}
              </div>
              <div className="field">
                <label htmlFor="confirmPin">Confirm PIN</label>
                <input
                  id="confirmPin"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  {...register('confirmPin')}
                />
                {errors.confirmPin ? (
                  <p className="field-error">{errors.confirmPin.message}</p>
                ) : null}
              </div>
            </div>
            <label className="check-row">
              <input type="checkbox" {...register('acknowledgeRecovery')} />
              <span>
                I understand there is no remote PIN reset. Losing this PIN and all
                readable backups means losing the data.
              </span>
            </label>
            {errors.acknowledgeRecovery ? (
              <p className="field-error">{errors.acknowledgeRecovery.message}</p>
            ) : null}
            {submitError ? (
              <div className="notice notice-error" role="alert">
                <Icon name="alerts" size={18} />
                <span>{submitError}</span>
              </div>
            ) : null}
            <button type="submit" className="button" disabled={submitting}>
              <Icon name="lock" size={18} />
              {submitting ? 'Encrypting workspace…' : 'Create encrypted workspace'}
            </button>
          </form>
        ) : (
          <form className="stack" onSubmit={onRestore}>
            <div className="field">
              <label htmlFor="restoreFile">Complete FinTrack backup</label>
              <input
                id="restoreFile"
                className="input file-input"
                type="file"
                accept=".finapp,application/json"
                onChange={(event) => setRestoreFile(event.target.files?.[0] ?? null)}
              />
              <p className="field-hint">
                Android system snapshots are restored automatically before this screen.
              </p>
            </div>
            <div className="field">
              <label htmlFor="backupPin">Backup PIN</label>
              <input
                id="backupPin"
                className="input"
                type="password"
                value={backupPin}
                onChange={(event) => setBackupPin(event.target.value)}
              />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="newPin">New app PIN</label>
                <input
                  id="newPin"
                  className="input"
                  type="password"
                  value={newPin}
                  onChange={(event) => setNewPin(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="confirmNewPin">Confirm new app PIN</label>
                <input
                  id="confirmNewPin"
                  className="input"
                  type="password"
                  value={confirmNewPin}
                  onChange={(event) => setConfirmNewPin(event.target.value)}
                />
              </div>
            </div>
            {submitError ? (
              <div className="notice notice-error" role="alert">
                <Icon name="alerts" size={18} />
                <span>{submitError}</span>
              </div>
            ) : null}
            <button type="submit" className="button" disabled={submitting}>
              <Icon name="backup" size={18} />
              {submitting ? 'Validating and restoring…' : 'Restore encrypted backup'}
            </button>
          </form>
        )}
      </div>
    </AuthFrame>
  )
}

export function UnlockScreen() {
  const { unlock, bootstrapNotice, hasPendingSystemRestore, discardSystemRestore } =
    useSecurity()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [blocked, setBlocked] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (blocked) return
    setSubmitting(true)
    setError(null)
    try {
      await unlock(pin)
    } catch (caught) {
      const attempts = failedAttempts + 1
      setFailedAttempts(attempts)
      setError(
        caught instanceof Error ? caught.message : 'FinTrack could not be unlocked',
      )
      if (attempts >= 3) {
        setBlocked(true)
        const delay = Math.min(30, 2 ** (attempts - 2)) * 1_000
        window.setTimeout(() => setBlocked(false), delay)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthFrame>
      <form className="auth-form" onSubmit={onSubmit}>
        <span className="eyebrow">Encrypted workspace</span>
        <h1>Unlock FinTrack</h1>
        <p className="muted">
          Enter the app PIN. It is never stored and cannot be reset remotely.
        </p>
        {bootstrapNotice ? (
          <div className="notice notice-info">
            <Icon name="backup" size={18} />
            <span>{bootstrapNotice}</span>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="unlockPin">App PIN</label>
          <input
            id="unlockPin"
            className="input input-large"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={pin}
            onChange={(event) => setPin(event.target.value)}
          />
        </div>
        {error ? (
          <div className="notice notice-error" role="alert">
            <Icon name="alerts" size={18} />
            <span>{error}</span>
          </div>
        ) : null}
        <button
          type="submit"
          className="button"
          disabled={submitting || blocked || pin.length === 0}
        >
          <Icon name="lock" size={18} />
          {blocked ? 'Wait before trying again' : submitting ? 'Unlocking…' : 'Unlock'}
        </button>
        {hasPendingSystemRestore ? (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setDiscardOpen(true)}
          >
            Set up as new instead
          </button>
        ) : null}
      </form>
      <ConfirmDialog
        open={discardOpen}
        title="Discard the restored snapshot?"
        description="This removes the Android-restored structured-data snapshot from this installation and starts a new empty setup. Policy documents were not part of this snapshot."
        confirmLabel="Discard and set up as new"
        tone="danger"
        onConfirm={() => void discardSystemRestore()}
        onClose={() => setDiscardOpen(false)}
      />
    </AuthFrame>
  )
}
