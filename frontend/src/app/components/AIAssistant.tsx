import { useState, useRef, useEffect } from 'react'
import html2canvas from 'html2canvas'
import { useAI } from '../contexts/AIContext'
import { motion, AnimatePresence } from 'motion/react'
import { X, Mic, Image as ImageIcon, Paperclip, Camera, Send, Bot, ChefHat, Clock, Check, FileText, ChevronDown, ChevronUp, History, Plus, Trash2, Maximize2, Minimize2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from './ui/drawer'
import type {
  QuoteContext,
  AISessionSummary,
  AIHistoryMessage,
  AIAttachment,
  AIAgentTrace,
  AIApprovalOption,
  AIApprovalResponse,
  AIPendingApproval,
  AIRecipeCardMeta,
  AITextRecipeDraft,
  AIWorkflowStep,
  AIToolCall,
} from '../../lib/api/client'
import {
  createTextRecipeDraft,
  deleteAiSession,
  getAuthSession,
  isAuthenticated,
  listAiMessages,
  listAiSessions,
  subscribeAuthSession,
  streamAiMessage,
  uploadMedia,
} from '../../lib/api/client'
import { useVoiceRecorder, type VoiceRecorderResult } from '../../components/media/useVoiceRecorder'

type Message = {
  id?: string
  role: 'user' | 'assistant'
  content: string
  contentCollapsed?: boolean
  contentExpandable?: boolean
  contentStreamingView?: boolean
  attachments?: Array<{ kind: 'image' | 'file' | 'audio'; name: string; previewUrl?: string; url?: string; contentType?: string }>
  reasoning?: {
    content: string
    collapsed: boolean
  }
  type?: 'text' | 'recipe_card'
  recipeData?: {
    recipeId?: string
    title: string
    summary?: string
    coverImageUrl?: string
    ingredients: string[]
    time: string
    difficulty: string
    status?: string
    source?: string
    isRecipe?: boolean
    rejectReason?: string
    draft?: AITextRecipeDraft
  }
  workflow?: AIWorkflowStep[]
  agentTrace?: AIAgentTrace[]
  toolCalls?: AIToolCall[]
  approval?: AIPendingApproval
  /** Set when user picked an option; buttons stay hidden for this message. */
  approvalResolved?: { optionId: string; title: string; prompt?: string }
  toolsExpanded?: boolean
}

type PendingAttachment = {
  id: string
  type: 'image' | 'document'
  file: File
  name: string
  previewUrl?: string
}

function toRecipeData(card: AIRecipeCardMeta): NonNullable<Message['recipeData']> {
  return {
    recipeId: card.recipe_id,
    title: card.title,
    summary: card.summary,
    coverImageUrl: card.cover_image_url ?? card.draft?.cover_image_url,
    ingredients: card.ingredients ?? [],
    time: card.time,
    difficulty: card.difficulty,
    status: card.status,
    source: card.source,
    isRecipe: card.is_recipe,
    rejectReason: card.reject_reason,
    draft: card.draft,
  }
}

function buildQuoteContext(pageContext: unknown): QuoteContext {
  const serialized =
    pageContext && typeof pageContext === 'object' ? JSON.stringify(pageContext) : ''
  return {
    selected_text: serialized.slice(0, 2000),
    selection_source: 'aicook_app',
    surrounding_text: '',
    scene: 'assistant',
  }
}

const WELCOME: Message = {
  role: 'assistant',
  content: '你好！我是你的家庭厨艺助手。无论是找菜谱、问做法，还是传图让我解析菜谱，我都在！',
}

const AI_ASSISTANT_STORAGE_PREFIX = 'aicook-ai-assistant'
const STREAMING_CONTENT_THRESHOLD = 320
const COLLAPSIBLE_CONTENT_THRESHOLD = 220
const MESSAGE_PAGE_SIZE = 5

function MarkdownBlock({ content }: { content: string }) {
  return (
    <div className="wrap-break-word text-[15px] leading-relaxed [&_a]:text-orange-600 [&_a]:underline [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_code]:py-0.5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-gray-900 [&_pre]:p-3 [&_pre]:text-sm [&_pre]:text-white [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

function serializeMessages(messages: Message[]) {
  return messages.map((message) => ({
    ...message,
    attachments: message.attachments?.map((item) => ({
      ...item,
      previewUrl: item.previewUrl?.startsWith('blob:') ? undefined : item.previewUrl,
    })),
  }))
}

function shouldCollapseContent(content: string) {
  return content.trim().length > COLLAPSIBLE_CONTENT_THRESHOLD
}

function normalizeMessageDisplayState(message: Message): Message {
  if (message.role !== 'assistant') {
    return {
      ...message,
      contentCollapsed: false,
      contentExpandable: false,
      contentStreamingView: false,
    }
  }
  const expandable = typeof message.contentExpandable === 'boolean'
    ? message.contentExpandable
    : shouldCollapseContent(message.content)
  return {
    ...message,
    contentExpandable: expandable,
    contentCollapsed: typeof message.contentCollapsed === 'boolean' ? message.contentCollapsed : expandable,
    contentStreamingView: Boolean(message.contentStreamingView),
  }
}

export default function AIAssistant() {
  const { isOpen, openAI, closeAI, pageContext } = useAI()
  const [authed, setAuthed] = useState(() => isAuthenticated())
  const [inputValue, setInputValue] = useState('')
  const [savedRecipes, setSavedRecipes] = useState<string[]>([])
  const [savingRecipeKeys, setSavingRecipeKeys] = useState<string[]>([])
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const messageEndRef = useRef<HTMLDivElement>(null)
  const streamingContentRef = useRef<HTMLDivElement>(null)
  const streamingReasoningRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)

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
  const [reasoningEnabled, setReasoningEnabled] = useState(false)
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [imageRecipeEnabled, setImageRecipeEnabled] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [detailMessage, setDetailMessage] = useState<{ title: string; content: string } | null>(null)
  const { busy: voiceBusy, recording: isRecording, hint: voiceHint, startRecording, finishRecording } = useVoiceRecorder((result) => {
    const normalized = (result.transcription.text || '').trim()
    if (!normalized) return
    void handleVoiceMessage(result)
  }, { resetHint: '长按输入框说话' })

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
    return () => {
      setPendingAttachments((current) => {
        for (const item of current) {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
        }
        return current
      })
    }
  }, [])

  const storageKey = (() => {
    const session = getAuthSession()
    const householdId = session?.current_household?.id || 'anon'
    return `${AI_ASSISTANT_STORAGE_PREFIX}:${householdId}`
  })()

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        sessionId?: string | null
        messages?: Message[]
        sessionMessageCache?: Record<string, Message[]>
        reasoningEnabled?: boolean
        webSearchEnabled?: boolean
        imageRecipeEnabled?: boolean
      }
      if (parsed.sessionId) {
        sessionIdRef.current = parsed.sessionId
        setActiveSessionId(parsed.sessionId)
      }
      if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
        setMessages(parsed.messages.map(normalizeMessageDisplayState))
      }
      if (parsed.sessionMessageCache && typeof parsed.sessionMessageCache === 'object') {
        setSessionMessageCache(
          Object.fromEntries(
            Object.entries(parsed.sessionMessageCache).map(([sessionId, sessionMessages]) => [
              sessionId,
              Array.isArray(sessionMessages) ? sessionMessages.map(normalizeMessageDisplayState) : [WELCOME],
            ]),
          ),
        )
      }
      if (typeof parsed.reasoningEnabled === 'boolean') {
        setReasoningEnabled(parsed.reasoningEnabled)
      }
      if (typeof parsed.webSearchEnabled === 'boolean') {
        setWebSearchEnabled(parsed.webSearchEnabled)
      }
      if (typeof parsed.imageRecipeEnabled === 'boolean') {
        setImageRecipeEnabled(parsed.imageRecipeEnabled)
      }
    } catch {
      window.localStorage.removeItem(storageKey)
    }
  }, [storageKey])

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

  useEffect(() => {
    if (!isOpen || historyBusy || !shouldAutoScrollRef.current) return
    const raf = window.requestAnimationFrame(() => {
      messageEndRef.current?.scrollIntoView({ block: 'end', behavior: sendBusy ? 'auto' : 'smooth' })
    })
    return () => window.cancelAnimationFrame(raf)
  }, [isOpen, messages.length, sendBusy, historyBusy, isFullscreen, historyOpen])

  useEffect(() => {
    if (!isOpen || !sendBusy) return
    const raf = window.requestAnimationFrame(() => {
      if (streamingContentRef.current) {
        streamingContentRef.current.scrollTop = streamingContentRef.current.scrollHeight
      }
      if (streamingReasoningRef.current) {
        streamingReasoningRef.current.scrollTop = streamingReasoningRef.current.scrollHeight
      }
      if (shouldAutoScrollRef.current) {
        messageEndRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' })
      }
    })
    return () => window.cancelAnimationFrame(raf)
  }, [isOpen, messages, sendBusy])

  useEffect(() => {
    if (!sessionIdRef.current) return
    const sessionId = sessionIdRef.current
    const persistedMessages = messages.length > 0 ? messages : [WELCOME]
    setSessionMessageCache((prev) => {
      const existing = prev[sessionId]
      if (JSON.stringify(existing ?? []) === JSON.stringify(persistedMessages)) {
        return prev
      }
      return {
        ...prev,
        [sessionId]: persistedMessages,
      }
    })
  }, [messages])

  useEffect(() => {
    const persistedMessages = messages.length > 0 ? messages : [WELCOME]
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        sessionId: sessionIdRef.current,
        reasoningEnabled,
        webSearchEnabled,
        imageRecipeEnabled,
        sessionMessageCache: Object.fromEntries(
          Object.entries(sessionMessageCache).map(([sessionId, sessionMessages]) => [sessionId, serializeMessages(sessionMessages)]),
        ),
        messages: serializeMessages(persistedMessages),
      }),
    )
  }, [imageRecipeEnabled, messages, reasoningEnabled, sessionMessageCache, storageKey, webSearchEnabled])

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

  function mergeWorkflowSteps(existing: AIWorkflowStep[] | undefined, incoming: AIWorkflowStep): AIWorkflowStep[] {
    const items = [...(existing ?? [])]
    const index = items.findIndex((item) => item.id === incoming.id)
    if (index >= 0) {
      items[index] = { ...items[index], ...incoming }
      return items
    }
    return [...items, incoming]
  }

  function mergeToolCalls(existing: AIToolCall[] | undefined, incoming: AIToolCall): AIToolCall[] {
    const items = [...(existing ?? [])]
    const key = incoming.call_id || `${incoming.name}:${incoming.arguments ?? ''}`
    const index = items.findIndex((item) => (item.call_id || `${item.name}:${item.arguments ?? ''}`) === key)
    if (index >= 0) {
      items[index] = { ...items[index], ...incoming }
      return items
    }
    return [...items, incoming]
  }

  function mergeAgentTrace(existing: AIAgentTrace[] | undefined, incoming: AIAgentTrace): AIAgentTrace[] {
    const items = [...(existing ?? [])]
    const index = items.findIndex((item) => item.id === incoming.id)
    if (index >= 0) {
      items[index] = { ...items[index], ...incoming }
      return items
    }
    return [...items, incoming]
  }

  function getVisibleAgentTrace(items: AIAgentTrace[] | undefined) {
    return (items ?? []).filter((item) => {
      const content = `${item.detail ?? ''} ${item.name ?? ''}`
      return !content.includes('切换到工具 agent')
        && !content.includes('切换到多模态 agent')
        && !content.includes('文本对话')
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
          title: ar.title ?? '',
          prompt: ar.prompt,
        }
      : undefined
    return {
      id: item.id,
      role: item.role,
      content: item.content,
      contentExpandable: expandable,
      contentCollapsed: expandable,
      contentStreamingView: false,
      attachments: item.attachments.map((attachment) => ({
        kind: attachment.type === 'image' ? 'image' : attachment.type === 'audio' ? 'audio' : 'file',
        name: attachment.name || (attachment.type === 'image' ? '图片' : attachment.type === 'audio' ? '语音' : '文件'),
        url: attachment.url || undefined,
        contentType: attachment.content_type || undefined,
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

  async function loadOlderMessages() {
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
        const olderMessages = incoming.filter((item) => !item.id || !existingIds.has(item.id))
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
  }

  async function handleDeleteSession(sessionId: string) {
    if (!window.confirm('删除这个会话后将无法在历史中查看，确认删除吗？')) return
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
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: '',
        contentCollapsed: false,
        contentExpandable: false,
        contentStreamingView: false,
        reasoning: reasoningEnabled ? { content: '', collapsed: false } : undefined,
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
            content: `${last.reasoning?.content ?? ''}${chunk}`,
            collapsed: false,
          },
        }))
      },
      onStatusDelta: (step) => {
        updateLastAssistantMessage((last) => ({
          ...last,
          workflow: mergeWorkflowSteps(last.workflow, step),
        }))
      },
      onAgentDelta: (agentItem) => {
        updateLastAssistantMessage((last) => ({
          ...last,
          agentTrace: mergeAgentTrace(last.agentTrace, agentItem),
        }))
      },
      onToolCall: (toolCall) => {
        updateLastAssistantMessage((last) => ({
          ...last,
          toolCalls: mergeToolCalls(last.toolCalls, toolCall),
        }))
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
    }))
    if (reply.session_id) {
      sessionIdRef.current = reply.session_id
      setActiveSessionId(reply.session_id)
    }
    await refreshSessions()
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
    setMessages((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (last?.role === 'assistant') {
        next[next.length - 1] = normalizeMessageDisplayState({ ...last, content, contentStreamingView: false })
      } else {
        next.push(normalizeMessageDisplayState({ role: 'assistant', content }))
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
            },
          ],
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
    setInputValue('')
    setSendBusy(true)
    try {
      const queued = [...pendingAttachments]
      const uploadedAttachments: AIAttachment[] = []
      for (const item of queued) {
        const asset = await uploadMedia(item.file, item.type === 'image' ? 'images' : 'knowledge')
        uploadedAttachments.push({
          type: item.type === 'image' ? 'image' : 'document',
          url: asset.storage_url,
          content_type: asset.content_type || item.file.type || 'application/octet-stream',
          name: item.file.name,
          asset_id: asset.id,
        })
      }

      shouldAutoScrollRef.current = true
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
        },
      ])

      await runStreamRequest(t || '请结合我上传的附件继续回答。', uploadedAttachments)
      setPendingAttachments([])
    } catch (e) {
      upsertAssistantMessage(e instanceof Error ? `请求失败：${e.message}` : '请求失败')
    } finally {
      setSendBusy(false)
    }
  }

  const handleActionClick = (action: string) => {
    setMessages((prev) => [...prev, { role: 'user', content: `[操作: 上传${action}]` }])
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
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: recipe.title ? `《${recipe.title}》草稿已经生成，但还没有拿到可保存的结构化内容。` : '菜谱草稿已经生成。',
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

  async function handleApprovalSelection(approval: AIPendingApproval, option: AIApprovalOption) {
    if (sendBusy) return
    setContinueSessionPrompt(null)
    shouldAutoScrollRef.current = true
    setSendBusy(true)
    try {
      setMessages((prev) => {
        const marked = prev.map((m) =>
          m.role === 'assistant' && m.approval?.id === approval.id && !m.approvalResolved
            ? {
                ...m,
                approvalResolved: {
                  optionId: option.id,
                  title: option.title,
                  prompt: m.approval?.prompt,
                },
              }
            : m,
        )
        return [
          ...marked,
          {
            role: 'user',
            content: `我选《${option.title}》`,
          },
        ]
      })
      await runStreamRequest(
        `我选择了《${option.title}》`,
        [],
        {
          approval_id: approval.id,
          option_id: option.id,
          confirmed: true,
        },
      )
    } catch (error) {
      upsertAssistantMessage(error instanceof Error ? `继续推荐失败：${error.message}` : '继续推荐失败')
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

  function handleInputPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
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

  function renderAssistantContent(msg: Message, idx: number, isStreamingMessage: boolean) {
    const hasContent = msg.content.trim().length > 0
    if (!hasContent) {
      return null
    }

    const useStreamingWindow = isStreamingMessage
    const useCollapsedWindow = !isStreamingMessage && msg.contentExpandable
    const contentContainerClass = useStreamingWindow
      ? 'max-h-64 overflow-y-auto'
      : useCollapsedWindow && msg.contentCollapsed
        ? 'max-h-44 overflow-hidden'
        : ''

    return (
      <div className="w-full">
        <div
          ref={useStreamingWindow ? streamingContentRef : null}
          className={`rounded-2xl px-4 py-3 text-[15px] leading-relaxed rounded-tl-sm border border-gray-100 bg-white text-gray-800 shadow-sm ${contentContainerClass}`}
        >
          <MarkdownBlock content={msg.content} />
        </div>
        {useCollapsedWindow && msg.contentCollapsed ? (
          <div className="-mt-12 h-12 rounded-b-2xl bg-linear-to-t from-white via-white/95 to-transparent" />
        ) : null}
        {useStreamingWindow || useCollapsedWindow ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
            {useStreamingWindow ? <span>生成中，内容会在窗口内自动滚动</span> : null}
            {useCollapsedWindow ? (
              <>
                <button
                  type="button"
                  onClick={() => toggleContentCollapsed(idx)}
                  className="rounded-full bg-gray-100 px-3 py-1 text-gray-600"
                >
                  {msg.contentCollapsed ? '展开全文' : '收起'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDetailMessage({
                      title: '完整回答',
                      content: msg.content,
                    })
                  }
                  className="rounded-full bg-gray-100 px-3 py-1 text-gray-600"
                >
                  详细查看
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
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
        accept=".pdf,.doc,.docx,.txt,.md,.json,.csv,.ppt,.pptx,.xls,.xlsx"
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
                <div className={`absolute inset-x-4 top-20 z-20 overflow-hidden rounded-2xl border border-gray-100 bg-white/95 shadow-lg backdrop-blur-md ${isFullscreen ? 'bottom-24' : ''}`}>
                  <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">最近会话</div>
                      <div className="text-xs text-gray-400">服务器历史为准，本地仅保留最近缓存</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        resetConversation()
                        setContinueSessionPrompt(null)
                        setHistoryOpen(false)
                      }}
                      className="flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-600"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      新对话
                    </button>
                  </div>
                  <div className={`space-y-2 overflow-y-auto p-3 ${isFullscreen ? 'max-h-[calc(100dvh-180px)]' : 'max-h-[34vh]'}`}>
                    {sessionsBusy ? <div className="text-xs text-gray-400">加载中…</div> : null}
                    {!sessionsBusy && sessions.length === 0 ? <div className="text-xs text-gray-400">还没有历史会话</div> : null}
                    {sessions.map((session) => {
                      const isActive = activeSessionId === session.id
                      return (
                        <div
                          key={session.id}
                          className={`flex items-center gap-2 rounded-2xl border px-3 py-2 ${
                            isActive ? 'border-orange-200 bg-orange-50' : 'border-gray-100 bg-gray-50'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => void loadSessionHistory(session.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="truncate text-sm font-medium text-gray-900">{session.title || '未命名对话'}</div>
                            <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
                              <span>{session.scene || 'assistant'}</span>
                              {formatSessionTime(session.updated_at) ? <span>{formatSessionTime(session.updated_at)}</span> : null}
                              {isActive ? <span className="text-orange-500">当前</span> : null}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              void handleDeleteSession(session.id)
                            }}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              <div ref={messageListRef} className="flex-1 min-h-0 space-y-6 overflow-y-auto p-4 pb-5 pt-20">
                {detailMessage ? (
                  <div className="absolute inset-0 z-40 bg-gray-50/95 backdrop-blur-sm">
                    <div className="flex h-full flex-col">
                      <div className="flex items-center justify-between border-b border-gray-100 bg-white/90 px-4 py-4">
                        <div className="text-base font-semibold text-gray-900">{detailMessage.title}</div>
                        <button
                          type="button"
                          onClick={() => setDetailMessage(null)}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto px-4 py-4">
                        <MarkdownBlock content={detailMessage.content} />
                      </div>
                    </div>
                  </div>
                ) : null}
                {pageContext?.type === 'cooking' && (
                  <div className="sticky top-0 z-20 mx-auto mb-6 flex w-max items-center gap-1.5 rounded-full border border-orange-100 bg-orange-50 px-3 py-1.5 text-xs text-orange-600 shadow-sm">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-orange-500" />
                    正在制作《{pageContext.recipe}》
                  </div>
                )}
                {!activeSessionId && continueSessionPrompt ? (
                  <div className="rounded-2xl border border-orange-100 bg-white px-4 py-3 shadow-sm">
                    <div className="text-sm font-medium text-gray-900">检测到你上次的会话</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {continueSessionPrompt.title || '未命名对话'}
                      {formatSessionTime(continueSessionPrompt.updated_at) ? ` · ${formatSessionTime(continueSessionPrompt.updated_at)}` : ''}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void loadSessionHistory(continueSessionPrompt.id, false)}
                        className="rounded-full bg-orange-500 px-3 py-1.5 text-xs font-medium text-white"
                      >
                        继续会话
                      </button>
                      <button
                        type="button"
                        onClick={() => setContinueSessionPrompt(null)}
                        className="rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-600"
                      >
                        新会话开始
                      </button>
                    </div>
                  </div>
                ) : null}
                {activeSessionId ? (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => void loadOlderMessages()}
                      disabled={loadingMoreMessages || !hasMoreMessages}
                      className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 disabled:opacity-50"
                    >
                      {loadingMoreMessages ? '加载中…' : hasMoreMessages ? '加载更早消息' : '没有更早消息了'}
                    </button>
                  </div>
                ) : null}
                {messages.map((msg, idx) => {
                  const visibleAgentTrace = getVisibleAgentTrace(msg.agentTrace)
                  return (
                  <div key={msg.id ?? idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex max-w-[80%] flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      {msg.role === 'assistant' && msg.reasoning ? (
                        <div className="w-full min-w-[240px] overflow-hidden rounded-2xl bg-linear-to-b from-gray-100/90 via-gray-100/55 to-gray-100/80">
                          <button
                            type="button"
                            onClick={() => toggleReasoning(idx)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-gray-500 hover:text-gray-700"
                          >
                            <span>{msg.reasoning.collapsed ? '查看思考过程' : '思考过程'}</span>
                            {msg.reasoning.collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                          </button>
                          {!msg.reasoning.collapsed ? (
                            <div className="relative border-t border-gray-200/40">
                              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-4 bg-linear-to-b from-gray-200/70 to-transparent" />
                              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-4 bg-linear-to-t from-gray-200/70 to-transparent" />
                              <div
                                ref={idx === activeStreamingAssistantIndex ? streamingReasoningRef : null}
                                className="max-h-48 overflow-y-auto px-3 py-2 text-xs leading-6 text-gray-600 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                              >
                                <MarkdownBlock content={msg.reasoning.content || '思考中...'} />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {msg.role === 'assistant'
                        ? renderAssistantContent(msg, idx, idx === activeStreamingAssistantIndex)
                        : (
                          <div className="rounded-2xl rounded-tr-sm bg-gray-900 px-4 py-3 text-[15px] leading-relaxed text-white">
                            <MarkdownBlock content={msg.content} />
                          </div>
                        )}

                      {visibleAgentTrace.length ? (
                        <div className="w-full space-y-1 px-1">
                          {visibleAgentTrace.map((item) => (
                            <div key={item.id} className="flex items-center gap-1.5 text-[11px] text-gray-400">
                              <span className={`h-1.5 w-1.5 rounded-full ${item.status === 'done' ? 'bg-emerald-400' : item.status === 'running' ? 'animate-pulse bg-orange-400' : 'bg-gray-300'}`} />
                              <span>{item.detail || item.name}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {msg.toolCalls?.length ? (
                        <div className="w-full space-y-1 px-1">
                          {(() => {
                            const runningTool = msg.toolCalls.find((t) => t.status === 'start' || t.status === 'running')
                            const allDone = msg.toolCalls.every((t) => t.status === 'success' || t.status === 'error')
                            const getToolDisplayName = (name: string) => {
                              return name === 'web_search'
                                ? '网页搜索'
                                : name === 'knowledge_lookup'
                                  ? '知识库检索'
                                  : name === 'recipe_query'
                                    ? '菜谱查询'
                                    : name === 'image_recipe_create'
                                      ? '图文识别'
                                      : name
                            }

                            if (runningTool && !msg.toolsExpanded) {
                              return (
                                <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
                                  <span className="animate-pulse">正在{getToolDisplayName(runningTool.name)}...</span>
                                </div>
                              )
                            }

                            if (allDone && !msg.toolsExpanded) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => toggleToolList(idx)}
                                  className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600"
                                >
                                  <Check className="h-3 w-3 text-emerald-500" />
                                  <span>已完成 {msg.toolCalls.length} 项操作</span>
                                  <ChevronDown className="h-3 w-3" />
                                </button>
                              )
                            }

                            return (
                              <div className="space-y-1">
                                {allDone && (
                                  <button
                                    type="button"
                                    onClick={() => toggleToolList(idx)}
                                    className="mb-2 flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600"
                                  >
                                    <Check className="h-3 w-3 text-emerald-500" />
                                    <span>已完成 {msg.toolCalls.length} 项操作</span>
                                    <ChevronUp className="h-3 w-3" />
                                  </button>
                                )}
                                {msg.toolCalls.map((toolCall, toolIdx) => (
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
                                      {toolCall.result ? (
                                        toolCall.collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />
                                      ) : null}
                                    </button>
                                    {toolCall.result && !toolCall.collapsed ? (
                                      <div className="max-h-48 overflow-y-auto border-t border-gray-200/50 px-3 py-2 text-xs leading-6 text-gray-600">
                                        {(() => {
                                          try {
                                            const parsed = JSON.parse(toolCall.result)
                                            if (toolCall.name === 'web_search' && parsed.results) {
                                              return (
                                                <div className="space-y-3">
                                                  {parsed.results.map((res: any, i: number) => (
                                                    <div key={i} className="space-y-1">
                                                      <a href={res.document_id} target="_blank" rel="noreferrer" className="font-medium text-orange-600 hover:underline">
                                                        {res.title}
                                                      </a>
                                                      <div className="line-clamp-2 text-gray-500">{res.snippet}</div>
                                                    </div>
                                                  ))}
                                                </div>
                                              )
                                            }
                                            if (toolCall.name === 'recipe_query' && parsed.matches) {
                                              return (
                                                <div className="space-y-2">
                                                  {parsed.matches.map((match: any, i: number) => (
                                                    <div key={i} className="flex items-center gap-2 rounded-lg bg-white/50 p-2">
                                                      <ChefHat className="h-4 w-4 text-orange-400" />
                                                      <span className="font-medium text-gray-700">{match.title}</span>
                                                    </div>
                                                  ))}
                                                  {parsed.matches.length === 0 && <div className="text-gray-400">未找到相关菜谱</div>}
                                                </div>
                                              )
                                            }
                                          } catch (e) {
                                            // fallback to raw text
                                          }
                                          return <div className="whitespace-pre-wrap wrap-break-word">{toolCall.result}</div>
                                        })()}
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            )
                          })()}
                        </div>
                      ) : null}

                      {msg.workflow?.length ? (
                        <div className="w-full space-y-2 rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-sm">
                          <div className="text-[11px] font-semibold tracking-wide text-gray-400">WORKFLOW</div>
                          {msg.workflow.map((step) => (
                            <div key={step.id} className="flex items-start justify-between gap-3 text-xs">
                              <div className="min-w-0">
                                <div className="font-medium text-gray-700">{step.title}</div>
                                {step.detail ? <div className="mt-1 text-gray-400">{step.detail}</div> : null}
                              </div>
                              <span
                                className={`shrink-0 rounded-full px-2 py-1 ${
                                  step.status === 'done'
                                    ? 'bg-emerald-50 text-emerald-600'
                                    : step.status === 'running'
                                      ? 'bg-orange-50 text-orange-600'
                                      : 'bg-gray-100 text-gray-500'
                                }`}
                              >
                                {step.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {msg.approval?.options?.length || msg.approvalResolved ? (
                        <div className="mt-1 w-full rounded-2xl border border-orange-100 bg-orange-50/60 p-3">
                          <div className="mb-2 text-xs font-medium text-orange-700">
                            {msg.approvalResolved?.prompt ||
                              msg.approval?.prompt ||
                              '请选择一个候选，我继续整理'}
                          </div>
                          {msg.approvalResolved ? (
                            <div className="flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-2.5 text-sm text-emerald-900">
                              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                              <div>
                                <span className="font-medium">已选择</span>
                                <span className="text-emerald-800">：{msg.approvalResolved.title}</span>
                                <span className="mt-1 block text-xs font-normal text-emerald-700/90">选择已确认，无法更改</span>
                              </div>
                            </div>
                          ) : msg.approval?.options?.length ? (
                            <div className="space-y-2">
                              {msg.approval.options.map((option) => (
                                <button
                                  key={option.id}
                                  type="button"
                                  disabled={sendBusy}
                                  onClick={() => void handleApprovalSelection(msg.approval!, option)}
                                  className="w-full rounded-2xl border border-orange-100 bg-white px-3 py-3 text-left transition-colors hover:border-orange-200 hover:bg-orange-50 disabled:pointer-events-none disabled:opacity-50"
                                >
                                  <div className="text-sm font-semibold text-gray-900">{option.title}</div>
                                  {option.summary ? <div className="mt-1 text-xs leading-5 text-gray-500">{option.summary}</div> : null}
                                  {option.recipe_card?.time || option.recipe_card?.difficulty ? (
                                    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-gray-400">
                                      {option.recipe_card?.time ? <span>{option.recipe_card.time}</span> : null}
                                      {option.recipe_card?.difficulty ? <span>{option.recipe_card.difficulty}</span> : null}
                                    </div>
                                  ) : null}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {msg.attachments?.length ? (
                        <div className="flex flex-wrap gap-2">
                          {msg.attachments.map((item, attachmentIdx) =>
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
                              <div
                                key={`${item.name}-${attachmentIdx}`}
                                className="w-full max-w-xs rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-sm"
                              >
                                <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
                                  <Mic className="h-4 w-4 text-orange-500" />
                                  <span className="truncate">{item.name}</span>
                                </div>
                                {item.url ? (
                                  <audio controls preload="none" src={item.url} className="h-10 w-full" />
                                ) : (
                                  <div className="text-xs text-gray-400">音频地址暂不可用</div>
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

                      {msg.type === 'recipe_card' && msg.recipeData && !savedRecipes.includes(msg.recipeData.recipeId ?? msg.recipeData.title) && (
                        <div className="mt-1 w-full overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm">
                          <div className="relative h-36 w-full overflow-hidden bg-orange-50">
                            {msg.recipeData.coverImageUrl ? (
                              <img
                                src={msg.recipeData.coverImageUrl}
                                alt={msg.recipeData.title}
                                className="h-full w-full object-cover"
                              />
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
                                onClick={() => void handleSaveRecipe(idx, msg.recipeData)}
                                disabled={
                                  sendBusy
                                  || savingRecipeKeys.includes(msg.recipeData.recipeId ?? msg.recipeData.title)
                                }
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
                      )}
                    </div>
                  </div>
                )})}
                {historyBusy ? (
                  <div className="text-center text-xs text-gray-400">历史加载中…</div>
                ) : null}
                <div ref={messageEndRef} />
              </div>

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

                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setReasoningEnabled((current) => !current)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        reasoningEnabled
                          ? 'bg-orange-500 text-white'
                          : 'border border-gray-200 bg-gray-50 text-gray-600'
                      }`}
                    >
                      深度思考
                    </button>
                    <button
                      type="button"
                      onClick={() => setWebSearchEnabled((current) => !current)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        webSearchEnabled
                          ? 'bg-orange-500 text-white'
                          : 'border border-gray-200 bg-gray-50 text-gray-600'
                      }`}
                    >
                      联网
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageRecipeEnabled((current) => !current)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        imageRecipeEnabled
                          ? 'bg-orange-500 text-white'
                          : 'border border-gray-200 bg-gray-50 text-gray-600'
                      }`}
                    >
                      图文识别
                    </button>
                  </div>
                </div>

                {pendingAttachments.length ? (
                  <div className="mb-3 flex gap-2 overflow-x-auto px-1 hide-scrollbar">
                    {pendingAttachments.map((item) => (
                      <div
                        key={item.id}
                        className="relative shrink-0 overflow-hidden rounded-2xl border border-gray-100 bg-gray-50"
                      >
                        {item.type === 'image' ? (
                          item.previewUrl ? (
                            <img src={item.previewUrl} alt={item.name} className="h-20 w-20 object-cover" />
                          ) : (
                            <div className="flex h-20 w-20 items-center justify-center bg-gray-100 text-gray-400">
                              <ImageIcon className="h-5 w-5" />
                            </div>
                          )
                        ) : (
                          <div className="flex h-20 w-32 flex-col justify-center gap-1 px-3 text-gray-600">
                            <FileText className="h-5 w-5 text-gray-400" />
                            <div className="line-clamp-2 text-xs font-medium">{item.name}</div>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removePendingAttachment(item.id)}
                          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div
                  className="flex items-end gap-2 rounded-3xl border border-gray-200 bg-gray-50 p-1.5 transition-all focus-within:border-gray-900 focus-within:ring-1 focus-within:ring-gray-900"
                  onPointerDown={() => {
                    if (inputValue.trim() || sendBusy || voiceBusy) return
                    pressTimer.current = window.setTimeout(() => {
                      void startRecording()
                    }, 260)
                  }}
                  onPointerUp={(event) => {
                    if (pressTimer.current) {
                      clearTimeout(pressTimer.current)
                      pressTimer.current = null
                    }
                    if (isRecording) {
                      event.preventDefault()
                      void finishRecording()
                    }
                  }}
                  onPointerLeave={() => {
                    if (pressTimer.current) {
                      clearTimeout(pressTimer.current)
                      pressTimer.current = null
                    }
                    if (isRecording) {
                      void finishRecording()
                    }
                  }}
                  onPointerCancel={() => {
                    if (pressTimer.current) {
                      clearTimeout(pressTimer.current)
                      pressTimer.current = null
                    }
                    if (isRecording) {
                      void finishRecording()
                    }
                  }}
                >
                  <textarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onPaste={handleInputPaste}
                    placeholder={isRecording ? '正在录音，松开后自动发送...' : '问点什么，或长按输入框说话...'}
                    className="max-h-32 min-h-[44px] flex-1 resize-none border-none bg-transparent px-3 py-3 text-[15px] leading-normal text-gray-900 outline-none"
                    rows={1}
                    disabled={sendBusy || voiceBusy}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void handleSend()
                      }
                    }}
                  />

                  {inputValue.trim() || pendingAttachments.length ? (
                    <button
                      type="button"
                      disabled={sendBusy}
                      onClick={() => void handleSend()}
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
                              void handleScreenshot()
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
                </div>
                <div className="mt-2 text-center text-[10px] text-gray-400">
                  {inputValue.trim() || pendingAttachments.length
                    ? '按回车发送，可携带上方附件一起发出'
                    : isRecording || voiceBusy
                      ? voiceHint
                      : '长按输入框开始录音，松开后直接转写并发送'}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
