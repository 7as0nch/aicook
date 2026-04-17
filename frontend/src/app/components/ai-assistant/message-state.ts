import type { AIAgentTrace, AIToolCall, AIWorkflowStep } from '../../../lib/api/client'

export function buildStageReasoningContent(workflow: AIWorkflowStep[] | undefined) {
  const items = (workflow ?? []).filter((item) => (item.title || item.detail || '').trim())
  if (items.length === 0) return ''
  const lines = items.map((item) => {
    const title = (item.title || '执行步骤').trim()
    const detail = (item.detail || '').trim()
    return detail ? `- ${title}：${detail}` : `- ${title}`
  })
  return ['[阶段化思考]', ...lines].join('\n')
}

export function mergeWorkflowSteps(existing: AIWorkflowStep[] | undefined, incoming: AIWorkflowStep): AIWorkflowStep[] {
  const items = [...(existing ?? [])]
  const index = items.findIndex((item) => item.id === incoming.id)
  if (index >= 0) {
    items[index] = { ...items[index], ...incoming }
    return items
  }
  return [...items, incoming]
}

export function mergeToolCalls(existing: AIToolCall[] | undefined, incoming: AIToolCall): AIToolCall[] {
  const items = [...(existing ?? [])]
  const key = incoming.call_id || `${incoming.name}:${incoming.arguments ?? ''}`
  const index = items.findIndex((item) => (item.call_id || `${item.name}:${item.arguments ?? ''}`) === key)
  if (index >= 0) {
    const prevItem = items[index]
    items[index] = {
      ...prevItem,
      ...incoming,
      result: incoming.result !== undefined ? incoming.result : prevItem.result,
      arguments: incoming.arguments !== undefined ? incoming.arguments : prevItem.arguments,
    }
    return items
  }
  return [...items, incoming]
}

export function mergeAgentTrace(existing: AIAgentTrace[] | undefined, incoming: AIAgentTrace): AIAgentTrace[] {
  const items = [...(existing ?? [])]
  const index = items.findIndex((item) => item.id === incoming.id)
  if (index >= 0) {
    items[index] = { ...items[index], ...incoming }
    return items
  }
  return [...items, incoming]
}

export function extractSearchPayload(toolCall: AIToolCall | undefined) {
  const searchNames = new Set(['web_search', 'native_web_search'])
  if (!toolCall?.result || !searchNames.has(toolCall.name)) {
    return null
  }
  try {
    const parsed = JSON.parse(toolCall.result) as {
      summary?: string
      results?: Array<{
        title?: string
        document_id?: string
        documentId?: string
        snippet?: string
        site_name?: string
        siteName?: string
        publish_time?: string
        publishTime?: string
        logo_url?: string
        logoUrl?: string
      }>
      error_message?: string
      errorMessage?: string
      need_web_enabled?: boolean
      needWebEnabled?: boolean
    }
    const results = Array.isArray(parsed.results)
      ? parsed.results.map((item) => ({
          title: item.title ?? '',
          documentId: item.document_id ?? item.documentId ?? '',
          snippet: item.snippet ?? '',
          siteName: item.site_name ?? item.siteName ?? undefined,
          publishTime: item.publish_time ?? item.publishTime ?? undefined,
          logoUrl: item.logo_url ?? item.logoUrl ?? undefined,
        }))
      : []
    return {
      results,
      error:
        parsed.error_message ??
        parsed.errorMessage ??
        ((parsed.need_web_enabled ?? parsed.needWebEnabled) ? parsed.summary ?? '当前会话未开启网页搜索，请先打开网页搜索开关。' : undefined),
    }
  } catch {
    return null
  }
}

export function getVisibleAgentTrace(items: AIAgentTrace[] | undefined) {
  return (items ?? []).filter((item) => {
    const content = `${item.detail ?? ''} ${item.name ?? ''}`
    return !content.includes('切换到工具 agent') && !content.includes('切换到多模态 agent') && !content.includes('文本对话')
  })
}
