// ============================================================================
// Xiao 2.0 · 社交模块（私聊 DM + 群组 + 好友 + 拉黑）
// 子路由：social 列表 / dm 私聊 / group 群组
// 全部带 Realtime 订阅，onLeave 统一清理
// ============================================================================
(function (X) {
  const EMOJIS = ['😀','😁','😂','🤣','😊','👍','👏','🙏','🐧','🐬','🦊','❄️','🌊','🔬','🧪','⚛️','🛰️','📊'];
  const URL_RE = X.utils.URL_RE;
  const MENTION_RE = X.utils.MENTION_RE;

  // ----------------------------------------------------------------
  // 主视图：社交中心列表（好友 + 群组 + 申请 + 拉黑）
  // ----------------------------------------------------------------
  const social = {
    subs: [],
    friends: [],
    groups: [],
    reqs: [],
    blocked: [],

    render() {
      return `
        <section class="social-page">
          <h2>${X.t('social.title')}</h2>
          <div class="social-grid">
            <div class="card">
              <div class="card-head">
                <h3>${X.t('social.myFriends')}</h3>
                <button class="btn ghost sm" id="sc_addfriend">+ ${X.t('social.addFriend')}</button>
              </div>
              <div class="card-body" id="sc_friends"><div class="dim center">${X.t('common.loading')}</div></div>
            </div>

            <div class="card">
              <div class="card-head">
                <h3>${X.t('social.friendReq')}</h3>
                <span class="badge" id="sc_reqcount" style="display:none">0</span>
              </div>
              <div class="card-body" id="sc_reqs"><div class="dim center">${X.t('common.loading')}</div></div>
            </div>

            <div class="card">
              <div class="card-head">
                <h3>${X.t('social.myGroups')}</h3>
                <button class="btn primary sm" id="sc_creategroup">${X.t('social.createGroup').replace('{cost}', X.BIZ.GROUP_COST)}</button>
              </div>
              <div class="card-body" id="sc_groups"><div class="dim center">${X.t('common.loading')}</div></div>
            </div>

            <div class="card">
              <div class="card-head"><h3>${X.t('social.blocked')}</h3></div>
              <div class="card-body" id="sc_blocked"><div class="dim center">${X.t('common.loading')}</div></div>
            </div>
          </div>
        </section>
      `;
    },

    async afterRender() {
      await Promise.all([
        this.loadFriends(),
        this.loadReqs(),
        this.loadGroups(),
        this.loadBlocked()
      ]);
      const addBtn = X.utils.$('#sc_addfriend');
      if (addBtn) addBtn.addEventListener('click', () => this.openAddFriend());
      const createBtn = X.utils.$('#sc_creategroup');
      if (createBtn) createBtn.addEventListener('click', () => this.openCreateGroup());

      // Realtime：好友申请 + 群成员变更
      if (X.supabaseReady) {
        const cur = X.auth.currentUser();
        if (cur) {
          this.subs.push(X.realtime.onInsert(
            X.TABLES.FRIEND_REQUESTS,
            `to_id=eq.${cur.id}`,
            () => this.loadReqs()
          ));
        }
      }
    },

    onLeave() {
      this.subs.forEach(s => X.realtime.off(s));
      this.subs = [];
    },

    async loadFriends() {
      const el = X.utils.$('#sc_friends');
      if (!el) return;
      try {
        this.friends = await X.store.listFriends(X.auth.currentUser().id);
        if (!this.friends.length) { el.innerHTML = `<div class="dim center">${X.t('common.empty')}</div>`; return; }
        el.innerHTML = '';
        this.friends.forEach(f => el.appendChild(this._friendRow(f)));
      } catch (e) {
        el.innerHTML = `<div class="dim center err">加载失败</div>`;
      }
    },

    _friendRow(f) {
      const av = f.avatar_type === 'dataurl'
        ? X.utils.h('img', { class: 'avatar sm', src: f.avatar })
        : X.utils.h('span', { class: 'avatar sm emoji' }, [f.avatar || '🐧']);
      const row = X.utils.h('div', { class: 'user-row' }, [
        av,
        X.utils.h('span', { class: 'uname', text: f.username }),
        X.utils.h('div', { class: 'row-actions' }, [
          X.utils.h('button', { class: 'btn ghost xs', text: X.t('social.dm'),
            onclick: () => X.router.go('dm', { to: f.id }) }),
          X.utils.h('button', { class: 'btn ghost xs', text: X.t('social.block'),
            onclick: () => this.block(f.id) }),
          X.utils.h('button', { class: 'btn ghost xs', text: X.t('social.remove'),
            onclick: () => this.removeFriend(f.id, f.username) })
        ])
      ]);
      return row;
    },

    async loadReqs() {
      const el = X.utils.$('#sc_reqs');
      if (!el) return;
      try {
        this.reqs = await X.store.listFriendRequestsTo(X.auth.currentUser().id);
        const badge = X.utils.$('#sc_reqcount');
        if (badge) {
          const pending = this.reqs.filter(r => r.status === 'pending');
          badge.textContent = pending.length;
          badge.style.display = pending.length ? '' : 'none';
        }
        const pending = this.reqs.filter(r => r.status === 'pending');
        if (!pending.length) { el.innerHTML = `<div class="dim center">${X.t('common.empty')}</div>`; return; }
        el.innerHTML = '';
        pending.forEach(r => el.appendChild(this._reqRow(r)));
      } catch (e) {
        el.innerHTML = `<div class="dim center err">加载失败</div>`;
      }
    },

    _reqRow(r) {
      // 申请者信息需要从 profiles 拉，这里简化：直接显示 from_id，按需查
      return X.utils.h('div', { class: 'user-row' }, [
        X.utils.h('span', { class: 'uname', text: '用户 ' + (r.from_id || '').slice(0, 8) }),
        X.utils.h('div', { class: 'row-actions' }, [
          X.utils.h('button', { class: 'btn primary xs', text: X.t('social.accept'),
            onclick: () => this.accept(r) }),
          X.utils.h('button', { class: 'btn ghost xs', text: X.t('social.reject'),
            onclick: () => this.reject(r) })
        ])
      ]);
    },

    async loadGroups() {
      const el = X.utils.$('#sc_groups');
      if (!el) return;
      try {
        this.groups = await X.store.listGroupsByUser(X.auth.currentUser().id);
        if (!this.groups.length) { el.innerHTML = `<div class="dim center">${X.t('common.empty')}</div>`; return; }
        el.innerHTML = '';
        this.groups.forEach(g => el.appendChild(this._groupRow(g)));
      } catch (e) {
        el.innerHTML = `<div class="dim center err">加载失败</div>`;
      }
    },

    _groupRow(g) {
      const roleTag = g.my_role === 'owner' ? '👑' : (g.my_role === 'admin' ? '🛡️' : '');
      const status = g.my_status === 'pending' ? ' (待审核)' : '';
      return X.utils.h('div', { class: 'user-row' }, [
        X.utils.h('span', { class: 'gname', text: (g.name || '群组') + status }),
        X.utils.h('span', { class: 'dim', text: roleTag }),
        X.utils.h('div', { class: 'row-actions' }, [
          X.utils.h('button', { class: 'btn primary xs', text: '进入',
            onclick: () => X.router.go('group', { id: g.id }) })
        ])
      ]);
    },

    async loadBlocked() {
      const el = X.utils.$('#sc_blocked');
      if (!el) return;
      try {
        this.blocked = await X.store.listBlocked(X.auth.currentUser().id);
        if (!this.blocked.length) { el.innerHTML = `<div class="dim center">${X.t('common.empty')}</div>`; return; }
        el.innerHTML = '';
        this.blocked.forEach(b => el.appendChild(X.utils.h('div', { class: 'user-row' }, [
          X.utils.h('span', { class: 'uname', text: b.username }),
          X.utils.h('button', { class: 'btn ghost xs', text: X.t('social.unblock'),
            onclick: () => this.unblock(b.id, b.username) })
        ])));
      } catch (e) {
        el.innerHTML = `<div class="dim center err">加载失败</div>`;
      }
    },

    openAddFriend() {
      // 让用户输入用户名搜索，确认后发好友申请
      X.ui.prompt({
        title: X.t('social.addFriend'),
        label: X.t('auth.username'),
        placeholder: '输入对方账号名',
        confirmText: X.t('common.submit'),
        validate: v => v ? null : X.t('err.required')
      }).then(async name => {
        if (!name) return;
        try {
          const target = await X.store.getProfileByName(name);
          if (!target) { X.ui.toast('用户不存在', 'err'); return; }
          if (target.id === X.auth.currentUser().id) { X.ui.toast('不能加自己', 'err'); return; }
          // 是否已是好友
          const friends = await X.store.listFriends(X.auth.currentUser().id);
          if (friends.find(f => f.id === target.id)) { X.ui.toast(X.t('err.alreadyFriend'), 'err'); return; }
          // 是否已拉黑对方
          if (await X.store.isBlockedBy(target.id, X.auth.currentUser().id)) {
            X.ui.toast('对方已拉黑你', 'err'); return;
          }
          await X.store.requestFriend(X.auth.currentUser().id, target.id);
          X.ui.toast(X.t('ok.sent'), 'ok');
        } catch (e) {
          // unique 冲突 → 已经发过
          const m = (e && e.message) || '';
          if (m.indexOf('duplicate') >= 0 || m.indexOf('unique') >= 0) {
            X.ui.toast('已发过申请', 'err');
          } else {
            X.ui.toast('发送失败：' + m, 'err');
          }
        }
      });
    },

    async accept(r) {
      try {
        await X.store.acceptFriend(r.id, r.from_id, r.to_id);
        X.ui.toast(X.t('ok.friendAdded'), 'ok');
        await this.loadFriends();
        await this.loadReqs();
      } catch (e) { X.ui.toast('接受失败：' + (e.message || ''), 'err'); }
    },
    async reject(r) {
      try {
        await X.store.rejectFriend(r.id);
        X.ui.toast(X.t('ok.deleted'), 'ok');
        await this.loadReqs();
      } catch (e) { X.ui.toast('操作失败', 'err'); }
    },
    async removeFriend(friendId, name) {
      const ok = await X.ui.confirm('删除好友 ' + name + ' ？');
      if (!ok) return;
      try {
        await X.store.removeFriend(X.auth.currentUser().id, friendId);
        X.ui.toast(X.t('ok.deleted'), 'ok');
        await this.loadFriends();
      } catch (e) { X.ui.toast('删除失败', 'err'); }
    },
    async block(userId) {
      const ok = await X.ui.confirm('确定拉黑该用户？');
      if (!ok) return;
      try {
        await X.store.blockUser(X.auth.currentUser().id, userId);
        // 拉黑后自动解除好友
        await X.store.removeFriend(X.auth.currentUser().id, userId);
        X.ui.toast(X.t('ok.blocked'), 'ok');
        await this.loadFriends();
        await this.loadBlocked();
      } catch (e) { X.ui.toast('拉黑失败', 'err'); }
    },
    async unblock(userId, name) {
      const ok = await X.ui.confirm('取消拉黑 ' + name + ' ？');
      if (!ok) return;
      try {
        await X.store.unblockUser(X.auth.currentUser().id, userId);
        X.ui.toast(X.t('ok.unblocked'), 'ok');
        await this.loadBlocked();
      } catch (e) { X.ui.toast('操作失败', 'err'); }
    },

    openCreateGroup() {
      // 校验代币
      const cur = X.auth.currentUser();
      if (Number(cur.balance) < X.BIZ.GROUP_COST) {
        X.ui.toast(X.t('err.coinNotEnough'), 'err');
        return;
      }
      X.ui.prompt({
        title: X.t('social.createGroup').replace('{cost}', X.BIZ.GROUP_COST),
        label: X.t('social.groupName'),
        placeholder: '给群组起个名字',
        confirmText: X.t('common.confirm'),
        validate: v => v ? null : X.t('err.required')
      }).then(async name => {
        if (!name) return;
        try {
          await X.store.createGroup({ ownerId: cur.id, name });
          X.ui.toast(X.t('ok.groupCreated'), 'ok');
          // 刷新用户胶囊上的余额
          X.auth._profile = await X.store.getProfile(cur.id);
          X.ui.refresh();
          await this.loadGroups();
        } catch (e) {
          X.ui.toast('建群失败：' + (e.message || ''), 'err');
        }
      });
    }
  };

  // ----------------------------------------------------------------
  // 私聊视图 dm
  // ----------------------------------------------------------------
  const dm = {
    loaded: [],
    sub: null,
    toUser: null,

    render(params) {
      return `
        <section class="dm-page">
          <div class="dm-head">
            <button class="btn ghost sm" onclick="history.back()">← ${X.t('common.back')}</button>
            <h2 id="dm_title">${X.t('common.loading')}</h2>
          </div>
          <div class="dm-body" id="dm_body"></div>
          <div class="dm-input-bar">
            <textarea class="dm-input" id="dm_input" placeholder="${X.t('chat.placeholder')}" rows="1"></textarea>
            <button class="btn primary" id="dm_send">${X.t('chat.send')}</button>
          </div>
        </section>
      `;
    },

    async afterRender(params) {
      if (!X.auth.requireLogin()) return;
      const cur = X.auth.currentUser();
      const toId = params.to;
      if (!toId) { X.utils.$('#dm_body').innerHTML = '<div class="dim center">参数错误</div>'; return; }
      this.toUser = await X.store.getProfile(toId);
      if (!this.toUser) { X.utils.$('#dm_body').innerHTML = '<div class="dim center">用户不存在</div>'; return; }
      const title = X.utils.$('#dm_title');
      if (title) title.textContent = '与 ' + this.toUser.username + ' 私聊';

      await this.renderMessages();
      const sendBtn = X.utils.$('#dm_send');
      if (sendBtn) sendBtn.addEventListener('click', () => this.send());
      const input = X.utils.$('#dm_input');
      if (input) {
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
        });
        input.addEventListener('input', e => {
          e.target.style.height = 'auto';
          e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
        });
      }

      // Realtime 订阅：对方给我发的消息
      if (X.supabaseReady) {
        const filter = `to_id=eq.${cur.id}`;
        this.sub = X.realtime.onInsert(X.TABLES.DM_MESSAGES, filter, payload => {
          const m = payload.new;
          // 只接收当前对话
          if (m && m.from_id === toId && !this.loaded.find(x => x.id === m.id)) {
            this.loaded.push(m);
            this.appendMsg(m);
          }
        });
      }
    },

    onLeave() {
      if (this.sub) { X.realtime.off(this.sub); this.sub = null; }
      this.loaded = [];
      this.toUser = null;
    },

    async renderMessages() {
      const body = X.utils.$('#dm_body');
      if (!body) return;
      try {
        this.loaded = await X.store.getDM(X.auth.currentUser().id, this.toUser.id);
        const cur = X.auth.currentUser();
        body.innerHTML = '';
        if (!this.loaded.length) {
          body.innerHTML = `<div class="dim center" style="padding:20px">开始私聊吧</div>`;
        } else {
          this.loaded.forEach(m => body.appendChild(this.renderMsg(m, cur)));
        }
        body.scrollTop = body.scrollHeight;
      } catch (e) {
        body.innerHTML = `<div class="dim center err">加载失败</div>`;
      }
    },

    appendMsg(m) {
      const body = X.utils.$('#dm_body');
      if (!body) return;
      body.appendChild(this.renderMsg(m, X.auth.currentUser()));
      body.scrollTop = body.scrollHeight;
    },

    renderMsg(m, cur) {
      const isMe = cur && m.from_id === cur.id;
      const av = X.utils.h('span', { class: 'avatar xs emoji' }, [m.from_avatar || '🐧']);
      const bubble = X.utils.h('div', { class: 'bubble' + (isMe ? ' me' : '') });
      bubble.innerHTML = this.format(m.text || '');
      return X.utils.h('div', { class: 'msg' + (isMe ? ' me' : '') }, [av, bubble]);
    },

    format(text) {
      let s = X.utils.escape(text);
      s = s.replace(URL_RE, '<a href="$1" target="_blank" rel="noopener">$1</a>');
      s = s.replace(MENTION_RE, (full, name) => `<span class="mention">@${name}</span>`);
      return s;
    },

    async send() {
      const cur = X.auth.currentUser();
      if (X.auth.isMuted(cur)) { X.ui.toast(X.t('chat.muted'), 'err'); return; }
      const input = X.utils.$('#dm_input');
      const text = input.value.trim();
      if (!text) return;
      const btn = X.utils.$('#dm_send');
      if (btn) btn.disabled = true;
      try {
        // 乐观更新
        const temp = {
          id: 'tmp_' + Date.now(),
          from_id: cur.id,
          to_id: this.toUser.id,
          from_name: cur.username,
          from_avatar: cur.avatar,
          text,
          created_at: new Date().toISOString()
        };
        this.loaded.push(temp);
        this.appendMsg(temp);
        input.value = '';
        input.style.height = 'auto';

        const inserted = await X.store.addDM({
          fromId: cur.id,
          fromName: cur.username,
          fromAvatar: cur.avatar,
          toId: this.toUser.id,
          text
        });
        // 替换临时消息
        const idx = this.loaded.findIndex(x => x.id === temp.id);
        if (idx >= 0) this.loaded[idx] = inserted || this.loaded[idx];
      } catch (e) {
        X.ui.toast(X.t('err.sendFail') + '：' + (e.message || ''), 'err');
      } finally {
        if (btn) btn.disabled = false;
        input.focus();
      }
    }
  };

  // ----------------------------------------------------------------
  // 群组视图 group
  // ----------------------------------------------------------------
  const group = {
    loaded: [],
    sub: null,
    members: [],
    info: null,

    render(params) {
      return `
        <section class="group-page">
          <div class="group-head">
            <button class="btn ghost sm" onclick="history.back()">← ${X.t('common.back')}</button>
            <h2 id="gp_title">${X.t('common.loading')}</h2>
            <button class="btn ghost sm" id="gp_members">${X.t('social.members')}</button>
          </div>
          <div class="group-body" id="gp_body"></div>
          <div class="group-input-bar">
            <textarea class="group-input" id="gp_input" placeholder="${X.t('chat.placeholder')}" rows="1"></textarea>
            <button class="btn primary" id="gp_send">${X.t('chat.send')}</button>
          </div>
        </section>
      `;
    },

    async afterRender(params) {
      if (!X.auth.requireLogin()) return;
      const id = params.id;
      if (!id) { X.utils.$('#gp_body').innerHTML = '<div class="dim center">参数错误</div>'; return; }
      try {
        this.info = await X.store.getGroup(id);
      } catch (e) {
        X.utils.$('#gp_body').innerHTML = '<div class="dim center">群组不存在</div>';
        return;
      }
      const t = X.utils.$('#gp_title');
      if (t) t.textContent = this.info.name;
      await Promise.all([this.renderMessages(), this.loadMembers()]);
      const sendBtn = X.utils.$('#gp_send');
      if (sendBtn) sendBtn.addEventListener('click', () => this.send());
      const membersBtn = X.utils.$('#gp_members');
      if (membersBtn) membersBtn.addEventListener('click', () => this.openMembers());
      const input = X.utils.$('#gp_input');
      if (input) {
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
        });
        input.addEventListener('input', e => {
          e.target.style.height = 'auto';
          e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
        });
      }

      // Realtime 订阅群消息
      if (X.supabaseReady) {
        this.sub = X.realtime.onInsert(
          X.TABLES.GROUP_MESSAGES,
          `group_id=eq.${id}`,
          payload => {
            const m = payload.new;
            if (m && !this.loaded.find(x => x.id === m.id)) {
              this.loaded.push(m);
              this.appendMsg(m);
            }
          }
        );
      }
    },

    onLeave() {
      if (this.sub) { X.realtime.off(this.sub); this.sub = null; }
      this.loaded = [];
      this.members = [];
      this.info = null;
    },

    async renderMessages() {
      const body = X.utils.$('#gp_body');
      if (!body) return;
      try {
        this.loaded = await X.store.getGroupMessages(this.info.id);
        const cur = X.auth.currentUser();
        body.innerHTML = '';
        if (!this.loaded.length) {
          body.innerHTML = `<div class="dim center" style="padding:20px">群里还没有消息</div>`;
        } else {
          this.loaded.forEach(m => body.appendChild(this.renderMsg(m, cur)));
        }
        body.scrollTop = body.scrollHeight;
      } catch (e) {
        body.innerHTML = `<div class="dim center err">加载失败</div>`;
      }
    },

    appendMsg(m) {
      const body = X.utils.$('#gp_body');
      if (!body) return;
      body.appendChild(this.renderMsg(m, X.auth.currentUser()));
      body.scrollTop = body.scrollHeight;
    },

    renderMsg(m, cur) {
      const isMe = cur && m.user_id === cur.id;
      const av = m.avatar_type === 'dataurl'
        ? X.utils.h('img', { class: 'avatar xs', src: m.avatar })
        : X.utils.h('span', { class: 'avatar xs emoji' }, [m.avatar || '🐧']);
      const bubble = X.utils.h('div', { class: 'bubble' + (isMe ? ' me' : '') });
      bubble.innerHTML = this.format(m.text || '');
      const name = X.utils.h('div', { class: 'name', text: m.username + ' · ' + X.utils.relTime(m.created_at) });
      return X.utils.h('div', { class: 'msg' + (isMe ? ' me' : '') }, [av, X.utils.h('div', { class: 'meta-col' }, [name, bubble])]);
    },

    format(text) {
      let s = X.utils.escape(text);
      s = s.replace(URL_RE, '<a href="$1" target="_blank" rel="noopener">$1</a>');
      s = s.replace(MENTION_RE, (full, name) => `<span class="mention">@${name}</span>`);
      return s;
    },

    async loadMembers() {
      try {
        this.members = await X.store.listMembers(this.info.id);
      } catch (_) { this.members = []; }
    },

    async send() {
      const cur = X.auth.currentUser();
      // 群内禁言检查
      const me = this.members.find(m => m.user_id === cur.id);
      if (me && me.role === 'muted') { X.ui.toast('你已被群内禁言', 'err'); return; }
      if (X.auth.isMuted(cur)) { X.ui.toast(X.t('chat.muted'), 'err'); return; }
      const input = X.utils.$('#gp_input');
      const text = input.value.trim();
      if (!text) return;
      const btn = X.utils.$('#gp_send');
      if (btn) btn.disabled = true;
      try {
        const temp = {
          id: 'tmp_' + Date.now(),
          group_id: this.info.id,
          user_id: cur.id,
          username: cur.username,
          avatar: cur.avatar,
          avatar_type: cur.avatar_type,
          text,
          created_at: new Date().toISOString()
        };
        this.loaded.push(temp);
        this.appendMsg(temp);
        input.value = '';
        input.style.height = 'auto';
        const inserted = await X.store.addGroupMessage({
          groupId: this.info.id,
          userId: cur.id,
          username: cur.username,
          avatar: cur.avatar,
          avatarType: cur.avatar_type,
          text
        });
        const idx = this.loaded.findIndex(x => x.id === temp.id);
        if (idx >= 0) this.loaded[idx] = inserted || this.loaded[idx];
      } catch (e) {
        X.ui.toast(X.t('err.sendFail') + '：' + (e.message || ''), 'err');
      } finally {
        if (btn) btn.disabled = false;
        input.focus();
      }
    },

    openMembers() {
      const cur = X.auth.currentUser();
      const me = this.members.find(m => m.user_id === cur.id);
      const isOwner = me && me.role === 'owner';
      const isAdmin = me && (me.role === 'admin' || me.role === 'owner');
      const body = X.utils.h('div', { class: 'member-list' });
      this.members.forEach(m => {
        const role = m.role === 'owner' ? '👑 群主' : (m.role === 'admin' ? '🛡️ 管理员' : (m.role === 'muted' ? '🤐 禁言' : '成员'));
        const actions = X.utils.h('div', { class: 'row-actions' });
        if (isAdmin && m.user_id !== cur.id) {
          if (isOwner) {
            actions.appendChild(X.utils.h('button', { class: 'btn ghost xs', text: m.role === 'admin' ? '取消管理' : '设为管理',
              onclick: () => this.toggleAdmin(m) }));
          }
          actions.appendChild(X.utils.h('button', { class: 'btn ghost xs', text: m.role === 'muted' ? '解除禁言' : X.t('social.muteInGroup'),
            onclick: () => this.toggleMute(m) }));
          actions.appendChild(X.utils.h('button', { class: 'btn ghost xs', text: X.t('social.kick'),
            onclick: () => this.kick(m) }));
        }
        body.appendChild(X.utils.h('div', { class: 'user-row' }, [
          X.utils.h('span', { class: 'uname', text: '用户 ' + m.user_id.slice(0, 8) }),
          X.utils.h('span', { class: 'dim', text: role }),
          actions
        ]));
      });
      X.ui.modal({ title: X.t('social.members') + ' · ' + this.members.length + '/' + this.info.max_member, body });
    },

    async toggleAdmin(m) {
      try {
        await X.store.setGroupAdmin(this.info.id, m.user_id, m.role !== 'admin');
        await this.loadMembers();
        X.ui.toast('已修改', 'ok');
      } catch (e) { X.ui.toast('操作失败', 'err'); }
    },
    async toggleMute(m) {
      try {
        await X.store.muteInGroup(this.info.id, m.user_id);
        await this.loadMembers();
        X.ui.toast(m.role === 'muted' ? '已解除' : X.t('ok.muted'), 'ok');
      } catch (e) { X.ui.toast('操作失败', 'err'); }
    },
    async kick(m) {
      const ok = await X.ui.confirm('确定踢出该成员？');
      if (!ok) return;
      try {
        await X.store.kickMember(this.info.id, m.user_id);
        await this.loadMembers();
        X.ui.toast(X.t('ok.kicked'), 'ok');
      } catch (e) { X.ui.toast('操作失败', 'err'); }
    }
  };

  X.modules = X.modules || {};
  X.modules.social = social;
  X.modules.dm = dm;
  X.modules.group = group;
  X.router.register('social', {
    render: () => social.render(),
    afterRender: p => social.afterRender(p),
    onLeave: () => social.onLeave()
  });
  X.router.register('dm', {
    requiresAuth: true,
    render: p => dm.render(p),
    afterRender: p => dm.afterRender(p),
    onLeave: () => dm.onLeave()
  });
  X.router.register('group', {
    requiresAuth: true,
    render: p => group.render(p),
    afterRender: p => group.afterRender(p),
    onLeave: () => group.onLeave()
  });
})(window.Xiao = window.Xiao || {});
