// Store 统一导出
// 在 Page/Component 中使用：
//   import { createStoreBindings } from 'mobx-miniprogram-bindings';
//   import { authStore } from '@/store';
//   onLoad() { this.storeBindings = createStoreBindings(this, { store: authStore, fields: ['user', 'currentHousehold'] }); }
//   onUnload() { this.storeBindings.destroyStoreBindings(); }

export { authStore } from './auth.store';
export { householdStore } from './household.store';
export { cookingStore } from './cooking.store';
export { chatStore } from './chat.store';
export { planStore } from './plan.store';
export { inventoryStore } from './inventory.store';
