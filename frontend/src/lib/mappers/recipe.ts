import type { RecipeCard, RecipeDetail, RecipeIngredient, RecipeStep, UpdateRecipePayload } from '../api/client'

/** UI shape aligned with aidesign `data.ts` */
export interface UiRecipeStep {
  text: string
  needTimer?: boolean
  time?: number
  hint?: string
  /** First step image (legacy) */
  mediaUrl?: string
  /** All step images */
  mediaUrls?: string[]
}

export interface UiIngredient {
  name: string
  amount: string
  category?: '蔬菜' | '肉类' | '调料' | '主食'
}

export interface UiRecipe {
  id: string
  title: string
  cover: string
  summary?: string
  /** Extra images (carousel); cover is list thumbnail */
  gallery: string[]
  status: string
  category?: string
  secondaryKitchenTags: string[]
  flavorTags: string[]
  time: number
  difficulty: number
  servings: number
  ingredientsReady: boolean
  tags: string[]
  ingredients: UiIngredient[]
  steps: UiRecipeStep[]
}

const CATEGORY_MAP: Record<string, UiIngredient['category']> = {
  蔬菜: '蔬菜',
  肉类: '肉类',
  调料: '调料',
  主食: '主食',
}

function mapIngredientGroup(groupName: string): UiIngredient['category'] | undefined {
  return CATEGORY_MAP[groupName] ?? undefined
}

function numFromMeta(meta: Record<string, unknown> | undefined, key: string, fallback: number): number {
  if (!meta) return fallback
  const v = meta[key]
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return fallback
}

function boolFromMeta(meta: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  if (!meta) return fallback
  const v = meta[key]
  if (typeof v === 'boolean') return v
  return fallback
}

export function tagsFromCard(card: RecipeCard): string[] {
  const tags: string[] = []
  if (card.category) tags.push(card.category)
  for (const t of card.scenario_tags ?? []) {
    if (t && !tags.includes(t)) tags.push(t)
  }
  return tags
}

export function mapCardToUiRecipe(card: RecipeCard): UiRecipe {
  const meta = card.metadata
  return {
    id: card.id,
    title: card.title,
    cover: card.cover_image_url,
    summary: card.summary || undefined,
    gallery: Array.isArray(card.gallery_image_urls) ? card.gallery_image_urls.filter(Boolean) : [],
    status: card.status || 'draft',
    category: card.category || undefined,
    secondaryKitchenTags: Array.isArray(card.scenario_tags) ? card.scenario_tags.filter(Boolean) : [],
    flavorTags: Array.isArray(card.flavor_tags) ? card.flavor_tags.filter(Boolean) : [],
    time: Math.max(1, card.total_minutes || 1),
    difficulty: card.difficulty,
    servings: numFromMeta(meta, 'servings', 2),
    ingredientsReady: boolFromMeta(meta, 'ingredients_ready', false),
    tags: tagsFromCard(card),
    ingredients: [],
    steps: [],
  }
}

/** Build a full PUT body from loaded detail (e.g. quick publish from list). */
export function recipeDetailToUpdatePayload(detail: RecipeDetail, status: 'draft' | 'published'): UpdateRecipePayload {
  const { recipe, ingredients, steps } = detail
  const meta = { ...(recipe.metadata ?? {}), servings: numFromMeta(recipe.metadata, 'servings', 2) }
  return {
    title: recipe.title,
    summary: recipe.summary ?? '',
    cover_image_url: recipe.cover_image_url ?? '',
    gallery_image_urls: recipe.gallery_image_urls ?? [],
    category: recipe.category ?? '家常菜',
    status,
    total_minutes: recipe.total_minutes || 1,
    difficulty: recipe.difficulty || 2,
    tools: recipe.tools ?? [],
    scenario_tags: recipe.scenario_tags ?? [],
    flavor_tags: recipe.flavor_tags ?? [],
    metadata: meta,
    ingredients: [...ingredients]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({
        group_name: i.group_name,
        name: i.name,
        amount_text: i.amount_text,
        preparation: i.preparation,
        remark: i.remark,
      })),
    steps: [...steps]
      .sort((a, b) => a.step_no - b.step_no)
      .map((st) => ({
        title: st.title,
        description: st.description,
        step_type: st.step_type,
        need_timer: st.need_timer,
        timer_seconds: st.timer_seconds,
        timer_animation: st.timer_animation,
        end_condition: st.end_condition,
        media_url: st.media_url,
        media_urls: st.media_urls?.length ? st.media_urls : st.media_url ? [st.media_url] : [],
      })),
  }
}

export function mapDetailToUiRecipe(detail: RecipeDetail): UiRecipe {
  const { recipe, ingredients, steps } = detail
  const meta = recipe.metadata
  const sortedSteps = [...steps].sort((a, b) => a.step_no - b.step_no)
  const sortedIng = [...ingredients].sort((a, b) => a.sort_order - b.sort_order)

  return {
    id: recipe.id,
    title: recipe.title,
    cover: recipe.cover_image_url,
    summary: recipe.summary || undefined,
    gallery: Array.isArray(recipe.gallery_image_urls) ? recipe.gallery_image_urls.filter(Boolean) : [],
    status: recipe.status || 'draft',
    category: recipe.category || undefined,
    secondaryKitchenTags: Array.isArray(recipe.scenario_tags) ? recipe.scenario_tags.filter(Boolean) : [],
    flavorTags: Array.isArray(recipe.flavor_tags) ? recipe.flavor_tags.filter(Boolean) : [],
    time: Math.max(1, recipe.total_minutes || 1),
    difficulty: recipe.difficulty,
    servings: numFromMeta(meta, 'servings', 2),
    ingredientsReady: boolFromMeta(meta, 'ingredients_ready', false),
    tags: tagsFromCard(recipe),
    ingredients: sortedIng.map((ing: RecipeIngredient) => ({
      name: ing.name,
      amount: ing.amount_text || ing.preparation || '',
      category: mapIngredientGroup(ing.group_name),
    })),
    steps: sortedSteps.map((st: RecipeStep) => {
      const seconds = Math.max(0, Math.floor(Number(st.timer_seconds) || 0))
      const hasDuration = seconds > 0
      const urls = (st.media_urls?.length ? st.media_urls : st.media_url ? [st.media_url] : []).map((u) => u.trim()).filter(Boolean)
      const media = urls[0] ?? ''
      return {
        text: st.description || st.title,
        needTimer: hasDuration,
        time: hasDuration ? seconds : undefined,
        hint: st.ai_hint || undefined,
        mediaUrl: media || undefined,
        mediaUrls: urls.length ? urls : undefined,
      }
    }),
  }
}
