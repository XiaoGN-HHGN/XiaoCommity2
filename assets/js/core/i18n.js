// ============================================================================
// Xiao 2.0 · 核心层 · i18n 国际化引擎
// 三语言：中文 / 英文 / 俄语
// 用法：X.t('key.path')，找不到时回退 key 自身
// ============================================================================
(function (X) {
  const langs = ['zh-CN', 'en', 'ru'];
  let current = 'zh-CN';
  let dict = {};

  const engine = {
    /** 初始化：从 localStorage 读偏好，加载默认词典 */
    init() {
      try {
        const saved = localStorage.getItem('xiao.lang');
        if (saved && langs.indexOf(saved) >= 0) current = saved;
      } catch (_) {}
      if (X.i18n && X.i18n.zhCN) dict = X.i18n.zhCN;
      this._applyHtmlLang();
    },
    getLang() { return current; },
    setLang(l) {
      if (langs.indexOf(l) < 0) return;
      current = l;
      try { localStorage.setItem('xiao.lang', l); } catch (_) {}
      dict = (X.i18n && (X.i18n[l.replace('-', '')] || X.i18n[l])) || dict;
      this._applyHtmlLang();
    },
    _applyHtmlLang() {
      const m = { 'zh-CN': 'zh-CN', 'en': 'en', 'ru': 'ru' };
      document.documentElement.lang = m[current] || 'en';
      // 高亮语言切换按钮
      X.utils.$$('.lang-switch button').forEach(b => {
        b.classList.toggle('active', b.dataset.lang === current);
      });
    },
    /** 翻译：支持 'a.b.c' 形式 */
    t(key, vars) {
      if (!key) return '';
      const parts = String(key).split('.');
      let cur = dict;
      for (const p of parts) {
        if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
        else return key;  // 找不到回退到 key 自身
      }
      let s = typeof cur === 'string' ? cur : key;
      // 简单插值：{name} 替换
      if (vars) for (const k in vars) s = s.replace('{' + k + '}', String(vars[k]));
      return s;
    }
  };
  X.i18n = X.i18n || {};
  X.i18n.engine = engine;
  X.t = (k, v) => engine.t(k, v);
})(window.Xiao = window.Xiao || {});
