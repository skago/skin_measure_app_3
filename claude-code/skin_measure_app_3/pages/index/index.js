console.log('index page loading');
Page({
  onLoad(opts) {
    console.log('index: onLoad', opts);
  },
  onShow() {
    console.log('index: onShow');
  },
  goMeasure() {
    console.log('goMeasure clicked');
    wx.navigateTo({ url: '/pages/measure/measure' });
  },
  goHistory() {
    console.log('goHistory clicked');
    wx.navigateTo({ url: '/pages/history/history' });
  }
});