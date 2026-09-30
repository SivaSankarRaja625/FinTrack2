import { expect, type Page } from '@playwright/test'

import { appPin, createWorkspace, openSection, test } from './support/finance'
import { addAccount } from './support/records'

async function setDataSchemaVersion(page: Page, version: number) {
  await page.evaluate(async (value) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('fintrack')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const db = open.result
        const transaction = db.transaction('metadata', 'readwrite')
        transaction.objectStore('metadata').put({ key: 'data-schema', value })
        transaction.oncomplete = () => {
          db.close()
          resolve()
        }
        transaction.onerror = () => reject(transaction.error)
      }
    })
  }, version)
}

test('unlock upgrades an earlier encrypted workspace without losing its accounts', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful upgrade workflow')
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Kept through upgrade', '100')
  await setDataSchemaVersion(page, 1)

  await page.reload()
  await page.getByLabel('App PIN').fill(appPin)
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await openSection(page, 'Transactions')
  await page.locator('.activity-accounts > summary').click()
  await expect(
    page.getByRole('button', { name: 'Kept through upgrade savings ₹100' }),
  ).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<unknown>((resolve, reject) => {
            const open = indexedDB.open('fintrack')
            open.onerror = () => reject(open.error)
            open.onsuccess = () => {
              const db = open.result
              const transaction = db.transaction('metadata', 'readonly')
              const request = transaction.objectStore('metadata').get('data-schema')
              request.onsuccess = () => {
                db.close()
                resolve(request.result?.value)
              }
              request.onerror = () => reject(request.error)
            }
          }),
      ),
    )
    .toBe(3)
})

test('newer encrypted workspaces are not treated as wrong PIN attempts', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful upgrade workflow')
  await createWorkspace(page)
  await setDataSchemaVersion(page, 4)
  await page.reload()
  await page.clock.pauseAt(new Date('2026-02-15T10:00:00+05:30'))
  await page.getByLabel('App PIN').fill(appPin)
  const unlock = page.getByRole('button', { name: 'Unlock', exact: true })
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await unlock.click()
    await expect(page.getByText(/requires a newer version/u)).toBeVisible()
    await expect(unlock).toBeEnabled()
  }
  await setDataSchemaVersion(page, 3)
  await unlock.click()
  await page.clock.resume()
  await expect(page.getByRole('heading', { name: 'Financial overview' })).toBeVisible()
})
