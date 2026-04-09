import XMarkdown from '@ant-design/x-markdown'

type MarkdownBlockProps = {
  content: string
  /** 流式输出时传入；完成后请勿传或 hasNextChunk: false */
  streaming?: boolean
  onCitationClick?: (index: number) => void
}

const CIRCLED_NUMBERS = [
  '',
  '①',
  '②',
  '③',
  '④',
  '⑤',
  '⑥',
  '⑦',
  '⑧',
  '⑨',
  '⑩',
  '⑪',
  '⑫',
  '⑬',
  '⑭',
  '⑮',
  '⑯',
  '⑰',
  '⑱',
  '⑲',
  '⑳',
]

function citationLabel(index: number) {
  if (index > 0 && index < CIRCLED_NUMBERS.length) return CIRCLED_NUMBERS[index]
  return `(${index})`
}

/** Backend may use 0-based indices in prose; show 1-based circled label when possible. */
function withCitationLinks(content: string) {
  return content.replace(/(?:\(|（)\s*citation\s*[:：]\s*(\d+)\s*(?:\)|）)/gi, (_match, num: string) => {
    const raw = Number(num)
    const display = citationLabel(raw + 1)
    return `[${display}](citation://${raw})`
  })
}

export function MarkdownBlock({ content, streaming, onCitationClick }: MarkdownBlockProps) {
  return (
    <div
      className="wrap-break-word text-[15px] leading-relaxed [&_a]:text-orange-600 [&_a]:underline [&_a[href^='citation://']]:inline-flex [&_a[href^='citation://']]:h-5 [&_a[href^='citation://']]:min-w-5 [&_a[href^='citation://']]:items-center [&_a[href^='citation://']]:justify-center [&_a[href^='citation://']]:rounded-full [&_a[href^='citation://']]:border [&_a[href^='citation://']]:border-gray-200/80 [&_a[href^='citation://']]:bg-gray-100 [&_a[href^='citation://']]:px-1 [&_a[href^='citation://']]:text-[12px] [&_a[href^='citation://']]:font-medium [&_a[href^='citation://']]:text-gray-600 [&_a[href^='citation://']]:leading-none [&_a[href^='citation://']]:no-underline [&_a[href^='citation://']]:align-text-top [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_code]:py-0.5 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_strong]:font-semibold"
      onClick={(event) => {
        const target = event.target as HTMLElement | null
        const anchor = target?.closest?.('a[href^="citation://"]') as HTMLAnchorElement | null
        if (!anchor) return
        event.preventDefault()
        const match = anchor.getAttribute('href')?.match(/^citation:\/\/(\d+)$/i)
        if (!match) return
        onCitationClick?.(Number(match[1]))
      }}
    >
      <XMarkdown
        content={withCitationLinks(content)}
        openLinksInNewTab
        streaming={
          streaming
            ? {
                hasNextChunk: true,
                tail: true,
              }
            : undefined
        }
      />
    </div>
  )
}
