import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { useEffect } from 'react'

import { getAuthSession } from '../../../lib/api/client'
import { normalizeMessageDisplayState, serializeMessages } from './helpers'
import type { Message } from './types'
import { WELCOME } from './types'

const AI_ASSISTANT_STORAGE_PREFIX = 'aicook-ai-assistant'

type Params = {
  messages: Message[]
  sessionMessageCache: Record<string, Message[]>
  sessionIdRef: MutableRefObject<string | null>
  setMessages: Dispatch<SetStateAction<Message[]>>
  setSessionMessageCache: Dispatch<SetStateAction<Record<string, Message[]>>>
  setActiveSessionId: Dispatch<SetStateAction<string | null>>
  reasoningEnabled: boolean
  setReasoningEnabled: Dispatch<SetStateAction<boolean>>
  webSearchEnabled: boolean
  setWebSearchEnabled: Dispatch<SetStateAction<boolean>>
  imageRecipeEnabled: boolean
  setImageRecipeEnabled: Dispatch<SetStateAction<boolean>>
}

export function useAIAssistantPersistence({
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
}: Params) {
  const session = getAuthSession()
  const householdId = session?.current_household?.id || 'anon'
  const storageKey = `${AI_ASSISTANT_STORAGE_PREFIX}:${householdId}`

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
      if (typeof parsed.reasoningEnabled === 'boolean') setReasoningEnabled(parsed.reasoningEnabled)
      if (typeof parsed.webSearchEnabled === 'boolean') setWebSearchEnabled(parsed.webSearchEnabled)
      if (typeof parsed.imageRecipeEnabled === 'boolean') setImageRecipeEnabled(parsed.imageRecipeEnabled)
    } catch {
      window.localStorage.removeItem(storageKey)
    }
  }, [setActiveSessionId, setImageRecipeEnabled, setMessages, setReasoningEnabled, setSessionMessageCache, setWebSearchEnabled, storageKey, sessionIdRef])

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
  }, [messages, sessionIdRef, setSessionMessageCache])

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
  }, [imageRecipeEnabled, messages, reasoningEnabled, sessionIdRef, sessionMessageCache, storageKey, webSearchEnabled])

  return { storageKey }
}

