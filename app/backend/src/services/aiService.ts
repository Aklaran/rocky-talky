import type { AIMessage, ChatOptions } from '@shared/schemas/ai'
import { getEnv } from '../lib/env'
import logger from '@shared/util/logger'
import { OpenAIProvider } from './providers/openai'
import { AnthropicProvider, isAnthropicSDKInstalled } from './providers/anthropic'
import { MockProvider } from './providers/mock'

/**
 * AI Service — provider-agnostic LLM interface.
 *
 * Design:
 * - Provider selected via AI_PROVIDER env var
 * - Initialized on first use (cached after)
 * - Falls back gracefully when no provider is configured
 * - Stream-first: chatStream() is the primary interface
 *
 * Adding a new provider:
 * 1. Create providers/yourprovider.ts implementing AIProvider
 * 2. Add the case to getProvider() below
 * 3. Add env vars to shared/schemas/env.ts
 */

// =============================================================================
// Provider Interface
// =============================================================================

export interface AIProvider {
  /** Generate a complete response (non-streaming) */
  chat(messages: AIMessage[], options?: ChatOptions): Promise<string>

  /** Generate a streamed response — yields text chunks */
  chatStream(messages: AIMessage[], options?: ChatOptions): AsyncGenerator<string>

  /** Provider name for logging */
  readonly name: string
}

// =============================================================================
// Provider Factory
// =============================================================================

let _provider: AIProvider | null = null
let _initialized = false

/**
 * Get the configured AI provider.
 * Returns null if no provider is configured (AI_PROVIDER not set).
 * Caches the provider instance after first call.
 */
export function getProvider(): AIProvider | null {
  if (_initialized) return _provider

  const env = getEnv()
  _initialized = true

  if (!env.AI_PROVIDER) {
    logger.info('No AI_PROVIDER configured — AI features will return fallback messages')
    return null
  }

  switch (env.AI_PROVIDER) {
    case 'openai': {
      if (!env.OPENAI_API_KEY) {
        logger.warn('AI_PROVIDER=openai but OPENAI_API_KEY is not set')
        return null
      }
      _provider = new OpenAIProvider(env.OPENAI_API_KEY, env.AI_MODEL)
      break
    }
    case 'anthropic': {
      if (!env.ANTHROPIC_API_KEY) {
        logger.warn('AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set')
        return null
      }
      if (!isAnthropicSDKInstalled()) {
        logger.warn('AI_PROVIDER=anthropic but @anthropic-ai/sdk is not installed. Run: pnpm add @anthropic-ai/sdk')
        return null
      }
      _provider = new AnthropicProvider(env.ANTHROPIC_API_KEY, env.AI_MODEL)
      break
    }
    case 'mock': {
      _provider = new MockProvider()
      break
    }
    default:
      logger.warn({ provider: env.AI_PROVIDER }, 'Unknown AI_PROVIDER')
      return null
  }

  if (_provider) {
    logger.info({ provider: _provider.name, model: env.AI_MODEL }, 'AI provider initialized')
  }
  return _provider
}

/**
 * Reset the cached provider — used in tests.
 */
export function resetProvider(): void {
  _provider = null
  _initialized = false
}

// =============================================================================
// Convenience Functions
// =============================================================================

const NO_AI_MESSAGE =
  'AI is not configured. Set AI_PROVIDER and the corresponding API key in your environment variables.'

/**
 * Generate a chat response. Falls back gracefully if no provider configured.
 */
export async function chat(messages: AIMessage[], options?: ChatOptions): Promise<string> {
  const provider = getProvider()
  if (!provider) return NO_AI_MESSAGE
  return provider.chat(messages, options)
}

/**
 * Generate a streamed chat response. Falls back gracefully if no provider configured.
 */
export async function* chatStream(
  messages: AIMessage[],
  options?: ChatOptions,
): AsyncGenerator<string> {
  const provider = getProvider()
  if (!provider) {
    yield NO_AI_MESSAGE
    return
  }
  yield* provider.chatStream(messages, options)
}
