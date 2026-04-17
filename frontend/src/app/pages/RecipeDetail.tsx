import { ArrowLeft, Clock, ChefHat, Users, Plus, Play, MoreHorizontal, Pencil, Share2, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import QRCode from 'antd/es/qr-code'
import { motion, AnimatePresence } from 'motion/react'
import { format } from 'date-fns'
import { createRecipeShare, deleteRecipe, getRecipeDetail, getCurrentMealPlan, saveCurrentMealPlan, type MealSlotKey, type RecipeSharePreview } from '../../lib/api/client'
import { appendDish, buildWeekDates, dayOrder, ensureMealPlan, getCurrentWeekStart, slotLabels, slotOrder, toMealPlanPayload } from '../../lib/meal-plan/week'
import { mapDetailToUiRecipe, type UiRecipe } from '../../lib/mappers/recipe'
import { useFeedback } from '../contexts/FeedbackContext'
import { ImageLightbox } from '../components/ImageLightbox'
import { RecipeCoverImg } from '../components/RecipeCoverImg'
import { toast } from 'sonner'

export default function RecipeDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { confirm } = useFeedback()
  const [recipe, setRecipe] = useState<UiRecipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const [showPlanSheet, setShowPlanSheet] = useState(false)
  const [sharePreview, setSharePreview] = useState<RecipeSharePreview | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [carouselIndex, setCarouselIndex] = useState(0)
  const heroRef = useRef<HTMLDivElement>(null)
  const carouselRef = useRef<HTMLDivElement>(null)
  const [heroVisible, setHeroVisible] = useState(true)
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null)

  const weekStartDate = getCurrentWeekStart()
  const weekDates = useMemo(() => buildWeekDates(weekStartDate), [weekStartDate])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError('')
    void getRecipeDetail(id)
      .then((detail) => {
        if (!cancelled) setRecipe(mapDetailToUiRecipe(detail))
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
  }, [id])

  const heroSlides = useMemo(() => {
    if (!recipe) return []
    const cover = recipe.cover?.trim()
    const extra = (recipe.gallery ?? []).map((u) => u.trim()).filter(Boolean)
    return cover ? [cover, ...extra.filter((u) => u !== cover)] : extra
  }, [recipe])

  useEffect(() => {
    const el = heroRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting), { threshold: 0.15 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [heroSlides.length])

  async function addToPlan(day: typeof dayOrder[number], slot: MealSlotKey) {
    if (!recipe) return
    try {
      const current = ensureMealPlan(await getCurrentMealPlan(weekStartDate))
      const next = appendDish(current, day, slot, { recipe_id: recipe.id, recipe_title: recipe.title })
      await saveCurrentMealPlan(toMealPlanPayload(next))
      setShowPlanSheet(false)
      toast.success(`已加入${slotLabels[slot]}`)
      navigate('/plan')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加入计划失败')
    }
  }

  async function handleDelete() {
    if (!recipe) return
    const confirmed = await confirm({
      title: '确定要删除这个菜谱吗？',
      description: '删除后将无法继续在当前厨房查看它。',
      confirmText: '删除',
      tone: 'danger',
    })
    if (!confirmed) return
    void deleteRecipe(recipe.id)
      .then(() => {
        toast.success('菜谱已删除')
        navigate('/recipes')
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : '删除失败'))
  }

  async function handleShare() {
    if (!recipe) return
    setShareBusy(true)
    try {
      const next = await createRecipeShare(recipe.id)
      setSharePreview(next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '生成分享码失败')
    } finally {
      setShareBusy(false)
    }
  }

  const shareLink = sharePreview ? `${window.location.origin}/share/recipe/${sharePreview.share.share_code}` : ''
  const barDark = heroVisible && heroSlides.length > 0

  if (loading) {
    return <div className="flex min-h-[50dvh] items-center justify-center p-8 text-gray-500">加载中…</div>
  }

  if (error || !recipe) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-600">{error || '找不到菜谱'}</p>
        <button type="button" className="mt-4 text-orange-600" onClick={() => navigate(-1)}>返回</button>
      </div>
    )
  }

  return (
    <div className="relative min-h-[100dvh] bg-white pb-24">
      <div className={`sticky top-0 z-30 flex items-center justify-between gap-2 px-3 py-3 transition-colors ${barDark ? 'bg-transparent' : 'border-b border-gray-100 bg-white/95 backdrop-blur-md'}`}>
        <button type="button" onClick={() => navigate(-1)} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full backdrop-blur-md ${barDark ? 'bg-black/25 text-white' : 'bg-gray-100 text-gray-800'}`}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className={`min-w-0 flex-1 text-center text-sm font-bold ${barDark ? 'text-transparent' : 'truncate text-gray-900'}`}>{!barDark ? recipe.title : '\u00a0'}</div>
        <div className="relative shrink-0">
          <button type="button" onClick={() => setShowMenu(!showMenu)} className={`flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-md ${barDark ? 'bg-black/25 text-white' : 'bg-gray-100 text-gray-800'}`}>
            <MoreHorizontal className="h-5 w-5" />
          </button>
          <AnimatePresence>
            {showMenu ? (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
                <motion.div initial={{ opacity: 0, scale: 0.95, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -10 }} className="absolute right-0 top-12 z-40 w-40 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg">
                  <button type="button" onClick={() => { setShowMenu(false); navigate(`/recipes/${recipe.id}/edit`) }} className="flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] text-gray-700 transition-colors hover:bg-gray-50">
                    <Pencil className="h-4 w-4" /> 编辑
                  </button>
                  <button type="button" onClick={() => { setShowMenu(false); void handleShare() }} className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-3 text-left text-[14px] text-gray-700 transition-colors hover:bg-gray-50">
                    <Share2 className="h-4 w-4" /> 分享给家人
                  </button>
                  <button type="button" onClick={() => { setShowMenu(false); void handleDelete() }} className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-3 text-left text-[14px] text-red-600 transition-colors hover:bg-red-50">
                    <Trash2 className="h-4 w-4" /> 删除
                  </button>
                </motion.div>
              </>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <div ref={heroRef} className="relative w-full">
        {heroSlides.length > 0 ? (
          <div className="relative h-72 w-full overflow-hidden bg-gray-100">
            <div ref={carouselRef} className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden scroll-smooth touch-pan-x [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" onScroll={(e) => {
              const el = e.target as HTMLDivElement
              const width = el.clientWidth
              setCarouselIndex(Math.min(heroSlides.length - 1, Math.max(0, Math.round(el.scrollLeft / Math.max(width, 1)))))
            }}>
              {heroSlides.map((src, index) => (
                <button key={`${src}-${index}`} type="button" className="relative flex h-full min-w-0 flex-[0_0_100%] cursor-zoom-in snap-center border-0 bg-gray-100 p-0 text-left" onClick={() => setLightbox({ urls: heroSlides, index })}>
                  <RecipeCoverImg src={src} alt={`${recipe.title} ${index + 1}`} className="pointer-events-none h-full w-full object-cover" loading={index === 0 ? 'eager' : 'lazy'} fetchPriority={index === 0 ? 'high' : 'low'} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-72 w-full bg-gray-100">
            <RecipeCoverImg src="" alt={recipe.title} className="h-full w-full object-cover" loading="eager" />
          </div>
        )}
      </div>

      <div className="relative z-10 -mt-6 space-y-6 rounded-t-3xl bg-white p-5">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {recipe.tags.map((tag) => <span key={tag} className="rounded-lg bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-600">{tag}</span>)}
            {recipe.status === 'draft' ? <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">草稿</span> : null}
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900">{recipe.title}</h1>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-gray-50 p-4">
          <div className="flex flex-col items-center gap-1"><Clock className="h-5 w-5 text-gray-400" /><span className="text-xs font-medium text-gray-600">{recipe.time} 分钟</span></div>
          <div className="h-8 w-px bg-gray-200" />
          <div className="flex flex-col items-center gap-1"><ChefHat className="h-5 w-5 text-gray-400" /><span className="text-xs font-medium text-gray-600">难度 {recipe.difficulty}</span></div>
          <div className="h-8 w-px bg-gray-200" />
          <div className="flex flex-col items-center gap-1"><Users className="h-5 w-5 text-gray-400" /><span className="text-xs font-medium text-gray-600">{recipe.servings} 人份</span></div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">食材清单</h2>
            <span className="text-xs text-gray-400">按 {recipe.servings} 人份</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {recipe.ingredients.map((ing, idx) => (
              <span key={`${ing.name}-${idx}`} className="inline-flex max-w-full items-baseline gap-1 rounded-full border border-gray-100 bg-gray-50 px-3 py-1.5 text-[13px] text-gray-800">
                <span className="font-medium">{ing.name}</span>
                {ing.amount ? <><span className="text-gray-300">·</span><span className="text-gray-500">{ing.amount}</span></> : null}
              </span>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-lg font-bold">烹饪步骤 ({recipe.steps.length})</h2>
          <div className="space-y-4">
            {recipe.steps.map((step, idx) => {
              const imgs = step.mediaUrls?.length ? step.mediaUrls : step.mediaUrl ? [step.mediaUrl] : []
              return (
                <div key={idx} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">{idx + 1}</div>
                    {idx !== recipe.steps.length - 1 ? <div className="my-1 min-h-[1rem] flex-1 w-px bg-gray-100" /> : null}
                  </div>
                  <div className="min-w-0 flex-1 pb-4 pt-0.5">
                    <p className="text-sm leading-relaxed text-gray-700">{step.text}</p>
                    {imgs.length > 0 ? (
                      <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {imgs.map((src, j) => (
                          <button key={`${src}-${j}`} type="button" className="h-24 w-32 shrink-0 cursor-zoom-in overflow-hidden rounded-xl border border-gray-100 bg-gray-50 p-0" onClick={() => setLightbox({ urls: imgs, index: j })}>
                            <RecipeCoverImg src={src} alt="" className="pointer-events-none h-full w-full object-cover" loading="lazy" fetchPriority="low" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <ImageLightbox open={!!lightbox && (lightbox.urls?.length ?? 0) > 0} urls={lightbox?.urls ?? []} index={lightbox?.index ?? 0} alt={recipe.title} onClose={() => setLightbox(null)} onIndexChange={(nextIndex) => setLightbox((current) => (current ? { ...current, index: nextIndex } : current))} />

      <div className="fixed bottom-0 left-0 right-0 z-50 flex gap-3 border-t border-gray-100 bg-white p-4">
        <button type="button" onClick={() => setShowPlanSheet(true)} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-orange-50 py-3.5 font-bold text-orange-600">
          <Plus className="h-5 w-5" /> 加入计划
        </button>
        <Link to={`/cook/${recipe.id}`} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-orange-500 py-3.5 font-bold text-white shadow-lg shadow-orange-500/30">
          <Play className="h-5 w-5 fill-current" /> 开始做菜
        </Link>
      </div>

      <AnimatePresence>
        {showPlanSheet ? (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[120] bg-black/40" onClick={() => setShowPlanSheet(false)} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="fixed bottom-0 left-0 right-0 z-[121] rounded-t-3xl bg-white p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">加入本周计划</h3>
                <button type="button" onClick={() => setShowPlanSheet(false)} className="rounded-full bg-gray-100 p-2 text-gray-500"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-4">
                {weekDates.map((item) => (
                  <div key={item.day} className="rounded-2xl border border-gray-100 p-3">
                    <div className="mb-2 text-sm font-semibold text-gray-800">{item.label} · {format(item.date, 'M月d日')}</div>
                    <div className="grid grid-cols-3 gap-2">
                      {slotOrder.map((slot) => (
                        <button key={`${item.day}-${slot}`} type="button" onClick={() => void addToPlan(item.day, slot)} className="rounded-2xl bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-700">
                          {slotLabels[slot]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {sharePreview ? (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[130] bg-black/45" onClick={() => setSharePreview(null)} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="fixed bottom-0 left-0 right-0 z-[131] rounded-t-3xl bg-white p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">分享给家人</h3>
                <button type="button" onClick={() => setSharePreview(null)} className="rounded-full bg-gray-100 p-2 text-gray-500"><X className="h-4 w-4" /></button>
              </div>
              <div className="flex flex-col items-center rounded-3xl bg-gray-50 p-5">
                <QRCode value={shareLink} size={180} bordered={false} />
                <p className="mt-4 text-sm font-semibold text-gray-900">分享码：{sharePreview.share.share_code}</p>
                <p className="mt-1 text-xs text-center text-gray-500">扫一扫二维码或输入分享码，就能把这道菜导入到另一个厨房。</p>
              </div>
              <div className="mt-4 flex gap-3">
                <button type="button" onClick={() => void navigator.clipboard.writeText(sharePreview.share.share_code).then(() => toast.success('分享码已复制')).catch(() => toast.error('复制失败'))} className="flex-1 rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-700">复制分享码</button>
                <button type="button" onClick={() => void navigator.clipboard.writeText(shareLink).then(() => toast.success('分享链接已复制')).catch(() => toast.error('复制失败'))} className="flex-1 rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white">复制链接</button>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      {shareBusy ? <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/20 text-sm font-semibold text-white">正在生成分享码…</div> : null}
    </div>
  )
}
