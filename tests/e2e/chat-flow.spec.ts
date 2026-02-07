import { test, expect } from '@playwright/test'
import { LoginPage } from './pages/login.page'
import { ChatPage } from './pages/chat.page'

/**
 * E2E: Full chat flow — register → login → chat → AI response → logout.
 *
 * Uses the mock AI provider (AI_PROVIDER=mock) so no real API calls are made.
 * Each test gets a unique email to guarantee isolation.
 */

const TEST_PASSWORD = 'TestPassword123!'

/** Generate a unique email per test invocation. */
function uniqueEmail(prefix = 'e2e') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`
}

test.describe('Chat Flow', () => {
  test('full user journey: register → chat → AI response → logout', async ({ page }) => {
    const loginPage = new LoginPage(page)
    const chatPage = new ChatPage(page)
    const email = uniqueEmail('journey')

    // 1. Register
    await loginPage.register(email, TEST_PASSWORD)

    // 2. Chat layout is visible
    await expect(page.getByText('🏔️ Basecamp')).toBeVisible()
    await chatPage.expectUserEmail(email)
    await chatPage.expectEmptyState()

    // 3. Create a conversation and send a message
    await chatPage.createConversation()
    await chatPage.expectStartPrompt()
    await chatPage.sendMessageAndWaitForReply('What is the meaning of life?')

    // 4. Conversation appears in sidebar with the message as title
    await chatPage.expectConversationInSidebar('What is the meaning of life?')

    // 5. Logout
    await chatPage.signOut()
  })

  test('login with existing account', async ({ page }) => {
    const loginPage = new LoginPage(page)
    const chatPage = new ChatPage(page)
    const email = uniqueEmail('login')

    // Register first
    await loginPage.register(email, TEST_PASSWORD)
    await chatPage.signOut()

    // Now login
    await loginPage.login(email, TEST_PASSWORD)
    await chatPage.expectUserEmail(email)
  })

  test('delete a conversation', async ({ page }) => {
    const loginPage = new LoginPage(page)
    const chatPage = new ChatPage(page)
    const email = uniqueEmail('delete')

    // Register and create a conversation with a message
    await loginPage.register(email, TEST_PASSWORD)
    await chatPage.createConversation()
    await chatPage.sendMessageAndWaitForReply('Test conversation to delete')

    // Delete the conversation
    await chatPage.deleteCurrentConversation()

    // Should redirect to /chat and show empty state
    await expect(page).toHaveURL('/chat', { timeout: 5000 })
    await chatPage.expectEmptyState()
  })
})
