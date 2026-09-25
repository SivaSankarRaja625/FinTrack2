import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4187',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'chromium-tablet',
      use: { ...devices['iPad Pro 11'], defaultBrowserType: 'chromium' },
    },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview --host 127.0.0.1 --port 4187 --strictPort',
    url: 'http://127.0.0.1:4187',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
