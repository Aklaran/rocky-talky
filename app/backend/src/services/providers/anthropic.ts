import type { AIProvider } from '../aiService'
import type { AIMessage, ChatOptions } from '@shared/schemas/ai'
import logger from '@shared/util/logger'

/**
 * Anthropic provider — placeholder for when @anthropic-ai/sdk is installed.
 *
 * To use:
 * 1. pnpm add @anthropic-ai/sdk (in app/backend)
 * 2. Set AI_PROVIDER=anthropic and ANTHROPIC_API_KEY in .env
 * 3. Replace this stub with the real implementation
 *
 * Default model: claude-3-5-haiku-20241022
 */

/**
 * Check if @anthropic-ai/sdk is installed at startup.
 * Returns true if the SDK is available for import.
 */
export function isAnthropicSDKInstalled(): boolean {
  try {
    require.resolve('@anthropic-ai/sdk')
    return true
  } catch {
    return false
  }
}

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic'
  constructor(_apiKey: string, _model?: string) {
    logger.error(
      'Anthropic provider requires @anthropic-ai/sdk. Install it with: pnpm add @anthropic-ai/sdk',
    )
  }

  async chat(_messages: AIMessage[], _options?: ChatOptions): Promise<string> {
    return 'Anthropic provider is not installed. Run: pnpm add @anthropic-ai/sdk'
  }

  async *chatStream(_messages: AIMessage[], _options?: ChatOptions): AsyncGenerator<string> {
    yield 'Anthropic provider is not installed. Run: pnpm add @anthropic-ai/sdk'
  }
}
