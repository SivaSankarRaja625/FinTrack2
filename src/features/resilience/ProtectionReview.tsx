import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useFinance } from '../../app/FinanceContext'
import { todayIso } from '../../domain/dates'
import { entityTimestamps } from '../../domain/id'
import type { AppSettings } from '../../domain/types'
import { useToast } from '../../ui/Toast'

const reviewLabels = {
  nominees: 'Nominees and insured people',
  documents: 'Claim contacts and documents',
  retirement: 'Retirement assumptions',
  tax: 'Tax and financial documents',
} as const

export function ProtectionReview() {
  const { data, save } = useFinance()
  const { notify } = useToast()
  const settings = data.settings[0]
  const profile = data.profiles[0]
  const [dependents, setDependents] = useState(String(profile?.financialDependents ?? 0))
  const [jobDate, setJobDate] = useState(profile?.jobChangeReviewDate ?? '')
  const [debtPercent, setDebtPercent] = useState(
    settings?.highCostDebtBps == null ? '' : String(settings.highCostDebtBps / 100),
  )
  const [concentration, setConcentration] = useState(
    settings?.concentrationWarningPercent?.toString() ?? '',
  )
  const [busy, setBusy] = useState(false)

  if (!profile || !settings) return null

  const saveProfile = async (clearJobDate = false) => {
    const count = Number(dependents)
    if (!/^\d{1,2}$/u.test(dependents) || !Number.isInteger(count) || count > 30) {
      notify('Dependents must be a whole number from 0 to 30', 'error')
      return
    }
    setBusy(true)
    try {
      await save('profiles', {
        ...profile,
        financialDependents: count,
        jobChangeReviewDate: clearJobDate ? null : jobDate || null,
        ...entityTimestamps(profile),
      })
      if (clearJobDate) setJobDate('')
      notify(
        clearJobDate ? 'Job-change review marked complete' : 'Protection profile saved',
      )
    } catch (caught) {
      notify(
        caught instanceof Error
          ? caught.message
          : 'Protection profile could not be saved',
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  const saveThresholds = async () => {
    const debt = debtPercent.trim() ? Number(debtPercent) : null
    const share = concentration.trim() ? Number(concentration) : null
    if (
      (debt !== null &&
        (!Number.isFinite(debt) || debt < 0 || debt > 100 || (debt * 100) % 1 !== 0)) ||
      (share !== null && (!Number.isFinite(share) || share < 1 || share > 100))
    ) {
      notify(
        'Enter a debt rate from 0–100% and a concentration share from 1–100%',
        'error',
      )
      return
    }
    setBusy(true)
    try {
      await save('settings', {
        ...settings,
        highCostDebtBps: debt === null ? null : debt * 100,
        concentrationWarningPercent: share,
        ...entityTimestamps(settings),
      })
      notify('Review thresholds saved')
    } catch (caught) {
      notify(
        caught instanceof Error ? caught.message : 'Review thresholds could not be saved',
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  const markReviewed = async (kind: keyof typeof reviewLabels) => {
    setBusy(true)
    try {
      const reviewDates: NonNullable<AppSettings['reviewDates']> = {
        nominees: null,
        documents: null,
        retirement: null,
        tax: null,
        ...settings.reviewDates,
        [kind]: todayIso(),
      }
      await save('settings', {
        ...settings,
        reviewDates,
        ...entityTimestamps(settings),
      })
      notify(`${reviewLabels[kind]} review recorded`)
    } catch (caught) {
      notify(
        caught instanceof Error ? caught.message : 'Review could not be saved',
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h2>Periodic protection review</h2>
          <p className="muted">
            User-entered dates and thresholds drive reminders; no insurer, tax office or
            market data is checked automatically.
          </p>
        </div>
      </header>
      <div className="card-body stack">
        <div className="form-grid">
          <label className="field">
            <span>Financial dependents</span>
            <input
              className="input"
              inputMode="numeric"
              value={dependents}
              onChange={(event) => setDependents(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Job-change review date</span>
            <input
              className="input"
              type="date"
              value={jobDate}
              onChange={(event) => setJobDate(event.target.value)}
            />
          </label>
        </div>
        <div className="cluster">
          <button
            type="button"
            className="button button-secondary"
            disabled={busy}
            onClick={() => void saveProfile()}
          >
            Save protection profile
          </button>
          {profile.jobChangeReviewDate ? (
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={() => void saveProfile(true)}
            >
              Mark job-change review complete
            </button>
          ) : null}
        </div>
        <p className="field-hint">
          On a job change, check when employer cover ends, whether the new policy starts
          immediately, waiting periods and family eligibility. An entered date creates a
          reminder; clear it only after checking.
        </p>
        <div className="form-grid">
          <label className="field">
            <span>Loan rate review threshold (%)</span>
            <input
              className="input"
              inputMode="decimal"
              placeholder="Optional"
              value={debtPercent}
              onChange={(event) => setDebtPercent(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Single-holding concentration threshold (%)</span>
            <input
              className="input"
              inputMode="decimal"
              placeholder="Optional"
              value={concentration}
              onChange={(event) => setConcentration(event.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          className="button button-secondary"
          disabled={busy}
          onClick={() => void saveThresholds()}
        >
          Save review thresholds
        </button>
        <p className="field-hint">
          Optional thresholds flag recorded annual loan rates and the share of manually
          valued holdings. A stale price prevents a concentration estimate; review actual
          rates, fees and diversification independently.
        </p>
        <h3>Record completed reviews</h3>
        <p className="muted">
          Check sources first, then record the date. Reviews recur after 365 days.
        </p>
        {Object.entries(reviewLabels).map(([kind, label]) => {
          const review = kind as keyof typeof reviewLabels
          return (
            <div key={kind} className="cluster cluster-between">
              <span>
                {label}: {settings.reviewDates?.[review] ?? 'Not recorded'}
              </span>
              <button
                type="button"
                className="button button-secondary button-small"
                disabled={busy}
                onClick={() => void markReviewed(review)}
              >
                Mark {kind} reviewed
              </button>
            </div>
          )
        })}
        <p className="field-hint">
          <Link to="/insurance">Check policies and nominees</Link>,{' '}
          <Link to="/loans">review loan rates</Link>, and{' '}
          <Link to="/settings">verify a saved complete backup</Link> before marking those
          tasks done. Consult a qualified adviser for tax or legal decisions.
        </p>
      </div>
    </section>
  )
}
