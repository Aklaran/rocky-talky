import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessageList } from './MessageList'
import type { MessageOutput } from '@shared/schemas/session'

describe('MessageList - mobile bubble sizing', () => {
  const createMessage = (role: 'user' | 'assistant', content: string, id = '1'): MessageOutput => ({
    id,
    sessionId: 'session-1',
    role,
    content,
    createdAt: new Date().toISOString(),
  })

  describe('max-width constraints', () => {
    it('should apply max-width to user message bubbles', () => {
      const messages = [createMessage('user', 'Hello')]
      render(<MessageList messages={messages} />)
      
      const bubble = screen.getByTestId('message-user').querySelector('.max-w-\\[80\\%\\]')
      expect(bubble).toBeInTheDocument()
    })

    it('should apply max-width to assistant message bubbles', () => {
      const messages = [createMessage('assistant', 'Hi there')]
      render(<MessageList messages={messages} />)
      
      const bubble = screen.getByTestId('message-assistant').querySelector('.max-w-\\[80\\%\\]')
      expect(bubble).toBeInTheDocument()
    })

    it('should apply max-width to streaming message bubbles', () => {
      render(<MessageList messages={[]} streamingContent="Streaming..." isStreaming />)
      
      const bubble = screen.getByTestId('message-streaming').querySelector('.max-w-\\[80\\%\\]')
      expect(bubble).toBeInTheDocument()
    })

    it('should apply max-width to tool message bubbles', () => {
      const messages = [createMessage('tool' as any, 'Tool output')]
      render(<MessageList messages={messages} />)
      
      const bubble = screen.getByTestId('message-tool').querySelector('.max-w-\\[80\\%\\]')
      expect(bubble).toBeInTheDocument()
    })
  })

  describe('overflow handling', () => {
    it('should have overflow-hidden on user message bubbles', () => {
      const messages = [createMessage('user', 'Hello')]
      render(<MessageList messages={messages} />)
      
      const bubble = screen.getByTestId('message-user').querySelector('.overflow-hidden')
      expect(bubble).toBeInTheDocument()
    })

    it('should have overflow-hidden on assistant message bubbles', () => {
      const messages = [createMessage('assistant', 'Hi there')]
      render(<MessageList messages={messages} />)
      
      const bubble = screen.getByTestId('message-assistant').querySelector('.overflow-hidden')
      expect(bubble).toBeInTheDocument()
    })

    it('should have overflow-hidden on streaming message bubbles', () => {
      render(<MessageList messages={[]} streamingContent="Streaming..." isStreaming />)
      
      const bubble = screen.getByTestId('message-streaming').querySelector('.overflow-hidden')
      expect(bubble).toBeInTheDocument()
    })

    it('should have overflow-hidden on tool message bubbles', () => {
      const messages = [createMessage('tool' as any, 'Tool output')]
      render(<MessageList messages={messages} />)
      
      const bubble = screen.getByTestId('message-tool').querySelector('.overflow-hidden')
      expect(bubble).toBeInTheDocument()
    })
  })

  describe('word-breaking', () => {
    it('should have break-words on user message bubbles', () => {
      const messages = [createMessage('user', 'Hello')]
      render(<MessageList messages={messages} />)
      
      const bubble = screen.getByTestId('message-user').querySelector('.break-words')
      expect(bubble).toBeInTheDocument()
    })

    it('should have break-words on assistant message bubbles', () => {
      const messages = [createMessage('assistant', 'Hi there')]
      render(<MessageList messages={messages} />)
      
      const bubble = screen.getByTestId('message-assistant').querySelector('.break-words')
      expect(bubble).toBeInTheDocument()
    })

    it('should have break-words on streaming message bubbles', () => {
      render(<MessageList messages={[]} streamingContent="Streaming..." isStreaming />)
      
      const bubble = screen.getByTestId('message-streaming').querySelector('.break-words')
      expect(bubble).toBeInTheDocument()
    })

    it('should have break-words on tool message bubbles', () => {
      const messages = [createMessage('tool' as any, 'Tool output')]
      render(<MessageList messages={messages} />)
      
      const bubble = screen.getByTestId('message-tool').querySelector('.break-words')
      expect(bubble).toBeInTheDocument()
    })
  })

  describe('long content handling', () => {
    it('should handle long unbroken strings in user messages', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(200)
      const messages = [createMessage('user', longUrl)]
      render(<MessageList messages={messages} />)
      
      const bubble = screen.getByTestId('message-user')
      expect(bubble).toBeInTheDocument()
      // Bubble should have both overflow and break-words
      expect(bubble.querySelector('.overflow-hidden')).toBeInTheDocument()
      expect(bubble.querySelector('.break-words')).toBeInTheDocument()
    })

    it('should handle long unbroken strings in assistant messages', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(200)
      const messages = [createMessage('assistant', longUrl)]
      render(<MessageList messages={messages} />)
      
      const bubble = screen.getByTestId('message-assistant')
      expect(bubble).toBeInTheDocument()
      expect(bubble.querySelector('.overflow-hidden')).toBeInTheDocument()
      expect(bubble.querySelector('.break-words')).toBeInTheDocument()
    })

    it('should handle long code blocks in assistant messages', () => {
      const longCode = '```\n' + 'const x = ' + 'a'.repeat(200) + '\n```'
      const messages = [createMessage('assistant', longCode)]
      render(<MessageList messages={messages} />)
      
      const bubble = screen.getByTestId('message-assistant')
      expect(bubble).toBeInTheDocument()
      expect(bubble.querySelector('.overflow-hidden')).toBeInTheDocument()
    })
  })

  describe('consistent styling across message types', () => {
    it('should apply same width constraints to all message types', () => {
      const messages = [
        createMessage('user', 'User message', '1'),
        createMessage('assistant', 'Assistant message', '2'),
        createMessage('tool' as any, 'Tool message', '3'),
      ]
      render(<MessageList messages={messages} streamingContent="Streaming" isStreaming />)
      
      // All bubbles should have max-w-[80%]
      const userBubble = screen.getByTestId('message-user').querySelector('.max-w-\\[80\\%\\]')
      const assistantBubble = screen.getByTestId('message-assistant').querySelector('.max-w-\\[80\\%\\]')
      const toolBubble = screen.getByTestId('message-tool').querySelector('.max-w-\\[80\\%\\]')
      const streamingBubble = screen.getByTestId('message-streaming').querySelector('.max-w-\\[80\\%\\]')
      
      expect(userBubble).toBeInTheDocument()
      expect(assistantBubble).toBeInTheDocument()
      expect(toolBubble).toBeInTheDocument()
      expect(streamingBubble).toBeInTheDocument()
    })

    it('should apply same overflow handling to all message types', () => {
      const messages = [
        createMessage('user', 'User message', '1'),
        createMessage('assistant', 'Assistant message', '2'),
        createMessage('tool' as any, 'Tool message', '3'),
      ]
      render(<MessageList messages={messages} streamingContent="Streaming" isStreaming />)
      
      // All bubbles should have overflow-hidden
      const userBubble = screen.getByTestId('message-user').querySelector('.overflow-hidden')
      const assistantBubble = screen.getByTestId('message-assistant').querySelector('.overflow-hidden')
      const toolBubble = screen.getByTestId('message-tool').querySelector('.overflow-hidden')
      const streamingBubble = screen.getByTestId('message-streaming').querySelector('.overflow-hidden')
      
      expect(userBubble).toBeInTheDocument()
      expect(assistantBubble).toBeInTheDocument()
      expect(toolBubble).toBeInTheDocument()
      expect(streamingBubble).toBeInTheDocument()
    })
  })
})
