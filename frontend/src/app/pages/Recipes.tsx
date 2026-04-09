import { MoreVertical, Plus, Search, Image as ImageIcon, Link as LinkIcon, PenTool, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'motion/react'
import { deleteRecipe, getRecipeDetail, listKitchenTags, listRecipes, updateRecipe, type KitchenTag } from '../../lib/api/client'
import { mapCardToUiRecipe, recipeDetailToUpdatePayload, type UiRecipe } from '../../lib/mappers/recipe'
import { RecipeCoverImg } from '../components/RecipeCoverImg'

type RailKey = '__all__' | '__draft__' | string

export default function Recipes() {
  const navigate = useNavigate()
  const [recipes, setRecipes] = useState<UiRecipe[]>([])
  const [kitchenTags, setKitchenTags] = useState<KitchenTag[]>([])
  const [railKey, setRailKey] = useState<RailKey>('__all__')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAddMenu, setShowAddMenu] = useState(false)

  const loadRecipes = useCallback(async () => {
    setLoading(true)
    try {
      const cards =
        railKey === '__all__'
          ? await listRecipes(200)
          : railKey === '__draft__'
            ? await listRecipes(200, { recipeStatus: 'draft' })
            : await listRecipes(200, { kitchenTag: railKey })
      setRecipes(cards.map(mapCardToUiRecipe))
    } finally {
      setLoading(false)
    }
  }, [railKey])

  useEffect(() => {
    void loadRecipes()
  }, [loadRecipes])

  useEffect(() => {
    let cancelled = false
    void listKitchenTags().then((tags) => {
      if (!cancelled) setKitchenTags(tags)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return recipes
    return recipes.filter((r) => {
      const blob = `${r.title} ${r.tags.join(' ')}`.toLowerCase()
      return blob.includes(q)
    })
  }, [query, recipes])

  const railItems = useMemo(() => {
    const tagNames = kitchenTags.map((t) => t.name.trim()).filter(Boolean)
    return [
      { key: '__all__' as const, label: '全部' },
      { key: '__draft__' as const, label: '草稿' },
      ...tagNames.map((name) => ({ key: name, label: name })),
    ]
  }, [kitchenTags])

  const listScrollRef = useRef<HTMLDivElement>(null)
  const wasAtBottomRef = useRef(false)
  const endToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [endToast, setEndToast] = useState(false)

  const dismissEndToastSoon = useCallback(() => {
    if (endToastTimerRef.current) clearTimeout(endToastTimerRef.current)
    endToastTimerRef.current = setTimeout(() => setEndToast(false), 2200)
  }, [])

  const onListScroll = useCallback(() => {
    const el = listScrollRef.current
    if (!el || loading || filtered.length === 0) return
    const gap = 12
    const scrollable = el.scrollHeight > el.clientHeight + gap
    if (!scrollable) return
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - gap
    if (atBottom && !wasAtBottomRef.current) {
      wasAtBottomRef.current = true
      setEndToast(true)
      dismissEndToastSoon()
    } else if (!atBottom) {
      wasAtBottomRef.current = false
    }
  }, [loading, filtered.length, dismissEndToastSoon])

  useEffect(() => {
    wasAtBottomRef.current = false
    setEndToast(false)
    listScrollRef.current?.scrollTo({ top: 0 })
  }, [railKey, query])

  useEffect(() => {
    wasAtBottomRef.current = false
  }, [recipes])

  useEffect(() => {
    return () => {
      if (endToastTimerRef.current) clearTimeout(endToastTimerRef.current)
    }
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gray-50">
      <div className="shrink-0 space-y-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">菜谱库</h1>
          <button
            type="button"
            onClick={() => setShowAddMenu(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-white transition-transform active:scale-95"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索当前列表…"
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav className="hide-scrollbar w-[7.25rem] shrink-0 overflow-y-auto overscroll-contain border-r border-gray-200 bg-white">
          {railItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setRailKey(item.key)}
              className={`block w-full border-b border-gray-100 px-2.5 py-3 text-center text-xs font-semibold leading-snug break-words transition-colors last:border-b-0 ${
                railKey === item.key ? 'bg-orange-50 text-orange-700' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="relative min-h-0 min-w-0 flex-1">
          <div
            ref={listScrollRef}
            onScroll={onListScroll}
            className="hide-scrollbar h-full overflow-y-auto overscroll-contain bg-white"
          >
            {loading ? (
              <p className="p-4 text-center text-sm text-gray-400">加载中…</p>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-400">暂无菜谱</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filtered.map((recipe) => (
                  <RecipeRowCard key={recipe.id} recipe={recipe} onRefresh={() => void loadRecipes()} />
                ))}
              </ul>
            )}
          </div>
          {endToast ? (
            <div
              className="pointer-events-none absolute bottom-3 left-0 right-0 flex justify-center"
              role="status"
              aria-live="polite"
            >
              <span className="rounded-full bg-gray-900/85 px-3 py-1.5 text-xs text-white shadow-md">
                已经到底啦
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <AnimatePresence>
        {showAddMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddMenu(false)}
              className="fixed inset-0 z-100 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 z-101 rounded-t-3xl bg-white p-6 shadow-2xl"
            >
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">添加新菜谱</h3>
                <button
                  type="button"
                  onClick={() => setShowAddMenu(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-500"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/recipes/editor')}
                  className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-gray-50 px-2 py-6 transition-colors hover:bg-gray-100"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                  <div className="text-center">
                    <div className="mb-1 text-[14px] font-bold text-gray-900">图片识别</div>
                    <div className="text-[11px] text-gray-500">AI解析图片菜谱</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => alert('功能开发中...')}
                  className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-gray-50 px-2 py-6 transition-colors hover:bg-gray-100"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm">
                    <LinkIcon className="h-5 w-5" />
                  </div>
                  <div className="text-center">
                    <div className="mb-1 text-[14px] font-bold text-gray-900">网页提取</div>
                    <div className="text-[11px] text-gray-500">粘贴链接提取</div>
                  </div>
                </button>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => navigate('/recipes/editor')}
                  className="flex w-full items-center gap-4 rounded-2xl bg-gray-50 p-4 transition-colors hover:bg-gray-100"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm">
                    <PenTool className="h-5 w-5" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-[14px] font-bold text-gray-900">手动录入</div>
                    <div className="text-[12px] text-gray-500">自己写下独特秘方</div>
                  </div>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function RecipeRowCard({ recipe, onRefresh }: { recipe: UiRecipe; onRefresh: () => void }) {
  const navigate = useNavigate()
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })

  useLayoutEffect(() => {
    if (!menuOpen || !menuBtnRef.current) return
    const r = menuBtnRef.current.getBoundingClientRect()
    setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const onResize = () => {
      if (!menuBtnRef.current) return
      const r = menuBtnRef.current.getBoundingClientRect()
      setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [menuOpen])

  const menuPortal =
    menuOpen &&
    createPortal(
      <>
        <div className="fixed inset-0 z-[200]" aria-hidden onClick={() => setMenuOpen(false)} />
        <div
          className="fixed z-[201] w-36 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          style={{ top: menuPos.top, right: menuPos.right }}
          role="menu"
        >
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-[13px] text-gray-700 hover:bg-gray-50"
            onClick={() => {
              setMenuOpen(false)
              navigate(`/recipes/${recipe.id}`)
            }}
          >
            打开
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-[13px] text-gray-700 hover:bg-gray-50"
            onClick={() => {
              setMenuOpen(false)
              navigate(`/recipes/${recipe.id}/edit`)
            }}
          >
            编辑
          </button>
          {recipe.status === 'draft' ? (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-[13px] text-orange-600 hover:bg-orange-50"
              onClick={() => {
                setMenuOpen(false)
                void (async () => {
                  try {
                    const d = await getRecipeDetail(recipe.id)
                    await updateRecipe(recipe.id, recipeDetailToUpdatePayload(d, 'published'))
                    onRefresh()
                  } catch (err) {
                    window.alert(err instanceof Error ? err.message : '发布失败')
                  }
                })()
              }}
            >
              发布
            </button>
          ) : null}
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-[13px] text-red-600 hover:bg-red-50"
            onClick={() => {
              setMenuOpen(false)
              if (!window.confirm(`删除「${recipe.title}」？`)) return
              void deleteRecipe(recipe.id)
                .then(() => onRefresh())
                .catch((err) => window.alert(err instanceof Error ? err.message : '删除失败'))
            }}
          >
            删除
          </button>
        </div>
      </>,
      document.body,
    )

  return (
    <li className="relative bg-white">
      {recipe.status === 'draft' ? (
        <span className="absolute right-10 top-2 z-10 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
          草稿
        </span>
      ) : null}
      <button
        type="button"
        className="flex w-full gap-3 p-2.5 pr-12 text-left"
        onClick={() => navigate(`/recipes/${recipe.id}`)}
      >
        <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-gray-100">
          <RecipeCoverImg
            src={recipe.cover}
            alt={recipe.title}
            className="h-full w-full object-cover"
            loading="lazy"
            fetchPriority="low"
          />
        </div>
        <div className="min-w-0 flex-1 py-0.5">
          <h3 className="line-clamp-2 text-[14px] font-bold leading-snug text-gray-900">{recipe.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
            <span>{recipe.time} 分钟</span>
            <span>⭐ {recipe.difficulty}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {[recipe.category, ...recipe.secondaryKitchenTags].filter(Boolean).slice(0, 3).map((tag, idx) => (
              <span key={`${recipe.id}-${tag}-${idx}`} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </button>
      <div className="absolute right-1 top-1 z-20">
        <button
          ref={menuBtnRef}
          type="button"
          className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen((v) => !v)
          }}
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </div>
      {menuPortal}
    </li>
  )
}
