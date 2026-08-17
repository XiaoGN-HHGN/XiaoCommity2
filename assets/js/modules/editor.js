// ============================================================================
// Xiao 2.0 · 在线代码编辑器模块（v2 升级）
// 功能：
//   1. JS / HTML / CSS / Python 四语言切换 + 运行
//      （JS 用 new Function + 截获 console / HTML iframe / CSS 套预览 / Python 提示需后端）
//   2. 代码语法高亮（自实现，textarea 叠加 pre，不依赖外部库）
//   3. 多文件标签（内存中维护 files 数组，默认 main.js/html/css/py）
//   4. 云端保存（X.store.saveSnippet）+ 我的 / 公开片段列表
//   5. 分享链接（公开片段 URL，复制到剪贴板）
//   6. URL 参数 ?snippet=<id> 加载云端片段
//   7. 协同创作（Realtime broadcast，频道内广播代码）
// ============================================================================
(function (X) {
  // 各语言默认示例
  const SNIPPETS = {
    js: `// JavaScript 在线运行\ndocument.getElementById('out').innerHTML = '<h2>Hello Xiao</h2>';\nfor (let i = 0; i < 5; i++) console.log('i =', i);`,
    html: `<!DOCTYPE html>\n<html>\n<body>\n  <h2>Hello Xiao</h2>\n  <p>这是 HTML 预览</p>\n</body>\n</html>`,
    css: `body { font-family: sans-serif; }\n.box { padding: 16px; background: #eef; border-radius: 8px; }`,
    python: `# Python 在线执行需后端环境，目前仅本地预览\nprint('Hello Xiao')\nfor i in range(5):\n    print(i)`
  };

  // 各语言文件扩展名（用于新建 / 重命名）
  const EXT = { js: 'js', html: 'html', css: 'css', python: 'py' };

  // ============================================================
  // 语法高亮规则：每条 = { re: 正则源, cls: token class }
  // 注意：re 内部用非捕获组 (?:...)，外层会被包一个捕获组
  // ============================================================
  const HL_RULES = {
    // JS：注释 + 字符串 + 数字 + 关键字
    js: [
      { re: '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/', cls: 'tok-cmt' },
      { re: '"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'|`(?:\\\\.|[^`\\\\])*`', cls: 'tok-str' },
      { re: '\\b\\d+(?:\\.\\d+)?\\b', cls: 'tok-num' },
      { re: '\\b(?:var|let|const|function|if|else|for|while|return|class|new|async|await|import|export|from|of|in|typeof|instanceof|break|continue|switch|case|default|try|catch|finally|throw|do|void|delete|this|super|extends|static|yield)\\b', cls: 'tok-kw' }
    ],
    // Python：注释 + 字符串 + 数字 + 关键字
    python: [
      { re: '#[^\\n]*', cls: 'tok-cmt' },
      { re: '"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'', cls: 'tok-str' },
      { re: '\\b\\d+(?:\\.\\d+)?\\b', cls: 'tok-num' },
      { re: '\\b(?:def|class|if|elif|else|for|while|return|import|from|as|print|in|not|and|or|is|None|True|False|lambda|with|try|except|finally|raise|pass|break|continue|global|yield|del|assert|async|await|nonlocal)\\b', cls: 'tok-kw' }
    ],
    // HTML：注释 + 字符串 + 标签名 + 属性名
    html: [
      { re: '<!--[\\s\\S]*?-->', cls: 'tok-cmt' },
      { re: '"(?:[^"]*)"|\'(?:[^\']*)\'', cls: 'tok-str' },
      { re: '<\\/?[\\w-]+', cls: 'tok-kw' },
      { re: '\\s[\\w-]+(?=\\s*=)', cls: 'tok-num' }
    ],
    // CSS：注释 + 字符串 + at-rule + 选择器 + 属性 + 值
    css: [
      { re: '\\/\\*[\\s\\S]*?\\*\\/', cls: 'tok-cmt' },
      { re: '"(?:[^"]*)"|\'(?:[^\']*)\'', cls: 'tok-str' },
      { re: '@[\\w-]+', cls: 'tok-kw' },
      { re: '[^{};]+(?=\\s*\\{)', cls: 'tok-kw' },
      { re: '\\b(?:color|background|background-color|background-image|background-size|background-position|border|border-radius|border-color|border-style|border-width|margin|margin-top|margin-right|margin-bottom|margin-left|padding|padding-top|padding-right|padding-bottom|padding-left|width|min-width|max-width|height|min-height|max-height|display|position|top|left|right|bottom|float|clear|font|font-family|font-size|font-weight|font-style|line-height|text-align|text-decoration|text-transform|letter-spacing|word-spacing|white-space|opacity|z-index|overflow|overflow-x|overflow-y|cursor|visibility|outline|transition|transform|animation|box-shadow|text-shadow|flex|flex-direction|flex-wrap|flex-grow|flex-shrink|flex-basis|grid|grid-template|grid-template-columns|grid-template-rows|gap|align-items|align-self|justify-content|justify-self|content|list-style|table-layout|border-collapse|vertical-align)\\b(?=\\s*:)', cls: 'tok-num' },
      { re: ':[^;{}]+', cls: 'tok-str' }
    ]
  };

  // 预编译合并正则（每个语言一条，全局 + 多行）
  const HL_COMPILED = {};
  Object.keys(HL_RULES).forEach(lang => {
    const rules = HL_RULES[lang];
    const combined = new RegExp(rules.map(r => '(' + r.re + ')').join('|'), 'gm');
    HL_COMPILED[lang] = { rules, combined };
  });

  /**
   * 高亮代码 → HTML 字符串
   * 思路：用合并正则逐 token 匹配，未匹配部分原样转义
   * @param {string} code 源代码
   * @param {string} lang 语言
   * @returns {string} 高亮后的 HTML
   */
  function highlight(code, lang) {
    if (!code) return '';
    const cfg = HL_COMPILED[lang];
    if (!cfg) return X.utils.escape(code);
    const { rules, combined } = cfg;
    let out = '';
    let last = 0;
    let m;
    combined.lastIndex = 0;
    while ((m = combined.exec(code)) !== null) {
      // 先把未匹配的中间片段转义后追加
      if (m.index > last) out += X.utils.escape(code.slice(last, m.index));
      // 找到命中的分组，包裹 span
      for (let i = 0; i < rules.length; i++) {
        if (m[i + 1] !== undefined) {
          out += '<span class="' + rules[i].cls + '">' + X.utils.escape(m[i + 1]) + '</span>';
          break;
        }
      }
      last = combined.lastIndex;
      // 防止零宽匹配死循环
      if (combined.lastIndex === m.index) combined.lastIndex++;
    }
    if (last < code.length) out += X.utils.escape(code.slice(last));
    // 末尾换行补一个空白，保证 textarea 与 pre 行高对齐
    if (code.endsWith('\n')) out += ' ';
    return out;
  }

  /** 一次性注入语法高亮 + 多文件标签所需样式（只注入一次） */
  let _styleInjected = false;
  function _injectStyles() {
    if (_styleInjected) return;
    _styleInjected = true;
    const style = document.createElement('style');
    style.id = 'xiao-editor-styles';
    style.textContent = `
/* 编辑器语法高亮 + 多文件标签样式 */
.editor-code-wrap {
  position: relative;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.editor-code-wrap:focus-within { border-color: var(--primary); }
.editor-code-wrap .editor-high,
.editor-code-wrap .editor-code {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 12px;
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.5;
  tab-size: 2;
  white-space: pre-wrap;
  word-break: break-word;
  border: none;
  outline: none;
}
.editor-code-wrap .editor-high {
  background: transparent;
  pointer-events: none;
  overflow: hidden;
  z-index: 0;
  color: var(--text);
}
.editor-code-wrap .editor-code {
  background: transparent;
  color: transparent;
  caret-color: #fff;
  resize: none;
  z-index: 1;
}
/* token 着色（One Dark 配色，适配暗色主题） */
.tok-kw  { color: #c678dd; font-weight: 500; }
.tok-str { color: #98c379; }
.tok-num { color: #d19a66; }
.tok-cmt { color: #5c6370; font-style: italic; }

/* 多文件标签栏 */
.file-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
  padding: 4px 0;
}
.file-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  font-size: 12px;
  color: var(--text-dim);
  cursor: pointer;
  max-width: 180px;
}
.file-tab:hover { color: var(--text); background: var(--bg-hover); }
.file-tab.active {
  color: var(--text);
  border-bottom-color: var(--bg);
  background: var(--bg);
}
.file-tab .file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-tab .file-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  font-size: 14px;
  line-height: 1;
  opacity: .6;
}
.file-tab .file-close:hover { opacity: 1; background: var(--danger); color: #fff; }
.file-tab.new {
  border-style: dashed;
  padding: 4px 12px;
  font-size: 16px;
  line-height: 1;
}
/* 片段列表 */
.snippet-list { list-style: none; margin: 0; padding: 0; }
.snippet-item {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
.snippet-item:last-child { border-bottom: none; }
.snippet-item:hover { background: var(--bg-hover); }
.snippet-name { font-weight: 500; color: var(--text); }
.snippet-meta { font-size: 12px; margin-top: 2px; }
/* 分享链接 */
.editor-share { margin: 6px 0 0; font-size: 12px; word-break: break-all; }
.editor-share a { color: var(--primary); }
`;
    document.head.appendChild(style);
  }

  const editor = {
    // === 多文件状态（内存中维护） ===
    files: [],
    activeFile: 0,

    // === 当前编辑态（与活动文件同步，保留向后兼容） ===
    lang: 'js',
    code: '',

    // === 协同订阅 ===
    sub: null,
    cursorIgnore: false,

    // === 当前活动文件对应的云端片段 ID（用于更新而非新建） ===
    snippetId: null,

    // === 分享链接缓存 ===
    _shareUrl: null,

    /** 首次进入：初始化默认 4 个文件 */
    _ensureFiles() {
      if (this.files && this.files.length) return;
      this.files = [
        { name: 'main.js',     lang: 'js',     code: SNIPPETS.js     },
        { name: 'main.html',   lang: 'html',   code: SNIPPETS.html   },
        { name: 'main.css',    lang: 'css',    code: SNIPPETS.css    },
        { name: 'main.py',     lang: 'python', code: SNIPPETS.python }
      ];
      this.activeFile = 0;
    },

    /** 从活动文件同步到当前编辑态 */
    _syncFromActive() {
      const f = this.files[this.activeFile];
      if (!f) return;
      this.lang = f.lang;
      this.code = f.code;
      this.snippetId = f.snippetId || null;
    },

    /** 当前编辑态写回活动文件 */
    _syncToActive() {
      const f = this.files[this.activeFile];
      if (!f) return;
      f.code = this.code;
      f.lang = this.lang;
    },

    /** 根据语言重命名文件扩展名 */
    _renameExt(name, lang) {
      const ext = EXT[lang] || 'txt';
      return (name || '').replace(/\.[^.]+$/, '') + '.' + ext;
    },

    render() {
      _injectStyles();
      this._ensureFiles();
      this._syncFromActive();

      const langs = [
        ['js',     X.t('editor.js')],
        ['html',   X.t('editor.html')],
        ['css',    X.t('editor.css')],
        ['python', X.t('editor.python')]
      ];
      const langTabs = langs.map(([k, l]) =>
        `<button class="tab${k === this.lang ? ' active' : ''}" data-lang="${k}">${l}</button>`
      ).join('');

      // 文件标签栏
      const fileTabs = this._renderFileTabs();

      return `
        <section class="editor-page">
          <div class="editor-head">
            <h2>${X.t('editor.title')}</h2>
            <div class="file-tabs" id="ed_filetabs">${fileTabs}</div>
            <div class="editor-actions">
              <button class="btn ghost sm" id="ed_save" title="保存到云端">保存</button>
              <button class="btn ghost sm" id="ed_mysnips" title="我保存的片段">我的片段</button>
              <button class="btn ghost sm" id="ed_pubsnips" title="所有公开片段">公开片段</button>
              <button class="btn ghost sm" id="ed_copylink" style="display:none" title="复制分享链接">复制链接</button>
              <button class="btn ghost sm" id="ed_clear">${X.t('editor.clear')}</button>
              <button class="btn primary sm" id="ed_run">${X.t('editor.run')}</button>
            </div>
          </div>
          <div class="tabs" id="ed_tabs">${langTabs}</div>
          <div class="editor-grid">
            <div class="editor-code-wrap" id="ed_codewrap">
              <pre class="editor-high" id="ed_high" aria-hidden="true"></pre>
              <textarea class="editor-code" id="ed_code" spellcheck="false" autocomplete="off">${X.utils.escape(this.code || '')}</textarea>
            </div>
            <div class="editor-output" id="ed_output"><div class="dim center">${X.t('editor.noOutput')}</div></div>
          </div>
          <p class="editor-collab dim" id="ed_collab">${X.t('editor.collab')}</p>
          <p class="editor-share dim" id="ed_share" style="display:none"></p>
        </section>
      `;
    },

    /** 渲染文件标签栏 HTML */
    _renderFileTabs() {
      const items = this.files.map((f, i) => `
        <button class="file-tab${i === this.activeFile ? ' active' : ''}" data-idx="${i}" title="${X.utils.escape(f.name)}">
          <span class="file-name">${X.utils.escape(f.name)}</span>
          ${this.files.length > 1 ? `<span class="file-close" data-close="${i}" title="关闭">×</span>` : ''}
        </button>
      `).join('');
      return items + `<button class="file-tab new" id="ed_newfile" title="新建文件">+</button>`;
    },

    async afterRender(params) {
      params = params || {};
      this._ensureFiles();

      // 1) URL 参数加载云端片段：?snippet=<id>
      if (params.snippet) {
        try {
          const snip = await X.store.getSnippet(params.snippet);
          if (snip) {
            // 加载到当前活动文件（覆盖）
            const f = this.files[this.activeFile];
            if (f) {
              f.name = snip.name || f.name;
              f.lang = snip.language || f.lang;
              f.code = snip.code || '';
              f.snippetId = snip.id;
            }
            this.snippetId = snip.id;
            this._syncFromActive();
            // 公开片段则显示分享链接
            if (snip.is_public) this._showShareLink(snip.id);
            X.ui.toast('已加载片段：' + (snip.name || ''), 'ok');
          } else {
            X.ui.toast('片段未找到', 'err');
          }
        } catch (e) {
          X.ui.toast('加载片段失败：' + (e.message || e), 'err');
        }
      }

      this._syncFromActive();
      this._bindFileTabs();
      this._bindLangTabs();
      this._bindEditor();
      this._bindActions();
      this._refreshHighlight();

      // 2) Realtime：协同创作（频道内广播）
      this._subscribeCollab(this.lang);
    },

    /** 绑定文件标签栏事件 */
    _bindFileTabs() {
      const bar = X.utils.$('#ed_filetabs');
      if (!bar) return;
      X.utils.$$('.file-tab[data-idx]', bar).forEach(b => {
        b.addEventListener('click', e => {
          // 点击关闭按钮不触发切换
          if (e.target.classList.contains('file-close')) return;
          this._switchFile(Number(b.dataset.idx));
        });
      });
      X.utils.$$('.file-close', bar).forEach(x => {
        x.addEventListener('click', e => {
          e.stopPropagation();
          this._closeFile(Number(x.dataset.close));
        });
      });
      const add = X.utils.$('#ed_newfile', bar);
      if (add) add.addEventListener('click', () => this._newFile());
    },

    /** 绑定语言切换 */
    _bindLangTabs() {
      X.utils.$$('#ed_tabs .tab').forEach(b =>
        b.addEventListener('click', () => this.switchLang(b.dataset.lang))
      );
    },

    /** 绑定编辑区事件 */
    _bindEditor() {
      const code = X.utils.$('#ed_code');
      if (!code) return;
      code.value = this.code;
      // input 同步代码 + 高亮 + 广播
      code.addEventListener('input', X.utils.rafThrottle(() => this.onCodeChange()));
      // scroll 同步 pre 滚动位置
      code.addEventListener('scroll', () => {
        const high = X.utils.$('#ed_high');
        if (high) {
          high.scrollTop = code.scrollTop;
          high.scrollLeft = code.scrollLeft;
        }
      });
      // Tab 键插入两个空格（不切焦点）
      code.addEventListener('keydown', e => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const s = code.selectionStart, en = code.selectionEnd;
          code.value = code.value.slice(0, s) + '  ' + code.value.slice(en);
          code.selectionStart = code.selectionEnd = s + 2;
          this.onCodeChange();
        }
      });
    },

    /** 绑定操作按钮 */
    _bindActions() {
      const run = X.utils.$('#ed_run');
      if (run) run.addEventListener('click', () => this.run());
      const clear = X.utils.$('#ed_clear');
      if (clear) clear.addEventListener('click', () => this.clear());
      const save = X.utils.$('#ed_save');
      if (save) save.addEventListener('click', () => this.saveToCloud());
      const my = X.utils.$('#ed_mysnips');
      if (my) my.addEventListener('click', () => this.listMySnippets());
      const pub = X.utils.$('#ed_pubsnips');
      if (pub) pub.addEventListener('click', () => this.listPublicSnippets());
      const copy = X.utils.$('#ed_copylink');
      if (copy) copy.addEventListener('click', () => this.copyShareLink());
    },

    /** 切换文件：保存当前 → 加载目标 */
    _switchFile(idx) {
      if (idx === this.activeFile) return;
      if (idx < 0 || idx >= this.files.length) return;
      this._syncToActive();
      this.activeFile = idx;
      this._syncFromActive();
      this._refreshUI();
      // 重新订阅协同频道（不同语言不同频道）
      this._subscribeCollab(this.lang);
    },

    /** 新建文件 */
    _newFile() {
      const lang = this.lang || 'js';
      const ext = EXT[lang] || 'txt';
      // 自动避开重名
      let n = 1, name = 'untitled.' + ext;
      while (this.files.some(f => f.name === name)) {
        name = 'untitled' + (++n) + '.' + ext;
      }
      this._syncToActive();
      this.files.push({ name, lang, code: '' });
      this.activeFile = this.files.length - 1;
      this._syncFromActive();
      this._refreshUI();
      this._subscribeCollab(this.lang);
      X.ui.toast('已新建 ' + name, 'ok');
    },

    /** 关闭文件（至少保留一个） */
    _closeFile(idx) {
      if (this.files.length <= 1) {
        X.ui.toast('至少保留一个文件', 'info');
        return;
      }
      this.files.splice(idx, 1);
      if (this.activeFile >= this.files.length) this.activeFile = this.files.length - 1;
      else if (this.activeFile > idx) this.activeFile--;
      this._syncFromActive();
      this._refreshUI();
      this._subscribeCollab(this.lang);
    },

    /** 刷新 UI（文件标签 + 语言标签 + 编辑区 + 高亮 + 输出） */
    _refreshUI() {
      // 文件标签栏
      const bar = X.utils.$('#ed_filetabs');
      if (bar) {
        bar.innerHTML = this._renderFileTabs();
        this._bindFileTabs();
      }
      // 语言标签
      X.utils.$$('#ed_tabs .tab').forEach(b =>
        b.classList.toggle('active', b.dataset.lang === this.lang)
      );
      // 编辑区
      const code = X.utils.$('#ed_code');
      if (code) code.value = this.code;
      // 输出区重置
      const out = X.utils.$('#ed_output');
      if (out) out.innerHTML = `<div class="dim center">${X.t('editor.noOutput')}</div>`;
      this._refreshHighlight();
    },

    /** 刷新语法高亮 pre 内容 */
    _refreshHighlight() {
      const code = X.utils.$('#ed_code');
      const high = X.utils.$('#ed_high');
      if (!code || !high) return;
      high.innerHTML = highlight(code.value, this.lang);
      // 同步滚动位置
      high.scrollTop = code.scrollTop;
      high.scrollLeft = code.scrollLeft;
    },

    onLeave() {
      if (this.sub) { try { X.db.removeChannel(this.sub); } catch (_) {} this.sub = null; }
    },

    /** 切换当前文件的语言（语言标签点击） */
    switchLang(lang) {
      const f = this.files[this.activeFile];
      if (!f || f.lang === lang) return;
      // 更新文件语言 + 扩展名
      f.lang = lang;
      f.name = this._renameExt(f.name, lang);
      // 若代码为空，载入该语言示例
      if (!f.code) f.code = SNIPPETS[lang] || '';
      this.lang = lang;
      this.code = f.code;
      this._refreshUI();
      // 重新订阅协同频道
      this._subscribeCollab(lang);
    },

    onCodeChange() {
      const code = X.utils.$('#ed_code');
      if (!code) return;
      if (this.cursorIgnore) { this.cursorIgnore = false; return; }
      this.code = code.value;
      this._syncToActive();
      this._refreshHighlight();
      // 广播给同频道
      if (this.sub) {
        try { this.sub.send({ type: 'broadcast', event: 'code', payload: { code: this.code, lang: this.lang } }); } catch (_) {}
      }
    },

    /** 订阅协同频道（按语言分频道） */
    _subscribeCollab(lang) {
      // 先清理旧订阅
      if (this.sub) { try { X.db.removeChannel(this.sub); } catch (_) {} this.sub = null; }
      if (!X.supabaseReady) return;
      try {
        const ch = X.db.channel('editor-collab-' + lang, {
          config: { broadcast: { self: false } }
        });
        ch.on('broadcast', { event: 'code' }, payload => {
          const next = payload && payload.payload && payload.payload.code;
          if (typeof next === 'string' && next !== this.code) {
            this.cursorIgnore = true;
            const codeEl = X.utils.$('#ed_code');
            if (codeEl) codeEl.value = next;
            this.code = next;
            this._syncToActive();
            this._refreshHighlight();
          }
        }).subscribe();
        this.sub = ch;
      } catch (e) {
        console.warn('[Xiao] editor collab subscribe fail:', e);
      }
    },

    clear() {
      this.code = '';
      this._syncToActive();
      const code = X.utils.$('#ed_code');
      if (code) code.value = '';
      this._refreshHighlight();
      const out = X.utils.$('#ed_output');
      if (out) out.innerHTML = `<div class="dim center">${X.t('editor.noOutput')}</div>`;
    },

    // ============================================================
    // 云端保存 / 列表 / 分享
    // ============================================================

    /** 保存到云端：弹窗输入名称 + 公开/私有选择 → X.store.saveSnippet */
    async saveToCloud() {
      const cur = X.auth.currentUser();
      if (!cur) {
        X.ui.toast(X.t('err.notLoggedIn'), 'err');
        setTimeout(() => X.router.go('login'), 400);
        return;
      }
      const f = this.files[this.activeFile];
      if (!f) return;

      // 第一步：输入片段名称
      const name = await X.ui.prompt({
        title: '保存代码片段',
        label: '片段名称',
        placeholder: f.name || 'my-snippet',
        value: f.name || '',
        confirmText: '下一步',
        validate: v => v ? null : '名称不能为空'
      });
      if (name == null) return;

      // 第二步：选择公开 / 私有（确认=公开，取消=私有）
      const isPublic = await X.ui.confirm(
        '保存为公开片段？（取消则保存为私有）',
        '可见性'
      );

      try {
        const saved = await X.store.saveSnippet({
          id: this.snippetId || undefined,
          authorId: cur.id,
          name: name || f.name,
          language: f.lang,
          code: f.code,
          isPublic: !!isPublic
        });
        if (saved && saved.id) {
          // 记录片段 ID，下次保存即更新
          this.snippetId = saved.id;
          f.snippetId = saved.id;
          X.ui.toast('已保存' + (isPublic ? '（公开）' : '（私有）'), 'ok');
          // 公开片段显示分享链接
          if (isPublic) this._showShareLink(saved.id);
        } else {
          X.ui.toast('保存失败', 'err');
        }
      } catch (e) {
        X.ui.toast('保存失败：' + (e.message || e), 'err');
      }
    },

    /** 列出我的片段 */
    async listMySnippets() {
      const cur = X.auth.currentUser();
      if (!cur) {
        X.ui.toast(X.t('err.notLoggedIn'), 'err');
        setTimeout(() => X.router.go('login'), 400);
        return;
      }
      try {
        const list = await X.store.listSnippets(cur.id);
        this._showSnippetsModal(list, '我的片段');
      } catch (e) {
        X.ui.toast('加载失败：' + (e.message || e), 'err');
      }
    },

    /** 列出公开片段 */
    async listPublicSnippets() {
      try {
        const list = await X.store.listPublicSnippets();
        this._showSnippetsModal(list, '公开片段');
      } catch (e) {
        X.ui.toast('加载失败：' + (e.message || e), 'err');
      }
    },

    /** 片段列表弹窗，点击加载到编辑器 */
    _showSnippetsModal(list, title) {
      list = list || [];
      const body = list.length
        ? `<ul class="snippet-list">${list.map(s => `
            <li class="snippet-item" data-id="${X.utils.escape(s.id)}">
              <div class="snippet-name">${X.utils.escape(s.name || '(未命名)')}</div>
              <div class="snippet-meta dim">
                <span>${X.utils.escape(s.language || '')}</span> ·
                <span>${s.is_public ? '公开' : '私有'}</span> ·
                <span>${X.utils.relTime(s.updated_at || s.created_at)}</span>
              </div>
            </li>
          `).join('')}</ul>`
        : `<div class="dim center" style="padding:24px">暂无片段</div>`;

      const inst = X.ui.modal({ title, body, size: 'md' });
      // 点击条目加载
      X.utils.$$('.snippet-item', inst.bodyEl).forEach(li => {
        li.addEventListener('click', async () => {
          const id = li.dataset.id;
          inst.close();
          try {
            const s = await X.store.getSnippet(id);
            if (!s) { X.ui.toast('片段未找到', 'err'); return; }
            this._loadSnippet(s);
          } catch (e) {
            X.ui.toast('加载失败：' + (e.message || e), 'err');
          }
        });
      });
    },

    /** 加载片段到编辑器（新开一个文件标签） */
    _loadSnippet(s) {
      this._syncToActive();
      // 若已打开过同 ID 的文件，直接切换
      const exists = this.files.findIndex(f => f.snippetId === s.id);
      if (exists >= 0) {
        this.activeFile = exists;
      } else {
        this.files.push({
          name: s.name || ('snippet.' + (EXT[s.language] || 'txt')),
          lang: s.language || 'js',
          code: s.code || '',
          snippetId: s.id
        });
        this.activeFile = this.files.length - 1;
      }
      this._syncFromActive();
      this._refreshUI();
      this._subscribeCollab(this.lang);
      if (s.is_public) this._showShareLink(s.id);
      X.ui.toast('已加载片段', 'ok');
    },

    /** 显示分享链接 + 显示复制按钮 */
    _showShareLink(id) {
      const url = location.origin + location.pathname + '#/editor?snippet=' + encodeURIComponent(id);
      this._shareUrl = url;
      const p = X.utils.$('#ed_share');
      const btn = X.utils.$('#ed_copylink');
      if (p) {
        p.style.display = '';
        p.innerHTML = '分享链接：<a href="' + X.utils.escape(url) + '" target="_blank">' + X.utils.escape(url) + '</a>';
      }
      if (btn) btn.style.display = '';
    },

    /** 复制分享链接到剪贴板 */
    async copyShareLink() {
      if (!this._shareUrl) {
        X.ui.toast('暂无分享链接', 'info');
        return;
      }
      try {
        await navigator.clipboard.writeText(this._shareUrl);
        X.ui.toast('链接已复制', 'ok');
      } catch (e) {
        // 降级：用临时 textarea + execCommand
        const ta = document.createElement('textarea');
        ta.value = this._shareUrl;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); X.ui.toast('链接已复制', 'ok'); }
        catch (_) { X.ui.toast('复制失败，请手动复制', 'err'); }
        ta.remove();
      }
    },

    // ============================================================
    // 运行（保留原有逻辑）
    // ============================================================
    async run() {
      const code = X.utils.$('#ed_code');
      if (!code) return;
      const src = code.value;
      const out = X.utils.$('#ed_output');
      if (!out) return;

      // 截获 console.* 输出
      const logs = [];
      const fakeConsole = {
        log:   (...a) => logs.push(a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')),
        info:  (...a) => logs.push(a.map(x => String(x)).join(' ')),
        warn:  (...a) => logs.push('⚠ ' + a.map(x => String(x)).join(' ')),
        error: (...a) => logs.push('✗ ' + a.map(x => String(x)).join(' ')),
        debug: (...a) => logs.push(a.map(x => String(x)).join(' '))
      };

      try {
        if (this.lang === 'js') {
          out.innerHTML = '<div id="js_out"></div>';
          const jsOut = X.utils.$('#js_out', out);
          // 用 new Function 提供简化的 document.getElementById
          const fn = new Function('document', 'console', `"use strict";\n${src}`);
          // 简易 document：getElementById 找当前输出区
          const fakeDoc = {
            getElementById: (id) => id === 'out' ? jsOut : null,
            querySelector: (sel) => X.utils.$(sel, out),
            querySelectorAll: (sel) => X.utils.$$(sel, out),
            createElement: (tag) => X.utils.h(tag),
            body: out
          };
          try {
            fn(fakeDoc, fakeConsole);
          } catch (e) {
            logs.push('✗ ' + (e.message || String(e)));
          }
          out.innerHTML = '<div class="code-out">' + (jsOut && jsOut.innerHTML ? jsOut.innerHTML + '<hr/>' : '') +
                          '<pre>' + X.utils.escape(logs.join('\n') || '') + '</pre></div>';
        } else if (this.lang === 'html') {
          // 直接渲染 HTML 到 iframe
          out.innerHTML = '<iframe class="html-frame" sandbox="allow-scripts"></iframe>';
          const iframe = X.utils.$('iframe', out);
          if (iframe) {
            const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
            if (doc) { doc.open(); doc.write(src); doc.close(); }
          }
        } else if (this.lang === 'css') {
          // CSS 预览：套一层预置 HTML
          out.innerHTML = `<style>${src}</style><div class="css-preview"><h2>CSS 预览</h2><div class="box">段落文本 · box 类</div><button class="btn primary">按钮</button></div>`;
        } else if (this.lang === 'python') {
          out.innerHTML = `<div class="dim center">${X.t('editor.pyNotSupported')}</div>`;
        }
      } catch (e) {
        out.innerHTML = `<div class="code-out err">运行错误：${X.utils.escape(e.message || String(e))}</div>`;
      }
    }
  };

  X.modules = X.modules || {};
  X.modules.editor = editor;
  // 注册路由：render / afterRender 接收 params（用于 ?snippet=<id> 加载）
  X.router.register('editor', {
    render: () => editor.render(),
    afterRender: (params) => editor.afterRender(params),
    onLeave: () => editor.onLeave()
  });
})(window.Xiao = window.Xiao || {});
