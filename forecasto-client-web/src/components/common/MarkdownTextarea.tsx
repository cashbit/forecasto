import { useRef, useEffect, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

function highlightMarkdown(text: string): string {
  const lines = text.split('\n')
  return lines
    .map((line) => {
      const escaped = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

      // Headings
      if (/^#{1,6}\s/.test(escaped)) {
        return `<span class="md-heading">${escaped}</span>`
      }
      // Blockquotes
      if (/^&gt;\s/.test(escaped)) {
        return `<span class="md-blockquote">${escaped}</span>`
      }
      // Horizontal rules
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(escaped)) {
        return `<span class="md-hr">${escaped}</span>`
      }
      // List items
      let result = escaped
      if (/^(\s*[-*+]\s|\s*\d+\.\s)/.test(result)) {
        result = result.replace(/^(\s*[-*+]\s|\s*\d+\.\s)/, '<span class="md-list">$1</span>')
      }
      // Bold
      result = result.replace(/(\*\*|__)(.+?)\1/g, '<span class="md-bold">$1$2$1</span>')
      // Italic
      result = result.replace(/(\*|_)(.+?)\1/g, '<span class="md-italic">$1$2$1</span>')
      // Inline code
      result = result.replace(/`([^`]+)`/g, '<span class="md-code">`$1`</span>')
      // Links
      result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="md-link">[$1]($2)</span>')
      return result
    })
    .join('\n')
}

interface MarkdownTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'style'> {
  value?: string
  onValueChange?: (value: string) => void
  heightClass?: string
}

export function MarkdownTextarea({ value = '', onValueChange, className, heightClass = 'h-full', ...props }: MarkdownTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)

  // Sync scroll between textarea and highlight div
  const handleScroll = () => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }

  useEffect(() => {
    handleScroll()
  }, [value])

  return (
    <div className={cn('relative rounded-md border bg-transparent', heightClass, className)}>
      {/* Highlighted layer */}
      <div
        ref={highlightRef}
        className="absolute inset-0 overflow-hidden pointer-events-none p-3 text-sm font-mono whitespace-pre-wrap break-words leading-normal markdown-highlight"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: highlightMarkdown(value) + '\n' }}
      />
      {/* Editable textarea (transparent text, visible caret) */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
        onScroll={handleScroll}
        className="absolute inset-0 w-full h-full resize-none p-3 text-sm font-mono whitespace-pre-wrap break-words leading-normal bg-transparent text-transparent caret-foreground outline-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        spellCheck={false}
        {...props}
      />
    </div>
  )
}
