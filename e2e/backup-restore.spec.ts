import { expect } from '@playwright/test'

import { createWorkspace, openSection, test } from './support/finance'
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
      .getByRole('button', { name: 'Create safety backup and restore' })
      .click(),
  ])
  expect(safetyBackup.suggestedFilename()).toMatch(/\.finapp$/u)
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await openSection(page, 'Transactions')
  await expect(page.getByRole('button', { name: 'Edit Keep this expense' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit Remove on restore' })).toHaveCount(
    0,
  )
})
