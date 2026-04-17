import { addDays, format, startOfWeek } from 'date-fns'
import type { MealPlanDish, MealPlanWeek, MealSlotKey } from '../api/client'

export const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
export const dayLabels: Record<(typeof dayOrder)[number], string> = {
  monday: '周一',
  tuesday: '周二',
  wednesday: '周三',
  thursday: '周四',
  friday: '周五',
  saturday: '周六',
  sunday: '周日',
}

export const slotOrder: MealSlotKey[] = ['breakfast', 'lunch', 'dinner']
export const slotLabels: Record<MealSlotKey, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
}

export function getCurrentWeekStart(date = new Date()) {
  return format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

export function createEmptyMealPlanDays(): MealPlanWeek['days'] {
  return {
    monday: { breakfast: [], lunch: [], dinner: [] },
    tuesday: { breakfast: [], lunch: [], dinner: [] },
    wednesday: { breakfast: [], lunch: [], dinner: [] },
    thursday: { breakfast: [], lunch: [], dinner: [] },
    friday: { breakfast: [], lunch: [], dinner: [] },
    saturday: { breakfast: [], lunch: [], dinner: [] },
    sunday: { breakfast: [], lunch: [], dinner: [] },
  }
}

export function ensureMealPlan(plan?: MealPlanWeek | null): MealPlanWeek {
  return {
    id: plan?.id,
    week_start_date: plan?.week_start_date ?? getCurrentWeekStart(),
    timezone: plan?.timezone ?? 'Asia/Shanghai',
    source: plan?.source ?? 'manual',
    days: {
      ...createEmptyMealPlanDays(),
      ...(plan?.days ?? {}),
    },
  }
}

export function appendDish(plan: MealPlanWeek, day: (typeof dayOrder)[number], slot: MealSlotKey, dish: { recipe_id?: string; recipe_title: string; note?: string }) {
  const next = ensureMealPlan(plan)
  const current = next.days[day]?.[slot] ?? []
  next.days[day][slot] = [
    ...current,
    {
      id: `${day}-${slot}-${Date.now()}`,
      recipe_id: dish.recipe_id,
      recipe_title: dish.recipe_title,
      note: dish.note ?? '',
    },
  ]
  return next
}

export function removeDish(plan: MealPlanWeek, day: (typeof dayOrder)[number], slot: MealSlotKey, dishIndex: number) {
  const next = ensureMealPlan(plan)
  next.days[day][slot] = (next.days[day]?.[slot] ?? []).filter((_, index) => index !== dishIndex)
  return next
}

export function replaceDishNote(plan: MealPlanWeek, day: (typeof dayOrder)[number], slot: MealSlotKey, dishIndex: number, note: string) {
  const next = ensureMealPlan(plan)
  next.days[day][slot] = (next.days[day]?.[slot] ?? []).map((dish, index) =>
    index === dishIndex ? { ...dish, note } : dish,
  )
  return next
}

export function toMealPlanPayload(plan: MealPlanWeek) {
  const normalized = ensureMealPlan(plan)
  return {
    week_start_date: normalized.week_start_date,
    days: Object.fromEntries(
      dayOrder.map((day) => [
        day,
        Object.fromEntries(
          slotOrder.map((slot) => [
            slot,
            (normalized.days[day]?.[slot] ?? []).map((dish: MealPlanDish) => ({
              recipe_id: dish.recipe_id,
              recipe_title: dish.recipe_title,
              note: dish.note ?? '',
            })),
          ]),
        ),
      ]),
    ) as MealPlanWeek['days'],
  }
}

export function buildWeekDates(weekStartDate: string) {
  const base = new Date(`${weekStartDate}T00:00:00`)
  return dayOrder.map((day, index) => ({
    day,
    label: dayLabels[day],
    date: addDays(base, index),
  }))
}
