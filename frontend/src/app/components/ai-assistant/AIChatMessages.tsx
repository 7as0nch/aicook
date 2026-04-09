import React, { useState } from 'react'
import { Bubble, Welcome, Think, ThoughtChain, Sources } from '@ant-design/x'
import { Button } from 'antd'
import {
  X,
  Image as ImageIcon,
  ChefHat,
  Clock,
  Check,
  FileText,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { formatMessageTime } from '../../../lib/utils/time'
import { VoiceMessageBar } from '../../../components/media/VoiceMessageBar'
import { MarkdownBlock } from './MarkdownBlock'
import { knowledgeHitBadge, isWelcomePlaceholder } from './helpers'
import type { Message, AIApprovalOption, AIPendingApproval, AISessionSummary } from './types'
import { WELCOME } from './types'

function getToolDisplayName(name: string) {
  if (name === 'web_search' || name === 'native_web_search') return '网页搜索'
  if (name === 'knowledge_lookup') return '知识库检索'
  if (name === 'recipe_query') return '菜谱查询'
  if (name === 'image_recipe_create') return '图文识别'
  return name
}

/**
 * 与后端 graph 步骤状态对齐：running 才用 loading 动画；done/success 勾；error 叉；
 * skipped/blocked/空等用 abort（Ant Design X 为灰色减号，表示未执行或中性结束）。
 */
function traceToThoughtStatus(status: string | undefined): 'loading' | 'success' | 'error' | 'abort' {
  const s = (status ?? '').trim().toLowerCase()
  if (!s) return 'abort'
  if (['done', 'success', 'completed', 'finished', 'ok', 'succeeded'].includes(s)) return 'success'
  if (['error', 'failed', 'fail', 'blocked'].includes(s)) return 'error'
  if (['running', 'start', 'started', 'in_progress'].includes(s)) return 'loading'
  return 'abort'
}

function buildThoughtItems(msg: Message, visibleAgentTrace: NonNullable<Message['agentTrace']>) {
  const items: Array<{
    key: string
    title: React.ReactNode
    description?: React.ReactNode
    status?: 'loading' | 'success' | 'error' | 'abort'
  }> = []
  for (const step of msg.workflow ?? []) {
    items.push({
      key: `wf-${step.id}`,
      title: step.title,
      description: step.detail ? <span className="whitespace-pre-line text-gray-500">{step.detail}</span> : undefined,
      status: traceToThoughtStatus(step.status),
    })
  }
  for (const t of visibleAgentTrace) {
    items.push({
      key: t.id,
      title: t.name ?? 'Agent',
      description: t.detail,
      status: traceToThoughtStatus(t.status),
    })
  }
  return items
}

function knowledgeSourceItems(msg: Message): Array<{ key: React.Key; title: React.ReactNode; description?: React.ReactNode; url?: string }> {
  const tool = msg.toolCalls?.find((t) => t.name === 'knowledge_lookup' && t.result)
  if (!tool?.result) return []
  try {
    const parsed = JSON.parse(tool.result) as { results?: Array<{ title?: string; snippet?: string; document_id?: string; source_kind?: string }> }
    if (!Array.isArray(parsed.results) || parsed.results.length === 0) return []
    return parsed.results.map((res, i) => {
      const hit = knowledgeHitBadge(res.source_kind)
      return {
        key: i,
        title: (
          <span className="flex flex-wrap items-center gap-2">
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${hit.className}`}>{hit.label}</span>
            <span>{res.title || '（无标题）'}</span>
          </span>
        ),
        description: res.snippet,
        url: res.document_id?.startsWith('http') ? res.document_id : undefined,
      }
    })
  } catch {
    return []
  }
}

type CitationSourceRow = NonNullable<Message['sources']>[number]

function resolveCitationSource(msg: Message, rawIndex: number): CitationSourceRow | undefined {
  const tryPick = (rows: CitationSourceRow[] | undefined) => {
    if (!rows?.length) return undefined
    if (rawIndex >= 0 && rawIndex < rows.length) return rows[rawIndex]
    const j = rawIndex - 1
    if (j >= 0 && j < rows.length) return rows[j]
    return undefined
  }
  return tryPick(msg.sources) ?? tryPick(msg.searchResults)
}

function isCookingPageContext(value: unknown): value is { type?: string; recipe?: string } {
  return typeof value === 'object' && value !== null && 'type' in value
}

export type AIChatMessagesProps = {
  messages: Message[]
  activeStreamingAssistantIndex: number
  sendBusy: boolean
  detailMessage: { title: string; content: string } | null
  setDetailMessage: React.Dispatch<React.SetStateAction<{ title: string; content: string } | null>>
  pageContext: unknown
  activeSessionId: string | null
  continueSessionPrompt: AISessionSummary | null
  setContinueSessionPrompt: React.Dispatch<React.SetStateAction<AISessionSummary | null>>
  loadSessionHistory: (sessionId: string, closePanel?: boolean) => void
  loadingMoreMessages: boolean
  hasMoreMessages: boolean
  loadMoreSentinelRef: React.RefObject<HTMLDivElement>
  /** Wrapper around all nodes above Bubble.List; used to preserve scroll when this block’s height changes. */
  messagesTopChromeRef: React.RefObject<HTMLDivElement>
  messageListRef: React.RefObject<HTMLDivElement>
  messageEndRef: React.RefObject<HTMLDivElement>
  streamingContentRef: React.RefObject<HTMLDivElement>
  streamingReasoningRef: React.RefObject<HTMLDivElement>
  historyBusy: boolean
  toggleReasoning: (index: number) => void
  toggleContentCollapsed: (index: number) => void
  toggleToolList: (index: number) => void
  toggleSearchResults: (index: number) => void
  toggleToolCall: (index: number, toolIndex: number) => void
  onApprovalSelect: (approval: AIPendingApproval, option: AIApprovalOption | AIApprovalOption[]) => void | Promise<void>
  onSaveRecipe: (msgIndex: number, recipe?: Message['recipeData']) => void | Promise<void>
  savedRecipes: string[]
  savingRecipeKeys: string[]
  formatSessionTime: (value?: string) => string
  getVisibleAgentTrace: (items: Message['agentTrace']) => NonNullable<Message['agentTrace']>
}

function renderAssistantBody(
  msg: Message,
  idx: number,
  isStreamingMessage: boolean,
  streamingContentRef: React.RefObject<HTMLDivElement>,
  toggleContentCollapsed: (i: number) => void,
  setDetailMessage: AIChatMessagesProps['setDetailMessage'],
  onCitationClick: (citationIndex: number) => void,
) {
  const hasContent = msg.content.trim().length > 0
  if (!hasContent) return null

  const useStreamingWindow = isStreamingMessage
  const useCollapsedWindow = !isStreamingMessage && msg.contentExpandable
  const contentContainerClass = useCollapsedWindow && msg.contentCollapsed
      ? 'max-h-44 overflow-hidden'
      : ''
  const isIngestNotice = msg.kind === 'knowledge_ingest_notice'

  return (
    <div className="w-full">
      {isIngestNotice ? <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-amber-800/80">资料库</div> : null}
      <div
        ref={useStreamingWindow ? streamingContentRef : undefined}
        className={`rounded-2xl px-4 py-3 text-[15px] leading-relaxed rounded-tl-sm border text-gray-800 shadow-sm ${
          isIngestNotice ? 'border-amber-100 bg-amber-50/90' : 'border-gray-100 bg-white'
        } ${contentContainerClass}`}
      >
        <MarkdownBlock content={msg.content} streaming={useStreamingWindow} onCitationClick={onCitationClick} />
      </div>
      {useCollapsedWindow && msg.contentCollapsed ? (
        <div className="-mt-12 h-12 rounded-b-2xl bg-linear-to-t from-white via-white/95 to-transparent" />
      ) : null}
      {useStreamingWindow || useCollapsedWindow ? (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-400">
          <div>{useStreamingWindow ? '生成中，窗口会跟随最新内容' : null}</div>
          {useCollapsedWindow ? (
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                aria-label={msg.contentCollapsed ? '展开全文' : '收起全文'}
                onClick={() => toggleContentCollapsed(idx)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
              >
                {msg.contentCollapsed ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                aria-label="详细查看"
                onClick={() => setDetailMessage({ title: '完整回答', content: msg.content })}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function hasRenderableAssistantPayload(msg: Message) {
  if (msg.content.trim()) return true
  if ((msg.reasoning?.content ?? '').trim()) return true
  if ((msg.workflow ?? []).length > 0) return true
  if ((msg.agentTrace ?? []).length > 0) return true
  if ((msg.toolCalls ?? []).length > 0) return true
  if ((msg.searchResults ?? []).length > 0) return true
  if (msg.searchError) return true
  if (msg.recipeData) return true
  if (msg.approval || msg.approvalResolved) return true
  return false
}

export function AIChatMessages({
  messages,
  activeStreamingAssistantIndex,
  sendBusy,
  detailMessage,
  setDetailMessage,
  pageContext,
  activeSessionId,
  continueSessionPrompt,
  setContinueSessionPrompt,
  loadSessionHistory,
  loadingMoreMessages,
  hasMoreMessages,
  loadMoreSentinelRef,
  messagesTopChromeRef,
  messageListRef,
  messageEndRef,
  streamingContentRef,
  streamingReasoningRef,
  historyBusy,
  toggleReasoning,
  toggleContentCollapsed,
  toggleToolList,
  toggleSearchResults,
  toggleToolCall,
  onApprovalSelect,
  onSaveRecipe,
  savedRecipes,
  savingRecipeKeys,
  formatSessionTime,
  getVisibleAgentTrace,
}: AIChatMessagesProps) {
  const [citationDetail, setCitationDetail] = useState<{ index: number; source: CitationSourceRow } | null>(null)
  const [approvalSelections, setApprovalSelections] = useState<Record<string, string[]>>({})
  const cookingPageContext = isCookingPageContext(pageContext) ? pageContext : null
  const items = messages.map((msg, idx) => {
    if (isWelcomePlaceholder(msg, WELCOME.content)) {
      return {
        key: 'welcome',
        role: 'system' as const,
        content: (
          <Welcome variant="borderless" title="厨艺助理" description={msg.content} />
        ),
      }
    }

    const visibleAgentTrace = getVisibleAgentTrace(msg.agentTrace)
    const thoughtItems = buildThoughtItems(msg, visibleAgentTrace)
    const srcItems = knowledgeSourceItems(msg)
    const searchResultItems = msg.searchResults ?? []
    const approvalSelectedIds = msg.approval?.id
      ? (approvalSelections[msg.approval.id] ?? msg.approval.selected_option_ids ?? [])
      : []
    const hasNativeSearchResults = searchResultItems.length > 0 || Boolean(msg.searchError)
    const visibleSearchItems = searchResultItems.slice(0, 4)
    const searchCardTitle = searchResultItems.length > 0
      ? `联网搜索结果 ${searchResultItems.length} 条`
      : (msg.searchError?.includes('未开启网页搜索') ? '网页搜索未开启' : '网页搜索结果')

    const column =
      msg.role === 'user' ? (
        <div className="flex w-full min-w-0 max-w-full flex-col gap-2">
          {(() => {
            const audioItems = msg.attachments?.filter((a) => a.kind === 'audio') ?? []
            const hasUserAudio = audioItems.length > 0
            const transcript = msg.content.trim()
            if (hasUserAudio) {
              return (
                <div className="flex max-w-[min(100%,320px)] flex-col items-end gap-2 self-end">
                  {audioItems.map((item, aidx) => (
                    <VoiceMessageBar
                      key={`${item.url ?? item.name}-${aidx}`}
                      src={item.url}
                      label={item.name}
                      assetId={item.assetId}
                      fallbackText={transcript}
                    />
                  ))}
                  {transcript ? <p className="max-w-full px-1 text-left text-xs leading-relaxed text-gray-500">{transcript}</p> : null}
                </div>
              )
            }
            return (
              <div className="rounded-2xl rounded-tr-sm bg-gray-900 px-4 py-3 text-[15px] leading-relaxed text-white">
                <MarkdownBlock content={msg.content} />
              </div>
            )
          })()}
          {visibleAgentTrace.length ? (
            <ThoughtChain
              items={visibleAgentTrace.map((item) => ({
                key: item.id,
                title: item.detail || item.name,
                status: traceToThoughtStatus(item.status),
                collapsible: true,
              }))}
              defaultExpandedKeys={[]}
            />
          ) : null}
          {msg.attachments?.filter((item) => !(msg.role === 'user' && item.kind === 'audio')).length ? (
            <div className="flex flex-wrap justify-end gap-2 self-end">
              {msg.attachments
                .filter((item) => !(msg.role === 'user' && item.kind === 'audio'))
                .map((item, attachmentIdx) =>
                  item.kind === 'image' ? (
                    <div key={`${item.name}-${attachmentIdx}`} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                      {item.previewUrl || item.url ? (
                        <img src={item.previewUrl ?? item.url} alt={item.name} className="h-20 w-20 object-cover" />
                      ) : (
                        <div className="flex h-20 w-20 items-center justify-center bg-gray-100 text-gray-400">
                          <ImageIcon className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                  ) : item.kind === 'audio' ? (
                    <div key={`${item.name}-${attachmentIdx}`} className="w-full max-w-xs">
                      <VoiceMessageBar src={item.url} label={item.name} assetId={item.assetId} fallbackText={msg.content} />
                    </div>
                  ) : (
                    <div
                      key={`${item.name}-${attachmentIdx}`}
                      className="flex items-center gap-2 rounded-2xl border border-gray-100 bg-white px-3 py-2 text-xs text-gray-600 shadow-sm"
                    >
                      <FileText className="h-4 w-4 text-gray-400" />
                      <span className="max-w-36 truncate">{item.name}</span>
                    </div>
                  ),
                )}
            </div>
          ) : null}
          {msg.createdAt ? (
            <span className="self-end px-1 text-[10px] leading-none text-gray-400 tabular-nums">{formatMessageTime(msg.createdAt)}</span>
          ) : null}
        </div>
      ) : (
        <div className="flex w-full min-w-0 max-w-full flex-col gap-2">
          {msg.reasoning ? (
            <Think
              title="思考过程"
              expanded={!msg.reasoning.collapsed}
              onExpand={() => toggleReasoning(idx)}
              loading={idx === activeStreamingAssistantIndex && !(msg.reasoning.content || '').trim()}
            >
              <div className="relative w-full min-w-0">
                <div
                  ref={idx === activeStreamingAssistantIndex ? streamingReasoningRef : undefined}
                  className="max-h-48 overflow-y-auto text-xs leading-6 text-gray-600 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  <MarkdownBlock
                    content={msg.reasoning.content || '思考中...'}
                    streaming={idx === activeStreamingAssistantIndex}
                    onCitationClick={(citationRaw) => {
                      const source = resolveCitationSource(msg, citationRaw)
                      if (source) setCitationDetail({ index: citationRaw, source })
                    }}
                  />
                </div>
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 z-1 h-8 bg-linear-to-b from-gray-50 to-transparent"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 z-1 h-8 bg-linear-to-t from-gray-50 to-transparent"
                />
              </div>
            </Think>
          ) : null}

          {renderAssistantBody(
            msg,
            idx,
            idx === activeStreamingAssistantIndex,
            streamingContentRef,
            toggleContentCollapsed,
            setDetailMessage,
            (citationRaw) => {
              const source = resolveCitationSource(msg, citationRaw)
              if (source) setCitationDetail({ index: citationRaw, source })
            },
          )}

          {srcItems.length > 0 ? (
            <Sources title="引用资料" items={srcItems} defaultExpanded className="max-w-full" />
          ) : null}

          {(() => {
            const hasTools = Boolean(msg.toolCalls?.length)
            const hasThought = thoughtItems.length > 0
            const hasSearch = hasNativeSearchResults
            if (!hasTools && !hasThought && !hasSearch) return null

            const tools = msg.toolCalls ?? []
            const runningTool = hasTools ? tools.find((t) => t.status === 'start' || t.status === 'running') : undefined
            const allDone = hasTools && tools.every((t) => t.status === 'success' || t.status === 'error')
            const thoughtChainEl =
              hasThought ? (
                <ThoughtChain
                  items={thoughtItems.map((t) => ({
                    key: t.key,
                    title: t.title,
                    description: t.description,
                    status: t.status,
                    collapsible: true,
                  }))}
                  defaultExpandedKeys={[]}
                  className="mb-2"
                />
              ) : null

            return (
              <div className="w-full space-y-1">
                {(() => {
                  if (runningTool && !msg.toolsExpanded) {
                    return (
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
                        <span className="animate-pulse">正在{getToolDisplayName(runningTool.name)}...</span>
                      </div>
                    )
                  }

                  const showCollapsedSummary =
                    !msg.toolsExpanded && ((hasTools && allDone) || (!hasTools && hasThought) || hasSearch)

                  if (showCollapsedSummary) {
                    return (
                      <button
                        type="button"
                        onClick={() => toggleToolList(idx)}
                        className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600"
                      >
                        {hasTools && allDone ? <Check className="h-3 w-3 text-emerald-500" /> : <ChevronDown className="h-3 w-3 text-gray-400" />}
                          <span>
                            {hasTools && allDone
                            ? `已完成 ${tools.length} 项操作${hasThought ? ` · ${thoughtItems.length} 步工作流` : ''}${hasSearch ? ` · ${searchCardTitle}` : ''}`
                            : `执行过程（${thoughtItems.length} 步${hasSearch ? ` · ${searchCardTitle}` : ''})`}
                        </span>
                        {hasSearch ? (
                          <span className="ml-1 flex items-center -space-x-1">
                            {visibleSearchItems.map((item, logoIdx) =>
                              item.logoUrl ? (
                                <img key={`logo-${logoIdx}`} src={item.logoUrl} alt="" className="h-4 w-4 rounded-full border border-white object-cover bg-white" />
                              ) : (
                                <span key={`logo-${logoIdx}`} className="flex h-4 w-4 items-center justify-center rounded-full border border-white bg-orange-100 text-[9px] text-orange-700">
                                  {(item.siteName || item.title || 'S').slice(0, 1)}
                                </span>
                              ),
                            )}
                            {searchResultItems.length > visibleSearchItems.length ? <span className="ml-1 text-[10px] text-gray-400">…</span> : null}
                          </span>
                        ) : null}
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    )
                  }

                  return (
                    <div className="space-y-1">
                      {(hasTools && allDone) || (!hasTools && hasThought) ? (
                        <button
                          type="button"
                          onClick={() => toggleToolList(idx)}
                          className="mb-1 flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600"
                        >
                          {hasTools && allDone ? <Check className="h-3 w-3 text-emerald-500" /> : null}
                          <span>
                            {hasTools && allDone
                              ? `已完成 ${tools.length} 项操作${hasThought ? ` · ${thoughtItems.length} 步工作流` : ''}${hasSearch ? ` · ${searchCardTitle}` : ''}`
                              : `执行过程（${thoughtItems.length} 步${hasSearch ? ` · ${searchCardTitle}` : ''})`}
                          </span>
                          <ChevronUp className="h-3 w-3" />
                        </button>
                      ) : null}
                      {hasSearch ? (
                        <div className="overflow-hidden rounded-2xl bg-gray-100/50">
                          <button
                            type="button"
                            onClick={() => toggleSearchResults(idx)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] text-gray-500 hover:text-gray-700"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="font-medium">{searchCardTitle}</span>
                              <span className="flex items-center -space-x-1">
                                {visibleSearchItems.map((item, logoIdx) =>
                                  item.logoUrl ? (
                                    <img key={`search-logo-${logoIdx}`} src={item.logoUrl} alt="" className="h-5 w-5 rounded-full border border-white object-cover bg-white" />
                                  ) : (
                                    <span key={`search-logo-${logoIdx}`} className="flex h-5 w-5 items-center justify-center rounded-full border border-white bg-orange-100 text-[9px] text-orange-700">
                                      {(item.siteName || item.title || 'S').slice(0, 1)}
                                    </span>
                                  ),
                                )}
                                {searchResultItems.length > visibleSearchItems.length ? <span className="ml-1 text-[10px] text-gray-400">…</span> : null}
                              </span>
                            </div>
                            {msg.searchResultsExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                          {msg.searchResultsExpanded ? (
                            <div className="max-h-56 overflow-y-auto border-t border-gray-200/50 px-3 py-2 text-xs leading-6 text-gray-600">
                              <div className="space-y-3">
                                {searchResultItems.map((item, sourceIdx) => (
                                  <div key={`search-item-${sourceIdx}`} className="flex gap-3 border-b border-gray-200/40 pb-2 last:border-0 last:pb-0">
                                    {item.logoUrl ? (
                                      <img src={item.logoUrl} alt="" className="mt-0.5 h-6 w-6 shrink-0 rounded-full object-cover" />
                                    ) : (
                                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[10px] font-medium text-orange-700">
                                        {(item.siteName || item.title || 'S').slice(0, 1)}
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700">
                                          citation:{sourceIdx + 1}
                                        </span>
                                        {item.documentId?.startsWith('http') ? (
                                          <a href={item.documentId} target="_blank" rel="noreferrer" className="font-medium text-orange-600 hover:underline">
                                            {item.title || item.siteName || '参考来源'}
                                          </a>
                                        ) : (
                                          <div className="font-medium text-gray-800">{item.title || item.siteName || '参考来源'}</div>
                                        )}
                                        {item.siteName ? <span className="text-[10px] text-gray-400">{item.siteName}</span> : null}
                                        {item.publishTime ? <span className="text-[10px] text-gray-400">{item.publishTime}</span> : null}
                                      </div>
                                      {item.snippet ? <div className="line-clamp-4 text-gray-500">{item.snippet}</div> : null}
                                    </div>
                                  </div>
                                ))}
                                {msg.searchError ? (
                                  <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                                    搜索链路提示：{msg.searchError}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {thoughtChainEl}
                      {hasTools
                        ? tools.map((toolCall, toolIdx) => (
                            <div key={`${toolCall.name}-${toolIdx}`} className="overflow-hidden rounded-2xl bg-gray-100/50">
                        <button
                          type="button"
                          onClick={() => toggleToolCall(idx, toolIdx)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] text-gray-500 hover:text-gray-700"
                        >
                          <div className="flex items-center gap-1.5">
                            {toolCall.status === 'start' || toolCall.status === 'running' ? (
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
                            ) : toolCall.status === 'success' ? (
                              <Check className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <X className="h-3 w-3 text-red-500" />
                            )}
                            <span>
                              {getToolDisplayName(toolCall.name)}
                              {toolCall.status === 'start' || toolCall.status === 'running' ? '中...' : ''}
                            </span>
                          </div>
                          {toolCall.result ? toolCall.collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" /> : null}
                        </button>
                        {toolCall.result && !toolCall.collapsed ? (
                          <div className="max-h-48 overflow-y-auto border-t border-gray-200/50 px-3 py-2 text-xs leading-6 text-gray-600">
                            {(() => {
                              try {
                                const parsed = JSON.parse(toolCall.result)
                                if (toolCall.name === 'web_search' || toolCall.name === 'native_web_search') {
                                  return (
                                    <div className="space-y-3">
                                      {searchResultItems.length > 0 ? (
                                        <div className="rounded-xl border border-gray-200/60 bg-white/70 px-3 py-2 text-[11px] text-gray-600">
                                          搜索结果已在上方“{searchCardTitle}”卡片统一展示。
                                        </div>
                                      ) : Array.isArray(parsed.results) && parsed.results.length > 0 ? parsed.results.map((res: { document_id?: string; title?: string; snippet?: string; site_name?: string; publish_time?: string; logo_url?: string }, i: number) => (
                                        <div key={i} className="flex gap-3 border-b border-gray-200/40 pb-2 last:border-0 last:pb-0">
                                          {res.logo_url ? (
                                            <img src={res.logo_url} alt="" className="mt-0.5 h-6 w-6 shrink-0 rounded-full object-cover" />
                                          ) : (
                                            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[10px] font-medium text-orange-700">
                                              {(res.site_name || res.title || 'S').slice(0, 1)}
                                            </div>
                                          )}
                                          <div className="min-w-0 flex-1 space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700">
                                                citation:{i + 1}
                                              </span>
                                              <a href={res.document_id} target="_blank" rel="noreferrer" className="font-medium text-orange-600 hover:underline">
                                                {res.title}
                                              </a>
                                              {res.site_name ? <span className="text-[10px] text-gray-400">{res.site_name}</span> : null}
                                              {res.publish_time ? <span className="text-[10px] text-gray-400">{res.publish_time}</span> : null}
                                            </div>
                                            <div className="line-clamp-3 text-gray-500">{res.snippet}</div>
                                          </div>
                                        </div>
                                      )) : null}
                                      {parsed.summary ? (
                                        <div className="rounded-xl bg-white/70 px-3 py-2 text-[11px] text-gray-600">
                                          {parsed.summary}
                                        </div>
                                      ) : null}
                                      {parsed.need_web_enabled ? (
                                        <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                                          当前会话未开启网页搜索，请先打开网页搜索开关。
                                        </div>
                                      ) : null}
                                      {parsed.error_message ? (
                                        <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                                          搜索链路提示：{parsed.error_message}
                                        </div>
                                      ) : null}
                                    </div>
                                  )
                                }
                                if (toolCall.name === 'knowledge_lookup' && Array.isArray(parsed.results)) {
                                  return (
                                    <div className="space-y-3">
                                      {parsed.query ? (
                                        <div className="text-[11px] text-gray-500">
                                          查询词：<span className="font-medium text-gray-700">{String(parsed.query)}</span>
                                        </div>
                                      ) : null}
                                      {parsed.results.length === 0 ? (
                                        <div className="text-gray-400">未命中家庭知识资料</div>
                                      ) : (
                                        parsed.results.map((res: { title?: string; snippet?: string; document_id?: string; source_kind?: string }, i: number) => {
                                          const hitBadge = knowledgeHitBadge(res.source_kind)
                                          return (
                                            <div key={i} className="space-y-1 border-b border-gray-200/40 pb-2 last:border-0 last:pb-0">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${hitBadge.className}`}>
                                                  {hitBadge.label}
                                                </span>
                                                <div className="min-w-0 font-medium text-gray-800">{res.title || '（无标题）'}</div>
                                              </div>
                                              {res.snippet ? <div className="line-clamp-4 text-gray-500">{res.snippet}</div> : null}
                                              {res.document_id && !String(res.document_id).startsWith('http') ? (
                                                <div className="text-[10px] text-gray-400">文档：{res.document_id}</div>
                                              ) : res.document_id ? (
                                                <a href={res.document_id} target="_blank" rel="noreferrer" className="text-[11px] font-medium text-orange-600 hover:underline">
                                                  打开链接
                                                </a>
                                              ) : null}
                                            </div>
                                          )
                                        })
                                      )}
                                    </div>
                                  )
                                }
                                if (toolCall.name === 'recipe_query' && parsed.matches) {
                                  return (
                                    <div className="space-y-2">
                                      {parsed.matches.map((match: { title?: string }, i: number) => (
                                        <div key={i} className="flex items-center gap-2 rounded-lg bg-white/50 p-2">
                                          <ChefHat className="h-4 w-4 text-orange-400" />
                                          <span className="font-medium text-gray-700">{match.title}</span>
                                        </div>
                                      ))}
                                      {parsed.matches.length === 0 && <div className="text-gray-400">未找到相关菜谱</div>}
                                    </div>
                                  )
                                }
                              } catch {
                                // fallback below
                              }
                              return <div className="whitespace-pre-wrap wrap-break-word">{toolCall.result}</div>
                            })()}
                          </div>
                        ) : null}
                            </div>
                          ))
                        : null}
                    </div>
                  )
                })()}
              </div>
            )
          })()}

          {msg.approval?.options?.length || msg.approvalResolved ? (
            <div className="mt-1 w-full rounded-2xl border border-orange-100 bg-orange-50/60 p-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs font-medium text-orange-700">
                <span>
                {msg.approvalResolved?.prompt || msg.approval?.prompt || '请选择一个候选，我继续整理'}
                </span>
                {msg.approval && msg.approval.step_total ? (
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] text-orange-700">
                    第 {msg.approval.step_index ?? 1}/{msg.approval.step_total} 题
                    {msg.approval.selection_mode === 'multi' ? ' · 可多选' : ''}
                  </span>
                ) : null}
              </div>
              {msg.approvalResolved ? (
                <div className="flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-2.5 text-sm text-emerald-900">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  <div>
                    <span className="font-medium">已选择</span>
                    <span className="text-emerald-800">：{msg.approvalResolved.titles?.length ? msg.approvalResolved.titles.join('、') : msg.approvalResolved.title}</span>
                    <span className="mt-1 block text-xs font-normal text-emerald-700/90">选择已确认，无法更改</span>
                  </div>
                </div>
              ) : msg.approval?.options?.length ? (
                <div className="space-y-3">
                  {/* 动态追问改成紧凑胶囊，避免大卡片把聊天流压得太高。 */}
                  <div className="flex flex-wrap gap-2">
                    {msg.approval.options.map((option) => {
                      const selected = approvalSelectedIds.includes(option.id)
                      const multi = msg.approval?.selection_mode === 'multi'
                      return (
                        <button
                          key={option.id}
                          type="button"
                          disabled={sendBusy}
                          onClick={() => {
                            if (!msg.approval) return
                            if (!multi) {
                              void onApprovalSelect(msg.approval, option)
                              return
                            }
                            setApprovalSelections((prev) => {
                              const current = prev[msg.approval!.id] ?? msg.approval!.selected_option_ids ?? []
                              const next = current.includes(option.id)
                                ? current.filter((item) => item !== option.id)
                                : [...current, option.id]
                              return { ...prev, [msg.approval!.id]: next }
                            })
                          }}
                          className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-2 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                            selected
                              ? 'border-orange-300 bg-orange-500 text-white shadow-sm shadow-orange-500/20'
                              : 'border-orange-100 bg-white text-gray-700 hover:border-orange-200 hover:bg-orange-50'
                          }`}
                        >
                          <span className="font-medium">{option.title}</span>
                          {option.summary ? (
                            <span className={`max-w-40 truncate text-[11px] ${selected ? 'text-white/85' : 'text-gray-400'}`}>
                              {option.summary}
                            </span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                  {msg.approval.selection_mode === 'multi' ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] text-gray-500">
                        {approvalSelectedIds.length > 0 ? `已选 ${approvalSelectedIds.length} 项` : '可多选后确认'}
                      </div>
                      <button
                        type="button"
                        disabled={sendBusy || approvalSelectedIds.length === 0}
                        onClick={() => {
                          if (!msg.approval) return
                          const selectedOptions = msg.approval.options.filter((option) => approvalSelectedIds.includes(option.id))
                          void onApprovalSelect(msg.approval, selectedOptions)
                        }}
                        className="rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-orange-500/20 disabled:cursor-not-allowed disabled:bg-orange-200"
                      >
                        确认选择
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {msg.attachments?.filter((item) => item.kind !== 'audio').length ? (
            <div className="flex flex-wrap gap-2">
              {msg.attachments
                .filter((item) => item.kind !== 'audio')
                .map((item, attachmentIdx) =>
                  item.kind === 'image' ? (
                    <div key={`${item.name}-${attachmentIdx}`} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                      {item.previewUrl || item.url ? (
                        <img src={item.previewUrl ?? item.url} alt={item.name} className="h-20 w-20 object-cover" />
                      ) : (
                        <div className="flex h-20 w-20 items-center justify-center bg-gray-100 text-gray-400">
                          <ImageIcon className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      key={`${item.name}-${attachmentIdx}`}
                      className="flex items-center gap-2 rounded-2xl border border-gray-100 bg-white px-3 py-2 text-xs text-gray-600 shadow-sm"
                    >
                      <FileText className="h-4 w-4 text-gray-400" />
                      <span className="max-w-36 truncate">{item.name}</span>
                    </div>
                  ),
                )}
            </div>
          ) : null}

          {msg.type === 'recipe_card' && msg.recipeData && !savedRecipes.includes(msg.recipeData.recipeId ?? msg.recipeData.title) ? (
            <div className="mt-1 w-full overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm">
              <div className="relative h-36 w-full overflow-hidden bg-orange-50">
                {msg.recipeData.coverImageUrl ? (
                  <img src={msg.recipeData.coverImageUrl} alt={msg.recipeData.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-orange-50 via-amber-50 to-white text-orange-300">
                    <ChefHat className="h-10 w-10" />
                  </div>
                )}
              </div>
              <div className="space-y-3 p-4">
                <h4 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                  <ChefHat className="h-5 w-5 text-orange-500" />
                  {msg.recipeData.title}
                </h4>
                <div className="flex gap-4 rounded-lg bg-gray-50 p-2 text-xs font-medium text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {msg.recipeData.time}
                  </span>
                  <span>难度 {msg.recipeData.difficulty}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-gray-400">主要食材</span>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.recipeData.ingredients.map((ing) => (
                      <span key={ing} className="rounded-md bg-orange-50 px-2 py-1 text-[10px] text-orange-700">
                        {ing}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="border-t border-gray-100 bg-gray-50 p-3">
                {msg.recipeData.isRecipe === false ? (
                  <div className="rounded-xl bg-gray-200 py-2.5 text-center text-sm font-medium text-gray-500">
                    {msg.recipeData.rejectReason || '该图片暂不适合生成菜谱'}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void onSaveRecipe(idx, msg.recipeData)}
                    disabled={sendBusy || savingRecipeKeys.includes(msg.recipeData.recipeId ?? msg.recipeData.title)}
                    className="w-full rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white shadow-md shadow-orange-500/20 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-orange-300"
                  >
                    {savingRecipeKeys.includes(msg.recipeData.recipeId ?? msg.recipeData.title)
                      ? '保存中...'
                      : msg.recipeData.recipeId && !msg.recipeData.draft
                        ? '查看这道现有菜谱'
                        : '存为自家的新菜谱'}
                  </button>
                )}
              </div>
            </div>
          ) : null}
          {msg.createdAt ? (
            <span className="mt-0.5 px-1 text-[10px] leading-none text-gray-400 tabular-nums">{formatMessageTime(msg.createdAt)}</span>
          ) : null}
        </div>
      )

    return {
      key: msg.id ?? `local-${idx}`,
      role: (msg.role === 'user' ? 'user' : 'ai') as 'user' | 'ai',
      streaming: idx === activeStreamingAssistantIndex && sendBusy,
      loading:
        msg.role === 'assistant' &&
        idx === activeStreamingAssistantIndex &&
        sendBusy &&
        !hasRenderableAssistantPayload(msg),
      content: column,
    }
  })

  return (
    <>
      <div ref={messageListRef} className="flex-1 min-h-0 space-y-2 overflow-y-auto p-4 pb-5 pt-20">
        {detailMessage || citationDetail ? (
          <div className="absolute inset-0 z-40 bg-gray-50/95 backdrop-blur-sm">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-gray-100 bg-white/90 px-4 py-4">
                <div className="text-base font-semibold text-gray-900">
                  {citationDetail ? `引用来源 citation:${citationDetail.index}` : detailMessage?.title}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDetailMessage(null)
                    setCitationDetail(null)
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {citationDetail ? (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                      {citationDetail.source.logoUrl ? (
                        <img src={citationDetail.source.logoUrl} alt="" className="h-12 w-12 rounded-2xl object-cover" />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-sm font-semibold text-orange-700">
                          {(citationDetail.source.siteName || citationDetail.source.title || 'S').slice(0, 1)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                            citation:{citationDetail.index}
                          </span>
                          <div className="text-lg font-semibold text-gray-900">
                            {citationDetail.source.title || citationDetail.source.siteName || '参考来源'}
                          </div>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                          {citationDetail.source.siteName ? <span>{citationDetail.source.siteName}</span> : null}
                          {citationDetail.source.publishTime ? <span>{citationDetail.source.publishTime}</span> : null}
                        </div>
                      </div>
                    </div>
                    {citationDetail.source.snippet ? (
                      <div className="rounded-2xl border border-gray-100 bg-white p-4 text-sm leading-7 text-gray-700 shadow-sm">
                        {citationDetail.source.snippet}
                      </div>
                    ) : null}
                    {citationDetail.source.documentId ? (
                      <a
                        href={citationDetail.source.documentId}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-full bg-orange-500 px-4 py-2 text-sm font-medium text-white"
                      >
                        打开来源网页
                      </a>
                    ) : null}
                  </div>
                ) : detailMessage ? (
                  <MarkdownBlock content={detailMessage.content} />
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div ref={messagesTopChromeRef} className="flex flex-col gap-2">
          {cookingPageContext?.type === 'cooking' && (
            <div className="sticky top-0 z-20 mx-auto mb-6 flex w-max items-center gap-1.5 rounded-full border border-orange-100 bg-orange-50 px-3 py-1.5 text-xs text-orange-600 shadow-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-orange-500" />
              正在制作《{cookingPageContext.recipe}》
            </div>
          )}

          {!activeSessionId && continueSessionPrompt ? (
            <div className="rounded-2xl border border-orange-100 bg-white px-4 py-3 shadow-sm">
              <div className="text-sm font-medium text-gray-900">检测到你上次的会话</div>
              <div className="mt-1 text-xs text-gray-500">
                {continueSessionPrompt.title || '未命名对话'}
                {formatSessionTime(continueSessionPrompt.updated_at) ? ` · ${formatSessionTime(continueSessionPrompt.updated_at)}` : ''}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="primary"
                  size="middle"
                  shape="round"
                  className="!h-9 !min-w-[96px] !rounded-full !px-5 !text-sm font-medium shadow-sm"
                  onClick={() => void loadSessionHistory(continueSessionPrompt.id, false)}
                >
                  继续会话
                </Button>
                <Button
                  size="middle"
                  shape="round"
                  className="!h-9 !min-w-[96px] !rounded-full !border-gray-200 !px-5 !text-sm font-medium text-gray-700"
                  onClick={() => setContinueSessionPrompt(null)}
                >
                  新会话开始
                </Button>
              </div>
            </div>
          ) : null}

          {activeSessionId ? (
            <div className="flex flex-col items-center gap-1 py-1">
              <div ref={loadMoreSentinelRef} className="h-1 w-full shrink-0" aria-hidden />
              {loadingMoreMessages ? <span className="text-[11px] text-gray-400">加载更早消息…</span> : null}
              {!loadingMoreMessages && !hasMoreMessages ? <span className="text-[11px] text-gray-300">已到最早</span> : null}
            </div>
          ) : null}
        </div>

        <Bubble.List
          items={items}
          autoScroll={false}
          role={{
            user: { placement: 'end', shape: 'corner', variant: 'borderless' },
            ai: { placement: 'start', shape: 'corner', variant: 'borderless' },
            system: { placement: 'start', variant: 'borderless' },
          }}
          className="min-h-0 max-h-none [&_.ant-bubble-list-scroll-box]:max-h-none [&_.ant-bubble-list-scroll-box]:min-h-0 [&_.ant-bubble-list-scroll-box]:overflow-visible [&_.ant-bubble-content]:!bg-transparent [&_.ant-bubble-content]:!shadow-none [&_.ant-bubble-content]:!border-none"
        />

        {historyBusy ? <div className="text-center text-xs text-gray-400">历史加载中…</div> : null}
        <div ref={messageEndRef} />
      </div>
    </>
  )
}
