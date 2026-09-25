import { differenceInCalendarMonths, format, parseISO } from 'date-fns'
import { useMemo, useState } from 'react'

import { useFinance } from '../../app/FinanceContext'
import {
  calculateAccountBalances,
  requiredMonthlyForGoal,
} from '../../domain/calculations'
import { todayIso } from '../../domain/dates'
import { formatMoney, percentageOf } from '../../domain/money'
import type { Goal } from '../../domain/types'
import { ConfirmDialog } from '../../ui/Dialog'
import { Icon } from '../../ui/Icon'
import { EmptyState, Metric, PageHeader } from '../../ui/Page'
import { useToast } from '../../ui/Toast'
import { GoalDialog } from './GoalDialog'

export function GoalsPage() {
  const { data, remove } = useFinance()
  const { notify } = useToast()
  const [goalDialog, setGoalDialog] = useState<Goal | 'new' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null)
  const [scenarioGoalId, setScenarioGoalId] = useState<string | null>(null)
  const [scenarioDate, setScenarioDate] = useState('')
  const balances = useMemo(
    () => calculateAccountBalances(data.accounts, data.transactions),
    [data.accounts, data.transactions],
  )
  const activeGoals = data.goals.filter((goal) => !goal.archived)
  const resolvedGoals = activeGoals.map((goal) => ({
    ...goal,
    currentPaise: goal.linkedAccountId
      ? Math.max(0, balances.get(goal.linkedAccountId) ?? 0)
      : goal.currentPaise,
  }))
  const totalTarget = resolvedGoals.reduce((sum, goal) => sum + goal.targetPaise, 0)
  const totalSaved = resolvedGoals.reduce((sum, goal) => sum + goal.currentPaise, 0)
  const monthlyPlan = resolvedGoals.reduce(
    (sum, goal) => sum + goal.plannedMonthlyPaise,
    0,
  )
  const scenarioGoal =
    resolvedGoals.find((goal) => goal.id === scenarioGoalId) ?? resolvedGoals[0] ?? null
  const scenarioRequired = scenarioGoal
    ? requiredMonthlyForGoal({
        ...scenarioGoal,
        targetDate: scenarioDate || scenarioGoal.targetDate,
      })
    : 0

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await remove('goals', deleteTarget.id)
      notify('Goal deleted')
      setDeleteTarget(null)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The goal could not be deleted')
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Goals"
        description="Savings targets with explicit balances, dates, and monthly contribution requirements."
        action={
          <button type="button" className="button" onClick={() => setGoalDialog('new')}>
            <Icon name="plus" size={17} />
            Add goal
          </button>
        }
      />

      <section className="page-grid metric-group">
        <div className="card card-body span-4">
          <Metric label="Combined target" value={formatMoney(totalTarget)} />
        </div>
        <div className="card card-body span-4">
          <Metric
            label="Saved toward active goals"
            value={formatMoney(totalSaved)}
            detail={`${percentageOf(totalSaved, totalTarget).toFixed(1)}% of target`}
          />
        </div>
        <div className="card card-body span-4">
          <Metric label="Planned monthly" value={formatMoney(monthlyPlan)} />
        </div>
      </section>

      {resolvedGoals.length === 0 ? (
        <section className="card">
          <EmptyState
            title="No active goals"
            description="Create a target and date to see the monthly contribution required."
            action={
              <button
                type="button"
                className="button"
                onClick={() => setGoalDialog('new')}
              >
                Add goal
              </button>
            }
          />
        </section>
      ) : (
        <section className="goal-grid">
          {resolvedGoals
            .sort((left, right) => {
              const priority = { high: 0, medium: 1, low: 2 }
              return (
                priority[left.priority] - priority[right.priority] ||
                left.targetDate.localeCompare(right.targetDate)
              )
            })
            .map((goal) => {
              const progress = Math.min(
                100,
                percentageOf(goal.currentPaise, goal.targetPaise),
              )
              const required = requiredMonthlyForGoal(goal)
              const months = Math.max(
                0,
                differenceInCalendarMonths(
                  parseISO(goal.targetDate),
                  parseISO(todayIso()),
                ),
              )
              const linkedAccount = data.accounts.find(
                (account) => account.id === goal.linkedAccountId,
              )
              return (
                <article key={goal.id} className="card goal-card">
                  <header className="card-header">
                    <div>
                      <div className="cluster cluster-tight">
                        <h2>{goal.name}</h2>
                        <span className={`badge priority-${goal.priority}`}>
                          {goal.priority}
                        </span>
                      </div>
                      <p className="muted">
                        Target {format(parseISO(goal.targetDate), 'dd MMM yyyy')}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Edit ${goal.name}`}
                      onClick={() => setGoalDialog(goal)}
                    >
                      <Icon name="edit" size={17} />
                    </button>
                  </header>
                  <div className="goal-body">
                    <div className="cluster cluster-between">
                      <strong className="goal-total tabular">
                        {formatMoney(goal.currentPaise)}
                      </strong>
                      <span className="muted">of {formatMoney(goal.targetPaise)}</span>
                    </div>
                    <div
                      className="progress-track goal-progress"
                      role="progressbar"
                      aria-label={`${goal.name} progress`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(progress)}
                    >
                      <span style={{ width: `${progress}%` }} />
                    </div>
                    <div className="goal-stats">
                      <div>
                        <span>Required monthly</span>
                        <strong>{formatMoney(required)}</strong>
                      </div>
                      <div>
                        <span>Current plan</span>
                        <strong>{formatMoney(goal.plannedMonthlyPaise)}</strong>
                      </div>
                      <div>
                        <span>Time remaining</span>
                        <strong>{months} months</strong>
                      </div>
                    </div>
                    {linkedAccount ? (
                      <p className="field-hint">
                        Progress uses the current balance of {linkedAccount.name}.
                      </p>
                    ) : null}
                    {goal.plannedMonthlyPaise < required ? (
                      <p className="inline-warning">
                        Planned contribution is{' '}
                        {formatMoney(required - goal.plannedMonthlyPaise)} below the
                        current monthly requirement.
                      </p>
                    ) : null}
                    <div className="cluster cluster-between">
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        onClick={() => {
                          setScenarioGoalId(goal.id)
                          setScenarioDate(goal.targetDate)
                        }}
                      >
                        Adjust scenario
                      </button>
                      <button
                        type="button"
                        className="button-link text-danger"
                        onClick={() => setDeleteTarget(goal)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
        </section>
      )}

      {scenarioGoalId && scenarioGoal ? (
        <section className="card scenario-panel">
          <header className="card-header">
            <div>
              <h2>Target-date scenario</h2>
              <p className="muted">
                Change the date to compare the required monthly contribution. No changes
                are saved.
              </p>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close scenario"
              onClick={() => setScenarioGoalId(null)}
            >
              <Icon name="close" size={18} />
            </button>
          </header>
          <div className="scenario-body">
            <label className="field">
              <span>Goal</span>
              <select
                className="select"
                value={scenarioGoal.id}
                onChange={(event) => {
                  const goal = resolvedGoals.find(
                    (item) => item.id === event.target.value,
                  )
                  setScenarioGoalId(event.target.value)
                  setScenarioDate(goal?.targetDate ?? '')
                }}
              >
                {resolvedGoals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Alternative target date</span>
              <input
                className="input"
                type="date"
                value={scenarioDate}
                onChange={(event) => setScenarioDate(event.target.value)}
              />
            </label>
            <Metric
              label="Required monthly"
              value={formatMoney(scenarioRequired)}
              detail={`${formatMoney(Math.max(0, scenarioGoal.targetPaise - scenarioGoal.currentPaise))} remaining`}
            />
            <Metric
              label="Difference from current plan"
              value={formatMoney(scenarioRequired - scenarioGoal.plannedMonthlyPaise)}
              tone={
                scenarioRequired <= scenarioGoal.plannedMonthlyPaise
                  ? 'positive'
                  : 'danger'
              }
            />
          </div>
        </section>
      ) : null}

      {data.goals.some((goal) => goal.archived) ? (
        <section className="card">
          <header className="card-header">
            <div>
              <h2>Archived goals</h2>
              <p className="muted">Retained for reference and excluded from totals.</p>
            </div>
          </header>
          <div className="simple-list">
            {data.goals
              .filter((goal) => goal.archived)
              .map((goal) => (
                <button
                  key={goal.id}
                  type="button"
                  className="simple-row"
                  onClick={() => setGoalDialog(goal)}
                >
                  <span>{goal.name}</span>
                  <span>{formatMoney(goal.targetPaise)}</span>
                </button>
              ))}
          </div>
        </section>
      ) : null}

      {goalDialog ? (
        <GoalDialog
          goal={goalDialog === 'new' ? null : goalDialog}
          onClose={() => setGoalDialog(null)}
        />
      ) : null}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete goal?"
        description={`This permanently removes ${deleteTarget?.name ?? 'the goal'}. Linked account data is not changed.`}
        confirmLabel="Delete goal"
        tone="danger"
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
