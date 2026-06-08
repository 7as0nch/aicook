// Mode 切换 chip：深度思考 / 联网搜索 / 图文识别
Component({
  properties: {
    icon: { type: String, value: '' },
    dotColor: { type: String, value: '#FF7A00' },
    label: { type: String, value: '' },
    active: { type: Boolean, value: false },
  },
  methods: {
    onTap() {
      this.triggerEvent('tap');
    },
  },
});
