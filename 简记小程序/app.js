// app.js
const store = require('./utils/store.js')

App({
  globalData: {
    needRefresh: false
  },

  onLaunch() {
    // 首次启动时初始化数据结构
    store.initIfEmpty()

    // 记录打开次数，用于「我的」页展示
    const meta = store.getMeta()
    meta.openCount = (meta.openCount || 0) + 1
    meta.lastOpen = Date.now()
    store.saveMeta(meta)

    this.syncNavBar()
  },

  onShow() {
    // 从后台回到前台时，把主题色重新同步到原生导航栏
    this.syncNavBar()
  },

  /**
   * 把当前主题色同步到原生导航栏。
   * 微信原生导航栏不认 CSS 变量，只能在每次进入页面时用 API 设色；
   * 漏掉这一步，用户切了主题会是「页面变了、顶部还是旧色」——比不换色更像 bug。
   */
  syncNavBar() {
    if (typeof wx === 'undefined' || !wx.setNavigationBarColor) return
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: store.themeColor(),
      fail() {}
    })
  }
})
