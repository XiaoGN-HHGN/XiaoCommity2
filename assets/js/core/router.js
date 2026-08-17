// ============================================================================
// Xiao 2.0 · 核心层 · hash 路由
// 职责：
//   1. 注册路由（render + afterRender + onLeave + requiresAuth + requiresAdmin）
//   2. hashchange 监听 → 渲染对应 view
//   3. 切换路由前调用上一路由 onLeave，清理 Realtime 订阅/定时器
//   4. 支持 await afterRender（异步绑定 + Realtime 订阅）
// ============================================================================
(function (X) {
  const router = {
    routes: {},
    current: null,

    /** 注册路由 */
    register(name, cfg) {
      this.routes[name] = cfg;
    },

    /** 跳转 */
    go(name, params) {
      const hash = '#/' + name + (params && Object.keys(params).length
        ? '?' + new URLSearchParams(params).toString()
        : '');
      if (location.hash === hash) {
        this.render(name, params);
      } else {
        location.hash = hash;
      }
    },

    /** 初始化：监听 hashchange */
    init() {
      window.addEventListener('hashchange', () => this._onHash());
      this._onHash();
    },

    async _onHash() {
      const hash = location.hash || '#/home';
      const [path, query] = hash.slice(2).split('?');
      const name = path || 'home';
      const params = query ? Object.fromEntries(new URLSearchParams(query)) : {};
      await this.render(name, params);
    },

    /** 渲染路由 */
    async render(name, params) {
      name = name || 'home';
      const cfg = this.routes[name];
      const view = X.utils.$('#view');
      if (!cfg || !view) {
        if (view) view.innerHTML = '<div class="dim center" style="padding:40px">404 · ' + X.utils.escape(name) + '</div>';
        this.current = { name, params };
        return;
      }

      // 鉴权
      if (cfg.requiresAuth && !X.auth.requireLogin()) return;
      if (cfg.requiresAdmin && !X.auth.requireAdmin()) return;

      // 调用上一路由的 onLeave（清理 Realtime 订阅/定时器）
      if (this.current && this.current.name !== name) {
        const prev = this.routes[this.current.name];
        if (prev && typeof prev.onLeave === 'function') {
          try { await prev.onLeave(this.current.params, view); }
          catch (e) { console.warn('[Xiao] route onLeave error:', this.current.name, e); }
        }
      }

      // 渲染新路由
      view.classList.add('loading');
      try {
        view.innerHTML = '';
        const html = typeof cfg.render === 'function' ? cfg.render(params) : '';
        if (typeof html === 'string') view.innerHTML = html;
        else if (html instanceof Node) view.appendChild(html);
        view.classList.remove('loading');
        // afterRender 支持 await（异步数据加载 + Realtime 订阅）
        if (typeof cfg.afterRender === 'function') {
          await cfg.afterRender(params, view);
        }
      } catch (e) {
        console.error('[Xiao] route render error:', name, e);
        view.classList.remove('loading');
        view.innerHTML = '<div class="dim center" style="padding:40px;color:var(--danger)">渲染失败：' + X.utils.escape(e.message || '') + '</div>';
      }

      this.current = { name, params };
      // 高亮导航
      X.utils.$$('.nav-item').forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === '#/' + name);
      });
    }
  };

  X.router = router;
})(window.Xiao = window.Xiao || {});
