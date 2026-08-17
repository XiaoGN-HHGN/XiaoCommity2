// ============================================================================
// Xiao 2.0 · 公告中心模块（announcements）
// 职责：
//   1. 列表页：展示所有公告，置顶(pinned=true) 排最前并标星
//   2. 管理员可发布 / 编辑 / 删除公告（标题 + 多行正文 + 是否置顶）
//   3. 点击公告 → modal 展开全文
//   4. Realtime 订阅 announcements 表 INSERT，实时追加新公告 + toast 提醒
//   5. 全站未读提醒：页面加载时比对 localStorage 'xiao.announcements.lastSeen'
// 路由名：announcements（公开可读；写操作内部用 X.auth.isAdmin() 守卫）
// 依赖：X.dbq / X.realtime / X.ui / X.utils / X.auth（均由 core 层提供）
// ============================================================================
(function (X) {
  // v2.1 schema 新增表：announcements(id, author_id, title, body, pinned, created_at)
  const TABLE = 'announcements';
  // 已读时间戳存储键（记录用户已看过的最新公告 created_at）
  const LAST_SEEN_KEY = 'xiao.announcements.lastSeen';

  const announcements = {
    list: [],   // 当前已加载公告
    sub: null,  // Realtime 订阅句柄

    // ----------------------------------------------------------------
    // 列表页 HTML（管理员「发布公告」按钮仅管理员可见）
    // ----------------------------------------------------------------
    render() {
      const adminBtn = X.auth.isAdmin()
        ? `<button class="btn primary sm" id="ann_new">＋ 发布公告</button>`
        : '';
      return `
        <section class="ann-page">
          <div class="ann-head">
            <h2>📢 公告中心</h2>
            <div class="ann-toolbar">${adminBtn}</div>
          </div>
          <div class="ann-list" id="ann_list">
            <div class="dim center">${X.t('common.loading')}</div>
          </div>
        </section>
      `;
    },

    // ----------------------------------------------------------------
    // 加载公告 + 绑定事件 + 订阅 Realtime
    // ----------------------------------------------------------------
    async afterRender() {
      const newBtn = X.utils.$('#ann_new');
      if (newBtn) newBtn.addEventListener('click', () => this.openCreate());

      await this.loadList();
      this._markSeen(); // 进入页面即视为已读

      // Realtime：订阅新公告 INSERT，实时追加 + 提醒
      if (X.supabaseReady) {
        this.sub = X.realtime.onInsert(TABLE, null, (payload) => {
          const row = payload && payload.new;
          if (!row) return;
          if (this.list.find(x => x.id === row.id)) return; // 去重（自己发的也会到）
          this._upsert(row);
          X.ui.toast('📢 新公告：' + (row.title || '点击查看'), 'info', 4000);
        });
      }
    },

    // ----------------------------------------------------------------
    // 离开页面：清理 Realtime 订阅 + 重置状态
    // ----------------------------------------------------------------
    onLeave() {
      if (this.sub) { X.realtime.off(this.sub); this.sub = null; }
      this.list = [];
    },

    // ----------------------------------------------------------------
    // 拉取公告列表（DB 按时间倒序，前端再稳定排序把置顶浮到最前）
    // ----------------------------------------------------------------
    async loadList() {
      const el = X.utils.$('#ann_list');
      if (!el) return;
      if (!X.supabaseReady) {
        el.innerHTML = '<div class="dim center">⚠ Supabase 未配置</div>';
        return;
      }
      try {
        const rows = await X.dbq.select(TABLE, {
          order: ['created_at', { ascending: false }]
        });
        // 稳定排序：置顶排前，组内保持时间倒序
        rows.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
        this.list = rows;
        this._renderList();
      } catch (e) {
        el.innerHTML = '<div class="dim center" style="color:var(--danger)">加载失败：'
          + X.utils.escape((e && e.message) || '') + '</div>';
      }
    },

    // 渲染列表
    _renderList() {
      const el = X.utils.$('#ann_list');
      if (!el) return;
      if (!this.list.length) {
        el.innerHTML = `<div class="dim center">${X.t('common.empty')}</div>`;
        return;
      }
      el.innerHTML = '';
      this.list.forEach(a => el.appendChild(this._row(a)));
    },

    // 单条公告卡片
    _row(a) {
      const isAdmin = X.auth.isAdmin();
      const star = a.pinned
        ? X.utils.h('span', { class: 'ann-pin', title: '置顶' }, ['📌'])
        : null;
      const title = X.utils.h('div', { class: 'ann-title', text: a.title || '(无标题)' });
      const meta = X.utils.h('div', { class: 'ann-meta', text: X.utils.relTime(a.created_at) });
      const main = X.utils.h('div', { class: 'ann-main' }, [title, meta]);

      const card = X.utils.h('div', {
        class: 'ann-card' + (a.pinned ? ' pinned' : ''),
        onclick: () => this.view(a)
      }, [star, main]);

      // 管理员操作按钮（阻止冒泡，避免触发卡片查看）
      if (isAdmin) {
        const actions = X.utils.h('div', { class: 'row-actions' }, [
          X.utils.h('button', { class: 'btn ghost xs', text: X.t('common.edit'),
            onclick: (e) => { e.stopPropagation(); this.openEdit(a); } }),
          X.utils.h('button', { class: 'btn ghost xs', text: X.t('common.delete'),
            onclick: (e) => { e.stopPropagation(); this.remove(a); } })
        ]);
        card.appendChild(actions);
      }
      return card;
    },

    // ----------------------------------------------------------------
    // 查看全文（modal 展开）
    // ----------------------------------------------------------------
    view(a) {
      const body = X.utils.h('div', { class: 'ann-view' });
      const meta = X.utils.h('div', { class: 'ann-meta',
        text: (a.pinned ? '📌 置顶 · ' : '') + X.utils.relTime(a.created_at) });
      const content = X.utils.h('div', { class: 'ann-body' });
      // 先转义再保留换行，防注入
      content.innerHTML = X.utils.escape(a.body || '').replace(/\n/g, '<br>');
      body.appendChild(meta);
      body.appendChild(content);

      // 管理员可在全文弹窗内直接编辑 / 删除
      const footer = [];
      if (X.auth.isAdmin()) {
        footer.push(X.utils.h('button', { class: 'btn ghost sm', text: X.t('common.edit'),
          onclick: () => { inst.close(); this.openEdit(a); } }));
        footer.push(X.utils.h('button', { class: 'btn ghost sm', text: X.t('common.delete'),
          onclick: () => { inst.close(); this.remove(a); } }));
      }
      const inst = X.ui.modal({ title: a.title || '(无标题)', body, footer });
    },

    // ----------------------------------------------------------------
    // 发布 / 编辑共用表单（标题 + 多行正文 + 置顶复选框）
    // ----------------------------------------------------------------
    _form(prefill) {
      const titleInput = X.utils.h('input', {
        class: 'input', type: 'text', placeholder: '请输入公告标题', maxlength: '120'
      });
      const bodyInput = X.utils.h('textarea', {
        class: 'textarea', placeholder: '请输入公告正文（支持换行）', rows: '8'
      });
      const pinCheck = X.utils.h('input', { type: 'checkbox' });
      if (prefill) {
        titleInput.value = prefill.title || '';
        bodyInput.value = prefill.body || '';
        pinCheck.checked = !!prefill.pinned;
      }
      const err = X.utils.h('div', { class: 'error-text', style: { display: 'none' } });

      const wrap = X.utils.h('div', { class: 'ann-form' }, [
        X.utils.h('label', { class: 'field' }, [
          X.utils.h('span', { class: 'label', text: '标题' }), titleInput
        ]),
        X.utils.h('label', { class: 'field' }, [
          X.utils.h('span', { class: 'label', text: '正文' }), bodyInput
        ]),
        X.utils.h('label', {
          class: 'field',
          style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }
        }, [
          pinCheck,
          X.utils.h('span', { text: '设为置顶公告' })
        ]),
        err
      ]);

      return {
        wrap, err,
        getTitle: () => titleInput.value.trim(),
        getBody: () => bodyInput.value.trim(),
        getPinned: () => !!pinCheck.checked,
        setErr: (m) => { err.textContent = m || ''; err.style.display = m ? 'block' : 'none'; }
      };
    },

    // ----------------------------------------------------------------
    // 发布公告（仅管理员）
    // ----------------------------------------------------------------
    openCreate() {
      if (!X.auth.isAdmin()) { X.ui.toast('无权操作', 'err'); return; }
      const f = this._form(null);
      const ok = X.utils.h('button', { class: 'btn primary' }, [X.t('common.submit')]);
      const cancel = X.utils.h('button', { class: 'btn ghost' }, [X.t('common.cancel')]);
      let inst;
      const submit = async () => {
        const title = f.getTitle();
        const body = f.getBody();
        if (!title) { f.setErr('请填写标题'); return; }
        if (!body)  { f.setErr('请填写正文'); return; }
        ok.disabled = true;
        try {
          const cur = X.auth.currentUser();
          const row = await X.dbq.insert(TABLE, {
            author_id: cur ? cur.id : null,
            title, body, pinned: f.getPinned(),
            created_at: new Date().toISOString()
          });
          X.ui.toast('公告已发布', 'ok');
          inst.close();
          this._upsert(row);    // 立即追加（Realtime 也会到，内部去重）
          this._markSeen();     // 自己发的视为已读
        } catch (e) {
          f.setErr('发布失败：' + ((e && e.message) || ''));
        } finally {
          ok.disabled = false;
        }
      };
      ok.addEventListener('click', submit);
      cancel.addEventListener('click', () => inst.close());
      inst = X.ui.modal({ title: '发布公告', body: f.wrap, footer: [cancel, ok] });
      setTimeout(() => { const i = f.wrap.querySelector('.input'); if (i) i.focus(); }, 240);
    },

    // ----------------------------------------------------------------
    // 编辑公告（仅管理员）
    // ----------------------------------------------------------------
    openEdit(a) {
      if (!X.auth.isAdmin()) { X.ui.toast('无权操作', 'err'); return; }
      const f = this._form(a);
      const ok = X.utils.h('button', { class: 'btn primary' }, [X.t('common.save')]);
      const cancel = X.utils.h('button', { class: 'btn ghost' }, [X.t('common.cancel')]);
      let inst;
      const submit = async () => {
        const title = f.getTitle();
        const body = f.getBody();
        if (!title) { f.setErr('请填写标题'); return; }
        if (!body)  { f.setErr('请填写正文'); return; }
        ok.disabled = true;
        try {
          const updated = await X.dbq.update(TABLE,
            { title, body, pinned: f.getPinned() },
            { eq: ['id', a.id] });
          X.ui.toast('已更新', 'ok');
          inst.close();
          if (Array.isArray(updated) && updated[0]) this._upsert(updated[0]);
        } catch (e) {
          f.setErr('更新失败：' + ((e && e.message) || ''));
        } finally {
          ok.disabled = false;
        }
      };
      ok.addEventListener('click', submit);
      cancel.addEventListener('click', () => inst.close());
      inst = X.ui.modal({ title: X.t('common.edit') + '公告', body: f.wrap, footer: [cancel, ok] });
      setTimeout(() => { const i = f.wrap.querySelector('.input'); if (i) i.focus(); }, 240);
    },

    // ----------------------------------------------------------------
    // 删除公告（仅管理员，二次确认）
    // ----------------------------------------------------------------
    async remove(a) {
      if (!X.auth.isAdmin()) { X.ui.toast('无权操作', 'err'); return; }
      const ok = await X.ui.confirm('确定删除公告「' + (a.title || '') + '」？', '删除公告');
      if (!ok) return;
      try {
        await X.dbq.remove(TABLE, { eq: ['id', a.id] });
        this.list = this.list.filter(x => x.id !== a.id);
        this._renderList();
        X.ui.toast(X.t('ok.deleted'), 'ok');
      } catch (e) {
        X.ui.toast('删除失败：' + ((e && e.message) || ''), 'err');
      }
    },

    // ----------------------------------------------------------------
    // 插入 / 更新一条并重排（发布 / 编辑 / Realtime 共用）
    // ----------------------------------------------------------------
    _upsert(row) {
      if (!row || !row.id) return;
      const idx = this.list.findIndex(x => x.id === row.id);
      if (idx >= 0) this.list[idx] = row;
      else this.list.push(row);
      // 置顶优先 + 时间倒序
      this.list.sort((x, y) => {
        const px = x.pinned ? 1 : 0, py = y.pinned ? 1 : 0;
        if (px !== py) return py - px;
        return Date.parse(y.created_at || 0) - Date.parse(x.created_at || 0);
      });
      this._renderList();
    },

    // ----------------------------------------------------------------
    // 标记已读：把最新一条 created_at 写入 localStorage
    // ----------------------------------------------------------------
    _markSeen() {
      try {
        let newest = null;
        for (const a of this.list) {
          if (!newest || Date.parse(a.created_at || 0) > Date.parse(newest)) {
            newest = a.created_at;
          }
        }
        if (newest) localStorage.setItem(LAST_SEEN_KEY, newest);
      } catch (_) {}
    },

    // ----------------------------------------------------------------
    // 全站未读提醒（页面加载后调用一次）
    // 比对 localStorage 'xiao.announcements.lastSeen'，有新公告则 toast
    // ----------------------------------------------------------------
    async checkUnread() {
      if (!X.supabaseReady) return;
      // 已在公告中心页面则不重复打扰（列表本身即提醒）
      if (X.router.current && X.router.current.name === 'announcements') return;
      try {
        const top = await X.dbq.select(TABLE, {
          order: ['created_at', { ascending: false }], limit: 1
        });
        if (!top || !top.length) return;
        const newest = top[0];
        let lastSeen = null;
        try { lastSeen = localStorage.getItem(LAST_SEEN_KEY); } catch (_) {}
        if (!lastSeen || Date.parse(newest.created_at) > Date.parse(lastSeen)) {
          X.ui.toast('📢 有新公告：' + (newest.title || '前往公告中心查看'), 'info', 5000);
        }
      } catch (_) { /* 静默，不打扰用户 */ }
    }
  };

  // 注册路由（公开可读，无需 requiresAuth / requiresAdmin）
  X.modules = X.modules || {};
  X.modules.announcements = announcements;
  X.router.register('announcements', {
    render: () => announcements.render(),
    afterRender: () => announcements.afterRender(),
    onLeave: () => announcements.onLeave()
  });

  // 全站未读提醒：页面加载后延迟检查一次（等待 router 初始化完成）
  setTimeout(() => { try { announcements.checkUnread(); } catch (_) {} }, 1500);
})(window.Xiao = window.Xiao || {});
