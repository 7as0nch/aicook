// 周计划 + 购物清单 store
import { observable, action } from 'mobx-miniprogram';
import { kitchenApi } from '../services/kitchen.api';
import type { MealPlanWeek, ShoppingList, ShoppingListItem } from '../types/api';

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
