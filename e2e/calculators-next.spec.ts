import { changeCalculator, editAssumptions } from './support/calculators'
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

import { createWorkspace, expectMetricValues, openSection, test } from './support/finance'

async function select(page: Page, category: string, calculator: string) {
  await changeCalculator(page)
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
  await editAssumptions(page)
  await page.getByLabel('PPF opening date').fill('2026-04-05')
  await editAssumptions(page)
  await page.getByLabel('Deposit per instalment').fill('150000')
  await editAssumptions(page)
  await page.getByLabel('Deposit frequency').selectOption('yearly')
  await editAssumptions(page)
  await page.getByLabel('Assumed annual PPF rate').fill('7.1')
  await page.getByRole('button', { name: 'Calculate' }).click()
  // Sixteen yearly deposits; each March credits 7.1%, rounded once to paise.
  await expectMetricValues(page.getByRole('region', { name: 'Calculation result' }), {
    'External contributions': '₹24,00,000',
    'Cash received': '₹0',
    'End value': '₹45,17,702.09',
    'Gain or interest': '₹21,17,702.09',
  })
  await expect(page.getByText(/2042-03-31/).first()).toBeVisible()
  await page.getByText('Calculation schedule').click()
  await expect(page.getByRole('row', { name: /2027-03-31.*PPF interest/ })).toContainText(
    '₹10,650',
  )
  await expect(page.getByText(/future rates are unknown/)).toBeVisible()
  await editAssumptions(page)
  await page.getByLabel('PPF opening date').fill('2026-04-06')
  await expect(page.getByText('Outdated')).toBeVisible()
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByRole('row', { name: /2027-03-31.*PPF interest/ })).toContainText(
    '₹9,762.5',
  )
})

test('SCSS pays quarterly without compounding and uses its own assumptions', async ({
  page,
}) => {
  await createWorkspace(page)
  await openSection(page, 'Calculators')
  await select(page, 'Government savings', 'Senior Citizens Savings Scheme')
  await editAssumptions(page)
  await page.getByLabel('SCSS deposit date').fill('2026-01-01')
  await editAssumptions(page)
  await page.getByLabel('Single SCSS deposit').fill('3000000')
  await editAssumptions(page)
  await page.getByLabel('Opening-date SCSS annual rate').fill('8.2')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expectMetricValues(page.getByRole('region', { name: 'Calculation result' }), {
    'External contributions': '₹30,00,000',
    'Cash received': '₹12,30,000',
    'End value': '₹30,00,000',
    'Gain or interest': '₹12,30,000',
  })
  await page.getByText('Calculation schedule', { exact: true }).click()
  await expect(
    page.getByRole('row', { name: /2026-04-01.*SCSS cash interest received/ }),
  ).toContainText('-₹61,500')
  await expect(page.getByText(/Quarterly cash interest is not reinvested/)).toBeVisible()
  await expect(page.getByText(/eligibility checks are modelled/)).toBeVisible()
})

test('RBI floating bond keeps coupons separate and allows dated rate resets', async ({
  page,
}) => {
  await createWorkspace(page)
  await openSection(page, 'Calculators')
  await select(page, 'Bonds', 'RBI floating-rate savings bond')
  await editAssumptions(page)
  await page.getByLabel('Bond subscription date').fill('2026-01-01')
  await editAssumptions(page)
  await page.getByLabel('Bond principal').fill('1000000')
  await editAssumptions(page)
  await page.getByLabel('Assumed NSC benchmark rate').fill('7.7')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expectMetricValues(page.getByRole('region', { name: 'Calculation result' }), {
    'External contributions': '₹10,00,000',
    'Cash received': '₹5,63,500',
    'End value': '₹10,00,000',
    'Gain or interest': '₹5,63,500',
  })
  await expect(page.getByText(/future Jan\/Jul resets/)).toBeVisible()
  await editAssumptions(page)
  await page.getByLabel('NSC reset overrides (optional)').fill('2027-01-01,6.7')
  await expect(page.getByText('Outdated')).toBeVisible()
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expectMetricValues(page.getByRole('region', { name: 'Calculation result' }), {
    'External contributions': '₹10,00,000',
    'Cash received': '₹5,58,500',
    'End value': '₹10,00,000',
    'Gain or interest': '₹5,58,500',
  })
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
    await editAssumptions(page)
    await page.getByLabel(label).fill(value)
  }
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expectMetricValues(page.getByRole('region', { name: 'Calculation result' }), {
    'Additional cover gap': '₹3,00,000',
    'Present value of dependent living costs': '₹5,00,000',
    'Outstanding debts': '₹2,00,000',
    'Goals and one-time costs': '₹1,00,000',
    'Gross family need': '₹8,00,000',
    'Available resources (liquid savings and existing cover)': '₹5,00,000',
  })
  await expect(page.getByRole('button', { name: 'Add scenario' })).toHaveCount(0)
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
  await editAssumptions(page)
  await page.getByLabel('Outstanding loan balance').fill('12000')
  await editAssumptions(page)
  await page.getByLabel('Annual loan rate').fill('0')
  await editAssumptions(page)
  await page.getByLabel('Remaining EMIs').fill('12')
  await expect(page.locator('.calculator-form input[type="date"]')).toHaveCount(0)
  await editAssumptions(page)
  await page.getByLabel('Prepayment amount').fill('3000')
  await editAssumptions(page)
  await page.getByLabel('Prepayment after EMI number').fill('3')
  await editAssumptions(page)
  await page.getByLabel('Prepayment charge (if any)').fill('0')
  await editAssumptions(page)
  await page.getByLabel('Repayment choice').selectOption('reduce-tenure')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(
    page.getByRole('heading', { name: 'Illustration', exact: true }),
  ).toBeFocused()
  await expect(page.getByLabel('Remaining EMIs', { exact: true })).toBeHidden()
  await page.getByRole('button', { name: 'Edit assumptions', exact: true }).click()
  await expect(page.getByLabel('Remaining EMIs', { exact: true })).toHaveValue('12')
  await page.getByRole('button', { name: 'Hide assumptions', exact: true }).click()
  const result = page.getByRole('region', { name: 'Calculation result' })
  await expectMetricValues(result, {
    'Net nominal interest saved after charge': '₹0',
    'Months saved': '3 months',
    'Original monthly EMI': '₹1,000',
    'EMI after prepayment': '₹1,000',
    'Interest without prepayment': '₹0',
    'Interest with prepayment': '₹0',
    'Entered prepayment charge': '₹0',
    'Final EMI after prepayment': 'EMI 9 of 12',
  })
  const comparison = page.getByRole('group', { name: 'Loan principal comparison' })
  await expect(
    comparison.getByRole('img', { name: /Remaining loan principal by EMI/ }),
  ).toBeVisible()
  const selectedEmi = comparison.getByRole('slider', { name: 'Selected EMI' })
  await expect(selectedEmi).toHaveAttribute(
    'aria-valuetext',
    'EMI 3: without prepayment ₹9,000; with prepayment ₹6,000',
  )
  await selectedEmi.press('End')
  await expect(comparison).toContainText('Paid off after EMI 9')
  await page.getByText('With prepayment repayment schedule', { exact: true }).click()
  await expect(page.getByRole('row', { name: /3.*₹3,000.*₹6,000/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add scenario' })).toHaveCount(0)
  await editAssumptions(page)
  await page.getByLabel('Repayment choice').selectOption('reduce-emi')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expectMetricValues(result, {
    'Net nominal interest saved after charge': '₹0',
    'Months saved': '0 months',
    'Original monthly EMI': '₹1,000',
    'EMI after prepayment': '₹666.67',
    'Interest without prepayment': '₹0',
    'Interest with prepayment': '₹0',
    'Entered prepayment charge': '₹0',
    'Final EMI after prepayment': 'EMI 12 of 12',
  })
  await expect(page.getByText(/no assumed investment return/)).toBeVisible()
  await editAssumptions(page)
  await page.getByLabel('Prepayment after EMI number').fill('1')
  await editAssumptions(page)
  await page.getByLabel('Prepayment amount').fill('11000')
  await editAssumptions(page)
  await page.getByLabel('Repayment choice').selectOption('reduce-tenure')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expectMetricValues(result, {
    'Net nominal interest saved after charge': '₹0',
    'Months saved': '11 months',
    'Original monthly EMI': '₹1,000',
    'EMI after prepayment': 'No further EMI',
    'Interest without prepayment': '₹0',
    'Interest with prepayment': '₹0',
    'Entered prepayment charge': '₹0',
    'Final EMI after prepayment': 'EMI 1 of 12',
  })
  await expect(
    comparison.getByRole('img', { name: /paid off after EMI 1/ }),
  ).toBeVisible()
  await selectedEmi.press('End')
  await expect(comparison).toContainText('Paid off after EMI 1')
  await expect(selectedEmi).toHaveAttribute(
    'aria-valuetext',
    'EMI 12: without prepayment ₹0; with prepayment ₹0',
  )
  await page.setViewportSize({ width: 320, height: 720 })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320)
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark'
  })
  const audit = await new AxeBuilder({ page })
    .include('.loan-balance-chart')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  expect(
    audit.violations.filter(
      ({ impact }) => impact === 'critical' || impact === 'serious',
    ),
  ).toEqual([])
})

test('loan interest, charges and every repayment row reconcile to principal', async ({
  page,
}) => {
  await createWorkspace(page)
  await openSection(page, 'Calculators')
  await select(page, 'Debt', 'Loan prepayment')
  for (const [label, value] of [
    ['Outstanding loan balance', '1000'],
    ['Annual loan rate', '12'],
    ['Remaining EMIs', '3'],
    ['Current monthly EMI (optional)', '400'],
    ['Prepayment amount', '300'],
    ['Prepayment after EMI number', '1'],
    ['Prepayment charge (if any)', '2'],
  ]) {
    await page.getByLabel(label).fill(value)
  }
  await page.getByLabel('Repayment choice').selectOption('reduce-tenure')
  await page.getByRole('button', { name: 'Calculate', exact: true }).click()
  const result = page.getByRole('region', { name: 'Calculation result' })
  // Monthly interest is 1%: 10 + 6.10 + 2.16 versus 10 + 3.10; fee is 2.
  await expectMetricValues(result, {
    'Net nominal interest saved after charge': '₹3.16',
    'Months saved': '1 months',
    'Original monthly EMI': '₹400',
    'EMI after prepayment': '₹400',
    'Interest without prepayment': '₹18.26',
    'Interest with prepayment': '₹13.1',
    'Entered prepayment charge': '₹2',
    'Final EMI after prepayment': 'EMI 2 of 3',
  })
  await result.getByText('Without prepayment repayment schedule', { exact: true }).click()
  await result.getByText('With prepayment repayment schedule', { exact: true }).click()
  const baseline = result
    .getByRole('table', { name: 'Without prepayment monthly loan payments' })
    .locator('tbody tr')
  const prepaid = result
    .getByRole('table', { name: 'With prepayment monthly loan payments' })
    .locator('tbody tr')
  await expect(baseline).toHaveCount(3)
  await expect(prepaid).toHaveCount(2)
  for (const [index, expected] of [
    ['1', '₹10', '₹400', '₹0', '₹610'],
    ['2', '₹6.1', '₹400', '₹0', '₹216.1'],
    ['3', '₹2.16', '₹218.26', '₹0', '₹0'],
  ].entries())
    await expect(baseline.nth(index).locator('td')).toHaveText(expected)
  for (const [index, expected] of [
    ['1', '₹10', '₹400', '₹300', '₹310'],
    ['2', '₹3.1', '₹313.1', '₹0', '₹0'],
  ].entries())
    await expect(prepaid.nth(index).locator('td')).toHaveText(expected)
  const slider = result.getByRole('slider', { name: 'Selected EMI' })
  await expect(slider).toHaveAttribute(
    'aria-valuetext',
    'EMI 1: without prepayment ₹610; with prepayment ₹310',
  )
  await slider.press('ArrowRight')
  await expect(slider).toHaveAttribute(
    'aria-valuetext',
    'EMI 2: without prepayment ₹216.1; with prepayment ₹0',
  )
})
