import { Capacitor } from '@capacitor/core'
import { format } from 'date-fns'
import { useEffect, useState } from 'react'

import { useFinance } from '../../app/FinanceContext'
import { useSecurity } from '../../app/SecurityContext'
import { inspectCompleteBackup } from '../../data/backup'
import { toArrayBuffer } from '../../data/encoding'
import { entityTimestamps, newId } from '../../domain/id'
import { paiseToRupees, rupeesToPaise } from '../../domain/money'
import type { AppSettings, Category, UserProfile } from '../../domain/types'
import {
  downloadBytes,
  estimateStorage,
  readFileBytes,
  requestPersistentStorage,
} from '../../platform/files'
import { getSystemBackupCapability } from '../../platform/system-backup'
import { ConfirmDialog, Dialog } from '../../ui/Dialog'
import { Icon } from '../../ui/Icon'
import { PageHeader } from '../../ui/Page'
import { useToast } from '../../ui/Toast'

function validPin(pin: string): boolean {
  return pin.length >= 6 && /[a-z]/iu.test(pin) && /\d/u.test(pin)
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return 'Unavailable'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

async function fileFingerprint(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes))
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export function SettingsPage() {
  const {
    data,
    attachmentMetadata,
    save,
    exportCompleteBackup,
    verifyCompleteBackup,
    restoreCompleteBackup,
    setAndroidBackup,
  } = useFinance()
  const { changePin, wipe, lock } = useSecurity()
  const { notify } = useToast()
  const settings = data.settings[0]!
  const profile = data.profiles[0]!
  const backupCapability = getSystemBackupCapability()
  const [section, setSection] = useState<
    'profile' | 'categories' | 'security' | 'backup' | 'diagnostics'
  >('profile')
  const [profileValues, setProfileValues] = useState({
    name: profile.name,
    monthlyIncome: paiseToRupees(profile.monthlyIncomePaise),
    essentialMonthly: paiseToRupees(profile.essentialMonthlyPaise),
    payDay: String(profile.payDay),
    emergencyMonths: String(profile.emergencyFundMonths),
  })
  const [categoryValues, setCategoryValues] = useState({
    name: '',
    kind: 'expense' as Category['kind'],
    essential: false,
  })
  const [currentPin, setCurrentPin] = useState('')
  const [nextPin, setNextPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [exportPin, setExportPin] = useState('')
  const [confirmExportPin, setConfirmExportPin] = useState('')
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [verifyFile, setVerifyFile] = useState<File | null>(null)
  const [verifyPin, setVerifyPin] = useState('')
  const [restorePin, setRestorePin] = useState('')
  const [safetyPin, setSafetyPin] = useState('')
  const [safetyFile, setSafetyFile] = useState<File | null>(null)
  const [safetyFingerprint, setSafetyFingerprint] = useState<string | null>(null)
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false)
  const [wipeText, setWipeText] = useState('')
  const [wipeOpen, setWipeOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [storage, setStorage] = useState({ usage: 0, quota: 0 })
  const [persistence, setPersistence] = useState<
    'unknown' | 'unsupported' | 'granted' | 'declined'
  >('unknown')

  useEffect(() => {
    void estimateStorage().then(setStorage)
  }, [attachmentMetadata, data])

  const saveSettings = async (changes: Partial<AppSettings>) => {
    try {
      await save('settings', {
        ...settings,
        ...changes,
        ...entityTimestamps(settings),
      })
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Settings could not be saved',
        'error',
      )
    }
  }

  const saveProfile = async () => {
    setBusy('profile')
    try {
      const monthlyIncomePaise = rupeesToPaise(profileValues.monthlyIncome)
      const essentialMonthlyPaise = rupeesToPaise(profileValues.essentialMonthly)
      const payDay = Number(profileValues.payDay)
      const emergencyFundMonths = Number(profileValues.emergencyMonths)
      if (!profileValues.name.trim()) throw new Error('Enter your name')
      if (monthlyIncomePaise < 0 || essentialMonthlyPaise < 0) {
        throw new Error('Monthly amounts cannot be negative')
      }
      if (!Number.isInteger(payDay) || payDay < 1 || payDay > 31) {
        throw new Error('Payday must be between 1 and 31')
      }
      if (
        !Number.isFinite(emergencyFundMonths) ||
        emergencyFundMonths < 0 ||
        emergencyFundMonths > 36
      ) {
        throw new Error('Emergency-fund target must be between 0 and 36 months')
      }
      const updated: UserProfile = {
        ...profile,
        name: profileValues.name.trim(),
        monthlyIncomePaise,
        essentialMonthlyPaise,
        payDay,
        emergencyFundMonths,
        ...entityTimestamps(profile),
      }
      await save('profiles', updated)
      notify('Profile updated')
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Profile could not be saved',
        'error',
      )
    } finally {
      setBusy(null)
    }
  }

  const addCategory = async () => {
    const name = categoryValues.name.trim()
    if (!name) {
      notify('Enter a category name', 'error')
      return
    }
    if (
      data.categories.some(
        (category) =>
          category.kind === categoryValues.kind &&
          category.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      notify('A category with this name and type already exists', 'error')
      return
    }
    try {
      await save('categories', {
        id: newId(),
        name,
        kind: categoryValues.kind,
        parentId: null,
        essential: categoryValues.essential,
        color: categoryValues.kind === 'income' ? '#137547' : '#64748b',
        system: false,
        archived: false,
        ...entityTimestamps(),
      })
      setCategoryValues({ name: '', kind: 'expense', essential: false })
      notify('Category added')
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Category could not be added',
        'error',
      )
    }
  }

  const changeCategoryState = async (category: Category) => {
    try {
      await save('categories', {
        ...category,
        archived: !category.archived,
        ...entityTimestamps(category),
      })
      notify(category.archived ? 'Category restored' : 'Category archived')
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Category could not be updated',
        'error',
      )
    }
  }

  const submitPinChange = async () => {
    setBusy('pin')
    try {
      if (!validPin(nextPin)) {
        throw new Error('Use at least six characters with a letter and a number')
      }
      if (nextPin !== confirmPin) throw new Error('New PINs do not match')
      await changePin(currentPin, nextPin)
      setCurrentPin('')
      setNextPin('')
      setConfirmPin('')
      notify('App PIN changed')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'PIN could not be changed', 'error')
    } finally {
      setBusy(null)
    }
  }

  const exportBackup = async () => {
    setBusy('export')
    try {
      if (!validPin(exportPin)) {
        throw new Error('Use at least six characters with a letter and a number')
      }
      if (exportPin !== confirmExportPin) throw new Error('Backup PINs do not match')
      const bytes = await exportCompleteBackup(exportPin)
      const result = await downloadBytes(
        bytes,
        `fintrack-backup-${format(new Date(), 'yyyy-MM-dd-HHmm')}.finapp`,
        'application/octet-stream',
      )
      setExportPin('')
      setConfirmExportPin('')
      notify(
        result === 'shared'
          ? 'Share sheet closed. FinTrack cannot confirm a copy was saved; reopen the saved file to verify it.'
          : 'Backup download started. Reopen the saved file to confirm it is recoverable.',
      )
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Backup could not be created',
        'error',
      )
    } finally {
      setBusy(null)
    }
  }

  const verifyBackup = async () => {
    if (!verifyFile) return
    setBusy('verify')
    try {
      const summary = await verifyCompleteBackup(
        await readFileBytes(verifyFile),
        verifyPin,
      )
      setVerifyPin('')
      setVerifyFile(null)
      notify(
        summary.createdAt
          ? 'Saved backup authenticated and validated without replacing your data'
          : 'Legacy backup validated; its creation date cannot be authenticated',
      )
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Backup verification failed',
        'error',
      )
    } finally {
      setBusy(null)
    }
  }

  const closeRestore = () => {
    setRestoreConfirmOpen(false)
    setSafetyFile(null)
    setSafetyFingerprint(null)
  }

  const prepareSafetyBackup = async () => {
    if (!restoreFile) {
      notify('Choose a backup to restore', 'error')
      return
    }
    setBusy('safety')
    try {
      if (!validPin(safetyPin)) {
        throw new Error('Choose a strong PIN for the safety backup')
      }
      await inspectCompleteBackup(await readFileBytes(restoreFile), restorePin)
      const safety = await exportCompleteBackup(safetyPin)
      const fingerprint = await fileFingerprint(safety)
      await downloadBytes(
        safety,
        `fintrack-before-restore-${format(new Date(), 'yyyy-MM-dd-HHmm')}.finapp`,
        'application/octet-stream',
      )
      setSafetyFingerprint(fingerprint)
      notify('Reopen the saved safety file to verify it before replacing any data')
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Safety backup could not be exported',
        'error',
      )
    } finally {
      setBusy(null)
    }
  }

  const restoreBackup = async () => {
    if (!restoreFile || !safetyFile || !safetyFingerprint) {
      notify('Reopen the saved safety file before restoring', 'error')
      return
    }
    setBusy('restore')
    try {
      const safetyBytes = await readFileBytes(safetyFile)
      if ((await fileFingerprint(safetyBytes)) !== safetyFingerprint) {
        throw new Error('The selected safety file is not the copy just exported')
      }
      await inspectCompleteBackup(safetyBytes, safetyPin, profile)
      const bytes = await readFileBytes(restoreFile)
      await restoreCompleteBackup(bytes, restorePin)
      setRestoreFile(null)
      setRestorePin('')
      setSafetyPin('')
      closeRestore()
      notify('Backup restored and current data replaced')
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Backup could not be restored',
        'error',
      )
    } finally {
      setBusy(null)
    }
  }

  const toggleSystemBackup = async (enabled: boolean) => {
    setBusy('system-backup')
    try {
      await setAndroidBackup(enabled)
      notify(
        enabled
          ? 'Encrypted Android backup snapshot prepared'
          : 'Android backup snapshot removed from this installation',
      )
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Android backup setting failed',
        'error',
      )
    } finally {
      setBusy(null)
    }
  }

  const requestPersistence = async () => {
    try {
      const result = await requestPersistentStorage()
      setPersistence(
        !result.supported ? 'unsupported' : result.persisted ? 'granted' : 'declined',
      )
      notify(
        result.persisted
          ? 'Persistent browser storage granted'
          : result.supported
            ? 'The browser did not grant persistent storage'
            : 'Persistent-storage requests are unavailable here',
        result.persisted ? 'success' : 'error',
      )
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Storage request failed', 'error')
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Settings"
        description="Profile, categories, security, recovery, and offline diagnostics."
      />

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {(
            [
              ['profile', 'Profile & preferences'],
              ['categories', 'Categories'],
              ['security', 'Security'],
              ['backup', 'Backup & restore'],
              ['diagnostics', 'Storage & offline'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={section === id ? 'settings-nav-active' : ''}
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {section === 'profile' ? (
            <>
              <section className="card">
                <header className="card-header">
                  <div>
                    <h2>Working profile</h2>
                    <p className="muted">
                      Used for payday and emergency-fund calculations.
                    </p>
                  </div>
                </header>
                <div className="settings-form">
                  <label className="field field-span">
                    <span>Name</span>
                    <input
                      className="input"
                      value={profileValues.name}
                      onChange={(event) =>
                        setProfileValues((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Expected monthly take-home</span>
                    <div className="currency-field">
                      <span>₹</span>
                      <input
                        className="input"
                        inputMode="decimal"
                        value={profileValues.monthlyIncome}
                        onChange={(event) =>
                          setProfileValues((current) => ({
                            ...current,
                            monthlyIncome: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </label>
                  <label className="field">
                    <span>Essential monthly expenses</span>
                    <div className="currency-field">
                      <span>₹</span>
                      <input
                        className="input"
                        inputMode="decimal"
                        value={profileValues.essentialMonthly}
                        onChange={(event) =>
                          setProfileValues((current) => ({
                            ...current,
                            essentialMonthly: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </label>
                  <label className="field">
                    <span>Payday</span>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={31}
                      value={profileValues.payDay}
                      onChange={(event) =>
                        setProfileValues((current) => ({
                          ...current,
                          payDay: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Emergency-fund target (months)</span>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={36}
                      step="0.5"
                      value={profileValues.emergencyMonths}
                      onChange={(event) =>
                        setProfileValues((current) => ({
                          ...current,
                          emergencyMonths: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="settings-save field-span">
                    <button
                      type="button"
                      className="button"
                      disabled={busy === 'profile'}
                      onClick={() => void saveProfile()}
                    >
                      {busy === 'profile' ? 'Saving…' : 'Save profile'}
                    </button>
                  </div>
                </div>
              </section>

              <section className="card">
                <header className="card-header">
                  <div>
                    <h2>Appearance & lock timing</h2>
                    <p className="muted">Applies on this installation.</p>
                  </div>
                </header>
                <div className="settings-form">
                  <label className="field">
                    <span>Theme</span>
                    <select
                      className="select"
                      value={settings.theme}
                      onChange={(event) =>
                        void saveSettings({
                          theme: event.target.value as AppSettings['theme'],
                        })
                      }
                    >
                      <option value="system">Use device setting</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Date format</span>
                    <select
                      className="select"
                      value={settings.dateFormat}
                      onChange={(event) =>
                        void saveSettings({
                          dateFormat: event.target.value as AppSettings['dateFormat'],
                        })
                      }
                    >
                      <option value="dd MMM yyyy">24 Sep 2026</option>
                      <option value="dd/MM/yyyy">24/09/2026</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Lock after inactivity</span>
                    <select
                      className="select"
                      value={settings.autoLockMinutes}
                      onChange={(event) =>
                        void saveSettings({
                          autoLockMinutes: Number(event.target.value),
                        })
                      }
                    >
                      <option value={1}>1 minute</option>
                      <option value={5}>5 minutes</option>
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                    </select>
                  </label>
                </div>
              </section>
            </>
          ) : null}

          {section === 'categories' ? (
            <section className="card">
              <header className="card-header">
                <div>
                  <h2>Income & expense categories</h2>
                  <p className="muted">
                    Archived categories remain on historical transactions.
                  </p>
                </div>
              </header>
              <div className="category-create">
                <label className="field">
                  <span>Name</span>
                  <input
                    className="input"
                    value={categoryValues.name}
                    onChange={(event) =>
                      setCategoryValues((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Type</span>
                  <select
                    className="select"
                    value={categoryValues.kind}
                    onChange={(event) =>
                      setCategoryValues((current) => ({
                        ...current,
                        kind: event.target.value as Category['kind'],
                      }))
                    }
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={categoryValues.essential}
                    onChange={(event) =>
                      setCategoryValues((current) => ({
                        ...current,
                        essential: event.target.checked,
                      }))
                    }
                  />
                  <span>Essential expense</span>
                </label>
                <button
                  type="button"
                  className="button"
                  onClick={() => void addCategory()}
                >
                  Add category
                </button>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Type</th>
                      <th>Classification</th>
                      <th>Status</th>
                      <th>
                        <span className="sr-only">Action</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.categories]
                      .sort(
                        (left, right) =>
                          left.kind.localeCompare(right.kind) ||
                          left.name.localeCompare(right.name),
                      )
                      .map((category) => (
                        <tr key={category.id}>
                          <td>
                            <strong>{category.name}</strong>
                            {category.system ? <small>Default category</small> : null}
                          </td>
                          <td>{category.kind}</td>
                          <td>{category.essential ? 'Essential' : 'Discretionary'}</td>
                          <td>{category.archived ? 'Archived' : 'Active'}</td>
                          <td>
                            <button
                              type="button"
                              className="button button-secondary button-small"
                              onClick={() => void changeCategoryState(category)}
                            >
                              {category.archived ? 'Restore' : 'Archive'}
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {section === 'security' ? (
            <>
              <section className="card">
                <header className="card-header">
                  <div>
                    <h2>Change app PIN</h2>
                    <p className="muted">
                      Rewraps the local data key; your encrypted records do not need to be
                      rewritten.
                    </p>
                  </div>
                </header>
                <div className="settings-form">
                  <label className="field field-span">
                    <span>Current PIN</span>
                    <input
                      className="input"
                      type="password"
                      autoComplete="current-password"
                      value={currentPin}
                      onChange={(event) => setCurrentPin(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>New PIN</span>
                    <input
                      className="input"
                      type="password"
                      autoComplete="new-password"
                      value={nextPin}
                      onChange={(event) => setNextPin(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Confirm new PIN</span>
                    <input
                      className="input"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPin}
                      onChange={(event) => setConfirmPin(event.target.value)}
                    />
                  </label>
                  <div className="settings-save field-span">
                    <button
                      type="button"
                      className="button"
                      disabled={busy === 'pin'}
                      onClick={() => void submitPinChange()}
                    >
                      {busy === 'pin' ? 'Changing…' : 'Change PIN'}
                    </button>
                  </div>
                </div>
              </section>

              <section className="card card-body">
                <h2>Lock now</h2>
                <p className="muted">
                  Clears the unwrapped data key from this app session.
                </p>
                <div>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={lock}
                  >
                    <Icon name="lock" size={17} />
                    Lock FinTrack
                  </button>
                </div>
              </section>

              <section className="danger-zone">
                <div>
                  <strong>Erase this workspace</strong>
                  <span>
                    Permanently deletes local records, documents, and the prepared Android
                    snapshot. Export a complete backup first.
                  </span>
                </div>
                <div className="cluster">
                  <input
                    className="input danger-confirm-input"
                    aria-label="Type DELETE to enable workspace erasure"
                    placeholder="Type DELETE"
                    value={wipeText}
                    onChange={(event) => setWipeText(event.target.value)}
                  />
                  <button
                    type="button"
                    className="button button-danger"
                    disabled={wipeText !== 'DELETE'}
                    onClick={() => setWipeOpen(true)}
                  >
                    Erase workspace
                  </button>
                </div>
              </section>
            </>
          ) : null}

          {section === 'backup' ? (
            <>
              <section className="card">
                <header className="card-header">
                  <div>
                    <h2>Complete encrypted backup</h2>
                    <p className="muted">
                      Includes all structured records and encrypted policy documents.
                    </p>
                  </div>
                  {settings.verifiedBackup?.createdAt ? (
                    <span className="badge badge-positive">
                      Verified file dated{' '}
                      {format(new Date(settings.verifiedBackup.createdAt), 'dd MMM yyyy')}
                    </span>
                  ) : (
                    <span className="badge badge-danger">No dated backup verified</span>
                  )}
                </header>
                <div className="settings-form">
                  <label className="field">
                    <span>Backup PIN</span>
                    <input
                      className="input"
                      type="password"
                      autoComplete="new-password"
                      value={exportPin}
                      onChange={(event) => setExportPin(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Confirm backup PIN</span>
                    <input
                      className="input"
                      type="password"
                      autoComplete="new-password"
                      value={confirmExportPin}
                      onChange={(event) => setConfirmExportPin(event.target.value)}
                    />
                  </label>
                  <p className="field-hint field-span">
                    This PIN cannot be reset. Store the exported file away from this
                    device. Exporting or opening the share sheet does not prove the file
                    was saved.
                  </p>
                  <div className="settings-save field-span">
                    <button
                      type="button"
                      className="button"
                      disabled={busy === 'export'}
                      onClick={() => void exportBackup()}
                    >
                      <Icon name="backup" size={17} />
                      {busy === 'export' ? 'Encrypting…' : 'Export complete backup'}
                    </button>
                  </div>
                </div>
              </section>

              <section className="card">
                <header className="card-header">
                  <div>
                    <h2>Verify a saved backup</h2>
                    <p className="muted">
                      Reopen the file you saved, enter its PIN and check its records and
                      documents without restoring them.
                    </p>
                  </div>
                </header>
                <div className="settings-form">
                  <label className="field field-span">
                    <span>Saved .finapp file to verify</span>
                    <input
                      className="input"
                      type="file"
                      accept=".finapp,application/octet-stream"
                      onChange={(event) => setVerifyFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <label className="field">
                    <span>Saved backup PIN</span>
                    <input
                      className="input"
                      type="password"
                      value={verifyPin}
                      onChange={(event) => setVerifyPin(event.target.value)}
                    />
                  </label>
                  <div className="settings-save field-span">
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={!verifyFile || !verifyPin || busy === 'verify'}
                      onClick={() => void verifyBackup()}
                    >
                      {busy === 'verify' ? 'Verifying…' : 'Verify saved backup'}
                    </button>
                  </div>
                </div>
                <div className="card-body">
                  {settings.verifiedBackup ? (
                    <p>
                      Last checked{' '}
                      {format(
                        new Date(settings.verifiedBackup.verifiedAt),
                        'dd MMM yyyy, HH:mm',
                      )}
                      : {settings.verifiedBackup.recordCount} records and{' '}
                      {settings.verifiedBackup.attachmentCount} documents.
                      {settings.verifiedBackup.createdAt
                        ? ` File created ${format(new Date(settings.verifiedBackup.createdAt), 'dd MMM yyyy')}.`
                        : ' Legacy file: creation date cannot be verified; export a new backup.'}
                    </p>
                  ) : (
                    <p className="muted">
                      No saved file has been checked on this installation.
                    </p>
                  )}
                </div>
              </section>

              <section className="card">
                <header className="card-header">
                  <div>
                    <h2>Restore complete backup</h2>
                    <p className="muted">
                      Validates the candidate, exports a safety backup, then atomically
                      replaces this workspace.
                    </p>
                  </div>
                </header>
                <div className="settings-form">
                  <label className="field field-span">
                    <span>.finapp backup file</span>
                    <input
                      className="input"
                      type="file"
                      accept=".finapp,application/octet-stream"
                      onChange={(event) => {
                        setRestoreFile(event.target.files?.[0] ?? null)
                        setSafetyFingerprint(null)
                        setSafetyFile(null)
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>Backup file PIN</span>
                    <input
                      className="input"
                      type="password"
                      value={restorePin}
                      onChange={(event) => setRestorePin(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>New safety-backup PIN</span>
                    <input
                      className="input"
                      type="password"
                      value={safetyPin}
                      onChange={(event) => setSafetyPin(event.target.value)}
                    />
                  </label>
                  <div className="settings-save field-span">
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={!restoreFile || !restorePin || !safetyPin}
                      onClick={() => setRestoreConfirmOpen(true)}
                    >
                      Review destructive restore
                    </button>
                  </div>
                </div>
              </section>

              <section className="card">
                <header className="card-header">
                  <div>
                    <h2>Android system backup</h2>
                    <p className="muted">
                      Explicit opt-in for one encrypted structured-data snapshot.
                    </p>
                  </div>
                  <label className="switch-row">
                    <input
                      type="checkbox"
                      checked={settings.androidBackupEnabled}
                      disabled={!backupCapability.available || busy === 'system-backup'}
                      onChange={(event) => void toggleSystemBackup(event.target.checked)}
                    />
                    <span>{settings.androidBackupEnabled ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </header>
                <div className="backup-facts">
                  <p>
                    Android—not FinTrack—may upload the snapshot through the device’s
                    configured backup transport. The app has no network permission.
                  </p>
                  <p>
                    Cloud backup is allowed only when device-lock-backed client-side
                    encryption is available. Device transfer remains available.
                  </p>
                  <p>
                    Policy documents are excluded. Use complete encrypted backups for
                    those files.
                  </p>
                  <dl className="detail-list">
                    <div>
                      <dt>Availability</dt>
                      <dd>
                        {backupCapability.available
                          ? 'Android app'
                          : 'Not available in this browser build'}
                      </dd>
                    </div>
                    <div>
                      <dt>Latest snapshot prepared</dt>
                      <dd>
                        {settings.lastSystemSnapshotAt
                          ? format(
                              new Date(settings.lastSystemSnapshotAt),
                              'dd MMM yyyy, HH:mm',
                            )
                          : 'Never'}
                      </dd>
                    </div>
                  </dl>
                  <p className="field-hint">
                    Android controls its upload schedule. FinTrack cannot confirm a “last
                    uploaded to Google” time or immediate deletion of a previously
                    transported copy.
                  </p>
                </div>
              </section>
            </>
          ) : null}

          {section === 'diagnostics' ? (
            <>
              <section className="card">
                <header className="card-header">
                  <div>
                    <h2>Local storage</h2>
                    <p className="muted">Browser/WebView quota estimates.</p>
                  </div>
                </header>
                <dl className="diagnostic-grid">
                  <div>
                    <dt>Estimated use</dt>
                    <dd>{formatBytes(storage.usage)}</dd>
                  </div>
                  <div>
                    <dt>Estimated quota</dt>
                    <dd>{formatBytes(storage.quota)}</dd>
                  </div>
                  <div>
                    <dt>Encrypted documents</dt>
                    <dd>{attachmentMetadata.length}</dd>
                  </div>
                  <div>
                    <dt>Persistence request</dt>
                    <dd>{persistence}</dd>
                  </div>
                </dl>
                <div className="card-footer">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void requestPersistence()}
                  >
                    Request persistent storage
                  </button>
                </div>
              </section>

              <section className="card">
                <header className="card-header">
                  <div>
                    <h2>Offline boundary</h2>
                    <p className="muted">
                      Build and runtime controls that keep FinTrack local.
                    </p>
                  </div>
                </header>
                <dl className="diagnostic-grid">
                  <div>
                    <dt>Runtime platform</dt>
                    <dd>{Capacitor.getPlatform()}</dd>
                  </div>
                  <div>
                    <dt>Application network calls</dt>
                    <dd>None implemented</dd>
                  </div>
                  <div>
                    <dt>Content Security Policy</dt>
                    <dd>Connections denied in production</dd>
                  </div>
                  <div>
                    <dt>Android network permission</dt>
                    <dd>Rejected by build verification</dd>
                  </div>
                  <div>
                    <dt>Remote assets and telemetry</dt>
                    <dd>None</dd>
                  </div>
                  <div>
                    <dt>Updates</dt>
                    <dd>Package installer or Google Play only</dd>
                  </div>
                </dl>
              </section>
            </>
          ) : null}
        </div>
      </div>

      <Dialog
        open={restoreConfirmOpen}
        title="Replace all current data?"
        description="Authenticate the candidate, save a complete safety backup of current data, and reopen that same saved file before replacing records and documents."
        onClose={closeRestore}
        footer={
          <div className="cluster cluster-between" style={{ width: '100%' }}>
            <button
              type="button"
              className="button button-secondary"
              onClick={closeRestore}
            >
              Cancel
            </button>
            {safetyFingerprint ? (
              <button
                type="button"
                className="button button-danger"
                disabled={!safetyFile || busy !== null}
                onClick={() => void restoreBackup()}
              >
                {busy === 'restore' ? 'Restoring…' : 'Verify safety copy and restore'}
              </button>
            ) : (
              <button
                type="button"
                className="button"
                disabled={busy !== null}
                onClick={() => void prepareSafetyBackup()}
              >
                {busy === 'safety' ? 'Exporting…' : 'Create safety backup'}
              </button>
            )}
          </div>
        }
      >
        {safetyFingerprint ? (
          <label className="field">
            <span>Saved safety-backup file</span>
            <input
              className="input"
              type="file"
              accept=".finapp,application/octet-stream"
              onChange={(event) => setSafetyFile(event.target.files?.[0] ?? null)}
            />
            <small>
              Choose the copy just saved from the download or Android share sheet. The
              selected file must match byte-for-byte and authenticate with the safety PIN.
            </small>
          </label>
        ) : (
          <p>
            Nothing will be replaced until you choose the saved safety copy and confirm
            this second step. Closing a share sheet alone does not prove it was saved.
          </p>
        )}
      </Dialog>
      <ConfirmDialog
        open={wipeOpen}
        title="Erase this encrypted workspace?"
        description="This permanently removes every local record, policy document, encryption key, and prepared Android snapshot from this installation. This cannot be undone."
        confirmLabel="Erase everything"
        tone="danger"
        onConfirm={() => void wipe()}
        onClose={() => setWipeOpen(false)}
      />
    </div>
  )
}
