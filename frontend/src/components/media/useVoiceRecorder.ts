import { useCallback, useEffect, useRef, useState } from 'react'

import { transcribeAudio, uploadMedia, type MediaAsset, type VoiceTranscriptionResult } from '../../lib/api/client'

export interface VoiceRecorderResult {
  file: File
  asset: MediaAsset
  transcription: VoiceTranscriptionResult
}

export function useVoiceRecorder(onTranscribed: (result: VoiceRecorderResult) => void, options?: { resetHint?: string }) {
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [hint, setHint] = useState(options?.resetHint ?? '按住说话')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const busyRef = useRef(false)
  const recordingRef = useRef(false)
  const startingRef = useRef(false)
  const onTranscribedRef = useRef(onTranscribed)
  const resetHintRef = useRef(options?.resetHint ?? '按住说话')

  useEffect(() => {
    onTranscribedRef.current = onTranscribed
  }, [onTranscribed])

  useEffect(() => {
    resetHintRef.current = options?.resetHint ?? '按住说话'
  }, [options?.resetHint])

  useEffect(() => {
    busyRef.current = busy
    recordingRef.current = recording
  }, [busy, recording])

  const startRecording = useCallback(() => {
    if (busyRef.current || recordingRef.current || startingRef.current) return
    if (!navigator.mediaDevices?.getUserMedia) {
      setHint('当前设备不支持录音')
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      setHint('当前浏览器不支持录音编码')
      return
    }
    startingRef.current = true
    setHint('请求麦克风…')

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        startingRef.current = false
        try {
          const recorder = new MediaRecorder(stream)
          chunksRef.current = []
          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunksRef.current.push(event.data)
          }
          recorder.start()
          recorderRef.current = recorder
          setRecording(true)
          setHint('录音中…')
        } catch {
          stream.getTracks().forEach((t) => t.stop())
          setHint('无法启动录音')
        }
      })
      .catch((error) => {
        startingRef.current = false
        setHint(error instanceof Error ? error.message : '录音权限被拒绝')
      })
  }, [])

  const finishRecording = useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder || !recordingRef.current) return

    setBusy(true)
    setRecording(false)
    setHint('正在识别语音...')

    const stopPromise = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: 'audio/webm' }))
        recorder.stream.getTracks().forEach((track) => track.stop())
        recorderRef.current = null
        chunksRef.current = []
      }
    })

    recorder.stop()

    try {
      const blob = await stopPromise
      const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' })
      const asset = await uploadMedia(file, 'audio')
      const transcription = await transcribeAudio(asset.id)
      onTranscribedRef.current({ file, asset, transcription })
      setHint(transcription.status === 'dummy' ? '当前为演示转写结果' : '识别完成')
    } catch (error) {
      setHint(error instanceof Error ? error.message : '语音识别失败，请重试')
    } finally {
      setBusy(false)
      window.setTimeout(() => setHint(resetHintRef.current), 1200)
    }
  }, [])

  const cancelPending = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stream.getTracks().forEach((track) => track.stop())
      recorderRef.current = null
      chunksRef.current = []
      setRecording(false)
    }
    startingRef.current = false
  }, [])

  return {
    busy,
    recording,
    hint,
    startRecording,
    finishRecording,
    cancelPending,
  }
}
