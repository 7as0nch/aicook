import { create } from 'zustand'

import type { QuoteContext } from '../api/client'

interface FloatingAnchor {
  x: number
  y: number
}

interface AIWorkspaceState {
  quoteContext: QuoteContext
  quoteVisible: boolean
  floatingAnchor: FloatingAnchor
  setSelection: (payload: QuoteContext, anchor: FloatingAnchor) => void
  openQuote: () => void
  closeQuote: () => void
  clearSelection: () => void
}

const emptyQuoteContext: QuoteContext = {
  selected_text: '',
  selection_source: '',
  surrounding_text: '',
  scene: 'quote',
}

export const useAIWorkspaceStore = create<AIWorkspaceState>((set) => ({
  quoteContext: emptyQuoteContext,
  quoteVisible: false,
  floatingAnchor: { x: 0, y: 0 },
  setSelection: (payload, anchor) => set({ quoteContext: payload, floatingAnchor: anchor }),
  openQuote: () => set({ quoteVisible: true }),
  closeQuote: () => set({ quoteVisible: false }),
  clearSelection: () => set({ quoteContext: emptyQuoteContext }),
}))
