import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

/**
 * MarkdownMessage — renders markdown content with proper styling.
 *
 * Features:
 * - Code blocks with syntax highlighting (simple pre/code styling)
 * - Tables, lists, bold, italic, links
 * - Inline code with distinct background
 * - Dark mode compatible
 */

interface MarkdownMessageProps {
  content: string
  isStreaming?: boolean
}

export function MarkdownMessage({ content, isStreaming }: MarkdownMessageProps) {
  return (
    <div className="markdown-content text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Paragraphs
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,

          // Headings
          h1: ({ children }) => (
            <h1 className="mb-3 mt-4 text-xl font-bold first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-3 text-lg font-bold first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h3>
          ),

          // Lists
          ul: ({ children }) => (
            <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>
          ),
          li: ({ children }) => <li className="ml-1">{children}</li>,

          // Code
          code: ({ node, className, children, ...props }: any) => {
            // In react-markdown v9+, inline code is NOT wrapped in <pre>
            // Block code IS wrapped in <pre> by the pre component
            // We detect inline by checking if there's no className (no language) and no newlines
            const isInline = !className && !String(children).includes('\n')
            
            if (isInline) {
              return (
                <code
                  className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-xs"
                  {...props}
                >
                  {children}
                </code>
              )
            }
            
            // Block code with syntax highlighting support
            return (
              <code
                className={cn(
                  'block rounded-lg bg-muted/30 p-3 font-mono text-xs leading-relaxed overflow-x-auto',
                  className
                )}
                {...props}
              >
                {children}
              </code>
            )
          },
          pre: ({ children, ...props }: any) => {
            // Extract language from code block className (e.g., "language-typescript")
            const codeChild = children?.props
            const className = codeChild?.className || ''
            const match = /language-(\w+)/.exec(className)
            const language = match ? match[1] : null
            
            return (
              <div className="relative mb-3 group">
                {language && (
                  <div className="absolute right-2 top-2 rounded bg-muted px-2 py-1 text-[10px] font-mono text-muted-foreground uppercase opacity-70">
                    {language}
                  </div>
                )}
                <pre className="overflow-x-auto" {...props}>
                  {children}
                </pre>
              </div>
            )
          },

          // Links
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              {children}
            </a>
          ),

          // Tables
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto">
              <table className="min-w-full border-collapse border border-border">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/50">{children}</thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b border-border">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="border border-border px-3 py-2 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-3 py-2">{children}</td>
          ),

          // Emphasis
          strong: ({ children }) => <strong className="font-bold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,

          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="mb-2 border-l-4 border-muted pl-4 italic text-muted-foreground">
              {children}
            </blockquote>
          ),

          // Horizontal rule
          hr: () => <hr className="my-4 border-border" />,
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && (
        <span className="inline-block h-4 w-1.5 animate-blink bg-current ml-0.5 align-middle" />
      )}
    </div>
  )
}
