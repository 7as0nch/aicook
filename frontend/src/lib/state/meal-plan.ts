import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { ID } from '../api/client'

export type MealSlot = 'breakfast' | 'lunch' | 'dinner'

export interface MealAssignment {
  recipeId?: ID
  label?: string
}

export interface WeekPlan {
  monday: Record<MealSlot, MealAssignment>
  tuesday: Record<MealSlot, MealAssignment>
  wednesday: Record<MealSlot, MealAssignment>
  thursday: Record<MealSlot, MealAssignment>
  friday: Record<MealSlot, MealAssignment>
  saturday: Record<MealSlot, MealAssignment>
  sunday: Record<MealSlot, MealAssignment>
}

/** Client-only shopping trip history (no backend API yet). */
export interface ShopHistoryRecord {
  id: string
  date: string
  itemCount: number
  recipes: string[]
}

interface MealPlanState {
  weekPlan: WeekPlan
  checkedItems: Record<string, boolean>
  /** Shopping / list check state (keys e.g. `shop:recipeId:ingredientKey`). */
  shopHistory: ShopHistoryRecord[]
  assignMeal: (day: keyof WeekPlan, slot: MealSlot, recipeId?: ID, label?: string) => void
  generatePlan: (recipes: Array<{ id: ID; title: string }>) => void
  toggleChecked: (key: string) => void
  pushShopHistory: (record: Omit<ShopHistoryRecord, 'id'>) => void
  /** Clears `shop:*` keys after a shopping trip (client-only; no server list API). */
  resetShopChecks: () => void
}

function createEmptyDay() {
  return {
    breakfast: {},
    lunch: {},
    dinner: {},
  }
}

const defaultWeekPlan: WeekPlan = {
  monday: createEmptyDay(),
  tuesday: createEmptyDay(),
  wednesday: createEmptyDay(),
  thursday: createEmptyDay(),
  friday: createEmptyDay(),
  saturday: createEmptyDay(),
  sunday: createEmptyDay(),
}

const dayOrder: Array<keyof WeekPlan> = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const slotOrder: MealSlot[] = ['breakfast', 'lunch', 'dinner']

export const useMealPlanStore = create<MealPlanState>()(
  persist(
    (set) => ({
      weekPlan: defaultWeekPlan,
      checkedItems: {},
      shopHistory: [],
      assignMeal: (day, slot, recipeId, label) =>
        set((state) => ({
          weekPlan: {
            ...state.weekPlan,
            [day]: {
              ...state.weekPlan[day],
              [slot]: { recipeId, label },
            },
          },
        })),
      generatePlan: (recipes) =>
        set(() => {
          const nextPlan = structuredClone(defaultWeekPlan)
          let cursor = 0
          for (const day of dayOrder) {
            for (const slot of slotOrder) {
              const recipe = recipes[cursor % Math.max(recipes.length, 1)]
              if (recipe) {
                nextPlan[day][slot] = {
                  recipeId: recipe.id,
                  label: recipe.title,
                }
                cursor += 1
              }
            }
          }
          return { weekPlan: nextPlan }
        }),
      toggleChecked: (key) =>
        set((state) => ({
          checkedItems: {
            ...state.checkedItems,
            [key]: !state.checkedItems[key],
          },
        })),
      pushShopHistory: (record) =>
        set((state) => ({
          shopHistory: [
            { ...record, id: `h${Date.now()}` },
            ...state.shopHistory,
          ],
        })),
      resetShopChecks: () =>
        set((state) => {
          const next = { ...state.checkedItems }
          for (const k of Object.keys(next)) {
            if (k.startsWith('shop:')) delete next[k]
          }
          return { checkedItems: next }
        }),
    }),
    {
      name: 'aicook-meal-plan',
    },
  ),
)
