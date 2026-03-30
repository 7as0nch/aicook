import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { resolveRecipeImageUrl } from '../../lib/utils/recipeImage'

type Props = {
  open: boolean
  urls: string[]
  index: number
  alt: string
  onClose: () => void
  onIndexChange?: (i: number) => void
}

export function ImageLightbox({ open, urls, index, alt, onClose, onIndexChange }: Props) {
  const safe = urls.filter(Boolean)
  const i = Math.min(Math.max(0, index), Math.max(0, safe.length - 1))
  const src = safe[i] ?? ''

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && onIndexChange && i > 0) onIndexChange(i - 1)
      if (e.key === 'ArrowRight' && onIndexChange && i < safe.length - 1) onIndexChange(i + 1)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose, onIndexChange, i, safe.length])

  if (!open || !src) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex flex-col bg-black/92"
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      onClick={onClose}
    >
      <div className="flex shrink-0 items-center justify-end px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 hover:bg-white/10"
          aria-label="关闭"
        >
          <X className="h-6 w-6" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-2 pb-[env(safe-area-inset-bottom)]">
        <img
          src={resolveRecipeImageUrl(src)}
          alt={alt}
          className="max-h-full max-w-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      {safe.length > 1 ? (
        <div className="flex shrink-0 justify-center gap-2 pb-6 pt-2">
          <button
            type="button"
            disabled={i <= 0}
            onClick={(e) => {
              e.stopPropagation()
              onIndexChange?.(i - 1)
            }}
            className="rounded-full bg-white/15 px-3 py-1.5 text-sm text-white disabled:opacity-30"
          >
            上一张
          </button>
          <span className="flex items-center text-sm text-white/70">
            {i + 1} / {safe.length}
          </span>
          <button
            type="button"
            disabled={i >= safe.length - 1}
            onClick={(e) => {
              e.stopPropagation()
              onIndexChange?.(i + 1)
            }}
            className="rounded-full bg-white/15 px-3 py-1.5 text-sm text-white disabled:opacity-30"
          >
            下一张
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}
