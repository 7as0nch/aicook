// 周计划 + 购物清单 store
import { observable, action } from 'mobx-miniprogram';
import { kitchenApi } from '../services/kitchen.api';
import type { MealPlanDays, MealPlanWeek, ShoppingList, ShoppingListItem } from '../types/api';

export const planStore = observable({
  plan: null as MealPlanWeek | null,
  shoppingList: null as ShoppingList | null,
  shoppingItems: [] as ShoppingListItem[],

  loadPlan: action(async function (this: typeof planStore, week_start?: string) {
    const res = await kitchenApi.getMealPlan(week_start);
    this.plan = res.plan;
  }),

  generatePlan: action(async function (this: typeof planStore, week_start?: string) {
    const res = await kitchenApi.generateMealPlan(week_start);
    this.plan = res.plan;
  }),

  // 全量保存周计划（后端 PUT 为整周覆盖式，调用方需先带回现有 days 再增量修改）
  savePlan: action(async function (this: typeof planStore, week_start_date: string, days: MealPlanDays) {
    const res = await kitchenApi.saveMealPlan({ week_start_date, days });
    this.plan = res.plan;
  }),

  loadShopping: action(async function (this: typeof planStore, week_start?: string) {
    const res = await kitchenApi.getShoppingList(week_start);
    this.shoppingList = res.list;
    this.shoppingItems = res.items || [];
  }),

  toggleShoppingItem: action(async function (this: typeof planStore, item_id: import('../types/api').Int64Like, checked: boolean) {
    if (!this.shoppingList) return;
    const res = await kitchenApi.patchShoppingItem({ list_id: this.shoppingList.id, item_id, checked });
    const idx = this.shoppingItems.findIndex((it) => String(it.id) === String(item_id));
    if (idx >= 0) {
      this.shoppingItems[idx] = res.item;
      this.shoppingItems = [...this.shoppingItems];
    }
  }),
});
