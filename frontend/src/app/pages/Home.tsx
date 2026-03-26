import { Search, Sparkles, Mic, Camera, Plus, Clock, ChefHat } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { createKitchenTag, listKitchenTags, listRecipes, type KitchenTag } from '../../lib/api/client'
import { mapCardToUiRecipe, type UiRecipe } from '../../lib/mappers/recipe'
import { useAI } from '../contexts/AIContext'
import { RecipeCoverImg } from '../components/RecipeCoverImg'

const TAG_COLORS: Record<string, string> = {
  orange: 'bg-orange-100 text-orange-600',
  amber: 'bg-amber-100 text-amber-600',
  stone: 'bg-stone-100 text-stone-600',
  yellow: 'bg-yellow-100 text-yellow-600',
  green: 'bg-green-100 text-green-600',
  red: 'bg-red-100 text-red-600',
  blue: 'bg-blue-100 text-blue-600',
  pink: 'bg-pink-100 text-pink-600',
}

export default function Home() {
  const { openAI } = useAI()
  const [recipes, setRecipes] = useState<UiRecipe[]>([])
  const [tags, setTags] = useState<KitchenTag[]>([])
  const [selectedTag, setSelectedTag] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isTagsExpanded, setIsTagsExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    void Promise.all([listRecipes(24, selectedTag ? { kitchenTag: selectedTag } : undefined), listKitchenTags()])
      .then(([cards, kitchenTags]) => {
        if (cancelled) return
        setRecipes(cards.map(mapCardToUiRecipe))
        setTags(kitchenTags)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedTag])

  async function handleCreateKitchenTag() {
    const name = window.prompt('输入新的厨房标签名称')
    if (!name?.trim()) return
    try {
      const created = await createKitchenTag(name.trim())
      setTags((current) => [...current, created])
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : '创建标签失败')
    }
  }

  return (
    <div className="space-y-6 p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">发现美味</h1>
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gray-200">
            <span className="text-sm">😎</span>
          </div>
        </div>

        <div
          className="relative flex cursor-text items-center rounded-full bg-gray-50 p-1.5 transition-all active:scale-[0.99]"
          onClick={() => openAI()}
          onKeyDown={(e) => e.key === 'Enter' && openAI()}
          role="button"
          tabIndex={0}
        >
          <div className="flex flex-1 items-center gap-2 pl-3">
            <Search className="h-5 w-5 text-gray-400" />
            <span className="text-[15px] text-gray-400">找菜谱、看做法...</span>
          </div>
          <div className="flex items-center gap-1 pr-1 text-gray-400">
            <button
              type="button"
              className="rounded-full p-2 transition-colors hover:bg-gray-200"
              onClick={(e) => {
                e.stopPropagation()
                openAI()
              }}
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded-full p-2 transition-colors hover:bg-gray-200"
              onClick={(e) => {
                e.stopPropagation()
                openAI()
              }}
            >
              <Camera className="h-4 w-4" />
            </button>
            <div className="mx-1 h-4 w-px bg-gray-300" />
            <button
              type="button"
              className="rounded-full bg-orange-500 px-4 py-1.5 text-xs font-bold text-white transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                openAI()
              }}
            >
              AI 搜索
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">厨房标签</h2>
          {selectedTag ? (
            <button type="button" className="text-xs font-medium text-gray-400" onClick={() => setSelectedTag('')}>
              清除筛选
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(isTagsExpanded ? tags : tags.slice(0, 7)).map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => setSelectedTag((current) => (current === tag.name ? '' : tag.name))}
              className={`truncate rounded-2xl px-2 py-2 text-[13px] font-medium transition ${
                selectedTag === tag.name
                  ? 'bg-orange-500 text-white'
                  : tag.color && TAG_COLORS[tag.color]
                    ? TAG_COLORS[tag.color]
                    : 'bg-gray-50 text-gray-600'
              }`}
            >
              {tag.name}
            </button>
          ))}
          {!isTagsExpanded && tags.length > 7 ? (
            <button
              type="button"
              onClick={() => setIsTagsExpanded(true)}
              className="truncate rounded-2xl bg-gray-50 px-2 py-2 text-[13px] font-medium text-gray-500 transition hover:bg-gray-100"
            >
              查看更多
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleCreateKitchenTag()}
              className="flex items-center justify-center gap-1 truncate rounded-2xl border border-dashed border-gray-300 bg-white px-2 py-2 text-[13px] font-medium text-gray-500"
            >
              <Plus className="h-3.5 w-3.5" />
              新建
            </button>
          )}
        </div>
      </div>


      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1 text-lg font-bold">
            <Sparkles className="h-5 w-5 text-orange-500" />
            今天吃什么
          </h2>
          <span className="text-xs text-gray-400">来自菜谱库</span>
        </div>

        {loading ? (
          <p className="text-center text-sm text-gray-400">加载中…</p>
        ) : error ? (
          <p className="text-center text-sm text-red-500">{error}</p>
        ) : recipes.length === 0 ? (
          <p className="text-center text-sm text-gray-400">暂无菜谱，请导入或执行 deploy/sql 种子脚本。</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {recipes.map((recipe) => (
              <Link
                key={recipe.id}
                to={`/recipes/${recipe.id}`}
                className="flex items-center gap-4 py-4 transition-colors active:bg-gray-50"
              >
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                  <RecipeCoverImg src={recipe.cover} alt={recipe.title} className="h-full w-full object-cover" />
                  {recipe.ingredientsReady ? (
                    <div className="absolute right-1 top-1 rounded-full bg-green-500 px-1.5 py-0.5 text-[8px] font-medium text-white shadow-sm">
                      齐全
                    </div>
                  ) : null}
                </div>
                
                <div className="flex h-full min-w-0 flex-1 flex-col justify-center py-1">
                  <h3 className="mb-2 truncate text-[16px] font-bold text-gray-900">{recipe.title}</h3>
                  <div className="mb-2 flex items-center gap-3 text-[12px] text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> {recipe.time} 分钟
                    </span>
                    <span className="flex items-center gap-1">
                      <ChefHat className="h-3.5 w-3.5" /> 难度 {'⭐'.repeat(Math.min(3, recipe.difficulty))}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recipe.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="rounded-sm bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
