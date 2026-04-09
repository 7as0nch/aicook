import { useRef, useEffect } from 'react'
import { Link } from 'react-router'
import { Sender, Attachments } from '@ant-design/x'
import { motion, AnimatePresence } from 'motion/react'
import {
  Camera,
  Image as ImageIcon,
  Paperclip,
  Send,
  ChefHat,
  Plus,
  Mic,
} from 'lucide-react'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from '../ui/drawer'
import type { ActiveCooking } from '../../../lib/api/client'
import type { PendingAttachment } from './types'

const VOICE_PRESS_MS_TEXTAREA = 500

type AIChatComposerProps = {
  inputValue: string
  setInputValue: (v: string) => void
  sendBusy: boolean
  voiceBusy: boolean
  isRecording: boolean
  voiceHint: string
  pendingAttachments: PendingAttachment[]
  removePendingAttachment: (id: string) => void
  onSend: (text?: string) => void | Promise<void>
  onPaste: React.ClipboardEventHandler<HTMLElement>
  micButtonRef: React.RefObject<HTMLButtonElement>
  runMicToggleFromGesture: () => void
  micLastRealTouchTs: React.MutableRefObject<number>
  startRecording: () => void | Promise<void>
  finishRecording: () => void | Promise<void>
  reasoningEnabled: boolean
  setReasoningEnabled: React.Dispatch<React.SetStateAction<boolean>>
  webSearchEnabled: boolean
  setWebSearchEnabled: React.Dispatch<React.SetStateAction<boolean>>
  imageRecipeEnabled: boolean
  setImageRecipeEnabled: React.Dispatch<React.SetStateAction<boolean>>
  uploadStageLabel: string
  knowledgeIngestProgress: Record<string, string>
  activeCooking: ActiveCooking[]
  closeAI: () => void
  drawerOpen: boolean
  setDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>
  cameraInputRef: React.RefObject<HTMLInputElement>
  imageInputRef: React.RefObject<HTMLInputElement>
  fileInputRef: React.RefObject<HTMLInputElement>
  onImagePicked: (e: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>
  onFilePicked: (e: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>
  onScreenshot: () => void | Promise<void>
  messagesHasUser: boolean
}

export function AIChatComposer({
  inputValue,
  setInputValue,
  sendBusy,
  voiceBusy,
  isRecording,
  voiceHint,
  pendingAttachments,
  removePendingAttachment,
  onSend,
  onPaste,
  micButtonRef,
  runMicToggleFromGesture,
  micLastRealTouchTs,
  startRecording,
  finishRecording,
  reasoningEnabled,
  setReasoningEnabled,
  webSearchEnabled,
  setWebSearchEnabled,
  imageRecipeEnabled,
  setImageRecipeEnabled,
  uploadStageLabel,
  knowledgeIngestProgress,
  activeCooking,
  closeAI,
  drawerOpen,
  setDrawerOpen,
  cameraInputRef,
  imageInputRef,
  fileInputRef,
  onImagePicked,
  onFilePicked,
  onScreenshot,
  messagesHasUser,
}: AIChatComposerProps) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const senderRootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const root = senderRootRef.current
    if (!root) return
    const ta = root.querySelector('textarea')
    if (!ta) return

    const onPointerDown = () => {
      if (inputValue.trim() || sendBusy || voiceBusy) return
      if (pressTimer.current) {
        clearTimeout(pressTimer.current)
        pressTimer.current = null
      }
      pressTimer.current = window.setTimeout(() => {
        pressTimer.current = null
        void startRecording()
      }, VOICE_PRESS_MS_TEXTAREA)
    }
    const endPress = () => {
      if (pressTimer.current) {
        clearTimeout(pressTimer.current)
        pressTimer.current = null
      }
      if (isRecording) void finishRecording()
    }

    ta.addEventListener('pointerdown', onPointerDown)
    ta.addEventListener('pointerup', endPress)
    ta.addEventListener('pointerleave', endPress)
    ta.addEventListener('pointercancel', endPress)
    return () => {
      if (pressTimer.current) clearTimeout(pressTimer.current)
      ta.removeEventListener('pointerdown', onPointerDown)
      ta.removeEventListener('pointerup', endPress)
      ta.removeEventListener('pointerleave', endPress)
      ta.removeEventListener('pointercancel', endPress)
    }
  }, [inputValue, sendBusy, voiceBusy, isRecording, startRecording, finishRecording])

  const attachmentItems = pendingAttachments.map((p) => ({
    uid: p.id,
    name: p.name,
    status: 'done' as const,
    thumbUrl: p.type === 'image' ? p.previewUrl : undefined,
  }))

  return (
    <div className="relative z-30 shrink-0 border-t border-white/40 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2 backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-x-0 -top-12 h-12 bg-linear-to-b from-white/5 to-white/35 backdrop-blur-md mask-[linear-gradient(to_bottom,transparent,black)]" />
      <AnimatePresence>
        {isRecording && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute -top-14 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-gray-900 px-6 py-3 text-sm font-bold text-white shadow-xl"
          >
            <span className="flex gap-1">
              <motion.span
                animate={{ scaleY: [1, 2, 1] }}
                transition={{ repeat: Infinity, duration: 0.5 }}
                className="block h-3 w-1 rounded-full bg-orange-500"
              />
              <motion.span
                animate={{ scaleY: [1, 2.5, 1] }}
                transition={{ repeat: Infinity, duration: 0.5, delay: 0.1 }}
                className="block h-3 w-1 rounded-full bg-orange-500"
              />
              <motion.span
                animate={{ scaleY: [1, 1.5, 1] }}
                transition={{ repeat: Infinity, duration: 0.5, delay: 0.2 }}
                className="block h-3 w-1 rounded-full bg-orange-500"
              />
            </span>
            松开发送...
          </motion.div>
        )}
      </AnimatePresence>

      {activeCooking.length > 0 ? (
        <div className="mb-3 px-1">
          <p className="mb-1.5 text-[11px] font-medium text-gray-400">继续做菜</p>
          <div className="flex flex-wrap gap-2">
            {activeCooking.map((c) => (
              <Link
                key={String(c.recipe_id)}
                to={`/cook/${c.recipe_id}`}
                onClick={closeAI}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-800 transition hover:bg-orange-100"
              >
                <ChefHat className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{c.title}</span>
                {c.total_steps > 0 ? (
                  <span className="shrink-0 text-[10px] text-orange-600/90">
                    {c.step_index + 1}/{c.total_steps}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
        <button
          type="button"
          onClick={() => setReasoningEnabled((current) => !current)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
            reasoningEnabled ? 'bg-orange-500 text-white' : 'border border-gray-200 bg-gray-50 text-gray-600'
          }`}
        >
          深度思考
        </button>
        <button
          type="button"
          onClick={() => setWebSearchEnabled((current) => !current)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
            webSearchEnabled ? 'bg-orange-500 text-white' : 'border border-gray-200 bg-gray-50 text-gray-600'
          }`}
        >
          联网
        </button>
        <button
          type="button"
          onClick={() => setImageRecipeEnabled((current) => !current)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
            imageRecipeEnabled ? 'bg-orange-500 text-white' : 'border border-gray-200 bg-gray-50 text-gray-600'
          }`}
        >
          图文识别
        </button>
      </div>

      {uploadStageLabel ? (
        <div className="mb-2 px-1 text-xs font-medium text-orange-600">{uploadStageLabel}</div>
      ) : null}

      {Object.keys(knowledgeIngestProgress).length > 0 ? (
        <div className="mb-2 space-y-1.5 px-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-900/90">资料库入库</div>
          {Object.entries(knowledgeIngestProgress).map(([assetId, label]) => (
            <div
              key={assetId}
              className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/95 px-2.5 py-2 text-xs leading-snug text-amber-950"
            >
              <span className="mt-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-500" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      ) : null}

      {pendingAttachments.length > 0 ? (
        <div className="mb-3 px-1">
          <Attachments
            disabled={sendBusy}
            items={attachmentItems}
            beforeUpload={() => false}
            onRemove={(file) => {
              removePendingAttachment(String(file.uid))
              return true
            }}
          />
        </div>
      ) : null}

      <div ref={senderRootRef}>
        <Sender
          value={inputValue}
          onChange={(v) => setInputValue(typeof v === 'string' ? v : String(v))}
          onSubmit={(msg) => void onSend(msg)}
          onPaste={onPaste}
          loading={sendBusy}
          readOnly={sendBusy || voiceBusy}
          disabled={voiceBusy && !isRecording}
          submitType="enter"
          placeholder={isRecording ? '录音中…' : '说点什么…'}
          autoSize={{ minRows: 1, maxRows: 6 }}
          className="rounded-3xl border border-gray-200 bg-gray-50 [&_.ant-sender-textarea]:text-[15px]"
          prefix={
            !inputValue.trim() ? (
              <button
                ref={micButtonRef}
                type="button"
                title={isRecording ? '点击结束录音' : '点击开始录音'}
                aria-label={isRecording ? '点击结束录音' : '点击开始录音'}
                aria-disabled={sendBusy || voiceBusy}
                className={`relative z-20 flex h-11 w-11 shrink-0 touch-manipulation select-none items-center justify-center rounded-full transition-all [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] ${
                  sendBusy || voiceBusy ? 'opacity-50' : ''
                } ${isRecording ? 'scale-110 bg-orange-500 text-white shadow-lg' : 'bg-gray-200 text-gray-600'}`}
                onContextMenu={(e) => e.preventDefault()}
                onKeyDown={(e) => {
                  if (e.key !== ' ' && e.key !== 'Enter') return
                  e.preventDefault()
                  e.stopPropagation()
                  runMicToggleFromGesture()
                }}
                onPointerDown={(e) => {
                  if (e.pointerType === 'mouse' && e.button !== 0) return
                  if (e.pointerType === 'mouse' && Date.now() - (micLastRealTouchTs.current || 0) < 750) return
                  if (e.pointerType === 'touch' || e.pointerType === 'pen') {
                    micLastRealTouchTs.current = Date.now()
                  }
                  e.stopPropagation()
                  runMicToggleFromGesture()
                }}
              >
                <Mic className="pointer-events-none h-5 w-5" aria-hidden />
              </button>
            ) : null
          }
          suffix={(defaultActionNode) => (
            <>
              <span className="hidden" aria-hidden>
                {defaultActionNode}
              </span>
              {inputValue.trim() || pendingAttachments.length ? (
                <button
                  type="button"
                  disabled={sendBusy}
                  onClick={() => void onSend()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white shadow-sm transition-colors disabled:opacity-50"
                >
                  <Send className="ml-0.5 h-5 w-5" />
                </button>
              ) : (
                <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
                  <DrawerTrigger asChild>
                    <button
                      type="button"
                      disabled={sendBusy || voiceBusy}
                      onPointerDown={(e) => e.stopPropagation()}
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all disabled:opacity-50 ${
                        isRecording ? 'scale-110 bg-orange-500 text-white shadow-lg' : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      <Plus className="h-6 w-6" />
                    </button>
                  </DrawerTrigger>
                  <DrawerContent className="rounded-t-3xl bg-white">
                    <DrawerHeader>
                      <DrawerTitle>添加内容</DrawerTitle>
                      <DrawerDescription>相机、相册、文件上传和界面截图都放在这里。</DrawerDescription>
                    </DrawerHeader>
                    <div className="grid grid-cols-2 gap-3 px-4 pb-6">
                      <button
                        type="button"
                        onClick={() => {
                          setDrawerOpen(false)
                          cameraInputRef.current?.click()
                        }}
                        className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 text-left"
                      >
                        <Camera className="h-5 w-5 text-orange-500" />
                        <span className="text-sm font-medium text-gray-700">相机</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDrawerOpen(false)
                          imageInputRef.current?.click()
                        }}
                        className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 text-left"
                      >
                        <ImageIcon className="h-5 w-5 text-orange-500" />
                        <span className="text-sm font-medium text-gray-700">相册</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDrawerOpen(false)
                          fileInputRef.current?.click()
                        }}
                        className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 text-left"
                      >
                        <Paperclip className="h-5 w-5 text-orange-500" />
                        <span className="text-sm font-medium text-gray-700">文件上传</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDrawerOpen(false)
                          void onScreenshot()
                        }}
                        className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 text-left"
                      >
                        <Camera className="h-5 w-5 text-orange-500" />
                        <span className="text-sm font-medium text-gray-700">界面截图</span>
                      </button>
                    </div>
                  </DrawerContent>
                </Drawer>
              )}
            </>
          )}
        />
      </div>
      <div className="mt-2 text-center text-[10px] text-gray-400">
        {inputValue.trim() || pendingAttachments.length
          ? '按回车发送，可携带上方附件一起发出'
          : isRecording || voiceBusy
            ? voiceHint
            : messagesHasUser
              ? 'AI 生成的内容可能不准确，请谨慎参考'
              : '左侧话筒点击开始/结束；空白输入框长按说话（稍长按时粘贴菜单易先出）'}
      </div>
    </div>
  )
}
