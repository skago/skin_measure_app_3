App({
  onLaunch(opts) {
    console.log('App: onLaunch', opts);
    try {
      console.log('App launched successfully');
      console.log('Launch options:', JSON.stringify(opts));
    } catch (e) {
      console.error('App onLaunch error:', e);
    }
  },
  onShow(opts) {
    console.log('App: onShow', opts);
  },
  onError(err) {
    console.error('App error:', err);
  },
  globalData: {}
})