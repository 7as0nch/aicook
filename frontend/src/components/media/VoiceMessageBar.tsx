import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { transcribeAudio, type ID } from '../../lib/api/client'

/** WeChat-style: `5"` under 60s, else `m:ss`. */
function formatWeChatSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return `0"`
  if (seconds < 60) return `${Math.round(seconds)}"`
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

type Props = {
  src?: string
  /** Kept for API compatibility; not shown (avoid exposing filenames). */
  label?: string
  assetId?: ID
  /** When no `assetId`, long-press shows this text (e.g. saved transcript). */
  fallbackText?: string
}

export function VoiceMessageBar({ src, assetId, fallbackText }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const draggingRef = useRef(false)
  const longPressDidFireRef = useRef(false)
  const scrubbedRef = useRef(false)

  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [dragging, setDragging] = useState(false)

  const clearLongPress = useCallback(() => {
    if (longPressRef.current != null) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }, [])

  useEffect(() => {
    const el = audioRef.current
    if (!el || !src) return
    const onMeta = () => setDuration(Number.isFinite(el.duration) ? el.duration : 0)
    const onTime = () => {
      if (!draggingRef.current) setCurrent(el.currentTime)
    }
    const onEnded = () => {
      setPlaying(false)
      setCurrent(0)
    }
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('ended', onEnded)
    return () => {
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('ended', onEnded)
    }
  }, [src])

  const seekToClientX = useCallback((clientX: number) => {
    const track = trackRef.current
    const audio = audioRef.current
    if (!track || !audio) return
    const len = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration
    if (!len) return
    const { left, width } = track.getBoundingClientRect()
    if (width <= 0) return
    const ratio = Math.min(1, Math.max(0, (clientX - left) / width))
    audio.currentTime = ratio * len
    setCurrent(audio.currentTime)
  }, [duration])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !src) return
    if (playing) {
      audio.pause()
      setPlaying(false)
      return
    }
    void audio
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false))
  }, [playing, src])

  const runTranscribe = useCallback(async () => {
    try {
      if (assetId) {
        const r = await transcribeAudio(assetId)
        const t = (r.text ?? '').trim() || '（无文字）'
        window.alert(`转文字：\n${t}`)
      } else if (fallbackText?.trim()) {
        window.alert(`转文字：\n${fallbackText.trim()}`)
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '转写失败')
    }
  }, [assetId, fallbackText])

  const onRowPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    longPressDidFireRef.current = false
    pointerStartRef.current = { x: e.clientX, y: e.clientY }
    clearLongPress()
    longPressRef.current = setTimeout(() => {
      longPressRef.current = null
      pointerStartRef.current = null
      longPressDidFireRef.current = true
      void runTranscribe()
    }, 520)
  }

  const onRowPointerMove = (e: ReactPointerEvent) => {
    const start = pointerStartRef.current
    if (!start) return
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) {
      clearLongPress()
    }
  }

  const onRowPointerUp = () => {
    pointerStartRef.current = null
    clearLongPress()
  }

  const onTrackPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || !src) return
    e.stopPropagation()
    clearLongPress()
    pointerStartRef.current = null
    draggingRef.current = true
    setDragging(true)
    scrubbedRef.current = true
    seekToClientX(e.clientX)
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
  }

  const onTrackPointerMove = (e: ReactPointerEvent) => {
    if (!draggingRef.current) return
    seekToClientX(e.clientX)
  }

  const endTrackDrag = (e: ReactPointerEvent) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    try {
      ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    window.requestAnimationFrame(() => {
      scrubbedRef.current = false
    })
  }

  const onBubbleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-voice-scrub]')) return
    if (longPressDidFireRef.current) {
      longPressDidFireRef.current = false
      return
    }
    if (scrubbedRef.current) return
    togglePlay()
  }

  const progress = duration > 0 ? Math.min(1, current / duration) : 0
  const shownSeconds = duration > 0 ? duration : current

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onBubbleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (!scrubbedRef.current) togglePlay()
        }
      }}
      className="relative w-full max-w-[min(100%,260px)] cursor-pointer select-none rounded-2xl border border-white/15 bg-gray-800/90 py-2.5 pl-3 pr-2 text-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-orange-400/50"
      onPointerDown={onRowPointerDown}
      onPointerMove={onRowPointerMove}
      onPointerUp={onRowPointerUp}
      onPointerCancel={onRowPointerUp}
    >
      {/* Right speech-bubble tail (sent), aligns with bubble fill */}
      <span
        className="pointer-events-none absolute left-full top-1/2 z-0 -translate-y-1/2 border-y-[7px] border-l-[9px] border-y-transparent border-l-gray-800/90"
        aria-hidden
      />

      {src ? <audio ref={audioRef} src={src} preload="metadata" className="hidden" /> : null}

      <div className="relative z-10 flex items-center gap-3 pr-1">
        <div className="min-w-0 flex-1 pt-0.5">
          <div
            ref={trackRef}
            data-voice-scrub
            onPointerDown={onTrackPointerDown}
            onPointerMove={onTrackPointerMove}
            onPointerUp={endTrackDrag}
            onPointerCancel={endTrackDrag}
            onClick={(e) => e.stopPropagation()}
            className={`relative h-1.5 cursor-pointer rounded-full bg-white/15 ${dragging ? 'ring-1 ring-orange-400/50' : ''}`}
          >
            <div
              className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-white/50"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        <span className="shrink-0 text-[15px] font-medium tabular-nums text-white/95">
          {formatWeChatSeconds(shownSeconds)}
        </span>
      </div>
    </div>
  )
}
