import { expect, test as base, type Page } from '@playwright/test'

export const appPin = 'FinTrack2026'
export const testDate = '2026-02-14'

export const test = base.extend({
  page: async ({ page }, run) => {
    const crashes: string[] = []
    page.on('pageerror', (error) => crashes.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('FinTrack UI error')) {
        crashes.push(message.text())
      }
    })

    await run(page)

    expect(crashes, 'The app must not crash while running a page workflow').toEqual([])
    await expect(
      page.getByRole('heading', { name: 'FinTrack could not display this screen' }),
    ).toHaveCount(0)
  },
})

export async function createWorkspace(page: Page) {
  await page.clock.install({ time: new Date('2026-02-14T10:00:00+05:30') })
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Create your private workspace' }),
  ).toBeVisible()
  await page.getByLabel('Name', { exact: true }).fill('Ananya')
  await page.getByLabel('Monthly take-home income').fill('120000')
  await page.getByLabel('Essential monthly expenses').fill('45000')
  await page.getByLabel('App PIN or passphrase').fill(appPin)
  await page.getByLabel('Confirm PIN').fill(appPin)
  await page
    .getByRole('checkbox', { name: /I understand there is no remote PIN reset/u })
    .check()
  await page.getByRole('button', { name: 'Create encrypted workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Financial overview' })).toBeVisible()
}

export async function openSection(page: Page, label: string) {
  await page.getByRole('button', { name: /More sections/u }).click()
  await page
    .getByRole('dialog', { name: 'All sections' })
    .getByRole('link', {
      name: label === 'Alerts' ? /^Alerts(?: \d+)?$/u : label,
      exact: label !== 'Alerts',
    })
    .click()
}
