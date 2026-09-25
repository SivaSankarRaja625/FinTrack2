import { expect } from '@playwright/test'

import { appPin, createWorkspace, openSection, test } from './support/finance'
import { addAccount, addTransaction } from './support/records'

test('credit cards can be added and edited from Loans without double-counting debt', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful phone workflow')
  test.slow()
  await page.setViewportSize({ width: 320, height: 720 })
  await createWorkspace(page)
  await openSection(page, 'Loans & credit')
  await expect(page.getByRole('button', { name: 'Add credit card' })).toBeVisible()
  await page.getByRole('button', { name: 'Add credit card' }).click()
  const addCard = page.getByRole('dialog', { name: 'Add credit card' })
  await addCard.getByLabel('Account name').fill('Work card')
  await addCard.getByLabel('Institution').fill('Example Bank')
  await addCard.getByLabel('Opening balance').fill('-25000')
  await addCard.getByLabel('Card last four digits').fill('0042')
  await addCard.getByLabel('Credit limit').fill('100000')
  await addCard.getByLabel('Statement day').fill('20')
  await addCard.getByLabel('Payment due day').fill('9')
  await addCard.getByRole('button', { name: 'Add credit card' }).click()
  await expect(addCard).toBeHidden()

  const card = page.locator('.credit-card-detail').filter({ hasText: 'Work card' })
  await expect(card).toContainText('0042')
  await expect(card).toContainText('₹25,000')
  await expect(card).toContainText('₹1,00,000')
  await expect(card).toContainText('₹75,000')
  await expect(card).toContainText('25%')
  await expect(card).toContainText('9')
  await expect(page.getByRole('button', { name: 'Add loan' }).first()).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320)
  await openSection(page, 'Net worth')
  await expect(
    page.locator('.composition-row').filter({ hasText: 'Debt' }).locator('strong'),
  ).toHaveText('-₹25,000')

  await openSection(page, 'Transactions')
  await addAccount(page, 'Payment savings', '5000')
  await addTransaction(page, {
    kind: 'Transfer',
    date: '2026-02-14',
    account: 'Payment savings',
    destination: 'Work card',
    amount: '5000',
    description: 'Card payment',
  })
  await openSection(page, 'Loans & credit')
  await expect(card).toContainText('₹20,000')
  await expect(card).toContainText('₹80,000')

  await card.getByRole('button', { name: 'Edit Work card' }).click()
  const editCard = page.getByRole('dialog', { name: 'Edit credit card' })
  await editCard.getByLabel('Credit limit').fill('120000')
  await editCard.getByLabel('Payment due day').fill('12')
  await editCard.getByRole('button', { name: 'Save changes' }).click()
  await expect(editCard).toBeHidden()
  await expect(card).toContainText('₹1,20,000')
  await expect(card).toContainText('₹1,00,000')
  await expect(card).toContainText('12')

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Unlock FinTrack' })).toBeVisible()
  await page.getByLabel('App PIN').fill(appPin)
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await expect(card).toContainText('0042')
  await expect(card).toContainText('₹1,20,000')
})

test('a credit card without a limit remains readable after unlocking', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful phone workflow')
  await createWorkspace(page)
  await openSection(page, 'Loans & credit')
  await page.getByRole('button', { name: 'Add credit card' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add credit card' })
  await dialog.getByLabel('Account name').fill('Simple card')
  await dialog.getByLabel('Opening balance').fill('-500')
  await dialog.getByLabel('Card last four digits').fill('12345')
  await dialog.getByLabel('Credit limit').fill('0.001')
  await dialog.getByLabel('Payment due day').fill('32')
  await dialog.getByRole('button', { name: 'Add credit card' }).click()
  await expect(dialog.getByText('Enter exactly four card digits')).toBeVisible()
  await expect(dialog.getByText('Enter a credit limit greater than zero')).toBeVisible()
  await expect(dialog.getByText('Enter a day from 1 to 31')).toBeVisible()
  await dialog.getByLabel('Card last four digits').fill('0042')
  await dialog.getByLabel('Credit limit').fill('')
  await dialog.getByLabel('Payment due day').fill('9')
  await dialog.getByRole('button', { name: 'Add credit card' }).click()
  await expect(dialog).toBeHidden()
  await page.reload()
  await page.getByLabel('App PIN').fill(appPin)
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await expect(
    page.locator('.credit-card-detail').filter({ hasText: 'Simple card' }),
  ).toContainText('₹500')
})
