import { expect } from '@playwright/test'

import {
  appPin,
  createWorkspace,
  expectMetricValues,
  openSection,
  test,
} from './support/finance'
import { addAccount, addTransaction } from './support/records'

test('recording a loan payment updates bank cash and debt together', async ({ page }) => {
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Payment bank', '90000')
  await openSection(page, 'Loans & credit')
  await page.getByRole('button', { name: 'Add loan', exact: true }).first().click()
  const form = page.getByRole('dialog', { name: 'Add loan', exact: true })
  for (const [label, value] of [
    ['Loan name', 'Linked loan'],
    ['Lender', 'Example lender'],
    ['Original principal', '100000'],
    ['Current outstanding', '100000'],
    ['Base annual interest rate (%)', '12'],
    ['Remaining term (months)', '24'],
    ['EMI (leave blank to calculate)', '5000'],
  ])
    await form.getByLabel(label, { exact: true }).fill(value)
  await form.getByRole('button', { name: 'Add loan', exact: true }).click()
  await page.getByRole('button', { name: 'Record payment', exact: true }).click()
  const payment = page.getByRole('dialog', { name: 'Record payment · Linked loan' })
  await payment.getByLabel('Principal paid').fill('4000')
  await payment.getByLabel('Interest paid').fill('1000')
  await payment.getByLabel('Additional prepayment').fill('5000')
  await payment.getByRole('button', { name: 'Record payment', exact: true }).click()
  await expect(payment).toBeHidden()
  await openSection(page, 'Net worth')
  await expectMetricValues(page.locator('.metric-group'), {
    'Net worth': '-₹11,000',
    Debt: '₹91,000',
  })
  await expect(page.getByRole('list', { name: 'Account balances' })).toContainText(
    '₹80,000',
  )
})

test('one savings balance cannot fund two balance-following goals', async ({ page }) => {
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Shared savings', '56000')
  await openSection(page, 'Goals')
  for (const name of ['Laptop', 'Holiday']) {
    await page.getByRole('button', { name: 'Add goal', exact: true }).first().click()
    const form = page.getByRole('dialog', { name: 'Add savings goal' })
    await form.getByLabel('Goal name').fill(name)
    await form.getByLabel('Target amount').fill('90000')
    await form.getByLabel('Target date').fill('2027-03-30')
    await form.getByLabel('Planned monthly contribution').fill('5000')
    await form
      .getByLabel('Linked savings account')
      .selectOption({ label: 'Shared savings' })
    await form.getByRole('button', { name: 'Add goal', exact: true }).click()
    if (name === 'Laptop') await expect(form).toBeHidden()
    else await expect(form.getByRole('alert')).toContainText('already funds')
  }
  await expectMetricValues(page.locator('.metric-group'), {
    'Saved toward active goals': '₹56,000',
    'Combined target': '₹90,000',
  })
  const allocation = page.getByRole('dialog', { name: 'Add savings goal' })
  await allocation.getByLabel('Linked-account funding').selectOption('allocation')
  await allocation.getByLabel('Allocated amount').fill('60000')
  await allocation.getByRole('button', { name: 'Add goal', exact: true }).click()
  await expect(allocation.getByRole('alert')).toContainText('exceed')
  await allocation.getByLabel('Allocated amount').fill('28000')
  await allocation.getByRole('button', { name: 'Add goal', exact: true }).click()
  await expect(allocation).toBeHidden()
  await expectMetricValues(page.locator('.metric-group'), {
    'Saved toward active goals': '₹56,000',
    'Combined target': '₹1,80,000',
  })
  await expect(page.locator('.goal-total')).toHaveText(['₹28,000', '₹28,000'])
  await openSection(page, 'Transactions')
  await addTransaction(page, {
    kind: 'Expense',
    date: '2026-02-14',
    account: 'Shared savings',
    amount: '40000',
    category: 'Other expense',
    description: 'Cash needed elsewhere',
  })
  await openSection(page, 'Goals')
  await expectMetricValues(page.locator('.metric-group'), {
    'Saved toward active goals': '₹16,000',
  })
  await expect(
    page.getByText(/₹12,000 of the requested allocation is not backed/),
  ).toBeVisible()
})

test('loan principal overpayment is rejected without changing outstanding', async ({
  page,
}) => {
  await createWorkspace(page)
  await openSection(page, 'Loans & credit')
  await page.getByRole('button', { name: 'Add loan', exact: true }).first().click()
  const loan = page.getByRole('dialog', { name: 'Add loan', exact: true })
  for (const [label, value] of [
    ['Loan name', 'Personal loan'],
    ['Lender', 'Example lender'],
    ['Original principal', '100000'],
    ['Current outstanding', '91000'],
    ['Base annual interest rate (%)', '12'],
    ['Remaining term (months)', '24'],
    ['EMI (leave blank to calculate)', '5000'],
  ])
    await loan.getByLabel(label, { exact: true }).fill(value)
  await loan.getByRole('button', { name: 'Add loan', exact: true }).click()
  await page.getByRole('button', { name: 'Record payment', exact: true }).click()
  const payment = page.getByRole('dialog', { name: 'Record payment · Personal loan' })
  await payment.getByLabel('Principal paid').fill('95000')
  await payment.getByLabel('Interest paid').fill('0')
  await payment.getByRole('button', { name: 'Record payment', exact: true }).click()
  await expect(payment.getByRole('alert')).toContainText('exceed')
  await expectMetricValues(page.locator('.metric-group').first(), {
    'Loan outstanding': '₹91,000',
    'Active loans': '1',
  })
})

test('recurring occurrences match posted cash without a duplicate forecast or bank entry', async ({
  page,
}) => {
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Salary bank', '5000')
  await addTransaction(page, {
    kind: 'Income',
    date: '2026-02-14',
    account: 'Salary bank',
    amount: '2000',
    category: 'Salary',
    description: 'Salary already received',
  })
  await openSection(page, 'Plan & cash flow')
  await page
    .getByRole('button', { name: 'Add recurring item', exact: true })
    .first()
    .click()
  const rule = page.getByRole('dialog', { name: 'Add recurring item', exact: true })
  await rule.getByLabel('Name', { exact: true }).fill('Salary')
  await rule.getByLabel('Type', { exact: true }).selectOption('income')
  await rule.getByLabel('Amount', { exact: true }).fill('2000')
  await rule.getByLabel('Next expected date').fill('2026-02-14')
  await rule.getByLabel('Ends (optional)').fill('2026-04-14')
  await rule.getByRole('button', { name: 'Add recurring item', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Forecast reconciliation needed' }),
  ).toContainText('may already be recorded')
  await page.getByRole('button', { name: 'Post / match Salary', exact: true }).click()
  const posting = page.getByRole('dialog', { name: 'Post or match occurrence · Salary' })
  await posting.getByLabel('Cash entry').selectOption('match')
  await posting.getByLabel('Existing bank transaction').selectOption({
    label: 'Salary bank · 2026-02-14 · Salary already received · ₹2,000',
  })
  await posting
    .getByRole('button', { name: 'Post or match occurrence', exact: true })
    .click()
  await expect(posting).toBeHidden()
  await expectMetricValues(page.locator('.metric-group'), {
    'Liquid balance today': '₹7,000',
    'Projected in 90 days': '₹11,000',
  })
  await openSection(page, 'Transactions')
  await expect(
    page
      .getByRole('list', { name: 'Transactions' })
      .getByRole('button', { name: /^Edit / }),
  ).toHaveCount(1)
})

test('an investment purchase creates capital movement rather than phantom wealth', async ({
  page,
}) => {
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Funding bank', '250000')
  await openSection(page, 'Investments')
  await page.getByRole('button', { name: 'Add holding', exact: true }).first().click()
  const holding = page.getByRole('dialog', { name: 'Add holding', exact: true })
  for (const [label, value] of [
    ['Holding name', 'Index fund'],
    ['Units', '1000'],
    ['Average unit cost', '100'],
    ['Current unit price', '100'],
  ])
    await holding.getByLabel(label, { exact: true }).fill(value)
  await holding.getByRole('button', { name: 'Add holding', exact: true }).click()
  await page.getByRole('button', { name: 'Record activity', exact: true }).click()
  const activity = page.getByRole('dialog', { name: 'Record activity for Index fund' })
  await activity.getByLabel('Units', { exact: true }).fill('200')
  await activity.getByLabel('Total amount').fill('20000')
  await activity.getByRole('button', { name: 'Record activity', exact: true }).click()
  await expect(activity).toBeHidden()
  await expectMetricValues(page.locator('.metric-group'), {
    'Portfolio value': '₹1,20,000',
    'Cost basis': '₹1,20,000',
    'Unrealised gain': '₹0',
  })
  await openSection(page, 'Net worth')
  await expectMetricValues(page.locator('.metric-group'), { 'Net worth': '₹3,50,000' })
  await expect(page.getByRole('list', { name: 'Account balances' })).toContainText(
    '₹2,30,000',
  )
  await openSection(page, 'Reports')
  await expectMetricValues(page.locator('.metric-group'), {
    Income: '₹0',
    Expenses: '₹0',
  })
})

test('premium payment creates an expense without confirming policy renewal', async ({
  page,
}) => {
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Premium bank', '50000')
  await openSection(page, 'Insurance')
  await page.getByRole('button', { name: 'Add policy', exact: true }).first().click()
  const policy = page.getByRole('dialog', { name: 'Add insurance policy' })
  for (const [label, value] of [
    ['Insurer', 'Example'],
    ['Policy name', 'Health plan'],
    ['Cover amount', '500000'],
    ['Premium', '10000'],
    ['Next premium due', '2026-02-14'],
    ['Renewal date (optional)', '2026-02-14'],
  ])
    await policy.getByLabel(label, { exact: true }).fill(value)
  await policy.getByRole('button', { name: 'Add policy', exact: true }).click()
  await page.getByRole('button', { name: 'Record premium payment', exact: true }).click()
  const payment = page.getByRole('dialog', { name: 'Pay premium · Health plan' })
  await payment
    .getByRole('button', { name: 'Record premium payment', exact: true })
    .click()
  await expect(payment).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'Confirm policy renewal', exact: true }),
  ).toBeVisible()
  await openSection(page, 'Reports')
  await expectMetricValues(page.locator('.metric-group'), {
    Income: '₹0',
    Expenses: '₹10,000',
    'Net cash flow': '-₹10,000',
  })
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await expectMetricValues(page.locator('.dashboard-summary'), {
    'Current net worth': '₹40,000',
  })
})

test('partial receivable settlement conserves wealth and rejects excess receipts', async ({
  page,
}) => {
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Receipt bank', '10000')
  await openSection(page, 'Net worth')
  await page.getByRole('button', { name: 'Add valuation', exact: true }).click()
  const asset = page.getByRole('dialog', { name: 'Add asset or liability' })
  await asset.getByLabel('Category', { exact: true }).selectOption('receivable')
  await asset.getByLabel('Name', { exact: true }).fill('Client invoice')
  await asset.getByLabel('Current value', { exact: true }).fill('45000')
  await asset.getByRole('button', { name: 'Add valuation', exact: true }).click()
  await page.getByRole('button', { name: 'Settle Client invoice', exact: true }).click()
  const receipt = page.getByRole('dialog', { name: 'Settle receivable · Client invoice' })
  await receipt.getByLabel('Amount received').fill('15000')
  await receipt.getByRole('button', { name: 'Settle receivable', exact: true }).click()
  await expect(receipt).toBeHidden()
  await expectMetricValues(page.locator('.metric-group'), { 'Net worth': '₹55,000' })
  await expect(page.getByRole('list', { name: 'Account balances' })).toContainText(
    '₹25,000',
  )
  await expect(page.getByRole('list', { name: 'Manual valuations' })).toContainText(
    '₹30,000',
  )
  await page.getByRole('button', { name: 'Settle Client invoice', exact: true }).click()
  await receipt.getByLabel('Amount received').fill('30001')
  await receipt.getByRole('button', { name: 'Settle receivable', exact: true }).click()
  await expect(receipt.getByRole('alert')).toContainText('exceed')
})

test('reimbursements offset split expenses in the receipt month, not earned income', async ({
  page,
}) => {
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Expense bank', '1000')
  await addTransaction(page, {
    kind: 'Expense',
    date: '2026-02-14',
    account: 'Expense bank',
    amount: '250',
    description: 'Shared expense',
    splits: [
      { category: 'Groceries', amount: '150' },
      { category: 'Dining', amount: '100' },
    ],
  })
  await page.clock.setFixedTime(new Date('2026-03-01T10:00:00+05:30'))
  await page.reload()
  await page.getByLabel('App PIN', { exact: true }).fill(appPin)
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Shared expense', exact: true }).click()
  await page.getByRole('button', { name: 'Reimburse saved expense', exact: true }).click()
  const refund = page.getByRole('dialog', {
    name: 'Record reimbursement · Shared expense',
  })
  await refund.getByLabel('Amount received').fill('100')
  await refund.getByRole('button', { name: 'Record reimbursement', exact: true }).click()
  await expect(refund).toBeHidden()
  await openSection(page, 'Reports')
  await expectMetricValues(page.locator('.metric-group'), {
    Income: '₹0',
    Expenses: '-₹100',
    'Net cash flow': '₹100',
  })
  await expect(
    page.locator('.composition-row').filter({ hasText: 'Groceries' }).locator('strong'),
  ).toHaveText('-₹60')
  await expect(
    page.locator('.composition-row').filter({ hasText: 'Dining' }).locator('strong'),
  ).toHaveText('-₹40')
  await expect(
    page.getByRole('group', { name: 'Income and expenses by report interval' }),
  ).toContainText('Reimbursements')
  await page.getByLabel('Month', { exact: true }).fill('2026-02')
  await expectMetricValues(page.locator('.metric-group'), {
    Income: '₹0',
    Expenses: '₹250',
    'Net cash flow': '-₹250',
  })
})

test('deposit maturity posts principal and interest separately and removes the matured asset', async ({
  page,
}) => {
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Deposit bank', '20000')
  await openSection(page, 'Net worth')
  await page.getByRole('button', { name: 'Add valuation', exact: true }).click()
  const asset = page.getByRole('dialog', { name: 'Add asset or liability' })
  await asset.getByLabel('Category', { exact: true }).selectOption('fixed-deposit')
  await asset.getByLabel('Name', { exact: true }).fill('Bank FD')
  await asset.getByLabel('Current value', { exact: true }).fill('110000')
  await asset.getByLabel('Track maturity and confirmed interest payouts').check()
  await asset.getByLabel('Deposit principal', { exact: true }).fill('100000')
  await asset.getByLabel('Maturity date', { exact: true }).fill('2026-02-14')
  await asset.getByLabel('Confirmed maturity proceeds').fill('112000')
  await asset.getByLabel('Maturity instruction').selectOption('payout')
  await asset.getByLabel('Deposit cash account').selectOption({ label: 'Deposit bank' })
  await asset.getByRole('button', { name: 'Add valuation', exact: true }).click()
  await expect(asset).toBeHidden()
  await openSection(page, 'Alerts')
  await expect(
    page.getByText('Bank FD maturity needs review', { exact: true }),
  ).toBeVisible()
  await openSection(page, 'Net worth')
  await page
    .getByRole('button', { name: 'Record maturity of Bank FD', exact: true })
    .click()
  const maturity = page.getByRole('dialog', { name: 'Record maturity payout · Bank FD' })
  await maturity
    .getByRole('button', { name: 'Record maturity payout', exact: true })
    .click()
  await expect(maturity).toBeHidden()
  await expectMetricValues(page.locator('.metric-group'), { 'Net worth': '₹1,32,000' })
  await expect(page.getByRole('list', { name: 'Manual valuations' })).toContainText(
    'matured',
  )
  await openSection(page, 'Reports')
  await expectMetricValues(page.locator('.metric-group'), {
    Income: '₹12,000',
    Expenses: '₹0',
    'Net cash flow': '₹12,000',
  })
})
