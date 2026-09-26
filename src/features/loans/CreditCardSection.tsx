import Decimal from 'decimal.js'

import { formatMoney } from '../../domain/money'
import type { Account } from '../../domain/types'
import { EmptyState } from '../../ui/Page'

interface CreditCardSectionProps {
  accounts: readonly Account[]
  balances: ReadonlyMap<string, number>
  onAdd: () => void
  onEdit: (account: Account) => void
}

export function CreditCardSection({
  accounts,
  balances,
  onAdd,
  onEdit,
}: CreditCardSectionProps) {
  return (
    <section className="card">
      <header className="card-header credit-card-header">
        <div>
          <h2>Credit cards</h2>
          <p className="muted">
            Outstanding balances come from card transactions. Confirm payment amounts and
            dates against your latest statement.
          </p>
        </div>
        <button type="button" className="button button-secondary" onClick={onAdd}>
          Add credit card
        </button>
      </header>
      {accounts.length === 0 ? (
        <EmptyState
          title="No credit cards recorded"
          description="Add a card to track its balance, limit, and payment cycle."
        />
      ) : (
        <div className="credit-card-list">
          {accounts.map((account) => {
            const balance = balances.get(account.id) ?? 0
            const outstanding = Math.max(0, -balance)
            const limit = account.creditCardDetails?.creditLimitPaise ?? null
            const overLimit = limit === null ? 0 : Math.max(0, outstanding - limit)
            return (
              <div key={account.id} className="credit-card-detail">
                <div className="cluster cluster-between">
                  <div>
                    <strong>{account.name}</strong>
                    <small className="muted">
                      {account.institution || 'Credit card'}
                      {account.creditCardDetails?.lastFour
                        ? ` · ending ${account.creditCardDetails.lastFour}`
                        : ''}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary"
                    aria-label={`Edit ${account.name}`}
                    onClick={() => onEdit(account)}
                  >
                    Edit card
                  </button>
                </div>
                <div className="credit-card-values">
                  <div>
                    <span>Outstanding (incl. unbilled)</span>
                    <strong className="tabular">{formatMoney(outstanding)}</strong>
                  </div>
                  {balance > 0 ? (
                    <div>
                      <span>Credit balance</span>
                      <strong className="tabular">{formatMoney(balance)}</strong>
                    </div>
                  ) : null}
                  {limit !== null ? (
                    <>
                      <div>
                        <span>Credit limit</span>
                        <strong className="tabular">{formatMoney(limit)}</strong>
                      </div>
                      <div>
                        <span>
                          {overLimit > 0 ? 'Over limit by' : 'Available credit'}
                        </span>
                        <strong className="tabular">
                          {formatMoney(overLimit > 0 ? overLimit : limit - outstanding)}
                        </strong>
                      </div>
                      <div>
                        <span>Utilization</span>
                        <strong className="tabular">
                          {new Decimal(outstanding)
                            .div(limit)
                            .mul(100)
                            .toDecimalPlaces(1)
                            .toString()}
                          %
                        </strong>
                      </div>
                    </>
                  ) : null}
                </div>
                {account.creditCardDetails?.statementDay ||
                account.creditCardDetails?.paymentDueDay ? (
                  <p className="muted credit-card-cycle">
                    {account.creditCardDetails.statementDay
                      ? `Statement day ${account.creditCardDetails.statementDay}`
                      : 'Statement day not set'}
                    {' · '}
                    {account.creditCardDetails.paymentDueDay
                      ? `Payment due day ${account.creditCardDetails.paymentDueDay}`
                      : 'Payment due day not set'}
                  </p>
                ) : null}
                {account.creditCardDetails?.statement ? (
                  <p className="muted credit-card-cycle">
                    Actual statement {account.creditCardDetails.statement.date} · due{' '}
                    {account.creditCardDetails.statement.dueDate} · total{' '}
                    {formatMoney(account.creditCardDetails.statement.totalPaise)} · paid{' '}
                    {formatMoney(account.creditCardDetails.statement.paidPaise)}
                    {account.creditCardDetails.statement.paidPaise <
                    account.creditCardDetails.statement.totalPaise
                      ? ` · remaining ${formatMoney(
                          account.creditCardDetails.statement.totalPaise -
                            account.creditCardDetails.statement.paidPaise,
                        )}`
                      : ' · full statement amount recorded'}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
