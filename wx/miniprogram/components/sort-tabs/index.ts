// 排序 tab：横向 pill，选中态背景橙色
interface TabItem { key: string; label: string; }
Component({
  properties: {
    tabs: {
      type: Array,
      value: [] as TabItem[],
    },
    value: { type: String, value: '' },
  },
  methods: {
    onTap(e: WechatMiniprogram.BaseEvent) {
      const data = (e.currentTarget as unknown as { dataset: { key: string } }).dataset;
      this.triggerEvent('change', { value: data.key });
    },
  },
});
