import { defineConfig, devices } from '@playwright/test'

// PW_CHROMIUM_PATH lets a machine with a preinstalled Chromium of another revision run the suite
// without `playwright install` (see PLAN.md Assumptions); CI leaves it unset.
const chromiumPath = process.env.PW_CHROMIUM_PATH

export default defineConfig({
  testDir: 'e2e',
  webServer: [
    {
      command: 'npm run build && npm run preview -- --port 4173',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run build:pages && npm run preview:pages',
      url: 'http://localhost:4181/analyse/',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  use: { baseURL: 'http://localhost:4173', trace: 'on-first-retry', screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
