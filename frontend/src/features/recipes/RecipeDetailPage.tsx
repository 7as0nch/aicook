import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { getRecipeDetail, type RecipeDetail } from '../../lib/api/client'
import { useCookingStore } from '../../lib/state/cooking'
import { useMealPlanStore } from '../../lib/state/meal-plan'

function difficultyLabel(value: number) {
  if (value <= 1) return '简单'
  if (value <= 2) return '中等'
  return '进阶'
}

export function RecipeDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activeStepNo = Number(searchParams.get('step') || '1') || 1

  const setCookingRecipe = useCookingStore((state) => state.setRecipe)
  const assignMeal = useMealPlanStore((state) => state.assignMeal)
  const [detail, setDetail] = useState<RecipeDetail>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [checkedIng, setCheckedIng] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError('')
    void getRecipeDetail(id)
      .then((payload) => {
        if (!cancelled) setDetail(payload)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '菜谱详情加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const activeStepIndex = useMemo(() => {
    if (!detail?.steps.length) return 0
    const idx = detail.steps.findIndex((s) => s.step_no === activeStepNo)
    return idx >= 0 ? idx : 0
  }, [detail, activeStepNo])

  if (loading) {
    return <div className="h-[60vh] animate-pulse rounded-3xl bg-surface-container-low" />
  }

  if (error || !detail) {
    return (
      <div className="rounded-3xl border border-outline-variant/30 bg-surface-container-lowest p-6">
        <p className="text-sm text-tertiary">{error || '没有找到该菜谱。'}</p>
        <Link to="/" className="mt-4 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary">
          返回首页
        </Link>
      </div>
    )
  }

  const { recipe, ingredients, steps } = detail
  const prepM = Math.max(5, Math.floor(recipe.total_minutes * 0.35))
  const cookM = Math.max(1, recipe.total_minutes - prepM)

  function startCooking() {
    setCookingRecipe(recipe.id, detail)
    navigate(`/cooking?recipe=${recipe.id}`)
  }

  function addToPlan() {
    assignMeal('monday', 'dinner', recipe.id, recipe.title)
    navigate('/plan')
  }

  return (
    <div className="relative mb-28 space-y-12 lg:mb-8">
      <div className="relative grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-8">
        <div className="relative z-10 lg:col-span-7">
          <div className="overflow-hidden rounded-3xl shadow-2xl transition-transform duration-500 hover:rotate-0 lg:-rotate-1">
            <img
              src={recipe.cover_image_url || 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1600&q=80'}
              alt={recipe.title}
              className="aspect-[4/3] w-full object-cover md:h-auto"
            />
          </div>
        </div>

        <div className="lg:col-span-5 lg:pt-8">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-tertiary-container/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-tertiary">
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
              local_fire_department
            </span>
            {recipe.category || '家常'}
          </div>
          <h2 className="font-headline mb-6 text-5xl font-extrabold leading-none tracking-tighter text-on-surface md:text-6xl">{recipe.title}</h2>
          <p className="mb-8 max-w-md text-lg leading-relaxed text-on-surface-variant" data-selection-source={`recipe-summary-${recipe.id}`}>
            {recipe.summary || '适合家庭厨房、强调执行步骤与节奏的菜谱。'}
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col items-center justify-center rounded-2xl bg-surface-container-low p-4 text-center">
              <span className="font-headline text-2xl font-bold text-primary">{prepM} 分钟</span>
              <span className="text-xs font-semibold uppercase tracking-tighter text-on-surface-variant">准备</span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl bg-surface-container-low p-4 text-center">
              <span className="font-headline text-2xl font-bold text-primary">{cookM} 分钟</span>
              <span className="text-xs font-semibold uppercase tracking-tighter text-on-surface-variant">烹饪</span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl bg-surface-container-low p-4 text-center">
              <span className="font-headline text-2xl font-bold text-tertiary">{difficultyLabel(recipe.difficulty)}</span>
              <span className="text-xs font-semibold uppercase tracking-tighter text-on-surface-variant">难度</span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl bg-surface-container-low p-4 text-center">
              <span className="font-headline text-2xl font-bold text-primary">2–4</span>
              <span className="text-xs font-semibold uppercase tracking-tighter text-on-surface-variant">人份</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
        <aside className="lg:col-span-4 lg:sticky lg:top-24 lg:h-fit">
          <div className="rounded-3xl bg-surface-container-low p-8">
            <div className="mb-8 flex items-center justify-between">
              <h3 className="font-headline text-2xl font-bold tracking-tight">食材</h3>
              <Link to="/plan?tab=shopping" className="flex items-center gap-1 text-sm font-semibold text-primary hover:opacity-80">
                <span className="material-symbols-outlined text-base">shopping_cart</span>
                加入清单
              </Link>
            </div>
            <ul className="space-y-4" data-selection-source={`recipe-ingredients-${recipe.id}`}>
              {ingredients.map((ingredient) => {
                const checked = Boolean(checkedIng[ingredient.id])
                return (
                  <li key={ingredient.id} className="group flex items-start gap-3">
                    <button
                      type="button"
                      aria-pressed={checked}
                      onClick={() =>
                        setCheckedIng((prev) => ({
                          ...prev,
                          [ingredient.id]: !prev[ingredient.id],
                        }))
                      }
                      className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-outline-variant transition-colors group-hover:bg-primary-fixed"
                    >
                      {checked ? (
                        <span className="material-symbols-outlined text-[16px] text-on-primary-container">check</span>
                      ) : null}
                    </button>
                    <div>
                      <span className="font-headline block text-lg font-bold leading-none">{ingredient.amount_text || '适量'}</span>
                      <span className="text-sm text-on-surface-variant">
                        {ingredient.name}
                        {ingredient.preparation ? `，${ingredient.preparation}` : ''}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </aside>

        <div className="space-y-12 lg:col-span-8">
          <section>
            <h3 className="font-headline mb-8 text-3xl font-bold tracking-tight">执行步骤</h3>
            <div className="space-y-8">
              {steps.map((step, index) => {
                const isActive = index === activeStepIndex
                return (
                  <div
                    key={step.id}
                    className={[
                      'relative rounded-[2rem] p-8',
                      isActive
                        ? 'bg-surface-container-lowest shadow-sm'
                        : 'border border-surface-variant/30 bg-surface',
                    ].join(' ')}
                    data-selection-source={`recipe-step-${step.recipe_id}-${step.step_no}`}
                  >
                    <div
                      className={[
                        'absolute -left-4 -top-4 flex h-12 w-12 items-center justify-center rounded-2xl font-headline text-xl font-black shadow-lg',
                        isActive ? 'bg-tertiary-container text-white' : 'bg-surface-container-high text-on-surface-variant',
                      ].join(' ')}
                    >
                      {String(step.step_no).padStart(2, '0')}
                    </div>
                    <h4 className="font-headline mb-3 text-xl font-bold text-on-surface">{step.title || `步骤 ${step.step_no}`}</h4>
                    <p className="leading-relaxed text-on-surface-variant">{step.description}</p>
                    {step.need_timer && step.timer_seconds > 0 ? (
                      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-primary">
                        计时约 {Math.ceil(step.timer_seconds / 60)} 分钟
                      </p>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>

          <section className="flex flex-col gap-8 rounded-3xl bg-primary-fixed/20 p-8 md:flex-row md:items-center">
            <div className="flex-1">
              <h4 className="font-headline mb-2 text-2xl font-bold">小贴士</h4>
              <p className="italic text-on-primary-fixed-variant">
                {steps[0]?.ai_hint || '提前量好调料、备好食材，开火后节奏更快。'}
              </p>
              <div className="mt-4 flex items-center gap-2 font-semibold text-primary">
                <span className="material-symbols-outlined text-sm">link</span>
                <span>来源：{recipe.source_type || '家庭菜谱'}</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="fixed bottom-28 right-6 z-40 flex flex-col items-end gap-4 lg:bottom-8 lg:right-8">
        <button
          type="button"
          onClick={addToPlan}
          className="flex items-center gap-2 rounded-full bg-surface-container-lowest px-6 py-3 font-bold text-primary shadow-xl transition-all hover:scale-105 active:scale-95"
        >
          <span className="material-symbols-outlined">calendar_add_on</span>
          加入周计划
        </button>
        <button
          type="button"
          onClick={startCooking}
          className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-primary to-primary-container px-10 py-5 font-headline text-xl font-black tracking-tight text-white shadow-2xl transition-all hover:scale-105 active:scale-95"
        >
          <span className="material-symbols-outlined text-3xl">play_circle</span>
          开始做菜
        </button>
      </div>
    </div>
  )
}
