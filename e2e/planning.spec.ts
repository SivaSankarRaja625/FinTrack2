import { expect, type Locator, type Page } from '@playwright/test'

import { createWorkspace, openSection, test, testDate } from './support/finance'

function metric(page: Page, label: string) {
  return page.locator('.metric').filter({ hasText: label })
}

async function openFinanceSection(page: Page, label: string) {
  await openSection(page, label)
  await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible()
}

async function addAccount(page: Page, name: string, openingBalance: string) {
  await openFinanceSection(page, 'Transactions')
  await page.getByRole('button', { name: 'Add account' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add account' })
  await dialog.getByLabel('Account name').fill(name)
  await dialog.getByLabel('Opening balance').fill(openingBalance)
  await dialog.getByRole('button', { name: 'Add account' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.account-tile').filter({ hasText: name })).toBeVisible()
}

async function addTransaction(
  page: Page,
  kind: 'income' | 'expense',
  amount: string,
  description: string,
  category: string,
) {
  await page.getByRole('button', { name: 'Add transaction' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add transaction' })
  await dialog.getByLabel('Type', { exact: true }).selectOption(kind)
  await dialog.getByLabel('Category').selectOption({ label: category })
  await dialog.getByLabel('Amount').fill(amount)
  await dialog.getByLabel('Description').fill(description)
  await dialog.getByRole('button', { name: 'Add transaction' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Transactions' })).toContainText(
    description,
  )
}

async function expectPhoneFits(page: Page, populatedPanel: Locator) {
  await expect(populatedPanel).toBeVisible()
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  expect(widths.viewport).toBe(320)
  expect(widths.document).toBeLessThanOrEqual(widths.viewport)
  expect(widths.body).toBeLessThanOrEqual(widths.viewport)
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile')
  await page.setViewportSize({ width: 320, height: 720 })
  await createWorkspace(page)
})

test('posted groceries change a monthly budget and its exceeded status', async ({
  page,
}) => {
  await addAccount(page, 'Household savings', '10000')
  await addTransaction(page, 'expense', '1700', 'Weekly food shop', 'Groceries')
  await openFinanceSection(page, 'Plan & cash flow')

  await page.getByRole('button', { name: 'Add budget' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add monthly budget' })
  await dialog.getByLabel('Name').fill('Food envelope')
  await dialog.getByLabel('Expense category').selectOption({ label: 'Groceries' })
  await dialog.getByLabel('Monthly limit').fill('0')
  await dialog.getByRole('button', { name: 'Add budget' }).click()
  await expect(dialog.getByRole('alert')).toContainText(/greater than zero/u)
  await dialog.getByLabel('Monthly limit').fill('1000')
  await dialog.getByRole('button', { name: 'Add budget' }).click()

  const budget = page.locator('.budget-row').filter({ hasText: 'Food envelope' })
  await expect(budget.locator('.budget-main')).toContainText('₹1,700')
  await expect(budget.locator('.budget-main')).toContainText('of ₹1,000')
  await expect(metric(page, 'Lowest projected balance')).toContainText(
    '1 budget exceeded',
  )
  await expectPhoneFits(page, budget)

  await budget.locator('.budget-main').click()
  const edit = page.getByRole('dialog', { name: 'Edit budget' })
  await edit.getByLabel('Monthly limit').fill('2000')
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(budget.locator('.budget-main')).toContainText('of ₹2,000')
  await expect(metric(page, 'Lowest projected balance')).toContainText(
    'No category budget exceeded',
  )
  await page.getByRole('button', { name: 'Delete Food envelope' }).click()
  await page
    .getByRole('dialog', { name: 'Delete this budget?' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click()
  await expect(page.getByText('No active budgets')).toBeVisible()
})

test('scheduled income, expenses, and pausing update the 90-day forecast', async ({
  page,
}) => {
  await addAccount(page, 'Forecast savings', '5000')
  await openFinanceSection(page, 'Plan & cash flow')
  await expect(metric(page, 'Liquid balance today').locator('.metric-value')).toHaveText(
    '₹5,000',
  )

  await page.getByRole('button', { name: 'Add recurring item' }).first().click()
  const income = page.getByRole('dialog', { name: 'Add recurring item' })
  await income.getByLabel('Name').fill('Client stipend')
  await income.getByLabel('Type').selectOption('income')
  await income.getByLabel('Amount').fill('0')
  await income.getByRole('button', { name: 'Add recurring item' }).click()
  await expect(income.getByText(/valid positive INR amount/u)).toBeVisible()
  await income.getByLabel('Amount').fill('2000')
  await income.getByLabel('Next expected date').fill('2026-02-16')
  await income.getByLabel('Ends (optional)').fill('2026-04-16')
  await income.getByRole('button', { name: 'Add recurring item' }).click()
  await expectPhoneFits(
    page,
    page.locator('.upcoming-row').filter({ hasText: 'Client stipend' }).first(),
  )

  await page.getByRole('button', { name: 'Add recurring item' }).first().click()
  const rent = page.getByRole('dialog', { name: 'Add recurring item' })
  await rent.getByLabel('Name').fill('Studio rent')
  await rent.getByLabel('Amount').fill('1200')
  await rent.getByLabel('Next expected date').fill('2026-02-20')
  await rent.getByLabel('Ends (optional)').fill('2026-04-20')
  await rent.getByRole('button', { name: 'Add recurring item' }).click()

  await expect(metric(page, 'Projected in 90 days').locator('.metric-value')).toHaveText(
    '₹7,400',
  )
  await expect(
    metric(page, 'Lowest projected balance').locator('.metric-value'),
  ).toHaveText('₹5,000')
  await expect(
    page.locator('.upcoming-row').filter({ hasText: 'Client stipend' }).first(),
  ).toContainText('16 Feb 2026')
  await expect(
    page.locator('.upcoming-row').filter({ hasText: 'Studio rent' }).first(),
  ).toContainText('−₹1,200')
  await expectPhoneFits(page, page.locator('.upcoming-row').first())

  await page.getByRole('button', { name: 'Edit Studio rent' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit recurring item' })
  await edit.getByRole('checkbox', { name: /Keep this recurring item active/u }).uncheck()
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(metric(page, 'Projected in 90 days').locator('.metric-value')).toHaveText(
    '₹11,000',
  )
  await expect(
    page.locator('.upcoming-row').filter({ hasText: 'Studio rent' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Delete Client stipend' }).click()
  await page
    .getByRole('dialog', { name: 'Delete this recurring item?' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click()
  await expect(metric(page, 'Projected in 90 days').locator('.metric-value')).toHaveText(
    '₹5,000',
  )
})

test('manual debt and valuations update net worth without rewriting a snapshot', async ({
  page,
}) => {
  await addAccount(page, 'Main savings', '20000')
  await openFinanceSection(page, 'Net worth')
  await page.getByRole('button', { name: 'Add valuation' }).click()
  const asset = page.getByRole('dialog', { name: 'Add asset or liability' })
  await asset.getByLabel('Name').fill('Workshop equipment')
  await asset.getByLabel('Current value', { exact: true }).fill('-100')
  await asset.getByRole('button', { name: 'Add valuation' }).click()
  await expect(asset.getByRole('alert')).toContainText(/cannot be negative/u)
  await asset.getByLabel('Current value', { exact: true }).fill('50000')
  await asset.getByLabel('Valuation date').fill('2025-10-01')
  await asset.getByRole('button', { name: 'Add valuation' }).click()
  await expect(
    page.locator('tr').filter({ hasText: 'Workshop equipment' }),
  ).toContainText('Stale value')
  await expectPhoneFits(
    page,
    page.locator('tr').filter({ hasText: 'Workshop equipment' }),
  )
  await page.getByRole('button', { name: 'Add liability' }).click()
  const liability = page.getByRole('dialog', { name: 'Add asset or liability' })
  await liability.getByLabel('Name').fill('Personal payable')
  await liability.getByLabel('Current value', { exact: true }).fill('12000')
  await liability.getByLabel('Valuation date').fill(testDate)
  await liability.getByRole('button', { name: 'Add valuation' }).click()
  await expect(metric(page, 'Net worth').locator('.metric-value')).toHaveText('₹58,000')
  await expect(metric(page, 'Debt').locator('.metric-value')).toHaveText('₹12,000')
  await expect(metric(page, 'Debt').locator('.metric-detail')).toHaveText(
    '17.1% of gross assets',
  )
  await expectPhoneFits(page, page.locator('tr').filter({ hasText: 'Personal payable' }))

  await page.getByRole('button', { name: 'Record snapshot' }).click()
  await expect(page.locator('.toast-region')).toContainText('Net worth snapshot recorded')
  await page.getByRole('button', { name: 'Edit Workshop equipment' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit valuation' })
  await edit.getByLabel('Current value', { exact: true }).fill('62000')
  await edit.getByLabel('Valuation date').fill(testDate)
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(metric(page, 'Net worth').locator('.metric-value')).toHaveText('₹70,000')
  await page.getByRole('button', { name: 'Record snapshot' }).click()
  await expect(page.locator('.toast-region')).toContainText('Today’s snapshot updated')
  await page.clock.setFixedTime(new Date('2026-02-15T10:00:00+05:30'))
  await page.getByRole('button', { name: 'Delete Personal payable' }).click()
  await page
    .getByRole('dialog', { name: 'Delete this valuation?' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click()
  await expect(metric(page, 'Net worth').locator('.metric-value')).toHaveText('₹82,000')
  const history = page.locator('.chart table').filter({ hasText: 'Net worth history' })
  await expect(history.locator('tbody tr')).toHaveCount(2)
  await expect(history.locator('tbody tr').first()).toContainText('₹70,000')
  await expect(history.locator('tbody tr').last()).toContainText('₹82,000')
  await expectPhoneFits(page, page.getByRole('img', { name: 'Net worth history' }))
})

test('a goal follows a linked balance while target-date scenarios remain unsaved', async ({
  page,
}) => {
  await addAccount(page, 'Goal reserve', '4000')
  await openFinanceSection(page, 'Goals')
  await page.getByRole('button', { name: 'Add goal' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add savings goal' })
  await dialog.getByLabel('Goal name').fill('Education reserve')
  await dialog.getByLabel('Target amount').fill('0')
  await dialog.getByLabel('Amount already saved').fill('3000')
  await dialog.getByLabel('Target date').fill('2026-12-14')
  await dialog.getByLabel('Planned monthly contribution').fill('500')
  await dialog.getByRole('button', { name: 'Add goal' }).click()
  await expect(dialog.getByRole('alert')).toContainText(/greater than zero/u)
  await dialog.getByLabel('Target amount').fill('12000')
  await dialog.getByRole('button', { name: 'Add goal' }).click()

  const goal = page.locator('.goal-card').filter({ hasText: 'Education reserve' })
  await expect(metric(page, 'Combined target').locator('.metric-value')).toHaveText(
    '₹12,000',
  )
  await expect(
    metric(page, 'Saved toward active goals').locator('.metric-value'),
  ).toHaveText('₹3,000')
  await expect(goal.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
  await expect(
    goal.locator('.goal-stats > div').filter({ hasText: 'Required monthly' }),
  ).toContainText('₹900')

  await page.getByRole('button', { name: 'Edit Education reserve' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit goal' })
  await edit.getByLabel('Linked savings account').selectOption({
    label: 'Goal reserve',
  })
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(
    metric(page, 'Saved toward active goals').locator('.metric-value'),
  ).toHaveText('₹4,000')
  await expect(goal.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33')
  await expect(
    goal.locator('.goal-stats > div').filter({ hasText: 'Required monthly' }),
  ).toContainText('₹800')

  await openFinanceSection(page, 'Transactions')
  await addTransaction(page, 'income', '2000', 'Reserve top-up', 'Salary')
  await openFinanceSection(page, 'Goals')
  await expect(
    metric(page, 'Saved toward active goals').locator('.metric-value'),
  ).toHaveText('₹6,000')
  await expect(goal.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
  await expect(
    goal.locator('.goal-stats > div').filter({ hasText: 'Required monthly' }),
  ).toContainText('₹600')

  await goal.getByRole('button', { name: 'Adjust scenario' }).click()
  const scenario = page.locator('.scenario-panel')
  await scenario.getByLabel('Alternative target date').fill('2027-02-14')
  await expect(
    scenario.locator('.metric').filter({ hasText: 'Required monthly' }),
  ).toContainText('₹500')
  await expect(
    scenario.locator('.metric').filter({ hasText: 'Difference from current plan' }),
  ).toContainText('₹0')
  await expectPhoneFits(page, scenario)
  await page.getByRole('button', { name: 'Close scenario' }).click()
  await expect(
    goal.locator('.goal-stats > div').filter({ hasText: 'Required monthly' }),
  ).toContainText('₹600')
  await goal.getByRole('button', { name: 'Delete' }).click()
  await page
    .getByRole('dialog', { name: 'Delete goal?' })
    .getByRole('button', { name: 'Delete goal' })
    .click()
  await expect(page.getByText('No active goals')).toBeVisible()
  await expect(
    metric(page, 'Saved toward active goals').locator('.metric-value'),
  ).toHaveText('₹0')
})
