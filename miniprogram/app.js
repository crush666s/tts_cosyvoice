const { API_BASE } = require('./config');

App({
  globalData: {
    apiBase: API_BASE,
    status: null
  },

  onLaunch() {
    // 不需要登录、不需要云开发，启动时什么都不做。
  }
});
