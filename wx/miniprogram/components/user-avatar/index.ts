// 通用用户头像：
//   - 有 url 且能加载 → 显示图片
//   - url 为空、或加载失败（如真机 http 图片不被渲染）→ 回退到「昵称首字 + 渐变底」
// 解决：微信回收 getUserProfile 后新用户 avatar_url 为空、以及 http 存储真机不显示导致的空白圈
Component({
  options: { addGlobalClass: true },
  properties: {
    url: { type: String, value: '' },
    name: { type: String, value: '' },
    size: { type: String, value: '72rpx' },
  },
  data: {
    failed: false,
    initial: '',
  },
  observers: {
    url() {
      // 换了新地址重新尝试加载
      if (this.data.failed) this.setData({ failed: false });
    },
    name(v: string) {
      const s = (v || '').trim();
      this.setData({ initial: s ? s.slice(0, 1).toUpperCase() : '👤' });
    },
  },
  methods: {
    onError() {
      this.setData({ failed: true });
    },
  },
});
