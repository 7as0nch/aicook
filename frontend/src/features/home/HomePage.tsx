import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { VoiceHoldButton } from '../../components/media/VoiceHoldButton'
import { listRecipes, type RecipeCard } from '../../lib/api/client'
import { useHomeSearch } from '../../lib/state/home-search'
import { useMealPlanStore } from '../../lib/state/meal-plan'

const heroImages = [
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1600&q=80',
  'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1600&q=80',
]

const categoryTiles = [
  { title: '15 分钟快手', desc: '高效简餐', icon: 'bolt', className: 'bg-surface-container-lowest shadow-sm' },
  { title: '冰箱优先', desc: '零浪费搭配', icon: 'kitchen', className: 'bg-primary text-on-primary shadow-sm' },
  { title: '近期常做', desc: '验证过的菜', icon: 'history', className: 'bg-surface-container-low shadow-sm' },
  { title: '周末备餐', desc: '批量准备', icon: 'calendar_month', className: 'bg-surface-container-lowest shadow-sm border border-outline-variant/10' },
]

const filterChips = ['素食', '高蛋白']

function difficultyLabel(value: number) {
  if (value <= 1) return '简单'
  if (value <= 2) return '中等'
  return '进阶'
}

function matchPercent(recipe: RecipeCard, index: number) {
  const base = 88 + ((recipe.id?.charCodeAt?.(0) ?? index) % 12)
  return Math.min(100, base)
}

export function HomePage() {
  const navigate = useNavigate()
  const { query, setQuery } = useHomeSearch()
  const generatePlan = useMealPlanStore((state) => state.generatePlan)
  const [recipes, setRecipes] = useState<RecipeCard[]>([])
  const [activeChip, setActiveChip] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    void listRecipes(12)
      .then((items) => {
        if (!cancelled) setRecipes(items)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '菜谱加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filteredRecipes = useMemo(() => {
    let list = recipes
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((recipe) => {
        const text = `${recipe.title} ${recipe.summary} ${recipe.category ?? ''}`.toLowerCase()
        return text.includes(q)
      })
    }
    if (activeChip === '素食') {
      list = list.filter((r) => /素|蔬菜|豆|菌|茄|瓜/i.test(`${r.title} ${r.summary}`))
    }
    if (activeChip === '高蛋白') {
      list = list.filter((r) => /鸡|牛|鱼|虾|蛋|豆|蛋白/i.test(`${r.title} ${r.summary}`))
    }
    return list
  }, [query, recipes, activeChip])

  const featured = filteredRecipes[0]
  const secondary = filteredRecipes[1]

  return (
    <div className="space-y-10 pb-4">
      <section className="md:hidden">
        <div className="flex items-center rounded-xl bg-surface-container-low px-4 py-3 transition-colors focus-within:bg-primary-fixed">
          <span className="material-symbols-outlined text-outline">search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索食材…"
            className="ml-3 w-full border-none bg-transparent text-base font-medium text-on-surface placeholder:text-outline-variant focus:ring-0 focus:outline-none"
          />
        </div>
        <VoiceHoldButton className="mt-3 w-full justify-center" onTranscribed={(text) => setQuery((prev) => `${prev} ${text}`.trim())} />
      </section>

      <section>
        <div className="mb-6 flex items-end justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-tertiary">今日精选</span>
            <h2 className="font-headline mt-1 text-4xl font-bold tracking-tight text-on-surface">今天吃什么</h2>
          </div>
          <button type="button" className="hidden text-sm font-semibold text-primary hover:underline md:block">
            饮食记录
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="relative h-[400px] cursor-pointer overflow-hidden rounded-3xl md:col-span-2">
            <img
              src={featured?.cover_image_url || heroImages[0]}
              alt={featured?.title || '今日推荐'}
              className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-on-background/80 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 w-full p-8">
              <div className="mb-3 flex flex-wrap gap-2">
                <span className="rounded-lg bg-primary px-3 py-1 text-xs font-bold uppercase tracking-wider text-on-primary">推荐</span>
                <span className="rounded-lg bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white backdrop-blur-md">
                  {featured ? `${Math.max(featured.total_minutes, 10)} 分钟` : '15 分钟'}
                </span>
              </div>
              <h3 className="font-headline mb-2 text-4xl font-extrabold text-white">{featured?.title || '今晚吃点清爽快手菜'}</h3>
              <p className="mb-4 max-w-lg font-medium text-white/80">
                {featured?.summary || '结合库存与口味，优先推荐快手、食材友好的方案。'}
              </p>
              <button
                type="button"
                className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-on-primary transition-all hover:bg-primary-container"
                onClick={() => (featured ? navigate(`/cooking?recipe=${featured.id}`) : navigate('/recipes/editor'))}
              >
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                  play_arrow
                </span>
                开始做菜
              </button>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-3xl border border-outline-variant/10 bg-surface-container-low p-6">
            <div>
              <div className="mb-4 h-40 overflow-hidden rounded-2xl">
                <img
                  src={secondary?.cover_image_url || heroImages[1]}
                  alt={secondary?.title || '备选'}
                  className="h-full w-full object-cover"
                />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-tertiary">冰箱匹配</span>
              <h3 className="font-headline mt-1 text-2xl font-bold text-on-surface">{secondary?.title || '柠香意面'}</h3>
              <div className="mt-3 flex items-center gap-3 text-sm font-semibold text-on-surface-variant">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-base">timer</span>
                  {secondary ? `${secondary.total_minutes} 分钟` : '12 分钟'}
                </span>
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-base">signal_cellular_alt</span>
                  {secondary ? difficultyLabel(secondary.difficulty) : '简单'}
                </span>
              </div>
            </div>
            <div className="mt-6 border-t border-outline-variant/30 pt-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-on-surface-variant">按需补货</span>
                <span className="font-bold text-primary">{secondary ? `${matchPercent(secondary, 1)}%` : '88%'} 匹配</span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-surface-variant">
                <div
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: `${secondary ? matchPercent(secondary, 1) : 88}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-headline mb-6 text-2xl font-bold text-on-surface">执行分类</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {categoryTiles.map((tile) => (
            <button
              key={tile.title}
              type="button"
              className={`cursor-pointer rounded-3xl p-6 text-left transition-shadow hover:shadow-md ${tile.className}`}
            >
              <div
                className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl transition-transform group-hover:scale-110 ${
                  tile.className.includes('bg-primary') ? 'bg-white/20' : 'bg-primary-fixed'
                }`}
              >
                <span
                  className={`material-symbols-outlined font-bold ${tile.className.includes('bg-primary') ? 'text-white' : 'text-primary'}`}
                >
                  {tile.icon}
                </span>
              </div>
              <h4 className={`font-headline text-lg font-bold ${tile.className.includes('text-on-primary') ? '' : 'text-on-surface'}`}>
                {tile.title}
              </h4>
              <p
                className={`mt-1 text-sm ${
                  tile.className.includes('text-on-primary') ? 'text-white/80' : 'text-on-surface-variant'
                }`}
              >
                {tile.desc}
              </p>
            </button>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-headline text-2xl font-bold text-on-surface">为你优化的菜谱</h2>
          <div className="flex flex-wrap gap-2">
            {filterChips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setActiveChip((c) => (c === chip ? null : chip))}
                className={[
                  'rounded-full px-4 py-1.5 text-xs font-bold transition-colors',
                  activeChip === chip
                    ? 'bg-primary-fixed text-primary'
                    : 'cursor-pointer bg-surface-container-high text-on-surface-variant hover:bg-primary-fixed hover:text-primary',
                ].join(' ')}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-3xl bg-surface-container-low" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-outline-variant/30 bg-surface-container-lowest p-5 text-sm text-tertiary">{error}</div>
        ) : (
          <div className="space-y-4">
            {filteredRecipes.map((recipe, index) => {
              const pct = matchPercent(recipe, index)
              return (
                <button
                  key={recipe.id}
                  type="button"
                  onClick={() => navigate(`/recipes/${recipe.id}`)}
                  className="group flex w-full items-center gap-6 rounded-3xl bg-surface-container-lowest p-4 text-left transition-colors hover:bg-surface-container-low"
                  data-selection-source={`recipe-card-${recipe.id}`}
                >
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl">
                    <img
                      src={recipe.cover_image_url || heroImages[2]}
                      alt={recipe.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h4 className="font-headline text-xl font-bold text-on-surface">{recipe.title}</h4>
                        <div className="mt-1 flex flex-wrap items-center gap-4 text-xs font-bold uppercase tracking-tighter text-on-surface-variant">
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">schedule</span>
                            {recipe.total_minutes} 分钟
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">restaurant</span>
                            {difficultyLabel(recipe.difficulty)}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="font-headline text-2xl font-black tracking-tighter text-primary">{pct}%</span>
                        <p className="text-[10px] font-bold uppercase text-on-surface-variant">可制作</p>
                      </div>
                    </div>
                  </div>
                  <span className="material-symbols-outlined hidden pr-2 text-outline-variant transition-colors group-hover:text-primary md:block">
                    chevron_right
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <div className="fixed bottom-32 right-6 z-40 md:bottom-8 md:right-8">
        <button
          type="button"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-tertiary text-on-tertiary shadow-xl transition-transform hover:scale-105 active:scale-95"
          aria-label="计时"
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
            timer
          </span>
        </button>
      </div>

      <div className="hidden justify-center md:flex">
        <Link to="/plan" className="text-sm font-semibold text-primary hover:underline">
          打开周计划
        </Link>
        <span className="mx-3 text-on-surface-variant">·</span>
        <button
          type="button"
          className="text-sm font-semibold text-primary hover:underline"
          onClick={() => generatePlan(recipes.map((r) => ({ id: r.id, title: r.title })))}
        >
          一键生成周计划
        </button>
      </div>
    </div>
  )
}
