// 计划页三餐卡：早/午/晚 - 标题 + 菜数 + 菜品行列表 + 千卡 pill
interface DishItem {
  id?: string | number;
  title?: string;
  cover_image_url?: string;
  category?: string;
  total_minutes?: number;
  calories?: number; // 单位 千卡
}

Component({
  properties: {
    // 'breakfast' | 'lunch' | 'dinner'
    type: { type: String, value: 'breakfast' },
    title: { type: String, value: '' },
    time: { type: String, value: '' },
    dishes: {
      type: Array,
      value: [] as DishItem[],
    },
  },
  data: {
    typeEmojiMap: {
      breakfast: '🍳',
      lunch: '🍲',
      dinner: '🥘',
    } as Record<string, string>,
    typeTitleMap: {
      breakfast: '早餐',
      lunch: '午餐',
      dinner: '晚餐',
    } as Record<string, string>,
  },
  methods: {
    onAdd() {
      this.triggerEvent('add', { type: this.data.type });
    },
    onDishTap(e: WechatMiniprogram.BaseEvent) {
      const data = (e.currentTarget as unknown as { dataset: { index: string } }).dataset;
      const index = Number(data.index);
      const dish = (this.data.dishes as DishItem[])[index];
      this.triggerEvent('dishtap', { dish });
    },
  },
});
