import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('Deploy script', () => {
  let tempDir: string
  let tempHome: string

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = mkdtempSync(join(tmpdir(), 'deploy-test-'))
    tempHome = join(tempDir, 'home')
  })

  afterEach(() => {
    // Clean up
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('generates service file with correct log paths in ~/.local/state/rocky-talky/', () => {
    // This test will fail until we update deploy.sh
    const scriptPath = join(__dirname, '../../scripts/deploy.sh')
    
    // We'll create a mock version that only generates the service file
    // For now, let's read the script and verify it contains the right patterns
    const scriptContent = readFileSync(scriptPath, 'utf-8')
    
    // Check that the script creates the log directory (with or without quotes)
    expect(scriptContent).toMatch(/mkdir -p ["']?\$HOME\/.local\/state\/rocky-talky["']?/)
    
    // Check that StandardOutput points to the correct location
    expect(scriptContent).toContain('StandardOutput=append:$HOME/.local/state/rocky-talky/rocky-talky.log')
    
    // Check that StandardError points to the correct location
    expect(scriptContent).toContain('StandardError=append:$HOME/.local/state/rocky-talky/rocky-talky.log')
    
    // Ensure old /tmp path is not present
    expect(scriptContent).not.toContain('StandardOutput=append:/tmp/rocky-talky.log')
    expect(scriptContent).not.toContain('StandardError=append:/tmp/rocky-talky.log')
  })

  it('service file uses $HOME variable not hardcoded paths', () => {
    const scriptPath = join(__dirname, '../../scripts/deploy.sh')
    const scriptContent = readFileSync(scriptPath, 'utf-8')
    
    // Ensure we're using $HOME, not hardcoded paths like /home/user
    const logPathMatches = scriptContent.match(/StandardOutput=append:([^\n]+)/g)
    if (logPathMatches) {
      for (const match of logPathMatches) {
        // If it contains a log path, it should use $HOME
        if (match.includes('.local/state/rocky-talky')) {
          expect(match).toContain('$HOME')
          expect(match).not.toMatch(/\/home\/[^$]/)
        }
      }
    }
  })
})
