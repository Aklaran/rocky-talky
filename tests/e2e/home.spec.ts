import { test, expect } from '@playwright/test'

test.describe('Home page', () => {
  test('loads and shows Basecamp heading', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /Basecamp/i })).toBeVisible()
  })

  test('shows backend connection status', async ({ page }) => {
    await page.goto('/')
    // Wait for the health check to resolve
    await expect(page.getByText(/Backend connected/i)).toBeVisible({ timeout: 10000 })
  })
})
