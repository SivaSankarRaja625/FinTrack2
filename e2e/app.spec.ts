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

async function dismissMessages(page: Page) {
  await page.locator('.toast-region').evaluate((region) => {
    for (const button of region.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="Dismiss message"]',
    )) {
      button.click()
    }
  })
  await expect(page.locator('.toast')).toHaveCount(0)
}

async function expectPopulatedPhoneFits(page: Page) {
  const viewport = page.viewportSize()!
  await page.setViewportSize({ width: 320, height: 720 })
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }))
  expect(widths.page).toBeLessThanOrEqual(widths.viewport)
  await page.setViewportSize(viewport)
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
  const bottomNavigation = page.getByRole('navigation', {
    name: 'Primary sections',
  })
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
    await bottomNavigation.getByRole('button', { name: /More sections/u }).click()
    await page
      .getByRole('dialog', { name: 'All sections' })
      .locator(`a[href="${path}"]`)
      .click()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  }
})

test('bottom section links use their visible labels as accessible names', async ({
  page,
}) => {
  await createWorkspace(page)
  const navigation = page.getByRole('navigation', { name: 'Primary sections' })
  const sections = [
    ['Home', '/', 'Financial overview'],
    ['Activity', '/transactions', 'Transactions'],
    ['Plan', '/plan', 'Plan & cash flow'],
    ['Worth', '/net-worth', 'Net worth'],
  ] as const

  for (const [label, path, heading] of sections) {
    const link = navigation.getByRole('link', { name: label, exact: true })
    await expect(link).toHaveText(label)
    await expect(link).toHaveAttribute('href', path)
    await link.click()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  }
})

test('drawer dismissal restores focus and navigation focuses the destination heading', async ({
  page,
}) => {
  await createWorkspace(page)
  const more = page
    .getByRole('navigation', { name: 'Primary sections' })
    .getByRole('button', { name: /More sections/u })
  const drawer = page.getByRole('dialog', { name: 'All sections' })
  const close = drawer.getByRole('button', { name: 'Close navigation' })

  await more.click()
  await expect(close).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(more).toBeFocused()

  await more.click()
  await close.click()
  await expect(more).toBeFocused()

  await more.click()
  await page.locator('.drawer-scrim').click({
    position: { x: page.viewportSize()!.width - 10, y: 100 },
  })
  await expect(more).toBeFocused()

  const headerTrigger = page.getByRole('button', { name: 'Open navigation' })
  await headerTrigger.click()
  await page.keyboard.press('Escape')
  await expect(headerTrigger).toBeFocused()

  let releaseChunk: () => void = () => {}
  const chunkHeld = new Promise<void>((resolve) => {
    releaseChunk = resolve
  })
  await page.route('**/assets/InsurancePage-*.js', async (route) => {
    await chunkHeld
    await route.continue()
  })
  await more.click()
  await drawer.getByRole('link', { name: 'Insurance' }).click()
  await expect(page.getByLabel('Loading section')).toBeVisible()
  await expect(more).not.toBeFocused()
  releaseChunk()
  const insuranceHeading = page.getByRole('heading', {
    name: 'Insurance',
    exact: true,
  })
  await expect(insuranceHeading).toBeFocused()

  await more.click()
  await drawer.getByRole('link', { name: 'Insurance' }).click()
  await expect(insuranceHeading).toBeFocused()

  await page
    .getByRole('navigation', { name: 'Primary sections' })
    .getByRole('link', { name: 'Home', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'Financial overview' })).toBeVisible()
  await expect(more).not.toBeFocused()
})

test('keeps the mobile shell and navigation on every viewport', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Create your private workspace' }),
  ).toBeVisible()
  const setupFrame = await page.locator('.auth-layout').boundingBox()
  expect(setupFrame).not.toBeNull()
  expect(setupFrame!.width).toBeLessThanOrEqual(520)
  const setupColumns = await page
    .locator('.auth-form .form-grid')
    .evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length,
    )
  expect(setupColumns).toBe(1)

  await createWorkspace(page)
  const shell = await page.locator('.app-frame').boundingBox()
  const viewport = page.viewportSize()!
  expect(shell).not.toBeNull()
  expect(shell!.width).toBeLessThanOrEqual(520)
  expect(shell!.x).toBeCloseTo((viewport.width - shell!.width) / 2, 0)

  const bottomNavigation = page.getByRole('navigation', {
    name: 'Primary sections',
  })
  await expect(bottomNavigation).toBeVisible()
  const navigationBounds = await bottomNavigation.boundingBox()
  expect(navigationBounds).not.toBeNull()
  expect(navigationBounds!.y + navigationBounds!.height).toBeGreaterThanOrEqual(
    viewport.height - 1,
  )

  await bottomNavigation.getByRole('link', { name: 'Plan' }).click()
  await expect(page.getByRole('heading', { name: 'Plan & cash flow' })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  await bottomNavigation.getByRole('link', { name: 'Activity' }).click()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  const more = bottomNavigation.getByRole('button', { name: /More sections/u })
  await more.click()
  const drawer = page.getByRole('dialog', { name: 'All sections' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Close navigation' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(more).toBeFocused()
  await more.click()
  await drawer.getByRole('link', { name: 'Insurance' }).click()
  await expect(
    page.getByRole('heading', { name: 'Insurance', exact: true }),
  ).toBeVisible()
})

test('fits every section at a narrow phone width', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile')
  await page.setViewportSize({ width: 320, height: 720 })
  await createWorkspace(page)

  const routes = [
    ['/', 'Financial overview'],
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
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await page
      .getByRole('dialog', { name: 'All sections' })
      .locator(`a[href="${path}"]`)
      .click()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    const overflow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
    }))
    expect(
      overflow.document,
      `${heading} has horizontal page overflow`,
    ).toBeLessThanOrEqual(overflow.viewport)
  }
})

test('keeps populated finance records readable on a phone', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile')
  await page.clock.setFixedTime(new Date('2026-09-24T12:00:00.000Z'))
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await createWorkspace(page)

  const bottomNavigation = page.getByRole('navigation', {
    name: 'Primary sections',
  })
  await bottomNavigation.getByRole('link', { name: 'Activity' }).click()
  await page.getByRole('button', { name: 'Add account' }).first().click()
  await page.getByLabel('Account name').fill('Salary and household reserve account')
  await page.getByLabel('Opening balance').fill('1234567.89')
  await page.getByRole('dialog').getByRole('button', { name: 'Add account' }).click()
  await page.getByRole('button', { name: 'Add transaction' }).first().click()
  await page.getByLabel('Amount').fill('12500.75')
  await page.getByLabel('Description').fill('Groceries for monthly household essentials')
  await page.getByRole('dialog').getByRole('button', { name: 'Add transaction' }).click()
  const ledger = page.getByRole('list', { name: 'Transactions' })
  await expect(
    ledger.getByRole('button', {
      name: 'Edit Groceries for monthly household essentials',
    }),
  ).toBeVisible()
  await expect(
    ledger.getByRole('button', {
      name: 'Delete Groceries for monthly household essentials',
    }),
  ).toBeVisible()
  await dismissMessages(page)
  await expect(page).toHaveScreenshot('activity-with-transactions.png', {
    animations: 'disabled',
    fullPage: true,
  })
  await expectPopulatedPhoneFits(page)

  await bottomNavigation.getByRole('button', { name: /More sections/u }).click()
  await page
    .getByRole('dialog', { name: 'All sections' })
    .getByRole('link', { name: 'Investments' })
    .click()
  await page.getByRole('button', { name: 'Add holding' }).first().click()
  await page.getByLabel('Holding name').fill('Equity reserve fund')
  await page.getByLabel('Units').fill('12.5')
  await page.getByLabel('Average unit cost').fill('100')
  await page.getByLabel('Current unit price').fill('110')
  await page.getByRole('dialog').getByRole('button', { name: 'Add holding' }).click()
  const holdings = page.getByRole('list', { name: 'Holdings' })
  await expect(
    holdings.getByRole('button', { name: 'Update price for Equity reserve fund' }),
  ).toBeVisible()
  await expect(
    holdings.getByRole('button', { name: 'Edit Equity reserve fund' }),
  ).toBeVisible()
  await dismissMessages(page)
  await expect(page).toHaveScreenshot('investments-with-holding.png', {
    animations: 'disabled',
    fullPage: true,
  })
  await expectPopulatedPhoneFits(page)

  await bottomNavigation.getByRole('button', { name: /More sections/u }).click()
  await page
    .getByRole('dialog', { name: 'All sections' })
    .getByRole('link', { name: 'Insurance' })
    .click()
  await page.getByRole('button', { name: 'Add policy' }).first().click()
  await page.getByLabel('Insurer', { exact: true }).fill('Local health insurer')
  await page.getByLabel('Policy name').fill('Family health cover')
  await page.getByLabel('Cover amount').fill('1000000')
  await page.getByLabel('Premium', { exact: true }).fill('12000')
  await page.getByRole('dialog').getByRole('button', { name: 'Add policy' }).click()
  const policies = page.getByRole('list', { name: 'Policies' })
  await expect(
    policies.getByRole('button', { name: 'Edit Family health cover' }),
  ).toBeVisible()
  await dismissMessages(page)
  await expectNoSeriousAccessibilityIssues(page)
  await expect(page).toHaveScreenshot('insurance-with-policy.png', {
    animations: 'disabled',
    fullPage: true,
  })
  await expectPopulatedPhoneFits(page)
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
