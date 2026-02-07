import { type Page, type Locator, expect } from '@playwright/test'

/**
 * Page object for the chat interface (sidebar + conversation view).
 *
 * All locators use data-testid for stability. Text-based assertions
 * are always scoped to a specific testid container to avoid strict
 * mode violations from duplicate text in sidebar/header/messages.
 */
export class ChatPage {
  readonly page: Page

  // Sidebar
  readonly sidebar: Locator
  readonly newConversationButton: Locator
  readonly signOutButton: Locator
  readonly userEmail: Locator
  readonly conversationList: Locator
  readonly conversationItems: Locator

  // Chat area
  readonly chatHeader: Locator
  readonly messageList: Locator
  readonly messageInput: Locator
  readonly sendButton: Locator
  readonly deleteConversationButton: Locator

  // Message types (scoped to message-list)
  readonly userMessages: Locator
  readonly assistantMessages: Locator
  readonly streamingMessage: Locator

  constructor(page: Page) {
    this.page = page

    // Sidebar
    this.sidebar = page.getByTestId('sidebar')
    this.newConversationButton = page.getByTestId('new-conversation')
    this.signOutButton = page.getByTestId('sign-out')
    this.userEmail = page.getByTestId('user-email')
    this.conversationList = page.getByTestId('conversation-list')
    this.conversationItems = page.getByTestId('conversation-item')

    // Chat area
    this.chatHeader = page.getByTestId('chat-header')
    this.messageList = page.getByTestId('message-list')
    this.messageInput = page.getByTestId('message-input')
    this.sendButton = page.getByTestId('send-button')
    this.deleteConversationButton = page.getByTestId('delete-conversation')

    // Message types (scoped to message-list for strict mode safety)
    this.userMessages = page.getByTestId('message-user')
    this.assistantMessages = page.getByTestId('message-assistant')
    this.streamingMessage = page.getByTestId('message-streaming')
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /** Create a new conversation via the sidebar button. */
  async createConversation() {
    await this.newConversationButton.click()
    await expect(this.page).toHaveURL(/\/chat\//, { timeout: 5000 })
  }

  /** Type a message and send it with Enter. */
  async sendMessage(text: string) {
    await this.messageInput.fill(text)
    await this.messageInput.press('Enter')
  }

  /** Send a message and wait for the full AI response to appear. */
  async sendMessageAndWaitForReply(text: string, timeout = 15000) {
    await this.sendMessage(text)

    // Wait for the user message to render in the message list
    await expect(
      this.userMessages.filter({ hasText: text }),
    ).toBeVisible({ timeout: 5000 })

    // Wait for the AI response (mock provider prefixes with "Mock response to:")
    await expect(
      this.assistantMessages.filter({ hasText: /Mock response to:/ }),
    ).toBeVisible({ timeout })
  }

  /** Delete the current conversation via the header button + confirm dialog. */
  async deleteCurrentConversation() {
    await this.deleteConversationButton.click()
    await expect(this.page.getByText('Delete conversation?')).toBeVisible()
    await this.page.getByRole('button', { name: 'Delete' }).click()
  }

  /** Sign out via the sidebar button. */
  async signOut() {
    await this.signOutButton.click()
    await expect(this.page).toHaveURL(/\/(login)?$/, { timeout: 5000 })
  }

  // ---------------------------------------------------------------------------
  // Assertions
  // ---------------------------------------------------------------------------

  /** Assert the empty state is visible (no conversations). */
  async expectEmptyState() {
    await expect(this.sidebar.getByText('No conversations yet')).toBeVisible()
  }

  /** Assert the "start a conversation" prompt is visible in the main area. */
  async expectStartPrompt() {
    await expect(this.page.getByText('Start a conversation')).toBeVisible()
  }

  /** Assert the user's email is shown in the sidebar. */
  async expectUserEmail(email: string) {
    await expect(this.userEmail).toHaveText(email)
  }

  /** Assert a conversation title appears in the sidebar. */
  async expectConversationInSidebar(title: string) {
    await expect(
      this.conversationItems.filter({ hasText: title }).first(),
    ).toBeVisible({ timeout: 5000 })
  }

  /** Assert the chat header shows a specific title. */
  async expectHeaderTitle(title: string) {
    await expect(this.chatHeader.getByText(title)).toBeVisible()
  }
}
