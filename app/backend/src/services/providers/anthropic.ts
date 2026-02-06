import type { AIProvider } from '../aiService'
import type { AIMessage, ChatOptions } from '@shared/schemas/ai'

/**
 * Anthropic provider — placeholder for when @anthropic-ai/sdk is installed.
 *
 * To use:
 * 1. pnpm add @anthropic-ai/sdk (in app/backend)
 * 2. Set AI_PROVIDER=anthropic and ANTHROPIC_API_KEY in .env
 * 3. Uncomment the implementation below and remove the stub
 *
 * Default model: claude-3-5-haiku-20241022
 */

// Default model: claude-3-5-haiku-20241022

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic'
  constructor(_apiKey: string, _model?: string) {
    // When @anthropic-ai/sdk is installed, initialize client here:
    // this.client = new Anthropic({ apiKey })
    throw new Error(
      'Anthropic provider requires @anthropic-ai/sdk. Install it with: pnpm add @anthropic-ai/sdk',
    )
  }

  async chat(_messages: AIMessage[], _options?: ChatOptions): Promise<string> {
    throw new Error('Not implemented — install @anthropic-ai/sdk')
  }

  async *chatStream(_messages: AIMessage[], _options?: ChatOptions): AsyncGenerator<string> {
    throw new Error('Not implemented — install @anthropic-ai/sdk')
  }
}
