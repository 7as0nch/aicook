import { Calendar as CalendarIcon, Wand2, ShoppingBag } from 'lucide-react'
import { addDays, startOfWeek } from 'date-fns'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { listRecipes } from '../../lib/api/client'
import { mapCardToUiRecipe } from '../../lib/mappers/recipe'
import { useMealPlanStore, type MealSlot, type WeekPlan } from '../../lib/state/meal-plan'

const dayOrder: Array<keyof WeekPlan> = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]
const dayShort = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const slotOrder: MealSlot[] = ['breakfast', 'lunch', 'dinner']
const slotLabel: Record<MealSlot, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
}

/** 周计划与购物清单仅保存在浏览器（Zustand persist），后端暂无 meal_plan / shopping_list API。 */
export default function Plan() {
  const navigate = useNavigate()
  const weekPlan = useMealPlanStore((s) => s.weekPlan)
  const generatePlan = useMealPlanStore((s) => s.generatePlan)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [genBusy, setGenBusy] = useState(false)

  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), [])

  const selectedDay = dayOrder[selectedIdx]

  async function onAiGenerate() {
    setGenBusy(true)
    try {
      const cards = await listRecipes(24)
      const recipes = cards.map((c) => {
        const u = mapCardToUiRecipe(c)
        return { id: u.id, title: u.title }
      })
      generatePlan(recipes)
    } finally {
      setGenBusy(false)
    }
  }

  return (
    <div className="space-y-6 p-4">
      <div className="sticky top-0 z-20 -mx-4 shrink-0 bg-gray-50/95 px-4 pb-2 pt-0 backdrop-blur supports-[backdrop-filter]:bg-gray-50/80">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">本周菜单</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={genBusy}
              onClick={() => void onAiGenerate()}
              className="flex items-center gap-1.5 rounded-full bg-purple-100 px-3 py-1.5 text-xs font-bold text-purple-700 disabled:opacity-50"
            >
              <Wand2 className="h-3.5 w-3.5" />
              {genBusy ? '生成中…' : 'AI 生成'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/shop')}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-orange-600"
            >
              <ShoppingBag className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 hide-scrollbar">
        {dayShort.map((day, idx) => {
          const d = addDays(weekStart, idx)
          const dom = d.getDate()
          const active = idx === selectedIdx
          return (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedIdx(idx)}
              className={`flex h-20 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border ${
                active
                  ? 'border-orange-500 bg-orange-500 text-white shadow-md shadow-orange-500/30'
                  : 'border-gray-100 bg-white text-gray-500'
              }`}
            >
              <span className="text-xs">{day}</span>
              <span className="text-lg font-bold">{dom}</span>
            </button>
          )
        })}
      </div>

      <div className="space-y-4">
        {slotOrder.map((slot) => {
          const assign = weekPlan[selectedDay][slot]
          const recipeId = assign.recipeId
          const label = assign.label

          return (
            <div key={slot} className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-bold text-gray-500">{slotLabel[slot]}</h3>
              {recipeId && label ? (
                <Link to={`/recipes/${recipeId}`} className="flex items-center gap-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-2xl">
                    <CalendarIcon className="h-6 w-6 text-orange-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="truncate text-base font-bold text-gray-900">{label}</h4>
                    <span className="text-xs text-gray-500">点击查看详情</span>
                  </div>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('/recipes')}
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
