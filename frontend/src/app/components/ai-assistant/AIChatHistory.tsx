import Typography from 'antd/es/typography'
import { Plus, Trash2 } from 'lucide-react'
import type { AISessionSummary } from './types'

type AIChatHistoryProps = {
  sessions: AISessionSummary[]
  sessionsBusy: boolean
  activeSessionId: string | null
  isFullscreen: boolean
  onSelectSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onNewChat: () => void
}

export function AIChatHistory({
  sessions,
  sessionsBusy,
  activeSessionId,
  isFullscreen,
  onSelectSession,
  onDeleteSession,
  onNewChat,
}: AIChatHistoryProps) {
  return (
    <div
      className={`absolute inset-x-4 top-20 z-20 overflow-hidden rounded-2xl border border-gray-100 bg-white/95 shadow-lg backdrop-blur-md ${
        isFullscreen ? 'bottom-24' : ''
      }`}
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <Typography.Text strong className="text-gray-900">
            最近会话
          </Typography.Text>
          <div className="text-xs text-gray-400">服务器历史为准，本地仅保留最近缓存</div>
        </div>
        <button
          type="button"
          onClick={onNewChat}
          className="inline-flex items-center gap-1 rounded-full bg-orange-500 px-3 py-2 text-xs font-medium text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600"
        >
          <Plus className="h-3.5 w-3.5" />
          新会话
        </button>
      </div>
      <div className={`space-y-1 p-2 ${isFullscreen ? 'max-h-[calc(100dvh-180px)]' : 'max-h-[34vh]'} overflow-y-auto`}>
        {sessionsBusy ? <div className="px-3 py-2 text-xs text-gray-400">加载中…</div> : null}
        {!sessionsBusy && sessions.length === 0 ? (
          <div className="px-3 py-2 text-xs text-gray-400">还没有历史会话</div>
        ) : null}
        {!sessionsBusy && sessions.length > 0 ? (
          sessions.map((session) => {
            const active = activeSessionId === session.id
            return (
              <div
                key={session.id}
                className={`group flex items-center gap-2 rounded-2xl border px-3 py-2 transition-colors ${
                  active
                    ? 'border-orange-200 bg-orange-50'
                    : 'border-transparent bg-white hover:border-gray-100 hover:bg-gray-50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => void onSelectSession(session.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm font-medium text-gray-900">{session.title || '未命名对话'}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                    <span>{session.scene || 'assistant'}</span>
                  </div>
                </button>
                <button
                  type="button"
                  aria-label="删除会话"
                  onClick={(event) => {
                    event.stopPropagation()
                    void onDeleteSession(session.id)
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })
        ) : null}
      </div>
    </div>
  )
}
