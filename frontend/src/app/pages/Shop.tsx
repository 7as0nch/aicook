import { ArrowLeft, CheckSquare, RotateCcw, Share2, ShoppingBag, Square } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { completeShoppingList, getCurrentShoppingList, regenerateShoppingList, updateShoppingListItem, type ShoppingListItem, type ShoppingListSummary } from '../../lib/api/client'
import { getCurrentWeekStart } from '../../lib/meal-plan/week'
import { toast } from 'sonner'

function groupShoppingItems(items: ShoppingListItem[]) {
  const groups = new Map<string, ShoppingListItem[]>()
  for (const item of items) {
    const key = item.source_recipe_title || item.category || '其他采购项'
    const list = groups.get(key) ?? []
    list.push(item)
    groups.set(key, list)
  }
  return [...groups.entries()].map(([title, rows]) => ({ title, rows }))
}

export default function Shop() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [busyItemId, setBusyItemId] = useState<string | null>(null)
  const [listBusy, setListBusy] = useState(false)
  const [shoppingList, setShoppingList] = useState<ShoppingListSummary | null>(null)
  const [items, setItems] = useState<ShoppingListItem[]>([])

  async function refreshCurrentList() {
    setLoading(true)
    try {
      const payload = await getCurrentShoppingList(getCurrentWeekStart())
      setShoppingList(payload.list)
      setItems(payload.items)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载购物清单失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshCurrentList()
  }, [])

  const checkedCount = items.filter((item) => item.checked).length
  const progress = items.length === 0 ? 0 : Math.round((checkedCount / items.length) * 100)
  const groups = useMemo(() => groupShoppingItems(items), [items])

  async function toggleItem(item: ShoppingListItem) {
    if (!shoppingList) return
    setBusyItemId(item.id)
    try {
      const next = await updateShoppingListItem(shoppingList.id, item.id, { checked: !item.checked })
      setItems((current) => current.map((row) => (row.id === next.id ? next : row)))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新失败')
    } finally {
      setBusyItemId(null)
    }
  }

  async function regenerate() {
    setListBusy(true)
    try {
      const payload = await regenerateShoppingList(getCurrentWeekStart())
      setShoppingList(payload.list)
      setItems(payload.items)
      toast.success('已按当前周计划重新生成清单')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '重生成失败')
    } finally {
      setListBusy(false)
    }
  }

  async function completeCurrentList() {
    if (!shoppingList) return
    setListBusy(true)
    try {
      const next = await completeShoppingList(shoppingList.id)
      setShoppingList(next)
      toast.success('采购完成，已将勾选项回写到库存')
      await refreshCurrentList()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '完成采购失败')
    } finally {
      setListBusy(false)
    }
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-gray-50 pb-20">
      <div className="sticky top-0 z-10 space-y-4 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate(-1)} className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-50 text-gray-600">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">购物清单</h1>
              <p className="text-xs text-gray-400">服务端快照，勾选完成后会回写库存</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => toast.info('分享清单入口已预留，下一步会接家庭协作能力。')} className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-50 text-gray-600">
              <Share2 className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => void regenerate()} disabled={listBusy} className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-orange-600 disabled:opacity-50">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="py-12 text-center text-gray-500">加载购物清单…</p>
        ) : items.length > 0 ? (
          <div className="space-y-6 pb-24">
            <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
              <div className="mb-2 flex items-end justify-between">
                <span className="text-sm font-bold text-orange-900">采购进度 ({checkedCount}/{items.length})</span>
                <span className="text-2xl font-black text-orange-500">{progress}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-orange-200/50">
                <div className="h-full rounded-full bg-orange-500 transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.title} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                  <div className="border-b border-gray-100 bg-gray-50/50 px-4 py-3">
                    <h2 className="flex items-center gap-2 text-sm font-bold text-gray-700">
                      <ShoppingBag className="h-4 w-4 text-orange-400" />
                      {group.title}
                    </h2>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {group.rows.map((item) => {
                      const checked = item.checked
                      return (
                        <button key={item.id} type="button" disabled={busyItemId === item.id || listBusy} onClick={() => void toggleItem(item)} className="flex w-full items-center justify-between p-4 text-left transition-colors active:bg-gray-50 disabled:opacity-50">
                          <div className="flex items-center gap-3">
                            {checked ? <CheckSquare className="h-5 w-5 shrink-0 text-orange-500" /> : <Square className="h-5 w-5 shrink-0 text-gray-300" />}
                            <div>
                              <span className={`block text-base font-medium ${checked ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{item.ingredient_name}</span>
                              {item.category ? <span className="text-xs text-gray-400">{item.category}</span> : null}
                            </div>
                          </div>
                          <span className={`text-sm ${checked ? 'text-gray-300' : 'text-gray-500'}`}>{item.missing_text || item.required_text || '适量'}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
              <ShoppingBag className="h-8 w-8 text-gray-300" />
            </div>
            <p>先在「计划」里安排本周菜单，再生成购物清单</p>
          </div>
        )}
      </div>

      {shoppingList && items.length > 0 ? (
        <div className="fixed bottom-16 left-0 right-0 z-20 border-t border-gray-100 bg-white/80 p-4 pb-safe backdrop-blur-md">
          <button type="button" disabled={checkedCount === 0 || listBusy || shoppingList.status === 'completed'} onClick={() => void completeCurrentList()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-900 py-4 font-bold text-white shadow-lg disabled:opacity-50">
            {shoppingList.status === 'completed' ? '本周采购已完成' : `完成本次采购 (${checkedCount}件)`}
          </button>
        </div>
      ) : null}
    </div>
  )
}
