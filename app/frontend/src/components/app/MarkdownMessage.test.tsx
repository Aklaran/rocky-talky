import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownMessage } from './MarkdownMessage'

describe('MarkdownMessage', () => {
  describe('code rendering', () => {
    it('should render inline code with inline styling (no pre wrapper)', () => {
      const content = 'This is `inline code` in text.'
      const { container } = render(<MarkdownMessage content={content} />)
      
      const codeElement = container.querySelector('code')
      expect(codeElement).toBeInTheDocument()
      
      // Inline code should have inline-specific classes
      expect(codeElement).toHaveClass('rounded')
      expect(codeElement).toHaveClass('bg-muted/50')
      expect(codeElement).toHaveClass('px-1.5')
      expect(codeElement).toHaveClass('py-0.5')
      
      // Inline code should NOT be wrapped in a pre tag
      const preElement = container.querySelector('pre')
      expect(preElement).not.toBeInTheDocument()
    })

    it('should render fenced code blocks with block styling', () => {
      const content = '```\nconst x = 1;\nconst y = 2;\n```'
      const { container } = render(<MarkdownMessage content={content} />)
      
      const preElement = container.querySelector('pre')
      expect(preElement).toBeInTheDocument()
      
      const codeElement = container.querySelector('code')
      expect(codeElement).toBeInTheDocument()
      
      // Block code should have block-specific classes
      expect(codeElement).toHaveClass('block')
      expect(codeElement).toHaveClass('rounded-lg')
      expect(codeElement).toHaveClass('bg-muted/30')
      expect(codeElement).toHaveClass('p-3')
      
      // Block code should have overflow for long lines
      expect(codeElement?.className).toMatch(/overflow-x-auto/)
    })

    it('should add language class for fenced code blocks with language hints', () => {
      const content = '```typescript\nconst hello: string = "world";\n```'
      const { container } = render(<MarkdownMessage content={content} />)
      
      const codeElement = container.querySelector('code')
      expect(codeElement).toBeInTheDocument()
      
      // Should have the language class applied
      expect(codeElement).toHaveClass('language-typescript')
    })

    it('should handle multiple inline code blocks in same paragraph', () => {
      const content = 'Use `const` or `let` but not `var`.'
      const { container } = render(<MarkdownMessage content={content} />)
      
      const codeElements = container.querySelectorAll('code')
      expect(codeElements).toHaveLength(3)
      
      // All should have inline styling
      codeElements.forEach((code) => {
        expect(code).toHaveClass('bg-muted/50')
        expect(code).toHaveClass('px-1.5')
      })
      
      // None should be in pre tags
      const preElements = container.querySelectorAll('pre')
      expect(preElements).toHaveLength(0)
    })

    it('should render code block with language label visible', () => {
      const content = '```javascript\nconsole.log("hello");\n```'
      const { container } = render(<MarkdownMessage content={content} />)
      
      const codeElement = container.querySelector('code')
      expect(codeElement).toHaveClass('language-javascript')
    })
  })

  describe('streaming indicator', () => {
    it('should show blinking cursor when streaming', () => {
      const { container } = render(
        <MarkdownMessage content="Hello" isStreaming={true} />
      )
      
      const cursor = container.querySelector('.animate-blink')
      expect(cursor).toBeInTheDocument()
    })

    it('should not show cursor when not streaming', () => {
      const { container } = render(
        <MarkdownMessage content="Hello" isStreaming={false} />
      )
      
      const cursor = container.querySelector('.animate-blink')
      expect(cursor).not.toBeInTheDocument()
    })
  })

  describe('markdown features', () => {
    it('should render bold text', () => {
      const content = 'This is **bold** text.'
      render(<MarkdownMessage content={content} />)
      
      const boldElement = screen.getByText('bold')
      expect(boldElement.tagName).toBe('STRONG')
      expect(boldElement).toHaveClass('font-bold')
    })

    it('should render links with target blank', () => {
      const content = '[Click here](https://example.com)'
      const { container } = render(<MarkdownMessage content={content} />)
      
      const linkElement = container.querySelector('a')
      expect(linkElement).toHaveAttribute('href', 'https://example.com')
      expect(linkElement).toHaveAttribute('target', '_blank')
      expect(linkElement).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('should render lists with proper spacing', () => {
      const content = '- Item 1\n- Item 2\n- Item 3'
      const { container } = render(<MarkdownMessage content={content} />)
      
      const listElement = container.querySelector('ul')
      expect(listElement).toHaveClass('list-disc')
      expect(listElement).toHaveClass('space-y-1')
      
      const listItems = container.querySelectorAll('li')
      expect(listItems).toHaveLength(3)
    })
  })
})
