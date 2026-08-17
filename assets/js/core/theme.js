// ============================================================================
// Xiao 2.0 · 核心层 · 主题切换
// 职责：
//   1. 三主题：dark(默认) / light / cyber
//   2. 通过 document.documentElement.dataset.theme 切换
//   3. localStorage 'xiao.theme' 持久化
//   4. set() 触发 'xiao:theme' CustomEvent，业务层可监听联动
// ============================================================================
(function (X) {
  // 可选主题列表（顺序决定 cycle 轮换方向）
  const THEMES = [
    { name: 'dark',  label: '深色',  icon: '🌙' },
    { name: 'light', label: '浅色',  icon: '☀️' },
    { name: 'cyber', label: '赛博',  icon: '🛸' }
  ];

  const theme = {
    /** 当前主题名 */
    current: 'dark',

    /** 初始化：读 localStorage，默认 dark，应用至 DOM */
    init() {
      let saved = null;
      try { saved = localStorage.getItem('xiao.theme'); } catch (_) {}
      if (saved && THEMES.some(t => t.name === saved)) {
        this.current = saved;
      } else {
        this.current = 'dark';
      }
      this.apply();
    },

    /** 应用当前主题到 document.documentElement.dataset.theme */
    apply() {
      document.documentElement.dataset.theme = this.current;
    },

    /**
     * 切换主题
     * @param {string} name 主题名（dark/light/cyber）
     */
    set(name) {
      if (!THEMES.some(t => t.name === name)) {
        console.warn('[Xiao] 未知主题：', name);
        return;
      }
      this.current = name;
      try { localStorage.setItem('xiao.theme', name); } catch (_) {}
      this.apply();
      // 派发事件，业务层可监听：document.addEventListener('xiao:theme', e => e.detail)
      document.dispatchEvent(new CustomEvent('xiao:theme', { detail: name }));
    },

    /** 在三主题间循环切换，返回切换后的主题名 */
    cycle() {
      const idx = THEMES.findIndex(t => t.name === this.current);
      const next = THEMES[(idx + 1) % THEMES.length];
      this.set(next.name);
      return next.name;
    },

    /**
     * 返回所有主题元信息（用于设置面板渲染选项）
     * @returns {Array<{name:string,label:string,icon:string}>}
     */
    list() {
      return THEMES.map(t => ({ name: t.name, label: t.label, icon: t.icon }));
    }
  };

  X.theme = theme;
})(window.Xiao = window.Xiao || {});
