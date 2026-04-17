import { createContext, useContext, useState, type ReactNode } from 'react'

export type QuickCaptureIntent = 'auto' | 'recipe' | 'inventory'

export type QuickCapturePendingFile = {
  file: File
  kind: 'image' | 'document'
  previewUrl?: string
}

export type AssistantPageContext = {
  type: 'assistant'
  preferredSessionId?: string
}

export type CookingPageContext = {
  type: 'cooking'
  recipe: string
  stepNo: number
  stepText: string
  preferredSessionId?: string
}

export type RecipeDetailPageContext = {
  type: 'recipe_detail'
  recipeId: string
  recipeTitle: string
  preferredSessionId?: string
}

export type QuickCapturePageContext = {
  type: 'quick_capture'
  captureIntent?: QuickCaptureIntent
  pendingFiles?: QuickCapturePendingFile[]
  preferredSessionId?: string
  /** 为 true 时先清空当前会话再发送（底部拍照入口等场景使用新会话） */
  forceNewSession?: boolean
}

export type AIPageContext = AssistantPageContext | CookingPageContext | RecipeDetailPageContext | QuickCapturePageContext | null

interface AIContextType {
  isOpen: boolean
  openAI: () => void
  closeAI: () => void
  pageContext: AIPageContext
  setPageContext: (ctx: AIPageContext) => void
}

const AIContext = createContext<AIContextType | null>(null)

export function AIProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [pageContext, setPageContext] = useState<AIPageContext>(null)

  const openAI = () => setIsOpen(true)
  const closeAI = () => setIsOpen(false)

  return (
    <AIContext.Provider value={{ isOpen, openAI, closeAI, pageContext, setPageContext }}>
      {children}
    </AIContext.Provider>
  )
}

export const useAI = () => {
  const context = useContext(AIContext)
  if (!context) throw new Error('useAI must be used within AIProvider')
  return context
}
