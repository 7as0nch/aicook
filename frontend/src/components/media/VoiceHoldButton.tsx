import { Mic } from 'lucide-react'
import { useVoiceRecorder } from './useVoiceRecorder'

interface VoiceHoldButtonProps {
  onTranscribed: (text: string) => void
  className?: string
  /** Icon-only control (e.g. cooking FAB); hint shown via title/aria */
  compact?: boolean
}

export function VoiceHoldButton({ onTranscribed, className, compact }: VoiceHoldButtonProps) {
  const { busy, recording, hint, startRecording, finishRecording } = useVoiceRecorder((result) => {
    onTranscribed(result.transcription.text)
  })

  return (
    <button
      type="button"
      title={hint}
      aria-label={hint}
      className={[
        'selection-ignore inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-5 text-sm font-semibold text-gray-800 shadow-sm transition',
        compact ? 'px-0' : '',
        recording ? 'border-orange-500 bg-orange-500 text-white' : 'hover:bg-gray-50',
        busy ? 'opacity-80' : '',
        className ?? '',
      ].join(' ')}
      onPointerDown={(event) => {
        event.preventDefault()
        void startRecording()
      }}
      onPointerUp={(event) => {
        event.preventDefault()
        void finishRecording()
      }}
      onPointerLeave={() => {
        if (recording) {
          void finishRecording()
        }
      }}
      onPointerCancel={() => {
        if (recording) {
          void finishRecording()
        }
      }}
    >
      <Mic className={compact ? 'h-6 w-6' : 'h-4 w-4'} />
      {compact ? null : hint}
    </button>
  )
}
