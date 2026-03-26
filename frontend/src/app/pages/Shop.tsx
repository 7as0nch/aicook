import { CheckSquare, Square, Share, CalendarClock, ShoppingBag, ArrowRight, ArrowLeft } from 'lucide-react'
import { format } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { getRecipeDetail } from '../../lib/api/client'
import { buildShopGroups, collectRecipeIdsFromPlan } from '../../lib/shopping/fromPlan'
import { useMealPlanStore } from '../../lib/state/meal-plan'

const STAPLES = {
  recipeId: 'staples',
  recipeName: '常规补给',
  items: [
    { key: 'egg', name: '鸡蛋', amount: '1盒' },
    { key: 'milk', name: '牛奶', amount: '1L' },
  ],
}

function shopItemKey(recipeId: string, itemKey: string) {
  return `shop:${recipeId}:${itemKey}`
}

/** 购物清单由周计划推导；勾选状态与采购历史仅存本地（无服务端 API）。 */
export default function Shop() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current')
  const weekPlan = useMealPlanStore((s) => s.weekPlan)
  const checkedItems = useMealPlanStore((s) => s.checkedItems)
  const toggleChecked = useMealPlanStore((s) => s.toggleChecked)
  const shopHistory = useMealPlanStore((s) => s.shopHistory)
  const pushShopHistory = useMealPlanStore((s) => s.pushShopHistory)
  const resetShopChecks = useMealPlanStore((s) => s.resetShopChecks)

  const [groups, setGroups] = useState<ReturnType<typeof buildShopGroups>>([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ids = collectRecipeIdsFromPlan(weekPlan)
    if (ids.length === 0) {
      setGroups([])
      setLoading(false)
      setLoadError('')
      return
    }
    let cancelled = false
    setLoading(true)
    setLoadError('')
    void Promise.all(ids.map((id) => getRecipeDetail(id)))
      .then((details) => {
        if (!cancelled) setGroups(buildShopGroups(details))
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : '加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [weekPlan])

  const currentList = useMemo(() => [...groups, STAPLES], [groups])

  const allRows = useMemo(
    () =>
      currentList.flatMap((g) =>
        g.items.map((item) => ({
          recipeId: g.recipeId,
          recipeName: g.recipeName,
          item,
        })),
      ),
    [currentList],
  )

  const checkedRows = allRows.filter((row) => checkedItems[shopItemKey(row.recipeId, row.item.key)])
  const progress =
    allRows.length === 0 ? 0 : Math.round((checkedRows.length / allRows.length) * 100)

  const handleComplete = () => {
    if (checkedRows.length === 0) return
    const recipeNames = new Set<string>()
    for (const row of checkedRows) {
      recipeNames.add(row.recipeName)
    }
    pushShopHistory({
      date: format(new Date(), 'yyyy-MM-dd HH:mm'),
      itemCount: checkedRows.length,
      recipes: [...recipeNames],
    })
    resetShopChecks()
    setActiveTab('history')
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-gray-50 pb-20">
      <div className="sticky top-0 z-10 space-y-4 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900">购物</h1>
          </div>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100"
          >
            <Share className="h-4 w-4" />
          </button>
        </div>

        <div className="flex rounded-xl bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('current')}
            className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${
              activeTab === 'current' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            当前清单
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${
              activeTab === 'history' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            采购记录
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'current' && (
          <div className="space-y-6 pb-24">
            {loading ? (
              <p className="py-12 text-center text-gray-500">加载食材清单…</p>
            ) : loadError ? (
              <p className="py-12 text-center text-red-600">{loadError}</p>
            ) : allRows.length > 0 ? (
              <>
                <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
                  <div className="mb-2 flex items-end justify-between">
                    <span className="text-sm font-bold text-orange-900">
                      采购进度 ({checkedRows.length}/{allRows.length})
                    </span>
                    <span className="text-2xl font-black text-orange-500">{progress}%</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-orange-200/50">
                    <div className="h-full rounded-full bg-orange-500 transition-all duration-500" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                <div className="space-y-4">
                  {currentList.map((recipe) => (
                    <div key={recipe.recipeName} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                      <div className="border-b border-gray-100 bg-gray-50/50 px-4 py-3">
                        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-700">
                          <ShoppingBag className="h-4 w-4 text-orange-400" />
                          {recipe.recipeName}
                        </h2>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {recipe.items.map((item) => {
                          const key = shopItemKey(recipe.recipeId, item.key)
                          const checked = !!checkedItems[key]
                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => toggleChecked(key)}
                              className="flex w-full cursor-pointer items-center justify-between p-4 text-left transition-colors active:bg-gray-50"
                            >
                              <div className="flex items-center gap-3">
                                {checked ? (
                                  <CheckSquare className="h-5 w-5 shrink-0 text-orange-500" />
                                ) : (
                                  <Square className="h-5 w-5 shrink-0 text-gray-300" />
                                )}
                                <span
                                  className={`text-base font-medium ${checked ? 'text-gray-400 line-through' : 'text-gray-800'}`}
                                >
                                  {item.name}
                                </span>
                              </div>
                              <span className={`text-sm ${checked ? 'text-gray-300' : 'text-gray-500'}`}>{item.amount}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
                  <ShoppingBag className="h-8 w-8 text-gray-300" />
                </div>
                <p>先在「计划」里安排菜谱，或执行种子 SQL 写入演示菜谱</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-3">
            {shopHistory.length === 0 ? (
              <p className="py-12 text-center text-gray-400">暂无采购记录</p>
            ) : (
              shopHistory.map((record) => (
                <div key={record.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <CalendarClock className="h-4 w-4" />
                      {record.date}
                    </div>
                    <span className="rounded-md bg-green-50 px-2 py-1 text-xs font-bold text-green-600">已完成</span>
                  </div>
                  <div className="space-y-1">
                    <div className="line-clamp-1 text-sm font-medium text-gray-800">包含：{record.recipes.join('、')}</div>
                    <div className="text-xs text-gray-400">共购买 {record.itemCount} 件食材</div>
                  </div>
                  <button
                    type="button"
                    className="mt-4 flex w-full items-center justify-center gap-1 rounded-xl bg-gray-50 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
                  >
                    查看详情 <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {activeTab === 'current' && checkedRows.length > 0 ? (
        <div className="fixed bottom-16 left-0 right-0 z-20 border-t border-gray-100 bg-white/80 p-4 pb-safe backdrop-blur-md">
          <button
            type="button"
            onClick={handleComplete}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-900 py-4 font-bold text-white shadow-lg"
          >
            完成本次采购 ({checkedRows.length}件)
          </button>
        </div>
      ) : null}
    </div>
  )
}
