import { expect } from '@playwright/test'

import { appPin, createWorkspace, openSection, test } from './support/finance'
import { addAccount, addTransaction } from './support/records'

test('a complete backup restores prior finance data and exports a safety copy', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful phone workflow')
  test.setTimeout(180_000)
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Recovery cash', '100')
  await addTransaction(page, {
    kind: 'Expense',
    date: '2026-02-14',
    account: 'Recovery cash',
    category: 'Groceries',
    amount: '10',
    description: 'Keep this expense',
  })
  await openSection(page, 'Settings')
  await page.getByRole('button', { name: 'Backup & restore' }).click()
  await page.getByLabel('Backup PIN', { exact: true }).fill('Export2026')
  await page.getByLabel('Confirm backup PIN').fill('Export2026')
  const [backup] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export complete backup' }).click(),
  ])
  expect(backup.suggestedFilename()).toMatch(/\.finapp$/u)
  const backupFile = await backup.path()

  await openSection(page, 'Transactions')
  await addTransaction(page, {
    kind: 'Income',
    date: '2026-02-14',
    account: 'Recovery cash',
    category: 'Salary',
    amount: '50',
    description: 'Remove on restore',
  })
  await expect(page.getByRole('button', { name: 'Edit Remove on restore' })).toBeVisible()

  await openSection(page, 'Settings')
  await page.getByRole('button', { name: 'Backup & restore' }).click()
  await page.getByLabel('.finapp backup file').setInputFiles(backupFile)
  await page.getByLabel('Backup file PIN').fill('Export2026')
  await page.getByLabel('New safety-backup PIN').fill('Safety2026')
  await page.getByRole('button', { name: 'Review destructive restore' }).click()
  const [safetyBackup] = await Promise.all([
    page.waitForEvent('download'),
    page
      .getByRole('dialog', { name: 'Replace all current data?' })
      .getByRole('button', { name: 'Create safety backup' })
      .click(),
  ])
  expect(safetyBackup.suggestedFilename()).toMatch(/\.finapp$/u)
  const confirmation = page.getByRole('dialog', { name: 'Replace all current data?' })
  await confirmation.getByLabel('Saved safety-backup file').setInputFiles(backupFile)
  await confirmation
    .getByRole('button', { name: 'Verify safety copy and restore' })
    .click()
  await expect(
    page.getByText('The selected safety file is not the copy just exported'),
  ).toBeVisible()
  await confirmation
    .getByLabel('Saved safety-backup file')
    .setInputFiles(await safetyBackup.path())
  await confirmation
    .getByRole('button', { name: 'Verify safety copy and restore' })
    .click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await openSection(page, 'Transactions')
  await expect(page.getByRole('button', { name: 'Edit Keep this expense' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit Remove on restore' })).toHaveCount(
    0,
  )
})

test('an incorrect backup PIN preserves the current workspace', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful phone workflow')
  await createWorkspace(page)
  await openSection(page, 'Settings')
  await page.getByRole('button', { name: 'Backup & restore' }).click()
  await page.getByLabel('Backup PIN', { exact: true }).fill('Export2026')
  await page.getByLabel('Confirm backup PIN').fill('Export2026')
  const [backup] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export complete backup' }).click(),
  ])

  await openSection(page, 'Transactions')
  await addAccount(page, 'Keep this account', '100')
  await openSection(page, 'Settings')
  await page.getByRole('button', { name: 'Backup & restore' }).click()
  await page.getByLabel('.finapp backup file').setInputFiles(await backup.path())
  await page.getByLabel('Backup file PIN').fill('Wrong2026')
  await page.getByLabel('New safety-backup PIN').fill('Safety2026')
  await page.getByRole('button', { name: 'Review destructive restore' }).click()
  const dialog = page.getByRole('dialog', { name: 'Replace all current data?' })
  await dialog.getByRole('button', { name: 'Create safety backup' }).click()
  await expect(
    page.getByText('The PIN is incorrect or the encrypted data is damaged'),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await openSection(page, 'Transactions')
  await expect(
    page.getByRole('button', { name: 'Keep this account savings ₹100' }),
  ).toBeVisible()
})

test('export does not count as recovery until the saved file is reopened and verified', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful phone workflow')
  await createWorkspace(page)
  await openSection(page, 'Settings')
  await page.getByRole('button', { name: 'Backup & restore' }).click()
  await page.getByLabel('Backup PIN', { exact: true }).fill('Export2026')
  await page.getByLabel('Confirm backup PIN').fill('Export2026')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export complete backup' }).click(),
  ])
  await expect(page.getByText('No dated backup verified')).toBeVisible()
  const savedFile = await download.path()
  await page.getByLabel('Saved .finapp file to verify').setInputFiles(savedFile)
  await page.getByLabel('Saved backup PIN').fill('Wrong2026')
  await page.getByRole('button', { name: 'Verify saved backup' }).click()
  await expect(
    page.getByText('The PIN is incorrect or the encrypted data is damaged'),
  ).toBeVisible()
  await expect(page.getByText('No dated backup verified')).toBeVisible()
  await page.getByLabel('Saved backup PIN').fill('Export2026')
  await page.getByRole('button', { name: 'Verify saved backup' }).click()
  await expect(page.getByText(/Last checked.*records and.*documents/u)).toBeVisible()
  await expect(page.getByText('No dated backup verified')).toHaveCount(0)
  await page.reload()
  await page.getByLabel('App PIN').fill(appPin)
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await openSection(page, 'Settings')
  await page.getByRole('button', { name: 'Backup & restore' }).click()
  await expect(page.getByText(/Last checked.*records and.*documents/u)).toBeVisible()
})

test('a backup from another workspace cannot be marked verified', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful phone workflow')
  await createWorkspace(page)
  const other = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    acceptDownloads: true,
  })
  try {
    const source = await other.newPage()
    await createWorkspace(source)
    await openSection(source, 'Settings')
    await source.getByRole('button', { name: 'Backup & restore' }).click()
    await source.getByLabel('Backup PIN', { exact: true }).fill('Export2026')
    await source.getByLabel('Confirm backup PIN').fill('Export2026')
    const [download] = await Promise.all([
      source.waitForEvent('download'),
      source.getByRole('button', { name: 'Export complete backup' }).click(),
    ])

    await openSection(page, 'Settings')
    await page.getByRole('button', { name: 'Backup & restore' }).click()
    await page
      .getByLabel('Saved .finapp file to verify')
      .setInputFiles(await download.path())
    await page.getByLabel('Saved backup PIN').fill('Export2026')
    await page.getByRole('button', { name: 'Verify saved backup' }).click()
    await expect(
      page.getByText('This backup belongs to a different workspace'),
    ).toBeVisible()
    await expect(page.getByText('No dated backup verified')).toBeVisible()
  } finally {
    await other.close()
  }
})
