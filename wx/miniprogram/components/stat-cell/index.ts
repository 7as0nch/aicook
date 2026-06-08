// 数据格：大数字 + 标签，用于"我的"页 28/12/36
Component({
  properties: {
    value: { type: String, value: '0' },
    label: { type: String, value: '' },
  },
  methods: {
    onTap() {
      this.triggerEvent('tap');
    },
  },
});
