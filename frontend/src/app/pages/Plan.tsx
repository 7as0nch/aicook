import { Calendar as CalendarIcon, ShoppingBag, Wand2, X } from 'lucide-react'
import { format } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { generateCurrentMealPlan, getCurrentMealPlan, saveCurrentMealPlan, type MealPlanWeek, type MealSlotKey } from '../../lib/api/client'
import { appendDish, buildWeekDates, dayOrder, ensureMealPlan, getCurrentWeekStart, slotLabels, slotOrder, toMealPlanPayload } from '../../lib/meal-plan/week'

export default function Plan() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [plan, setPlan] = useState<MealPlanWeek>(() => ensureMealPlan({
    week_start_date: getCurrentWeekStart(),
    timezone: 'Asia/Shanghai',
    source: 'manual',
    days: undefined as never,
  }))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [genBusy, setGenBusy] = useState(false)

  const weekStartDate = plan.week_start_date || getCurrentWeekStart()
  const weekDates = useMemo(() => buildWeekDates(weekStartDate), [weekStartDate])
  const selectedDay = dayOrder[selectedIdx]

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void getCurrentMealPlan(weekStartDate)
      .then((payload) => {
        if (!cancelled) setPlan(ensureMealPlan(payload))
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : '加载周计划失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [weekStartDate])

  useEffect(() => {
    const recipeId = searchParams.get('add_recipe_id')
    const recipeTitle = searchParams.get('add_recipe_title')
    const day = searchParams.get('day') as typeof dayOrder[number] | null
    const slot = searchParams.get('slot') as MealSlotKey | null
    if (!recipeId || !recipeTitle || !day || !slot) return
    if (!dayOrder.includes(day) || !slotOrder.includes(slot)) return

    setSaving(true)
    const nextPlan = appendDish(plan, day, slot, { recipe_id: recipeId, recipe_title: recipeTitle })
    void saveCurrentMealPlan(toMealPlanPayload(nextPlan))
      .then((saved) => {
        setPlan(ensureMealPlan(saved))
        toast.success(`已把《${recipeTitle}》加入${slotLabels[slot]}`)
        const next = new URLSearchParams(searchParams)
        next.delete('add_recipe_id')
        next.delete('add_recipe_title')
        next.delete('day')
        next.delete('slot')
        setSearchParams(next, { replace: true })
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : '加入计划失败')
      })
      .finally(() => setSaving(false))
  }, [plan, searchParams, setSearchParams])

  async function onAiGenerate() {
    setGenBusy(true)
    try {
      const next = await generateCurrentMealPlan(weekStartDate)
      setPlan(ensureMealPlan(next))
      toast.success('本周菜单已生成')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '生成周计划失败')
    } finally {
      setGenBusy(false)
    }
  }

  async function removeFromSlot(day: typeof dayOrder[number], slot: MealSlotKey, dishIndex: number) {
    const nextPlan = ensureMealPlan(plan)
    nextPlan.days[day][slot] = (nextPlan.days[day]?.[slot] ?? []).filter((_, index) => index !== dishIndex)
    setSaving(true)
    try {
      const saved = await saveCurrentMealPlan(toMealPlanPayload(nextPlan))
      setPlan(ensureMealPlan(saved))
      toast.success('已从计划中移除')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '移除失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 p-4">
      <div className="sticky top-0 z-20 -mx-4 shrink-0 bg-gray-50/95 px-4 pb-2 pt-0 backdrop-blur supports-[backdrop-filter]:bg-gray-50/80">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">本周菜单</h1>
            <p className="mt-1 text-xs text-gray-400">支持一周 7 天、一日三餐、一餐多道菜</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={genBusy || loading}
              onClick={() => void onAiGenerate()}
              className="flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1.5 text-xs font-bold text-orange-700 disabled:opacity-50"
            >
              <Wand2 className="h-3.5 w-3.5" />
              {genBusy ? '生成中…' : 'AI 生成'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/shop')}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-white"
            >
              <ShoppingBag className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 hide-scrollbar">
        {weekDates.map((item, idx) => {
          const active = idx === selectedIdx
          return (
            <button
              key={item.day}
              type="button"
              onClick={() => setSelectedIdx(idx)}
              className={`flex h-20 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border ${
                active
                  ? 'border-orange-500 bg-orange-500 text-white shadow-md shadow-orange-500/30'
                  : 'border-gray-100 bg-white text-gray-500'
              }`}
            >
              <span className="text-xs">{item.label}</span>
              <span className="text-lg font-bold">{format(item.date, 'd')}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-gray-500">加载本周计划…</p>
      ) : (
        <div className="space-y-4">
          {slotOrder.map((slot) => {
            const dishes = plan.days[selectedDay]?.[slot] ?? []
            return (
              <div key={slot} className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-500">{slotLabels[slot]}</h3>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => navigate(`/recipes?from=plan&day=${selectedDay}&slot=${slot}`)}
                    className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 disabled:opacity-50"
                  >
                    添一道菜
                  </button>
                </div>
                {dishes.length > 0 ? (
                  <div className="space-y-3">
                    {dishes.map((dish, index) => (
                      <div key={`${slot}-${dish.id || dish.recipe_id || dish.recipe_title}-${index}`} className="flex items-center gap-3 rounded-2xl bg-gray-50 px-3 py-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
                          <CalendarIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          {dish.recipe_id ? (
                            <Link to={`/recipes/${dish.recipe_id}`} className="block truncate text-sm font-bold text-gray-900">
                              {dish.recipe_title}
                            </Link>
                          ) : (
                            <p className="truncate text-sm font-bold text-gray-900">{dish.recipe_title}</p>
                          )}
                          {dish.note ? <p className="mt-1 text-xs text-gray-500">{dish.note}</p> : null}
                        </div>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void removeFromSlot(selectedDay, slot, index)}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-400 disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate(`/recipes?from=plan&day=${selectedDay}&slot=${slot}`)}
                    className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-200 py-4 text-sm font-medium text-gray-400"
                  >
                    <span className="text-lg">+</span>
                    添加菜谱
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => navigate('/shop')}
        className="w-full rounded-2xl bg-gray-900 py-3.5 font-bold text-white shadow-lg"
      >
        查看购物清单
      </button>
    </div>
  )
}
