import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useAIWorkspaceStore } from '../../lib/state/ai-workspace'

function getSelectionText() {
  return window.getSelection()?.toString().trim() ?? ''
}

function buildContext(selectedText: string, pathname: string) {
  const selection = window.getSelection()
  const anchorNode = selection?.anchorNode
  const element = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement
  const source = element?.closest('[data-selection-source]')?.getAttribute('data-selection-source') ?? pathname
  const surrounding = element?.textContent?.trim().slice(0, 240) ?? selectedText

  return {
    selected_text: selectedText,
    selection_source: source,
    surrounding_text: surrounding,
    scene: pathname === '/cooking' ? 'cooking' : 'quote',
  }
}

function isBlockedTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return Boolean(target.closest('button, a, input, textarea, select, [data-selection-ignore="true"]'))
}

export function SelectionOverlay() {
  const { quoteContext, floatingAnchor, setSelection, openQuote, clearSelection } = useAIWorkspaceStore()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const updateSelection = (event?: Event) => {
      if (event && isBlockedTarget(event.target)) {
        return
      }

      const selectedText = getSelectionText()
      if (!selectedText || selectedText.length < 2) {
        clearSelection()
        return
      }

      const selection = window.getSelection()
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null
      const rect = range?.getBoundingClientRect()
      const anchor = rect
        ? {
            x: rect.left + rect.width / 2,
            y: rect.top + window.scrollY - 8,
          }
        : { x: window.innerWidth / 2, y: window.scrollY + 120 }

      setSelection(buildContext(selectedText, location.pathname), anchor)
    }

    document.addEventListener('selectionchange', updateSelection)
    document.addEventListener('mouseup', updateSelection)
    document.addEventListener('touchend', updateSelection)

    return () => {
      document.removeEventListener('selectionchange', updateSelection)
      document.removeEventListener('mouseup', updateSelection)
      document.removeEventListener('touchend', updateSelection)
    }
  }, [clearSelection, location.pathname, setSelection])

  if (!quoteContext.selected_text) {
    return null
  }

  const openKnowledgeDraft = () => navigate(`/knowledge?draft=${encodeURIComponent(quoteContext.selected_text)}`)
  const openRecipeDraft = () => navigate(`/recipes/editor?quote=${encodeURIComponent(quoteContext.selected_text)}`)

  return (
    <>
      <div
        className="selection-ignore fixed z-40 hidden md:flex"
        style={{
          left: floatingAnchor.x,
          top: floatingAnchor.y,
          transform: 'translate(-50%, -100%)',
        }}
      >
        <div className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/95 px-2 py-2 shadow-[var(--shadow-md)] backdrop-blur-xl">
          <button
            type="button"
            className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white"
            onClick={openQuote}
          >
            引用问 AI
          </button>
          <button
            type="button"
            className="rounded-full px-3 py-2 text-sm font-semibold text-[var(--text-soft)] hover:bg-[var(--surface-soft)]"
            onClick={openKnowledgeDraft}
          >
            加入知识库草稿
          </button>
          <button
            type="button"
            className="rounded-full px-3 py-2 text-sm font-semibold text-[var(--text-soft)] hover:bg-[var(--surface-soft)]"
            onClick={openRecipeDraft}
          >
            创建菜谱草稿
          </button>
        </div>
      </div>

      <div className="selection-ignore fixed inset-x-3 bottom-24 z-40 rounded-[1.8rem] border border-[var(--line)] bg-[color:rgba(255,255,255,0.94)] p-3 shadow-[var(--shadow-lg)] backdrop-blur-xl md:hidden">
        <p className="line-clamp-2 text-sm leading-6 text-[var(--text-soft)]">{quoteContext.selected_text}</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            className="rounded-2xl bg-[var(--primary)] px-3 py-3 text-xs font-bold text-white"
            onClick={openQuote}
          >
            问 AI
          </button>
          <button
            type="button"
            className="rounded-2xl bg-[var(--surface-soft)] px-3 py-3 text-xs font-bold text-[var(--text)]"
            onClick={openKnowledgeDraft}
          >
            存为知识
          </button>
          <button
            type="button"
            className="rounded-2xl bg-[var(--surface-soft)] px-3 py-3 text-xs font-bold text-[var(--text)]"
            onClick={openRecipeDraft}
          >
            建菜谱
          </button>
        </div>
      </div>
    </>
  )
}
