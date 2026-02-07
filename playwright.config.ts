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
      grepInvert: /@mobile/,
    },
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 375, height: 812 },
        isMobile: true,
      },
      grep: /@mobile/,
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
        DATABASE_URL: 'postgresql://basecamp:basecamp_dev@localhost:5432/basecamp_test',
        SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-for-tests',
        AI_PROVIDER: 'mock',
        AI_MODEL: 'mock-model',
        AGENT_MODE: 'mock', // Use mock Pi SDK for E2E tests
        NODE_ENV: 'test', // Enable test routes like /api/test/setup-mock-agent
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
