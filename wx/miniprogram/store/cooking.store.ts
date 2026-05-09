// 烹饪进度 store：本地维护当前正在做的菜谱步骤、计时器，定时同步到后端。
// 与 services/cooking.api.ts 的 ActiveCooking 相互对齐。
import { observable, action } from 'mobx-miniprogram';
import { cookingApi, UpsertActiveCookingReq } from '../services/cooking.api';
import type { ActiveCooking, Int64Like } from '../types/api';

export const cookingStore = observable({
  activeMap: {} as Record<string, ActiveCooking>,

  loadActive: action(async function (this: typeof cookingStore) {
    const res = await cookingApi.listActive();
    const next: Record<string, ActiveCooking> = {};
    (res.items || []).forEach((it) => {
      next[String(it.recipe_id)] = it;
    });
    this.activeMap = next;
  }),

  upsert: action(async function (this: typeof cookingStore, req: UpsertActiveCookingReq) {
    const res = await cookingApi.upsertActive(req);
    this.activeMap[String(req.recipe_id)] = res.item;
    return res.item;
  }),

  finish: action(async function (this: typeof cookingStore, recipe_id: Int64Like) {
    await cookingApi.deleteActive(recipe_id);
    delete this.activeMap[String(recipe_id)];
  }),
});
