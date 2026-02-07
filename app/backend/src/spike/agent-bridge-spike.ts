#!/usr/bin/env tsx
/**
 * Agent Bridge Spike Test
 *
 * Validates that the Pi SDK can be used as an agent bridge for Rocky Talky.
 *
 * This script:
 * 1. Creates an agent session via the bridge service
 * 2. Sends a greeting message
 * 3. Verifies the Annapurna skill is loaded (response identifies as Annapurna)
 * 4. Sends a follow-up that requires tool use
 * 5. Verifies tool calls work (read file)
 * 6. Cleans up
 *
 * Run with: npx tsx app/backend/src/spike/agent-bridge-spike.ts
 */

import * as agentBridge from '../services/agentBridgeService'

// =============================================================================
// Test Helpers
// =============================================================================

interface TestResult {
  passed: boolean
  message: string
}

const results: TestResult[] = []

function logTest(name: string, passed: boolean, message: string) {
  results.push({ passed, message: `${name}: ${message}` })
  const icon = passed ? '✓' : '✗'
  const color = passed ? '\x1b[32m' : '\x1b[31m'
  console.log(`${color}${icon}\x1b[0m ${name}: ${message}`)
}

// =============================================================================
// Test Flow
// =============================================================================

async function runSpike() {
  console.log('\n🚀 Rocky Talky Agent Bridge Spike Test\n')

  const sessionId = 'spike-test-session-' + Date.now()
  let sessionCreated = false

  try {
    // Test 1: Create agent session
    console.log('Test 1: Creating agent session...')
    const sessionInfo = await agentBridge.createSession(sessionId)
    sessionCreated = true

    logTest(
      'Create Session',
      sessionInfo.sessionId === sessionId,
      `Session created with ID ${sessionInfo.sessionId}`,
    )

    // Test 2: Send greeting and verify Annapurna skill
    console.log('\nTest 2: Sending greeting message...')
    const greeting = "Hello, I'm testing the Rocky Talky agent bridge. What's your name?"

    let greetingResponse = ''
    let textChunks = 0

    for await (const event of agentBridge.sendMessage(sessionId, greeting)) {
      if (event.type === 'text') {
        greetingResponse += event.content
        textChunks++
        process.stdout.write(event.content)
      } else if (event.type === 'completion') {
        console.log('\n')
        logTest(
          'Receive Greeting',
          textChunks > 0,
          `Received ${textChunks} text chunks, ${greetingResponse.length} chars`,
        )
      }
    }

    // Verify Annapurna identity
    const hasAnnapurnaIdentity =
      greetingResponse.toLowerCase().includes('annapurna') ||
      greetingResponse.toLowerCase().includes('anna')

    logTest(
      'Annapurna Skill',
      hasAnnapurnaIdentity,
      hasAnnapurnaIdentity
        ? 'Agent identified as Annapurna ✓'
        : 'Agent did not identify as Annapurna (skill may not have loaded)',
    )

    // Test 3: Send tool-requiring message
    console.log('\nTest 3: Testing tool use (file read)...')
    const toolMessage =
      'Can you read the file at ~/repos/rocky-talky/package.json and tell me the project name?'

    let toolResponse = ''
    let toolCalls = 0
    let readToolUsed = false

    for await (const event of agentBridge.sendMessage(sessionId, toolMessage)) {
      if (event.type === 'text') {
        toolResponse += event.content
        process.stdout.write(event.content)
      } else if (event.type === 'tool_call') {
        toolCalls++
        console.log(`\n[Tool Call: ${event.toolName}]`)

        if (event.toolName === 'Read' || event.toolName === 'read') {
          readToolUsed = true
        }
      } else if (event.type === 'tool_result') {
        console.log(`[Tool Result: ${event.toolName}]`)
      } else if (event.type === 'completion') {
        console.log('\n')
      }
    }

    logTest('Tool Calls', toolCalls > 0, `Agent made ${toolCalls} tool call(s)`)

    logTest(
      'Read Tool',
      readToolUsed,
      readToolUsed
        ? 'Read tool was used ✓'
        : `Read tool not used (tools used: ${toolCalls})`,
    )

    // Verify response mentions the project
    const mentionsProject =
      toolResponse.toLowerCase().includes('rocky') ||
      toolResponse.toLowerCase().includes('talky') ||
      toolResponse.toLowerCase().includes('basecamp')

    logTest(
      'Tool Result',
      mentionsProject,
      mentionsProject
        ? 'Response mentions the project name ✓'
        : 'Response does not mention project name',
    )

    // Test 4: Session info
    console.log('\nTest 4: Checking session info...')
    const retrievedSession = agentBridge.getSession(sessionId)
    logTest(
      'Get Session',
      retrievedSession !== null,
      retrievedSession ? 'Session retrieved successfully' : 'Session not found',
    )

    const activeCount = agentBridge.getActiveSessionCount()
    logTest('Active Sessions', activeCount >= 1, `${activeCount} active session(s)`)

    // Test 5: Cleanup
    console.log('\nTest 5: Cleaning up...')
    const disposed = await agentBridge.disposeSession(sessionId)
    sessionCreated = false

    logTest('Dispose Session', disposed, disposed ? 'Session disposed' : 'Dispose failed')

    const countAfterDispose = agentBridge.getActiveSessionCount()
    logTest(
      'Cleanup Verify',
      countAfterDispose === 0,
      `${countAfterDispose} session(s) remain`,
    )
  } catch (err) {
    console.error('\n❌ Error during spike test:', err)
    logTest('Error Handling', false, (err as Error).message)

    // Cleanup on error
    if (sessionCreated) {
      try {
        await agentBridge.disposeSession(sessionId)
      } catch (cleanupErr) {
        console.error('Failed to cleanup after error:', cleanupErr)
      }
    }

    process.exit(1)
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('SPIKE TEST SUMMARY')
  console.log('='.repeat(60))

  const passed = results.filter((r) => r.passed).length
  const total = results.length

  results.forEach((result) => {
    const icon = result.passed ? '✓' : '✗'
    const color = result.passed ? '\x1b[32m' : '\x1b[31m'
    console.log(`${color}${icon}\x1b[0m ${result.message}`)
  })

  console.log('\n' + '-'.repeat(60))
  console.log(`Results: ${passed}/${total} tests passed`)

  if (passed === total) {
    console.log('\n✅ All tests passed! The Pi SDK is working correctly.\n')
    process.exit(0)
  } else {
    console.log('\n⚠️  Some tests failed. See details above.\n')
    process.exit(1)
  }
}

// Run the spike test
runSpike().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
