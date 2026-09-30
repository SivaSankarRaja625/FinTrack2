import { expect } from '@playwright/test'

import {
  appPin,
  createWorkspace,
  expectMetricValues,
  openSection,
  test,
} from './support/finance'
import { addAccount, addTransaction } from './support/records'

test('a recurring bank transfer posts without a category or changing total wealth', async ({
  page,
}) => {
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Main bank', '5000')
  await addAccount(page, 'Reserve bank')
  await openSection(page, 'Plan & cash flow')
  await page
    .getByRole('button', { name: 'Add recurring item', exact: true })
    .first()
    .click()
  const schedule = page.getByRole('dialog', { name: 'Add recurring item', exact: true })
  await schedule.getByLabel('Name', { exact: true }).fill('Reserve transfer')
  await schedule.getByLabel('Type', { exact: true }).selectOption('transfer')
  await schedule.getByLabel('Amount', { exact: true }).fill('1500')
  await schedule.getByLabel('From account').selectOption({ label: 'Main bank' })
  await schedule.getByLabel('To account').selectOption({ label: 'Reserve bank' })
  await schedule.getByRole('button', { name: 'Add recurring item', exact: true }).click()
  await page.getByRole('button', { name: 'Post / match Reserve transfer' }).click()
  const posting = page.getByRole('dialog', {
    name: 'Post or match occurrence · Reserve transfer',
  })
  await posting
    .getByRole('button', { name: 'Post or match occurrence', exact: true })
    .click()
  await expect(posting).toBeHidden()
  await openSection(page, 'Net worth')
  await expectMetricValues(page.locator('.metric-group'), {
    'Net worth': '₹5,000',
    Debt: '₹0',
  })
  const accounts = page.getByRole('list', { name: 'Account balances' })
  await expect(accounts.locator('li').filter({ hasText: 'Main bank' })).toContainText(
    '₹3,500',
  )
  await expect(accounts.locator('li').filter({ hasText: 'Reserve bank' })).toContainText(
    '₹1,500',
  )
  await openSection(page, 'Reports')
  await expectMetricValues(page.locator('.metric-group'), {
    Income: '₹0',
    Expenses: '₹0',
    'Net cash flow': '₹0',
  })
})

test('deleting an imported row preserves batch audit and rolls back only the remaining cash', async ({
  page,
}) => {
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Import bank', '100')
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click()
  const importer = page.getByRole('dialog', { name: 'Import transactions from CSV' })
  await importer.getByLabel('CSV statement').setInputFiles({
    name: 'statement.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Date,Description,Amount\n2026-02-14,Imported groceries,-10\n2026-02-14,Imported salary,30',
    ),
  })
  await importer.getByRole('button', { name: 'Import 2', exact: true }).click()
  await expect(importer).toBeHidden()
  await page
    .getByRole('button', { name: 'Delete Imported groceries', exact: true })
    .click()
  await page
    .getByRole('dialog', { name: 'Delete this transaction?' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click()
  await expect(page.getByRole('button', { name: 'Edit Imported groceries' })).toHaveCount(
    0,
  )
  await expect(page.getByText(/1 individually removed/)).toBeVisible()
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await expectMetricValues(page.locator('.dashboard-summary'), {
    'Current net worth': '₹130',
  })
  await openSection(page, 'Transactions')
  await page.getByRole('button', { name: 'Roll back', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Roll back this CSV import?' })
    .getByRole('button', { name: 'Roll back import', exact: true })
    .click()
  await expect(page.getByRole('button', { name: 'Edit Imported salary' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await expectMetricValues(page.locator('.dashboard-summary'), {
    'Current net worth': '₹100',
    'Income this month': '₹0',
    'Expenses this month': '₹0',
  })
})

test('undo after reload restores a matched bank entry rather than refunding cash twice', async ({
  page,
}) => {
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Payment bank', '10000')
  await addTransaction(page, {
    kind: 'Expense',
    date: '2026-02-14',
    account: 'Payment bank',
    amount: '500',
    category: 'Loan payment',
    description: 'Bank EMI',
  })
  await openSection(page, 'Loans & credit')
  await page.getByRole('button', { name: 'Add loan', exact: true }).first().click()
  const loan = page.getByRole('dialog', { name: 'Add loan', exact: true })
  for (const [label, value] of [
    ['Loan name', 'Matched loan'],
    ['Lender', 'Example'],
    ['Original principal', '2000'],
    ['Current outstanding', '2000'],
    ['Base annual interest rate (%)', '12'],
    ['Remaining term (months)', '6'],
    ['EMI (leave blank to calculate)', '500'],
  ]) {
    await loan.getByLabel(label, { exact: true }).fill(value)
  }
  await loan.getByRole('button', { name: 'Add loan', exact: true }).click()
  await page.getByRole('button', { name: 'Record payment', exact: true }).click()
  const payment = page.getByRole('dialog', { name: 'Record payment · Matched loan' })
  await payment.getByLabel('Principal paid').fill('400')
  await payment.getByLabel('Interest paid').fill('100')
  await payment.getByLabel('Cash entry').selectOption('match')
  await payment
    .getByLabel('Existing bank transaction')
    .selectOption({ label: 'Payment bank · 2026-02-14 · Bank EMI · ₹500' })
  await payment.getByRole('button', { name: 'Record payment', exact: true }).click()
  await expect(payment).toBeHidden()
  await page.reload()
  await page.getByLabel('App PIN', { exact: true }).fill(appPin)
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await page.getByRole('button', { name: 'Undo financial event', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Undo this financial event?' })
    .getByRole('button', { name: 'Undo event', exact: true })
    .click()
  await expectMetricValues(page.locator('.metric-group').first(), {
    'Loan outstanding': '₹2,000',
  })
  await openSection(page, 'Transactions')
  await expect(
    page.getByRole('button', { name: 'Edit Bank EMI', exact: true }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('list', { name: 'Transactions' })
      .getByRole('button', { name: /^Edit / }),
  ).toHaveCount(1)
  await openSection(page, 'Net worth')
  await expectMetricValues(page.locator('.metric-group'), {
    'Net worth': '₹7,500',
    Debt: '₹2,000',
  })
  await expect(page.getByRole('list', { name: 'Account balances' })).toContainText(
    '₹9,500',
  )
})
