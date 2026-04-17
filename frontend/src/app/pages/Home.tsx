import { Search, Sparkles, Mic, Camera, Plus, Clock, ChefHat, X, Refrigerator, History, PackageCheck } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import {
  createKitchenTag,
  deleteKitchenTag,
  getAuthSession,
  getMe,
  listActiveCooking,
  listInventoryItems,
  listInventoryRecommendations,
  listKitchenTags,
  listRecipes,
  updateKitchenTag,
  type ActiveCooking,
  type AuthSession,
  type InventoryRecommendation,
  type KitchenTag,
} from '../../lib/api/client'
import { mapCardToUiRecipe, type UiRecipe } from '../../lib/mappers/recipe'
import { toast } from 'sonner'
import { useFeedback } from '../contexts/FeedbackContext'
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

const TAG_COLOR_KEYS = Object.keys(TAG_COLORS)
const DEFAULT_ICONS = ['folder', 'home', 'zap', 'utensils', 'folder-plus']

type KitchenTagGridButtonProps = {
  tag: KitchenTag
  selected: boolean
  onToggleSelect: () => void
  onLongPress: () => void
}

type HomeCategoryKey = 'all' | 'quick' | 'fridge' | 'recent' | 'batch'

function KitchenTagGridButton({ tag, selected, onToggleSelect, onLongPress }: KitchenTagGridButtonProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressConsumed = useRef(false)
  const mutable = tag.type === 2

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => () => clearTimer(), [])

  const chipClass = selected ? 'bg-orange-500 text-white' : tag.color && TAG_COLORS[tag.color] ? TAG_COLORS[tag.color] : 'bg-gray-50 text-gray-600'

  if (!mutable) {
    return <button type="button" onClick={onToggleSelect} className={`truncate rounded-2xl px-2 py-2 text-[13px] font-medium transition ${chipClass}`}>{tag.name}</button>
  }

  return (
    <button
      type="button"
      className={`touch-manipulation truncate rounded-2xl px-2 py-2 text-[13px] font-medium transition ${chipClass}`}
      onPointerDown={() => {
        clearTimer()
        longPressConsumed.current = false
        timerRef.current = setTimeout(() => {
          longPressConsumed.current = true
          onLongPress()
        }, 520)
      }}
      onPointerUp={clearTimer}
      onPointerLeave={clearTimer}
      onPointerCancel={clearTimer}
      onClick={(event) => {
        if (longPressConsumed.current) {
          event.preventDefault()
          longPressConsumed.current = false
          return
        }
        onToggleSelect()
      }}
    >
      {tag.name}
    </button>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const { confirm } = useFeedback()
  const { openAI, setPageContext } = useAI()
  const [me, setMe] = useState<AuthSession | null>(() => getAuthSession())
  const [recipes, setRecipes] = useState<UiRecipe[]>([])
  const [inventoryRecommendations, setInventoryRecommendations] = useState<InventoryRecommendation[]>([])
  const [inventoryCount, setInventoryCount] = useState(0)
  const [tags, setTags] = useState<KitchenTag[]>([])
  const [selectedTag, setSelectedTag] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<HomeCategoryKey>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isTagsExpanded, setIsTagsExpanded] = useState(false)
  const [actionTag, setActionTag] = useState<KitchenTag | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [formTagId, setFormTagId] = useState<string | number | null>(null)
  const [formName, setFormName] = useState('')
  const [formIcon, setFormIcon] = useState('folder')
  const [formColor, setFormColor] = useState('orange')
  const [formBusy, setFormBusy] = useState(false)
  const [activeCooking, setActiveCooking] = useState<ActiveCooking[]>([])

  useEffect(() => {
    void getMe().then(setMe).catch(() => setMe(getAuthSession()))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    void Promise.all([
      listRecipes(24, { kitchenTag: selectedTag || undefined, excludeDraft: true }),
      listKitchenTags(),
      listActiveCooking().catch(() => [] as ActiveCooking[]),
      listInventoryItems().catch(() => []),
      listInventoryRecommendations(8).catch(() => []),
    ])
      .then(([cards, kitchenTags, cooking, inventory, recommended]) => {
        if (cancelled) return
        setRecipes(cards.map(mapCardToUiRecipe))
        setTags(kitchenTags)
        setActiveCooking(Array.isArray(cooking) ? cooking : [])
        setInventoryCount(inventory.length)
        setInventoryRecommendations(recommended)
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

  async function refreshKitchenTags() {
    const fresh = await listKitchenTags()
    setTags(fresh)
    return fresh
  }

  function openCreateForm() {
    setFormMode('create')
    setFormTagId(null)
    setFormName('')
    setFormIcon('folder')
    setFormColor('orange')
    setFormOpen(true)
  }

  function openEditForm(tag: KitchenTag) {
    setFormMode('edit')
    setFormTagId(tag.id)
    setFormName(tag.name)
    setFormIcon(tag.icon || 'folder')
    setFormColor(tag.color && TAG_COLORS[tag.color] ? tag.color : 'orange')
    setFormOpen(true)
    setActionTag(null)
  }

  async function submitTagForm() {
    const name = formName.trim()
    if (!name) {
      toast.error('请填写标签名称')
      return
    }
    setFormBusy(true)
    try {
      if (formMode === 'create') {
        await createKitchenTag(name, formIcon.trim() || 'folder', formColor)
      } else if (formTagId != null) {
        const oldName = tags.find((t) => String(t.id) === String(formTagId))?.name
        await updateKitchenTag(String(formTagId), { name, icon: formIcon.trim() || 'folder', color: formColor })
        if (oldName && selectedTag === oldName && name !== oldName) {
          setSelectedTag(name)
        }
      }
      await refreshKitchenTags()
      setFormOpen(false)
      toast.success('标签已保存')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setFormBusy(false)
    }
  }

  async function confirmDeleteTag(tag: KitchenTag) {
    const ok = await confirm({
      title: `删除标签「${tag.name}」？`,
      description: '菜谱与此标签的关联会移除，菜谱本身不会删除。',
      confirmText: '删除',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await deleteKitchenTag(tag.id)
      await refreshKitchenTags()
      if (selectedTag === tag.name) setSelectedTag('')
      toast.success('标签已删除')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    } finally {
      setActionTag(null)
    }
  }

  const profileUser = me?.user
  const nameInitial = (profileUser?.display_name || profileUser?.username || '?').slice(0, 1)
  const hasMutableTags = tags.some((t) => t.type === 2)

  const displayRecipes = useMemo(() => {
    switch (selectedCategory) {
      case 'quick':
        return recipes.filter((recipe) => recipe.time <= 15)
      case 'fridge':
        return inventoryRecommendations.map((item) => mapCardToUiRecipe(item.recipe))
      case 'recent':
        return [...recipes].slice(0, 8)
      case 'batch':
        return recipes.filter((recipe) => recipe.tags.some((tag) => /备餐|便当|周末/.test(tag)))
      default:
        return recipes
    }
  }, [inventoryRecommendations, recipes, selectedCategory])

  const categoryTiles = [
    { key: 'quick' as const, title: '15 分钟快手', desc: '高效简餐', icon: Clock, count: recipes.filter((item) => item.time <= 15).length },
    { key: 'fridge' as const, title: '冰箱优先', desc: inventoryCount > 0 ? `${inventoryCount} 项库存` : '先识别冰箱食材', icon: Refrigerator, count: inventoryRecommendations.length },
    { key: 'recent' as const, title: '近期常做', desc: '按最近菜谱排序', icon: History, count: Math.min(recipes.length, 8) },
    { key: 'batch' as const, title: '周末备餐', desc: '批量准备', icon: PackageCheck, count: recipes.filter((item) => item.tags.some((tag) => /备餐|便当|周末/.test(tag))).length },
  ]

  function handleCategoryClick(key: HomeCategoryKey) {
    if (key === 'fridge' && inventoryCount === 0) {
      setPageContext({ type: 'assistant' })
      openAI()
      toast.info('先拍照识别冰箱里的食材，后面就能按库存推荐菜谱。')
      return
    }
    setSelectedCategory((current) => (current === key ? 'all' : key))
  }

  return (
    <div className="space-y-6 p-4">
      <div className="sticky top-0 z-20 -mx-4 shrink-0 bg-gray-50/95 px-4 pb-2 pt-0 backdrop-blur supports-[backdrop-filter]:bg-gray-50/80">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">发现美味</h1>
          <button type="button" aria-label="账户与资料" onClick={() => navigate('/profile?sheet=account')} className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 transition-opacity active:opacity-80">
            {profileUser?.avatar_url ? <img src={profileUser.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="text-sm font-semibold text-gray-600">{nameInitial}</span>}
          </button>
        </div>
      </div>

      <div className="relative flex cursor-text items-center rounded-full bg-gray-50 p-1.5 transition-all active:scale-[0.99]" onClick={() => openAI()} onKeyDown={(event) => event.key === 'Enter' && openAI()} role="button" tabIndex={0}>
        <div className="flex flex-1 items-center gap-2 pl-3"><Search className="h-5 w-5 text-gray-400" /><span className="text-[15px] text-gray-400">找菜谱、看做法...</span></div>
        <div className="flex items-center gap-1 pr-1 text-gray-400">
          <button type="button" className="rounded-full p-2 transition-colors hover:bg-gray-200" onClick={(event) => { event.stopPropagation(); openAI() }}><Mic className="h-4 w-4" /></button>
          <button type="button" className="rounded-full p-2 transition-colors hover:bg-gray-200" onClick={(event) => { event.stopPropagation(); openAI() }}><Camera className="h-4 w-4" /></button>
          <div className="mx-1 h-4 w-px bg-gray-300" />
          <button type="button" className="rounded-full bg-orange-500 px-4 py-1.5 text-xs font-bold text-white transition-colors" onClick={(event) => { event.stopPropagation(); openAI() }}>AI 搜索</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {categoryTiles.map((tile) => (
          <button key={tile.key} type="button" onClick={() => handleCategoryClick(tile.key)} className={`rounded-3xl border p-4 text-left transition ${selectedCategory === tile.key ? 'border-orange-400 bg-orange-50' : 'border-gray-100 bg-white'}`}>
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-100 text-gray-700"><tile.icon className="h-5 w-5" /></div>
              <span className="text-xs font-bold text-gray-400">{tile.count}</span>
            </div>
            <p className="mt-4 text-sm font-bold text-gray-900">{tile.title}</p>
            <p className="mt-1 text-xs text-gray-500">{tile.desc}</p>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">厨房标签</h2>
          {selectedTag ? <button type="button" className="text-xs font-medium text-gray-400" onClick={() => setSelectedTag('')}>清除筛选</button> : null}
        </div>
        {hasMutableTags ? <p className="text-xs text-gray-400">长按自定义标签可编辑或删除</p> : null}
        <div className="grid grid-cols-4 gap-2">
          {(isTagsExpanded ? tags : tags.slice(0, 7)).map((tag) => (
            <KitchenTagGridButton key={tag.id} tag={tag} selected={selectedTag === tag.name} onToggleSelect={() => setSelectedTag((current) => (current === tag.name ? '' : tag.name))} onLongPress={() => setActionTag(tag)} />
          ))}
          {!isTagsExpanded && tags.length > 7 ? <button type="button" onClick={() => setIsTagsExpanded(true)} className="truncate rounded-2xl bg-gray-50 px-2 py-2 text-[13px] font-medium text-gray-500 transition hover:bg-gray-100">查看更多</button> : null}
          {isTagsExpanded ? (
            <>
              <button type="button" onClick={openCreateForm} className="flex items-center justify-center gap-1 truncate rounded-2xl border border-dashed border-gray-300 bg-white px-2 py-2 text-[13px] font-medium text-gray-500"><Plus className="h-3.5 w-3.5" />新建</button>
              <button type="button" onClick={() => setIsTagsExpanded(false)} className="truncate rounded-2xl bg-gray-100 px-2 py-2 text-[13px] font-medium text-gray-600">收起</button>
            </>
          ) : null}
          {!isTagsExpanded && tags.length <= 7 ? <button type="button" onClick={openCreateForm} className="flex items-center justify-center gap-1 truncate rounded-2xl border border-dashed border-gray-300 bg-white px-2 py-2 text-[13px] font-medium text-gray-500"><Plus className="h-3.5 w-3.5" />新建</button> : null}
        </div>
      </div>

      {activeCooking.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-900"><ChefHat className="h-4 w-4 text-orange-500" />进行中的菜</h2>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {activeCooking.map((item) => {
              const stepLabel = item.total_steps > 0 ? `第 ${item.step_index + 1}/${item.total_steps} 步` : ''
              const timerHint = item.remaining_seconds > 0 && item.timer_running ? ` · 剩余 ${Math.ceil(item.remaining_seconds / 60)} 分钟` : ''
              return (
                <Link key={String(item.recipe_id)} to={`/cook/${item.recipe_id}`} className="flex min-w-[200px] shrink-0 items-center gap-3 rounded-2xl border border-orange-100 bg-orange-50/80 p-3 transition active:scale-[0.99]">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gray-100"><RecipeCoverImg src={item.cover_image_url} alt={item.title} className="h-full w-full object-cover" loading="lazy" /></div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-gray-900">{item.title}</p><p className="truncate text-[11px] text-gray-500">{stepLabel}{timerHint}</p></div>
                </Link>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1 text-lg font-bold"><Sparkles className="h-5 w-5 text-orange-500" />今天吃什么</h2>
          <span className="text-xs text-gray-400">{selectedCategory === 'all' ? '来自菜谱库' : '已按场景筛选'}</span>
        </div>

        {loading ? (
          <p className="text-center text-sm text-gray-400">加载中…</p>
        ) : error ? (
          <p className="text-center text-sm text-red-500">{error}</p>
        ) : displayRecipes.length === 0 ? (
          <p className="text-center text-sm text-gray-400">当前筛选下暂无菜谱，试试切换标签或先补充库存。</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {displayRecipes.map((recipe) => (
              <Link key={recipe.id} to={`/recipes/${recipe.id}`} className="flex items-center gap-4 py-4 transition-colors active:bg-gray-50">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                  <RecipeCoverImg src={recipe.cover} alt={recipe.title} className="h-full w-full object-cover" loading="lazy" fetchPriority="low" />
                  {recipe.ingredientsReady ? <div className="absolute right-1 top-1 rounded-full bg-green-500 px-1.5 py-0.5 text-[8px] font-medium text-white shadow-sm">齐全</div> : null}
                </div>
                <div className="flex h-full min-w-0 flex-1 flex-col justify-center py-1">
                  <h3 className="mb-2 truncate text-[16px] font-bold text-gray-900">{recipe.title}</h3>
                  <div className="mb-2 flex items-center gap-3 text-[12px] text-gray-500">
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {recipe.time} 分钟</span>
                    <span className="flex items-center gap-1"><ChefHat className="h-3.5 w-3.5" /> 难度 {'⭐'.repeat(Math.min(3, recipe.difficulty))}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recipe.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-sm bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{tag}</span>)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {actionTag ? (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/30" onClick={() => setActionTag(null)} />
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="fixed bottom-0 left-0 right-0 z-[101] rounded-t-2xl border-t border-gray-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg">
              <p className="mb-3 text-center text-sm font-semibold text-gray-800">{actionTag.name}</p>
              <button type="button" className="mb-2 w-full rounded-xl bg-gray-50 py-3 text-[15px] font-medium text-gray-800" onClick={() => openEditForm(actionTag)}>编辑</button>
              <button type="button" className="mb-2 w-full rounded-xl bg-red-50 py-3 text-[15px] font-medium text-red-600" onClick={() => void confirmDeleteTag(actionTag)}>删除</button>
              <button type="button" className="w-full rounded-xl py-3 text-[15px] font-medium text-gray-500" onClick={() => setActionTag(null)}>取消</button>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {formOpen ? (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] bg-black/40" onClick={() => !formBusy && setFormOpen(false)} />
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }} className="fixed bottom-0 left-0 right-0 z-[111] max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-gray-100 bg-white p-4 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">{formMode === 'create' ? '新建厨房标签' : '编辑厨房标签'}</h3>
                <button type="button" className="rounded-full p-2 text-gray-500 hover:bg-gray-100" disabled={formBusy} onClick={() => setFormOpen(false)} aria-label="关闭"><X className="h-5 w-5" /></button>
              </div>
              <label className="mb-3 block text-xs font-medium text-gray-500">名称
                <input value={formName} onChange={(event) => setFormName(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="例如：轻食" />
              </label>
              <div className="mb-3"><span className="text-xs font-medium text-gray-500">图标关键字</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {DEFAULT_ICONS.map((icon) => <button key={icon} type="button" onClick={() => setFormIcon(icon)} className={`rounded-lg px-2.5 py-1 text-xs font-medium ${formIcon === icon ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>{icon}</button>)}
                </div>
                <input value={formIcon} onChange={(event) => setFormIcon(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="自定义，如 folder" />
              </div>
              <div className="mb-6"><span className="text-xs font-medium text-gray-500">颜色</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {TAG_COLOR_KEYS.map((color) => <button key={color} type="button" onClick={() => setFormColor(color)} className={`h-9 min-w-[2.5rem] rounded-xl px-2 text-xs font-medium capitalize ${TAG_COLORS[color]} ${formColor === color ? 'ring-2 ring-orange-500 ring-offset-1' : ''}`}>{color}</button>)}
                </div>
              </div>
              <button type="button" disabled={formBusy} onClick={() => void submitTagForm()} className="w-full rounded-2xl bg-orange-500 py-3.5 text-sm font-bold text-white disabled:opacity-50">{formBusy ? '保存中…' : '保存'}</button>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
