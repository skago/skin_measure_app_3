App({
  onLaunch(opts) {
    this.globalData = {};
  },
  onShow() {},
  onError(err) {
    console.error('App error:', err);
  },
  globalData: {}
});