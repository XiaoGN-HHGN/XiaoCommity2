// ============================================================================
// Xiao 2.1 · 应用入口
// 启动顺序：
//   1. i18n 引擎初始化（默认中文）
//   2. 主题初始化（dark / light / cyber，localStorage 持久化）
//   3. 恢复 Supabase 会话（异步，登录后启动 Presence）
//   4. 渲染导航 + 用户胶囊
//   5. 注册所有 modules（modules/* 自动 register 到 router）
//   6. router.init() 启动 hashchange 监听
//   7. 全局事件：语言切换 / 主题切换 / 命令面板 / 联系我们
// ============================================================================

(function (X) {
  async function boot() {
    // 1) i18n
    X.i18n.engine.init();

    // 2) 主题初始化（必须在渲染前应用，避免闪烁）
    if (X.theme && X.theme.init) X.theme.init();
    refreshThemeButtons();

    // 2.5) 4to3 渲染引擎初始化（背景层，跟随主题色板）
    if (X.render4to3 && X.render4to3.init) X.render4to3.init();
    refreshRenderBtn();

    // 3) 恢复登录会话（异步，后台执行；登录成功后启动 Presence）
    X.auth.restoreSession().then(() => {
      X.ui.refresh();
      // 已登录 → 上线 Presence
      const cur = X.auth.currentUser();
      if (cur && X.presence && X.presence.init) {
        X.presence.init();
        X.presence.track(cur);
      }
    }).catch(e => {
      console.debug('[Xiao] restoreSession fail:', e && e.message);
    });

    // 4) 渲染导航 + 用户胶囊（首次）
    X.ui.refresh();

    // 5) modules 已在加载时各自 register 到 router
    //    这里不需要再显式注册

    // 6) 启动路由
    X.router.init();

    // 7) 全局事件：语言切换
    X.utils.$$('.lang-switch button').forEach(b => {
      b.addEventListener('click', () => {
        X.i18n.engine.setLang(b.dataset.lang);
        // 重新渲染当前视图
        const cur = X.router.current;
        if (cur) X.router.render(cur.name, cur.params);
        X.ui.refresh();
      });
    });

    // 8) 全局事件：主题切换
    X.utils.$$('#themeSwitch button').forEach(b => {
      b.addEventListener('click', () => {
        if (X.theme && X.theme.set) {
          X.theme.set(b.dataset.theme);
          refreshThemeButtons();
          // 同步 4to3 色板
          if (X.render4to3 && X.render4to3.syncTheme) X.render4to3.syncTheme(b.dataset.theme);
          X.ui.toast('主题已切换', 'info', 1600);
        }
      });
    });

    // 8.5) 全局事件：4to3 渲染开关
    const renderBtn = X.utils.$('#render4to3Btn');
    if (renderBtn) renderBtn.addEventListener('click', () => {
      if (X.render4to3 && X.render4to3.toggle) {
        X.render4to3.toggle();
        refreshRenderBtn();
      }
    });
    // 命令面板触发 4to3 切换时，同步按钮状态
    document.addEventListener('xiao:render4to3', refreshRenderBtn);

    // 9) 全局事件：命令面板按钮（⌘）
    const cmdkBtn = X.utils.$('#cmdkBtn');
    if (cmdkBtn) cmdkBtn.addEventListener('click', () => {
      if (X.cmdk && X.cmdk.toggle) X.cmdk.toggle();
    });

    // 10) 全局事件：联系我们按钮
    const contactBtn = X.utils.$('#contactBtn');
    if (contactBtn) contactBtn.addEventListener('click', () => X.modules.misc.contact());

    // 11) Supabase 未配置的提示
    if (!X.supabaseReady) {
      X.ui.toast('⚠ Supabase 未配置，请到 assets/js/core/config.js 填写密钥', 'err', 8000);
    }

    console.log('[Xiao] 2.1 启动完成');
  }

  /** 根据当前主题刷新顶部按钮高亮状态 */
  function refreshThemeButtons() {
    if (!X.theme) return;
    const cur = X.theme.current;
    X.utils.$$('#themeSwitch button').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === cur);
    });
  }

  /** 刷新 4to3 渲染按钮的高亮状态 */
  function refreshRenderBtn() {
    if (!X.render4to3) return;
    const btn = X.utils.$('#render4to3Btn');
    if (btn) btn.classList.toggle('active', X.render4to3.state.enabled);
  }

  // DOMContentLoaded 后启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.Xiao = window.Xiao || {});
