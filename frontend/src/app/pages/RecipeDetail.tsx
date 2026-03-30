import { ArrowLeft, Clock, ChefHat, Users, Plus, Play, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { motion, AnimatePresence } from 'motion/react'
import { deleteRecipe, getRecipeDetail } from '../../lib/api/client'
import { mapDetailToUiRecipe, type UiRecipe } from '../../lib/mappers/recipe'
import { useMealPlanStore } from '../../lib/state/meal-plan'
import { ImageLightbox } from '../components/ImageLightbox'
import { RecipeCoverImg } from '../components/RecipeCoverImg'

export default function RecipeDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const assignMeal = useMealPlanStore((s) => s.assignMeal)
  const [recipe, setRecipe] = useState<UiRecipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const [carouselIndex, setCarouselIndex] = useState(0)
  const heroRef = useRef<HTMLDivElement>(null)
  const carouselRef = useRef<HTMLDivElement>(null)
  const [heroVisible, setHeroVisible] = useState(true)
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null)

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
    const slides = cover ? [cover, ...extra.filter((u) => u !== cover)] : extra
    return slides.length ? slides : []
  }, [recipe])

  useEffect(() => {
    const el = heroRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => {
        setHeroVisible(e.isIntersecting)
      },
      { threshold: 0.15 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [heroSlides.length])

  if (loading) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center p-8 text-gray-500">
        加载中…
      </div>
    )
  }

  if (error || !recipe) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-600">{error || '找不到菜谱'}</p>
        <button type="button" className="mt-4 text-orange-600" onClick={() => navigate(-1)}>
          返回
        </button>
      </div>
    )
  }

  function addToPlan() {
    if (!recipe) return
    assignMeal('monday', 'dinner', recipe.id, recipe.title)
    navigate('/plan')
  }

  const handleDelete = () => {
    if (!recipe) return
    if (!window.confirm('确定要删除这个菜谱吗？')) return
    void deleteRecipe(recipe.id)
      .then(() => navigate('/recipes'))
      .catch((e) => window.alert(e instanceof Error ? e.message : '删除失败'))
  }

  const handleEdit = () => {
    if (!recipe) return
    setShowMenu(false)
    navigate(`/recipes/${recipe.id}/edit`)
  }

  const barDark = heroVisible && heroSlides.length > 0

  const scrollHeroTo = (i: number) => {
    const el = carouselRef.current
    if (!el) return
    const w = el.clientWidth
    el.scrollTo({ left: Math.max(0, i) * w, behavior: 'smooth' })
  }

  return (
    <div className="relative min-h-[100dvh] bg-white pb-24">
      <div
        className={`sticky top-0 z-30 flex items-center justify-between gap-2 px-3 py-3 transition-colors ${
          barDark ? 'bg-transparent' : 'border-b border-gray-100 bg-white/95 backdrop-blur-md'
        }`}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full backdrop-blur-md ${
            barDark ? 'bg-black/25 text-white' : 'bg-gray-100 text-gray-800'
          }`}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div
          className={`min-w-0 flex-1 text-center text-sm font-bold ${
            barDark ? 'text-transparent' : 'truncate text-gray-900'
          }`}
        >
          {!barDark ? recipe.title : '\u00a0'}
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className={`flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-md ${
              barDark ? 'bg-black/25 text-white' : 'bg-gray-100 text-gray-800'
            }`}
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>

          <AnimatePresence>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute right-0 top-12 z-40 w-36 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg"
                >
                  <button
                    type="button"
                    onClick={handleEdit}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    <Pencil className="h-4 w-4" /> 编辑
                  </button>
                  <div className="h-px w-full bg-gray-100" />
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] text-red-600 transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" /> 删除
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div ref={heroRef} className="relative w-full">
        {heroSlides.length > 0 ? (
          <div className="relative h-72 w-full overflow-hidden bg-gray-100">
            <div
              ref={carouselRef}
              className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden scroll-smooth touch-pan-x [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onScroll={(e) => {
                const el = e.target as HTMLDivElement
                const w = el.clientWidth
                const x = el.scrollLeft
                setCarouselIndex(Math.min(heroSlides.length - 1, Math.max(0, Math.round(x / Math.max(w, 1)))))
              }}
            >
              {heroSlides.map((src, i) => (
                <button
                  key={`${src}-${i}`}
                  type="button"
                  className="relative flex h-full min-h-0 min-w-0 flex-[0_0_100%] cursor-zoom-in snap-center snap-always border-0 bg-gray-100 p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                  aria-label={`查看大图 ${i + 1}/${heroSlides.length}`}
                  onClick={() => setLightbox({ urls: heroSlides, index: i })}
                >
                  <RecipeCoverImg
                    src={src}
                    alt={`${recipe.title} ${i + 1}`}
                    className="pointer-events-none h-full w-full object-cover"
                    loading={i === 0 ? 'eager' : 'lazy'}
                    fetchPriority={i === 0 ? 'high' : 'low'}
                  />
                </button>
              ))}
            </div>
            {heroSlides.length > 1 ? (
              <div className="pointer-events-auto absolute bottom-3 left-0 right-0 z-10 flex justify-center gap-1.5">
                {heroSlides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`跳到第 ${i + 1} 张`}
                    onClick={() => {
                      setCarouselIndex(i)
                      scrollHeroTo(i)
                    }}
                    className={`h-1.5 rounded-full transition-all ${i === carouselIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/50'}`}
                  />
                ))}
              </div>
            ) : null}
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
            {recipe.tags.map((tag) => (
              <span key={tag} className="rounded-lg bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-600">
                {tag}
              </span>
            ))}
            {recipe.status === 'draft' ? (
              <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">草稿</span>
            ) : null}
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900">{recipe.title}</h1>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-gray-50 p-4">
          <div className="flex flex-col items-center gap-1">
            <Clock className="h-5 w-5 text-gray-400" />
            <span className="text-xs font-medium text-gray-600">{recipe.time} 分钟</span>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div className="flex flex-col items-center gap-1">
            <ChefHat className="h-5 w-5 text-gray-400" />
            <span className="text-xs font-medium text-gray-600">难度 {recipe.difficulty}</span>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div className="flex flex-col items-center gap-1">
            <Users className="h-5 w-5 text-gray-400" />
            <span className="text-xs font-medium text-gray-600">{recipe.servings} 人份</span>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">食材清单</h2>
            <span className="text-xs text-gray-400">按 {recipe.servings} 人份</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {recipe.ingredients.map((ing, idx) => (
              <span
                key={`${ing.name}-${idx}`}
                className="inline-flex max-w-full items-baseline gap-1 rounded-full border border-gray-100 bg-gray-50 px-3 py-1.5 text-[13px] text-gray-800"
              >
                <span className="font-medium">{ing.name}</span>
                {ing.amount ? (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-500">{ing.amount}</span>
                  </>
                ) : null}
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
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">
                      {idx + 1}
                    </div>
                    {idx !== recipe.steps.length - 1 ? <div className="my-1 min-h-[1rem] flex-1 w-px bg-gray-100" /> : null}
                  </div>
                  <div className="min-w-0 flex-1 pb-4 pt-0.5">
                    <p className="text-sm leading-relaxed text-gray-700">{step.text}</p>
                    {imgs.length > 0 ? (
                      <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {imgs.map((src, j) => (
                          <button
                            key={`${src}-${j}`}
                            type="button"
                            className="h-24 w-32 shrink-0 cursor-zoom-in overflow-hidden rounded-xl border border-gray-100 bg-gray-50 p-0 outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                            aria-label="查看步骤大图"
                            onClick={() => setLightbox({ urls: imgs, index: j })}
                          >
                            <RecipeCoverImg
                              src={src}
                              alt=""
                              className="pointer-events-none h-full w-full object-cover"
                              loading="lazy"
                              fetchPriority="low"
                            />
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

      <ImageLightbox
        open={!!lightbox && (lightbox.urls?.length ?? 0) > 0}
        urls={lightbox?.urls ?? []}
        index={lightbox?.index ?? 0}
        alt={recipe.title}
        onClose={() => setLightbox(null)}
        onIndexChange={(j) => setLightbox((s) => (s ? { ...s, index: j } : s))}
      />

      <div className="fixed bottom-0 left-0 right-0 z-50 flex gap-3 border-t border-gray-100 bg-white p-4">
        <button
          type="button"
          onClick={addToPlan}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-orange-50 py-3.5 font-bold text-orange-600"
        >
          <Plus className="h-5 w-5" />
          加入计划
        </button>
        <Link
          to={`/cook/${recipe.id}`}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-orange-500 py-3.5 font-bold text-white shadow-lg shadow-orange-500/30"
        >
          <Play className="h-5 w-5 fill-current" />
          开始做菜
        </Link>
      </div>
    </div>
  )
}
