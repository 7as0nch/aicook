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
      // 事件名不能叫 'tap'：原生 tap 会冒泡穿过组件边界，父级 bind:tap 会同时收到
      // 原生事件 + 自定义事件各一次，toggle 两次等于没切换。改用自定义名 'toggle'。
      this.triggerEvent('toggle');
    },
  },
});
