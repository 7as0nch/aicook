import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { useAI } from '../contexts/AIContext'
import { useFeedback } from '../contexts/FeedbackContext'
import { motion, AnimatePresence } from 'motion/react'
import html2canvas from 'html2canvas'
import { Bot, History, Maximize2, Minimize2, X } from 'lucide-react'
import {
  type QuoteContext,
  type AISessionSummary,
  type AIHistoryMessage,
  type AIAttachment,
  type AIAgentTrace,
  type AIApprovalOption,
  type AIApprovalResponse,
  type AIPendingApproval,
  type AIRecipeCardMeta,
  type AIToolCall,
  type AIWorkflowStep,
  type ActiveCooking,
  createTextRecipeDraft,
  fetchChatKnowledgeIngestStatus,
  deleteAiSession,
  isAuthenticated,
  listAiMessages,
  listAiSessions,
  listActiveCooking,
  retryChatKnowledgeIngest,
  streamAiMessage,
  subscribeAuthSession,
  uploadMedia,
} from '../../lib/api/client'
import { useVoiceRecorder, type VoiceRecorderResult } from '../../components/media/useVoiceRecorder'
import type { Message, PendingAttachment } from './ai-assistant/types'
import { WELCOME } from './ai-assistant/types'
import {
  normalizeMessageDisplayState,
  shouldCollapseContent,
  toRecipeData,
} from './ai-assistant/helpers'
import { AIChatMessages } from './ai-assistant/AIChatMessages'
import { AIChatComposer } from './ai-assistant/AIChatComposer'
import { AIChatHistory } from './ai-assistant/AIChatHistory'
import { buildStageReasoningContent, extractSearchPayload, getVisibleAgentTrace, mergeAgentTrace, mergeToolCalls, mergeWorkflowSteps } from './ai-assistant/message-state'
import { useAIAssistantPersistence } from './ai-assistant/useAIAssistantPersistence'

function buildQuoteContext(pageContext: unknown): QuoteContext {
  const serialized = pageContext && typeof pageContext === 'object' ? JSON.stringify(pageContext) : ''
  const scene =
    pageContext && typeof pageContext === 'object' && 'type' in pageContext && typeof (pageContext as { type?: string }).type === 'string'
      ? (pageContext as { type: string }).type
      : 'assistant'
  return {
    selected_text: serialized.slice(0, 2000),
    selection_source: 'aicook_app',
    surrounding_text: '',
    scene,
  }
}

function quickCapturePrompt(intent: string | undefined) {
  if (intent === 'inventory') {
    return '请识别这张图片里的食材或调料，整理成库存清单，并根据现有食材推荐能做的菜。'
  }
  if (intent === 'recipe') {
    return '请识别这张图片里的菜谱信息，尽量整理成结构化菜谱草稿。'
  }
  return '请先判断这张图片更像菜谱图还是冰箱/食材图；如果是菜谱，请整理出菜谱草稿；如果是冰箱或食材，请识别库存并推荐可以做的菜。'
}

const STREAMING_CONTENT_THRESHOLD = 320
const MESSAGE_PAGE_SIZE = 5

export default function AIAssistant() {
  const { isOpen, openAI, closeAI, pageContext, setPageContext } = useAI()
  const { confirm } = useFeedback()
  const showCookingContextBanner = Boolean(
    pageContext && typeof pageContext === 'object' && (pageContext as { type?: string }).type === 'cooking',
  )
  const [authed, setAuthed] = useState(() => isAuthenticated())
  const [inputValue, setInputValue] = useState('')
  const [savedRecipes, setSavedRecipes] = useState<string[]>([])
  const [savingRecipeKeys, setSavingRecipeKeys] = useState<string[]>([])
  const sessionIdRef = useRef<string | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const messagesTopChromeRef = useRef<HTMLDivElement>(null)
  const messagesTopChromeHeightRef = useRef(0)
  const messagesTopChromeLaidOutRef = useRef(false)
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)
  const messageEndRef = useRef<HTMLDivElement>(null)
  const streamingContentRef = useRef<HTMLDivElement>(null)
  const streamingReasoningRef = useRef<HTMLDivElement>(null)
  const micButtonRef = useRef<HTMLButtonElement>(null)
  /** 忽略 iOS 等触屏后紧跟的合成鼠标 pointer，避免话筒被连点两次 */
  const micLastRealTouchTs = useRef(0)
  /** touchstart + pointerdown 同一次按压去重（部分 WebView 双发） */
  const micGestureHandledRef = useRef(false)
  const sendBusyRef = useRef(false)
  const voiceBusyRef = useRef(false)
  const isRecordingRef = useRef(false)
  const startRecordingRef = useRef<() => void>(() => {})
  const finishRecordingRef = useRef<() => void>(() => {})
  const shouldAutoScrollRef = useRef(true)
  const quickCaptureConsumedRef = useRef('')

  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [sessionMessageCache, setSessionMessageCache] = useState<Record<string, Message[]>>({})
  const [sessions, setSessions] = useState<AISessionSummary[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [sessionsBusy, setSessionsBusy] = useState(false)
  const [historyBusy, setHistoryBusy] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [continueSessionPrompt, setContinueSessionPrompt] = useState<AISessionSummary | null>(null)
  const [sendBusy, setSendBusy] = useState(false)
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [oldestMessageId, setOldestMessageId] = useState<string | null>(null)
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  /** 直传对象存储进度（发送中） */
  const [uploadStageLabel, setUploadStageLabel] = useState('')
  /** 厨艺 AI 资料库入库：asset_id → 阶段文案 */
  const [knowledgeIngestProgress, setKnowledgeIngestProgress] = useState<Record<string, string>>({})
  const [reasoningEnabled, setReasoningEnabled] = useState(false)
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [imageRecipeEnabled, setImageRecipeEnabled] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeCooking, setActiveCooking] = useState<ActiveCooking[]>([])
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [detailMessage, setDetailMessage] = useState<{ title: string; content: string } | null>(null)
  const { busy: voiceBusy, recording: isRecording, hint: voiceHint, startRecording, finishRecording } = useVoiceRecorder((result) => {
    const normalized = (result.transcription.text || '').trim()
    if (!normalized) return
    void handleVoiceMessage(result)
  }, { resetHint: '点击话筒录音，空白输入框可长按' })

  sendBusyRef.current = sendBusy
  voiceBusyRef.current = voiceBusy
  isRecordingRef.current = isRecording
  startRecordingRef.current = startRecording
  finishRecordingRef.current = finishRecording

  const runMicToggleFromGesture = useCallback(() => {
    if (micGestureHandledRef.current) return
    micGestureHandledRef.current = true
    queueMicrotask(() => {
      micGestureHandledRef.current = false
    })
    if (sendBusyRef.current || voiceBusyRef.current) return
    if (isRecordingRef.current) void finishRecordingRef.current()
    else void startRecordingRef.current()
  }, [])

  const scrollMessageListToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const list = messageListRef.current
    if (!list) return
    const top = Math.max(0, list.scrollHeight - list.clientHeight)
    list.scrollTo({ top, behavior })
  }, [])

  const composerInputEmpty = !inputValue.trim()
  useEffect(() => {
    if (!isOpen || !composerInputEmpty || !authed) return
    const btn = micButtonRef.current
    if (!btn) return
    const onTouchStart = () => {
      runMicToggleFromGesture()
    }
    btn.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
    return () => btn.removeEventListener('touchstart', onTouchStart, { capture: true })
  }, [isOpen, composerInputEmpty, authed, runMicToggleFromGesture])

  useEffect(() => {
    const unsubscribe = subscribeAuthSession(() => {
      const nextAuthed = isAuthenticated()
      setAuthed(nextAuthed)
      if (!nextAuthed) {
        closeAI()
      }
    })
    return () => {
      unsubscribe()
    }
  }, [closeAI])

  useEffect(() => {
    if (!isOpen || !authed) return
    let cancelled = false
    void listActiveCooking()
      .then((items) => {
        if (!cancelled) setActiveCooking(items)
      })
      .catch(() => {
        if (!cancelled) setActiveCooking([])
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, authed])

  useEffect(() => {
    return () => {
      setPendingAttachments((current) => {
        for (const item of current) {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
        }
        return current
      })
    }
  }, [])
  useAIAssistantPersistence({
    messages,
    sessionMessageCache,
    sessionIdRef,
    setMessages,
    setSessionMessageCache,
    setActiveSessionId,
    reasoningEnabled,
    setReasoningEnabled,
    webSearchEnabled,
    setWebSearchEnabled,
    imageRecipeEnabled,
    setImageRecipeEnabled,
  })


  useEffect(() => {
    if (!isOpen) return
    resetConversation()
    void (async () => {
      const latestSessions = await refreshSessions()
      setContinueSessionPrompt(latestSessions[0] ?? null)
    })()
  }, [isOpen])

  useEffect(() => {
    if (isOpen) return
    setIsFullscreen(false)
    setDetailMessage(null)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const list = messageListRef.current
    if (!list) return
    const handleScroll = () => {
      const distanceToBottom = list.scrollHeight - list.scrollTop - list.clientHeight
      shouldAutoScrollRef.current = distanceToBottom < 120
    }
    handleScroll()
    list.addEventListener('scroll', handleScroll)
    return () => list.removeEventListener('scroll', handleScroll)
  }, [isOpen])

  useLayoutEffect(() => {
    if (!isOpen) {
      messagesTopChromeHeightRef.current = 0
      messagesTopChromeLaidOutRef.current = false
      return
    }
    const list = messageListRef.current
    const chrome = messagesTopChromeRef.current
    if (!list || !chrome) return
    const next = chrome.offsetHeight
    if (!messagesTopChromeLaidOutRef.current) {
      messagesTopChromeLaidOutRef.current = true
      messagesTopChromeHeightRef.current = next
      return
    }
    const prev = messagesTopChromeHeightRef.current
    const delta = next - prev
    if (delta !== 0) {
      list.scrollTop = Math.max(0, list.scrollTop + delta)
    }
    messagesTopChromeHeightRef.current = next
  }, [
    isOpen,
    activeSessionId,
    loadingMoreMessages,
    hasMoreMessages,
    continueSessionPrompt?.id,
    showCookingContextBanner,
  ])

  /** Pin outer list to latest message synchronously after DOM updates (rAF scrollIntoView can run before Bubble list finishes layout). */
  useLayoutEffect(() => {
    if (!isOpen || historyBusy) return
    if (sendBusy) {
      scrollMessageListToBottom('auto')
      shouldAutoScrollRef.current = true
      return
    }
    if (shouldAutoScrollRef.current) {
      scrollMessageListToBottom('auto')
    }
  }, [isOpen, historyBusy, messages, sendBusy, activeSessionId, scrollMessageListToBottom])

  useEffect(() => {
    if (!isOpen || historyBusy || !shouldAutoScrollRef.current) return
    const raf = window.requestAnimationFrame(() => {
      scrollMessageListToBottom('auto')
    })
    return () => window.cancelAnimationFrame(raf)
  }, [isOpen, messages, sendBusy, historyBusy, scrollMessageListToBottom])

  useEffect(() => {
    if (!isOpen || historyBusy || !shouldAutoScrollRef.current) return
    const list = messageListRef.current
    if (!list) return
    let raf = 0
    const scrollToLatest = () => {
      if (raf) window.cancelAnimationFrame(raf)
      raf = window.requestAnimationFrame(() => {
        if (!shouldAutoScrollRef.current) return
        scrollMessageListToBottom('auto')
      })
    }
    const observer = new MutationObserver(() => {
      scrollToLatest()
    })
    observer.observe(list, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    })
    return () => {
      observer.disconnect()
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [isOpen, historyBusy, messages, scrollMessageListToBottom])

  useEffect(() => {
    if (!isOpen || !sendBusy) return
    const raf = window.requestAnimationFrame(() => {
      // 流式正文跟随外层消息列表滚动，避免正文内部和消息列表双滚动互相打架。
      if (streamingReasoningRef.current) {
        streamingReasoningRef.current.scrollTop = streamingReasoningRef.current.scrollHeight
      }
    })
    return () => window.cancelAnimationFrame(raf)
  }, [isOpen, messages, sendBusy])

  function updateLastAssistantMessage(updater: (message: Message) => Message) {
    setMessages((prev) => {
      const next = [...prev]
      for (let idx = next.length - 1; idx >= 0; idx -= 1) {
        if (next[idx]?.role === 'assistant') {
          next[idx] = updater(next[idx])
          break
        }
      }
      return next
    })
  }

  function toggleContentCollapsed(index: number) {
    setMessages((prev) =>
      prev.map((message, idx) =>
        idx === index
          ? {
              ...message,
              contentCollapsed: !message.contentCollapsed,
            }
          : message,
      ),
    )
  }

  function clearPendingAttachments() {
    setPendingAttachments((prev) => {
      for (const item of prev) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      }
      return []
    })
  }

  function resetConversation() {
    sessionIdRef.current = null
    setActiveSessionId(null)
    setHasMoreMessages(false)
    setOldestMessageId(null)
    setLoadingMoreMessages(false)
    shouldAutoScrollRef.current = true
    setMessages([WELCOME])
    clearPendingAttachments()
  }

  function mapHistoryMessage(item: AIHistoryMessage): Message {
    const expandable = item.role === 'assistant' && shouldCollapseContent(item.content)
    const ar = item.response_meta?.approval_resolved
    const approvalResolved = ar
      ? {
          optionId: ar.option_id,
          optionIds: ar.option_ids ?? undefined,
          title: ar.title ?? '',
          titles: ar.titles ?? undefined,
          prompt: ar.prompt,
        }
      : undefined
    return {
      id: item.id,
      role: item.role,
      content: item.content,
      sources: (item.response_sources ?? []).map((source) => ({
        title: source.title,
        documentId: source.document_id,
        snippet: source.snippet,
        siteName: source.site_name,
        publishTime: source.publish_time,
        logoUrl: source.logo_url,
      })),
      searchResults: (item.response_meta?.search_results ?? []).map((source) => ({
        title: source.title,
        documentId: source.document_id,
        snippet: source.snippet,
        siteName: source.site_name,
        publishTime: source.publish_time,
        logoUrl: source.logo_url,
      })),
      searchError: item.response_meta?.search_error,
      contentExpandable: expandable,
      contentCollapsed: expandable,
      contentStreamingView: false,
      attachments: item.attachments.map((attachment) => ({
        kind: attachment.type === 'image' ? 'image' : attachment.type === 'audio' ? 'audio' : 'file',
        name: attachment.name || (attachment.type === 'image' ? '图片' : attachment.type === 'audio' ? '语音' : '文件'),
        url: attachment.url || undefined,
        contentType: attachment.content_type || undefined,
        assetId: attachment.asset_id || undefined,
      })),
      reasoning: item.response_meta?.reasoning_content
        ? {
            content: item.response_meta.reasoning_content,
            collapsed: true,
          }
        : undefined,
      agentTrace: item.response_meta?.agent_trace ?? [],
      workflow: item.response_meta?.workflow ?? [],
      toolCalls: item.response_meta?.tool_calls ?? [],
      approval: item.response_meta?.pending_approval,
      approvalResolved,
      type: item.response_meta?.recipe_card ? 'recipe_card' : 'text',
      recipeData: item.response_meta?.recipe_card ? toRecipeData(item.response_meta.recipe_card) : undefined,
      createdAt: item.created_at,
      kind: item.response_meta?.kind,
      ingestNotice:
        item.response_meta?.kind === 'knowledge_ingest_notice'
          ? {
              documentId: item.response_meta.document_id,
              mediaAssetId: item.response_meta.media_asset_id,
              retryable: item.response_meta.retryable,
              partial: item.response_meta.partial,
              failureReason: item.response_meta.failure_reason,
              summary: item.response_meta.summary,
            }
          : undefined,
    }
  }

  function formatSessionTime(value?: string) {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  async function refreshSessions() {
    setSessionsBusy(true)
    try {
      const next = await listAiSessions('assistant', 100)
      setSessions(next)
      return next
    } catch {
      // Keep local cache usable when the history API is temporarily unavailable.
      return []
    } finally {
      setSessionsBusy(false)
    }
  }

  async function loadSessionHistory(sessionId: string, closePanel = true) {
    setHistoryBusy(true)
    try {
      const payload = await listAiMessages(sessionId, { limit: MESSAGE_PAGE_SIZE })
      sessionIdRef.current = sessionId
      setActiveSessionId(sessionId)
      shouldAutoScrollRef.current = true
      setMessages(payload.messages.length ? payload.messages.map(mapHistoryMessage) : [WELCOME])
      setHasMoreMessages(payload.has_more)
      setOldestMessageId(payload.messages[0]?.id ?? null)
      setContinueSessionPrompt(null)
      if (closePanel) {
        setHistoryOpen(false)
      }
    } catch (error) {
      upsertAssistantMessage(error instanceof Error ? `加载历史失败：${error.message}` : '加载历史失败')
    } finally {
      setHistoryBusy(false)
    }
  }

  const loadOlderMessages = useCallback(async () => {
    if (!activeSessionId || !oldestMessageId || loadingMoreMessages || !hasMoreMessages) return
    const list = messageListRef.current
    const previousHeight = list?.scrollHeight ?? 0
    const previousTop = list?.scrollTop ?? 0
    setLoadingMoreMessages(true)
    try {
      const payload = await listAiMessages(activeSessionId, {
        limit: MESSAGE_PAGE_SIZE,
        beforeMessageId: oldestMessageId,
      })
      const incoming = payload.messages.map(mapHistoryMessage)
      let insertedCount = 0
      setMessages((prev) => {
        const existingIds = new Set(prev.map((item) => item.id).filter(Boolean))
        const olderMessages = incoming.filter((item: Message) => !item.id || !existingIds.has(item.id))
        insertedCount = olderMessages.length
        return olderMessages.length ? [...olderMessages, ...prev] : prev
      })
      if (insertedCount > 0) {
        setOldestMessageId(payload.messages[0]?.id ?? oldestMessageId)
        window.requestAnimationFrame(() => {
          if (!list) return
          list.scrollTop = previousTop + (list.scrollHeight - previousHeight)
        })
      }
      setHasMoreMessages(payload.has_more)
    } catch (error) {
      upsertAssistantMessage(error instanceof Error ? `加载更多失败：${error.message}` : '加载更多失败')
    } finally {
      setLoadingMoreMessages(false)
    }
  }, [activeSessionId, oldestMessageId, loadingMoreMessages, hasMoreMessages])

  useEffect(() => {
    if (!isOpen || !activeSessionId || !hasMoreMessages) return
    const root = messageListRef.current
    const target = loadMoreSentinelRef.current
    if (!root || !target) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        void loadOlderMessages()
      },
      { root, rootMargin: '100px 0px 0px 0px', threshold: 0 },
    )
    obs.observe(target)
    return () => obs.disconnect()
  }, [isOpen, activeSessionId, hasMoreMessages, loadOlderMessages, oldestMessageId, loadingMoreMessages])

  async function handleDeleteSession(sessionId: string) {
    const confirmed = await confirm({
      title: '删除这个会话？',
      description: '删除后将无法在历史记录中继续查看。',
      confirmText: '删除',
      tone: 'danger',
    })
    if (!confirmed) return
    try {
      await deleteAiSession(sessionId)
      setSessions((prev) => prev.filter((item) => item.id !== sessionId))
      setContinueSessionPrompt((current) => (current?.id === sessionId ? null : current))
      setSessionMessageCache((prev) => {
        const next = { ...prev }
        delete next[sessionId]
        return next
      })
      if (sessionIdRef.current === sessionId) {
        resetConversation()
      }
    } catch (error) {
      upsertAssistantMessage(error instanceof Error ? `删除会话失败：${error.message}` : '删除会话失败')
    }
  }

  async function runStreamRequest(
    text: string,
    attachments?: AIAttachment[],
    approvalResponse?: AIApprovalResponse,
  ) {
    const assistantStartedAt = new Date().toISOString()
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: '',
        contentCollapsed: false,
        contentExpandable: false,
        contentStreamingView: false,
        reasoning: reasoningEnabled ? { content: '', collapsed: false } : undefined,
        createdAt: assistantStartedAt,
      },
    ])
    const reply = await streamAiMessage({
      sessionId: sessionIdRef.current ?? undefined,
      text,
      quoteContext: buildQuoteContext(pageContext),
      attachments,
      approvalResponse,
      reasoningEnabled,
      webSearchEnabled,
      imageRecipeEnabled,
      onStart: (payload) => {
        if (payload.session_id) {
          sessionIdRef.current = String(payload.session_id)
          setActiveSessionId(String(payload.session_id))
          setHasMoreMessages(false)
          setOldestMessageId(null)
        }
      },
      onAnswerDelta: (chunk) => {
        updateLastAssistantMessage((last) => {
          const nextContent = `${last.content}${chunk}`
          return {
            ...last,
            content: nextContent,
            contentStreamingView: nextContent.length > STREAMING_CONTENT_THRESHOLD,
          }
        })
      },
      onReasoningDelta: (chunk) => {
        updateLastAssistantMessage((last) => ({
          ...last,
          reasoning: {
            content: `${(last.reasoning?.content ?? '').startsWith('[阶段化思考]') ? '' : (last.reasoning?.content ?? '')}${chunk}`,
            collapsed: false,
          },
        }))
      },
      onStatusDelta: (step) => {
        updateLastAssistantMessage((last) => {
          const nextWorkflow = mergeWorkflowSteps(last.workflow, step)
          const stageReasoning = buildStageReasoningContent(nextWorkflow)
          const currentReasoning = last.reasoning?.content ?? ''
          const shouldUseStageReasoning = !currentReasoning.trim() || currentReasoning.startsWith('[阶段化思考]')
          return {
            ...last,
            content: last.content || ' ',
            workflow: nextWorkflow,
            reasoning:
              reasoningEnabled && shouldUseStageReasoning
                ? {
                    content: stageReasoning || currentReasoning,
                    collapsed: false,
                  }
                : last.reasoning,
          }
        })
      },
      onAgentDelta: (agentItem) => {
        updateLastAssistantMessage((last) => ({
          ...last,
          content: last.content || ' ',
          agentTrace: mergeAgentTrace(last.agentTrace, agentItem),
        }))
      },
      onToolCall: (toolCall) => {
        updateLastAssistantMessage((last) => {
          const nextToolCalls = mergeToolCalls(last.toolCalls, toolCall)
          const searchPayload = extractSearchPayload(toolCall)
          return {
            ...last,
            content: last.content || ' ',
            toolCalls: nextToolCalls,
            searchResults: searchPayload?.results?.length ? searchPayload.results : last.searchResults,
            searchError: searchPayload?.error ?? last.searchError,
          }
        })
      },
      onRecipeCard: (card) => {
        updateLastAssistantMessage((last) => ({
          ...last,
          type: 'recipe_card',
          recipeData: toRecipeData(card),
        }))
      },
      onApproval: (approval) => {
        updateLastAssistantMessage((last) => ({
          ...last,
          approval,
        }))
      },
    })

    updateLastAssistantMessage((last) => ({
      ...last,
      content: last.content || reply.reply_content || '',
      sources: reply.reply_sources?.length
        ? reply.reply_sources.map((source) => ({
            title: source.title,
            documentId: source.document_id,
            snippet: source.snippet,
            siteName: source.site_name,
            publishTime: source.publish_time,
            logoUrl: source.logo_url,
          }))
        : last.sources,
      searchResults: reply.reply_metadata?.search_results?.length
        ? reply.reply_metadata.search_results.map((source) => ({
            title: source.title,
            documentId: source.document_id,
            snippet: source.snippet,
            siteName: source.site_name,
            publishTime: source.publish_time,
            logoUrl: source.logo_url,
          }))
        : last.searchResults,
      searchError: reply.reply_metadata?.search_error ?? last.searchError,
      contentExpandable: shouldCollapseContent(last.content || reply.reply_content || ''),
      contentCollapsed: shouldCollapseContent(last.content || reply.reply_content || ''),
      contentStreamingView: false,
      reasoning:
        reasoningEnabled && (last.reasoning?.content || reply.reasoning_content)
          ? {
              content: (last.reasoning?.content || reply.reasoning_content || '').trim(),
              collapsed: true,
            }
          : last.reasoning,
      agentTrace: reply.reply_metadata?.agent_trace?.length ? reply.reply_metadata.agent_trace : last.agentTrace,
      workflow: reply.reply_metadata?.workflow?.length ? reply.reply_metadata.workflow : last.workflow,
      toolCalls: reply.reply_metadata?.tool_calls?.length ? reply.reply_metadata.tool_calls : last.toolCalls,
      approval: reply.reply_metadata?.pending_approval ?? last.approval,
      type: reply.reply_metadata?.recipe_card ? 'recipe_card' : last.type,
      recipeData: reply.reply_metadata?.recipe_card ? toRecipeData(reply.reply_metadata.recipe_card) : last.recipeData,
      kind: reply.reply_metadata?.kind ?? last.kind,
      ingestNotice:
        reply.reply_metadata?.kind === 'knowledge_ingest_notice'
          ? {
              documentId: reply.reply_metadata.document_id,
              mediaAssetId: reply.reply_metadata.media_asset_id,
              retryable: reply.reply_metadata.retryable,
              partial: reply.reply_metadata.partial,
              failureReason: reply.reply_metadata.failure_reason,
              summary: reply.reply_metadata.summary,
            }
          : last.ingestNotice,
    }))
    if (reply.session_id) {
      sessionIdRef.current = reply.session_id
      setActiveSessionId(reply.session_id)
    }
    await refreshSessions()

    const watch = reply.knowledge_ingest_watch
    const sid = reply.session_id
    if (watch && watch.length > 0 && sid) {
      void watchKnowledgeIngestProgress(watch, sid)
    }
  }

  async function watchKnowledgeIngestProgress(
    watch: Array<{ asset_id: string; name?: string }>,
    sid?: string | null,
  ) {
    const assetIds = watch.map((w) => String(w.asset_id || '')).filter(Boolean)
    if (assetIds.length === 0 || !sid) return
    const nameByAsset = Object.fromEntries(watch.map((w) => [w.asset_id, w.name || '']))
    const maxTicks = 90
    const intervalMs = 2000
    try {
      for (let tick = 0; tick < maxTicks; tick++) {
        const statuses = await Promise.all(assetIds.map((id) => fetchChatKnowledgeIngestStatus(id)))
        setKnowledgeIngestProgress((prev) => {
          const next = { ...prev }
          for (let i = 0; i < assetIds.length; i += 1) {
            const id = assetIds[i]
            const st = statuses[i]
            const label = nameByAsset[id] ? `${nameByAsset[id]}: ${st.stage_label}` : st.stage_label
            next[id] = label
          }
          return next
        })
        if (statuses.every((s) => s.settled)) break
        await new Promise((r) => setTimeout(r, intervalMs))
      }
    } finally {
      setKnowledgeIngestProgress((prev) => {
        const next = { ...prev }
        for (const id of assetIds) {
          delete next[id]
        }
        return next
      })
    }
    try {
      const { messages: fresh } = await listAiMessages(sid, { limit: 30 })
      setMessages((prev) => {
        const prevIds = new Set(prev.map((m) => m.id).filter((id): id is string => Boolean(id)))
        const additions = fresh.filter((m: AIHistoryMessage) => m.id && !prevIds.has(m.id)).map(mapHistoryMessage)
        if (additions.length === 0) return prev
        shouldAutoScrollRef.current = true
        return [...prev, ...additions]
      })
    } catch {
      // ignore
    }
  }

  function appendPendingAttachments(files: Array<{ file: File; type: 'image' | 'document'; previewUrl?: string }>) {
    setPendingAttachments((prev) => [
      ...prev,
      ...files.map((item) => ({
        id: `${item.file.name}-${item.file.size}-${item.file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        type: item.type,
        file: item.file,
        name: item.file.name,
        previewUrl: item.previewUrl,
      })),
    ])
  }

  function removePendingAttachment(id: string) {
    setPendingAttachments((prev) => {
      const target = prev.find((item) => item.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((item) => item.id !== id)
    })
  }

  async function handleScreenshot() {
    if (sendBusy) return
    try {
      const root = document.getElementById('root') ?? document.body
      const canvas = await html2canvas(root, {
        backgroundColor: '#f9fafb',
        scale: Math.min(window.devicePixelRatio || 1, 2),
        useCORS: true,
      })
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) {
        throw new Error('截图生成失败')
      }
      const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' })
      appendPendingAttachments([{ file, type: 'image', previewUrl: URL.createObjectURL(file) }])
    } catch (error) {
      upsertAssistantMessage(error instanceof Error ? error.message : '界面截图失败')
    }
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0 || sendBusy) return
    appendPendingAttachments(files.map((file) => ({ file, type: 'document' as const })))
  }

  function upsertAssistantMessage(content: string) {
    shouldAutoScrollRef.current = true
    const ts = new Date().toISOString()
    setMessages((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (last?.role === 'assistant') {
        next[next.length - 1] = normalizeMessageDisplayState({ ...last, content, contentStreamingView: false })
      } else {
        next.push(normalizeMessageDisplayState({ role: 'assistant', content, createdAt: ts }))
      }
      return next
    })
  }

  function toggleReasoning(index: number) {
    setMessages((prev) =>
      prev.map((message, idx) =>
        idx === index && message.reasoning
          ? {
              ...message,
              reasoning: {
                ...message.reasoning,
                collapsed: !message.reasoning.collapsed,
              },
            }
          : message,
      ),
    )
  }

  function toggleToolList(msgIndex: number) {
    setMessages((prev) =>
      prev.map((message, idx) => {
        if (idx !== msgIndex) return message
        return { ...message, toolsExpanded: !message.toolsExpanded }
      }),
    )
  }

  function toggleSearchResults(msgIndex: number) {
    setMessages((prev) =>
      prev.map((message, idx) => (idx === msgIndex ? { ...message, searchResultsExpanded: !message.searchResultsExpanded } : message)),
    )
  }

  function toggleToolCall(msgIndex: number, toolIndex: number) {
    setMessages((prev) =>
      prev.map((message, idx) => {
        if (idx !== msgIndex || !message.toolCalls) return message
        const newToolCalls = [...message.toolCalls]
        if (newToolCalls[toolIndex]) {
          newToolCalls[toolIndex] = {
            ...newToolCalls[toolIndex],
            collapsed: !newToolCalls[toolIndex].collapsed,
          }
        }
        return { ...message, toolCalls: newToolCalls }
      }),
    )
  }

  async function handleVoiceMessage(result: VoiceRecorderResult) {
    const transcript = result.transcription.text.trim()
    if (!transcript || sendBusy) return
    setContinueSessionPrompt(null)
    setSendBusy(true)
    try {
      const audioAttachment = {
        type: 'audio',
        url: result.asset.storage_url,
        content_type: result.asset.content_type || result.file.type || 'audio/webm',
        name: result.asset.file_name || result.file.name,
        asset_id: result.asset.id,
      }
      const sentAt = new Date().toISOString()
      setMessages((prev) => [
        ...prev,
        {
          role: 'user',
          content: transcript,
          attachments: [
            {
              kind: 'audio',
              name: audioAttachment.name,
              url: audioAttachment.url,
              contentType: audioAttachment.content_type,
              assetId: audioAttachment.asset_id,
            },
          ],
          createdAt: sentAt,
        },
      ])
      await runStreamRequest(transcript, [audioAttachment])
    } catch (error) {
      upsertAssistantMessage(error instanceof Error ? `语音发送失败：${error.message}` : '语音发送失败')
    } finally {
      setSendBusy(false)
    }
  }

  const handleSend = async (text: string = inputValue) => {
    const t = text.trim()
    if ((!t && pendingAttachments.length === 0) || sendBusy) return
    setContinueSessionPrompt(null)
    const queued = [...pendingAttachments]
    clearPendingAttachments()
    setInputValue('')
    setUploadStageLabel('')
    setSendBusy(true)
    try {
      const uploadedAttachments: AIAttachment[] = []
      const total = queued.length
      for (let i = 0; i < queued.length; i++) {
        const item = queued[i]
        setUploadStageLabel(total > 1 ? `上传 ${i + 1}/${total} · 0%` : '上传中 · 0%')
        const asset = await uploadMedia(
          item.file,
          item.type === 'image' ? 'images' : 'knowledge',
          (loaded, loadTotal) => {
            if (loadTotal <= 0) return
            const pct = Math.min(100, Math.round((loaded / loadTotal) * 100))
            setUploadStageLabel(total > 1 ? `上传 ${i + 1}/${total} · ${pct}%` : `上传中 · ${pct}%`)
          },
        )
        uploadedAttachments.push({
          type: item.type === 'image' ? 'image' : 'document',
          url: asset.storage_url,
          content_type: asset.content_type || item.file.type || 'application/octet-stream',
          name: item.file.name,
          asset_id: asset.id,
        })
      }

      shouldAutoScrollRef.current = true
      const sentAt = new Date().toISOString()
      setMessages((prev) => [
        ...prev,
        {
          role: 'user',
          content: t || (queued.length > 0 ? '发送了附件' : ''),
          attachments: queued.map((item, index) => ({
            kind: item.type === 'image' ? 'image' : 'file',
            name: item.name,
            previewUrl: item.previewUrl,
            url: uploadedAttachments[index]?.url,
          })),
          createdAt: sentAt,
        },
      ])

      setUploadStageLabel('等待模型回复…')
      await runStreamRequest(t || '请结合我上传的附件继续回答。', uploadedAttachments)
    } catch (e) {
      upsertAssistantMessage(e instanceof Error ? `请求失败：${e.message}` : '请求失败')
    } finally {
      clearPendingAttachments()
      setUploadStageLabel('')
      setSendBusy(false)
    }
  }

  useEffect(() => {
    if (!isOpen || pageContext?.type !== 'quick_capture') return
    const pendingFiles = pageContext.pendingFiles ?? []
    if (pendingFiles.length === 0) return
    const captureKey = pendingFiles.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`).join('|')
    if (!captureKey || quickCaptureConsumedRef.current === captureKey) return
    quickCaptureConsumedRef.current = captureKey
    if (pageContext.forceNewSession) {
      resetConversation()
    }
    appendPendingAttachments(
      pendingFiles.map((item) => ({
        file: item.file,
        type: item.kind,
        previewUrl: item.previewUrl,
      })),
    )
    setImageRecipeEnabled(true)
    const prompt = quickCapturePrompt(pageContext.captureIntent)
    setPageContext({ type: 'assistant', preferredSessionId: pageContext.preferredSessionId })
    window.setTimeout(() => {
      void handleSend(prompt)
    }, 80)
  }, [isOpen, pageContext])
  const handleActionClick = (action: string) => {
    const sentAt = new Date().toISOString()
    setMessages((prev) => [...prev, { role: 'user', content: `[操作: 上传${action}]`, createdAt: sentAt }])
    void (async () => {
      try {
        await runStreamRequest(`用户点击了：${action}`)
      } catch (e) {
        upsertAssistantMessage(e instanceof Error ? e.message : '操作失败')
      }
    })()
  }

  const handleSaveRecipe = async (msgIndex: number, recipe?: Message['recipeData']) => {
    const savedKey = recipe?.recipeId || recipe?.title || ''
    if (!recipe) {
      return
    }
    if (recipe.recipeId) {
      if (savedKey) {
        setSavedRecipes((prev) => (prev.includes(savedKey) ? prev : [...prev, savedKey]))
      }
      window.location.assign(`/recipes/${recipe.recipeId}`)
      return
    }
    if (!recipe.draft) {
      const ts = new Date().toISOString()
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: recipe.title ? `《${recipe.title}》草稿已经生成，但还没有拿到可保存的结构化内容。` : '菜谱草稿已经生成。',
          createdAt: ts,
        },
      ])
      return
    }
    if (sendBusy || !savedKey || savingRecipeKeys.includes(savedKey)) {
      return
    }
    setSavingRecipeKeys((prev) => [...prev, savedKey])
    try {
      const detail = await createTextRecipeDraft(recipe.draft)
      setSavedRecipes((prev) => (prev.includes(savedKey) ? prev : [...prev, savedKey]))
      setMessages((prev) =>
        prev.map((message, idx) =>
          idx === msgIndex
            ? {
                ...message,
                recipeData: message.recipeData
                  ? {
                      ...message.recipeData,
                      recipeId: detail.recipe.id,
                    }
                  : message.recipeData,
              }
            : message,
        ),
      )
      window.location.assign(`/recipes/${detail.recipe.id}`)
    } catch (error) {
      upsertAssistantMessage(error instanceof Error ? `保存菜谱失败：${error.message}` : '保存菜谱失败')
    } finally {
      setSavingRecipeKeys((prev) => prev.filter((item) => item !== savedKey))
    }
  }

  async function handleApprovalSelection(approval: AIPendingApproval, selection: AIApprovalOption | AIApprovalOption[]) {
    if (sendBusy) return
    const selectedOptions = Array.isArray(selection) ? selection : [selection]
    if (selectedOptions.length === 0) return
    const optionIds = selectedOptions.map((item) => item.id)
    const selectionTitle = selectedOptions.map((item) => item.title).join('、')
    setContinueSessionPrompt(null)
    shouldAutoScrollRef.current = true
    setSendBusy(true)
    try {
      const sentAt = new Date().toISOString()
      setMessages((prev) => {
        const marked = prev.map((m) =>
          m.role === 'assistant' && m.approval?.id === approval.id && !m.approvalResolved
            ? {
                ...m,
                approvalResolved: {
                  optionId: optionIds[0] ?? '',
                  optionIds,
                  title: selectionTitle,
                  titles: selectedOptions.map((item) => item.title),
                  prompt: m.approval?.prompt,
                },
              }
            : m,
        )
        return [
          ...marked,
          {
            role: 'user',
            content:
              selectedOptions.length > 1
                ? `我选这些偏好：${selectionTitle}`
                : `我选《${selectionTitle}》`,
            createdAt: sentAt,
          },
        ]
      })
      await runStreamRequest(
        selectedOptions.length > 1 ? `我选择了这些偏好：${selectionTitle}` : `我选择了《${selectionTitle}》`,
        [],
        {
          approval_id: approval.id,
          option_id: optionIds[0] ?? '',
          option_ids: optionIds,
          confirmed: true,
        },
      )
    } catch (error) {
      upsertAssistantMessage(error instanceof Error ? `继续推荐失败：${error.message}` : '继续推荐失败')
    } finally {
      setSendBusy(false)
    }
  }

  async function handleRetryKnowledgeIngest(_messageIndex: number, documentId?: string) {
    if (!documentId || sendBusy) return
    setSendBusy(true)
    try {
      const result = await retryChatKnowledgeIngest(documentId, activeSessionId ?? undefined)
      upsertAssistantMessage(`已开始重试这份资料，无需重新上传。处理完成后我会继续通知你。`)
      if (result.media_asset_id) {
        const watch = [{ asset_id: result.media_asset_id, name: result.title || undefined }]
        setKnowledgeIngestProgress((prev) => ({
          ...prev,
          [result.media_asset_id!]: result.title ? `${result.title}: ${result.stage_label || '准备重试…'}` : (result.stage_label || '准备重试…'),
        }))
        void watchKnowledgeIngestProgress(watch, activeSessionId ?? sessionIdRef.current ?? undefined)
      }
    } catch (error) {
      upsertAssistantMessage(error instanceof Error ? `重试入库失败：${error.message}` : '重试入库失败')
    } finally {
      setSendBusy(false)
    }
  }

  async function onImagePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0 || sendBusy) return
    appendPendingAttachments(
      files.map((file) => ({
        file,
        type: 'image' as const,
        previewUrl: URL.createObjectURL(file),
      })),
    )
  }

  function handleInputPaste(e: React.ClipboardEvent<HTMLElement>) {
    if (sendBusy) {
      return
    }

    const items = Array.from(e.clipboardData?.items ?? [])
    const imageFiles = items
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item, index) => {
        const file = item.getAsFile()
        if (!file) return null
        const extension = file.type.split('/')[1] || 'png'
        return new File([file], file.name || `pasted-image-${Date.now()}-${index}.${extension}`, {
          type: file.type || 'image/png',
        })
      })
      .filter((file): file is File => Boolean(file))

    if (imageFiles.length === 0) {
      return
    }

    e.preventDefault()
    appendPendingAttachments(
      imageFiles.map((file) => ({
        file,
        type: 'image' as const,
        previewUrl: URL.createObjectURL(file),
      })),
    )
  }

  let activeStreamingAssistantIndex = -1
  if (sendBusy) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'assistant') {
        activeStreamingAssistantIndex = index
        break
      }
    }
  }

  return (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void onImagePicked(e)}
      />
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onImagePicked(e)} multiple />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md,.markdown,.json,.xml,.csv,.docx"
        className="hidden"
        onChange={(e) => void onFilePicked(e)}
        multiple
      />

      <AnimatePresence>
        {authed && !isOpen && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            onClick={openAI}
            className="fixed bottom-24 right-4 z-90 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-gray-900 text-white shadow-2xl shadow-gray-900/40 transition-transform hover:scale-105"
          >
            <Bot className="h-7 w-7" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {authed && isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeAI}
              className="fixed inset-0 z-100 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed z-101 flex flex-col overflow-hidden bg-gray-50 shadow-2xl ${
                isFullscreen ? 'inset-0 h-dvh rounded-none' : 'bottom-0 left-0 right-0 h-[85vh] rounded-t-3xl'
              }`}
            >
              <div className="absolute left-0 right-0 top-0 z-10 flex shrink-0 items-center justify-between border-b border-gray-100 bg-white/80 p-4 backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-50 text-orange-500">
                    <Bot className="h-5 w-5" />
                  </div>
                  <h3 className="font-bold text-gray-900">厨艺助理 AI</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsFullscreen((current) => !current)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
                  >
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryOpen((current) => !current)}
                    className={`flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium transition-colors ${
                      historyOpen ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <History className="h-4 w-4" />
                    历史
                  </button>
                  <button type="button" onClick={closeAI} className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

                            {historyOpen ? (
                <AIChatHistory
                  sessions={sessions}
                  sessionsBusy={sessionsBusy}
                  activeSessionId={activeSessionId}
                  isFullscreen={isFullscreen}
                  onSelectSession={(id) => void loadSessionHistory(id)}
                  onDeleteSession={(id) => void handleDeleteSession(id)}
                  onNewChat={() => {
                    resetConversation()
                    setContinueSessionPrompt(null)
                    setHistoryOpen(false)
                  }}
                />
              ) : null}

              <AIChatMessages
                messages={messages}
                activeStreamingAssistantIndex={activeStreamingAssistantIndex}
                sendBusy={sendBusy}
                detailMessage={detailMessage}
                setDetailMessage={setDetailMessage}
                pageContext={pageContext}
                activeSessionId={activeSessionId}
                continueSessionPrompt={continueSessionPrompt}
                setContinueSessionPrompt={setContinueSessionPrompt}
                loadSessionHistory={loadSessionHistory}
                loadingMoreMessages={loadingMoreMessages}
                hasMoreMessages={hasMoreMessages}
                loadMoreSentinelRef={loadMoreSentinelRef}
                messagesTopChromeRef={messagesTopChromeRef}
                messageListRef={messageListRef}
                messageEndRef={messageEndRef}
                streamingContentRef={streamingContentRef}
                streamingReasoningRef={streamingReasoningRef}
                historyBusy={historyBusy}
                toggleReasoning={toggleReasoning}
                toggleContentCollapsed={toggleContentCollapsed}
                toggleToolList={toggleToolList}
                  toggleSearchResults={toggleSearchResults}
                  toggleToolCall={toggleToolCall}
                  onApprovalSelect={handleApprovalSelection}
                  onRetryKnowledgeIngest={handleRetryKnowledgeIngest}
                  onSaveRecipe={handleSaveRecipe}
                  savedRecipes={savedRecipes}
                  savingRecipeKeys={savingRecipeKeys}
                  formatSessionTime={formatSessionTime}
                getVisibleAgentTrace={getVisibleAgentTrace}
              />


              <AIChatComposer
                inputValue={inputValue}
                setInputValue={setInputValue}
                sendBusy={sendBusy}
                voiceBusy={voiceBusy}
                isRecording={isRecording}
                voiceHint={voiceHint}
                pendingAttachments={pendingAttachments}
                removePendingAttachment={removePendingAttachment}
                onSend={handleSend}
                onPaste={handleInputPaste}
                micButtonRef={micButtonRef}
                runMicToggleFromGesture={runMicToggleFromGesture}
                micLastRealTouchTs={micLastRealTouchTs}
                startRecording={startRecording}
                finishRecording={finishRecording}
                reasoningEnabled={reasoningEnabled}
                setReasoningEnabled={setReasoningEnabled}
                webSearchEnabled={webSearchEnabled}
                setWebSearchEnabled={setWebSearchEnabled}
                imageRecipeEnabled={imageRecipeEnabled}
                setImageRecipeEnabled={setImageRecipeEnabled}
                uploadStageLabel={uploadStageLabel}
                knowledgeIngestProgress={knowledgeIngestProgress}
                activeCooking={activeCooking}
                closeAI={closeAI}
                drawerOpen={drawerOpen}
                setDrawerOpen={setDrawerOpen}
                cameraInputRef={cameraInputRef}
                imageInputRef={imageInputRef}
                fileInputRef={fileInputRef}
                onImagePicked={onImagePicked}
                onFilePicked={onFilePicked}
                onScreenshot={handleScreenshot}
                messagesHasUser={messages.some((m) => m.role === "user")}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}












