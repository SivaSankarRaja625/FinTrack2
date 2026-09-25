import Decimal from 'decimal.js'
import { format, parseISO } from 'date-fns'
import { useMemo, useState } from 'react'

import { useFinance } from '../../app/FinanceContext'
import {
  calculateAccountBalances,
  calculateLoanSchedule,
} from '../../domain/calculations'
import { todayIso } from '../../domain/dates'
import { formatMoney, sumPaise } from '../../domain/money'
import type { Account, Loan } from '../../domain/types'
import { ConfirmDialog } from '../../ui/Dialog'
import { Icon } from '../../ui/Icon'
import { EmptyState, Metric, PageHeader } from '../../ui/Page'
import { useToast } from '../../ui/Toast'
import { AccountDialog } from '../transactions/AccountDialog'
import { CreditCardSection } from './CreditCardSection'
import { LoanDialog } from './LoanDialog'
import { LoanPaymentDialog } from './LoanPaymentDialog'
import { RateChangeDialog } from './RateChangeDialog'

function currentRateBps(loan: Loan): number {
  return (
    [...loan.rateChanges]
      .filter((change) => change.effectiveDate <= todayIso())
      .sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate))
      .at(-1)?.annualInterestRateBps ?? loan.annualInterestRateBps
  )
}

export function LoansPage() {
  const { data, remove } = useFinance()
  const { notify } = useToast()
  const [selectedId, setSelectedId] = useState('')
  const [loanDialog, setLoanDialog] = useState<Loan | 'new' | null>(null)
  const [cardDialog, setCardDialog] = useState<Account | 'new' | null>(null)
  const [paymentLoan, setPaymentLoan] = useState<Loan | null>(null)
  const [rateLoan, setRateLoan] = useState<Loan | null>(null)
  const [deleteLoan, setDeleteLoan] = useState<Loan | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showFullSchedule, setShowFullSchedule] = useState(false)
  const selectedLoan =
    data.loans.find((loan) => loan.id === selectedId) ?? data.loans[0] ?? null
  const schedule = useMemo(
    () => (selectedLoan ? calculateLoanSchedule(selectedLoan) : []),
    [selectedLoan],
  )
  const baselineSchedule = useMemo(
    () =>
      selectedLoan ? calculateLoanSchedule({ ...selectedLoan, prepaymentPaise: 0 }) : [],
    [selectedLoan],
  )
  const totalOutstanding = sumPaise(
    data.loans.filter((loan) => loan.active).map((loan) => loan.outstandingPaise),
  )
  const monthlyEmi = sumPaise(
    data.loans.filter((loan) => loan.active).map((loan) => loan.emiPaise),
  )
  const remainingInterest = schedule.reduce((sum, row) => sum + row.interestPaise, 0)
  const baselineInterest = baselineSchedule.reduce(
    (sum, row) => sum + row.interestPaise,
    0,
  )
  const prepaymentSaving = Math.max(0, baselineInterest - remainingInterest)
  const balances = calculateAccountBalances(data.accounts, data.transactions)
  const creditCards = data.accounts.filter(
    (account) => account.type === 'credit-card' && !account.archived,
  )
  const creditOutstanding = creditCards.reduce(
    (sum, account) => sum + Math.max(0, -(balances.get(account.id) ?? 0)),
    0,
  )

  const confirmDelete = async () => {
    if (!deleteLoan) return
    setDeleting(true)
    try {
      await remove('loans', deleteLoan.id)
      notify('Loan deleted')
      setDeleteLoan(null)
      setSelectedId('')
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'The loan could not be deleted',
        'error',
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Loans & credit"
        description="Track outstanding principal, rate changes, EMIs, prepayments, and payoff projections."
        action={
          <button type="button" className="button" onClick={() => setLoanDialog('new')}>
            <Icon name="plus" size={17} />
            Add loan
          </button>
        }
      />

      <section className="page-grid metric-group">
        <div className="card card-body span-3">
          <Metric
            label="Loan outstanding"
            value={formatMoney(totalOutstanding)}
            tone={totalOutstanding > 0 ? 'danger' : 'default'}
          />
        </div>
        <div className="card card-body span-3">
          <Metric label="Monthly EMIs" value={formatMoney(monthlyEmi)} />
        </div>
        <div className="card card-body span-3">
          <Metric
            label="Credit-card balance"
            value={formatMoney(creditOutstanding)}
            tone={creditOutstanding > 0 ? 'danger' : 'default'}
          />
        </div>
        <div className="card card-body span-3">
          <Metric
            label="Active loans"
            value={data.loans.filter((loan) => loan.active).length}
          />
        </div>
      </section>

      <CreditCardSection
        accounts={creditCards}
        balances={balances}
        onAdd={() => setCardDialog('new')}
        onEdit={setCardDialog}
      />

      {data.loans.length === 0 ? (
        <section className="card">
          <EmptyState
            title="No loans recorded"
            description="Add a loan to calculate a repayment schedule and track actual principal, interest, and prepayments."
            action={
              <button
                type="button"
                className="button"
                onClick={() => setLoanDialog('new')}
              >
                Add loan
              </button>
            }
          />
        </section>
      ) : (
        <>
          <section className="loan-selector" aria-label="Loans">
            {data.loans.map((loan) => (
              <button
                key={loan.id}
                type="button"
                className={`loan-tile${selectedLoan?.id === loan.id ? ' loan-tile-active' : ''}`}
                onClick={() => {
                  setSelectedId(loan.id)
                  setShowFullSchedule(false)
                }}
              >
                <span>
                  <strong>{loan.name}</strong>
                  <small>{loan.lender || 'Lender not set'}</small>
                </span>
                <span>
                  <strong>{formatMoney(loan.outstandingPaise)}</strong>
                  <small>{loan.active ? 'Active' : 'Paid / inactive'}</small>
                </span>
              </button>
            ))}
          </section>

          {selectedLoan ? (
            <>
              <section className="card">
                <header className="card-header">
                  <div>
                    <h2>{selectedLoan.name}</h2>
                    <p className="muted">
                      {selectedLoan.lender || 'Lender not set'} ·{' '}
                      {selectedLoan.interestType === 'reducing'
                        ? 'Reducing balance'
                        : 'Flat interest'}
                    </p>
                  </div>
                  <div className="cluster">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => setRateLoan(selectedLoan)}
                    >
                      Record rate
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => setLoanDialog(selectedLoan)}
                    >
                      <Icon name="edit" size={16} />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="button"
                      onClick={() => setPaymentLoan(selectedLoan)}
                    >
                      Record payment
                    </button>
                  </div>
                </header>
                <div className="loan-detail-grid">
                  <Metric
                    label="Outstanding principal"
                    value={formatMoney(selectedLoan.outstandingPaise)}
                  />
                  <Metric label="EMI" value={formatMoney(selectedLoan.emiPaise)} />
                  <Metric
                    label="Current rate"
                    value={`${new Decimal(currentRateBps(selectedLoan)).div(100).toFixed(2)}%`}
                    detail="per year"
                  />
                  <Metric
                    label="Next payment"
                    value={format(parseISO(selectedLoan.nextPaymentDate), 'dd MMM yyyy')}
                  />
                  <Metric
                    label="Projected interest"
                    value={formatMoney(remainingInterest)}
                    detail="remaining schedule"
                  />
                  <Metric
                    label="Projected payoff"
                    value={
                      schedule.at(-1)
                        ? format(parseISO(schedule.at(-1)!.date), 'MMM yyyy')
                        : 'Paid'
                    }
                    detail={
                      selectedLoan.prepaymentPaise > 0
                        ? `${formatMoney(prepaymentSaving)} interest saved in scenario`
                        : 'No prepayment scenario'
                    }
                  />
                </div>
              </section>

              <section className="card">
                <header className="card-header">
                  <div>
                    <h2>Projected amortization</h2>
                    <p className="muted">
                      Forward estimate from current outstanding principal. Rate changes
                      apply from their effective date.
                    </p>
                  </div>
                  {schedule.length > 12 ? (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => setShowFullSchedule((current) => !current)}
                    >
                      {showFullSchedule
                        ? 'Show first year'
                        : `Show all ${schedule.length}`}
                    </button>
                  ) : null}
                </header>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Date</th>
                        <th className="amount-cell">Opening</th>
                        <th className="amount-cell">Principal</th>
                        <th className="amount-cell">Interest</th>
                        <th className="amount-cell">Payment</th>
                        <th className="amount-cell">Closing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(showFullSchedule ? schedule : schedule.slice(0, 12)).map(
                        (row) => (
                          <tr key={row.month}>
                            <td>{row.month}</td>
                            <td>{format(parseISO(row.date), 'dd MMM yyyy')}</td>
                            <td className="amount-cell tabular">
                              {formatMoney(row.openingPaise)}
                            </td>
                            <td className="amount-cell tabular">
                              {formatMoney(row.principalPaise)}
                            </td>
                            <td className="amount-cell tabular">
                              {formatMoney(row.interestPaise)}
                            </td>
                            <td className="amount-cell tabular">
                              {formatMoney(row.paymentPaise)}
                            </td>
                            <td className="amount-cell tabular">
                              {formatMoney(row.closingPaise)}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="page-grid">
                <div className="card span-7">
                  <header className="card-header">
                    <div>
                      <h2>Recorded payments</h2>
                      <p className="muted">
                        Actual entries update outstanding principal; they do not create
                        account transactions automatically.
                      </p>
                    </div>
                  </header>
                  {selectedLoan.payments.length === 0 ? (
                    <EmptyState
                      title="No payments recorded"
                      description="Record principal and interest after each payment to track actual progress."
                    />
                  ) : (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th className="amount-cell">Principal</th>
                            <th className="amount-cell">Interest</th>
                            <th className="amount-cell">Prepayment</th>
                            <th className="amount-cell">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...selectedLoan.payments]
                            .sort((left, right) => right.date.localeCompare(left.date))
                            .map((payment) => (
                              <tr key={payment.id}>
                                <td>
                                  {format(parseISO(payment.date), 'dd MMM yyyy')}
                                  {payment.note ? <small>{payment.note}</small> : null}
                                </td>
                                <td className="amount-cell">
                                  {formatMoney(payment.principalPaise)}
                                </td>
                                <td className="amount-cell">
                                  {formatMoney(payment.interestPaise)}
                                </td>
                                <td className="amount-cell">
                                  {formatMoney(payment.prepaymentPaise)}
                                </td>
                                <td className="amount-cell">
                                  {formatMoney(payment.amountPaise)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="card span-5">
                  <header className="card-header">
                    <div>
                      <h2>Rate history</h2>
                      <p className="muted">
                        Base rate plus effective changes used in projections.
                      </p>
                    </div>
                  </header>
                  <div className="rate-list">
                    <div className="rate-row">
                      <span>
                        <strong>
                          {new Decimal(selectedLoan.annualInterestRateBps)
                            .div(100)
                            .toFixed(2)}
                          %
                        </strong>
                        <small>Base rate</small>
                      </span>
                      <span>
                        {format(parseISO(selectedLoan.startDate), 'dd MMM yyyy')}
                      </span>
                    </div>
                    {[...selectedLoan.rateChanges]
                      .sort((left, right) =>
                        right.effectiveDate.localeCompare(left.effectiveDate),
                      )
                      .map((change) => (
                        <div key={change.id} className="rate-row">
                          <span>
                            <strong>
                              {new Decimal(change.annualInterestRateBps)
                                .div(100)
                                .toFixed(2)}
                              %
                            </strong>
                            <small>Changed rate</small>
                          </span>
                          <span>
                            {format(parseISO(change.effectiveDate), 'dd MMM yyyy')}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </section>

              <div className="danger-zone">
                <div>
                  <strong>Remove loan record</strong>
                  <span>
                    Existing net-worth snapshots remain unchanged; current debt is
                    recalculated.
                  </span>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setDeleteLoan(selectedLoan)}
                >
                  Delete loan
                </button>
              </div>
            </>
          ) : null}
        </>
      )}

      {cardDialog ? (
        <AccountDialog
          account={cardDialog === 'new' ? null : cardDialog}
          initialType="credit-card"
          onClose={() => setCardDialog(null)}
        />
      ) : null}
      {loanDialog ? (
        <LoanDialog
          loan={loanDialog === 'new' ? null : loanDialog}
          onClose={() => setLoanDialog(null)}
        />
      ) : null}
      {paymentLoan ? (
        <LoanPaymentDialog loan={paymentLoan} onClose={() => setPaymentLoan(null)} />
      ) : null}
      {rateLoan ? (
        <RateChangeDialog loan={rateLoan} onClose={() => setRateLoan(null)} />
      ) : null}
      <ConfirmDialog
        open={deleteLoan !== null}
        title="Delete this loan?"
        description={`“${deleteLoan?.name ?? ''}” and its payment/rate history will be removed from current debt calculations.`}
        confirmLabel="Delete loan"
        busy={deleting}
        onClose={() => setDeleteLoan(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
