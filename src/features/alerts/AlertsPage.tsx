import { addDays, format, parseISO } from 'date-fns'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useFinance } from '../../app/FinanceContext'
import { entityTimestamps } from '../../domain/id'
import { paiseToRupees, rupeesToPaise } from '../../domain/money'
import type { AlertRuleType, AppSettings, FinanceAlert } from '../../domain/types'
import { Icon } from '../../ui/Icon'
import { EmptyState, PageHeader } from '../../ui/Page'
import { useToast } from '../../ui/Toast'

const alertRules: Array<{
  type: AlertRuleType
  label: string
  description: string
}> = [
  {
    type: 'budget',
    label: 'Budget thresholds',
    description: 'Warn when a monthly budget reaches the configured percentage.',
  },
  {
    type: 'loan-due',
    label: 'Loan due dates',
    description: 'Upcoming or overdue EMI dates.',
  },
  {
    type: 'loan-payment-mismatch',
    label: 'Loan reconciliation',
    description: 'Recorded payment totals that do not match their components.',
  },
  {
    type: 'insurance-due',
    label: 'Insurance dates',
    description: 'Premium, renewal, and maturity dates.',
  },
  {
    type: 'recurring-due',
    label: 'Recurring entries',
    description: 'Expected income, bills, and transfers.',
  },
  {
    type: 'cash-flow-risk',
    label: 'Projected balance floor',
    description: 'A 30-day recurring forecast falling below your chosen floor.',
  },
  {
    type: 'import-duplicates',
    label: 'Possible import duplicates',
    description: 'CSV rows matching existing transaction fingerprints.',
  },
  {
    type: 'stale-investment',
    label: 'Stale investment prices',
    description: 'Manual holding prices older than 30 days.',
  },
  {
    type: 'goal-contribution',
    label: 'Goal contribution gaps',
    description: 'Planned monthly savings below the calculated requirement.',
  },
  {
    type: 'emergency-fund',
    label: 'Emergency fund',
    description: 'Liquid balances below the profile target.',
  },
  {
    type: 'income-missing',
    label: 'Expected income',
    description: 'No income recorded after the configured payday.',
  },
  {
    type: 'large-expense',
    label: 'Large expenses',
    description: 'Expenses above a transparent multiple of the recent category median.',
  },
  {
    type: 'backup-due',
    label: 'Backup reminders',
    description: 'No complete backup or one older than 30 days.',
  },
  {
    type: 'net-worth-change',
    label: 'Net-worth changes',
    description: 'A change of at least 10% since the latest snapshot.',
  },
]

function severityLabel(severity: FinanceAlert['severity']) {
  return severity.charAt(0).toUpperCase() + severity.slice(1)
}

export function AlertsPage() {
  const {
    data,
    alerts,
    dismissAlert,
    snoozeAlert,
    restoreAlert,
    save,
    notificationStatus,
    syncNotifications,
  } = useFinance()
  const { notify } = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'active' | 'history' | 'settings'>('active')
  const settings = data.settings[0] ?? null
  const [budgetPercent, setBudgetPercent] = useState(
    String(settings?.budgetWarningPercent ?? 80),
  )
  const [expenseMultiplier, setExpenseMultiplier] = useState(
    String(settings?.largeExpenseMultiplier ?? 2),
  )
  const [cashFloor, setCashFloor] = useState(
    settings ? paiseToRupees(settings.cashFlowFloorPaise) : '0.00',
  )

  const updateSettings = async (
    changes: Partial<
      Pick<
        AppSettings,
        | 'notificationsEnabled'
        | 'notificationLeadDays'
        | 'quietHoursStart'
        | 'quietHoursEnd'
        | 'disabledAlertRules'
        | 'budgetWarningPercent'
        | 'largeExpenseMultiplier'
        | 'cashFlowFloorPaise'
      >
    >,
  ) => {
    if (!settings) return
    try {
      await save('settings', {
        ...settings,
        ...changes,
        ...entityTimestamps(settings),
      })
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Alert settings could not be saved',
        'error',
      )
    }
  }

  const toggleNotifications = async (enabled: boolean) => {
    if (!settings) return
    await updateSettings({ notificationsEnabled: enabled })
    const status = await syncNotifications(enabled)
    if (!enabled) {
      notify('Scheduled reminders disabled')
    } else if (!status.supported) {
      await updateSettings({ notificationsEnabled: false })
      notify('Scheduled notifications are available in the Android app', 'error')
    } else if (status.permission !== 'granted') {
      await updateSettings({ notificationsEnabled: false })
      notify('Android notification permission was not granted', 'error')
    } else {
      notify(
        `${status.scheduled} local reminder${status.scheduled === 1 ? '' : 's'} scheduled`,
      )
    }
  }

  const saveThresholds = async () => {
    try {
      const budgetWarningPercent = Number(budgetPercent)
      const largeExpenseMultiplier = Number(expenseMultiplier)
      const cashFlowFloorPaise = rupeesToPaise(cashFloor)
      if (
        !Number.isFinite(budgetWarningPercent) ||
        budgetWarningPercent < 1 ||
        budgetWarningPercent > 100
      ) {
        throw new Error('Budget warning must be between 1% and 100%')
      }
      if (
        !Number.isFinite(largeExpenseMultiplier) ||
        largeExpenseMultiplier < 1 ||
        largeExpenseMultiplier > 20
      ) {
        throw new Error('Large-expense multiple must be between 1 and 20')
      }
      if (cashFlowFloorPaise < 0) throw new Error('Cash-flow floor cannot be negative')
      await updateSettings({
        budgetWarningPercent,
        largeExpenseMultiplier,
        cashFlowFloorPaise,
      })
      notify('Alert thresholds saved')
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Thresholds could not be saved',
        'error',
      )
    }
  }

  const handleDismiss = async (alert: FinanceAlert) => {
    await dismissAlert(alert)
    notify('Alert dismissed')
  }

  const handleSnooze = async (alert: FinanceAlert, days: number) => {
    await snoozeAlert(alert, addDays(new Date(), days).toISOString())
    notify(`Alert snoozed for ${days} day${days === 1 ? '' : 's'}`)
  }

  return (
    <div className="page">
      <PageHeader
        title="Alerts"
        description="Deterministic reminders and exceptions calculated only from your local records."
      />

      <div className="tabs" role="tablist" aria-label="Alert views">
        {(['active', 'history', 'settings'] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            className={`tab${tab === item ? ' tab-active' : ''}`}
            onClick={() => setTab(item)}
          >
            {item.charAt(0).toUpperCase() + item.slice(1)}
            {item === 'active' && alerts.length > 0 ? (
              <span className="tab-count">{alerts.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'active' ? (
        <section className="stack">
          <p className="disclaimer">
            Alerts are informational calculations, not financial advice. Open “Why this
            alert” to see the rule and source values.
          </p>
          {alerts.length === 0 ? (
            <div className="card">
              <EmptyState
                title="No active alerts"
                description="No enabled rule currently crosses its date or value threshold."
              />
            </div>
          ) : (
            alerts.map((alert) => (
              <article
                key={alert.key}
                className={`card alert-card alert-${alert.severity}`}
              >
                <div className="alert-marker" aria-hidden="true" />
                <div className="alert-content">
                  <div className="cluster cluster-between">
                    <div>
                      <span className={`badge severity-${alert.severity}`}>
                        {severityLabel(alert.severity)}
                      </span>
                      <h2>{alert.title}</h2>
                    </div>
                    {alert.dueDate ? (
                      <time dateTime={alert.dueDate}>
                        {format(parseISO(alert.dueDate), 'dd MMM yyyy')}
                      </time>
                    ) : null}
                  </div>
                  <p>{alert.detail}</p>
                  <details>
                    <summary>Why this alert</summary>
                    <p>{alert.evidence}</p>
                    <p>
                      Rule:{' '}
                      {alertRules.find((rule) => rule.type === alert.ruleType)?.label}
                    </p>
                  </details>
                  <div className="cluster alert-actions">
                    <button
                      type="button"
                      className="button button-small"
                      onClick={() => navigate(alert.route)}
                    >
                      Review
                      <Icon name="chevron-right" size={15} />
                    </button>
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={() => void handleSnooze(alert, 1)}
                    >
                      Snooze 1 day
                    </button>
                    <button
                      type="button"
                      className="button-link"
                      onClick={() => void handleDismiss(alert)}
                    >
                      Dismiss this occurrence
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      ) : null}

      {tab === 'history' ? (
        <section className="card">
          <header className="card-header">
            <div>
              <h2>Alert history</h2>
              <p className="muted">The latest 200 dismiss and snooze actions.</p>
            </div>
          </header>
          {!settings || settings.alertHistory.length === 0 ? (
            <EmptyState
              title="No alert history"
              description="Dismissed and snoozed occurrences will appear here."
            />
          ) : (
            <div className="simple-list">
              {settings.alertHistory.map((entry) => (
                <div key={entry.id} className="history-row">
                  <div>
                    <strong>{entry.title}</strong>
                    <span>
                      {entry.action === 'dismissed'
                        ? 'Dismissed'
                        : `Snoozed until ${format(new Date(entry.snoozedUntil ?? entry.actionAt), 'dd MMM yyyy, HH:mm')}`}
                      {' · '}
                      {format(new Date(entry.actionAt), 'dd MMM yyyy, HH:mm')}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => void restoreAlert(entry.key)}
                  >
                    Allow again
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === 'settings' && settings ? (
        <div className="stack">
          <section className="card">
            <header className="card-header">
              <div>
                <h2>Android reminders</h2>
                <p className="muted">
                  Scheduled on the device. No server or network connection is used.
                </p>
              </div>
              <label className="switch-row">
                <input
                  type="checkbox"
                  checked={settings.notificationsEnabled}
                  onChange={(event) => void toggleNotifications(event.target.checked)}
                />
                <span>{settings.notificationsEnabled ? 'Enabled' : 'Disabled'}</span>
              </label>
            </header>
            <div className="settings-grid">
              <label className="field">
                <span>Reminder lead time</span>
                <select
                  className="select"
                  value={settings.notificationLeadDays}
                  onChange={(event) =>
                    void updateSettings({
                      notificationLeadDays: Number(event.target.value),
                    })
                  }
                >
                  <option value={0}>On the due date</option>
                  <option value={1}>1 day before</option>
                  <option value={3}>3 days before</option>
                  <option value={7}>7 days before</option>
                  <option value={14}>14 days before</option>
                  <option value={30}>30 days before</option>
                </select>
              </label>
              <label className="field">
                <span>Quiet hours start</span>
                <input
                  className="input"
                  type="time"
                  value={settings.quietHoursStart}
                  onChange={(event) =>
                    void updateSettings({ quietHoursStart: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Quiet hours end</span>
                <input
                  className="input"
                  type="time"
                  value={settings.quietHoursEnd}
                  onChange={(event) =>
                    void updateSettings({ quietHoursEnd: event.target.value })
                  }
                />
              </label>
              <div className="notification-status">
                <span>Permission</span>
                <strong>
                  {notificationStatus.supported
                    ? notificationStatus.permission.replaceAll('-', ' ')
                    : 'Android app only'}
                </strong>
                {notificationStatus.error ? (
                  <small className="text-danger">{notificationStatus.error}</small>
                ) : (
                  <small>{notificationStatus.scheduled} reminders scheduled</small>
                )}
              </div>
            </div>
          </section>

          <section className="card">
            <header className="card-header">
              <div>
                <h2>Thresholds</h2>
                <p className="muted">Inputs used directly by the rules below.</p>
              </div>
            </header>
            <div className="settings-grid">
              <label className="field">
                <span>Budget warning percentage</span>
                <div className="suffix-field">
                  <input
                    className="input"
                    inputMode="numeric"
                    value={budgetPercent}
                    onChange={(event) => setBudgetPercent(event.target.value)}
                  />
                  <span>%</span>
                </div>
              </label>
              <label className="field">
                <span>Large-expense median multiple</span>
                <div className="suffix-field">
                  <input
                    className="input"
                    inputMode="decimal"
                    value={expenseMultiplier}
                    onChange={(event) => setExpenseMultiplier(event.target.value)}
                  />
                  <span>×</span>
                </div>
              </label>
              <label className="field">
                <span>Projected liquid-balance floor</span>
                <div className="currency-field">
                  <span>₹</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={cashFloor}
                    onChange={(event) => setCashFloor(event.target.value)}
                  />
                </div>
              </label>
              <div className="field settings-action">
                <button
                  type="button"
                  className="button"
                  onClick={() => void saveThresholds()}
                >
                  Save thresholds
                </button>
              </div>
            </div>
          </section>

          <section className="card">
            <header className="card-header">
              <div>
                <h2>Rules</h2>
                <p className="muted">Disable only the alert types you do not need.</p>
              </div>
            </header>
            <div className="rule-list">
              {alertRules.map((rule) => {
                const enabled = !settings.disabledAlertRules.includes(rule.type)
                return (
                  <label key={rule.type} className="rule-row">
                    <span>
                      <strong>{rule.label}</strong>
                      <small>{rule.description}</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() =>
                        void updateSettings({
                          disabledAlertRules: enabled
                            ? [...settings.disabledAlertRules, rule.type]
                            : settings.disabledAlertRules.filter(
                                (item) => item !== rule.type,
                              ),
                        })
                      }
                    />
                  </label>
                )
              })}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
