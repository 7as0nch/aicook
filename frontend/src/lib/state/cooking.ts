import { create } from 'zustand'

import type { ID, RecipeDetail } from '../api/client'

interface CookingState {
  recipeId?: ID
  detail?: RecipeDetail
  stepIndex: number
  setRecipe: (recipeId: ID, detail?: RecipeDetail) => void
  setDetail: (detail: RecipeDetail) => void
  nextStep: (max: number) => void
  previousStep: () => void
  goToStep: (index: number) => void
  reset: () => void
}

export const useCookingStore = create<CookingState>((set) => ({
  recipeId: undefined,
  detail: undefined,
  stepIndex: 0,
  setRecipe: (recipeId, detail) => set({ recipeId, detail, stepIndex: 0 }),
  setDetail: (detail) => set({ detail }),
  nextStep: (max) => set((state) => ({ stepIndex: Math.min(state.stepIndex + 1, Math.max(0, max - 1)) })),
  previousStep: () => set((state) => ({ stepIndex: Math.max(state.stepIndex - 1, 0) })),
  goToStep: (index) => set({ stepIndex: Math.max(index, 0) }),
  reset: () => set({ recipeId: undefined, detail: undefined, stepIndex: 0 }),
}))
