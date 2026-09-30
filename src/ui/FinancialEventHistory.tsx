import { useState } from 'react'

import { useFinance } from '../app/FinanceContext'
import type { FinancialSourceState } from '../domain/types'
import { formatMoney } from '../domain/money'
import { ConfirmDialog } from './Dialog'
import { useToast } from './Toast'

export function FinancialEventHistory({
  sourceId,
  sourceKind,
}: {
  sourceId: string
  sourceKind: FinancialSourceState['kind']
}) {
  const { data, undoFinancialEvent, finalizeFinancialEvents } = useFinance()
  const { notify } = useToast()
  const [action, setAction] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const events = data.financialEvents
    .filter((event) => event.sourceId === sourceId && event.before.kind === sourceKind)
    .sort((a, b) => b.sequence - a.sequence)
  if (!events.length) return null
  const confirm = async () => {
    if (!action) return
    setBusy(true)
    try {
      if (action === 'finalize') await finalizeFinancialEvents(sourceKind, sourceId)
      else await undoFinancialEvent(action)
      notify(
        action === 'finalize'
          ? 'Cash entries kept; historical links finalized'
          : 'Financial event undone',
      )
      setAction(null)
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : 'The financial event could not be changed',
        'error',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="card card-body">
      <h2>Financial activity</h2>
      <p className="field-hint">
        Linked cash and source changes stay together. Undo restores original matched
        entries; it removes cash entries created by the action.
      </p>
      <ul className="record-list">
        {events.map((event) => (
          <li key={event.id} className="finance-record">
            <div className="finance-record-title">
              <strong>{event.kind.replaceAll('-', ' ')}</strong>
              <strong>{formatMoney(event.amountPaise)}</strong>
            </div>
            <p className="record-meta">
              {event.date} ·{' '}
              {event.transactionIds.length
                ? `${event.transactionIds.length} cash entries`
                : 'Historical only'}
              {event.finalized ? ' · Finalized' : ''}
            </p>
            {!event.finalized ? (
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={() => setAction(event.id)}
              >
                Undo financial event
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {sourceKind !== 'expense' && events.some((event) => !event.finalized) ? (
        <button
          type="button"
          className="button button-secondary"
          onClick={() => setAction('finalize')}
        >
          Keep cash entries and finalize links
        </button>
      ) : null}
      <ConfirmDialog
        open={action !== null}
        title={
          action === 'finalize'
            ? 'Keep cash and finalize links?'
            : 'Undo this financial event?'
        }
        description={
          action === 'finalize'
            ? 'Real cash entries stay in Activity. These historical links will no longer be undoable, allowing corrections to the source balance.'
            : 'The source balance and linked cash changes will be reversed together. A pre-existing matched bank entry is restored, not deleted.'
        }
        confirmLabel={action === 'finalize' ? 'Finalize links' : 'Undo event'}
        busy={busy}
        onClose={() => {
          if (!busy) setAction(null)
        }}
        onConfirm={() => void confirm()}
      />
    </section>
  )
}
