// 库存 store
import { observable, action } from 'mobx-miniprogram';
import { kitchenApi, UpsertInventoryItem } from '../services/kitchen.api';
import type { InventoryItem, InventoryRecommendation } from '../types/api';

export const inventoryStore = observable({
  items: [] as InventoryItem[],
  recommendations: [] as InventoryRecommendation[],

  load: action(async function (this: typeof inventoryStore, keyword?: string) {
    const res = await kitchenApi.listInventory(keyword);
    this.items = res.items || [];
  }),

  upsert: action(async function (this: typeof inventoryStore, items: UpsertInventoryItem[]) {
    const res = await kitchenApi.upsertInventory(items);
    this.items = res.items || [];
  }),

  loadRecommendations: action(async function (this: typeof inventoryStore, limit = 10) {
    const res = await kitchenApi.inventoryRecommendations(limit);
    this.recommendations = res.items || [];
  }),
});
