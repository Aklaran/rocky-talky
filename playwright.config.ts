import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  // Start dev servers before running e2e tests
  webServer: [
    {
      command: 'pnpm dev:backend',
      cwd: __dirname,
      url: 'http://localhost:3000/api/trpc/health.check',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: {
        AI_PROVIDER: 'mock',
        AI_MODEL: 'mock-model',
      },
    },
    {
      command: 'pnpm dev:frontend',
      cwd: __dirname,
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
})
