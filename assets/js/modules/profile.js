// ============================================================================
// Xiao 2.1 · 个人中心模块
// 查看/修改：头像 / 实名认证 / 等级经验 / 勋章 / 状态 / 简介
// 子标签：我的作品 / 我的好友 / 好友申请 / 我拉黑的 / 我的收藏
// ============================================================================
(function (X) {
  const profile = {
    target: null,

    async render(params) {
      const t = X.t;
      const cur = X.auth.currentUser();
      // 未登录：跳登录页
      if (!cur && !X.auth.isAdmin()) {
        setTimeout(() => X.router.go('login'), 0);
        return '';
      }
      // 有 params.id 则看他人，否则看自己
      const isSelf = !params.id || (cur && params.id === cur.id);
      // 模板先返回，afterRender 时再填充内容
      return `
        <section class="profile-page">
          <div class="profile-head">
            <div class="avatar-lg" id="pf_avatar"><span class="dim">…</span></div>
            <div class="profile-info">
              <h2 id="pf_name">…</h2>
              <p class="dim" id="pf_status"></p>
              <p class="dim" id="pf_bio"></p>
              <div class="profile-meta">
                <span id="pf_role" class="badge"></span>
                <span id="pf_balance"></span>
                <span id="pf_realname"></span>
                <span id="pf_since"></span>
              </div>
              <div class="level-badge" id="pf_level"></div>
              <div class="exp-bar" id="pf_exp"><div class="exp-fill" style="width:0%"></div></div>
            </div>
            <div class="profile-actions" id="pf_actions"></div>
          </div>
          <div class="medal-row" id="pf_medals"></div>
          <div class="profile-tabs">
            <button class="tab active" data-tab="works">${t('profile.myWorks')}</button>
            ${isSelf ? `<button class="tab" data-tab="favorites">我的收藏</button>` : ''}
            ${isSelf ? `<button class="tab" data-tab="friends">${t('profile.myFriends')}</button>` : ''}
            ${isSelf ? `<button class="tab" data-tab="reqs">${t('profile.friendReq')}</button>` : ''}
            ${isSelf ? `<button class="tab" data-tab="blocked">${t('profile.myBlocked')}</button>` : ''}
          </div>
          <div class="profile-body" id="pf_body"><div class="dim center">${t('common.loading')}</div></div>
        </section>
      `;
    },

    async afterRender(params) {
      const cur = X.auth.currentUser();
      if (!cur && !X.auth.isAdmin()) { X.router.go('login'); return; }
      const isSelf = !params.id || (cur && params.id === cur.id);
      const targetId = params.id || (cur && cur.id);

      try {
        this.target = await X.store.getProfile(targetId);
      } catch (e) {
        X.utils.$('#pf_body').innerHTML = '<div class="dim center err">用户不存在</div>';
        return;
      }
      if (!this.target) {
        X.utils.$('#pf_body').innerHTML = '<div class="dim center">用户不存在</div>';
        return;
      }
      this.renderHead(isSelf, cur);
      await this.renderMedals();
      // 默认显示作品
      await this.loadTab('works');

      const tabs = X.utils.$$('.profile-tabs .tab');
      tabs.forEach(b => b.addEventListener('click', () => {
        tabs.forEach(o => o.classList.remove('active'));
        b.classList.add('active');
        this.loadTab(b.dataset.tab);
      }));
    },

    renderHead(isSelf, cur) {
      const t = this.target;
      // 头像
      const avEl = X.utils.$('#pf_avatar');
      if (avEl) {
        avEl.innerHTML = '';
        const av = t.avatar_type === 'dataurl'
          ? X.utils.h('img', { src: t.avatar })
          : X.utils.h('span', { class: 'emoji' }, [t.avatar || '🐧']);
        avEl.appendChild(av);
      }
      X.utils.$('#pf_name').textContent = t.username || '?';
      X.utils.$('#pf_bio').textContent = t.bio || '';
      X.utils.$('#pf_status').textContent = t.status_text ? ('💬 ' + t.status_text) : '';
      X.utils.$('#pf_role').textContent = t.role === 'admin' ? '🛡️ 管理员' : (t.role === 'super' ? '👑 超级管理员' : '用户');
      X.utils.$('#pf_balance').textContent = '🪙 ' + X.utils.fmtCoin(t.balance);
      X.utils.$('#pf_realname').textContent = X.t('profile.realname') + '：' + (t.realname ? X.t('profile.realnameDone') : X.t('profile.realnameNone'));
      X.utils.$('#pf_since').textContent = X.t('profile.memberSince') + '：' + (t.created_at ? X.utils.time(t.created_at) : '');

      // 等级 + 经验条
      this.renderLevel();

      // 操作按钮区
      const acts = X.utils.$('#pf_actions');
      acts.innerHTML = '';
      if (isSelf) {
        acts.appendChild(X.utils.h('button', { class: 'btn ghost sm', text: X.t('profile.editAvatar'),
          onclick: () => this.openEditAvatar() }));
        acts.appendChild(X.utils.h('button', { class: 'btn ghost sm', text: '编辑简介',
          onclick: () => this.openEditBio() }));
        acts.appendChild(X.utils.h('button', { class: 'btn ghost sm', text: '编辑状态',
          onclick: () => this.openEditStatus() }));
        if (!X.auth.isRealname(t)) {
          acts.appendChild(X.utils.h('button', { class: 'btn primary sm', text: X.t('works.realname'),
            onclick: () => this.openRealname() }));
        }
      } else {
        // 他人页：私聊 / 加好友 / 举报
        acts.appendChild(X.utils.h('button', { class: 'btn primary sm', text: X.t('social.dm'),
          onclick: () => X.router.go('dm', { to: t.id }) }));
        acts.appendChild(X.utils.h('button', { class: 'btn ghost sm', text: X.t('social.addFriend'),
          onclick: () => this.addFriend(t) }));
        acts.appendChild(X.utils.h('button', { class: 'btn ghost sm', text: '举报',
          onclick: () => X.modules.misc.report({ targetType: 'user', targetId: t.id, targetName: t.username }) }));
      }
    },

    // 计算等级 + 渲染等级徽章和经验进度条
    renderLevel() {
      const t = this.target;
      const exp = Number(t.exp) || 0;
      const levelEl = X.utils.$('#pf_level');
      const expEl = X.utils.$('#pf_exp');
      if (!levelEl || !expEl) return;

      let levels = [];
      try {
        levels = X.store.listLevels() || [];
      } catch (e) {
        levels = [];
      }
      // 按 min_exp 升序
      levels = levels.slice().sort((a, b) => (a.min_exp || 0) - (b.min_exp || 0));

      // 找出当前可达到的最高等级
      let current = null, next = null;
      for (let i = 0; i < levels.length; i++) {
        if (exp >= (levels[i].min_exp || 0)) {
          current = levels[i];
          next = levels[i + 1] || null;
        }
      }
      // 没配置等级：退化为根据 exp 估算
      if (!current) {
        levelEl.innerHTML = '';
        expEl.querySelector('.exp-fill').style.width = '0%';
        return;
      }

      // 等级徽章：icon 大字体 + title + color 背景
      levelEl.innerHTML = '';
      levelEl.style.background = current.color || '#888';
      levelEl.appendChild(X.utils.h('span', { class: 'level-icon', style: 'font-size:1.6em;line-height:1;' }, [current.icon || '⭐']));
      levelEl.appendChild(X.utils.h('span', { class: 'level-title', text: 'Lv.' + (current.level || '?') + ' ' + (current.title || '') }));

      // 经验进度条
      const fill = expEl.querySelector('.exp-fill');
      if (!next) {
        // 已满级
        fill.style.width = '100%';
        const tip = X.utils.h('span', { class: 'exp-tip dim', text: `${exp} EXP · 已满级` });
        expEl.appendChild(tip);
      } else {
        const span = (next.min_exp || 0) - (current.min_exp || 0);
        const got = exp - (current.min_exp || 0);
        const pct = span > 0 ? Math.max(0, Math.min(100, Math.round(got / span * 100))) : 0;
        fill.style.width = pct + '%';
        const tip = X.utils.h('span', { class: 'exp-tip dim', text: `${got} / ${span} EXP → Lv.${next.level || '?'} ${next.title || ''}` });
        expEl.appendChild(tip);
      }
    },

    // 渲染"我的勋章"区域
    async renderMedals() {
      const wrap = X.utils.$('#pf_medals');
      if (!wrap) return;
      wrap.innerHTML = '';
      try {
        const [defs, owned] = await Promise.all([
          Promise.resolve(X.store.listMedals() || []),
          X.store.listUserMedals(this.target.id)
        ]);
        const ownedCodes = new Set((owned || []).map(o => o.medal_code));
        const got = (defs || []).filter(d => ownedCodes.has(d.code || d.id));
        if (!got.length) {
          wrap.style.display = 'none';
          return;
        }
        wrap.style.display = '';
        const grid = X.utils.h('div', { class: 'medal-grid' });
        got.forEach(m => {
          const item = X.utils.h('div', { class: 'medal-item', title: m.description || m.name,
            style: m.color ? `border-color:${m.color};color:${m.color};` : '' }, [
            X.utils.h('span', { class: 'medal-icon', style: 'font-size:1.8em;line-height:1;' }, [m.icon || '🏅']),
            X.utils.h('span', { class: 'medal-name', text: m.name || m.code })
          ]);
          grid.appendChild(item);
        });
        wrap.appendChild(X.utils.h('span', { class: 'medal-title dim', text: '我的勋章' }));
        wrap.appendChild(grid);
      } catch (e) {
        wrap.style.display = 'none';
      }
    },

    async loadTab(tab) {
      const body = X.utils.$('#pf_body');
      if (!body) return;
      body.innerHTML = `<div class="dim center">${X.t('common.loading')}</div>`;
      try {
        if (tab === 'works') {
          const list = await X.store.listWorksByUser(this.target.id);
          if (!list.length) { body.innerHTML = `<div class="dim center">${X.t('common.empty')}</div>`; return; }
          body.innerHTML = '';
          list.forEach(w => {
            const card = X.utils.h('div', { class: 'work-card' }, [
              X.utils.h('div', { class: 'work-head' }, [
                X.utils.h('span', { class: 'work-name', text: w.name }),
                X.utils.h('span', { class: 'dim', text: w.status === 'pending' ? '⏳' : (w.status === 'rejected' ? '❌' : '✓') })
              ]),
              X.utils.h('div', { class: 'work-meta' }, [
                X.utils.h('span', { class: 'price', text: Number(w.price) > 0 ? `🪙 ${X.utils.fmtCoin(w.price)}` : X.t('works.free') }),
                X.utils.h('span', { class: 'likes', text: '❤ ' + (w.likes || 0) })
              ])
            ]);
            card.addEventListener('click', () => X.modules.works.openDetail(w));
            body.appendChild(card);
          });
        } else if (tab === 'favorites') {
          // 我的收藏：渲染作品卡片网格，点击打开作品详情
          const list = await X.store.listFavorites(this.target.id);
          if (!list || !list.length) { body.innerHTML = `<div class="dim center">${X.t('common.empty')}</div>`; return; }
          body.innerHTML = '';
          list.forEach(w => {
            const card = X.utils.h('div', { class: 'work-card' }, [
              X.utils.h('div', { class: 'work-head' }, [
                X.utils.h('span', { class: 'work-name', text: w.name || '未命名' }),
                X.utils.h('span', { class: 'dim', text: w.status === 'pending' ? '⏳' : (w.status === 'rejected' ? '❌' : '✓') })
              ]),
              X.utils.h('div', { class: 'work-meta' }, [
                X.utils.h('span', { class: 'price', text: Number(w.price) > 0 ? `🪙 ${X.utils.fmtCoin(w.price)}` : X.t('works.free') }),
                X.utils.h('span', { class: 'likes', text: '❤ ' + (w.likes || 0) })
              ])
            ]);
            card.addEventListener('click', () => X.modules.works.openDetail(w));
            body.appendChild(card);
          });
        } else if (tab === 'friends') {
          const list = await X.store.listFriends(this.target.id);
          if (!list.length) { body.innerHTML = `<div class="dim center">${X.t('common.empty')}</div>`; return; }
          body.innerHTML = '';
          list.forEach(f => body.appendChild(X.utils.h('div', { class: 'user-row' }, [
            X.utils.h('span', { class: 'uname', text: f.username })
          ])));
        } else if (tab === 'reqs') {
          const list = await X.store.listFriendRequestsTo(this.target.id);
          const pending = list.filter(r => r.status === 'pending');
          if (!pending.length) { body.innerHTML = `<div class="dim center">${X.t('common.empty')}</div>`; return; }
          body.innerHTML = '';
          pending.forEach(r => body.appendChild(X.utils.h('div', { class: 'user-row' }, [
            X.utils.h('span', { class: 'uname', text: '用户 ' + (r.from_id || '').slice(0, 8) })
          ])));
        } else if (tab === 'blocked') {
          const list = await X.store.listBlocked(this.target.id);
          if (!list.length) { body.innerHTML = `<div class="dim center">${X.t('common.empty')}</div>`; return; }
          body.innerHTML = '';
          list.forEach(b => body.appendChild(X.utils.h('div', { class: 'user-row' }, [
            X.utils.h('span', { class: 'uname', text: b.username })
          ])));
        }
      } catch (e) {
        body.innerHTML = `<div class="dim center err">加载失败</div>`;
      }
    },

    openEditAvatar() {
      const cur = X.auth.currentUser();
      const input = X.utils.h('input', { type: 'file', accept: 'image/*' });
      input.addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 1.5 * 1024 * 1024) { X.ui.toast('头像 ≤ 1.5MB', 'err'); return; }
        try {
          const url = await X.utils.readDataURL(file);
          // 上传到 Storage
          const path = `${cur.id}/avatar_${Date.now()}.jpg`;
          try {
            await X.storage.upload(X.SUPABASE_CONFIG.STORAGE_BUCKET_AVATAR, path, file, { upsert: true });
          } catch (_) {
            // Storage 失败就用 dataurl 直接存 profiles
          }
          await X.store.updateProfile(cur.id, { avatar: url, avatar_type: 'dataurl' });
          X.auth._profile = await X.store.getProfile(cur.id);
          X.ui.toast(X.t('ok.saved'), 'ok');
          X.ui.refresh();
          // 刷新页面
          this.target = X.auth._profile;
          this.renderHead(true, cur);
        } catch (e) {
          X.ui.toast('上传失败', 'err');
        }
      });
      input.click();
    },

    // 编辑个人简介 bio（多行文本）
    async openEditBio() {
      const cur = X.auth.currentUser();
      const text = await X.ui.prompt({
        title: '编辑简介',
        label: '个人简介（支持多行）',
        placeholder: '说点什么吧…',
        value: this.target.bio || '',
        multiline: true,
        confirmText: X.t('common.confirm'),
        validate: v => (v && v.length > 200) ? '简介过长（≤ 200 字）' : null
      });
      if (text === null) return;
      try {
        await X.store.updateProfile(cur.id, { bio: text || '' });
        X.auth._profile = await X.store.getProfile(cur.id);
        this.target = X.auth._profile;
        X.utils.$('#pf_bio').textContent = text || '';
        X.ui.toast(X.t('ok.saved'), 'ok');
      } catch (e) {
        X.ui.toast('保存失败', 'err');
      }
    },

    // 编辑状态文本 status_text（单行）
    async openEditStatus() {
      const cur = X.auth.currentUser();
      const text = await X.ui.prompt({
        title: '编辑状态',
        label: '状态（单行，≤ 50 字）',
        placeholder: '今天心情如何？',
        value: this.target.status_text || '',
        confirmText: X.t('common.confirm'),
        validate: v => (v && v.length > 50) ? '状态过长（≤ 50 字）' : null
      });
      if (text === null) return;
      try {
        await X.store.updateProfile(cur.id, { status_text: text || '' });
        X.auth._profile = await X.store.getProfile(cur.id);
        this.target = X.auth._profile;
        X.utils.$('#pf_status').textContent = text ? ('💬 ' + text) : '';
        X.ui.toast(X.t('ok.saved'), 'ok');
      } catch (e) {
        X.ui.toast('保存失败', 'err');
      }
    },

    async openRealname() {
      const name = await X.ui.prompt({
        title: X.t('works.realname'),
        label: '真实姓名',
        placeholder: '真实姓名',
        confirmText: X.t('common.confirm'),
        validate: v => v ? null : X.t('err.required')
      });
      if (!name) return;
      const id = await X.ui.prompt({
        title: X.t('works.realname'),
        label: '证件号',
        placeholder: '证件号',
        confirmText: X.t('common.confirm'),
        validate: v => v ? null : X.t('err.required')
      });
      if (!id) return;
      try {
        // hash 后存储，避免明文
        const info = btoa(unescape(encodeURIComponent(`${name}:${id}`))).slice(0, 64);
        await X.store.setRealname(X.auth.currentUser().id, info);
        X.auth._profile = await X.store.getProfile(X.auth.currentUser().id);
        X.ui.toast(X.t('ok.saved'), 'ok');
        this.target = X.auth._profile;
        this.renderHead(true, X.auth._profile);
      } catch (e) { X.ui.toast('操作失败', 'err'); }
    },

    async addFriend(target) {
      const cur = X.auth.currentUser();
      try {
        // 检查是否已拉黑
        if (await X.store.isBlockedBy(target.id, cur.id)) {
          X.ui.toast('对方已拉黑你', 'err'); return;
        }
        await X.store.requestFriend(cur.id, target.id);
        X.ui.toast(X.t('ok.sent'), 'ok');
      } catch (e) {
        const m = (e && e.message) || '';
        if (m.indexOf('duplicate') >= 0 || m.indexOf('unique') >= 0) {
          X.ui.toast('已发过申请', 'err');
        } else {
          X.ui.toast('发送失败', 'err');
        }
      }
    }
  };

  X.modules = X.modules || {};
  X.modules.profile = profile;
  X.router.register('profile', {
    requiresAuth: true,
    render: p => profile.render(p),
    afterRender: p => profile.afterRender(p)
  });
})(window.Xiao = window.Xiao || {});
