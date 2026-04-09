export type ID = string

export interface MediaAsset {
  id: ID
  household_id?: ID
  user_id?: ID
  storage_url: string
  file_name: string
  media_type: string
  content_type?: string
  object_key?: string
  bucket?: string
}

export interface HouseholdSummary {
  id: ID
  name: string
  share_code?: string
  timezone?: string
}

export interface UserProfile {
  id: ID
  household_id?: ID
  username: string
  phone?: string
  display_name: string
  email?: string
  status?: string
  /** Signed GET URL when user has avatar */
  avatar_url?: string
}

export interface AuthSession {
  token: string
  user: UserProfile
  current_household: HouseholdSummary
  households: HouseholdSummary[]
}

export interface KitchenTag {
  id: ID
  household_id?: ID
  name: string
  icon?: string
  color?: string
  type?: number
}

export interface ActiveCooking {
  recipe_id: ID
  title: string
  cover_image_url: string
  step_index: number
  total_steps: number
  timer_total_seconds: number
  remaining_seconds: number
  updated_at_ms: number
  timer_running: boolean
}

export interface RecipeCard {
  id: ID
  title: string
  summary: string
  cover_image_url: string
  /** Extra recipe photos (cover remains thumbnail for lists). */
  gallery_image_urls?: string[]
  total_minutes: number
  difficulty: number
  status: string
  category?: string
  scenario_tags?: string[]
  flavor_tags?: string[]
  tools?: string[]
  /** Backend metadata struct: servings, ingredients_ready, etc. */
  metadata?: Record<string, unknown>
}

export interface RecipeIngredient {
  id: ID
  recipe_id: ID
  sort_order: number
  group_name: string
  name: string
  amount_text: string
  preparation: string
  remark?: string
}

export interface RecipeStep {
  id: ID
  recipe_id: ID
  step_no: number
  title: string
  description: string
  step_type: string
  need_timer: boolean
  timer_seconds: number
  timer_animation: string
  heat_level?: string
  end_condition?: string
  safety_tips?: string
  ai_hint?: string
  media_url?: string
  media_urls?: string[]
}

export interface RecipeDetail {
  recipe: RecipeCard & {
    owner_user_id?: ID
    language?: string
    source_type?: string
    tools?: string[]
    flavor_tags?: string[]
    scenario_tags?: string[]
    gallery_image_urls?: string[]
  }
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
}

export interface UpdateRecipePayload {
  title: string
  summary?: string
  cover_image_url?: string
  gallery_image_urls?: string[]
  category?: string
  status?: 'draft' | 'published'
  total_minutes?: number
  difficulty?: number
  tools?: string[]
  scenario_tags?: string[]
  flavor_tags?: string[]
  metadata?: Record<string, unknown>
  ingredients: Array<{
    group_name?: string
    name: string
    amount_text?: string
    preparation?: string
    remark?: string
  }>
  steps: Array<{
    title?: string
    description: string
    step_type?: string
    need_timer?: boolean
    timer_seconds?: number
    timer_animation?: string
    end_condition?: string
    media_url?: string
    media_urls?: string[]
  }>
}

export interface QuoteContext {
  selected_text: string
  selection_source: string
  surrounding_text: string
  scene: string
}

export interface SourceSnippet {
  title: string
  document_id: ID
  snippet: string
  site_name?: string
  publish_time?: string
  logo_url?: string
}

export interface AIAttachment {
  type: string
  url: string
  content_type: string
  name: string
  asset_id?: ID
}

export interface AIWorkflowStep {
  id: string
  title: string
  status: string
  detail?: string
}

export interface AIAgentTrace {
  id: string
  name: string
  status: string
  detail?: string
}

export interface AIToolCall {
  call_id?: string
  name: string
  status: string
  arguments?: string
  result?: string
  collapsed?: boolean
}

export interface AIRecipeCardMeta {
  recipe_id?: ID
  title: string
  summary: string
  cover_image_url?: string
  ingredients: string[]
  time: string
  difficulty: string
  status?: string
  source?: string
  is_recipe?: boolean
  reject_reason?: string
  draft?: AITextRecipeDraft
}

export interface AITextRecipeDraftIngredient {
  group_name: string
  name: string
  amount_text: string
  preparation: string
}

export interface AITextRecipeDraftStep {
  title: string
  description: string
  step_type: string
  need_timer: boolean
  timer_seconds: number
  timer_animation: string
  end_condition: string
}

export interface AITextRecipeDraft {
  title: string
  summary: string
  category: string
  cover_image_url?: string
  total_minutes: number
  difficulty: number
  tools: string[]
  scenario_tags: string[]
  flavor_tags: string[]
  ingredients: AITextRecipeDraftIngredient[]
  steps: AITextRecipeDraftStep[]
}

export interface AIApprovalOption {
  id: string
  title: string
  summary?: string
  recipe_card?: AIRecipeCardMeta
  preference_key?: string
  value?: string
}

export interface AIPendingApproval {
  id: string
  kind: string
  prompt: string
  status?: string
  selection_mode?: 'single' | 'multi'
  step_index?: number
  step_total?: number
  allow_skip?: boolean
  selected_option_ids?: string[]
  options: AIApprovalOption[]
}

/** Persisted when user confirms an approval interrupt (see biz persistAssistantApprovalChoice). */
export interface AIApprovalResolvedMeta {
  approval_id?: string
  option_id: string
  option_ids?: string[]
  title?: string
  titles?: string[]
  confirmed?: boolean
  prompt?: string
}

export interface AIApprovalResponse {
  /** Official interrupt ID returned by backend approval event */
  approval_id: string
  option_id: string
  option_ids?: string[]
  confirmed: boolean
  selection?: AIApprovalOption
}

export interface AIResponseMeta {
  intent?: string
  reasoning_content?: string
  agent_trace?: AIAgentTrace[]
  workflow?: AIWorkflowStep[]
  tool_calls?: AIToolCall[]
  search_results?: SourceSnippet[]
  search_error?: string
  recipe_card?: AIRecipeCardMeta
  pending_approval?: AIPendingApproval
  approval_resolved?: AIApprovalResolvedMeta
  timeline?: AIStreamEvent[]
  /** 厨艺 AI 入库完成等系统通知（见后端 metadata.kind） */
  kind?: string
}

export interface SpeechSegment {
  start_ms: number
  end_ms: number
  text: string
  score: number
}

export interface KnowledgeBase {
  id: ID
  name: string
  description: string
  status: string
  default_top_k?: number
  default_chunk_size?: number
}

export interface KnowledgeDocument {
  id: ID
  knowledge_base_id: ID
  media_asset_id?: ID
  title: string
  file_name: string
  content_type: string
  status: string
  processing_stage?: string
  chunk_count?: number
  summary: string
  text_content?: string
}

export interface HouseholdAIMemory {
  id: ID
  scope: string
  content: string
  source?: string
  user_id?: ID
  created_at?: string
  updated_at?: string
}

export interface AIReply {
  reply_content: string
  reasoning_content?: string
  reply_mode: string
  reply_model?: string
  is_fallback?: boolean
  reply_sources: SourceSnippet[]
  reply_metadata?: AIResponseMeta
  /** 厨艺 AI 文档附件入库：前端可轮询 /chat/knowledge-ingest/status */
  knowledge_ingest_watch?: Array<{ asset_id: string; name?: string }>
}

export interface AISessionSummary {
  id: ID
  scene: string
  title: string
  recipe_id?: ID
  created_at?: string
  updated_at?: string
}

export interface AIHistoryMessage {
  id: ID
  ai_session_id: ID
  role: 'user' | 'assistant'
  content: string
  mode?: string
  quote_context?: QuoteContext
  attachments: AIAttachment[]
  response_sources: SourceSnippet[]
  response_meta?: AIResponseMeta
  created_at?: string
  updated_at?: string
}

export interface StreamAiMessageOptions {
  sessionId?: ID
  title?: string
  text: string
  quoteContext: QuoteContext
  attachments?: AIAttachment[]
  reasoningEnabled?: boolean
  webSearchEnabled?: boolean
  imageRecipeEnabled?: boolean
  approvalResponse?: AIApprovalResponse
  onStart?: (payload: { session_id?: ID; scene?: string; title?: string }) => void
  onAnswerDelta?: (chunk: string) => void
  onReasoningDelta?: (chunk: string) => void
  onAgentDelta?: (agent: AIAgentTrace) => void
  onStatusDelta?: (step: AIWorkflowStep) => void
  onToolCall?: (toolCall: AIToolCall) => void
  onRecipeCard?: (card: AIRecipeCardMeta) => void
  onApproval?: (approval: AIPendingApproval) => void
  onEvent?: (event: AIStreamEvent) => void
}

export interface AIStreamEvent {
  kind: 'answer' | 'reasoning' | 'agent' | 'status' | 'tool_call' | 'recipe_card' | 'approval'
  run_id?: ID
  message_id?: ID
  seq?: number
  part_type?: string
  call_id?: string
  content?: string
  metadata?: Record<string, unknown>
}

const SSE_TOOL_EVENTS = new Set([
  'web_search',
  'knowledge_lookup',
  'recipe_query',
  'image_recipe_create',
  'save_household_memory',
  'recipe_generate',
  'recipe_recommend',
])

export interface ImportJob {
  id: ID
  status: string
  stage: string
  recipe_id?: ID
  normalized_payload?: {
    ocr_text?: string
    draft?: {
      title?: string
      summary?: string
      category?: string
      total_minutes?: number
      difficulty?: number
      tools?: string[]
      ingredients?: Array<{
        group_name?: string
        name?: string
        amount_text?: string
        preparation?: string
      }>
      steps?: Array<{
        title?: string
        description?: string
        timer_seconds?: number
      }>
    }
  }
}

export interface VoiceTranscriptionResult {
  text: string
  confidence: number
  segments: SpeechSegment[]
  status?: string
  error?: string
}

export interface RecipeDraftCard {
  recipe_id?: ID
  title: string
  summary: string
  ingredients: string[]
  time: string
  difficulty: string
}

interface UploadPrepareReply {
  asset_id: ID
  object_key: string
  upload_url: string
  upload_headers?: Array<{ key: string; value: string }>
}

function normalizeUploadPrepare(raw: any): UploadPrepareReply {
  const uploadHeaders = raw.upload_headers ?? raw.uploadHeaders ?? []
  return {
    asset_id: normalizeId(raw.asset_id ?? raw.assetId),
    object_key: raw.object_key ?? raw.objectKey ?? '',
    upload_url: raw.upload_url ?? raw.uploadUrl ?? '',
    upload_headers: Array.isArray(uploadHeaders)
      ? uploadHeaders.map((item: any) => ({
          key: item.key ?? '',
          value: item.value ?? '',
        }))
      : [],
  }
}

function unwrapPayload<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

function normalizeId(value: unknown): ID {
  return typeof value === 'string' ? value : String(value ?? '')
}

function normalizeQuoteContext(raw: any): QuoteContext | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  return {
    selected_text: raw.selected_text ?? raw.selectedText ?? '',
    selection_source: raw.selection_source ?? raw.selectionSource ?? '',
    surrounding_text: raw.surrounding_text ?? raw.surroundingText ?? '',
    scene: raw.scene ?? '',
  }
}

function normalizeAttachment(raw: any): AIAttachment {
  const assetRaw = raw.asset_id ?? raw.assetId
  return {
    type: raw.type ?? '',
    url: raw.url ?? '',
    content_type: raw.content_type ?? raw.contentType ?? '',
    name: raw.name ?? '',
    asset_id: assetRaw != null && assetRaw !== '' ? normalizeId(assetRaw) : undefined,
  }
}

function normalizeSourceSnippet(raw: any): SourceSnippet {
  return {
    title: raw.title ?? '',
    document_id: normalizeId(raw.document_id ?? raw.documentId),
    snippet: raw.snippet ?? '',
    site_name: raw.site_name ?? raw.siteName ?? undefined,
    publish_time: raw.publish_time ?? raw.publishTime ?? undefined,
    logo_url: raw.logo_url ?? raw.logoUrl ?? undefined,
  }
}

function normalizeWorkflowStep(raw: any): AIWorkflowStep {
  return {
    id: raw.id ?? raw.step_id ?? raw.stepId ?? '',
    title: raw.title ?? '',
    status: raw.status ?? '',
    detail: raw.detail ?? undefined,
  }
}

function normalizeAgentTrace(raw: any): AIAgentTrace {
  return {
    id: raw.id ?? raw.name ?? '',
    name: raw.name ?? raw.id ?? '',
    status: raw.status ?? '',
    detail: raw.detail ?? undefined,
  }
}

function normalizeToolCall(raw: any): AIToolCall {
  return {
    call_id: raw.call_id ?? raw.callId ?? undefined,
    name: raw.name ?? '',
    status: raw.status ?? '',
    arguments: raw.arguments ?? undefined,
    result: raw.result ?? undefined,
  }
}

function normalizeCompatToolEvent(eventName: string, payload: any): AIToolCall {
  const normalizedName = String(eventName || '').trim()
  if (Array.isArray(payload)) {
    return {
      name: normalizedName,
      status: 'success',
      result: JSON.stringify({ results: payload }),
    }
  }
  if (payload && typeof payload === 'object') {
    const toolCall = normalizeToolCall({
      ...payload,
      name: payload.name ?? normalizedName,
      status: payload.status ?? 'success',
      result:
        payload.result ??
        (payload.results || payload.query || payload.answer || payload.summary
          ? JSON.stringify(payload)
          : undefined),
    })
    if (toolCall.name) return toolCall
  }
  return {
    name: normalizedName,
    status: 'success',
    result: typeof payload === 'string' ? payload : JSON.stringify(payload ?? {}),
  }
}

function normalizeStreamEvent(kind: AIStreamEvent['kind'], raw: any): AIStreamEvent {
  const metadata: Record<string, unknown> = { ...raw }
  delete metadata.content
  delete metadata.run_id
  delete metadata.runId
  delete metadata.message_id
  delete metadata.messageId
  delete metadata.seq
  delete metadata.part_type
  delete metadata.partType
  delete metadata.call_id
  delete metadata.callId
  return {
    kind,
    run_id: raw.run_id ?? raw.runId ? normalizeId(raw.run_id ?? raw.runId) : undefined,
    message_id: raw.message_id ?? raw.messageId ? normalizeId(raw.message_id ?? raw.messageId) : undefined,
    seq: raw.seq ? Number(raw.seq) : undefined,
    part_type: raw.part_type ?? raw.partType ?? undefined,
    call_id: raw.call_id ?? raw.callId ?? undefined,
    content: raw.content ?? undefined,
    metadata,
  }
}

function normalizeRecipeCardMeta(raw: any): AIRecipeCardMeta {
  return {
    recipe_id: raw.recipe_id ?? raw.recipeId ? normalizeId(raw.recipe_id ?? raw.recipeId) : undefined,
    title: raw.title ?? '识别结果',
    summary: raw.summary ?? '',
    cover_image_url: raw.cover_image_url ?? raw.coverImageUrl ?? raw.draft?.cover_image_url ?? raw.draft?.coverImageUrl ?? undefined,
    ingredients: Array.isArray(raw.ingredients)
      ? raw.ingredients.map((item: any) => String(item ?? '').trim()).filter(Boolean)
      : [],
    time: raw.time ?? '时长待确认',
    difficulty: raw.difficulty ?? '待确认',
    status: raw.status ?? undefined,
    source: raw.source ?? undefined,
    is_recipe:
      typeof raw.is_recipe === 'boolean' ? raw.is_recipe : typeof raw.isRecipe === 'boolean' ? raw.isRecipe : undefined,
    reject_reason: raw.reject_reason ?? raw.rejectReason ?? undefined,
    draft: raw.draft && typeof raw.draft === 'object'
      ? {
          title: raw.draft.title ?? '',
          summary: raw.draft.summary ?? '',
          category: raw.draft.category ?? '',
          cover_image_url: raw.draft.cover_image_url ?? raw.draft.coverImageUrl ?? undefined,
          total_minutes: Number(raw.draft.total_minutes ?? raw.draft.totalMinutes ?? 0),
          difficulty: Number(raw.draft.difficulty ?? 0),
          tools: Array.isArray(raw.draft.tools) ? raw.draft.tools.map((item: any) => String(item ?? '').trim()).filter(Boolean) : [],
          scenario_tags: Array.isArray(raw.draft.scenario_tags ?? raw.draft.scenarioTags)
            ? (raw.draft.scenario_tags ?? raw.draft.scenarioTags).map((item: any) => String(item ?? '').trim()).filter(Boolean)
            : [],
          flavor_tags: Array.isArray(raw.draft.flavor_tags ?? raw.draft.flavorTags)
            ? (raw.draft.flavor_tags ?? raw.draft.flavorTags).map((item: any) => String(item ?? '').trim()).filter(Boolean)
            : [],
          ingredients: Array.isArray(raw.draft.ingredients)
            ? raw.draft.ingredients.map((item: any) => ({
                group_name: String(item?.group_name ?? item?.groupName ?? '').trim(),
                name: String(item?.name ?? '').trim(),
                amount_text: String(item?.amount_text ?? item?.amountText ?? '').trim(),
                preparation: String(item?.preparation ?? '').trim(),
              })).filter((item: AITextRecipeDraftIngredient) => Boolean(item.name))
            : [],
          steps: Array.isArray(raw.draft.steps)
            ? raw.draft.steps.map((item: any) => ({
                title: String(item?.title ?? '').trim(),
                description: String(item?.description ?? '').trim(),
                step_type: String(item?.step_type ?? item?.stepType ?? 'cook').trim() || 'cook',
                need_timer: Boolean(item?.need_timer ?? item?.needTimer),
                timer_seconds: Number(item?.timer_seconds ?? item?.timerSeconds ?? 0),
                timer_animation: String(item?.timer_animation ?? item?.timerAnimation ?? '').trim(),
                end_condition: String(item?.end_condition ?? item?.endCondition ?? '').trim(),
              })).filter((item: AITextRecipeDraftStep) => Boolean(item.description))
            : [],
        }
      : undefined,
  }
}

function normalizeApprovalOption(raw: any): AIApprovalOption {
  return {
    id: normalizeId(raw.id),
    title: raw.title ?? '',
    summary: raw.summary ?? undefined,
    recipe_card: raw.recipe_card ?? raw.recipeCard ? normalizeRecipeCardMeta(raw.recipe_card ?? raw.recipeCard) : undefined,
    preference_key: raw.preference_key ?? raw.preferenceKey ?? undefined,
    value: raw.value ?? undefined,
  }
}

function normalizePendingApproval(raw: any): AIPendingApproval {
  return {
    id: normalizeId(raw.id),
    kind: raw.kind ?? '',
    prompt: raw.prompt ?? '',
    status: raw.status ?? undefined,
    selection_mode: (raw.selection_mode ?? raw.selectionMode ?? 'single') === 'multi' ? 'multi' : 'single',
    step_index: raw.step_index != null ? Number(raw.step_index) : raw.stepIndex != null ? Number(raw.stepIndex) : undefined,
    step_total: raw.step_total != null ? Number(raw.step_total) : raw.stepTotal != null ? Number(raw.stepTotal) : undefined,
    allow_skip: raw.allow_skip != null ? Boolean(raw.allow_skip) : raw.allowSkip != null ? Boolean(raw.allowSkip) : undefined,
    selected_option_ids: Array.isArray(raw.selected_option_ids ?? raw.selectedOptionIds)
      ? (raw.selected_option_ids ?? raw.selectedOptionIds).map((item: any) => normalizeId(item))
      : [],
    options: Array.isArray(raw.options) ? raw.options.map(normalizeApprovalOption) : [],
  }
}

function normalizeApprovalResolved(raw: any): AIApprovalResolvedMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const optionId = normalizeId(raw.option_id ?? raw.optionId ?? '')
  if (!optionId) return undefined
  return {
    approval_id:
      raw.approval_id ?? raw.approvalId
        ? normalizeId(String(raw.approval_id ?? raw.approvalId))
        : undefined,
    option_id: optionId,
    option_ids: Array.isArray(raw.option_ids ?? raw.optionIds)
      ? (raw.option_ids ?? raw.optionIds).map((item: any) => normalizeId(item))
      : undefined,
    title: raw.title != null ? String(raw.title) : undefined,
    titles: Array.isArray(raw.titles) ? raw.titles.map((item: any) => String(item ?? '')) : undefined,
    confirmed: raw.confirmed != null ? Boolean(raw.confirmed) : undefined,
    prompt: raw.prompt != null ? String(raw.prompt) : undefined,
  }
}

function normalizeAiResponseMeta(raw: any): AIResponseMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const approvalResolved = normalizeApprovalResolved(raw.approval_resolved ?? raw.approvalResolved)
  return {
    kind: raw.kind ?? undefined,
    intent: raw.intent ?? undefined,
    reasoning_content: raw.reasoning_content ?? raw.reasoningContent ?? undefined,
    agent_trace: Array.isArray(raw.agent_trace ?? raw.agentTrace)
      ? (raw.agent_trace ?? raw.agentTrace).map(normalizeAgentTrace)
      : [],
    workflow: Array.isArray(raw.workflow) ? raw.workflow.map(normalizeWorkflowStep) : [],
    tool_calls: Array.isArray(raw.tool_calls ?? raw.toolCalls)
      ? (raw.tool_calls ?? raw.toolCalls).map(normalizeToolCall)
      : [],
    search_results: Array.isArray(raw.search_results ?? raw.searchResults)
      ? (raw.search_results ?? raw.searchResults).map(normalizeSourceSnippet)
      : [],
    search_error: raw.search_error ?? raw.searchError ?? undefined,
    recipe_card: raw.recipe_card ?? raw.recipeCard ? normalizeRecipeCardMeta(raw.recipe_card ?? raw.recipeCard) : undefined,
    pending_approval:
      approvalResolved
        ? undefined
        : raw.pending_approval ?? raw.pendingApproval
          ? normalizePendingApproval(raw.pending_approval ?? raw.pendingApproval)
          : undefined,
    approval_resolved: approvalResolved,
    timeline: Array.isArray(raw.timeline)
      ? raw.timeline.map((item: any) =>
          normalizeStreamEvent(
            item.kind === 'reasoning'
              ? 'reasoning'
              : item.kind === 'agent_call'
                ? 'agent'
                : item.kind === 'status'
                  ? 'status'
                  : item.kind === 'tool_call'
                    ? 'tool_call'
                    : item.kind === 'recipe_card'
                      ? 'recipe_card'
                      : item.kind === 'approval'
                        ? 'approval'
                      : 'answer',
            item,
          ),
        )
      : [],
  }
}

function normalizeAiSession(raw: any): AISessionSummary {
  return {
    id: normalizeId(raw.id),
    scene: raw.scene ?? '',
    title: raw.title ?? '',
    recipe_id: raw.recipe_id ?? raw.recipeId ? normalizeId(raw.recipe_id ?? raw.recipeId) : undefined,
    created_at: raw.created_at ?? raw.createdAt ?? undefined,
    updated_at: raw.updated_at ?? raw.updatedAt ?? undefined,
  }
}

function normalizeAiHistoryMessage(raw: any): AIHistoryMessage {
  return {
    id: normalizeId(raw.id),
    ai_session_id: normalizeId(raw.ai_session_id ?? raw.aiSessionId),
    role: (raw.role ?? 'assistant') === 'user' ? 'user' : 'assistant',
    content: raw.content ?? '',
    mode: raw.mode ?? undefined,
    quote_context: normalizeQuoteContext(raw.quote_context ?? raw.quoteContext),
    attachments: Array.isArray(raw.attachments) ? raw.attachments.map(normalizeAttachment) : [],
    response_sources: Array.isArray(raw.response_sources ?? raw.responseSources)
      ? (raw.response_sources ?? raw.responseSources).map(normalizeSourceSnippet)
      : [],
    response_meta: normalizeAiResponseMeta(raw.response_meta ?? raw.responseMeta),
    created_at: raw.created_at ?? raw.createdAt ?? undefined,
    updated_at: raw.updated_at ?? raw.updatedAt ?? undefined,
  }
}

function formatDraftTime(totalMinutes?: number): string {
  const value = Number(totalMinutes ?? 0)
  if (value > 0) {
    return `${value} 分钟`
  }
  return '时长待确认'
}

function formatDraftDifficulty(difficulty?: number): string {
  const value = Number(difficulty ?? 0)
  if (value > 0) {
    return `${'★'.repeat(Math.min(value, 5))} ${value}`
  }
  return '待确认'
}

export function buildRecipeDraftCard(job: ImportJob): RecipeDraftCard | undefined {
  const draft = job.normalized_payload?.draft
  if (!draft?.title && !draft?.ingredients?.length) {
    return undefined
  }
  return {
    recipe_id: job.recipe_id,
    title: draft.title?.trim() || '已识别的菜谱草稿',
    summary: draft.summary?.trim() || '已根据图片识别生成草稿，请确认后保存到菜谱库。',
    ingredients: (draft.ingredients ?? [])
      .map((item) => item.name?.trim())
      .filter((item): item is string => Boolean(item))
      .slice(0, 6),
    time: formatDraftTime(draft.total_minutes),
    difficulty: formatDraftDifficulty(draft.difficulty),
  }
}

function normalizeHousehold(raw: any): HouseholdSummary {
  return {
    id: normalizeId(raw.id),
    name: raw.name ?? '',
    share_code: raw.share_code ?? raw.shareCode ?? '',
    timezone: raw.timezone ?? '',
  }
}

function normalizeUser(raw: any): UserProfile {
  const householdId = raw.household_id ?? raw.householdId
  return {
    id: normalizeId(raw.id),
    household_id: householdId ? normalizeId(householdId) : undefined,
    username: raw.username ?? '',
    phone: raw.phone ?? '',
    display_name: raw.display_name ?? raw.displayName ?? '',
    email: raw.email ?? '',
    status: raw.status ?? 'active',
    avatar_url: raw.avatar_url ?? raw.avatarUrl ?? '',
  }
}

/** Int64 / snowflake IDs must stay as strings; Number() loses precision past MAX_SAFE_INTEGER. */
function kitchenTagEntityId(raw: unknown): string {
  if (raw === undefined || raw === null || raw === '') return ''
  if (typeof raw === 'string') return raw.trim()
  if (typeof raw === 'number' && Number.isSafeInteger(raw)) return String(raw)
  if (typeof raw === 'number') return String(raw)
  return String(raw).trim()
}

function normalizeKitchenTag(raw: any): KitchenTag {
  const householdId = raw.household_id ?? raw.householdId
  const t = raw?.type
  const typeNum =
    t === undefined || t === null || t === '' ? undefined : Number(t)
  return {
    id: kitchenTagEntityId(raw?.id ?? raw?.Id),
    household_id: householdId ? kitchenTagEntityId(householdId) : undefined,
    name: raw.name ?? '',
    icon: raw.icon ?? '',
    color: raw.color ?? '',
    type: typeNum,
  }
}

function bustKitchenTagsListCache() {
  cache.delete(`${getAuthSession()?.current_household?.id || 'anon'}:GET:/api/v1/kitchen-tags`)
}

const AUTH_SESSION_KEY = 'aicook-auth-session'
const AUTH_EXPIRED_REASON_KEY = 'aicook-auth-expired-reason'
const authSessionListeners = new Set<() => void>()

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function getAuthSession(): AuthSession | null {
  if (!canUseStorage()) return null
  const raw = window.localStorage.getItem(AUTH_SESSION_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed?.token || !parsed?.user || !parsed?.current_household) return null
    return parsed as AuthSession
  } catch {
    return null
  }
}

export function setAuthSession(session: AuthSession | null) {
  if (!canUseStorage()) return
  if (!session) {
    window.localStorage.removeItem(AUTH_SESSION_KEY)
    authSessionListeners.forEach((listener) => listener())
    return
  }
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session))
  authSessionListeners.forEach((listener) => listener())
}

export function clearAuthSession() {
  setAuthSession(null)
}

export function subscribeAuthSession(listener: () => void) {
  authSessionListeners.add(listener)
  return () => {
    authSessionListeners.delete(listener)
  }
}

function setAuthExpiredReason(message: string) {
  if (!canUseStorage()) return
  window.sessionStorage.setItem(AUTH_EXPIRED_REASON_KEY, message)
}

export function consumeAuthExpiredReason(): string {
  if (!canUseStorage()) return ''
  const message = window.sessionStorage.getItem(AUTH_EXPIRED_REASON_KEY) || ''
  if (message) {
    window.sessionStorage.removeItem(AUTH_EXPIRED_REASON_KEY)
  }
  return message
}

export function isAuthenticated() {
  return Boolean(getAuthSession()?.token)
}

function normalizeRecipeCard(raw: any): RecipeCard {
  const meta = raw.metadata
  const scenarioTags = raw.scenario_tags ?? raw.scenarioTags
  const flavorTags = raw.flavor_tags ?? raw.flavorTags
  return {
    id: normalizeId(raw.id),
    title: raw.title ?? '',
    summary: raw.summary ?? '',
    cover_image_url: raw.cover_image_url ?? raw.coverImageUrl ?? '',
    gallery_image_urls: Array.isArray(raw.gallery_image_urls ?? raw.galleryImageUrls)
      ? (raw.gallery_image_urls ?? raw.galleryImageUrls).map((u: any) => String(u).trim()).filter(Boolean)
      : undefined,
    total_minutes: Number(raw.total_minutes ?? raw.totalMinutes ?? 0),
    difficulty: Number(raw.difficulty ?? 1),
    status: raw.status ?? 'draft',
    category: raw.category ?? '',
    scenario_tags: Array.isArray(scenarioTags) ? scenarioTags.map(String) : undefined,
    flavor_tags: Array.isArray(flavorTags) ? flavorTags.map(String) : undefined,
    tools: Array.isArray(raw.tools) ? raw.tools.map((t: any) => String(t)) : undefined,
    metadata:
      meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>) : undefined,
  }
}

function normalizeIngredient(raw: any): RecipeIngredient {
  return {
    id: normalizeId(raw.id),
    recipe_id: normalizeId(raw.recipe_id ?? raw.recipeId),
    sort_order: Number(raw.sort_order ?? raw.sortOrder ?? 0),
    group_name: raw.group_name ?? raw.groupName ?? '',
    name: raw.name ?? '',
    amount_text: raw.amount_text ?? raw.amountText ?? '',
    preparation: raw.preparation ?? '',
    remark: raw.remark ?? '',
  }
}

function normalizeStep(raw: any): RecipeStep {
  const primary = String(raw.media_url ?? raw.mediaUrl ?? '').trim()
  const listRaw = raw.media_urls ?? raw.mediaUrls
  const fromList = Array.isArray(listRaw)
    ? listRaw.map((u: any) => String(u).trim()).filter(Boolean)
    : []
  const media_urls = fromList.length ? fromList : primary ? [primary] : undefined
  return {
    id: normalizeId(raw.id),
    recipe_id: normalizeId(raw.recipe_id ?? raw.recipeId),
    step_no: Number(raw.step_no ?? raw.stepNo ?? 0),
    title: raw.title ?? '',
    description: raw.description ?? '',
    step_type: raw.step_type ?? raw.stepType ?? 'cook',
    need_timer: Boolean(raw.need_timer ?? raw.needTimer),
    timer_seconds: Number(raw.timer_seconds ?? raw.timerSeconds ?? 0),
    timer_animation: raw.timer_animation ?? raw.timerAnimation ?? 'ring',
    heat_level: raw.heat_level ?? raw.heatLevel ?? '',
    end_condition: raw.end_condition ?? raw.endCondition ?? '',
    safety_tips: raw.safety_tips ?? raw.safetyTips ?? '',
    ai_hint: raw.ai_hint ?? raw.aiHint ?? '',
    media_url: primary || media_urls?.[0] || '',
    media_urls,
  }
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const session = getAuthSession()
  const headers = new Headers(init?.headers ?? {})
  if (!headers.has('Content-Type') && init?.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }
  if (session?.token) {
    headers.set('Authorization', `Bearer ${session.token}`)
  }
  if (session?.current_household?.id) {
    headers.set('X-Household-ID', session.current_household.id)
  }

  const response = await fetch(input, {
    headers,
    ...init,
  })

  const text = await response.text()
  let payload: any = {}
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { raw: text }
    }
  }
  if (!response.ok) {
    const message = payload?.error?.message ?? payload?.message ?? '请求失败，请稍后重试'
    if (
      response.status === 401
      || payload?.reason === 'UNAUTHORIZED'
      || /jwt token has expired/i.test(String(message))
    ) {
      clearAuthSession()
      setAuthExpiredReason(message)
      if (typeof window !== 'undefined' && window.location.pathname !== '/auth') {
        window.location.replace('/auth')
      }
    }
    throw new Error(message)
  }
  return unwrapPayload<T>(payload)
}

async function prepareMediaUpload(file: File, kind: 'images' | 'audio' | 'knowledge'): Promise<UploadPrepareReply> {
  const mediaKind = kind === 'knowledge' ? 'knowledge_document' : kind
  const payload = await request<any>('/api/v1/media/uploads:prepare', {
    method: 'POST',
    body: JSON.stringify({
      media_kind: mediaKind,
      file_name: file.name,
      content_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
    }),
  })
  return normalizeUploadPrepare(payload)
}

function buildUploadHeaders(headers: UploadPrepareReply['upload_headers'], contentType: string) {
  const result = new Headers()
  for (const item of headers ?? []) {
    result.set(item.key, item.value)
  }
  if (!result.has('Content-Type')) {
    result.set('Content-Type', contentType || 'application/octet-stream')
  }
  return result
}

function putObjectXhr(
  uploadUrl: string,
  file: File,
  headers: UploadPrepareReply['upload_headers'],
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    const hdrs = buildUploadHeaders(headers, file.type)
    hdrs.forEach((value, key) => {
      xhr.setRequestHeader(key, value)
    })
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded, e.total)
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`上传到对象存储失败 (${xhr.status})`))
      }
    }
    xhr.onerror = () => reject(new Error('上传到对象存储失败'))
    xhr.send(file)
  })
}

async function putObject(
  uploadUrl: string,
  file: File,
  headers: UploadPrepareReply['upload_headers'],
  onProgress?: (loaded: number, total: number) => void,
) {
  if (onProgress) {
    await putObjectXhr(uploadUrl, file, headers, onProgress)
    return
  }
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: buildUploadHeaders(headers, file.type),
    body: file,
  })
  if (!response.ok) {
    throw new Error('上传到对象存储失败')
  }
}

const cache = new Map<string, { promise: Promise<any>; timestamp: number }>()
const CACHE_TTL_MS = 60000

function requestCached<T>(url: string, init?: RequestInit): Promise<T> {
  const session = getAuthSession()
  const key = `${session?.current_household?.id || 'anon'}:${init?.method || 'GET'}:${url}`
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.promise
  }

  const promise = request<T>(url, init).catch((err) => {
    cache.delete(key)
    throw err
  })

  cache.set(key, { promise, timestamp: now })
  return promise
}

function normalizeAuthSession(raw: any): AuthSession {
  return {
    token: raw.token ?? '',
    user: normalizeUser(raw.user ?? {}),
    current_household: normalizeHousehold(raw.current_household ?? raw.currentHousehold ?? {}),
    households: (raw.households ?? []).map(normalizeHousehold),
  }
}

export async function registerWithPassword(input: {
  username: string
  password: string
  display_name?: string
  phone?: string
  email?: string
  household_name?: string
}): Promise<AuthSession> {
  const payload = await request<any>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const session = normalizeAuthSession(payload)
  setAuthSession(session)
  return session
}

export async function loginWithPassword(username: string, password: string): Promise<AuthSession> {
  const payload = await request<any>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  const session = normalizeAuthSession(payload)
  setAuthSession(session)
  return session
}

export async function getMe(): Promise<AuthSession> {
  const payload = await request<any>('/api/v1/auth/me')
  const session = {
    ...(getAuthSession() ?? {}),
    ...normalizeAuthSession({
      token: getAuthSession()?.token ?? '',
      ...payload,
    }),
  } as AuthSession
  setAuthSession(session)
  return session
}

export type UpdateProfilePatch = {
  display_name?: string
  /** 设为新头像 asset id；`null` 表示清空头像；省略表示不改头像 */
  avatar_asset_id?: ID | null
}

export async function updateProfile(patch: UpdateProfilePatch): Promise<AuthSession> {
  const body: Record<string, unknown> = {}
  if (patch.display_name !== undefined) {
    body.displayName = patch.display_name
  }
  if (patch.avatar_asset_id !== undefined) {
    body.avatarAssetId = patch.avatar_asset_id === null ? 0 : String(patch.avatar_asset_id)
  }
  const payload = await request<any>('/api/v1/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  const session = {
    ...(getAuthSession() ?? {}),
    ...normalizeAuthSession({
      token: getAuthSession()?.token ?? '',
      ...payload,
    }),
  } as AuthSession
  setAuthSession(session)
  cache.clear()
  return session
}

export async function switchHousehold(householdId: ID): Promise<AuthSession> {
  const payload = await request<any>('/api/v1/auth/switch-household', {
    method: 'POST',
    body: JSON.stringify({ household_id: householdId }),
  })
  const session = normalizeAuthSession(payload)
  setAuthSession(session)
  cache.clear()
  return session
}

export async function createHousehold(name: string): Promise<HouseholdSummary> {
  const payload = await request<any>('/api/v1/households', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  return normalizeHousehold(payload.household ?? payload)
}

export async function createShareCode(): Promise<HouseholdSummary> {
  const payload = await request<any>('/api/v1/households/share-code', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return normalizeHousehold(payload.household ?? payload)
}

export async function listKitchenTags(): Promise<KitchenTag[]> {
  const payload = await requestCached<{ tags?: any[] }>('/api/v1/kitchen-tags')
  return (payload.tags ?? []).map(normalizeKitchenTag)
}

export async function createKitchenTag(name: string, icon = '', color = ''): Promise<KitchenTag> {
  const payload = await request<any>('/api/v1/kitchen-tags', {
    method: 'POST',
    body: JSON.stringify({ name, icon, color }),
  })
  bustKitchenTagsListCache()
  return normalizeKitchenTag(payload.tag ?? payload)
}

export async function updateKitchenTag(
  id: ID,
  input: { name: string; icon?: string; color?: string },
): Promise<KitchenTag> {
  const idStr = kitchenTagEntityId(id)
  if (!idStr) throw new Error('无效的标签 id')
  const payload = await request<any>(`/api/v1/kitchen-tags/${encodeURIComponent(idStr)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      id: idStr,
      name: input.name,
      icon: input.icon ?? '',
      color: input.color ?? '',
    }),
  })
  bustKitchenTagsListCache()
  return normalizeKitchenTag(payload.tag ?? payload)
}

export async function deleteKitchenTag(id: ID): Promise<void> {
  const idStr = kitchenTagEntityId(id)
  if (!idStr) throw new Error('无效的标签 id')
  await request(`/api/v1/kitchen-tags/${encodeURIComponent(idStr)}`, { method: 'DELETE' })
  bustKitchenTagsListCache()
}

function normalizeActiveCooking(raw: any): ActiveCooking {
  return {
    recipe_id: normalizeId(raw.recipe_id ?? raw.recipeId),
    title: raw.title ?? '',
    cover_image_url: raw.cover_image_url ?? raw.coverImageUrl ?? '',
    step_index: Number(raw.step_index ?? raw.stepIndex ?? 0),
    total_steps: Number(raw.total_steps ?? raw.totalSteps ?? 0),
    timer_total_seconds: Number(raw.timer_total_seconds ?? raw.timerTotalSeconds ?? 0),
    remaining_seconds: Number(raw.remaining_seconds ?? raw.remainingSeconds ?? 0),
    updated_at_ms: Number(raw.updated_at_ms ?? raw.updatedAtMs ?? 0),
    timer_running: Boolean(raw.timer_running ?? raw.timerRunning),
  }
}

export async function listActiveCooking(): Promise<ActiveCooking[]> {
  const payload = await request<any>('/api/v1/cooking/active')
  const items = payload.items ?? payload.Items ?? []
  return Array.isArray(items) ? items.map(normalizeActiveCooking) : []
}

export async function putActiveCooking(
  recipeId: ID,
  body: {
    step_index: number
    total_steps: number
    timer_total_seconds: number
    timer_started_at_ms: number
    timer_paused_remaining?: number
  },
): Promise<ActiveCooking> {
  const rid = String(recipeId).trim()
  const payload = await request<any>(`/api/v1/cooking/active/${encodeURIComponent(rid)}`, {
    method: 'PUT',
    body: JSON.stringify({
      recipe_id: rid,
      step_index: body.step_index,
      total_steps: body.total_steps,
      timer_total_seconds: body.timer_total_seconds,
      timer_started_at_ms: body.timer_started_at_ms,
      timer_paused_remaining: body.timer_paused_remaining ?? 0,
    }),
  })
  return normalizeActiveCooking(payload.item ?? payload)
}

export async function deleteActiveCooking(recipeId: ID): Promise<void> {
  const rid = String(recipeId).trim()
  await request(`/api/v1/cooking/active/${encodeURIComponent(rid)}`, { method: 'DELETE' })
}

export async function previewSharedKitchen(shareCode: string): Promise<{ household: HouseholdSummary; recipes: RecipeCard[] }> {
  const payload = await request<any>(`/api/v1/households/share/${encodeURIComponent(shareCode)}`)
  return {
    household: normalizeHousehold(payload.household ?? {}),
    recipes: (payload.recipes ?? []).map((item: any) => normalizeRecipeCard(item.recipe ?? item)),
  }
}

export async function importSharedRecipes(input: {
  share_code: string
  recipe_ids: ID[]
  kitchen_tag_id?: ID
  kitchen_tag_name?: string
}): Promise<{ recipes: RecipeCard[]; kitchen_tag?: KitchenTag }> {
  const payload = await request<any>(`/api/v1/households/share/${encodeURIComponent(input.share_code)}:import`, {
    method: 'POST',
    body: JSON.stringify({
      recipe_ids: input.recipe_ids.map((id) => Number(id)),
      kitchen_tag_id: input.kitchen_tag_id ? Number(input.kitchen_tag_id) : undefined,
      kitchen_tag_name: input.kitchen_tag_name ?? '',
    }),
  })
  cache.clear()
  return {
    recipes: (payload.recipes ?? []).map(normalizeRecipeCard),
    kitchen_tag: payload.kitchen_tag ? normalizeKitchenTag(payload.kitchen_tag) : undefined,
  }
}

export async function listRecipes(
  limit = 12,
  filters?: { keyword?: string; kitchenTag?: string; excludeDraft?: boolean; recipeStatus?: 'draft' | 'published' },
): Promise<RecipeCard[]> {
  const query = new URLSearchParams()
  query.set('limit', String(limit))
  if (filters?.keyword) query.set('keyword', filters.keyword)
  if (filters?.kitchenTag) query.set('kitchen_tag', filters.kitchenTag)
  if (filters?.excludeDraft) query.set('exclude_draft', 'true')
  if (filters?.recipeStatus) query.set('recipe_status', filters.recipeStatus)
  const payload = await requestCached<{ recipes?: any[] }>(`/api/v1/recipes?${query.toString()}`)
  return (payload.recipes ?? []).map(normalizeRecipeCard)
}

export async function getRecipeDetail(id: ID): Promise<RecipeDetail> {
  const payload = await requestCached<{ detail: any }>(`/api/v1/recipes/${id}`)
  return {
    recipe: normalizeRecipeCard(payload.detail.recipe),
    ingredients: (payload.detail.ingredients ?? []).map(normalizeIngredient),
    steps: (payload.detail.steps ?? []).map(normalizeStep),
  }
}

export async function updateRecipe(id: ID, body: UpdateRecipePayload): Promise<RecipeDetail> {
  const payload = await request<{ detail?: any }>(`/api/v1/recipes/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      id: Number(id),
      title: body.title,
      summary: body.summary ?? '',
      cover_image_url: body.cover_image_url ?? '',
      gallery_image_urls: body.gallery_image_urls ?? [],
      category: body.category ?? '',
      status: body.status ?? 'draft',
      total_minutes: body.total_minutes ?? 0,
      difficulty: body.difficulty ?? 2,
      tools: body.tools ?? [],
      scenario_tags: body.scenario_tags ?? [],
      flavor_tags: body.flavor_tags ?? [],
      metadata: body.metadata ?? {},
      ingredients: (body.ingredients ?? []).map((item) => ({
        group_name: item.group_name ?? '',
        name: item.name,
        amount_text: item.amount_text ?? '',
        preparation: item.preparation ?? '',
        remark: item.remark ?? '',
      })),
      steps: (body.steps ?? []).map((item) => ({
        title: item.title ?? '',
        description: item.description,
        step_type: item.step_type ?? 'cook',
        need_timer: Boolean(item.need_timer),
        timer_seconds: item.timer_seconds ?? 0,
        timer_animation: item.timer_animation ?? 'ring',
        end_condition: item.end_condition ?? '',
        media_url: item.media_url ?? (item.media_urls?.[0] ?? ''),
        media_urls: item.media_urls?.length ? item.media_urls : item.media_url ? [item.media_url] : [],
      })),
    }),
  })
  cache.clear()
  const detail = payload.detail ?? payload
  return {
    recipe: normalizeRecipeCard(detail.recipe),
    ingredients: (detail.ingredients ?? []).map(normalizeIngredient),
    steps: (detail.steps ?? []).map(normalizeStep),
  }
}

export async function deleteRecipe(id: ID): Promise<void> {
  await request(`/api/v1/recipes/${id}`, { method: 'DELETE' })
  cache.clear()
}

export async function uploadMedia(
  file: File,
  kind: 'images' | 'audio' | 'knowledge',
  onProgress?: (loaded: number, total: number) => void,
): Promise<MediaAsset> {
  const prepared = await prepareMediaUpload(file, kind)
  if (!prepared.upload_url) {
    throw new Error('后端未返回有效的上传地址')
  }
  await putObject(prepared.upload_url, file, prepared.upload_headers, onProgress)
  const payload = await request<{ asset: any }>(`/api/v1/media/uploads/${prepared.asset_id}:complete`, {
    method: 'POST',
    body: JSON.stringify({ asset_id: prepared.asset_id }),
  })
  const asset = payload.asset
  const householdId = asset.household_id ?? asset.householdId
  const userId = asset.user_id ?? asset.userId
  return {
    id: normalizeId(asset.id),
    household_id: householdId ? normalizeId(householdId) : undefined,
    user_id: userId ? normalizeId(userId) : undefined,
    storage_url: asset.storage_url ?? asset.storageUrl ?? '',
    file_name: asset.file_name ?? asset.fileName ?? file.name,
    media_type: asset.media_type ?? asset.mediaType ?? '',
    content_type: asset.content_type ?? asset.contentType ?? '',
    object_key: asset.object_key ?? asset.objectKey ?? '',
    bucket: asset.bucket ?? '',
  }
}

export async function transcribeAudio(assetId: ID): Promise<VoiceTranscriptionResult> {
  const payload = await request<any>('/api/v1/media/transcriptions', {
    method: 'POST',
    body: JSON.stringify({ asset_id: assetId }),
  })
  return {
    text: payload.text ?? '',
    confidence: Number(payload.confidence ?? 0),
    segments: Array.isArray(payload.segments)
      ? payload.segments.map((item: any) => ({
          start_ms: Number(item.start_ms ?? item.startMs ?? 0),
          end_ms: Number(item.end_ms ?? item.endMs ?? 0),
          text: item.text ?? '',
          score: Number(item.score ?? 0),
        }))
      : [],
    status: payload.status ?? undefined,
    error: payload.error ?? undefined,
  }
}

export async function createImageRecipeDraft(mediaAssetIds: ID[], titleHint = ''): Promise<ImportJob> {
  const payload = await request<{ job?: any }>('/api/v1/imports/image-recipes', {
    method: 'POST',
    body: JSON.stringify({
      media_asset_ids: mediaAssetIds,
      title_hint: titleHint,
    }),
  })
  const job = payload.job ?? payload
  return {
    id: normalizeId(job.id),
    status: job.status ?? '',
    stage: job.stage ?? '',
    recipe_id: job.recipe_id ? normalizeId(job.recipe_id) : undefined,
    normalized_payload: job.normalized_payload ?? undefined,
  }
}

export async function createTextRecipeDraft(draft: AITextRecipeDraft): Promise<RecipeDetail> {
  const payload = await request<{ detail?: any }>('/api/v1/recipes:draft', {
    method: 'POST',
    body: JSON.stringify({
      title: draft.title,
      summary: draft.summary,
      cover_image_url: draft.cover_image_url ?? '',
      category: draft.category,
      total_minutes: draft.total_minutes,
      difficulty: draft.difficulty,
      tools: draft.tools ?? [],
      scenario_tags: draft.scenario_tags ?? [],
      flavor_tags: draft.flavor_tags ?? [],
      ingredients: (draft.ingredients ?? []).map((item) => ({
        group_name: item.group_name,
        name: item.name,
        amount_text: item.amount_text,
        preparation: item.preparation,
      })),
      steps: (draft.steps ?? []).map((item) => ({
        title: item.title,
        description: item.description,
        step_type: item.step_type,
        need_timer: item.need_timer,
        timer_seconds: item.timer_seconds,
        timer_animation: item.timer_animation,
        end_condition: item.end_condition,
      })),
    }),
  })
  const detail = payload.detail ?? payload
  return {
    recipe: normalizeRecipeCard(detail.recipe),
    ingredients: (detail.ingredients ?? []).map(normalizeIngredient),
    steps: (detail.steps ?? []).map(normalizeStep),
  }
}

export async function createAiSession(scene: string, title: string, recipeId?: ID): Promise<{ id: ID }> {
  const payload = await request<{ session?: { id: ID } }>('/api/v1/ai/sessions', {
    method: 'POST',
    body: JSON.stringify({ scene, title, ...(recipeId ? { recipe_id: recipeId } : {}) }),
  })
  if (payload.session?.id) {
    return payload.session
  }
  return payload as { id: ID }
}

export async function listAiSessions(scene = '', limit = 30): Promise<AISessionSummary[]> {
  const query = new URLSearchParams()
  if (scene) query.set('scene', scene)
  if (limit > 0) query.set('limit', String(limit))
  const suffix = query.toString() ? `?${query.toString()}` : ''
  const payload = await request<{ sessions?: any[] }>(`/api/v1/ai/sessions${suffix}`)
  return Array.isArray(payload.sessions) ? payload.sessions.map(normalizeAiSession) : []
}

export interface ChatKnowledgeIngestStatus {
  pending: boolean
  settled: boolean
  document_id?: ID
  title: string
  processing_stage: string
  status: string
  chunk_count: number
  stage_label: string
}

export async function fetchChatKnowledgeIngestStatus(assetId: ID): Promise<ChatKnowledgeIngestStatus> {
  const payload = await request<any>(`/chat/knowledge-ingest/status?asset_id=${encodeURIComponent(String(assetId))}`)
  return {
    pending: Boolean(payload.pending),
    settled: Boolean(payload.settled),
    document_id: payload.document_id != null ? normalizeId(payload.document_id) : undefined,
    title: payload.title ?? '',
    processing_stage: payload.processing_stage ?? '',
    status: payload.status ?? '',
    chunk_count: Number(payload.chunk_count ?? 0),
    stage_label: payload.stage_label ?? '',
  }
}

export async function listAiMessages(
  sessionId: ID,
  options?: { limit?: number; beforeMessageId?: ID },
): Promise<{ session?: AISessionSummary; messages: AIHistoryMessage[]; has_more: boolean }> {
  const query = new URLSearchParams()
  const limit = options?.limit ?? 5
  if (limit > 0) query.set('limit', String(limit))
  if (options?.beforeMessageId) query.set('before_message_id', String(options.beforeMessageId))
  const suffix = query.toString() ? `?${query.toString()}` : ''
  const payload = await request<{ session?: any; messages?: any[]; has_more?: boolean }>(`/chat/sessions/${sessionId}/messages${suffix}`)
  return {
    session: payload.session ? normalizeAiSession(payload.session) : undefined,
    messages: Array.isArray(payload.messages) ? payload.messages.map(normalizeAiHistoryMessage) : [],
    has_more: Boolean(payload.has_more),
  }
}

export async function deleteAiSession(sessionId: ID): Promise<void> {
  await request(`/api/v1/ai/sessions/${sessionId}`, { method: 'DELETE' })
}

export async function sendAiMessage(
  sessionId: ID,
  text: string,
  quoteContext: QuoteContext,
  attachments?: AIAttachment[],
): Promise<AIReply> {
  const payload = await request<any>(`/api/v1/ai/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      text,
      scene: quoteContext.scene || 'quote',
      quote_context: quoteContext,
      attachments: attachments ?? [],
    }),
  })

  return {
    reply_content: payload.reply_content ?? payload.answer ?? '',
    reply_mode: payload.reply_mode ?? payload.mode ?? 'adk',
    reply_sources: payload.reply_sources ?? payload.sources ?? [],
    reply_metadata: normalizeAiResponseMeta(payload.reply_metadata ?? payload.metadata),
  }
}

export async function streamAiMessage(options: StreamAiMessageOptions): Promise<AIReply & { session_id?: ID }> {
  const session = getAuthSession()
  const headers = new Headers({
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  })
  if (session?.token) {
    headers.set('Authorization', `Bearer ${session.token}`)
  }
  if (session?.current_household?.id) {
    headers.set('X-Household-ID', session.current_household.id)
  }

  const response = await fetch('/chat/send', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...(options.sessionId ? { session_id: options.sessionId } : {}),
      ...(options.title ? { title: options.title } : {}),
      text: options.text,
      scene: options.quoteContext.scene || 'assistant',
      quote_context: options.quoteContext,
      attachments: options.attachments ?? [],
      reasoning_enabled: Boolean(options.reasoningEnabled),
      web_search_enabled: Boolean(options.webSearchEnabled),
      image_recipe_enabled: Boolean(options.imageRecipeEnabled),
      ...(options.approvalResponse ? { approval_response: options.approvalResponse } : {}),
    }),
  })

  if (!response.ok) {
    throw new Error(await response.text() || 'AI 流式请求失败')
  }
  if (!response.body) {
    throw new Error('浏览器不支持流式响应')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let replyContent = ''
  let reasoningContent = ''
  let replyMode = 'adk'
  let replyModel = ''
  let isFallback = false
  let sessionId = options.sessionId
  let replySources: SourceSnippet[] = []
  let replyMetadata: AIResponseMeta | undefined
  let knowledgeIngestWatch: Array<{ asset_id: string; name?: string }> | undefined

  const processEvent = (rawBlock: string) => {
    const block = rawBlock.trim()
    if (!block) return
    let event = 'message'
    const dataLines: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim())
      }
    }
    const rawData = dataLines.join('\n')
    const payload = rawData ? JSON.parse(rawData) : {}
    if (event === 'start') {
      sessionId = payload.session_id ? normalizeId(payload.session_id) : sessionId
      options.onStart?.({
        session_id: sessionId,
        scene: payload.scene ?? '',
        title: payload.title ?? '',
      })
      return
    }
    if (event === 'answer_delta' || event === 'delta') {
      options.onEvent?.(normalizeStreamEvent('answer', payload))
      const chunk = String(payload.content ?? '')
      if (!chunk) return
      replyContent += chunk
      options.onAnswerDelta?.(chunk)
      return
    }
    if (event === 'reasoning_delta') {
      options.onEvent?.(normalizeStreamEvent('reasoning', payload))
      const chunk = String(payload.content ?? '')
      if (!chunk) return
      reasoningContent += chunk
      options.onReasoningDelta?.(chunk)
      return
    }
    if (event === 'agent_delta') {
      options.onEvent?.(normalizeStreamEvent('agent', payload))
      options.onAgentDelta?.(normalizeAgentTrace(payload))
      return
    }
    if (event === 'status_delta') {
      options.onEvent?.(normalizeStreamEvent('status', payload))
      options.onStatusDelta?.(normalizeWorkflowStep(payload))
      return
    }
    if (event === 'tool_call') {
      options.onEvent?.(normalizeStreamEvent('tool_call', payload))
      options.onToolCall?.(normalizeToolCall(payload))
      return
    }
    if (SSE_TOOL_EVENTS.has(event)) {
      const compatToolCall = normalizeCompatToolEvent(event, payload)
      options.onEvent?.(
        normalizeStreamEvent('tool_call', {
          ...payload,
          name: compatToolCall.name,
          status: compatToolCall.status,
          result: compatToolCall.result,
        }),
      )
      options.onToolCall?.(compatToolCall)
      return
    }
    if (event === 'recipe_card') {
      options.onEvent?.(normalizeStreamEvent('recipe_card', payload.card ?? payload))
      options.onRecipeCard?.(normalizeRecipeCardMeta(payload.card ?? payload))
      return
    }
    if (event === 'approval') {
      const rawApproval = payload.approval ?? payload
      options.onEvent?.(normalizeStreamEvent('approval', rawApproval))
      options.onApproval?.(normalizePendingApproval(rawApproval))
      return
    }
    if (event === 'done') {
      replyContent = String(payload.reply_content ?? replyContent)
      reasoningContent = String(payload.reasoning_content ?? reasoningContent)
      replyMode = String(payload.reply_mode ?? replyMode)
      replyModel = String(payload.reply_model ?? replyModel)
      isFallback = Boolean(payload.is_fallback)
      sessionId = payload.session_id ? normalizeId(payload.session_id) : sessionId
      replySources = Array.isArray(payload.reply_sources ?? payload.sources)
        ? (payload.reply_sources ?? payload.sources).map(normalizeSourceSnippet)
        : replySources
      replyMetadata = normalizeAiResponseMeta(payload.reply_metadata ?? payload.metadata)
      if (!replyMetadata && (Array.isArray(payload.search_results) || payload.search_error)) {
        replyMetadata = normalizeAiResponseMeta({
          search_results: payload.search_results,
          search_error: payload.search_error,
        })
      }
      if (replyMetadata && (!replyMetadata.search_results || replyMetadata.search_results.length === 0) && Array.isArray(payload.search_results)) {
        replyMetadata.search_results = payload.search_results.map(normalizeSourceSnippet)
      }
      if (replyMetadata && !replyMetadata.search_error && payload.search_error) {
        replyMetadata.search_error = String(payload.search_error)
      }
      if (replyMetadata && !replyMetadata.reasoning_content && reasoningContent) {
        replyMetadata.reasoning_content = reasoningContent
      }
      if (Array.isArray(payload.knowledge_ingest_watch)) {
        knowledgeIngestWatch = payload.knowledge_ingest_watch.map((item: any) => ({
          asset_id: String(item.asset_id ?? item.assetId ?? ''),
          name: item.name != null ? String(item.name) : undefined,
        })).filter((x: { asset_id: string }) => x.asset_id)
      }
      return
    }
    if (event === 'error') {
      throw new Error(String(payload.message ?? 'AI 流式请求失败'))
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
    let splitIndex = buffer.indexOf('\n\n')
    while (splitIndex >= 0) {
      const block = buffer.slice(0, splitIndex)
      buffer = buffer.slice(splitIndex + 2)
      processEvent(block)
      splitIndex = buffer.indexOf('\n\n')
    }
    if (done) break
  }

  if (buffer.trim()) {
    processEvent(buffer)
  }

  return {
    session_id: sessionId,
    reply_content: replyContent,
    reasoning_content: reasoningContent,
    reply_mode: replyMode,
    reply_model: replyModel,
    is_fallback: isFallback,
    reply_sources: replySources,
    reply_metadata: replyMetadata,
    knowledge_ingest_watch: knowledgeIngestWatch,
  }
}

export async function listKnowledgeBases(): Promise<KnowledgeBase[]> {
  const payload = await request<{ bases?: any[] }>('/api/v1/knowledge-bases')
  return (payload.bases ?? []).map((base) => ({
    id: normalizeId(base.id),
    name: base.name ?? '',
    description: base.description ?? '',
    status: base.status ?? 'active',
    default_top_k: Number(base.default_top_k ?? 0),
    default_chunk_size: Number(base.default_chunk_size ?? 0),
  }))
}

export async function createKnowledgeBase(name: string, description: string): Promise<KnowledgeBase> {
  const payload = await request<{ base?: any }>('/api/v1/knowledge-bases', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  })
  const base = payload.base ?? payload
  return {
    id: normalizeId(base.id),
    name: base.name ?? name,
    description: base.description ?? description,
    status: base.status ?? 'active',
  }
}

function mapKnowledgeDocument(doc: any, fallbackFile?: File): KnowledgeDocument {
  return {
    id: normalizeId(doc.id),
    knowledge_base_id: normalizeId(doc.knowledge_base_id),
    media_asset_id: doc.media_asset_id ? normalizeId(doc.media_asset_id) : undefined,
    title: doc.title ?? '',
    file_name: doc.file_name ?? fallbackFile?.name ?? '',
    content_type: doc.content_type ?? fallbackFile?.type ?? '',
    status: doc.status ?? '',
    processing_stage: doc.processing_stage ?? doc.processingStage ?? '',
    chunk_count: Number(doc.chunk_count ?? doc.chunkCount ?? 0),
    summary: doc.summary ?? '',
    text_content: doc.text_content ?? doc.textContent ?? '',
  }
}

export async function listKnowledgeDocuments(baseId: ID): Promise<KnowledgeDocument[]> {
  const payload = await request<{ documents?: any[] }>(`/api/v1/knowledge-bases/${baseId}/documents`)
  return (payload.documents ?? []).map((doc) => mapKnowledgeDocument(doc))
}

/** 将后端 processing_stage 转成简短中文（用于进度展示） */
export function knowledgeDocStageLabel(stage: string | undefined, status: string): string {
  const s = (stage || '').toLowerCase()
  switch (s) {
    case 'extract_timeout':
      return '解析超时'
    case 'extract_skipped_large':
      return '超过大小上限'
    case 'fetch_object':
    case 'download':
      return '拉取文件…'
    case 'extract':
      return '解析文本…'
    case 'chunk_embed':
      return '切块与索引…'
    case 'done':
      return '已完成'
    case 'extract_empty':
      return '无文本可索引'
  }
  if (status === 'failed' || s === 'error') return '处理失败'
  if (status === 'processing') return '处理中…'
  return status === 'indexed' || status === 'uploaded' ? '已完成' : status
}

export async function pollKnowledgeDocumentUntilSettled(
  baseId: ID,
  docId: ID,
  onProgress?: (label: string) => void,
  opts?: { maxTicks?: number; intervalMs?: number },
): Promise<KnowledgeDocument | undefined> {
  const maxTicks = opts?.maxTicks ?? 80
  const intervalMs = opts?.intervalMs ?? 350
  for (let i = 0; i < maxTicks; i++) {
    const docs = await listKnowledgeDocuments(baseId)
    const d = docs.find((x) => x.id === docId)
    if (!d) return undefined
    onProgress?.(knowledgeDocStageLabel(d.processing_stage, d.status))
    if (
      d.processing_stage === 'done' ||
      d.status === 'failed' ||
      d.processing_stage === 'error' ||
      d.processing_stage === 'extract_timeout' ||
      d.processing_stage === 'extract_skipped_large' ||
      d.processing_stage === 'extract_empty' ||
      (d.status !== 'processing' && (d.processing_stage === '' || !d.processing_stage))
    ) {
      return d
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  const docs = await listKnowledgeDocuments(baseId)
  return docs.find((x) => x.id === docId)
}

export async function uploadKnowledgeDocument(baseId: ID, file: File): Promise<KnowledgeDocument> {
  const asset = await uploadMedia(file, 'knowledge')
  const payload = await request<{ document?: any }>(`/api/v1/knowledge-bases/${baseId}/documents`, {
    method: 'POST',
    body: JSON.stringify({
      knowledge_base_id: baseId,
      media_asset_id: asset.id,
      title: file.name.replace(/\.[^.]+$/, ''),
    }),
  })
  const document = payload.document ?? payload
  return mapKnowledgeDocument(document, file)
}

export async function listHouseholdAIMemories(): Promise<HouseholdAIMemory[]> {
  const payload = await request<{ memories?: any[] }>('/api/v1/household-ai-memories')
  return (payload.memories ?? []).map((m) => ({
    id: normalizeId(m.id),
    scope: m.scope ?? 'general',
    content: m.content ?? '',
    source: m.source,
    user_id: m.user_id != null ? normalizeId(m.user_id) : undefined,
    created_at: m.created_at,
    updated_at: m.updated_at,
  }))
}

export async function reindexKnowledgeBase(baseId: ID) {
  return request<{ job_id?: ID; status?: string }>(`/api/v1/knowledge-bases/${baseId}/reindex`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function queryKnowledgeBase(baseId: ID, question: string) {
  const payload = await request<any>(`/api/v1/knowledge-bases/${baseId}/query`, {
    method: 'POST',
    body: JSON.stringify({ question }),
  })
  return {
    answer: payload.answer ?? payload.reply_content ?? '',
    sources: payload.sources ?? payload.reply_sources ?? [],
    mode: payload.mode ?? payload.reply_mode ?? 'knowledge',
  }
}
