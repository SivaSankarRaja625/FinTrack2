import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

import { createWorkspace, openSection, test } from './support/finance'

async function select(page: Page, category: string, calculator: string) {
  await page
    .getByRole('group', { name: 'Calculator categories' })
    .getByRole('button', { name: category })
    .click()
  await page
    .getByRole('group', { name: 'Available calculators' })
    .getByRole('button', { name: calculator })
    .click()
}

test('PPF shows fifth-day accrual and government-savings disclosures', async ({
  page,
}) => {
  await createWorkspace(page)
  await openSection(page, 'Calculators')
  await select(page, 'Government savings', 'Public Provident Fund')
  await page.getByLabel('PPF opening date').fill('2026-04-05')
  await page.getByLabel('Deposit per instalment').fill('150000')
  await page.getByLabel('Deposit frequency').selectOption('yearly')
  await page.getByLabel('Assumed annual PPF rate').fill('7.1')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText(/2042-03-31/).first()).toBeVisible()
  await page.getByText('Calculation schedule').click()
  await expect(page.getByRole('row', { name: /2027-03-31.*PPF interest/ })).toContainText(
    '₹10,650',
  )
  await expect(page.getByText(/future rates are unknown/)).toBeVisible()
  await page.getByLabel('PPF opening date').fill('2026-04-06')
  await expect(page.getByText('Outdated')).toBeVisible()
})

test('SCSS pays quarterly without compounding and uses its own assumptions', async ({
  page,
}) => {
  await createWorkspace(page)
  await openSection(page, 'Calculators')
  await select(page, 'Government savings', 'Senior Citizens Savings Scheme')
  await page.getByLabel('SCSS deposit date').fill('2026-01-01')
  await page.getByLabel('Single SCSS deposit').fill('3000000')
  await page.getByLabel('Opening-date SCSS annual rate').fill('8.2')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText('₹12,30,000').first()).toBeVisible()
  await expect(page.getByText(/Quarterly cash interest is not reinvested/)).toBeVisible()
  await expect(page.getByText(/eligibility checks are modelled/)).toBeVisible()
})

test('RBI floating bond keeps coupons separate and allows dated rate resets', async ({
  page,
}) => {
  await createWorkspace(page)
  await openSection(page, 'Calculators')
  await select(page, 'Bonds', 'RBI floating-rate savings bond')
  await page.getByLabel('Bond subscription date').fill('2026-01-01')
  await page.getByLabel('Bond principal').fill('1000000')
  await page.getByLabel('Assumed NSC benchmark rate').fill('7.7')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText('₹5,63,500').first()).toBeVisible()
  await expect(page.getByText(/future Jan\/Jul resets/)).toBeVisible()
  await page.getByLabel('NSC reset overrides (optional)').fill('2027-01-01,6.7')
  await expect(page.getByText('Outdated')).toBeVisible()
  await page.getByRole('button', { name: 'Calculate' }).click()
  await page.getByText('Calculation schedule').click()
  await expect(
    page.getByRole('row', { name: /2027-07-01.*Floating bond coupon/ }),
  ).toContainText('₹35,250')
})

test('cover gap shows a breakdown rather than an investable scenario', async ({
  page,
}) => {
  await createWorkspace(page)
  await openSection(page, 'Calculators')
  await select(page, 'Protection', 'Life cover gap')
  for (const [label, value] of [
    ['Annual dependent living costs', '100000'],
    ['Years of support', '5'],
    ['Expected inflation rate', '0'],
    ['Post-tax investment return', '0'],
    ['Outstanding debts', '200000'],
    ['Goals and one-time costs', '100000'],
    ['Available liquid savings', '200000'],
    ['Existing life cover', '300000'],
  ]) {
    await page.getByLabel(label).fill(value)
  }
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText('Additional cover gap')).toBeVisible()
  await expect(page.getByText('₹3,00,000').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add scenario' })).toBeDisabled()
  await page.setViewportSize({ width: 320, height: 720 })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320)
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(
    audit.violations.filter(
      ({ impact }) => impact === 'critical' || impact === 'serious',
    ),
  ).toEqual([])
})

test('loan prepayment compares tenure and EMI choices without treating savings as returns', async ({
  page,
}) => {
  await createWorkspace(page)
  await openSection(page, 'Calculators')
  await select(page, 'Debt', 'Loan prepayment')
  await page.getByLabel('Outstanding loan balance').fill('12000')
  await page.getByLabel('Annual loan rate').fill('0')
  await page.getByLabel('Remaining EMIs').fill('12')
  await page.getByLabel('Next EMI date').fill('2026-01-31')
  await page.getByLabel('Prepayment amount').fill('3000')
  await page.getByLabel('Prepayment after EMI number').fill('3')
  await page.getByLabel('Prepayment charge (if any)').fill('0')
  await page.getByLabel('Repayment choice').selectOption('reduce-tenure')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText('Months saved')).toBeVisible()
  await expect(page.getByText('3 months')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add scenario' })).toBeDisabled()
  await page.getByLabel('Repayment choice').selectOption('reduce-emi')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText('₹666.67').first()).toBeVisible()
  await expect(page.getByText(/no assumed investment return/)).toBeVisible()
  await page.getByLabel('Prepayment after EMI number').fill('1')
  await page.getByLabel('Prepayment amount').fill('11000')
  await page.getByLabel('Repayment choice').selectOption('reduce-tenure')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText('No further EMI')).toBeVisible()
})
