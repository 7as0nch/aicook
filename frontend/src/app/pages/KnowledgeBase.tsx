import {
  ArrowLeft,
  FileText,
  Link as LinkIcon,
  Database,
  Upload,
  Sparkles,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  createKnowledgeBase,
  listKnowledgeBases,
  listKnowledgeDocuments,
  uploadKnowledgeDocument,
  type KnowledgeBase,
  type KnowledgeDocument,
} from '../../lib/api/client'

export default function KnowledgeBasePage() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [bases, setBases] = useState<KnowledgeBase[]>([])
  const [docsByBase, setDocsByBase] = useState<Record<string, KnowledgeDocument[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploadBusy, setUploadBusy] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const list = await listKnowledgeBases()
      setBases(list)
      const next: Record<string, KnowledgeDocument[]> = {}
      await Promise.all(
        list.map(async (b) => {
          next[b.id] = await listKnowledgeDocuments(b.id)
        }),
      )
      setDocsByBase(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function onCreateDefault() {
    setCreateBusy(true)
    try {
      await createKnowledgeBase('家庭知识库', '从 App 创建')
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
    const baseId = bases[0]?.id
    if (!file || !baseId) return
    setUploadBusy(true)
    try {
      await uploadKnowledgeDocument(baseId, file)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploadBusy(false)
    }
  }

  const totalDocs = Object.values(docsByBase).reduce((n, a) => n + a.length, 0)

  return (
    <div className="min-h-[100dvh] bg-gray-50 pb-20">
      <input ref={fileRef} type="file" className="hidden" onChange={(ev) => void onFile(ev)} />

      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white p-4 shadow-sm">
        <button type="button" onClick={() => navigate(-1)} className="-ml-2 p-2 text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <Database className="h-5 w-5 text-indigo-500" />
          AI 知识库
        </h1>
        <div className="w-9" />
      </div>

      <div className="space-y-4 p-4">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 p-5 text-white shadow-md">
          <Sparkles className="absolute right-[-10px] top-[-10px] h-24 w-24 text-white/10" />
          <h2 className="relative z-10 mb-1 text-lg font-bold">让 AI 更懂你的家</h2>
          <p className="relative z-10 text-sm leading-relaxed text-white/80">
            数据来自后端 <code className="rounded bg-white/10 px-1">/api/v1/knowledge-bases</code>；无知识库时可先创建默认库再上传文件。
          </p>
          <div className="relative z-10 mt-4 flex gap-2">
            <button
              type="button"
              disabled={uploadBusy || !bases[0]}
              onClick={() => fileRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/20 py-2 text-sm font-medium transition-colors hover:bg-white/30 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" /> {uploadBusy ? '上传中…' : '上传文件'}
            </button>
            <button
              type="button"
              disabled={createBusy}
              onClick={() => void onCreateDefault()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/20 py-2 text-sm font-medium transition-colors hover:bg-white/30 disabled:opacity-50"
            >
              <LinkIcon className="h-4 w-4" /> {createBusy ? '创建中…' : '新建知识库'}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="py-8 text-center text-gray-500">加载中…</p>
        ) : error ? (
          <p className="py-8 text-center text-red-600">{error}</p>
        ) : (
          <>
            <h3 className="mt-6 px-1 text-sm font-bold text-gray-500">
              知识库 ({bases.length}) · 文档 {totalDocs}
            </h3>
            {bases.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
                暂无知识库，点击上方「新建知识库」。
              </p>
            ) : (
              <div className="space-y-4">
                {bases.map((base) => {
                  const docs = docsByBase[base.id] ?? []
                  return (
                    <div key={base.id} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                      <div className="border-b border-gray-100 bg-gray-50/80 px-4 py-3">
                        <h4 className="font-bold text-gray-900">{base.name}</h4>
                        <p className="mt-1 line-clamp-2 text-xs text-gray-500">{base.description || '—'}</p>
                        <span className="mt-2 inline-block rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                          {base.status}
                        </span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {docs.length === 0 ? (
                          <div className="p-4 text-sm text-gray-400">暂无文档</div>
                        ) : (
                          docs.map((doc) => (
                            <div key={doc.id} className="flex gap-4 p-4">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
                                <FileText className="h-5 w-5" />
                              </div>
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="truncate font-bold text-gray-900">{doc.title || doc.file_name}</div>
                                <p className="line-clamp-2 text-xs text-gray-500">{doc.summary || doc.text_content?.slice(0, 120) || doc.status}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
