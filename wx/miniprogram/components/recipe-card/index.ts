// 菜谱卡片 - 四种 variant：hero（首页今日推荐大卡） / grid（首页双列） / row（计划三餐里的菜品行） / numbered（今日推荐排行）
Component({
  properties: {
    variant: {
      type: String,
      value: 'grid', // 'hero' | 'grid' | 'row' | 'numbered'
    },
    recipe: {
      type: Object,
      value: {} as {
        id?: string | number;
        title?: string;
        cover_image_url?: string;
        category?: string;
        total_minutes?: number;
        scenario_tags?: string[];
        flavor_tags?: string[];
        difficulty?: number;
        favored?: boolean;
        servings?: number;
      },
    },
    // numbered 变体下的序号 1-N
    rank: { type: Number, value: 0 },
    // 匹配度（0-100），可空
    matchPercent: { type: Number, value: 0 },
    // 是否显示右上角心形收藏
    showHeart: { type: Boolean, value: false },
    // hero 卡的副标题（如 "今日推荐"）
    label: { type: String, value: '' },
    // hero 卡的 CTA 文本
    ctaText: { type: String, value: '去查看' },
  },
  methods: {
    onTap() {
      const recipe = this.data.recipe as { id?: string | number } | null;
      if (!recipe || !recipe.id) return;
      this.triggerEvent('tap', { recipe });
    },
    onHeartTap(e: WechatMiniprogram.BaseEvent) {
      // 阻止冒泡到 onTap
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      e;
      const recipe = this.data.recipe as { id?: string | number } | null;
      if (!recipe || !recipe.id) return;
      this.triggerEvent('favorite', { recipe });
    },
  },
});
