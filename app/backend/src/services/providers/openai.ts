import OpenAI from 'openai'
import type { AIProvider } from '../aiService'
import type { AIMessage, ChatOptions } from '@shared/schemas/ai'
import logger from '@shared/util/logger'

/**
 * OpenAI provider — uses the official OpenAI SDK.
 *
 * Default model: gpt-4o-mini (fast, cheap, good for development).
 * Override via AI_MODEL env var or per-request options.
 */

const DEFAULT_MODEL = 'gpt-4o-mini'

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai'
  private client: OpenAI
  private defaultModel: string

  constructor(apiKey: string, model?: string) {
    this.client = new OpenAI({ apiKey })
    this.defaultModel = model || DEFAULT_MODEL
  }

  async chat(messages: AIMessage[], options?: ChatOptions): Promise<string> {
    const model = options?.model || this.defaultModel

    const completion = await this.client.chat.completions.create({
      model,
      messages: this.formatMessages(messages, options?.systemPrompt),
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      logger.warn({ model }, 'OpenAI returned empty response')
      return ''
    }

    return content
  }

  async *chatStream(messages: AIMessage[], options?: ChatOptions): AsyncGenerator<string> {
    const model = options?.model || this.defaultModel

    const stream = await this.client.chat.completions.create({
      model,
      messages: this.formatMessages(messages, options?.systemPrompt),
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      stream: true,
    })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        yield content
      }
    }
  }

  /**
   * Format messages for OpenAI API.
   * Prepends system prompt if provided and not already in messages.
   */
  private formatMessages(
    messages: AIMessage[],
    systemPrompt?: string,
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const formatted: OpenAI.Chat.ChatCompletionMessageParam[] = []

    // Add system prompt if provided and messages don't already start with one
    if (systemPrompt && messages[0]?.role !== 'system') {
      formatted.push({ role: 'system', content: systemPrompt })
    }

    for (const msg of messages) {
      formatted.push({ role: msg.role, content: msg.content })
    }

    return formatted
  }
}
