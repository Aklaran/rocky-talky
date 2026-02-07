import { type Page, type Locator, expect } from '@playwright/test'

/**
 * Page object for the login/register screen.
 *
 * Encapsulates all auth-related locators and actions so tests
 * read like user stories instead of DOM queries.
 */
export class LoginPage {
  readonly page: Page
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly signInButton: Locator
  readonly createAccountButton: Locator
  readonly switchToRegisterLink: Locator
  readonly switchToLoginLink: Locator

  constructor(page: Page) {
    this.page = page
    this.emailInput = page.getByLabel('Email')
    this.passwordInput = page.getByLabel('Password')
    this.signInButton = page.getByRole('button', { name: /Sign In/i })
    this.createAccountButton = page.getByRole('button', { name: /Create Account/i })
    this.switchToRegisterLink = page.getByText("Don't have an account? Create one")
    this.switchToLoginLink = page.getByText('Already have an account? Sign in')
  }

  async goto() {
    await this.page.goto('/login')
  }

  async register(email: string, password: string) {
    await this.goto()
    await this.switchToRegisterLink.click()
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.createAccountButton.click()
    await expect(this.page).toHaveURL(/\/chat/, { timeout: 10000 })
  }

  async login(email: string, password: string) {
    await this.goto()
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.signInButton.click()
    await expect(this.page).toHaveURL(/\/chat/, { timeout: 10000 })
  }
}
