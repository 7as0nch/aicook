import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { listRecipes, type RecipeCard } from '../../lib/api/client'
import { type MealSlot, type WeekPlan, useMealPlanStore } from '../../lib/state/meal-plan'

import { ShoppingListSection } from './ShoppingListSection'

const dayEntries: Array<{ key: keyof WeekPlan; label: string; short: string }> = [
  { key: 'monday', label: '周一', short: '一' },
  { key: 'tuesday', label: '周二', short: '二' },
  { key: 'wednesday', label: '周三', short: '三' },
  { key: 'thursday', label: '周四', short: '四' },
  { key: 'friday', label: '周五', short: '五' },
  { key: 'saturday', label: '周六', short: '六' },
  { key: 'sunday', label: '周日', short: '日' },
]

const slotEntries: Array<{ key: MealSlot; label: string }> = [
  { key: 'breakfast', label: '早餐' },
  { key: 'lunch', label: '午餐' },
  { key: 'dinner', label: '晚餐' },
]

export function PlanPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'shopping' ? 'shopping' : 'weekly'
  const weekPlan = useMealPlanStore((state) => state.weekPlan)
  const assignMeal = useMealPlanStore((state) => state.assignMeal)
  const generatePlan = useMealPlanStore((state) => state.generatePlan)
  const [recipes, setRecipes] = useState<RecipeCard[]>([])
  const [todayKey, setTodayKey] = useState<keyof WeekPlan>('monday')

  useEffect(() => {
    const day = new Date().getDay()
    const map: (keyof WeekPlan)[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    setTodayKey(map[day] ?? 'monday')
  }, [])

  useEffect(() => {
    let cancelled = false
    void listRecipes(12).then((items) => {
      if (!cancelled) setRecipes(items)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function setTab(next: 'weekly' | 'shopping') {
    if (next === 'shopping') {
      setSearchParams({ tab: 'shopping' })
    } else {
      setSearchParams({})
    }
  }

  return (
    <div className="space-y-10 pb-8">
      <div className="flex justify-center">
        <div className="inline-flex rounded-2xl bg-surface-container-low p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setTab('weekly')}
            className={[
              'rounded-xl px-8 py-2.5 font-headline text-sm font-bold transition-all',
              tab === 'weekly' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:bg-surface-container',
            ].join(' ')}
          >
            周计划
          </button>
          <button
            type="button"
            onClick={() => setTab('shopping')}
            className={[
              'rounded-xl px-8 py-2.5 font-headline text-sm font-bold transition-all',
              tab === 'shopping' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:bg-surface-container',
            ].join(' ')}
          >
            购物清单
          </button>
        </div>
      </div>

      {tab === 'weekly' ? (
        <>
          <section className="relative grid grid-cols-1 gap-6 overflow-hidden rounded-[2rem] bg-primary-fixed p-8 md:grid-cols-1">
            <div className="relative z-10 flex flex-col items-center justify-between gap-6 md:flex-row md:text-left">
              <div className="text-center md:text-left">
                <h2 className="font-headline mb-2 text-3xl font-extrabold tracking-tight text-on-primary-fixed">需要灵感？</h2>
                <p className="max-w-md text-on-primary-fixed-variant">
                  根据已有菜谱一键铺满一周三餐，再手动微调即可。
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-on-primary transition-all hover:opacity-90 active:scale-95"
                  onClick={() => generatePlan(recipes.map((r) => ({ id: r.id, title: r.title })))}
                >
                  <span className="material-symbols-outlined">magic_button</span>
                  生成计划
                </button>
                <Link
                  to="/"
                  className="rounded-xl bg-surface-container-lowest/50 px-6 py-3 font-bold text-on-primary-fixed backdrop-blur transition-all hover:bg-white active:scale-95"
                >
                  去选菜
                </Link>
              </div>
            </div>
            <div className="pointer-events-none absolute -bottom-10 -right-10 h-48 w-48 rounded-full bg-primary-container/20 blur-3xl" />
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-7 md:gap-4">
            {dayEntries.map((day) => {
              const isToday = day.key === todayKey
              return (
                <div key={day.key} className="flex flex-col gap-3">
                  <h3
                    className={[
                      'font-headline border-b-2 pb-2 text-center text-lg font-bold',
                      isToday ? 'border-primary-fixed text-primary' : 'border-transparent text-on-surface-variant/50',
                    ].join(' ')}
                  >
                    <span className="md:hidden">{day.label}</span>
                    <span className="hidden md:inline">{day.short}</span>
                  </h3>
                  <div className="flex flex-col gap-3">
                    {slotEntries.map((slot) => {
                      const assignment = weekPlan[day.key][slot.key]
                      const hasMeal = Boolean(assignment.label)
                      return (
                        <div
                          key={slot.key}
                          className={[
                            'rounded-2xl p-4 transition-all',
                            hasMeal
                              ? 'bg-surface-container-low hover:bg-surface-container'
                              : 'flex min-h-[5rem] items-center justify-center border-2 border-dashed border-outline-variant/20 bg-surface-container-low hover:border-primary-fixed-dim',
                          ].join(' ')}
                        >
                          {hasMeal ? (
                            <>
                              <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">
                                {slot.label}
                              </span>
                              <p className="text-sm font-semibold leading-tight text-on-surface">{assignment.label}</p>
                              <select
                                value={assignment.recipeId ?? ''}
                                onChange={(e) => {
                                  const recipeId = e.target.value
                                  const recipe = recipes.find((item) => item.id === recipeId)
                                  assignMeal(day.key, slot.key, recipeId || undefined, recipe?.title || undefined)
                                }}
                                className="mt-2 w-full rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-2 py-2 text-xs outline-none"
                              >
                                <option value="">更换</option>
                                {recipes.map((recipe) => (
                                  <option key={recipe.id} value={recipe.id}>
                                    {recipe.title}
                                  </option>
                                ))}
                              </select>
                            </>
                          ) : (
                            <div className="flex w-full flex-col items-center gap-2 p-2">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">{slot.label}</span>
                              <select
                                value=""
                                onChange={(e) => {
                                  const recipeId = e.target.value
                                  const recipe = recipes.find((item) => item.id === recipeId)
                                  if (recipeId) assignMeal(day.key, slot.key, recipeId, recipe?.title)
                                }}
                                className="w-full rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-2 py-2 text-xs outline-none"
                              >
                                <option value="">选择菜谱</option>
                                {recipes.map((recipe) => (
                                  <option key={recipe.id} value={recipe.id}>
                                    {recipe.title}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </section>

          <ShoppingListSection showGenerateLink={false} className="mt-16" />
        </>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button type="button" onClick={() => setTab('weekly')} className="text-sm font-semibold text-primary hover:underline">
              编辑周计划
            </button>
          </div>
          <ShoppingListSection showGenerateLink={false} />
        </div>
      )}
    </div>
  )
}
