import type { ID } from '../api/client'
import type { RecipeDetail } from '../api/client'
import type { MealSlot, WeekPlan } from '../state/meal-plan'

const dayOrder: Array<keyof WeekPlan> = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const slotOrder: MealSlot[] = ['breakfast', 'lunch', 'dinner']

export function collectRecipeIdsFromPlan(weekPlan: WeekPlan): ID[] {
  const ids = new Set<ID>()
  for (const day of dayOrder) {
    for (const slot of slotOrder) {
      const id = weekPlan[day][slot].recipeId
      if (id) ids.add(id)
    }
  }
  return [...ids]
}

export interface ShopGroup {
  recipeId: string
  recipeName: string
  items: { key: string; name: string; amount: string }[]
}

/** Build grouped shopping rows from loaded recipe details. */
export function buildShopGroups(details: RecipeDetail[]): ShopGroup[] {
  const groups: ShopGroup[] = []
  for (const d of details) {
    const id = d.recipe.id
    const name = d.recipe.title
    const items = [...d.ingredients]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((ing, idx) => ({
        key: `${id}:${ing.id || idx}`,
        name: ing.name,
        amount: [ing.amount_text, ing.preparation].filter(Boolean).join(' ') || '适量',
      }))
    if (items.length) {
      groups.push({ recipeId: id, recipeName: name, items })
    }
  }
  return groups
}
