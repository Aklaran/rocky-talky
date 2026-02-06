import { test, expect } from '@playwright/test'

/**
 * E2E: Full chat flow — register → login → chat → AI response → logout.
 *
 * This is the primary happy path test. It exercises every major feature
 * of the template app in a single user journey.
 *
 * Uses the mock AI provider (AI_PROVIDER=mock) so no real API calls are made.
 */

// Use a unique email per test run to avoid conflicts
const testEmail = `e2e-${Date.now()}@test.com`
const testPassword = 'TestPassword123!'

test.describe('Chat Flow', () => {
  test('full user journey: register → chat → AI response → logout', async ({ page }) => {
    // =========================================================================
    // 1. Register
    // =========================================================================
    await page.goto('/login')

    // Switch to register mode
    await page.getByText("Don't have an account? Create one").click()
    await expect(page.getByRole('heading', { name: /Create Account/i })).toBeVisible()

    // Fill in registration form
    await page.getByLabel('Email').fill(testEmail)
    await page.getByLabel('Password').fill(testPassword)
    await page.getByRole('button', { name: /Create Account/i }).click()

    // Should redirect to /chat
    await expect(page).toHaveURL(/\/chat/, { timeout: 10000 })

    // =========================================================================
    // 2. Chat layout is visible
    // =========================================================================
    // Sidebar should show the app name and our email
    await expect(page.getByText('🏔️ Basecamp')).toBeVisible()
    await expect(page.getByText(testEmail)).toBeVisible()

    // Empty state — no conversations yet
    await expect(page.getByText('No conversations yet')).toBeVisible()

    // =========================================================================
    // 3. Create a conversation and send a message
    // =========================================================================
    // Click the + button to create a new conversation
    await page.getByTitle('New conversation').click()

    // Should navigate to the new conversation
    await expect(page).toHaveURL(/\/chat\//, { timeout: 5000 })

    // Should show the empty conversation state
    await expect(page.getByText('Start a conversation')).toBeVisible()

    // Type and send a message
    const messageInput = page.getByPlaceholder(/Type a message/i)
    await messageInput.fill('What is the meaning of life?')
    await messageInput.press('Enter')

    // =========================================================================
    // 4. See the user message appear
    // =========================================================================
    await expect(page.getByText('What is the meaning of life?')).toBeVisible({ timeout: 5000 })

    // =========================================================================
    // 5. See the AI response (streaming from mock provider)
    // =========================================================================
    // The mock provider returns: 'Mock response to: "What is the meaning of life?"'
    // Wait for the streamed response to complete (done event triggers refetch)
    await expect(
      page.getByText(/Mock response to:.*What is the meaning of life\?/i),
    ).toBeVisible({ timeout: 15000 })

    // =========================================================================
    // 6. Conversation appears in sidebar with auto-generated title
    // =========================================================================
    // The sidebar should now show the conversation with the auto-title
    const sidebar = page.locator('.w-72')
    await expect(sidebar.getByText('What is the meaning of life?')).toBeVisible()

    // =========================================================================
    // 7. Logout
    // =========================================================================
    await page.getByTitle('Sign out').click()

    // Should redirect to home page
    await expect(page).toHaveURL('/', { timeout: 5000 })
    await expect(page.getByRole('heading', { name: /Basecamp/i })).toBeVisible()
  })

  test('login with existing account', async ({ page }) => {
    // First register (reuse the account from above won't work since tests are isolated)
    const email = `e2e-login-${Date.now()}@test.com`

    await page.goto('/login')
    await page.getByText("Don't have an account? Create one").click()
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(testPassword)
    await page.getByRole('button', { name: /Create Account/i }).click()
    await expect(page).toHaveURL(/\/chat/, { timeout: 10000 })

    // Logout
    await page.getByTitle('Sign out').click()
    await expect(page).toHaveURL('/')

    // Now login
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /Welcome Back/i })).toBeVisible()

    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(testPassword)
    await page.getByRole('button', { name: /Sign In/i }).click()

    // Should redirect to /chat
    await expect(page).toHaveURL(/\/chat/, { timeout: 10000 })
    await expect(page.getByText(email)).toBeVisible()
  })

  test('delete a conversation', async ({ page }) => {
    const email = `e2e-delete-${Date.now()}@test.com`

    // Register and create a conversation
    await page.goto('/login')
    await page.getByText("Don't have an account? Create one").click()
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(testPassword)
    await page.getByRole('button', { name: /Create Account/i }).click()
    await expect(page).toHaveURL(/\/chat/, { timeout: 10000 })

    // Create conversation
    await page.getByTitle('New conversation').click()
    await expect(page).toHaveURL(/\/chat\//, { timeout: 5000 })

    // Send a message so the conversation has a title
    const messageInput = page.getByPlaceholder(/Type a message/i)
    await messageInput.fill('Test conversation to delete')
    await messageInput.press('Enter')
    await expect(page.getByText('Test conversation to delete')).toBeVisible({ timeout: 5000 })

    // Delete the conversation
    await page.getByTitle('Delete conversation').click()
    await expect(page.getByText('Delete conversation?')).toBeVisible()
    await page.getByRole('button', { name: 'Delete' }).click()

    // Should redirect to /chat and show empty state
    await expect(page).toHaveURL('/chat', { timeout: 5000 })
    await expect(page.getByText('No conversations yet')).toBeVisible()
  })
})
