import { ArrowLeft, ChevronDown, ChevronRight, Database, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  knowledgeDocumentRetryable,
  createKnowledgeBase,
  knowledgeDocStageLabel,
  listHouseholdAIMemories,
  listKnowledgeBases,
  listKnowledgeDocuments,
  pollKnowledgeDocumentUntilSettled,
  retryChatKnowledgeIngest,
  type HouseholdAIMemory,
  type KnowledgeBase,
  type KnowledgeDocument,
  uploadKnowledgeDocument,
} from '../../lib/api/client'

export default function KnowledgeBasePage() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [bases, setBases] = useState<KnowledgeBase[]>([])
  const [selectedBaseId, setSelectedBaseId] = useState<string>('')
  const [docsByBase, setDocsByBase] = useState<Record<string, KnowledgeDocument[]>>({})
  const [memories, setMemories] = useState<HouseholdAIMemory[]>([])
  const [memOpen, setMemOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadStage, setUploadStage] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [retryingDocId, setRetryingDocId] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await listKnowledgeBases()
      setBases(list)
      setSelectedBaseId((prev) => {
        if (prev && list.some((b) => b.id === prev)) return prev
        return list[0]?.id ?? ''
      })
      const next: Record<string, KnowledgeDocument[]> = {}
      await Promise.all(
        list.map(async (b) => {
          next[b.id] = await listKnowledgeDocuments(b.id)
        }),
      )
      setDocsByBase(next)
      try {
        setMemories(await listHouseholdAIMemories())
      } catch {
        setMemories([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function onCreateDefault() {
    setCreateBusy(true)
    try {
      await createKnowledgeBase('家庭知识库', '家庭资料与笔记')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败')
    } finally {
      setCreateBusy(false)
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const baseId = selectedBaseId
    if (!file || !baseId) return
    setUploadBusy(true)
    setUploadStage('上传文件…')
    setError('')
    try {
      const created = await uploadKnowledgeDocument(baseId, file)
      setUploadStage(knowledgeDocStageLabel(created.processing_stage, created.status))
      await pollKnowledgeDocumentUntilSettled(baseId, created.id, (label) => setUploadStage(label))
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploadBusy(false)
      setUploadStage('')
    }
  }

  async function onRetryDocument(doc: KnowledgeDocument) {
    if (!selectedBaseId || !doc.id || retryingDocId) return
    setRetryingDocId(doc.id)
    setUploadBusy(true)
    setUploadStage('准备重试…')
    setError('')
    try {
      await retryChatKnowledgeIngest(doc.id)
      await pollKnowledgeDocumentUntilSettled(selectedBaseId, doc.id, (label) => setUploadStage(label), { intervalMs: 800, maxTicks: 450 })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '重试失败')
    } finally {
      setRetryingDocId('')
      setUploadBusy(false)
      setUploadStage('')
    }
  }

  const totalDocs = Object.values(docsByBase).reduce((n, a) => n + a.length, 0)
  const selectedBase = bases.find((b) => b.id === selectedBaseId)
  const docs = selectedBaseId ? (docsByBase[selectedBaseId] ?? []) : []

  return (
    <div
      className="min-h-[100dvh] pb-24"
      style={{ background: 'var(--bg, #faf9f5)', color: 'var(--text, #1b1c1a)' }}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.txt,.md,.markdown,.json,.xml,.docx,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(ev) => void onFile(ev)}
      />

      <header
        className="sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3"
        style={{ borderColor: 'var(--line, #d8d7d3)', background: 'var(--surface, #fff)' }}
      >
        <button type="button" onClick={() => navigate(-1)} className="rounded-lg p-2" style={{ color: 'var(--text-soft)' }}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Database className="h-5 w-5 shrink-0" style={{ color: 'var(--color-tertiary, #944a00)' }} />
          <h1 className="truncate text-base font-bold">家庭知识库</h1>
        </div>
      </header>

      <div className="px-4 py-3 space-y-5">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-soft)' }}>
          文档与 PDF 会进入当前厨房（Household）的知识库，厨艺助理可通过工具读取；你在助理里说「记住……」也会写入长期记忆。
        </p>

        {loading ? (
          <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            加载中…
          </p>
        ) : error ? (
          <p className="text-center text-sm text-red-600">{error}</p>
        ) : (
          <>
            <section className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded-full px-3 py-1 text-xs font-semibold"
                  style={{
                    background: 'color-mix(in srgb, var(--color-tertiary-container, #ed8328) 35%, transparent)',
                    color: 'var(--color-on-tertiary-container, #572900)',
                  }}
                >
                  {bases.length} 个库 · {totalDocs} 个文档
                </span>
                {uploadBusy && uploadStage && (
                  <span className="text-xs" style={{ color: 'var(--color-tertiary, #944a00)' }}>
                    {uploadStage}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  上传到
                </label>
                <select
                  value={selectedBaseId}
                  onChange={(e) => setSelectedBaseId(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
                  disabled={bases.length === 0}
                >
                  {bases.length === 0 ? <option value="">暂无知识库</option> : null}
                  {bases.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={uploadBusy || !selectedBaseId}
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: 'var(--color-tertiary-container, #ed8328)' }}
                >
                  <Upload className="h-4 w-4" />
                  {uploadBusy ? '处理中…' : '上传文件'}
                </button>
                <button
                  type="button"
                  disabled={createBusy}
                  onClick={() => void onCreateDefault()}
                  className="rounded-xl border px-4 py-2.5 text-sm font-medium"
                  style={{ borderColor: 'var(--line)', color: 'var(--text)' }}
                >
                  {createBusy ? '创建中…' : '新建知识库'}
                </button>
              </div>
            </section>

            <button
              type="button"
              onClick={() => setMemOpen(!memOpen)}
              className="flex w-full items-center justify-between border-b py-2 text-left text-sm font-semibold"
              style={{ borderColor: 'var(--line)', color: 'var(--text)' }}
            >
              长期记忆（{memories.length}）
              {memOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {memOpen && (
              <ul className="space-y-3 border-b pb-4" style={{ borderColor: 'var(--line)' }}>
                {memories.length === 0 ? (
                  <li className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    暂无记忆。在厨艺助理中说「帮我记住我不吃香菜」等即可自动保存。
                  </li>
                ) : (
                  memories.map((m) => (
                    <li key={m.id} className="text-sm leading-snug">
                      <span
                        className="mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                        style={{
                          background: 'color-mix(in srgb, var(--color-tertiary-container, #ed8328) 25%, transparent)',
                          color: 'var(--color-on-tertiary-container, #572900)',
                        }}
                      >
                        {m.scope}
                      </span>
                      {m.content}
                    </li>
                  ))
                )}
              </ul>
            )}

            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                当前库文档
              </h2>
              {!selectedBase ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  请先新建知识库。
                </p>
              ) : (
                <>
                  <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {selectedBase.name} · {selectedBase.description || '—'}
                  </p>
                  {docs.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      暂无文档，上传 PDF 或文本文档即可解析入库。
                    </p>
                  ) : (
                    <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
                      {docs.map((doc) => (
                        <li key={doc.id} className="flex flex-col gap-0.5 py-3 first:pt-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="font-medium">{doc.title || doc.file_name}</div>
                            {knowledgeDocumentRetryable(doc) ? (
                              <button
                                type="button"
                                disabled={uploadBusy || retryingDocId === doc.id}
                                onClick={() => void onRetryDocument(doc)}
                                className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                                style={{ background: 'var(--color-tertiary, #944a00)' }}
                              >
                                {retryingDocId === doc.id ? '重试中…' : '直接重试'}
                              </button>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                            <span>{doc.status}</span>
                            {doc.processing_stage ? (
                              <span>{knowledgeDocStageLabel(doc.processing_stage, doc.status)}</span>
                            ) : null}
                            {typeof doc.chunk_count === 'number' && doc.chunk_count > 0 ? (
                              <span>{doc.chunk_count} 片段</span>
                            ) : null}
                            <span>{doc.content_type}</span>
                          </div>
                          {(doc.summary || doc.text_content) && (
                            <p className="line-clamp-2 text-xs" style={{ color: 'var(--text-soft)' }}>
                              {doc.summary || doc.text_content?.slice(0, 160)}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>

            {bases.length > 1 && (
              <section className="border-t pt-4" style={{ borderColor: 'var(--line)' }}>
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  全部知识库
                </h2>
                <ul className="space-y-2">
                  {bases.map((b) => (
                    <li key={b.id} className="flex items-center justify-between text-sm">
                      <button
                        type="button"
                        className="truncate text-left font-medium underline-offset-2 hover:underline"
                        style={{ color: b.id === selectedBaseId ? 'var(--color-tertiary, #944a00)' : 'var(--text)' }}
                        onClick={() => setSelectedBaseId(b.id)}
                      >
                        {b.name}
                      </button>
                      <span className="shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {(docsByBase[b.id] ?? []).length} 文档
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
