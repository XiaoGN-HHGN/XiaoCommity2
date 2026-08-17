// ============================================================================
// Xiao 2.0 · 管理员后台模块
// 子标签：数据看板 / 用户管理 / 作品审核 / 举报处理 / 公告管理 / 勋章管理 / 操作日志 / 代币管理
// 所有奖惩操作必须填写原因 + 写日志（满足"操作原因必填并留存日志"业务规则）
// ============================================================================
(function (X) {
  const admin = {
    tab: 'dashboard',

    // 用户管理本地状态：缓存已加载列表 + 当前过滤条件（搜索词 + 角色筛选）
    _usersList: [],
    _filteredUsers: [],
    _usersFilter: { q: '', role: 'all' },

    render() {
      const tabs = [
        ['dashboard',     '📊 数据看板'],
        ['users',         X.t('admin.users')],
        ['works',         X.t('admin.works')],
        ['reports',       X.t('admin.reports')],
        ['announcements', '📢 公告管理'],
        ['medals',        '🏅 勋章管理'],
        ['logs',          X.t('admin.logs')],
        ['coin',          X.t('admin.coin')]
      ];
      const tabsHtml = tabs.map(([k, l]) =>
        `<button class="tab${k === this.tab ? ' active' : ''}" data-tab="${k}">${l}</button>`
      ).join('');

      return `
        <section class="admin-page">
          <h2>🛡️ ${X.t('admin.title')}</h2>
          <div class="tabs" id="ad_tabs">${tabsHtml}</div>
          <div class="admin-body" id="ad_body"><div class="dim center">${X.t('common.loading')}</div></div>
        </section>
      `;
    },

    async afterRender() {
      const tabs = X.utils.$$('#ad_tabs .tab');
      tabs.forEach(b => b.addEventListener('click', () => {
        tabs.forEach(o => o.classList.remove('active'));
        b.classList.add('active');
        this.tab = b.dataset.tab;
        this.loadTab();
      }));
      await this.loadTab();
    },

    async loadTab() {
      const body = X.utils.$('#ad_body');
      if (!body) return;
      body.innerHTML = `<div class="dim center">${X.t('common.loading')}</div>`;
      try {
        if (this.tab === 'dashboard')          await this.renderDashboard();
        else if (this.tab === 'users')         await this.renderUsers();
        else if (this.tab === 'works')         await this.renderWorks();
        else if (this.tab === 'reports')       await this.renderReports();
        else if (this.tab === 'announcements') await this.renderAnnouncements();
        else if (this.tab === 'medals')        await this.renderMedals();
        else if (this.tab === 'logs')          await this.renderLogs();
        else if (this.tab === 'coin')          await this.renderCoins();
      } catch (e) {
        body.innerHTML = `<div class="dim center err">加载失败：${X.utils.escape(e.message || '')}</div>`;
      }
    },

    // ----------------------------------------------------------------
    // 数据看板（dashboard）
    // 6 个统计卡片 + 最近 7 天注册用户数简易柱状图
    // ----------------------------------------------------------------
    async renderDashboard() {
      const body = X.utils.$('#ad_body');
      const T = X.TABLES;

      // 并发拉取 6 项统计计数
      const [
        totalUsers, totalWorks, pendingWorks,
        totalMessages, totalReports, pendingReports
      ] = await Promise.all([
        X.dbq.count(T.PROFILES),
        X.dbq.count(T.WORKS),
        X.dbq.count(T.WORKS,        { filter: { status: 'pending' } }),
        X.dbq.count(T.MESSAGES),
        X.dbq.count(T.REPORTS),
        X.dbq.count(T.REPORTS,      { filter: { status: 'pending' } })
      ]);

      const stats = [
        { label: '总用户数',   value: totalUsers,    icon: '👥' },
        { label: '总作品数',   value: totalWorks,    icon: '📦' },
        { label: '待审核作品', value: pendingWorks,  icon: '⏳' },
        { label: '总消息数',   value: totalMessages, icon: '💬' },
        { label: '总举报数',   value: totalReports,  icon: '🚩' },
        { label: '待处理举报', value: pendingReports, icon: '⚠️' }
      ];

      // 统计卡片网格（.stat-grid + .stat-card，style.css 已升级；附带 token 内联兜底）
      const grid = X.utils.h('div', {
        class: 'stat-grid',
        style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }
      });
      stats.forEach(s => {
        grid.appendChild(X.utils.h('div', {
          class: 'stat-card',
          style: {
            padding: '14px', borderRadius: '8px',
            border: '1px solid var(--border)', background: 'var(--bg)',
            display: 'flex', flexDirection: 'column', gap: '4px'
          }
        }, [
          X.utils.h('div', { style: { fontSize: '20px' }, text: s.icon }),
          X.utils.h('div', {
            class: 'stat-value', style: { fontSize: '22px', fontWeight: '700', color: 'var(--text)' },
            text: String(s.value)
          }),
          X.utils.h('div', {
            class: 'stat-label', style: { fontSize: '12px', color: 'var(--text-dim)' },
            text: s.label
          })
        ]));
      });

      // 最近 7 天注册用户数：客户端按 created_at 分桶（简化为查询 profiles 后过滤）
      const chartSection = X.utils.h('div', {
        class: 'admin-section',
        style: { marginTop: '20px' }
      }, [X.utils.h('h3', { style: { margin: '0 0 8px' }, text: '📈 最近 7 天注册用户数' })]);

      try {
        const users = await X.store.listUsers({ limit: 500 });
        const days = this._last7Days();
        const buckets = {};
        days.forEach(d => { buckets[d.key] = 0; });
        users.forEach(u => {
          if (!u || !u.created_at) return;
          const day = String(u.created_at).slice(0, 10);
          if (buckets[day] != null) buckets[day]++;
        });
        const max = Math.max(1, ...days.map(d => buckets[d.key]));

        const chart = X.utils.h('div', {
          class: 'bar-chart',
          style: {
            display: 'flex', alignItems: 'flex-end', gap: '10px',
            height: '150px', padding: '8px 4px', overflowX: 'auto'
          }
        });
        days.forEach(d => {
          const count = buckets[d.key];
          const height = Math.round((count / max) * 120);
          chart.appendChild(X.utils.h('div', {
            class: 'bar-col',
            style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '40px' }
          }, [
            X.utils.h('div', {
              class: 'bar',
              style: {
                height: height + 'px', width: '28px',
                background: 'var(--primary)', borderRadius: '4px 4px 0 0',
                minHeight: '2px', transition: 'height .2s'
              },
              title: d.label + '：' + count + ' 人'
            }),
            X.utils.h('div', { style: { fontSize: '11px', color: 'var(--text-dim)' }, text: String(count) }),
            X.utils.h('div', { style: { fontSize: '11px', color: 'var(--text-dim)' }, text: d.label })
          ]));
        });
        chartSection.appendChild(chart);
      } catch (e) {
        chartSection.appendChild(X.utils.h('div', { class: 'dim center', text: '统计加载失败：' + (e.message || '') }));
      }

      body.innerHTML = '';
      body.appendChild(grid);
      body.appendChild(chartSection);
    },

    /** 返回最近 7 天 [{key:'YYYY-MM-DD', label:'MM-DD'}, ...]（含今天，从旧到新） */
    _last7Days() {
      const out = [];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        out.push({ key: `${yyyy}-${mm}-${dd}`, label: `${mm}-${dd}` });
      }
      return out;
    },

    // ----------------------------------------------------------------
    // 用户管理（含搜索 / 角色筛选 / 导出 CSV）
    // ----------------------------------------------------------------
    async renderUsers() {
      const body = X.utils.$('#ad_body');
      this._usersList = await X.store.listUsers({ limit: 500 });

      // 顶部工具条：搜索框 + 角色筛选下拉 + 导出 CSV
      const searchInput = X.utils.h('input', {
        class: 'input', type: 'text', placeholder: '搜索用户名 / 手机 / 实名',
        value: this._usersFilter.q
      });
      searchInput.addEventListener('input', (e) => {
        this._usersFilter.q = e.target.value;
        this._rerenderUserRows();
      });

      const roleSelect = X.utils.h('select', { class: 'input' },
        [['all', '全部角色'], ['user', '普通用户'], ['admin', '管理员'], ['super', '超级管理员']]
          .map(([v, l]) => {
            const opt = X.utils.h('option', { value: v, text: l });
            if (v === this._usersFilter.role) opt.selected = true;
            return opt;
          })
      );
      roleSelect.addEventListener('change', (e) => {
        this._usersFilter.role = e.target.value;
        this._rerenderUserRows();
      });

      const toolbar = X.utils.h('div', {
        class: 'admin-toolbar',
        style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }
      }, [
        searchInput,
        roleSelect,
        X.utils.h('button', {
          class: 'btn ghost sm', text: '⬇ 导出 CSV',
          onclick: () => this.exportUsersCsv()
        })
      ]);

      const listWrap = X.utils.h('div', { class: 'admin-list', id: 'ad_user_rows' });

      body.innerHTML = '';
      body.appendChild(toolbar);
      body.appendChild(listWrap);
      this._rerenderUserRows();
    },

    /** 按当前过滤条件渲染用户行（不重新拉取数据，纯客户端过滤） */
    _rerenderUserRows() {
      const wrap = X.utils.$('#ad_user_rows');
      if (!wrap) return;
      const q = (this._usersFilter.q || '').trim().toLowerCase();
      const role = this._usersFilter.role || 'all';

      const filtered = this._usersList.filter(u => {
        if (role !== 'all' && (u.role || 'user') !== role) return false;
        if (!q) return true;
        const hay = [u.username, u.phone, u.realname_info].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
      this._filteredUsers = filtered;

      wrap.innerHTML = '';
      if (!filtered.length) {
        wrap.appendChild(X.utils.h('div', { class: 'dim center', text: X.t('common.empty') }));
        return;
      }
      filtered.forEach(u => wrap.appendChild(this._buildUserRow(u)));
    },

    /** 构造单个用户行 DOM（保留原有封禁/禁言/管理员操作按钮） */
    _buildUserRow(u) {
      const banned = X.auth.isBanned(u);
      const muted = X.auth.isMuted(u);
      const role = u.role === 'super' ? '👑' : (u.role === 'admin' ? '🛡️' : '');
      const row = X.utils.h('div', { class: 'admin-row' }, [
        X.utils.h('div', { class: 'admin-cell uname' }, [
          X.utils.h('span', { text: u.username || '?' }),
          X.utils.h('span', { class: 'dim', text: ' ' + role })
        ]),
        X.utils.h('div', { class: 'admin-cell', text: '🪙 ' + X.utils.fmtCoin(u.balance) }),
        X.utils.h('div', { class: 'admin-cell', text: u.realname ? '✓ 实名' : '✗' }),
        X.utils.h('div', { class: 'admin-cell', text: banned ? '🔒 已封' : (muted ? '🤐 已禁言' : '正常') }),
        X.utils.h('div', { class: 'admin-cell actions' })
      ]);
      const acts = X.utils.$('.actions', row);
      // 封禁 / 解封
      if (banned) {
        acts.appendChild(X.utils.h('button', { class: 'btn ghost xs', text: X.t('admin.unbanUser'),
          onclick: () => this.unban(u) }));
      } else {
        acts.appendChild(X.utils.h('button', { class: 'btn ghost xs', text: X.t('admin.banTemp'),
          onclick: () => this.banTemp(u) }));
        acts.appendChild(X.utils.h('button', { class: 'btn ghost xs', text: X.t('admin.banPerm'),
          onclick: () => this.banPerm(u) }));
      }
      if (muted) {
        acts.appendChild(X.utils.h('button', { class: 'btn ghost xs', text: X.t('admin.unmuteUser'),
          onclick: () => this.unmute(u) }));
      } else {
        acts.appendChild(X.utils.h('button', { class: 'btn ghost xs', text: X.t('admin.muteUser'),
          onclick: () => this.mute(u) }));
      }
      // 提升/撤销管理员（仅 super 可操作）
      if (X.auth.isSuper() && u.role !== 'super') {
        acts.appendChild(X.utils.h('button', { class: 'btn ghost xs', text: u.role === 'admin' ? X.t('admin.removeAdmin') : X.t('admin.addAdmin'),
          onclick: () => this.toggleAdmin(u) }));
      }
      return row;
    },

    /** 把当前过滤后的用户列表导出为 CSV（Blob + URL.createObjectURL 触发下载） */
    exportUsersCsv() {
      const rows = this._filteredUsers || [];
      if (!rows.length) { X.ui.toast('没有可导出的数据', 'info'); return; }
      const headers = ['username', 'phone', 'balance', 'role', 'realname', 'created_at'];
      const esc = (v) => {
        const s = (v == null ? '' : String(v));
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const lines = [headers.join(',')];
      rows.forEach(u => {
        lines.push([
          u.username || '',
          u.phone || '',
          u.balance != null ? u.balance : '',
          u.role || 'user',
          u.realname ? 'true' : 'false',
          u.created_at || ''
        ].map(esc).join(','));
      });
      // 加 BOM 防止 Excel 打开中文乱码
      const csv = '\ufeff' + lines.join('\n');
      try {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = X.utils.h('a', {
          href: url, download: 'users-' + new Date().toISOString().slice(0, 10) + '.csv'
        });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        X.ui.toast('已导出 ' + rows.length + ' 条用户', 'ok');
      } catch (e) {
        X.ui.toast('导出失败：' + (e.message || ''), 'err');
      }
    },

    async banTemp(u) {
      const hours = await X.ui.prompt({
        title: X.t('admin.banTemp') + ' · ' + u.username,
        label: X.t('admin.banHours'),
        placeholder: '24',
        confirmText: X.t('common.confirm'),
        validate: v => (v && Number(v) > 0) ? null : '请输入小时数'
      });
      if (!hours) return;
      const reason = await this.askReason();
      if (!reason) return;
      const until = new Date(Date.now() + Number(hours) * 3600 * 1000).toISOString();
      await X.store.setBan(u.id, { until });
      await X.store.addLog({ operatorId: X.auth.currentUser().id, action: 'ban', targetUserId: u.id, reason, meta: { until } });
      X.ui.toast(X.t('ok.banSet'), 'ok');
      await this.loadTab();
    },
    async banPerm(u) {
      const reason = await this.askReason('永久封禁 ' + u.username);
      if (!reason) return;
      await X.store.setBan(u.id, { perm: true });
      await X.store.addLog({ operatorId: X.auth.currentUser().id, action: 'ban', targetUserId: u.id, reason, meta: { perm: true } });
      X.ui.toast(X.t('ok.banSet'), 'ok');
      await this.loadTab();
    },
    async unban(u) {
      const reason = await this.askReason('解封 ' + u.username);
      if (!reason) return;
      await X.store.setBan(u.id, null);
      await X.store.addLog({ operatorId: X.auth.currentUser().id, action: 'unban', targetUserId: u.id, reason });
      X.ui.toast(X.t('ok.saved'), 'ok');
      await this.loadTab();
    },
    async mute(u) {
      const reason = await this.askReason('禁言 ' + u.username);
      if (!reason) return;
      await X.store.setMute(u.id, { perm: true });
      await X.store.addLog({ operatorId: X.auth.currentUser().id, action: 'mute', targetUserId: u.id, reason });
      X.ui.toast(X.t('ok.muteSet'), 'ok');
      await this.loadTab();
    },
    async unmute(u) {
      const reason = await this.askReason('解除禁言 ' + u.username);
      if (!reason) return;
      await X.store.setMute(u.id, null);
      await X.store.addLog({ operatorId: X.auth.currentUser().id, action: 'unmute', targetUserId: u.id, reason });
      X.ui.toast(X.t('ok.saved'), 'ok');
      await this.loadTab();
    },
    async toggleAdmin(u) {
      const reason = await this.askReason(u.role === 'admin' ? '撤销管理员 ' + u.username : '提升管理员 ' + u.username);
      if (!reason) return;
      await X.store.setRole(u.id, u.role === 'admin' ? 'user' : 'admin');
      await X.store.addLog({
        operatorId: X.auth.currentUser().id,
        action: u.role === 'admin' ? 'remove_admin' : 'add_admin',
        targetUserId: u.id, reason
      });
      X.ui.toast(X.t('ok.saved'), 'ok');
      await this.loadTab();
    },

    async askReason(label) {
      return X.ui.prompt({
        title: X.t('admin.reason'),
        label: label || X.t('admin.reason'),
        multiline: true,
        confirmText: X.t('common.confirm'),
        validate: v => v ? null : X.t('err.required')
      });
    },

    // ----------------------------------------------------------------
    // 作品审核
    // ----------------------------------------------------------------
    async renderWorks() {
      const body = X.utils.$('#ad_body');
      const list = await X.store.listWorks({ status: 'pending', limit: 200 });
      if (!list.length) { body.innerHTML = `<div class="dim center">${X.t('common.empty')}</div>`; return; }
      body.innerHTML = '';
      list.forEach(w => {
        const row = X.utils.h('div', { class: 'admin-row' }, [
          X.utils.h('div', { class: 'admin-cell uname', text: w.name }),
          X.utils.h('div', { class: 'admin-cell', text: w.category }),
          X.utils.h('div', { class: 'admin-cell', text: X.utils.relTime(w.created_at) }),
          X.utils.h('div', { class: 'admin-cell actions' }, [
            X.utils.h('button', { class: 'btn primary xs', text: X.t('admin.approve'),
              onclick: () => this.approveWork(w) }),
            X.utils.h('button', { class: 'btn ghost xs', text: X.t('admin.reject'),
              onclick: () => this.rejectWork(w) })
          ])
        ]);
        body.appendChild(row);
      });
    },
    async approveWork(w) {
      try {
        await X.store.approveWork(w.id);
        await X.store.addLog({ operatorId: X.auth.currentUser().id, action: 'approve_work', targetId: w.id, reason: '通过' });
        X.ui.toast(X.t('ok.approved'), 'ok');
        await this.loadTab();
      } catch (e) { X.ui.toast('操作失败', 'err'); }
    },
    async rejectWork(w) {
      const reason = await this.askReason();
      if (!reason) return;
      try {
        await X.store.rejectWork(w.id);
        await X.store.addLog({ operatorId: X.auth.currentUser().id, action: 'reject_work', targetId: w.id, reason });
        X.ui.toast(X.t('ok.rejected'), 'ok');
        await this.loadTab();
      } catch (e) { X.ui.toast('操作失败', 'err'); }
    },

    // ----------------------------------------------------------------
    // 举报处理
    // ----------------------------------------------------------------
    async renderReports() {
      const body = X.utils.$('#ad_body');
      const list = await X.store.listReports({ status: 'pending', limit: 200 });
      if (!list.length) { body.innerHTML = `<div class="dim center">${X.t('common.empty')}</div>`; return; }
      body.innerHTML = '';
      list.forEach(r => {
        const row = X.utils.h('div', { class: 'admin-row' }, [
          X.utils.h('div', { class: 'admin-cell uname', text: r.target_type + ' · ' + (r.target_id || '-').slice(0, 8) }),
          X.utils.h('div', { class: 'admin-cell', text: X.utils.relTime(r.created_at) }),
          X.utils.h('div', { class: 'admin-cell', text: X.utils.escape(r.reason || '') }),
          X.utils.h('div', { class: 'admin-cell actions' }, [
            X.utils.h('button', { class: 'btn primary xs', text: X.t('admin.resolve'),
              onclick: () => this.resolveReport(r) })
          ])
        ]);
        body.appendChild(row);
      });
    },
    async resolveReport(r) {
      const action = await X.ui.prompt({
        title: X.t('admin.resolve'),
        label: X.t('admin.action'),
        placeholder: '处理动作（如：警告/删除/封号）',
        confirmText: X.t('common.confirm'),
        validate: v => v ? null : X.t('err.required')
      });
      if (!action) return;
      const note = await X.ui.prompt({
        title: X.t('admin.resolve'),
        label: '处理备注',
        multiline: true, confirmText: X.t('common.confirm')
      });
      try {
        await X.store.resolveReport(r.id, action, note);
        await X.store.addLog({
          operatorId: X.auth.currentUser().id,
          action: 'resolve_report', targetId: r.id,
          reason: action, meta: { note }
        });
        X.ui.toast(X.t('ok.saved'), 'ok');
        await this.loadTab();
      } catch (e) { X.ui.toast('操作失败', 'err'); }
    },

    // ----------------------------------------------------------------
    // 公告管理（announcements）
    // 列表 / 发布 / 编辑 / 删除 / 切换置顶
    // ----------------------------------------------------------------
    async renderAnnouncements() {
      const body = X.utils.$('#ad_body');
      const list = await X.store.listAnnouncements();

      const toolbar = X.utils.h('div', {
        class: 'admin-toolbar',
        style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }
      }, [
        X.utils.h('button', { class: 'btn primary sm', text: '＋ 发布公告',
          onclick: () => this.openAnnouncementEditor() })
      ]);

      const wrap = X.utils.h('div', { class: 'admin-list' });
      if (!list.length) {
        wrap.appendChild(X.utils.h('div', { class: 'dim center', text: X.t('common.empty') }));
      }
      list.forEach(a => {
        const bodyText = a.body || '';
        const summary = bodyText.length > 60 ? bodyText.slice(0, 60) + '…' : bodyText;
        const row = X.utils.h('div', { class: 'admin-row' }, [
          X.utils.h('div', { class: 'admin-cell uname' }, [
            X.utils.h('span', { text: a.pinned ? '📌 ' : '' }),
            X.utils.h('span', { text: a.title || '(无标题)' })
          ]),
          X.utils.h('div', { class: 'admin-cell', text: X.utils.escape(summary) }),
          X.utils.h('div', { class: 'admin-cell', text: X.utils.relTime(a.created_at) }),
          X.utils.h('div', { class: 'admin-cell actions' }, [
            X.utils.h('button', { class: 'btn ghost xs', text: a.pinned ? '取消置顶' : '置顶',
              onclick: () => this.togglePin(a) }),
            X.utils.h('button', { class: 'btn ghost xs', text: '编辑',
              onclick: () => this.openAnnouncementEditor(a) }),
            X.utils.h('button', { class: 'btn ghost xs', text: '删除',
              onclick: () => this.removeAnnouncement(a) })
          ])
        ]);
        wrap.appendChild(row);
      });

      body.innerHTML = '';
      body.appendChild(toolbar);
      body.appendChild(wrap);
    },

    /** 发布 / 编辑公告弹窗：标题 + 多行正文 + 置顶 checkbox */
    openAnnouncementEditor(ann) {
      const isEdit = !!ann;
      const titleInput = X.utils.h('input', {
        class: 'input', type: 'text', placeholder: '公告标题',
        value: (ann && ann.title) || ''
      });
      const bodyInput = X.utils.h('textarea', {
        class: 'textarea', rows: 5, placeholder: '公告正文…'
      });
      if (ann && ann.body) bodyInput.value = ann.body;
      const pinChk = X.utils.h('input', { type: 'checkbox' });
      if (ann && ann.pinned) pinChk.checked = true;

      const form = X.utils.h('div', {
        class: 'form-stack',
        style: { display: 'flex', flexDirection: 'column', gap: '12px' }
      }, [
        X.utils.h('label', { class: 'field' }, [
          X.utils.h('span', { class: 'label', text: '标题' }),
          titleInput
        ]),
        X.utils.h('label', { class: 'field' }, [
          X.utils.h('span', { class: 'label', text: '正文' }),
          bodyInput
        ]),
        X.utils.h('label', {
          class: 'field',
          style: { display: 'flex', alignItems: 'center', gap: '6px' }
        }, [
          pinChk,
          X.utils.h('span', { text: '置顶（显示在公告列表最前）' })
        ])
      ]);

      let inst;
      const ok = X.utils.h('button', { class: 'btn primary', text: isEdit ? '保存' : '发布' });
      const cancel = X.utils.h('button', { class: 'btn ghost', text: X.t('common.cancel') });

      const submit = async () => {
        const title = titleInput.value.trim();
        const bodyText = bodyInput.value.trim();
        if (!title) { X.ui.toast('请填写标题', 'err'); return; }
        const pinned = !!pinChk.checked;
        const cur = X.auth.currentUser();
        try {
          if (isEdit) {
            await X.store.updateAnnouncement(ann.id, { title, body: bodyText, pinned });
            await X.store.addLog({
              operatorId: cur.id, action: 'update_announcement',
              targetId: ann.id, reason: '编辑公告：' + title
            });
          } else {
            const created = await X.store.createAnnouncement({
              authorId: cur.id, title, body: bodyText, pinned
            });
            await X.store.addLog({
              operatorId: cur.id, action: 'create_announcement',
              targetId: created && created.id, reason: '发布公告：' + title
            });
          }
          X.ui.toast(isEdit ? '已保存' : '已发布', 'ok');
          inst.close();
          await this.loadTab();
        } catch (e) {
          X.ui.toast('操作失败：' + (e.message || ''), 'err');
        }
      };
      ok.addEventListener('click', submit);
      cancel.addEventListener('click', () => inst.close());

      inst = X.ui.modal({
        title: isEdit ? '编辑公告' : '发布公告',
        body: form,
        footer: [cancel, ok]
      });
      setTimeout(() => titleInput.focus(), 240);
    },

    /** 切换置顶状态 */
    async togglePin(a) {
      try {
        await X.store.updateAnnouncement(a.id, { pinned: !a.pinned });
        await X.store.addLog({
          operatorId: X.auth.currentUser().id,
          action: 'toggle_pin_announcement', targetId: a.id,
          reason: a.pinned ? '取消置顶：' + (a.title || '') : '置顶：' + (a.title || '')
        });
        X.ui.toast(a.pinned ? '已取消置顶' : '已置顶', 'ok');
        await this.loadTab();
      } catch (e) { X.ui.toast('操作失败：' + (e.message || ''), 'err'); }
    },

    /** 删除公告（先确认） */
    async removeAnnouncement(a) {
      const ok = await X.ui.confirm('确定删除公告「' + (a.title || '') + '」？', '删除公告');
      if (!ok) return;
      try {
        await X.store.deleteAnnouncement(a.id);
        await X.store.addLog({
          operatorId: X.auth.currentUser().id,
          action: 'delete_announcement', targetId: a.id,
          reason: '删除公告：' + (a.title || '')
        });
        X.ui.toast('已删除', 'ok');
        await this.loadTab();
      } catch (e) { X.ui.toast('操作失败：' + (e.message || ''), 'err'); }
    },

    // ----------------------------------------------------------------
    // 勋章管理（medals）
    // 上方：勋章定义卡片；下方：用户列表 + "授勋"按钮
    // ----------------------------------------------------------------
    async renderMedals() {
      const body = X.utils.$('#ad_body');
      const [medals, users] = await Promise.all([
        X.store.listMedals(),
        X.store.listUsers({ limit: 500 })
      ]);

      // 1) 勋章定义区
      const defsSection = X.utils.h('div', { class: 'admin-section', style: { marginBottom: '20px' } }, [
        X.utils.h('h3', { style: { margin: '0 0 8px' }, text: '🏅 勋章定义（' + medals.length + '）' })
      ]);
      const medalGrid = X.utils.h('div', {
        class: 'medal-grid',
        style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }
      });
      if (!medals.length) {
        defsSection.appendChild(X.utils.h('div', { class: 'dim center', text: X.t('common.empty') }));
      } else {
        medals.forEach(m => {
          medalGrid.appendChild(X.utils.h('div', {
            class: 'medal-card',
            title: m.description || '',
            style: {
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 10px', borderRadius: '8px',
              border: '1px solid var(--border)', background: 'var(--bg)'
            }
          }, [
            X.utils.h('span', { style: { fontSize: '22px' }, text: m.icon || '🏅' }),
            X.utils.h('div', {}, [
              X.utils.h('div', { style: { fontWeight: '600' }, text: m.name || m.code }),
              X.utils.h('div', { style: { fontSize: '11px', color: 'var(--text-dim)' }, text: m.code || '' })
            ])
          ]));
        });
      }
      defsSection.appendChild(medalGrid);

      // 2) 用户授勋列表（并发拉取每个用户的已得勋章，限制 50 个避免过载）
      const userSection = X.utils.h('div', { class: 'admin-section' }, [
        X.utils.h('h3', { style: { margin: '0 0 8px' }, text: '👥 用户授勋（' + users.length + '）' })
      ]);
      if (!users.length) {
        userSection.appendChild(X.utils.h('div', { class: 'dim center', text: X.t('common.empty') }));
      } else {
        const slice = users.slice(0, 50);
        const userMedalsArr = await Promise.all(
          slice.map(u => X.store.listUserMedals(u.id).catch(() => []))
        );
        slice.forEach((u, i) => {
          const mine = userMedalsArr[i] || [];
          const myCodes = mine.map(mm => mm.medal_code);
          const myIcons = medals
            .filter(m => myCodes.includes(m.code))
            .map(m => m.icon || '🏅')
            .join(' ');
          const row = X.utils.h('div', { class: 'admin-row' }, [
            X.utils.h('div', { class: 'admin-cell uname', text: u.username || '?' }),
            X.utils.h('div', { class: 'admin-cell', text: myIcons || '—' }),
            X.utils.h('div', { class: 'admin-cell actions' }, [
              X.utils.h('button', { class: 'btn primary xs', text: '🎖 授勋',
                onclick: () => this.openMedalPicker(u, medals) })
            ])
          ]);
          userSection.appendChild(row);
        });
        if (users.length > 50) {
          userSection.appendChild(X.utils.h('div', {
            class: 'dim center',
            style: { marginTop: '8px', fontSize: '12px' },
            text: '仅显示前 50 位用户，可通过搜索定位其他用户。'
          }));
        }
      }

      body.innerHTML = '';
      body.appendChild(defsSection);
      body.appendChild(userSection);
    },

    /** 授勋弹窗：列出所有勋章，点击即授予该用户 */
    openMedalPicker(user, medals) {
      const wrap = X.utils.h('div', {
        class: 'medal-picker',
        style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }
      });
      let inst;

      if (!medals.length) {
        wrap.appendChild(X.utils.h('div', { class: 'dim center', text: '暂无勋章定义' }));
      } else {
        medals.forEach(m => {
          const card = X.utils.h('button', {
            class: 'medal-pick',
            type: 'button',
            title: m.description || '',
            style: {
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
              border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)'
            }
          }, [
            X.utils.h('span', { style: { fontSize: '22px' }, text: m.icon || '🏅' }),
            X.utils.h('div', {}, [
              X.utils.h('div', { style: { fontWeight: '600' }, text: m.name || m.code }),
              X.utils.h('div', { style: { fontSize: '11px', color: 'var(--text-dim)' }, text: m.code || '' })
            ])
          ]);
          card.addEventListener('click', async () => {
            try {
              await X.store.awardMedal(user.id, m.code);
              await X.store.addLog({
                operatorId: X.auth.currentUser().id,
                action: 'award_medal', targetUserId: user.id,
                reason: '授予勋章 ' + (m.name || m.code), meta: { medal_code: m.code }
              });
              X.ui.toast('已授予「' + (m.name || m.code) + '」', 'ok');
              inst.close();
              await this.loadTab();
            } catch (e) {
              X.ui.toast('授予失败：' + (e.message || ''), 'err');
            }
          });
          wrap.appendChild(card);
        });
      }

      const cancel = X.utils.h('button', { class: 'btn ghost', text: X.t('common.cancel'),
        onclick: () => inst.close() });

      inst = X.ui.modal({
        title: '授予勋章 · ' + (user.username || '?'),
        body: wrap,
        footer: [cancel]
      });
    },

    // ----------------------------------------------------------------
    // 操作日志
    // ----------------------------------------------------------------
    async renderLogs() {
      const body = X.utils.$('#ad_body');
      const list = await X.store.listLogs(200);
      if (!list.length) { body.innerHTML = `<div class="dim center">${X.t('common.empty')}</div>`; return; }
      body.innerHTML = '';
      list.forEach(l => {
        const row = X.utils.h('div', { class: 'admin-row' }, [
          X.utils.h('div', { class: 'admin-cell uname', text: l.action }),
          X.utils.h('div', { class: 'admin-cell', text: l.target_user_id ? ('用户 ' + l.target_user_id.slice(0, 8)) : (l.target_id || '-') }),
          X.utils.h('div', { class: 'admin-cell', text: X.utils.escape(l.reason || '') }),
          X.utils.h('div', { class: 'admin-cell', text: X.utils.relTime(l.created_at) })
        ]);
        body.appendChild(row);
      });
    },

    // ----------------------------------------------------------------
    // 代币管理
    // ----------------------------------------------------------------
    async renderCoins() {
      const body = X.utils.$('#ad_body');
      const list = await X.store.listUsers({ limit: 500 });
      if (!list.length) { body.innerHTML = `<div class="dim center">${X.t('common.empty')}</div>`; return; }
      body.innerHTML = '';
      list.forEach(u => {
        const row = X.utils.h('div', { class: 'admin-row' }, [
          X.utils.h('div', { class: 'admin-cell uname', text: u.username }),
          X.utils.h('div', { class: 'admin-cell', text: '🪙 ' + X.utils.fmtCoin(u.balance) }),
          X.utils.h('div', { class: 'admin-cell actions' }, [
            X.utils.h('button', { class: 'btn primary xs', text: '+',
              onclick: () => this.adjustCoin(u, 1) }),
            X.utils.h('button', { class: 'btn ghost xs', text: '-',
              onclick: () => this.adjustCoin(u, -1) }),
            X.utils.h('button', { class: 'btn ghost xs', text: X.t('admin.adjustCoin'),
              onclick: () => this.adjustCoinCustom(u) })
          ])
        ]);
        body.appendChild(row);
      });
    },
    async adjustCoin(u, sign) {
      const amount = await X.ui.prompt({
        title: X.t('admin.adjustCoin') + ' · ' + u.username,
        label: X.t('admin.amount'),
        placeholder: sign > 0 ? '10' : '-5',
        confirmText: X.t('common.confirm'),
        validate: v => (v && Number(v) !== 0) ? null : '请输入金额'
      });
      if (!amount) return;
      const reason = await this.askReason('调整代币 ' + u.username);
      if (!reason) return;
      const delta = sign * Number(amount);
      try {
        await X.store.adjustCoin(u.id, delta);
        await X.store.addLog({
          operatorId: X.auth.currentUser().id,
          action: 'adjust_coin', targetUserId: u.id, reason,
          meta: { delta }
        });
        X.ui.toast(X.t('ok.coinAdjusted'), 'ok');
        await this.loadTab();
      } catch (e) { X.ui.toast('操作失败：' + (e.message || ''), 'err'); }
    },
    async adjustCoinCustom(u) {
      const amount = await X.ui.prompt({
        title: X.t('admin.adjustCoin') + ' · ' + u.username,
        label: X.t('admin.amount') + '（+/-）',
        placeholder: '如 10 或 -5',
        confirmText: X.t('common.confirm'),
        validate: v => (v && Number(v) !== 0) ? null : '请输入金额'
      });
      if (!amount) return;
      const reason = await this.askReason('调整代币 ' + u.username);
      if (!reason) return;
      const delta = Number(amount);
      try {
        await X.store.adjustCoin(u.id, delta);
        await X.store.addLog({
          operatorId: X.auth.currentUser().id,
          action: 'adjust_coin', targetUserId: u.id, reason,
          meta: { delta }
        });
        X.ui.toast(X.t('ok.coinAdjusted'), 'ok');
        await this.loadTab();
      } catch (e) { X.ui.toast('操作失败：' + (e.message || ''), 'err'); }
    }
  };

  X.modules = X.modules || {};
  X.modules.admin = admin;
  X.router.register('admin', {
    requiresAuth: true,
    requiresAdmin: true,
    render: () => admin.render(),
    afterRender: () => admin.afterRender()
  });
})(window.Xiao = window.Xiao || {});
