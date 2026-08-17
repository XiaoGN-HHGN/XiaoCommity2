// ============================================================================
// Xiao 2.0 · 投票模块（polls）
// 职责：
//   1. 列表页：展示所有投票（问题 + 选项 + 票数/进度条 + 状态）
//   2. 新建投票：弹窗输入问题 + 动态选项 + 单选/多选 + 可选过期时间
//   3. 投票：点击选项投票（单选/多选），已投选项标记"已投票"并禁用
//   4. 结果展示：每个选项显示票数 + 百分比进度条
//   5. 关闭投票：作者可关闭，关闭后不可再投
//   6. Realtime：订阅 poll_votes 表 INSERT，实时刷新对应投票结果
// 数据表（v2.1 schema 新增）：
//   polls(id, author_id, question, multiple, closed, expires_at, created_at)
//   poll_options(id, poll_id, text, sort_order)
//   poll_votes(id, poll_id, option_id, user_id, created_at, unique(poll_id, option_id, user_id))
// ============================================================================
(function (X) {
  // v2.1 新增表名（config.js 的 X.TABLES 暂未收录，这里局部声明保持自包含）
  const T_POLLS = 'polls';
  const T_OPTIONS = 'poll_options';
  const T_VOTES = 'poll_votes';

  const polls = {
    loaded: [],   // 当前页投票列表（含组装后的选项/票数/我的投票）
    subs: [],     // Realtime 订阅句柄

    // ----------------------------------------------------------------
    // render：列表页骨架
    // ----------------------------------------------------------------
    render() {
      return `
        <section class="polls-page">
          <div class="polls-head">
            <h2>投票</h2>
            <button class="btn primary sm" id="pl_create">+ 新建投票</button>
          </div>
          <div class="polls-list" id="pl_list">
            <div class="dim center">${X.t('common.loading')}</div>
          </div>
        </section>
      `;
    },

    // ----------------------------------------------------------------
    // afterRender：加载列表 + 绑定新建按钮 + 订阅 Realtime
    // ----------------------------------------------------------------
    async afterRender() {
      if (!X.auth.requireLogin()) return;

      const createBtn = X.utils.$('#pl_create');
      if (createBtn) createBtn.addEventListener('click', () => this.openCreate());

      await this.loadList();

      // Realtime：订阅 poll_votes 表 INSERT，任一投票有新票即刷新对应卡片
      if (X.supabaseReady) {
        const ch = X.realtime.onInsert(T_VOTES, null, payload => {
          const v = payload && payload.new;
          if (v && v.poll_id) this.refreshCard(v.poll_id);
        });
        this.subs.push(ch);
      }
    },

    // ----------------------------------------------------------------
    // onLeave：取消订阅 + 清空状态
    // ----------------------------------------------------------------
    onLeave() {
      this.subs.forEach(s => X.realtime.off(s));
      this.subs = [];
      this.loaded = [];
    },

    // ----------------------------------------------------------------
    // 加载投票列表：投票 + 选项 + 全部票数 + 当前用户的投票
    // ----------------------------------------------------------------
    async loadList() {
      const el = X.utils.$('#pl_list');
      if (!el) return;
      const cur = X.auth.currentUser();
      try {
        // 1. 拉取所有投票（按创建时间倒序）
        const list = await X.dbq.select(T_POLLS, {
          order: ['created_at', { ascending: false }]
        });
        if (!list.length) {
          this.loaded = [];
          el.innerHTML = `<div class="dim center">${X.t('common.empty')}</div>`;
          return;
        }
        const pollIds = list.map(p => p.id);

        // 2. 拉取这些投票的选项（按 sort_order 正序）
        const options = await X.dbq.select(T_OPTIONS, {
          in_filter: ['poll_id', pollIds],
          order: ['sort_order', { ascending: true }]
        });

        // 3. 拉取这些投票的全部投票记录（计算票数 + 参与人数）
        const allVotes = await X.dbq.select(T_VOTES, {
          in_filter: ['poll_id', pollIds]
        });

        // 4. 拉取当前用户在这些投票里的投票记录（标记"已投票"）
        const myVotes = await X.dbq.select(T_VOTES, {
          in_filter: ['poll_id', pollIds],
          filter: { user_id: cur.id }
        });

        // 组装：选项分组 / 票数统计 / 参与人数 / 我的投票
        const optMap = {};
        options.forEach(o => {
          (optMap[o.poll_id] = optMap[o.poll_id] || []).push(o);
        });
        const voteCount = {};    // option_id -> 票数
        const voters = {};       // poll_id -> Set(user_id)
        allVotes.forEach(v => {
          voteCount[v.option_id] = (voteCount[v.option_id] || 0) + 1;
          (voters[v.poll_id] = voters[v.poll_id] || new Set()).add(v.user_id);
        });
        const myVoteMap = {};    // poll_id -> [option_id, ...]
        myVotes.forEach(v => {
          (myVoteMap[v.poll_id] = myVoteMap[v.poll_id] || []).push(v.option_id);
        });

        this.loaded = list.map(p => {
          const opts = optMap[p.id] || [];
          const counts = {};
          opts.forEach(o => { counts[o.id] = voteCount[o.id] || 0; });
          return {
            ...p,
            _options: opts,
            _counts: counts,
            _total: voters[p.id] ? voters[p.id].size : 0,
            _myVotes: myVoteMap[p.id] || []
          };
        });

        this.renderList();
      } catch (e) {
        el.innerHTML = `<div class="dim center err">加载失败</div>`;
      }
    },

    // ----------------------------------------------------------------
    // 渲染列表
    // ----------------------------------------------------------------
    renderList() {
      const el = X.utils.$('#pl_list');
      if (!el) return;
      if (!this.loaded.length) {
        el.innerHTML = `<div class="dim center">${X.t('common.empty')}</div>`;
        return;
      }
      el.innerHTML = '';
      this.loaded.forEach(p => el.appendChild(this._card(p)));
    },

    // ----------------------------------------------------------------
    // 单张投票卡片
    // ----------------------------------------------------------------
    _card(p) {
      const cur = X.auth.currentUser();
      const isAuthor = cur && p.author_id === cur.id;
      // 关闭判定：closed 为真，或已过 expires_at
      const closed = !!p.closed || (p.expires_at && Date.parse(p.expires_at) < Date.now());

      const total = p._total || 0;          // 参与人数（去重）
      const mySet = new Set(p._myVotes || []);

      const card = X.utils.h('div', { class: 'poll-card', dataset: { id: p.id } });

      // 头部：问题 + 状态标签
      card.appendChild(X.utils.h('div', { class: 'poll-card-head' }, [
        X.utils.h('h3', { class: 'poll-q', text: p.question }),
        X.utils.h('span', { class: closed ? 'tag closed' : 'tag open', text: closed ? '已关闭' : '进行中' })
      ]));

      // 选项列表（含票数 + 进度条）
      const optList = X.utils.h('div', { class: 'poll-options' });
      p._options.forEach(o => {
        const count = p._counts[o.id] || 0;
        const pct = total > 0 ? Math.round(count / total * 100) : 0;
        const voted = mySet.has(o.id);
        // 是否可投：未关闭；多选→该选项未投过；单选→本投票尚未投过任何选项
        const canVote = !closed && (p.multiple ? !voted : mySet.size === 0);

        const row = X.utils.h('div', {
          class: 'poll-opt' + (voted ? ' voted' : '') + (canVote ? ' clickable' : '')
        });

        // 标签行：选项文本 + 已投票标记 + 票数/百分比
        const label = X.utils.h('div', { class: 'poll-opt-label' }, [
          X.utils.h('span', { class: 'poll-opt-text', text: o.text }),
          voted ? X.utils.h('span', { class: 'poll-voted-tag', text: '已投票' }) : null,
          X.utils.h('span', { class: 'poll-opt-count', text: count + ' 票 · ' + pct + '%' })
        ]);
        row.appendChild(label);

        // 进度条
        row.appendChild(X.utils.h('div', { class: 'poll-bar' }, [
          X.utils.h('div', { class: 'poll-bar-fill', style: { width: pct + '%' } })
        ]));

        if (canVote) {
          row.addEventListener('click', () => this.vote(p, o));
        }
        optList.appendChild(row);
      });
      card.appendChild(optList);

      // 底部：类型 + 参与人数 + 时间 + 作者操作
      const foot = X.utils.h('div', { class: 'poll-card-foot' }, [
        X.utils.h('span', { class: 'dim',
          text: (p.multiple ? '多选' : '单选') + ' · ' + total + ' 人参与 · ' + X.utils.relTime(p.created_at) })
      ]);
      if (p.expires_at) {
        foot.appendChild(X.utils.h('span', { class: 'dim', text: ' · 截止 ' + X.utils.time(p.expires_at) }));
      }
      if (isAuthor && !closed) {
        foot.appendChild(X.utils.h('button', { class: 'btn ghost xs', text: '关闭投票',
          onclick: () => this.closePoll(p) }));
      }
      card.appendChild(foot);

      return card;
    },

    // ----------------------------------------------------------------
    // 投票：插入一条 poll_votes 记录
    // ----------------------------------------------------------------
    async vote(p, o) {
      const cur = X.auth.currentUser();
      if (!cur) { X.ui.toast(X.t('err.notLoggedIn'), 'err'); return; }
      try {
        await X.dbq.insert(T_VOTES, {
          poll_id: p.id,
          option_id: o.id,
          user_id: cur.id,
          created_at: new Date().toISOString()
        });
        X.ui.toast('投票成功', 'ok');
        await this.refreshCard(p.id);
      } catch (e) {
        const m = (e && e.message) || '';
        // unique(poll_id, option_id, user_id) 冲突 → 该选项已投过
        if (m.indexOf('duplicate') >= 0 || m.indexOf('unique') >= 0) {
          X.ui.toast('已投过该选项', 'err');
          await this.refreshCard(p.id);
        } else {
          X.ui.toast('投票失败：' + m, 'err');
        }
      }
    },

    // ----------------------------------------------------------------
    // 局部刷新单张卡片（投票后 / Realtime 推送 / 关闭后调用）
    // ----------------------------------------------------------------
    async refreshCard(pollId) {
      const idx = this.loaded.findIndex(x => x.id === pollId);
      if (idx < 0) return; // 不在当前列表，忽略
      try {
        const cur = X.auth.currentUser();
        const poll = await X.dbq.select(T_POLLS, { eq: ['id', pollId], single: true });
        if (!poll) {
          // 投票已被删除：从列表移除
          this.loaded.splice(idx, 1);
          this.renderList();
          return;
        }
        const options = await X.dbq.select(T_OPTIONS, {
          eq: ['poll_id', pollId],
          order: ['sort_order', { ascending: true }]
        });
        const allVotes = await X.dbq.select(T_VOTES, { filter: { poll_id: pollId } });

        const counts = {};
        const voters = new Set();
        allVotes.forEach(v => {
          counts[v.option_id] = (counts[v.option_id] || 0) + 1;
          voters.add(v.user_id);
        });
        const myVotes = allVotes.filter(v => v.user_id === cur.id).map(v => v.option_id);

        const assembled = {
          ...poll,
          _options: options,
          _counts: counts,
          _total: voters.size,
          _myVotes: myVotes
        };
        this.loaded[idx] = assembled;

        // 局部替换 DOM，避免整列表闪烁
        const old = X.utils.$('.poll-card[data-id="' + pollId + '"]');
        if (old && old.parentNode) {
          old.parentNode.replaceChild(this._card(assembled), old);
        } else {
          this.renderList();
        }
      } catch (_) {
        // 静默失败，不打断实时体验
      }
    },

    // ----------------------------------------------------------------
    // 关闭投票（仅作者）
    // ----------------------------------------------------------------
    async closePoll(p) {
      const ok = await X.ui.confirm('确定关闭该投票？关闭后无法再投票。');
      if (!ok) return;
      try {
        await X.dbq.update(T_POLLS, { closed: true }, { eq: ['id', p.id] });
        X.ui.toast('已关闭', 'ok');
        await this.refreshCard(p.id);
      } catch (e) {
        X.ui.toast('操作失败', 'err');
      }
    },

    // ----------------------------------------------------------------
    // 新建投票弹窗：问题 + 动态选项 + 单选/多选 + 可选过期时间
    // ----------------------------------------------------------------
    openCreate() {
      const cur = X.auth.currentUser();
      const body = X.utils.h('div', { class: 'form' });

      // 问题
      const fQuestion = X.utils.h('input', { class: 'input', type: 'text', placeholder: '输入投票问题' });
      body.appendChild(X.utils.h('label', { class: 'field' }, [
        X.utils.h('span', { class: 'label', text: '问题' }), fQuestion
      ]));

      // 选项（动态增减，默认 2 个）
      const optWrap = X.utils.h('div', { class: 'poll-options-edit' });
      body.appendChild(X.utils.h('label', { class: 'field' }, [
        X.utils.h('span', { class: 'label', text: '选项（至少 2 个）' }), optWrap
      ]));
      const addOpt = (text = '') => {
        const inp = X.utils.h('input', { class: 'input', type: 'text', placeholder: '选项内容', value: text });
        const rm = X.utils.h('button', { class: 'btn ghost xs', type: 'button', text: '✕' });
        rm.addEventListener('click', () => rm.parentNode.remove());
        optWrap.appendChild(X.utils.h('div', { class: 'poll-opt-row' }, [inp, rm]));
      };
      addOpt(); addOpt();

      const addBtn = X.utils.h('button', { class: 'btn ghost xs', type: 'button', text: '+ 添加选项' });
      addBtn.addEventListener('click', () => addOpt());
      body.appendChild(addBtn);

      // 单选 / 多选
      const fMultiple = X.utils.h('input', { type: 'checkbox' });
      body.appendChild(X.utils.h('label', { class: 'field inline' }, [
        fMultiple, X.utils.h('span', { text: '允许多选' })
      ]));

      // 过期时间（可选）
      const fExpires = X.utils.h('input', { class: 'input', type: 'datetime-local' });
      body.appendChild(X.utils.h('label', { class: 'field' }, [
        X.utils.h('span', { class: 'label', text: '过期时间（可选）' }), fExpires
      ]));

      // 提交 / 取消
      const submit = X.utils.h('button', { class: 'btn primary full', text: X.t('common.submit') });
      const cancel = X.utils.h('button', { class: 'btn ghost', text: X.t('common.cancel') });
      let inst;
      const doSubmit = async () => {
        const question = fQuestion.value.trim();
        if (!question) { X.ui.toast('请输入问题', 'err'); return; }
        const optTexts = X.utils.$$('.input', optWrap)
          .map(i => i.value.trim())
          .filter(Boolean);
        if (optTexts.length < 2) { X.ui.toast('至少需要 2 个选项', 'err'); return; }

        submit.disabled = true;
        submit.textContent = '提交中…';
        try {
          // 1. 插入投票主记录
          const expiresAt = fExpires.value ? new Date(fExpires.value).toISOString() : null;
          const poll = await X.dbq.insert(T_POLLS, {
            author_id: cur.id,
            question,
            multiple: !!fMultiple.checked,
            closed: false,
            expires_at: expiresAt,
            created_at: new Date().toISOString()
          });
          // 2. 批量插入选项（带 sort_order）
          await X.dbq.insertMany(T_OPTIONS, optTexts.map((text, i) => ({
            poll_id: poll.id,
            text,
            sort_order: i
          })));
          X.ui.toast('投票已创建', 'ok');
          inst.close();
          // 刷新列表（新投票会出现在顶部）
          await this.loadList();
        } catch (e) {
          X.ui.toast('创建失败：' + (e.message || ''), 'err');
        } finally {
          submit.disabled = false;
          submit.textContent = X.t('common.submit');
        }
      };
      submit.addEventListener('click', doSubmit);
      cancel.addEventListener('click', () => inst.close());

      inst = X.ui.modal({ title: '新建投票', body, footer: [cancel, submit], size: 'lg' });
    }
  };

  // 注册模块 + 路由
  X.modules = X.modules || {};
  X.modules.polls = polls;
  X.router.register('polls', {
    requiresAuth: true,
    render: () => polls.render(),
    afterRender: () => polls.afterRender(),
    onLeave: () => polls.onLeave()
  });
})(window.Xiao = window.Xiao || {});
