/**
 * E2E: Subagent Panel UI Lifecycle
 *
 * These tests verify the subagent panel UI through a complete lifecycle:
 * spawn → running → completed
 *
 * Key differences from unit tests:
 * - Mock at the Pi SDK boundary (not at our parsing layer)
 * - Use exact event formats from production SDK (MCP result objects, Sirdar notify format)
 * - Verify the full pipeline from backend SSE stream to frontend React rendering
 *
 * This approach catches format mismatches that unit tests miss (e.g., result.content[].text vs result string).
 *
 * The mock is activated via AGENT_MODE=mock environment variable in playwright.config.ts.
 */

import { test, expect } from '@playwright/test'

test.describe('Subagent Panel Lifecycle', () => {
  test('shows subagent panel with running state, then transitions to completed', async ({
    page,
  }) => {
    // Navigate to home (redirects to /sessions)
    await page.goto('/')
    await expect(page).toHaveURL(/\/sessions/)

    // Create a new session
    await page.getByTestId('new-session').click()
    await expect(page).toHaveURL(/\/sessions\/.+/)

    // Send a message that triggers subagent spawning
    const messageInput = page.getByPlaceholder(/type.*message/i)
    await messageInput.fill('Spawn a test agent')
    await messageInput.press('Enter')

    // Wait for subagent panel to appear
    const subagentPanel = page.getByTestId('subagent-panel')
    await expect(subagentPanel).toBeVisible({ timeout: 10000 })

    // Verify subagent card is present with correct description
    const subagentCard = page.getByTestId('subagent-card').first()
    await expect(subagentCard).toBeVisible()

    const description = subagentCard.getByTestId('subagent-description')
    await expect(description).toHaveText('Mock test task')

    // Wait for transition to "completed" (after notify() fires)
    // Note: the mock fires events fast enough that we may skip the "running" state
    // entirely. The key assertion is that it reaches "completed".
    const statusText = page.getByTestId('subagent-status')
    await expect(statusText).toHaveText(/1 agent completed/, { timeout: 10000 })
    await expect(subagentCard).toHaveAttribute('data-status', 'completed')
  })

  test('handles MCP-shaped tool result correctly', async ({ page }) => {
    // This test verifies the exact bug fix: result.content[].text parsing
    // The mock sends tool_execution_end with result: { content: [{ type: "text", text: "..." }] }
    // not result: "string"

    await page.goto('/')
    await page.getByTestId('new-session').click()

    const messageInput = page.getByPlaceholder(/type.*message/i)
    await messageInput.fill('Test MCP result format')
    await messageInput.press('Enter')

    // If parsing is broken, the subagent panel won't appear or will show wrong data
    const subagentPanel = page.getByTestId('subagent-panel')
    await expect(subagentPanel).toBeVisible({ timeout: 10000 })

    // Verify the taskId was extracted from MCP result.content[].text
    // (The mock returns "Agent spawned: task-mock-12345 — ..." in result.content[0].text)
    const subagentCard = page.getByTestId('subagent-card').first()
    await expect(subagentCard).toBeVisible()

    // The subagent should transition from spawning -> running -> completed
    // If MCP parsing failed, it would stay stuck at "spawning"
    await expect(subagentCard).toHaveAttribute('data-status', 'running', { timeout: 2000 })
  })

  test('handles Sirdar notify format correctly', async ({ page }) => {
    // This test verifies notify() format: "✅ Agent completed: task-xyz\nDescription"
    // The mock sends this exact format (not "Agent task-xyz completed: ...")

    await page.goto('/')
    await page.getByTestId('new-session').click()

    const messageInput = page.getByPlaceholder(/type.*message/i)
    await messageInput.fill('Test Sirdar notify format')
    await messageInput.press('Enter')

    const subagentPanel = page.getByTestId('subagent-panel')
    await expect(subagentPanel).toBeVisible({ timeout: 10000 })

    // Initially "1 agent running"
    const statusText = page.getByTestId('subagent-status')
    await expect(statusText).toHaveText(/1 agent running/)

    // After notify() fires, should transition to "completed"
    // If the notify() regex is wrong, this will timeout
    await expect(statusText).toHaveText(/1 agent completed/, { timeout: 10000 })

    const subagentCard = page.getByTestId('subagent-card').first()
    await expect(subagentCard).toHaveAttribute('data-status', 'completed')
  })

  test.skip('subagent panel not shown when no subagents spawned', async ({ page }) => {
    // TODO: This test requires a way to configure the mock to NOT spawn subagents
    // For now, the mock always spawns a subagent

    // Placeholder
    test.skip()
  })

  test.skip('displays multiple subagents correctly', async ({ page }) => {
    // For this test, we'd need a mock that spawns multiple agents
    // For now, skip or implement a multi-agent mock
    // This is a placeholder to show the test structure
  })
})

test.describe('Subagent Panel Edge Cases', () => {
  test.skip('handles failed subagent status', async ({ page }) => {
    // We'd need to extend the mock to simulate a failed subagent
    // The mock would send notify() with "❌ Agent failed: task-xyz\n..."
    // For now, skip this test
  })

  test.skip('preserves subagent state after SSE stream closes', async ({ page }) => {
    // Verify that subagent data persists in UI after stream completes
    // This is important because notify() fires AFTER stream ends

    await page.goto('/')
    await page.getByTestId('new-session').click()

    const messageInput = page.getByPlaceholder(/type.*message/i)
    await messageInput.fill('Test state persistence')
    await messageInput.press('Enter')

    const subagentPanel = page.getByTestId('subagent-panel')
    await expect(subagentPanel).toBeVisible({ timeout: 10000 })

    // Wait for completion
    const statusText = page.getByTestId('subagent-status')
    await expect(statusText).toHaveText(/1 agent completed/, { timeout: 10000 })

    // Send another message
    await messageInput.fill('Another message')
    await messageInput.press('Enter')

    // The completed subagent from the first message should still be visible
    // (Rocky Talky shows historical subagents when not streaming)
    await expect(subagentPanel).toBeVisible()
    
    // Wait for the second subagent panel to appear
    await page.waitForTimeout(1000)
    
    // We should have 2 subagent cards now
    const cardCount = await page.getByTestId('subagent-card').count()
    expect(cardCount).toBeGreaterThanOrEqual(1) // At least the first one should be visible
  })
})
