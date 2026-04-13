import type {
  AIApprovalOption,
  AIPendingApproval,
  AIRecipeCardMeta,
  AIAgentTrace,
  AISessionSummary,
  AITextRecipeDraft,
  AIToolCall,
  AIWorkflowStep,
} from '../../../lib/api/client'

export type { AISessionSummary, AIRecipeCardMeta, AIApprovalOption, AIPendingApproval } from '../../../lib/api/client'

export type Message = {
  id?: string
  role: 'user' | 'assistant'
  content: string
  sources?: Array<{
    title: string
    documentId: string
    snippet: string
    siteName?: string
    publishTime?: string
    logoUrl?: string
  }>
  searchResults?: Array<{
    title: string
    documentId: string
    snippet: string
    siteName?: string
    publishTime?: string
    logoUrl?: string
  }>
  searchError?: string
  contentCollapsed?: boolean
  contentExpandable?: boolean
  contentStreamingView?: boolean
  attachments?: Array<{
    kind: 'image' | 'file' | 'audio'
    name: string
    previewUrl?: string
    url?: string
    contentType?: string
    assetId?: string
  }>
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
  approvalResolved?: { optionId: string; optionIds?: string[]; title: string; titles?: string[]; prompt?: string }
  toolsExpanded?: boolean
  searchResultsExpanded?: boolean
  createdAt?: string
  kind?: string
  ingestNotice?: {
    documentId?: string
    mediaAssetId?: string
    retryable?: boolean
    partial?: boolean
    failureReason?: string
    summary?: string
  }
}

export type PendingAttachment = {
  id: string
  type: 'image' | 'document'
  file: File
  name: string
  previewUrl?: string
}

export const WELCOME: Message = {
  role: 'assistant',
  content: '你好！我是你的家庭厨艺助手。无论是找菜谱、问做法，还是传图让我解析菜谱，我都在！',
}
