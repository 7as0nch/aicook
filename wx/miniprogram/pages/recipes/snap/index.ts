// 拍照识别页（中间浮按目标）
// 设计稿：相机预览大屏 + 识别中提示 + 识别结果 chips + 生成推荐 CTA
// 阶段 0：UI 骨架；阶段 8 接入相机 + ImportService.CreateImageRecipe + 轮询
interface IngredChip { id: string; name: string; }

Page({
  data: {
    captured: false,                // 是否已拍照
    recognizing: false,             // 是否识别中
    chips: [] as IngredChip[],      // 识别结果
    flashOn: false,
  },

  onCaptureTap() {
    // 阶段 8：调用 wx.chooseMedia / camera 组件
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      success: () => {
        this.setData({ captured: true, recognizing: true });
        // 模拟识别延迟
        setTimeout(() => {
          this.setData({
            recognizing: false,
            chips: [
              { id: '1', name: '番茄' },
              { id: '2', name: '鸡蛋' },
              { id: '3', name: '土豆' },
              { id: '4', name: '牛腩' },
              { id: '5', name: '青菜' },
              { id: '6', name: '玉米' },
              { id: '7', name: '五花肉' },
              { id: '8', name: '小葱' },
            ],
          });
        }, 1500);
      },
      fail: () => {
        // 用户取消
      },
    });
  },

  onFlashToggle() {
    this.setData({ flashOn: !this.data.flashOn });
  },

  onGenerateTap() {
    if (!this.data.chips.length) {
      wx.showToast({ title: '请先识别食材', icon: 'none' });
      return;
    }
    wx.showToast({ title: '阶段 8 接入推荐生成', icon: 'none' });
  },

  onBack() {
    wx.navigateBack({ delta: 1 }).catch(() => {
      wx.switchTab({ url: '/pages/home/index/index' });
    });
  },
});
