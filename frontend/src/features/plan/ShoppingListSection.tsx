import { Link } from 'react-router-dom'

import { type MealSlot, type WeekPlan, useMealPlanStore } from '../../lib/state/meal-plan'

const dayEntries: Array<{ key: keyof WeekPlan; label: string }> = [
  { key: 'monday', label: '周一' },
  { key: 'tuesday', label: '周二' },
  { key: 'wednesday', label: '周三' },
  { key: 'thursday', label: '周四' },
  { key: 'friday', label: '周五' },
  { key: 'saturday', label: '周六' },
  { key: 'sunday', label: '周日' },
]

const slotEntries: Array<{ key: MealSlot; label: string }> = [
  { key: 'breakfast', label: '早餐' },
  { key: 'lunch', label: '午餐' },
  { key: 'dinner', label: '晚餐' },
]

function buildShoppingGroups(weekPlan: WeekPlan) {
  const meals: string[] = []
  for (const day of dayEntries) {
    for (const slot of slotEntries) {
      const label = weekPlan[day.key][slot.key].label
      if (label) {
        meals.push(`${day.label}${slot.label}：${label}`)
      }
    }
  }

  return [
    {
      title: '蔬菜',
      icon: 'eco' as const,
      items: meals.length ? ['叶菜、番茄、根茎类（按菜单调整）', '葱姜蒜'] : ['安排菜单后更易汇总'],
    },
    {
      title: '肉蛋奶',
      icon: 'set_meal' as const,
      items: meals.length ? ['主荤食材按周计划补齐', '鸡蛋、豆腐'] : ['安排菜单后更易汇总'],
    },
    {
      title: '常备',
      icon: 'kitchen' as const,
      items: ['米面油、基础调料', '早餐牛奶或燕麦', ...(meals.length ? ['按菜单补充酱料'] : [])],
    },
  ]
}

interface ShoppingListSectionProps {
  showGenerateLink?: boolean
  className?: string
}

export function ShoppingListSection({ showGenerateLink = true, className = '' }: ShoppingListSectionProps) {
  const weekPlan = useMealPlanStore((state) => state.weekPlan)
  const checkedItems = useMealPlanStore((state) => state.checkedItems)
  const toggleChecked = useMealPlanStore((state) => state.toggleChecked)
  const groups = buildShoppingGroups(weekPlan)

  return (
    <section className={className}>
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">购物清单</h2>
          <p className="mt-1 text-on-surface-variant">按厨房区域分组，逛超市逐项勾选</p>
        </div>
        {showGenerateLink ? (
          <Link
            to="/plan"
            className="inline-flex items-center gap-2 rounded-xl bg-primary-container px-6 py-3 font-bold text-on-primary-container transition-opacity hover:opacity-90"
          >
            <span className="material-symbols-outlined">sync</span>
            从周计划生成
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {groups.map((group) => (
          <div key={group.title} className="rounded-[2rem] bg-surface-container-lowest p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <span className="material-symbols-outlined rounded-lg bg-primary-fixed p-2 text-primary">{group.icon}</span>
              <h3 className="font-headline text-xl font-bold">{group.title}</h3>
              <span className="ml-auto rounded-full bg-surface-container px-2 py-1 text-xs font-bold text-on-surface-variant">
                {group.items.length} 项
              </span>
            </div>
            <div className="space-y-4">
              {group.items.map((item) => {
                const key = `${group.title}:${item}`
                const checked = Boolean(checkedItems[key])
                return (
                  <label
                    key={key}
                    className="group flex cursor-pointer items-center gap-4"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleChecked(key)}
                      className="h-6 w-6 rounded-md border-outline-variant text-primary focus:ring-primary-fixed"
                    />
                    <div className={checked ? 'opacity-50' : ''}>
                      <span className={`font-semibold text-on-surface ${checked ? 'line-through' : 'group-hover:text-primary'}`}>{item}</span>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
