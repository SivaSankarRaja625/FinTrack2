import { expect, type Page } from '@playwright/test'

import { createWorkspace, openSection, test, testDate } from './support/finance'

function metric(page: Page, label: string) {
  return page
    .locator('.metric-group .metric')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('strong')
}

function reportValue(page: Page, label: string) {
  return page
    .locator('.composition-row')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('strong')
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful phone workflow')
  test.slow()
  await createWorkspace(page)
})

test('loan validation, rate change, and payment recalculate the schedule and debt', async ({
  page,
}) => {
  await openSection(page, 'Loans & credit')
  await page.getByRole('button', { name: 'Add loan' }).first().click()
  const loan = page.getByRole('dialog', { name: 'Add loan' })
  await loan.getByLabel('Loan name').fill('City bike loan')
  await loan.getByLabel('Lender').fill('Local credit union')
  await loan.getByLabel('Original principal').fill('0')
  await loan.getByLabel('Current outstanding').fill('12000')
  await loan.getByLabel('Base annual interest rate (%)').fill('12')
  await loan.getByLabel('Remaining term (months)').fill('12')
  await loan.getByLabel('EMI (leave blank to calculate)').fill('1200')
  await loan.getByLabel('Original start date').fill('2026-01-14')
  await loan.getByLabel('Next EMI date').fill(testDate)
  await loan.getByRole('button', { name: 'Add loan' }).click()
  await expect(loan.getByRole('alert')).toHaveText('Principal must be greater than zero')
  await expect(page.getByRole('heading', { name: 'No loans recorded' })).toBeVisible()

  await loan.getByLabel('Original principal').fill('12000')
  await loan.getByRole('button', { name: 'Add loan' }).click()
  await expect(loan).toBeHidden()
  await expect(metric(page, 'Loan outstanding')).toHaveText('₹12,000')
  await expect(metric(page, 'Monthly EMIs')).toHaveText('₹1,200')

  const firstMonth = page
    .getByRole('table')
    .filter({ has: page.getByRole('columnheader', { name: 'Opening' }) })
    .locator('tbody tr')
    .first()
  await expect(firstMonth.locator('td')).toHaveText([
    '1',
    '14 Feb 2026',
    '₹12,000',
    '₹1,080',
    '₹120',
    '₹1,200',
    '₹10,920',
  ])

  await page.getByRole('button', { name: 'Record rate', exact: true }).click()
  const rate = page.getByRole('dialog', {
    name: 'Record rate change · City bike loan',
  })
  await rate.getByLabel('Effective date').fill(testDate)
  await rate.getByLabel('Annual interest rate (%)').fill('24')
  await rate.getByRole('button', { name: 'Record rate' }).click()
  await expect(rate).toBeHidden()
  await expect(
    page.locator('.loan-detail-grid .metric').filter({ hasText: 'Current rate' }),
  ).toContainText('24.00%')
  await expect(firstMonth.locator('td')).toHaveText([
    '1',
    '14 Feb 2026',
    '₹12,000',
    '₹960',
    '₹240',
    '₹1,200',
    '₹11,040',
  ])

  await page.getByRole('button', { name: 'Record payment', exact: true }).click()
  const payment = page.getByRole('dialog', {
    name: 'Record payment · City bike loan',
  })
  await payment.getByLabel('Payment date').fill(testDate)
  await payment.getByLabel('Principal paid').fill('1000')
  await payment.getByLabel('Interest paid').fill('240')
  await payment.getByLabel('Additional prepayment').fill('500')
  await payment.getByRole('button', { name: 'Record payment' }).click()
  await expect(payment).toBeHidden()
  await expect(metric(page, 'Loan outstanding')).toHaveText('₹10,500')
  await expect(
    page.locator('.loan-detail-grid .metric').filter({ hasText: 'Next payment' }),
  ).toContainText('14 Mar 2026')
  await expect(firstMonth.locator('td')).toHaveText([
    '1',
    '14 Mar 2026',
    '₹10,500',
    '₹990',
    '₹210',
    '₹1,200',
    '₹9,510',
  ])
  await expect(
    page
      .locator('.card')
      .filter({ has: page.getByRole('heading', { name: 'Recorded payments' }) })
      .locator('tbody tr'),
  ).toContainText('₹1,740')

  await openSection(page, 'Reports')
  await expect(reportValue(page, 'Total debt')).toHaveText('₹10,500')
  await expect(reportValue(page, 'Net worth')).toHaveText('-₹10,500')
})

test('holding edits, prices, buys and sells reconcile portfolio and Reports', async ({
  page,
}) => {
  await openSection(page, 'Investments')
  await page.getByRole('button', { name: 'Add holding' }).first().click()
  const add = page.getByRole('dialog', { name: 'Add holding' })
  await add.getByLabel('Holding name').fill('Growth fund')
  await add.getByLabel('Units').fill('10')
  await add.getByLabel('Average unit cost').fill('100')
  await add.getByLabel('Current unit price').fill('120')
  await add.getByLabel('Price date').fill('2026-02-13')
  await add.getByRole('button', { name: 'Add holding' }).click()
  await expect(add).toBeHidden()
  await expect(metric(page, 'Portfolio value')).toHaveText('₹1,200')
  await expect(metric(page, 'Cost basis')).toHaveText('₹1,000')
  await expect(metric(page, 'Unrealised gain')).toHaveText('₹200')

  const holdings = page.getByRole('list', { name: 'Holdings' })
  await holdings.getByRole('button', { name: 'Edit Growth fund' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit holding' })
  await edit.getByLabel('Holding name').fill('Growth fund plus')
  await edit.getByLabel('Symbol or folio').fill('gfp')
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(edit).toBeHidden()
  await expect(
    holdings.getByRole('button', { name: /Growth fund plus.*GFP · 10 units/su }),
  ).toBeVisible()

  await holdings
    .getByRole('button', { name: 'Update price for Growth fund plus' })
    .click()
  const price = page.getByRole('dialog', { name: 'Update Growth fund plus' })
  await price.getByLabel('Price date').fill(testDate)
  await price.getByLabel('Unit price').fill('150')
  await price.getByRole('button', { name: 'Record price' }).click()
  await expect(price).toBeHidden()
  await expect(metric(page, 'Portfolio value')).toHaveText('₹1,500')
  await expect(metric(page, 'Unrealised gain')).toHaveText('₹500')
  await expect(
    page.getByRole('img', { name: 'Growth fund plus valuation history' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Record activity' }).click()
  const buy = page.getByRole('dialog', {
    name: 'Record activity for Growth fund plus',
  })
  await buy.getByLabel('Units').fill('2')
  await buy.getByLabel('Total amount').fill('200')
  await buy.getByRole('button', { name: 'Record activity' }).click()
  await expect(buy).toBeHidden()
  await expect(metric(page, 'Portfolio value')).toHaveText('₹1,800')
  await expect(metric(page, 'Cost basis')).toHaveText('₹1,200')

  await page.getByRole('button', { name: 'Record activity' }).click()
  const sell = page.getByRole('dialog', {
    name: 'Record activity for Growth fund plus',
  })
  await sell.getByLabel('Activity', { exact: true }).selectOption('sell')
  await sell.getByLabel('Units').fill('13')
  await sell.getByLabel('Total amount').fill('1950')
  await sell.getByRole('button', { name: 'Record activity' }).click()
  await expect(sell.getByRole('alert')).toHaveText(
    'Units removed cannot exceed the current units',
  )
  await expect(metric(page, 'Portfolio value')).toHaveText('₹1,800')
  await sell.getByLabel('Units').fill('3')
  await sell.getByLabel('Total amount').fill('450')
  await sell.getByRole('button', { name: 'Record activity' }).click()
  await expect(sell).toBeHidden()
  await expect(metric(page, 'Portfolio value')).toHaveText('₹1,350')
  await expect(metric(page, 'Cost basis')).toHaveText('₹900')
  await expect(metric(page, 'Unrealised gain')).toHaveText('₹450')
  await expect(
    holdings.getByRole('button', { name: /Growth fund plus.*GFP · 9 units/su }),
  ).toBeVisible()

  await openSection(page, 'Reports')
  await expect(reportValue(page, 'Investment value')).toHaveText('₹1,350')
  await expect(reportValue(page, 'Investment gain')).toHaveText('₹450')
  await expect(reportValue(page, 'Net worth')).toHaveText('₹1,350')

  await openSection(page, 'Investments')
  await page.getByRole('button', { name: 'Delete holding' }).click()
  await page
    .getByRole('dialog', { name: 'Delete holding?' })
    .getByRole('button', { name: 'Delete holding' })
    .click()
  await expect(page.getByRole('heading', { name: 'No holdings yet' })).toBeVisible()
  await expect(metric(page, 'Portfolio value')).toHaveText('₹0')
  await openSection(page, 'Reports')
  await expect(reportValue(page, 'Net worth')).toHaveText('₹0')
})

test('policy edits recalculate premiums and encrypted document round-trips before deletion', async ({
  page,
}) => {
  await openSection(page, 'Insurance')
  await page.getByRole('button', { name: 'Add policy' }).first().click()
  const add = page.getByRole('dialog', { name: 'Add insurance policy' })
  await add.getByLabel('Insurer', { exact: true }).fill('Local health insurer')
  await add.getByLabel('Policy name').fill('Family health shield')
  await add.getByLabel('Cover amount').fill('500000')
  await add.getByLabel('Premium', { exact: true }).fill('1200')
  await add.getByLabel('Premium frequency').selectOption('monthly')
  await add.getByLabel('Next premium due').fill('2026-02-28')
  await add.getByRole('button', { name: 'Add policy' }).click()
  await expect(add).toBeHidden()
  await expect(metric(page, 'Active policies')).toHaveText('1')
  await expect(metric(page, 'Total cover')).toHaveText('₹5,00,000')
  await expect(metric(page, 'Estimated annual premium')).toHaveText('₹14,400')
  await expect(metric(page, 'Premiums due within 30 days')).toHaveText('1')

  await page
    .getByRole('list', { name: 'Policies' })
    .getByRole('button', { name: 'Edit Family health shield' })
    .click()
  const edit = page.getByRole('dialog', { name: 'Edit insurance policy' })
  await edit.getByLabel('Policy name').fill('Family health plus')
  await edit.getByLabel('Premium', { exact: true }).fill('1500')
  await edit.getByLabel('Premium frequency').selectOption('quarterly')
  await edit.getByLabel('Next premium due').fill('2026-04-15')
  await edit.getByLabel('Nominee', { exact: true }).fill('Asha')
  await edit.getByLabel('Nominee relation').fill('Spouse')
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(edit).toBeHidden()
  await expect(metric(page, 'Estimated annual premium')).toHaveText('₹6,000')
  await expect(metric(page, 'Premiums due within 30 days')).toHaveText('0')
  await expect(page.locator('.detail-list')).toContainText('Asha · Spouse')

  const filename = 'health-card.png'
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgqP//HwAEfwJ+n8GAKAAAAABJRU5ErkJggg==',
    'base64',
  )
  await page.getByLabel('Add document').setInputFiles({
    name: filename,
    mimeType: 'image/png',
    buffer: image,
  })
  const document = page.locator('.document-row').filter({ hasText: filename })
  await expect(document).toBeVisible()

  const [viewer] = await Promise.all([
    page.waitForEvent('popup'),
    document.getByRole('button', { name: 'View' }).click(),
  ])
  await expect(viewer).toHaveURL(/^blob:/u)
  await expect(viewer.locator('img')).toHaveJSProperty('naturalWidth', 1)
  await viewer.close()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    document.getByRole('button', { name: `Download ${filename}` }).click(),
  ])
  expect(download.suggestedFilename()).toBe(filename)
  const bytes: Buffer[] = []
  for await (const chunk of await download.createReadStream()) {
    bytes.push(Buffer.from(chunk))
  }
  expect(Buffer.concat(bytes)).toEqual(image)

  await document.getByRole('button', { name: `Delete ${filename}` }).click()
  await page
    .getByRole('dialog', { name: 'Delete encrypted document?' })
    .getByRole('button', { name: 'Delete document' })
    .click()
  await expect(document).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'No document copies' })).toBeVisible()
  await expect(metric(page, 'Active policies')).toHaveText('1')
})
