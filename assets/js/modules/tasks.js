// ============================================================================
// Xiao 2.0 · 任务看板模块（Kanban）
// 职责：
//   1. 三列看板（待办 / 进行中 / 已完成），每列展示任务卡片
//      卡片含：标题 / 描述 / 截止日期 / 负责人
//   2. 任务 CRUD：新建（弹窗）/ 编辑（点卡片 → 弹窗修改）/ 删除
//   3. 拖拽移动任务到不同列（HTML5 drag & drop → 更新 column_key）
//   4. Realtime 订阅 tasks 表 INSERT / UPDATE / DELETE，实时同步
// 数据表：tasks（v2.1 升级 SQL 新增；X.TABLES 未收录时硬编码字符串 'tasks'）
// 表结构：id, title, description, column_key(todo/doing/done), assignee_id,
//         creator_id, sort_order, due_date, created_at, updated_at
// 路由名：tasks，需要登录（requiresAuth: true）
// 数据访问：直接使用 X.dbq（select / insert / update / remove）
// ============================================================================
(function (X) {
  // tasks 表为 v2.1 新增，X.TABLES 可能尚未收录 → 兜底硬编码
  const TASK_TABLE = (X.TABLES && X.TABLES.TASKS) || 'tasks';
  const PROFILES   = (X.TABLES && X.TABLES.PROFILES) || 'profiles';

  // 三列定义：key 对应 tasks.column_key
  const COLUMNS = [
    { key: 'todo',  i18n: 'tasks.colTodo',  icon: '📋' },
    { key: 'doing', i18n: 'tasks.colDoing', icon: '⚙️' },
    { key: 'done',  i18n: 'tasks.colDone',  icon: '✅' }
  ];

  // 本地 i18n 兜底：X.t 找不到 key 时回退到这里的中文文案
  // （tasks 相关词条尚未进入 i18n 词典，先就地兜底，不污染 zh-CN.js）
  const FB = {
    'tasks.title':      '任务看板',
    'tasks.new':        '新建任务',
    'tasks.colTodo':    '待办',
    'tasks.colDoing':   '进行中',
    'tasks.colDone':    '已完成',
    'tasks.fTitle':     '标题',
    'tasks.fDesc':      '描述',
    'tasks.fColumn':    '列',
    'tasks.fDue':       '截止日期',
    'tasks.assignee':   '负责人',
    'tasks.unassigned': '未指派',
    'tasks.overdue':    '已逾期',
    'tasks.create':     '创建',
    'tasks.editTitle':  '编辑任务',
    'tasks.empty':      '拖拽任务到此处，或点上方新建',
    'tasks.loadFail':   '加载失败',
    'tasks.dndHint':    '提示：拖动卡片可在列间移动',
    'tasks.delConfirm': '确定删除该任务？',
    'tasks.created':    '任务已创建',
    'tasks.updated':    '任务已更新',
    'tasks.deleted':    '任务已删除',
    'tasks.moved':      '已移动到「{col}」',
    'tasks.needTitle':  '请填写标题',
    'tasks.opFail':     '操作失败',
    'tasks.notConfigured': '⚠ Supabase 未配置'
  };
  // t()：先走 X.t（支持多语言），找不到 key 再回退本地中文
  function t(k, v) {
    const s = X.t(k, v);
    return (s === k && FB[k]) ? FB[k] : s;
  }

  const tasks = {
    loaded: [],      // 当前已加载的全部任务
    userMap: {},     // userId → { username, avatar, avatar_type } 用户名缓存
    subs: [],        // Realtime 订阅句柄数组（onLeave 时统一清理）
    dragId: null,    // 当前正在拖拽的任务 id

    // ------------------------------------------------------------------
    // render：返回看板骨架 HTML（标题栏 + 新建按钮 + 三列容器）
    // ------------------------------------------------------------------
    render() {
      const colsHtml = COLUMNS.map(c =>
        `<div class="kanban-col" data-col="${c.key}">
           <div class="kanban-col-head">
             <span>${c.icon} ${t(c.i18n)}</span>
             <span class="kanban-count" id="kb_cnt_${c.key}">0</span>
           </div>
           <div class="kanban-col-body" id="kb_col_${c.key}" data-col="${c.key}">
             <div class="dim center kanban-loading">${X.t('common.loading')}</div>
           </div>
         </div>`
      ).join('');

      return `
        <style>
          .tasks-page .kanban-board{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap}
          .tasks-page .kanban-col{flex:1;min-width:220px;background:var(--bg-soft,rgba(127,127,127,.06));border-radius:10px;display:flex;flex-direction:column;max-height:72vh}
          .tasks-page .kanban-col-head{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;font-weight:600;border-bottom:1px solid var(--border,rgba(127,127,127,.15))}
          .tasks-page .kanban-count{font-size:.8em;color:var(--dim,#888)}
          .tasks-page .kanban-col-body{padding:8px;overflow-y:auto;flex:1;min-height:80px}
          .tasks-page .kanban-col-body.drag-over{outline:2px dashed var(--primary,#4a8);outline-offset:-4px;background:rgba(74,136,136,.08)}
          .tasks-page .task-card{background:var(--bg,#fff);border:1px solid var(--border,rgba(127,127,127,.15));border-radius:8px;padding:10px;margin-bottom:8px;cursor:pointer;transition:box-shadow .15s}
          .tasks-page .task-card:hover{box-shadow:0 2px 8px rgba(0,0,0,.12)}
          .tasks-page .task-card.dragging{opacity:.5}
          .tasks-page .task-title{font-weight:600;margin-bottom:4px;word-break:break-word}
          .tasks-page .task-desc{font-size:.9em;color:var(--dim,#666);margin-bottom:6px;word-break:break-word;white-space:pre-wrap}
          .tasks-page .task-meta{display:flex;gap:8px;flex-wrap:wrap;font-size:.8em}
          .tasks-page .task-due{color:var(--primary,#4a8)}
          .tasks-page .task-due.overdue{color:var(--danger,#e44);font-weight:600}
          .tasks-page .task-assignee{color:var(--dim,#666)}
          .tasks-page .kanban-hint{padding:4px 0 8px;font-size:.85em}
          .tasks-page .kanban-empty,.tasks-page .kanban-loading{padding:16px 8px;font-size:.85em}
          .tasks-page .tasks-head{display:flex;justify-content:space-between;align-items:center}
        </style>
        <section class="tasks-page">
          <div class="tasks-head">
            <h2>${t('tasks.title')}</h2>
            <button class="btn primary sm" id="kb_new">+ ${t('tasks.new')}</button>
          </div>
          <div class="dim center kanban-hint">${t('tasks.dndHint')}</div>
          <div class="kanban-board" id="kb_board">${colsHtml}</div>
        </section>
      `;
    },

    // ------------------------------------------------------------------
    // afterRender：绑定按钮/拖拽 → 加载任务 → 订阅 Realtime
    // ------------------------------------------------------------------
    async afterRender() {
      const newBtn = X.utils.$('#kb_new');
      if (newBtn) newBtn.addEventListener('click', () => this.openCreate());

      this.bindDnd();              // 绑定三列拖放
      await this.loadTasks();      // 拉取全部任务并渲染
      this.subscribeRealtime();    // 订阅 tasks 表变更
    },

    // ------------------------------------------------------------------
    // onLeave：清理 Realtime 订阅 + 重置状态
    // ------------------------------------------------------------------
    onLeave() {
      (this.subs || []).forEach(ch => X.realtime.off(ch));
      this.subs = [];
      this.loaded = [];
      this.userMap = {};
      this.dragId = null;
    },

    // ============================================================
    // 数据加载
    // ============================================================

    /** 拉取全部任务（按 sort_order 升序），并解析用户名后渲染 */
    async loadTasks() {
      if (!X.supabaseReady) {
        COLUMNS.forEach(c => this._setColHtml(c.key,
          '<div class="dim center">' + X.utils.escape(t('tasks.notConfigured')) + '</div>'));
        return;
      }
      try {
        const list = await X.dbq.select(TASK_TABLE, {
          order: ['sort_order', { ascending: true }],
          limit: 500
        });
        this.loaded = list || [];
        await this.resolveUsers();   // 批量解析负责人/创建者
        this.renderBoard();
      } catch (e) {
        this._showAllError(t('tasks.loadFail') + '：' + (e.message || ''));
      }
    },

    /** 批量解析 loaded 中涉及的 assignee_id / creator_id → 填充 userMap */
    async resolveUsers() {
      const ids = new Set();
      this.loaded.forEach(tk => {
        if (tk.assignee_id) ids.add(tk.assignee_id);
        if (tk.creator_id)  ids.add(tk.creator_id);
      });
      // 当前用户直接入缓存
      const cur = X.auth.currentUser();
      if (cur && cur.id) { this.userMap[cur.id] = cur; ids.delete(cur.id); }
      if (!ids.size) return;
      try {
        const rows = await X.dbq.select(PROFILES, { in_filter: ['id', Array.from(ids)] });
        (rows || []).forEach(u => { this.userMap[u.id] = u; });
      } catch (_) { /* 用户名解析失败不阻塞渲染 */ }
    },

    // ============================================================
    // 渲染
    // ============================================================

    /** 渲染整个看板：把 loaded 按列分发并绘制卡片 */
    renderBoard() {
      COLUMNS.forEach(c => {
        const body = X.utils.$('#kb_col_' + c.key);
        if (!body) return;
        body.innerHTML = '';
        const items = this.loaded.filter(tk => tk.column_key === c.key);
        const cnt = X.utils.$('#kb_cnt_' + c.key);
        if (cnt) cnt.textContent = String(items.length);
        if (!items.length) {
          body.appendChild(X.utils.h('div', { class: 'dim center kanban-empty' }, [t('tasks.empty')]));
          return;
        }
        items.forEach(tk => body.appendChild(this.renderCard(tk)));
      });
    },

    /** 渲染单张任务卡片 */
    renderCard(tk) {
      const card = X.utils.h('div', {
        class: 'task-card',
        dataset: { id: tk.id },
        draggable: 'true'
      });

      // 标题
      card.appendChild(X.utils.h('div', { class: 'task-title', text: tk.title || '(无标题)' }));

      // 描述（可空）
      if (tk.description) {
        card.appendChild(X.utils.h('div', { class: 'task-desc', text: tk.description }));
      }

      // 截止日期 + 负责人
      const meta = X.utils.h('div', { class: 'task-meta' });
      if (tk.due_date) {
        const overdue = tk.column_key !== 'done' && this._isOverdue(tk.due_date);
        meta.appendChild(X.utils.h('span', {
          class: 'task-due' + (overdue ? ' overdue' : ''),
          text: '⏰ ' + this.fmtDue(tk.due_date) + (overdue ? ' · ' + t('tasks.overdue') : '')
        }));
      }
      const assignee = this.userMap[tk.assignee_id];
      const assigneeLabel = assignee ? (assignee.username || '?') : t('tasks.unassigned');
      meta.appendChild(X.utils.h('span', { class: 'task-assignee', text: '👤 ' + assigneeLabel }));
      card.appendChild(meta);

      // 点击 → 编辑；拖拽 → 存 id
      card.addEventListener('click', () => this.openEdit(tk));
      card.addEventListener('dragstart', e => this._onDragStart(e, tk));
      card.addEventListener('dragend', () => { this.dragId = null; this._clearDragState(); });

      return card;
    },

    // ============================================================
    // 拖拽（HTML5 drag & drop）
    // ============================================================

    /** 为三列绑定 dragover / dragleave / drop */
    bindDnd() {
      COLUMNS.forEach(c => {
        const body = X.utils.$('#kb_col_' + c.key);
        if (!body) return;
        // dragover：preventDefault 才允许 drop
        body.addEventListener('dragover', e => {
          e.preventDefault();
          try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}
          body.classList.add('drag-over');
        });
        // dragleave：离开列体时取消高亮
        body.addEventListener('dragleave', e => {
          if (!body.contains(e.relatedTarget)) body.classList.remove('drag-over');
        });
        // drop：读取任务 id，更新 column_key
        body.addEventListener('drop', e => {
          e.preventDefault();
          body.classList.remove('drag-over');
          const raw = this.dragId || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
          if (!raw) return;
          this.dragId = null;
          this.updateColumn(raw, c.key);
        });
      });
    },

    /** dragstart：把任务 id 存入 dataTransfer + 模块变量 */
    _onDragStart(e, tk) {
      this.dragId = tk.id;
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(tk.id));
      } catch (_) {}
      e.currentTarget.classList.add('dragging');
    },

    /** 清理拖拽过程中的临时样式 */
    _clearDragState() {
      X.utils.$$('.kanban-col-body.drag-over').forEach(el => el.classList.remove('drag-over'));
      X.utils.$$('.task-card.dragging').forEach(el => el.classList.remove('dragging'));
    },

    /** 拖拽落点：更新任务的 column_key（乐观更新 + 失败回滚） */
    async updateColumn(id, colKey) {
      // 统一用字符串比较，兼容 uuid / 数字 id
      const tk = this.loaded.find(x => String(x.id) === String(id));
      if (!tk) return;
      if (tk.column_key === colKey) return;   // 同列无需更新

      const oldCol = tk.column_key;
      const now = new Date().toISOString();
      // 乐观更新本地
      tk.column_key = colKey;
      tk.updated_at = now;
      this.renderBoard();

      try {
        await X.dbq.update(TASK_TABLE,
          { column_key: colKey, updated_at: now },
          { eq: ['id', tk.id] });
        const col = COLUMNS.find(c => c.key === colKey);
        X.ui.toast(t('tasks.moved', { col: col ? t(col.i18n) : colKey }), 'ok');
      } catch (e) {
        // 回滚
        tk.column_key = oldCol;
        this.renderBoard();
        X.ui.toast(t('tasks.opFail') + '：' + (e.message || ''), 'err');
      }
    },

    // ============================================================
    // CRUD：新建 / 编辑 / 删除
    // ============================================================

    /** 新建任务弹窗 */
    openCreate() {
      if (!X.auth.requireLogin()) return;
      const cur = X.auth.currentUser();
      const form = this.buildForm(null);
      const submit = X.utils.h('button', { class: 'btn primary full', text: t('tasks.create') });
      const cancel = X.utils.h('button', { class: 'btn ghost', text: X.t('common.cancel') });
      let inst;

      const doSubmit = async () => {
        const v = form.getValues();
        if (!v.title) { X.ui.toast(t('tasks.needTitle'), 'err'); form.focus(); return; }
        submit.disabled = true; submit.textContent = '…';
        try {
          const now = new Date().toISOString();
          const row = await X.dbq.insert(TASK_TABLE, {
            title: v.title,
            description: v.description,
            column_key: v.column_key,
            assignee_id: cur.id,     // 新建默认负责人 = 创建者（表单无指派人字段）
            creator_id: cur.id,
            sort_order: Date.now(),  // 用时间戳保证默认排序稳定
            due_date: v.due_date,
            created_at: now,
            updated_at: now
          });
          // 乐观追加（Realtime 也会推送，按 id 去重）
          if (row && !this.loaded.find(x => x.id === row.id)) {
            this.loaded.push(row);
            this.userMap[cur.id] = cur;
            this.renderBoard();
          }
          X.ui.toast(t('tasks.created'), 'ok');
          inst.close();
        } catch (e) {
          X.ui.toast(t('tasks.opFail') + '：' + (e.message || ''), 'err');
        } finally {
          submit.disabled = false; submit.textContent = t('tasks.create');
        }
      };

      submit.addEventListener('click', doSubmit);
      cancel.addEventListener('click', () => inst.close());
      inst = X.ui.modal({ title: t('tasks.new'), body: form.body, footer: [cancel, submit] });
      setTimeout(form.focus, 240);
    },

    /** 编辑任务弹窗（点卡片触发） */
    openEdit(task) {
      const form = this.buildForm(task);
      const submit = X.utils.h('button', { class: 'btn primary', text: X.t('common.save') });
      const del    = X.utils.h('button', { class: 'btn ghost', text: X.t('common.delete') });
      const cancel = X.utils.h('button', { class: 'btn ghost', text: X.t('common.cancel') });
      let inst;

      const doSubmit = async () => {
        const v = form.getValues();
        if (!v.title) { X.ui.toast(t('tasks.needTitle'), 'err'); form.focus(); return; }
        submit.disabled = true; submit.textContent = '…';
        try {
          const patch = {
            title: v.title,
            description: v.description,
            column_key: v.column_key,
            due_date: v.due_date,
            updated_at: new Date().toISOString()
          };
          const rows = await X.dbq.update(TASK_TABLE, patch, { eq: ['id', task.id] });
          const updated = rows[0];
          // 乐观更新（Realtime 也会推送，按 id 去重）
          const idx = this.loaded.findIndex(x => x.id === task.id);
          if (idx >= 0) this.loaded[idx] = Object.assign({}, this.loaded[idx], patch, updated || {});
          this.renderBoard();
          X.ui.toast(t('tasks.updated'), 'ok');
          inst.close();
        } catch (e) {
          X.ui.toast(t('tasks.opFail') + '：' + (e.message || ''), 'err');
        } finally {
          submit.disabled = false; submit.textContent = X.t('common.save');
        }
      };

      submit.addEventListener('click', doSubmit);
      cancel.addEventListener('click', () => inst.close());
      del.addEventListener('click', async () => { inst.close(); await this.deleteTask(task); });
      inst = X.ui.modal({ title: t('tasks.editTitle'), body: form.body, footer: [del, cancel, submit] });
      setTimeout(form.focus, 240);
    },

    /** 删除任务（二次确认） */
    async deleteTask(task) {
      const ok = await X.ui.confirm(t('tasks.delConfirm'));
      if (!ok) return;
      try {
        await X.dbq.remove(TASK_TABLE, { eq: ['id', task.id] });
        this.loaded = this.loaded.filter(x => x.id !== task.id);
        this.renderBoard();
        X.ui.toast(t('tasks.deleted'), 'ok');
      } catch (e) {
        X.ui.toast(t('tasks.opFail') + '：' + (e.message || ''), 'err');
      }
    },

    // ============================================================
    // 表单构建（新建 / 编辑共用）
    // ============================================================

    /** 构建表单 DOM，返回 { body, getValues, focus } */
    buildForm(task) {
      const isEdit = !!task;

      const fTitle = X.utils.h('input', {
        class: 'input', type: 'text', placeholder: t('tasks.fTitle'),
        value: task ? (task.title || '') : ''
      });
      const fDesc = X.utils.h('textarea', {
        class: 'textarea', placeholder: t('tasks.fDesc'), rows: 3
      });
      if (task && task.description) fDesc.value = task.description;

      const fCol = X.utils.h('select', { class: 'input' });
      COLUMNS.forEach(c => {
        const opt = X.utils.h('option', { value: c.key }, [t(c.i18n)]);
        const sel = isEdit ? (task.column_key === c.key) : (c.key === 'todo');
        if (sel) opt.selected = true;
        fCol.appendChild(opt);
      });

      const fDue = X.utils.h('input', { class: 'input', type: 'date' });
      if (task && task.due_date) fDue.value = String(task.due_date).slice(0, 10);

      const body = X.utils.h('div', { class: 'form' });
      body.appendChild(X.utils.h('label', { class: 'field' }, [
        X.utils.h('span', { class: 'label', text: t('tasks.fTitle') }), fTitle
      ]));
      body.appendChild(X.utils.h('label', { class: 'field' }, [
        X.utils.h('span', { class: 'label', text: t('tasks.fDesc') }), fDesc
      ]));
      body.appendChild(X.utils.h('label', { class: 'field' }, [
        X.utils.h('span', { class: 'label', text: t('tasks.fColumn') }), fCol
      ]));
      body.appendChild(X.utils.h('label', { class: 'field' }, [
        X.utils.h('span', { class: 'label', text: t('tasks.fDue') }), fDue
      ]));

      return {
        body,
        getValues: () => ({
          title: fTitle.value.trim(),
          description: fDesc.value.trim(),
          column_key: fCol.value,
          due_date: fDue.value || null
        }),
        focus: () => fTitle.focus()
      };
    },

    // ============================================================
    // Realtime 订阅（INSERT / UPDATE / DELETE）
    // ============================================================

    subscribeRealtime() {
      if (!X.supabaseReady) return;

      // INSERT：新任务入列（去重）
      const chIns = X.realtime.onInsert(TASK_TABLE, null, async payload => {
        const tk = payload.new;
        if (!tk) return;
        if (this.loaded.find(x => x.id === tk.id)) return;
        this.loaded.push(tk);
        // 新任务可能引用未知用户 → 补解析
        if (tk.assignee_id && !this.userMap[tk.assignee_id]) {
          await this.resolveUsers();
        }
        this.renderBoard();
      });

      // UPDATE：更新已有任务（不存在则补上）
      const chUpd = X.realtime.onUpdate(TASK_TABLE, null, payload => {
        const tk = payload.new;
        if (!tk) return;
        const idx = this.loaded.findIndex(x => x.id === tk.id);
        if (idx >= 0) this.loaded[idx] = tk;
        else this.loaded.push(tk);
        this.renderBoard();
      });

      // DELETE：移除任务（payload.old 含 id）
      const chDel = X.realtime.onDelete(TASK_TABLE, null, payload => {
        const old = payload.old;
        const id = old && old.id;
        if (!id) return;
        this.loaded = this.loaded.filter(x => String(x.id) !== String(id));
        this.renderBoard();
      });

      this.subs = [chIns, chUpd, chDel];
    },

    // ============================================================
    // 辅助方法
    // ============================================================

    /** 设置某列的 innerHTML */
    _setColHtml(colKey, html) {
      const body = X.utils.$('#kb_col_' + colKey);
      if (body) body.innerHTML = html;
    },

    /** 三列统一显示错误 */
    _showAllError(msg) {
      COLUMNS.forEach(c => this._setColHtml(c.key,
        '<div class="dim center" style="color:var(--danger,#e44)">' + X.utils.escape(msg) + '</div>'));
    },

    /** 格式化截止日期 → YYYY-MM-DD */
    fmtDue(d) {
      if (!d) return '';
      return String(d).slice(0, 10);
    },

    /** 是否已逾期（截止日当天结束前不算逾期） */
    _isOverdue(d) {
      const t = Date.parse(String(d).slice(0, 10) + 'T23:59:59');
      if (isNaN(t)) return false;
      return t < Date.now();
    }
  };

  // 挂载模块 + 注册路由
  X.modules = X.modules || {};
  X.modules.tasks = tasks;
  X.router.register('tasks', {
    render:       () => tasks.render(),
    afterRender:  () => tasks.afterRender(),
    onLeave:      () => tasks.onLeave(),
    requiresAuth: true
  });
})(window.Xiao = window.Xiao || {});
