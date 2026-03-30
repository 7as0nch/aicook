import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ImageIcon, Mic, Send, Sparkles, Wand2, X } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { VoiceHoldButton } from '../../components/media/VoiceHoldButton'
import { createAiSession, createImageRecipeDraft, sendAiMessage, uploadMedia, type ImportJob } from '../../lib/api/client'

export function RecipeWorkbenchPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const quote = searchParams.get('quote') ?? ''
  
  const [draftInput, setDraftInput] = useState(quote)
  const [draftReply, setDraftReply] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [loadingAi, setLoadingAi] = useState(false)

  const [files, setFiles] = useState<File[]>([])
  const [job, setJob] = useState<ImportJob>()
  const [uploading, setUploading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files])

  useEffect(() => {
    if (quote) {
      setDraftInput(quote)
    }
  }, [quote])

  async function askAi() {
    if (!draftInput.trim() && !files.length) {
      return
    }

    if (files.length > 0) {
      // Handle image upload and import
      setUploading(true)
      try {
        const assets = []
        for (const file of files) {
          assets.push(await uploadMedia(file, 'images'))
        }
        const newJob = await createImageRecipeDraft(
          assets.map((item) => item.id),
          draftInput,
        )
        setJob(newJob)
        setDraftReply('') // Clear previous text reply if any
        setFiles([]) // Clear files after successful upload
      } finally {
        setUploading(false)
      }
    } else if (draftInput.trim()) {
      // Handle text/voice AI prompt
      setLoadingAi(true)
      try {
        let currentSessionId = sessionId
        if (!currentSessionId) {
          const session = await createAiSession('recipe_editor', '菜谱工作台')
          currentSessionId = session.id
          setSessionId(currentSessionId)
        }
        const reply = await sendAiMessage(currentSessionId, draftInput, {
          selected_text: draftInput,
          selection_source: 'recipes/editor',
          surrounding_text: draftInput,
          scene: 'recipe_editor',
        })
        setDraftReply(reply.reply_content)
        setJob(undefined) // Clear previous job if any
      } finally {
        setLoadingAi(false)
      }
    }
  }

  function handleRemoveFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index))
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-gray-50 text-gray-800 font-sans">
      {/* Header */}
      <header className="relative flex shrink-0 items-center justify-center border-b border-gray-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="absolute left-4 flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">新增菜谱</h1>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-3xl space-y-6">
          {!draftReply && !job && !loadingAi && !uploading && (
            <div className="flex flex-col items-center justify-center py-20 text-center opacity-50">
              <Sparkles className="mb-4 h-12 w-12 text-orange-400" />
              <p className="text-lg font-medium">描述想做的菜、口味、现有食材</p>
              <p className="mt-2 text-sm">或上传教程截图、手写流程图，AI 帮你生成草稿</p>
            </div>
          )}

          {loadingAi || uploading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-orange-500">
                <Wand2 className="h-5 w-5 animate-pulse" />
                <span className="font-medium">{uploading ? '正在识别图片...' : 'AI 正在整理...'}</span>
              </div>
            </div>
          ) : null}

          {draftReply && !loadingAi && (
            <div className="space-y-2">
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-orange-500">AI 草稿输出</p>
              <div className="whitespace-pre-wrap text-base leading-relaxed text-gray-700">
                {draftReply}
              </div>
            </div>
          )}

          {job && !uploading && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-orange-600">
                  {job.status || 'draft'}
                </span>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-gray-500">
                  {job.stage || 'recognizing'}
                </span>
              </div>
              <h3 className="text-2xl font-black tracking-tight text-gray-900">
                {job.normalized_payload?.draft?.title || '已生成图片导入草稿'}
              </h3>
              <p className="text-sm leading-6 text-gray-500">
                {job.normalized_payload?.draft?.summary || '可以继续微调标题、步骤和用量，再决定是否正式保存到菜谱库。'}
              </p>
              {job.normalized_payload?.draft?.steps?.length ? (
                <ol className="grid gap-3">
                  {job.normalized_payload.draft.steps.map((step, index) => (
                    <li key={`${step.title ?? 'step'}-${index}`} className="rounded-2xl bg-white p-4 text-sm leading-6 text-gray-600 shadow-sm">
                      <strong className="mr-2 text-gray-900">{String(index + 1).padStart(2, '0')}</strong>
                      {step.title || step.description}
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          )}
        </div>
      </main>

      {/* Footer Input Area */}
      <footer className="shrink-0 border-t border-gray-200 bg-white p-3 pb-safe">
        <div className="mx-auto max-w-3xl">
          {/* Image Previews */}
          {previews.length > 0 && (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-2">
              {previews.map((preview, index) => (
                <div key={preview} className="relative h-16 w-16 shrink-0 rounded-lg border border-gray-200">
                  <img src={preview} alt="preview" className="h-full w-full rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(index)}
                    className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-white hover:bg-gray-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files) {
                  setFiles((current) => [...current, ...Array.from(e.target.files!)])
                }
                // Reset input value so the same file can be selected again
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition hover:bg-gray-200"
            >
              <ImageIcon className="h-6 w-6" />
            </button>

            <div className="relative flex-1">
              <textarea
                value={draftInput}
                onChange={(e) => setDraftInput(e.target.value)}
                placeholder={files.length > 0 ? "添加补充说明（可选）..." : "输入菜谱描述或长按语音..."}
                className="block w-full resize-none rounded-3xl border border-gray-200 bg-gray-50 py-3 pl-4 pr-12 text-sm leading-6 outline-none transition focus:border-orange-400 focus:bg-white"
                rows={Math.min(Math.max(draftInput.split('\n').length, 1), 5)}
                style={{ minHeight: '48px' }}
              />
              <div className="absolute bottom-1 right-1 flex items-center">
                {!draftInput.trim() && files.length === 0 ? (
                  <VoiceHoldButton
                    className="h-10 w-10 rounded-full bg-transparent text-gray-400 hover:bg-gray-100 hover:text-orange-500"
                    onTranscribed={(text) => setDraftInput((current) => `${current}\n${text}`.trim())}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => void askAi()}
                    disabled={loadingAi || uploading}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-white transition hover:bg-orange-600 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
