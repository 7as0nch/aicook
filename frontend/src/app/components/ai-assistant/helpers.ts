import type { AIRecipeCardMeta } from '../../../lib/api/client'
import type { Message } from './types'

export function knowledgeHitBadge(kind: string | undefined): { label: string; className: string } {
  switch (kind) {
    case 'memory':
      return { label: '长期记忆', className: 'bg-violet-100 text-violet-800' }
    case 'knowledge_base':
      return { label: '知识库', className: 'bg-amber-100 text-amber-950' }
    case 'knowledge_graph':
      return { label: '知识图谱', className: 'bg-sky-100 text-sky-900' }
    default:
      return { label: '资料', className: 'bg-gray-100 text-gray-600' }
  }
}

export function toRecipeData(card: AIRecipeCardMeta): NonNullable<Message['recipeData']> {
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

export function serializeMessages(messages: Message[]) {
  return messages.map((message) => ({
    ...message,
    attachments: message.attachments?.map((item) => ({
      ...item,
      previewUrl: item.previewUrl?.startsWith('blob:') ? undefined : item.previewUrl,
    })),
  }))
}

export function shouldCollapseContent(content: string, threshold = 220) {
  return content.trim().length > threshold
}

export function normalizeMessageDisplayState(message: Message, threshold = 220): Message {
  if (message.role !== 'assistant') {
    return {
      ...message,
      contentCollapsed: false,
      contentExpandable: false,
      contentStreamingView: false,
    }
  }
  const expandable = typeof message.contentExpandable === 'boolean' ? message.contentExpandable : shouldCollapseContent(message.content, threshold)
  return {
    ...message,
    contentExpandable: expandable,
    contentCollapsed: typeof message.contentCollapsed === 'boolean' ? message.contentCollapsed : expandable,
    contentStreamingView: Boolean(message.contentStreamingView),
  }
}

export function isWelcomePlaceholder(msg: Message, welcomeText: string) {
  return msg.role === 'assistant' && msg.content === welcomeText && !msg.id && !(msg.toolCalls && msg.toolCalls.length)
}
