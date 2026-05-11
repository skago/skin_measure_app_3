Page({
  onLoad(opts) {},
  onShow() {},
  goMeasure() {
    wx.navigateTo({ url: '/pages/measure/measure' });
  },
  goHistory() {
    wx.navigateTo({ url: '/pages/history/history' });
  }
});