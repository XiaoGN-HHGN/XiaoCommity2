// ============================================================================
// Xiao 2.0 · 公共聊天大厅模块（v2.1 升级）
// 功能：消息渲染（带作者快照）/ 发送（乐观更新） / Realtime 订阅新消息
//      @用户 / Emoji / 链接自动跳转 / 举报
//      [v2.1 新增] 消息撤回 / 消息编辑 / 回复引用 / 消息置顶
//                  在线状态实时（X.presence） / 加载骨架屏
//                  已删除消息灰显 / 已编辑标记
// ============================================================================
(function (X) {
  const EMOJIS = ['😀','😁','😂','🤣','😊','😍','🤔','👍','👏','🙏','🐧','🐬','🦊','❄️','🌊','🔬','🧪','⚛️','🛰️','📊'];

  const chat = {
    loaded: [],
    sub: null,
    /** presence onChange 取消函数 */
    presenceUnsub: null,
    /** 当前回复目标消息 id（null=不回复） */
    replyTo: null,

    render() {
      return `
        <section class="chat-page">
          <div class="chat-layout">
            <div class="chat-main">
              <div class="pinned-bar" id="ch_pinned_bar"></div>
              <div class="chat-header">
                <h2>${X.t('chat.title')}</h2>
                <span class="chat-stat" id="ch_stat">0 ${X.t('chat.msgs')}</span>
              </div>
              <div class="chat-body" id="ch_body"></div>
              <div class="reply-preview" id="ch_reply_preview" style="display:none"></div>
              <div class="chat-input-bar">
                <button class="btn icon-only" id="ch_emoji" title="${X.t('chat.emoji')}">😀</button>
                <textarea class="chat-input" id="ch_input" placeholder="${X.t('chat.placeholder')}" rows="1"></textarea>
                <button class="btn primary" id="ch_send">${X.t('chat.send')}</button>
              </div>
            </div>
            <aside class="chat-side">
              <h3>${X.t('chat.online')}</h3>
              <div class="online-list" id="ch_online"></div>
            </aside>
          </div>
        </section>
      `;
    },

    async afterRender() {
      // 加载置顶消息条
      this.renderPinned();

      // 加载消息列表（内部会先渲染骨架屏）
      await this.renderMessages();

      // 在线状态：使用 X.presence 实时订阅
      this.renderOnline();
      try {
        const cur = X.auth.currentUser();
        if (cur && X.presence) {
          if (typeof X.presence.init === 'function') X.presence.init();
          if (typeof X.presence.track === 'function') X.presence.track(cur);
          if (typeof X.presence.onChange === 'function') {
            this.presenceUnsub = X.presence.onChange(() => this.renderOnline());
          }
        }
      } catch (e) {
        console.warn('[chat] presence init failed:', e);
      }

      const sendBtn = X.utils.$('#ch_send');
      if (sendBtn) sendBtn.addEventListener('click', () => this.send());
      const input = X.utils.$('#ch_input');
      if (input) {
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
        });
        input.addEventListener('input', e => {
          e.target.style.height = 'auto';
          e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
        });
      }
      const emojiBtn = X.utils.$('#ch_emoji');
      if (emojiBtn) emojiBtn.addEventListener('click', () => this.toggleEmoji());

      // Realtime 订阅新消息（保留原有逻辑）
      if (X.supabaseReady) {
        this.sub = X.realtime.onInsert(X.TABLES.MESSAGES, null, payload => {
          const m = payload.new;
          if (m && !this.loaded.find(x => x.id === m.id)) {
            this.loaded.push(m);
            this.appendMsg(m);
          }
        });
      }
    },

    onLeave() {
      if (this.sub) { X.realtime.off(this.sub); this.sub = null; }
      // 取消 presence 订阅并离线
      if (this.presenceUnsub) {
        try { this.presenceUnsub(); } catch (_) {}
        this.presenceUnsub = null;
      }
      try { if (X.presence && typeof X.presence.untrack === 'function') X.presence.untrack(); } catch (_) {}
      this.replyTo = null;
      this.loaded = [];
    },

    async renderMessages() {
      const body = X.utils.$('#ch_body');
      if (!body) return;
      if (!X.supabaseReady) {
        body.innerHTML = '<div class="dim center" style="padding:20px">⚠ Supabase 未配置</div>';
        return;
      }
      // 先显示骨架屏（若 X.skeleton 可用）
      if (X.skeleton && typeof X.skeleton.chat === 'function') {
        body.innerHTML = X.skeleton.chat();
      }
      try {
        this.loaded = await X.store.getMessages(100);
        const cur = X.auth.currentUser();
        body.innerHTML = '';
        if (this.loaded.length === 0) {
          body.innerHTML = '<div class="dim center" style="padding:20px">' + X.t('chat.empty') + '</div>';
        } else {
          this.loaded.forEach(m => body.appendChild(this.renderMsg(m, cur)));
        }
        body.scrollTop = body.scrollHeight;
        this._updateStat();
      } catch (e) {
        body.innerHTML = '<div class="dim center" style="padding:20px;color:var(--danger)">加载失败：' + X.utils.escape(e.message || '') + '</div>';
      }
    },

    appendMsg(m) {
      const body = X.utils.$('#ch_body');
      if (!body) return;
      const cur = X.auth.currentUser();
      body.appendChild(this.renderMsg(m, cur));
      body.scrollTop = body.scrollHeight;
      this._updateStat();
    },

    _updateStat() {
      const stat = X.utils.$('#ch_stat');
      if (stat) stat.textContent = this.loaded.length + ' ' + X.t('chat.msgs');
    },

    /** 查找消息（用于回复引用渲染、跳转） */
    findMsg(id) {
      return this.loaded.find(x => x.id === id) || null;
    },

    /** 滚动到指定消息并高亮闪烁 */
    jumpToMsg(id) {
      const el = X.utils.$('#msg-' + id);
      if (!el) return;
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
      el.classList.add('msg-highlight');
      setTimeout(() => el.classList.remove('msg-highlight'), 1500);
    },

    /**
     * 渲染单条消息
     * v2.1: 支持已删除/已编辑/回复引用/操作按钮（撤回·编辑·回复·置顶·举报）
     */
    renderMsg(m, cur) {
      const isMe = cur && m.user_id === cur.id;
      const isAdmin = !!(X.auth && typeof X.auth.isAdmin === 'function' && X.auth.isAdmin());
      const avatarType = m.avatar_type || 'emoji';
      const av = m.avatar || '❓';
      const avEl = avatarType === 'dataurl'
        ? X.utils.h('img', { class: 'avatar sm clickable', src: av, alt: m.username || '', onclick: () => this.openUser(m.user_id) })
        : X.utils.h('span', { class: 'avatar sm emoji clickable', onclick: () => this.openUser(m.user_id) }, [av]);

      const meta = X.utils.h('div', { class: 'meta-col' });
      const isDeleted = m.deleted === true;
      const isEdited = !!m.edited_at;
      const nameText = (m.username || '?') + ' · ' + X.utils.relTime(m.created_at) + (isEdited ? ' · （已编辑）' : '');
      const name = X.utils.h('div', { class: 'name' }, [nameText]);
      const bubble = X.utils.h('div', { class: 'bubble' + (isMe ? ' me' : '') });

      // 已撤回：只显示灰色"该消息已撤回"，不显示原文
      if (isDeleted) {
        bubble.classList.add('deleted');
        bubble.textContent = '该消息已撤回';
      } else {
        // 回复引用块（若 reply_to 存在）
        if (m.reply_to) {
          const ref = this.findMsg(m.reply_to);
          const quote = X.utils.h('div', {
            class: 'reply-quote',
            title: ref ? '点击跳转原消息' : '原消息已不可见'
          });
          if (ref) {
            const who = ref.username || '?';
            const preview = (ref.text || '').slice(0, 60);
            quote.appendChild(X.utils.h('span', { class: 'reply-quote-name' }, ['回复 @' + who + '：']));
            quote.appendChild(X.utils.h('span', { class: 'reply-quote-text' }, [preview]));
            quote.addEventListener('click', () => this.jumpToMsg(ref.id));
          } else {
            quote.textContent = '原消息已不可见';
          }
          bubble.appendChild(quote);
        }
        // 正文
        const textEl = X.utils.h('div', { class: 'bubble-text' });
        textEl.innerHTML = this.format(m.text || '');
        bubble.appendChild(textEl);
      }
      meta.appendChild(name);
      meta.appendChild(bubble);

      // 操作按钮组（已撤回消息不显示撤回/编辑/回复/置顶，仅留举报）
      const actions = X.utils.h('div', { class: 'msg-actions' });
      if (!isDeleted) {
        // 回复按钮（所有人可见）
        actions.appendChild(X.utils.h('button', {
          class: 'btn icon-only xs', title: '回复', text: '↩',
          onclick: () => this.startReply(m)
        }));
        // 仅自己的消息：编辑 / 撤回
        if (isMe) {
          actions.appendChild(X.utils.h('button', {
            class: 'btn icon-only xs', title: '编辑', text: '✎',
            onclick: () => this.startEdit(m)
          }));
          actions.appendChild(X.utils.h('button', {
            class: 'btn icon-only xs', title: '撤回', text: '🗑',
            onclick: () => this.confirmDelete(m)
          }));
        }
        // 仅管理员：置顶 / 取消置顶
        if (isAdmin) {
          actions.appendChild(X.utils.h('button', {
            class: 'btn icon-only xs pin-btn', title: '置顶', text: '📌',
            onclick: () => this.togglePin(m)
          }));
        }
      }
      // 举报按钮（保留原有）
      actions.appendChild(X.utils.h('button', {
        class: 'btn icon-only xs report-btn', title: '举报', text: '⚠',
        onclick: () => X.modules.misc.report({
          targetType: 'message', targetId: m.id, targetName: m.username
        })
      }));

      return X.utils.h('div', { class: 'msg' + (isMe ? ' me' : ''), id: 'msg-' + m.id }, [avEl, meta, actions]);
    },

    /** 格式化：转义 → 链接 → @提及 */
    format(text) {
      let s = X.utils.escape(text);
      s = s.replace(X.utils.URL_RE, '<a href="$1" target="_blank" rel="noopener">$1</a>');
      s = s.replace(X.utils.MENTION_RE, (full, name) => `<span class="mention">@${name}</span>`);
      return s;
    },

    // ----------------------------------------------------------------------
    // 回复引用
    // ----------------------------------------------------------------------

    /** 点击回复按钮：设置 replyTo，在输入框顶部显示回复预览条 */
    startReply(m) {
      this.replyTo = m.id;
      const bar = X.utils.$('#ch_reply_preview');
      if (!bar) return;
      bar.style.display = '';
      bar.innerHTML = '';
      const text = (m.text || '').slice(0, 50);
      bar.appendChild(X.utils.h('span', { class: 'reply-preview-label' }, ['回复 @' + (m.username || '?') + '：']));
      bar.appendChild(X.utils.h('span', { class: 'reply-preview-text' }, [text]));
      bar.appendChild(X.utils.h('button', {
        class: 'btn icon-only xs', title: '取消回复', text: '✕',
        onclick: () => this.cancelReply()
      }));
      const input = X.utils.$('#ch_input');
      if (input) input.focus();
    },

    /** 取消回复状态 */
    cancelReply() {
      this.replyTo = null;
      const bar = X.utils.$('#ch_reply_preview');
      if (bar) { bar.innerHTML = ''; bar.style.display = 'none'; }
    },

    // ----------------------------------------------------------------------
    // 消息编辑
    // ----------------------------------------------------------------------

    /** 弹出编辑 modal，保存调用 X.store.editMessage */
    startEdit(m) {
      // 已存在则忽略
      if (X.utils.$('#ch_edit_mask')) return;
      const modal = X.utils.h('div', { class: 'modal-mask', id: 'ch_edit_mask' });
      const box = X.utils.h('div', { class: 'modal-box' });
      box.appendChild(X.utils.h('h3', { class: 'modal-title' }, ['编辑消息']));
      const ta = X.utils.h('textarea', { class: 'chat-input', rows: 3, id: 'ch_edit_ta' });
      ta.value = m.text || '';
      const btnRow = X.utils.h('div', { class: 'modal-actions' });
      const ok = X.utils.h('button', { class: 'btn primary', text: '保存' });
      const cancel = X.utils.h('button', { class: 'btn', text: '取消' });
      btnRow.appendChild(ok);
      btnRow.appendChild(cancel);
      box.appendChild(ta);
      box.appendChild(btnRow);
      modal.appendChild(box);
      document.body.appendChild(modal);
      ta.focus();

      const close = () => modal.remove();
      cancel.addEventListener('click', close);
      modal.addEventListener('click', e => { if (e.target === modal) close(); });
      ok.addEventListener('click', async () => {
        const newText = ta.value.trim();
        if (!newText) { X.ui.toast('内容不能为空', 'err'); return; }
        if (newText === (m.text || '')) { close(); return; }
        ok.disabled = true;
        try {
          const cur = X.auth.currentUser();
          const updated = await X.store.editMessage(m.id, newText, cur.id);
          // 本地替换并重渲染
          const idx = this.loaded.findIndex(x => x.id === m.id);
          if (idx >= 0) {
            const editedAt = (updated && updated.edited_at) ? updated.edited_at : new Date().toISOString();
            this.loaded[idx] = Object.assign({}, this.loaded[idx], {
              text: newText, edited_at: editedAt
            });
            this.rerenderMsg(this.loaded[idx]);
          }
          close();
          X.ui.toast('已编辑', 'ok');
        } catch (e) {
          X.ui.toast('编辑失败：' + (e.message || ''), 'err');
          ok.disabled = false;
        }
      });
    },

    // ----------------------------------------------------------------------
    // 消息撤回（软删）
    // ----------------------------------------------------------------------

    /** 确认撤回：调用 X.store.deleteMessage 并本地刷新 */
    async confirmDelete(m) {
      if (!window.confirm('确定撤回这条消息？')) return;
      try {
        await X.store.deleteMessage(m.id);
        const idx = this.loaded.findIndex(x => x.id === m.id);
        if (idx >= 0) {
          this.loaded[idx] = Object.assign({}, this.loaded[idx], { deleted: true });
          this.rerenderMsg(this.loaded[idx]);
        }
        X.ui.toast('已撤回', 'ok');
      } catch (e) {
        X.ui.toast('撤回失败：' + (e.message || ''), 'err');
      }
    },

    /** 重新渲染单条消息（编辑/撤回后局部刷新） */
    rerenderMsg(m) {
      const old = X.utils.$('#msg-' + m.id);
      if (!old) return;
      const cur = X.auth.currentUser();
      const fresh = this.renderMsg(m, cur);
      if (old.parentNode) old.parentNode.replaceChild(fresh, old);
    },

    // ----------------------------------------------------------------------
    // 消息置顶
    // ----------------------------------------------------------------------

    /** 置顶/取消置顶切换 */
    async togglePin(m) {
      try {
        const pinned = await X.store.listPinnedMessages();
        const exist = (pinned || []).find(p => (p.message_id || p.id) === m.id);
        if (exist) {
          await X.store.unpinMessage(m.id);
          X.ui.toast('已取消置顶', 'ok');
        } else {
          const cur = X.auth.currentUser();
          await X.store.pinMessage(m.id, cur.id);
          X.ui.toast('已置顶', 'ok');
        }
        this.renderPinned();
      } catch (e) {
        X.ui.toast('置顶操作失败：' + (e.message || ''), 'err');
      }
    },

    /** 渲染顶部置顶消息条（含取消置顶按钮，仅管理员可见） */
    async renderPinned() {
      const bar = X.utils.$('#ch_pinned_bar');
      if (!bar) return;
      try {
        const pinned = await X.store.listPinnedMessages();
        bar.innerHTML = '';
        if (!pinned || pinned.length === 0) {
          bar.style.display = 'none';
          return;
        }
        bar.style.display = '';
        const isAdmin = !!(X.auth && typeof X.auth.isAdmin === 'function' && X.auth.isAdmin());
        pinned.forEach(p => {
          const mid = p.message_id || p.id;
          const msg = this.findMsg(mid) || p;
          const text = msg.text || p.text || '(已删除)';
          const who = msg.username || p.username || '?';
          const item = X.utils.h('div', { class: 'pinned-item' });
          item.appendChild(X.utils.h('span', { class: 'pinned-icon' }, ['📌']));
          item.appendChild(X.utils.h('span', { class: 'pinned-text', title: text }, [
            (who + '：' + text).slice(0, 80)
          ]));
          if (isAdmin) {
            item.appendChild(X.utils.h('button', {
              class: 'btn icon-only xs', title: '取消置顶', text: '✕',
              onclick: async () => {
                try {
                  await X.store.unpinMessage(mid);
                  this.renderPinned();
                  X.ui.toast('已取消置顶', 'ok');
                } catch (e) {
                  X.ui.toast('取消置顶失败：' + (e.message || ''), 'err');
                }
              }
            }));
          }
          bar.appendChild(item);
        });
      } catch (_) {
        bar.style.display = 'none';
      }
    },

    // ----------------------------------------------------------------------
    // 发送
    // ----------------------------------------------------------------------

    async send() {
      if (!X.auth.requireLogin()) return;
      const cur = X.auth.currentUser();
      if (X.auth.isMuted(cur)) { X.ui.toast(X.t('chat.muted'), 'err'); return; }
      const input = X.utils.$('#ch_input');
      const text = input.value.trim();
      if (!text) return;
      const btn = X.utils.$('#ch_send');
      if (btn) btn.disabled = true;
      try {
        const payload = {
          userId: cur.id, username: cur.username,
          avatar: cur.avatar, avatarType: cur.avatar_type, text
        };
        // 回复字段
        if (this.replyTo) payload.replyTo = this.replyTo;
        const inserted = await X.store.addMessage(payload);
        // 直接追加（schema 里消息表自带作者快照，渲染零 JOIN）
        if (inserted && !this.loaded.find(x => x.id === inserted.id)) {
          this.loaded.push(inserted);
          this.appendMsg(inserted);
        }
        input.value = '';
        input.style.height = 'auto';
        // 清空回复状态
        this.cancelReply();
      } catch (e) {
        X.ui.toast(X.t('err.sendFail') + '：' + (e.message || ''), 'err');
      } finally {
        if (btn) btn.disabled = false;
        input.focus();
      }
    },

    /** Emoji 面板 */
    toggleEmoji() {
      const old = X.utils.$('#ch_emojipanel');
      if (old) { old.remove(); return; }
      const panel = X.utils.h('div', { class: 'emoji-panel', id: 'ch_emojipanel' });
      EMOJIS.forEach(e => {
        panel.appendChild(X.utils.h('button', {
          type: 'button',
          onclick: () => {
            const inp = X.utils.$('#ch_input');
            inp.value += e; inp.focus();
            panel.remove();
          }
        }, [e]));
      });
      const inputBar = X.utils.$('.chat-input-bar');
      if (inputBar) inputBar.insertBefore(panel, X.utils.$('#ch_input'));
    },

    // ----------------------------------------------------------------------
    // 在线用户列表（v2.1：改用 X.presence 实时，移除 30s 轮询）
    // ----------------------------------------------------------------------

    renderOnline() {
      const el = X.utils.$('#ch_online');
      if (!el) return;
      try {
        if (!X.presence || typeof X.presence.list !== 'function') {
          el.innerHTML = '<div class="dim">在线服务未启用</div>';
          return;
        }
        const list = X.presence.list() || [];
        el.innerHTML = '';
        if (list.length === 0) {
          el.innerHTML = '<div class="dim">暂无在线用户</div>';
          return;
        }
        list.forEach(u => {
          const av = (u.avatar_type === 'dataurl')
            ? X.utils.h('img', { class: 'avatar xs', src: u.avatar })
            : X.utils.h('span', { class: 'avatar xs emoji' }, [u.avatar || '🐧']);
          el.appendChild(X.utils.h('div', {
            class: 'online-item',
            onclick: () => this.openUser(u.id)
          }, [av, X.utils.h('span', { text: u.username || '?' })]));
        });
      } catch (_) {}
    },

    openUser(userId) {
      if (userId) X.router.go('profile', { id: userId });
    }
  };

  X.modules = X.modules || {};
  X.modules.chat = chat;
  X.router.register('chat', {
    render: () => chat.render(),
    afterRender: () => chat.afterRender(),
    onLeave: () => chat.onLeave()
  });
})(window.Xiao = window.Xiao || {});
