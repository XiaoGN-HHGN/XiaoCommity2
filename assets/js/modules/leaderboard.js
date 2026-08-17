// ============================================================================
// Xiao 2.0 · 排行榜模块
// 职责：展示四个榜单，供社区成员查看热门内容与活跃用户
//   1. works_likes  作品点赞榜 —— works.likes desc，取前 50
//                      显示：作品名 / 作者 / 点赞数 / 价格
//   2. creators     创作者榜   —— 聚合 work_likes，按作者收到的总点赞数排序
//                      显示：作者名 / 收到点赞总数
//   3. rich         富豪榜     —— profiles.balance desc，取前 50
//                      显示：用户名 / 余额
//   4. exp          等级榜     —— profiles.exp desc，取前 50（exp 为 v2.1 新增字段）
//                      显示：用户名 / 经验值
//
// 数据读取统一走 X.dbq（按表名 + order + limit），不依赖外部库。
// 路由名 'leaderboard'，无需登录；加载中显示骨架屏（X.skeleton.list 若存在，
// 否则回退到“加载中…”文案），失败时在内容区显示 err 提示。
// ============================================================================
(function (X) {
  const T = X.TABLES;
  const LIMIT = 50;          // 每个榜单最多展示条数
  const AGG_LIMIT = 1000;    // 聚合用全量拉取上限（小社区足够；超出部分不计入）

  const leaderboard = {
    activeTab: 'works_likes',  // 默认展示作品点赞榜
    loading: false,

    // 4 个子标签
    tabs: [
      { key: 'works_likes', label: '作品点赞榜' },
      { key: 'creators',    label: '创作者榜' },
      { key: 'rich',        label: '富豪榜' },
      { key: 'exp',         label: '等级榜' }
    ],

    /** 渲染页面骨架：标题 + 4 个 tab 按钮 + 内容容器 */
    render() {
      const tabsHtml = this.tabs.map(t =>
        `<button class="tab${t.key === this.activeTab ? ' active' : ''}" data-tab="${t.key}">${t.label}</button>`
      ).join('');
      return `
        <section class="leaderboard-page">
          <h2>🏆 排行榜</h2>
          <div class="tabs" id="lb_tabs">${tabsHtml}</div>
          <div class="card">
            <div class="card-body" id="lb_body"><div class="dim center">${X.t('common.loading')}</div></div>
          </div>
        </section>
      `;
    },

    /** 绑定 tab 切换 + 加载默认榜单 */
    async afterRender() {
      X.utils.$$('#lb_tabs .tab').forEach(b =>
        b.addEventListener('click', () => this.switchTab(b.dataset.tab))
      );
      await this.loadTab(this.activeTab);
    },

    /** 离开页面时清理：复位加载态与默认 tab，避免下次进入残留旧状态 */
    onLeave() {
      this.loading = false;
      this.activeTab = 'works_likes';
    },

    /** 切换 tab：更新高亮 + 重新加载数据（加载中忽略重复点击） */
    async switchTab(tab) {
      if (this.loading) return;
      this.activeTab = tab;
      X.utils.$$('#lb_tabs .tab').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === tab)
      );
      await this.loadTab(tab);
    },

    /** 加载某个榜单数据并渲染；统一 try/catch + 骨架屏 */
    async loadTab(tab) {
      const body = X.utils.$('#lb_body');
      if (!body) return;
      this.loading = true;
      this._showLoading(body);
      try {
        if (tab === 'works_likes')   await this._renderWorksLikes(body);
        else if (tab === 'creators') await this._renderCreators(body);
        else if (tab === 'rich')     await this._renderRich(body);
        else if (tab === 'exp')      await this._renderExp(body);
      } catch (e) {
        body.innerHTML = `<div class="dim center err">加载失败：${X.utils.escape((e && e.message) || '')}</div>`;
      } finally {
        this.loading = false;
      }
    },

    // ----------------------------------------------------------------
    // 榜单 1：作品点赞榜 —— works 按 likes desc，取前 50
    // ----------------------------------------------------------------
    async _renderWorksLikes(body) {
      const works = await X.dbq.select(T.WORKS, {
        filter: { status: 'approved' },
        order: ['likes', { ascending: false }],
        limit: LIMIT
      });
      if (!works.length) { body.innerHTML = this._emptyHtml(); return; }

      // 批量解析作者用户名（author_id -> profile）
      const authorIds = [...new Set(works.map(w => w.author_id).filter(Boolean))];
      const userMap = await this._resolveUsers(authorIds);

      body.innerHTML = '';
      works.forEach((w, i) => {
        const author = userMap.get(w.author_id);
        const authorName = (author && author.username) || (w.author_id ? w.author_id.slice(0, 8) : '-');
        const price = Number(w.price) > 0 ? `🪙 ${X.utils.fmtCoin(w.price)}` : X.t('works.free');
        body.appendChild(X.utils.h('div', { class: 'user-row' }, [
          X.utils.h('span', { class: 'lb-rank', text: this._rank(i) }),
          X.utils.h('div', { class: 'uname' }, [
            X.utils.h('div', { text: w.name || '(未命名)' }),
            X.utils.h('div', { class: 'dim', style: { fontSize: '11px' }, text: authorName })
          ]),
          X.utils.h('span', { class: 'price', text: price }),
          X.utils.h('span', { class: 'likes', text: '❤ ' + (w.likes || 0) })
        ]));
      });
    },

    // ----------------------------------------------------------------
    // 榜单 2：创作者榜 —— 聚合 work_likes，按作者收到的总点赞数排序
    // 思路：work_likes 仅存 work_id，需借助 works 表把 work_id 映射到 author_id，
    //       再在前端按 author_id 聚合计数（PostgREST 不支持 GROUP BY）。
    // ----------------------------------------------------------------
    async _renderCreators(body) {
      const [likes, works] = await Promise.all([
        X.dbq.select(T.WORK_LIKES, { columns: 'work_id', limit: AGG_LIMIT }),
        X.dbq.select(T.WORKS, { columns: 'id,author_id', limit: AGG_LIMIT })
      ]);

      // work_id -> author_id
      const workAuthor = new Map();
      works.forEach(w => { if (w.id && w.author_id) workAuthor.set(w.id, w.author_id); });

      // author_id -> 收到点赞数
      const counts = new Map();
      likes.forEach(l => {
        const aid = workAuthor.get(l.work_id);
        if (!aid) return;               // 作品已删除等异常，跳过
        counts.set(aid, (counts.get(aid) || 0) + 1);
      });

      // 排序取前 50
      const ranked = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, LIMIT);

      if (!ranked.length) { body.innerHTML = this._emptyHtml(); return; }

      const userMap = await this._resolveUsers(ranked.map(r => r[0]));

      body.innerHTML = '';
      ranked.forEach(([aid, cnt], i) => {
        const u = userMap.get(aid);
        const name = (u && u.username) || aid.slice(0, 8);
        body.appendChild(X.utils.h('div', { class: 'user-row' }, [
          X.utils.h('span', { class: 'lb-rank', text: this._rank(i) }),
          X.utils.h('div', { class: 'uname' }, [
            X.utils.h('div', { text: name }),
            X.utils.h('div', { class: 'dim', style: { fontSize: '11px' }, text: '收到点赞' })
          ]),
          X.utils.h('span', { class: 'likes', text: '❤ ' + cnt })
        ]));
      });
    },

    // ----------------------------------------------------------------
    // 榜单 3：富豪榜 —— profiles 按 balance desc，取前 50
    // ----------------------------------------------------------------
    async _renderRich(body) {
      const users = await X.dbq.select(T.PROFILES, {
        order: ['balance', { ascending: false }],
        limit: LIMIT
      });
      if (!users.length) { body.innerHTML = this._emptyHtml(); return; }

      body.innerHTML = '';
      users.forEach((u, i) => {
        body.appendChild(X.utils.h('div', { class: 'user-row' }, [
          X.utils.h('span', { class: 'lb-rank', text: this._rank(i) }),
          X.utils.h('div', { class: 'uname' }, [
            X.utils.h('div', { text: u.username || '?' }),
            X.utils.h('div', { class: 'dim', style: { fontSize: '11px' }, text: 'Lv.' + (u.level || 1) })
          ]),
          X.utils.h('span', { class: 'price', text: '🪙 ' + X.utils.fmtCoin(u.balance) })
        ]));
      });
    },

    // ----------------------------------------------------------------
    // 榜单 4：等级榜 —— profiles 按 exp desc，取前 50（exp 为 v2.1 字段）
    // ----------------------------------------------------------------
    async _renderExp(body) {
      const users = await X.dbq.select(T.PROFILES, {
        order: ['exp', { ascending: false }],
        limit: LIMIT
      });
      if (!users.length) { body.innerHTML = this._emptyHtml(); return; }

      body.innerHTML = '';
      users.forEach((u, i) => {
        body.appendChild(X.utils.h('div', { class: 'user-row' }, [
          X.utils.h('span', { class: 'lb-rank', text: this._rank(i) }),
          X.utils.h('div', { class: 'uname' }, [
            X.utils.h('div', { text: u.username || '?' }),
            X.utils.h('div', { class: 'dim', style: { fontSize: '11px' }, text: 'Lv.' + (u.level || 1) })
          ]),
          X.utils.h('span', { class: 'price', text: '✦ ' + (u.exp || 0) })
        ]));
      });
    },

    // ----------------------------------------------------------------
    // 工具：批量解析用户资料 → Map(id -> profile)
    // 失败时返回空 Map，调用方会降级为 id 前 8 位显示，不阻断渲染
    // ----------------------------------------------------------------
    async _resolveUsers(ids) {
      const map = new Map();
      if (!ids || !ids.length) return map;
      try {
        const rows = await X.dbq.select(T.PROFILES, {
          columns: 'id,username,balance,level,exp,avatar,avatar_type',
          in_filter: ['id', ids],
          limit: ids.length
        });
        (rows || []).forEach(u => { if (u && u.id) map.set(u.id, u); });
      } catch (_) {
        // 解析失败时静默降级
      }
      return map;
    },

    // ----------------------------------------------------------------
    // 小工具：排名 / 骨架屏 / 空态
    // ----------------------------------------------------------------
    /** 前三名奖牌，其余为数字 */
    _rank(i) {
      return ['🥇', '🥈', '🥉'][i] || String(i + 1);
    },

    /** 加载态：优先使用骨架屏（X.skeleton.list 若存在），否则回退文案 */
    _showLoading(body) {
      body.innerHTML = '';
      if (X.skeleton && typeof X.skeleton.list === 'function') {
        const sk = X.skeleton.list(10);
        if (typeof sk === 'string') { body.innerHTML = sk; return; }
        if (sk instanceof Node) { body.appendChild(sk); return; }
      }
      body.innerHTML = `<div class="dim center">${X.t('common.loading')}</div>`;
    },

    _emptyHtml() {
      return `<div class="dim center">${X.t('common.empty')}</div>`;
    }
  };

  X.modules = X.modules || {};
  X.modules.leaderboard = leaderboard;
  X.router.register('leaderboard', {
    render: () => leaderboard.render(),
    afterRender: () => leaderboard.afterRender(),
    onLeave: () => leaderboard.onLeave()
  });
})(window.Xiao = window.Xiao || {});
