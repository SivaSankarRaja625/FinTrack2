import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const appPin = 'FinTrack2026'

async function createWorkspace(page: Page) {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Create your private workspace' }),
  ).toBeVisible()
  await page.getByLabel('Name').fill('Ananya')
  await page.getByLabel('Monthly take-home income').fill('120000')
  await page.getByLabel('Essential monthly expenses').fill('45000')
  await page.getByLabel('App PIN or passphrase').fill(appPin)
  await page.getByLabel('Confirm PIN').fill(appPin)
  await page.getByLabel(/I understand there is no remote PIN reset/u).check()
  await page.getByRole('button', { name: 'Create encrypted workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Financial overview' })).toBeVisible()
}

async function expectNoSeriousAccessibilityIssues(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    results.violations.filter(
      ({ impact }) => impact === 'critical' || impact === 'serious',
    ),
  ).toEqual([])
}

test('supports setup, lock, unlock, and accessible navigation', async ({ page }) => {
  await page.goto('/')
  await expectNoSeriousAccessibilityIssues(page)
  await createWorkspace(page)
  await expectNoSeriousAccessibilityIssues(page)

  const compactLock = page.getByRole('button', { name: 'Lock application' })
  if (await compactLock.isVisible()) {
    await compactLock.click()
  } else {
    await page.getByRole('button', { name: 'Lock', exact: true }).click()
  }

  await expect(page.getByRole('heading', { name: 'Unlock FinTrack' })).toBeVisible()
  await page.getByLabel('App PIN').fill(appPin)
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Financial overview' })).toBeVisible()
})

test('loads every finance section without leaving the local app', async ({ page }) => {
  await createWorkspace(page)
  const routes = [
    ['/transactions', 'Transactions'],
    ['/plan', 'Plan & cash flow'],
    ['/net-worth', 'Net worth'],
    ['/loans', 'Loans & credit'],
    ['/investments', 'Investments'],
    ['/insurance', 'Insurance'],
    ['/goals', 'Goals'],
    ['/reports', 'Reports'],
    ['/alerts', 'Alerts'],
    ['/settings', 'Settings'],
  ] as const

  for (const [path, heading] of routes) {
    await page
      .locator(`a[href="${path}"]`)
      .first()
      .evaluate((link: HTMLAnchorElement) => link.click())
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  }
})

test('records finance data and reloads without a network connection', async ({
  context,
  page,
}) => {
  const externalRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol.startsWith('http') && url.origin !== 'http://127.0.0.1:4187') {
      externalRequests.push(request.url())
    }
  })

  await createWorkspace(page)
  await page.getByRole('link', { name: 'View ledger' }).click()
  await expect(
    page.getByRole('heading', { name: 'Transactions', exact: true }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Add account' }).first().click()
  await page
    .getByLabel('Account name')
    .fill('Primary salary and emergency reserve account')
  await page.getByLabel('Institution').fill('Co-operative bank with a long branch name')
  await page.getByLabel('Opening balance').fill('1234567890.12')
  await page.getByRole('button', { name: 'Add account' }).last().click()
  await expect(
    page.getByRole('button', {
      name: /Primary salary and emergency reserve account/u,
    }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Add transaction' }).first().click()
  await page.getByLabel('Amount').fill('12500000.75')
  await page
    .getByLabel('Description')
    .fill('Groceries for monthly household and family essentials')
  await page.getByRole('button', { name: 'Add transaction' }).last().click()
  await expect(
    page.getByText('Groceries for monthly household and family essentials', {
      exact: true,
    }),
  ).toBeVisible()
  const viewportOverflow = await page.evaluate(async () => {
    const viewportWidth = document.documentElement.clientWidth
    const initialY = window.scrollY
    window.scrollTo(1_000, initialY)
    await new Promise(requestAnimationFrame)
    const horizontalScroll = window.scrollX
    window.scrollTo(0, initialY)
    return {
      bodyFitsViewport: document.body.scrollWidth <= viewportWidth,
      horizontalScroll,
    }
  })
  expect(viewportOverflow).toEqual({
    bodyFitsViewport: true,
    horizontalScroll: 0,
  })

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Unlock FinTrack' })).toBeVisible()
  await page.getByLabel('App PIN').fill(appPin)
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Transactions', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Groceries for monthly household and family essentials', {
      exact: true,
    }),
  ).toBeVisible()
  expect(externalRequests).toEqual([])
})

test('keeps key screens visually stable in light and dark themes', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-24T12:00:00.000Z'))
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Create your private workspace' }),
  ).toBeVisible()
  await expect(page).toHaveScreenshot('onboarding-light.png', {
    animations: 'disabled',
    fullPage: true,
  })

  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await expect(page).toHaveScreenshot('onboarding-dark.png', {
    animations: 'disabled',
    fullPage: true,
  })
  await expectNoSeriousAccessibilityIssues(page)

  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await createWorkspace(page)
  await expect(page).toHaveScreenshot('dashboard-light.png', {
    animations: 'disabled',
    fullPage: true,
  })

  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await expect(page).toHaveScreenshot('dashboard-dark.png', {
    animations: 'disabled',
    fullPage: true,
  })
  await expectNoSeriousAccessibilityIssues(page)
})
