import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { VoiceHoldButton } from '../../components/media/VoiceHoldButton'
import {
  createKnowledgeBase,
  knowledgeDocumentRetryable,
  knowledgeDocStageLabel,
  listKnowledgeBases,
  listKnowledgeDocuments,
  queryKnowledgeBase,
  retryChatKnowledgeIngest,
  pollKnowledgeDocumentUntilSettled,
  reindexKnowledgeBase,
  uploadKnowledgeDocument,
  type ID,
  type KnowledgeBase,
  type KnowledgeDocument,
} from '../../lib/api/client'

export function KnowledgePage() {
  const [searchParams] = useSearchParams()
  const [bases, setBases] = useState<KnowledgeBase[]>([])
  const [selectedBaseId, setSelectedBaseId] = useState<ID>('')
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [name, setName] = useState('家庭菜谱知识库')
  const [description, setDescription] = useState('用于收集菜谱、步骤解释和家庭经验')
  const [question, setQuestion] = useState(searchParams.get('draft') ?? '')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<Array<{ title: string; snippet: string }>>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [retryingDocumentId, setRetryingDocumentId] = useState<ID>('')

  async function loadBases() {
    setLoading(true)
    try {
      const items = await listKnowledgeBases()
      setBases(items)
      if (!selectedBaseId && items[0]?.id) {
        setSelectedBaseId(items[0].id)
      }
    } finally {
      setLoading(false)
    }
  }

  async function loadDocuments(baseId: ID) {
    if (!baseId) {
      setDocuments([])
      return
    }
    const items = await listKnowledgeDocuments(baseId)
    setDocuments(items)
  }

  useEffect(() => {
    void loadBases()
  }, [])

  useEffect(() => {
    if (selectedBaseId) {
      void loadDocuments(selectedBaseId)
    }
  }, [selectedBaseId])

  async function handleCreateBase() {
    if (!name.trim()) {
      return
    }
    setBusy(true)
    try {
      const base = await createKnowledgeBase(name, description)
      setBases((current: KnowledgeBase[]) => [base, ...current])
      setSelectedBaseId(base.id)
    } finally {
      setBusy(false)
    }
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !selectedBaseId) {
      return
    }
    setBusy(true)
    try {
      await uploadKnowledgeDocument(selectedBaseId, file)
      await loadDocuments(selectedBaseId)
    } finally {
      setBusy(false)
      event.target.value = ''
    }
  }

  async function handleAsk() {
    if (!selectedBaseId || !question.trim()) {
      return
    }
    setBusy(true)
    try {
      const result = await queryKnowledgeBase(selectedBaseId, question)
      setAnswer(result.answer)
      setSources((result.sources ?? []).map((item: { title: string; snippet: string }) => ({ title: item.title, snippet: item.snippet })))
    } finally {
      setBusy(false)
    }
  }

  async function handleReindex() {
    if (!selectedBaseId) {
      return
    }
    setBusy(true)
    try {
      await reindexKnowledgeBase(selectedBaseId)
    } finally {
      setBusy(false)
    }
  }

  async function handleRetryDocument(document: KnowledgeDocument) {
    if (!selectedBaseId || !document.id || retryingDocumentId) {
      return
    }
    setRetryingDocumentId(document.id)
    setBusy(true)
    try {
      await retryChatKnowledgeIngest(document.id)
      await pollKnowledgeDocumentUntilSettled(selectedBaseId, document.id)
      await loadDocuments(selectedBaseId)
    } finally {
      setRetryingDocumentId('')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="rounded-[2.2rem] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-md)]">
          <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[var(--accent-strong)]">Knowledge Bases</p>
          <h2 className="mt-2 font-headline text-3xl font-black tracking-tight">家庭知识库</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">
            适合沉淀菜谱说明、调味经验、家庭口味偏好和引用片段。
          </p>

          <div className="mt-5 space-y-3 rounded-[1.6rem] bg-[var(--surface-soft)] p-4">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-[1rem] border border-[var(--line)] bg-white px-4 py-3 outline-none"
              placeholder="知识库名称"
            />
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="w-full rounded-[1rem] border border-[var(--line)] bg-white px-4 py-3 outline-none"
              placeholder="用途描述"
            />
            <button
              type="button"
              className="w-full rounded-[1rem] bg-[var(--primary)] px-4 py-3 font-bold text-white"
              onClick={() => void handleCreateBase()}
            >
              {busy ? '处理中...' : '新建知识库'}
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? <p className="text-sm text-[var(--text-soft)]">加载中...</p> : null}
            {bases.map((base) => (
              <button
                key={base.id}
                type="button"
                onClick={() => setSelectedBaseId(base.id)}
                className={[
                  'w-full rounded-[1.4rem] border px-4 py-4 text-left transition',
                  base.id === selectedBaseId
                    ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                    : 'border-[var(--line)] bg-white',
                ].join(' ')}
              >
                <p className="font-headline text-lg font-black tracking-tight">{base.name}</p>
                <p className="mt-1 text-sm leading-6 text-[var(--text-soft)]">{base.description}</p>
              </button>
            ))}
          </div>
        </aside>

        <div className="space-y-6">
          <section className="rounded-[2.2rem] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-md)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--accent-strong)]">Documents</p>
                <h3 className="mt-1 font-headline text-2xl font-black tracking-tight">文档与资料</h3>
              </div>
              <div className="flex flex-wrap gap-3">
                <label className="rounded-full bg-[var(--surface-soft)] px-4 py-2 text-sm font-bold text-[var(--text)]">
                  上传文档
                  <input className="hidden" type="file" accept=".txt,.md,.markdown,.pdf,.json,.xml,.docx" onChange={(event) => void handleUpload(event)} />
                </label>
                <button type="button" className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white" onClick={() => void handleReindex()}>
                  重新索引
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {documents.map((document) => (
                <article key={document.id} className="rounded-[1.6rem] bg-[var(--surface-soft)] p-4" data-selection-source={`knowledge-document-${document.id}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-headline text-xl font-black tracking-tight">{document.title}</h4>
                      <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        {knowledgeDocStageLabel(document.processing_stage, document.status)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-xs font-bold text-[var(--primary)]">{document.content_type || document.file_name}</span>
                      {knowledgeDocumentRetryable(document) ? (
                        <button
                          type="button"
                          disabled={busy || retryingDocumentId === document.id}
                          onClick={() => void handleRetryDocument(document)}
                          className="rounded-full bg-[var(--primary)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                        >
                          {retryingDocumentId === document.id ? '重试中...' : '直接重试'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">{document.summary || document.text_content || '等待解析内容。'}</p>
                </article>
              ))}
              {!documents.length ? <p className="text-sm text-[var(--text-soft)]">当前知识库还没有文档，可以先上传一份菜谱说明或截图整理稿。</p> : null}
            </div>
          </section>

          <section className="rounded-[2.2rem] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-md)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--primary)]">Knowledge QA</p>
                <h3 className="mt-1 font-headline text-2xl font-black tracking-tight">问知识库</h3>
              </div>
                <VoiceHoldButton onTranscribed={(text) => setQuestion((current: string) => `${current} ${text}`.trim())} />
            </div>

            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={5}
              className="mt-4 w-full rounded-[1.6rem] border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-4 outline-none"
              placeholder="问：这段步骤是什么意思？这份教程适合什么火候？"
              data-selection-source="knowledge-question"
            />
            <button
              type="button"
              className="mt-4 rounded-[1.2rem] bg-[var(--primary)] px-5 py-3 font-bold text-white shadow-[var(--shadow-md)]"
              onClick={() => void handleAsk()}
            >
              {busy ? '查询中...' : '开始问答'}
            </button>

            <div className="mt-5 rounded-[1.6rem] bg-[var(--surface-soft)] p-4" data-selection-source="knowledge-answer">
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--accent-strong)]">答案</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--text-soft)]">
                {answer || '选中某段文本后也可以直接引用问 AI，结果会结合当前页面上下文一起回答。'}
              </p>
            </div>

            {sources.length ? (
              <div className="mt-4 grid gap-3">
                {sources.map((source, index) => (
                  <article key={`${source.title}-${index}`} className="rounded-[1.4rem] border border-[var(--line)] bg-white p-4">
                    <p className="font-bold text-[var(--text)]">{source.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">{source.snippet}</p>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </div>
  )
}
