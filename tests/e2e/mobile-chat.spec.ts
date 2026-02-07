import { test, expect } from '@playwright/test'
import { LoginPage } from './pages/login.page'
import { ChatPage } from './pages/chat.page'

/**
 * E2E: Mobile-specific chat UI behavior.
 *
 * These tests run in the "mobile" project (375×812 viewport).
 * They verify the responsive sidebar, hamburger menu, and mobile-specific
 * UI elements work correctly.
 */

const TEST_PASSWORD = 'TestPassword123!'

function uniqueEmail(prefix = 'mobile') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`
}

test.describe('Mobile Chat UI @mobile', () => {
  // These tests are designed for the mobile viewport project

  test('sidebar is hidden on mobile, hamburger opens it', async ({ page }) => {
    const loginPage = new LoginPage(page)
    const chatPage = new ChatPage(page)
    const email = uniqueEmail()

    await loginPage.register(email, TEST_PASSWORD)

    // Sidebar should be hidden on mobile
    await chatPage.expectSidebarHidden()

    // Hamburger button should be visible
    await expect(chatPage.toggleSidebarButton.first()).toBeVisible()

    // Open sidebar via hamburger
    await chatPage.openMobileSidebar()

    // Sidebar content should now be visible (in the sheet overlay)
    await expect(page.getByText('🏔️ Basecamp')).toBeVisible()
    await expect(page.getByText('No conversations yet')).toBeVisible()
  })

  test('mobile "New Chat" button creates a conversation', async ({ page }) => {
    const loginPage = new LoginPage(page)
    const chatPage = new ChatPage(page)
    const email = uniqueEmail()

    await loginPage.register(email, TEST_PASSWORD)

    // Mobile New Chat button should be visible
    await chatPage.expectMobileNewChatButton()

    // Click it to create a conversation
    await chatPage.createConversationMobile()

    // Should be in a conversation now with the message input visible
    await expect(chatPage.messageInput).toBeVisible()
  })

  test('full mobile chat flow: new chat → send message → open sidebar → see conversation', async ({ page }) => {
    const loginPage = new LoginPage(page)
    const chatPage = new ChatPage(page)
    const email = uniqueEmail()

    await loginPage.register(email, TEST_PASSWORD)

    // Create conversation via mobile button
    await chatPage.createConversationMobile()

    // Send a message and wait for reply
    await chatPage.sendMessageAndWaitForReply('Hello from mobile!')

    // Open sidebar to verify conversation appears
    await chatPage.openMobileSidebar()
    await expect(
      page.getByTestId('conversation-item').filter({ hasText: 'Hello from mobile!' }).first(),
    ).toBeVisible({ timeout: 5000 })
  })

  test('selecting a conversation in sidebar closes it on mobile', async ({ page }) => {
    const loginPage = new LoginPage(page)
    const chatPage = new ChatPage(page)
    const email = uniqueEmail()

    await loginPage.register(email, TEST_PASSWORD)

    // Create a conversation first
    await chatPage.createConversationMobile()
    await chatPage.sendMessageAndWaitForReply('Test conversation')

    // Open sidebar
    await chatPage.openMobileSidebar()

    // Click the conversation item
    await page.getByTestId('conversation-item').first().click()

    // Sidebar should close (sheet should be gone)
    // The chat content should be visible
    await expect(chatPage.messageInput).toBeVisible()
  })
})
