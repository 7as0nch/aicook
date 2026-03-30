import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'

import { createAiSession, sendAiMessage } from '../../lib/api/client'
import { useAIWorkspaceStore } from '../../lib/state/ai-workspace'

export function QuoteDrawer() {
  const { quoteContext, quoteVisible, closeQuote } = useAIWorkspaceStore()
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState('')
  const [answers, setAnswers] = useState<string[]>([])

  useEffect(() => {
    if (!quoteVisible) {
      setPrompt('')
    }
  }, [quoteVisible])

  async function ensureSession() {
    if (sessionId) {
      return sessionId
    }
    const session = await createAiSession('quote', '全局引用问答')
    setSessionId(session.id)
    return session.id
  }

  async function submit() {
    if (!quoteContext.selected_text || !prompt.trim()) {
      return
    }

    setLoading(true)
    try {
      const id = await ensureSession()
      const result = await sendAiMessage(id, prompt, quoteContext)
      setAnswers((current) => [result.reply_content, ...current])
      setPrompt('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {quoteVisible ? (
        <motion.div
          className="fixed inset-0 z-50 bg-[rgba(20,23,17,0.35)] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeQuote}
        >
          <motion.aside
            className="absolute inset-x-0 bottom-0 rounded-t-[2rem] border border-white/40 bg-[color:rgba(250,249,245,0.98)] p-5 shadow-[var(--shadow-lg)] md:inset-y-4 md:right-4 md:left-auto md:w-[30rem] md:rounded-[2rem]"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.24 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="font-headline text-xs font-extrabold uppercase tracking-[0.25em] text-[var(--primary)]">Quote AI</p>
                <h3 className="font-headline text-2xl font-black tracking-tight text-[var(--text)]">
                  {quoteContext.selection_source || '当前页面选中内容'}
                </h3>
              </div>
              <button
                type="button"
                className="rounded-full bg-[var(--surface-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-soft)]"
                onClick={closeQuote}
              >
                关闭
              </button>
            </div>

            <blockquote className="mb-4 rounded-[1.5rem] bg-[var(--surface-soft)] p-4 text-sm leading-6 text-[var(--text-soft)]">
              {quoteContext.selected_text || '请先选中页面中的文字内容。'}
            </blockquote>

            <textarea
              rows={4}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="例如：这一步是什么意思？需要替换材料吗？帮我总结重点。"
              className="w-full rounded-[1.5rem] border border-[var(--line)] bg-white px-4 py-4 text-sm outline-none transition focus:border-[var(--primary)]"
            />

            <button
              type="button"
              className="mt-4 w-full rounded-[1.2rem] bg-[var(--primary)] px-4 py-4 font-headline text-lg font-extrabold text-white shadow-[var(--shadow-md)] transition hover:opacity-95"
              onClick={() => void submit()}
            >
              {loading ? 'AI 正在整理答案...' : '发送给 AI'}
            </button>

            <div className="hide-scrollbar mt-4 grid max-h-[36vh] gap-3 overflow-y-auto pr-1">
              {answers.map((answer, index) => (
                <article key={`${answer.slice(0, 24)}-${index}`} className="rounded-[1.5rem] bg-white p-4 text-sm leading-6 text-[var(--text)] shadow-[var(--shadow-md)]">
                  {answer}
                </article>
              ))}
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
