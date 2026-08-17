// ============================================================================
// Xiao 2.0 · 核心层 · 命令面板（Cmd+K / Ctrl+K）
// 职责：
//   1. register(item) 注册命令 { id, title, icon, keywords, action, group }
//   2. open()/close()/toggle() 控制面板显隐（基于 X.ui.modal）
//   3. 输入框 + 实时搜索（按 title/keywords 模糊匹配）
//   4. 方向键选择 + 回车执行 + ESC 关闭
//   5. 全局快捷键 Ctrl/Cmd+K 切换
//   6. 内置命令：跳转首页/聊天/作品/编辑器/社交/个人中心/管理员/切换主题/切换语言
// ============================================================================
(function (X) {
  const cmdk = {
    /** 已注册命令列表 */
    items: [],
    /** 当前 modal 实例 */
    _inst: null,
    /** 当前选中索引 */
    _activeIdx: 0,
    /** 当前搜索结果 */
    _results: [],
    /** DOM 引用 */
    _inputEl: null,
    _listEl: null,
    /** 内置命令是否已注册 */
    _builtinsRegistered: false,

    /**
     * 注册命令
     * @param {Object} item { id, title, icon, keywords, action, group }
     */
    register(item) {
      if (!item || !item.id) return;
      // 同 id 替换
      const i = this.items.findIndex(x => x.id === item.id);
      if (i >= 0) this.items[i] = item;
      else this.items.push(item);
    },

    /**
     * 搜索命令：按 title/keywords 模糊匹配（大小写不敏感）
     * @param {string} q 查询字符串
     * @returns {Array} 匹配的命令列表
     */
    search(q) {
      q = String(q || '').trim().toLowerCase();
      if (!q) return this.items.slice();
      return this.items.filter(it => {
        const title = String(it.title || '').toLowerCase();
        const kw = Array.isArray(it.keywords)
          ? it.keywords.join(' ')
          : String(it.keywords || '');
        return title.indexOf(q) >= 0 || kw.toLowerCase().indexOf(q) >= 0;
      });
    },

    /** 打开面板 */
    open() {
      if (this._inst) return;
      // 懒注册内置命令（首次打开时执行，确保其他模块已加载）
      if (!this._builtinsRegistered) {
        this._registerBuiltin();
        this._builtinsRegistered = true;
      }
      this._activeIdx = 0;
      this._results = this.search('');

      const self = this;
      const inst = X.ui.modal({
        title: '命令面板',
        body: (bodyEl) => self._renderBody(bodyEl),
        onClose: () => { this._inst = null; this._inputEl = null; this._listEl = null; }
      });
      this._inst = inst;
      // 聚焦输入框 + 首次渲染结果
      setTimeout(() => {
        if (this._inputEl) this._inputEl.focus();
        this._renderResults();
      }, 240);
    },

    /** 关闭面板 */
    close() {
      if (this._inst) {
        this._inst.close();
        this._inst = null;
      }
    },

    /** 切换面板显隐 */
    toggle() {
      if (this._inst) this.close();
      else this.open();
    },

    /** 渲染面板主体：搜索框 + 结果列表 */
    _renderBody(bodyEl) {
      bodyEl.innerHTML =
        '<div class="cmdk">'
          + '<input class="input cmdk-input" type="text" '
            + 'placeholder="输入命令名或关键词…" autocomplete="off" />'
          + '<div class="cmdk-list" role="listbox"></div>'
        + '</div>';
      const input = X.utils.$('.cmdk-input', bodyEl);
      const list = X.utils.$('.cmdk-list', bodyEl);
      this._inputEl = input;
      this._listEl = list;

      // 输入实时搜索（防抖 80ms）
      input.addEventListener('input', X.utils.debounce(() => {
        this._results = this.search(input.value);
        this._activeIdx = 0;
        this._renderResults();
      }, 80));

      // 键盘导航：方向键选择 / 回车执行 / ESC 关闭
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this._move(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this._move(-1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          this._runActive();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.close();
        }
      });
    },

    /** 渲染搜索结果列表 */
    _renderResults() {
      const list = this._listEl;
      if (!list) return;
      const items = this._results;
      if (!items.length) {
        list.innerHTML = '<div class="cmdk-empty">无匹配命令</div>';
        return;
      }
      list.innerHTML = '';
      items.forEach((it, idx) => {
        const row = document.createElement('div');
        row.className = 'cmdk-item' + (idx === this._activeIdx ? ' active' : '');
        row.setAttribute('role', 'option');
        const icon = X.utils.escape(it.icon || '·');
        const title = X.utils.escape(it.title || it.id);
        const group = it.group
          ? '<span class="cmdk-group">' + X.utils.escape(it.group) + '</span>'
          : '';
        row.innerHTML =
          '<span class="cmdk-icon">' + icon + '</span>'
          + '<span class="cmdk-title">' + title + '</span>'
          + group;
        // 鼠标悬停切换选中
        row.addEventListener('mouseenter', () => {
          this._activeIdx = idx;
          this._renderResults();
        });
        // 点击执行
        row.addEventListener('click', () => {
          this._activeIdx = idx;
          this._runActive();
        });
        list.appendChild(row);
      });
      // 选中项滚动到可见区域
      const active = X.utils.$('.cmdk-item.active', list);
      if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
    },

    /** 移动选中索引（循环） */
    _move(delta) {
      if (!this._results.length) return;
      let i = this._activeIdx + delta;
      if (i < 0) i = this._results.length - 1;
      if (i >= this._results.length) i = 0;
      this._activeIdx = i;
      this._renderResults();
    },

    /** 执行当前选中命令并关闭面板 */
    _runActive() {
      const it = this._results[this._activeIdx];
      if (!it) return;
      this.close();
      try {
        if (typeof it.action === 'function') it.action();
      } catch (e) {
        console.warn('[Xiao] cmdk action error:', e);
      }
    },

    /** 注册内置命令（跳转 + 设置） */
    _registerBuiltin() {
      const nav = (name) => () => {
        if (X.router && X.router.go) X.router.go(name);
      };
      // 跳转命令
      this.register({ id: 'go:home',    title: '跳转首页',     icon: '🏠', group: '导航', keywords: ['home', '首页', 'shouye'], action: nav('home') });
      this.register({ id: 'go:chat',    title: '跳转聊天',     icon: '💬', group: '导航', keywords: ['chat', '聊天', 'liaotian'], action: nav('chat') });
      this.register({ id: 'go:works',   title: '跳转作品',     icon: '📦', group: '导航', keywords: ['works', '作品', 'zuopin'], action: nav('works') });
      this.register({ id: 'go:editor',  title: '跳转编辑器',   icon: '⚡', group: '导航', keywords: ['editor', '编辑器', 'bianjiqi'], action: nav('editor') });
      this.register({ id: 'go:social',  title: '跳转社交',     icon: '👥', group: '导航', keywords: ['social', '社交', 'shejiao'], action: nav('social') });
      this.register({ id: 'go:profile', title: '跳转个人中心', icon: '👤', group: '导航', keywords: ['profile', '个人', 'geren'], action: nav('profile') });
      this.register({ id: 'go:admin',   title: '跳转管理员',   icon: '🛡️', group: '导航', keywords: ['admin', '管理员', 'guanli'], action: nav('admin') });

      // 切换主题
      this.register({
        id: 'theme:cycle',
        title: '切换主题',
        icon: '🎨',
        group: '设置',
        keywords: ['theme', '主题', '切换', 'dark', 'light', 'cyber'],
        action: () => {
          if (X.theme && X.theme.cycle) {
            const next = X.theme.cycle();
            if (X.ui && X.ui.toast) X.ui.toast('主题已切换为：' + next, 'info', 1600);
          }
        }
      });

      // 切换语言（zh-CN / en / ru 循环）
      this.register({
        id: 'lang:cycle',
        title: '切换语言',
        icon: '🌐',
        group: '设置',
        keywords: ['lang', '语言', 'language', 'zh', 'en', 'ru'],
        action: () => {
          if (X.i18n && X.i18n.engine) {
            const cur = X.i18n.engine.getLang();
            const langs = ['zh-CN', 'en', 'ru'];
            const i = langs.indexOf(cur);
            const next = langs[(i + 1) % langs.length];
            X.i18n.engine.setLang(next);
            if (X.ui && X.ui.refresh) X.ui.refresh();
            if (X.ui && X.ui.toast) X.ui.toast('语言已切换', 'info', 1600);
          }
        }
      });

      // 4to3 智能自然光照渲染引擎开关
      this.register({
        id: 'render:4to3',
        title: '4to3 自然光照渲染开关',
        icon: '✨',
        group: '渲染',
        keywords: ['4to3', 'render', '渲染', '光照', 'light', '玻璃', 'glass'],
        action: () => {
          if (X.render4to3 && X.render4to3.toggle) {
            X.render4to3.toggle();
            // 触发 app.js 的按钮状态刷新（通过自定义事件）
            document.dispatchEvent(new CustomEvent('xiao:render4to3'));
            if (X.ui && X.ui.toast) X.ui.toast('4to3 渲染已' + (X.render4to3.state.enabled ? '开启' : '关闭'), 'info', 1600);
          }
        }
      });

      // 4to3 演示页（原 4to3.html）
      this.register({
        id: 'go:4to3demo',
        title: '4to3 渲染引擎演示页',
        icon: '🎬',
        group: '渲染',
        keywords: ['4to3', 'demo', '演示', 'demo'],
        action: () => { window.open('demo-4to3.html', '_blank'); }
      });
    }
  };

  // 绑定全局快捷键 Ctrl/Cmd+K → toggle（模块加载即生效）
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      cmdk.toggle();
    }
  });

  X.cmdk = cmdk;
})(window.Xiao = window.Xiao || {});
