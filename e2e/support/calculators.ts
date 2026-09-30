import type { Page } from '@playwright/test'

export async function editAssumptions(page: Page) {
  const edit = page.getByRole('button', { name: 'Edit assumptions', exact: true })
  if (await edit.isVisible()) await edit.click()
}

export async function changeCalculator(page: Page) {
  const change = page.getByRole('button', { name: 'Change calculator', exact: true })
  if (
    (await change.isVisible()) &&
    (await change.getAttribute('aria-expanded')) === 'false'
  ) {
    await change.click()
  }
}
