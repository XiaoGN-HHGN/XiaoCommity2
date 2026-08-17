// ============================================================================
// Xiao 2.0 · 核心层 · UI 工具
// Toast / Modal / 导航渲染 / 用户胶囊 / 确认弹窗 / 输入弹窗
// ============================================================================
(function (X) {
  X.ui = {
    /** Toast 提示 */
    toast(msg, type = 'info', ms = 2400) {
      const root = X.utils.$('#toastRoot');
      if (!root) { console.log('[toast]', msg, type); return; }
      const el = X.utils.h('div', { class: 'toast ' + type }, [
        X.utils.h('span', { class: 'dot' }),
        X.utils.h('span', { text: msg })
      ]);
      root.appendChild(el);
      setTimeout(() => {
        el.classList.add('out');
        setTimeout(() => el.remove(), 260);
      }, ms);
    },

    /** 弹窗：返回控制句柄 { close, modal, bodyEl, footEl } */
    modal({ title = '', body = '', footer = null, onClose, size }) {
      const root = X.utils.$('#modalRoot');
      if (!root) return { close: () => {}, modal: null, bodyEl: null, footEl: null };

      const backdrop = X.utils.h('div', { class: 'modal-backdrop' });
      const modal = X.utils.h('div', { class: 'modal' + (size ? ' modal-' + size : '') });
      modal.innerHTML =
        '<div class="modal-head"><div class="modal-title"></div>' +
        '<button class="modal-close" aria-label="关闭">×</button></div>' +
        '<div class="modal-body"></div>' +
        '<div class="modal-foot" style="display:none"></div>';
      X.utils.$('.modal-title', modal).textContent = title;

      const bodyEl = X.utils.$('.modal-body', modal);
      if (typeof body === 'string') bodyEl.innerHTML = body;
      else if (body instanceof Node) bodyEl.appendChild(body);
      else if (typeof body === 'function') body(bodyEl);

      const footEl = X.utils.$('.modal-foot', modal);
      if (footer) {
        footEl.style.display = '';
        if (typeof footer === 'string') footEl.innerHTML = footer;
        else if (Array.isArray(footer)) footer.forEach(b => footEl.appendChild(b));
      }

      const close = () => {
        try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch (_) {}
        backdrop.classList.remove('show');
        modal.classList.remove('show');
        root.setAttribute('aria-hidden', 'true');
        setTimeout(() => { backdrop.remove(); modal.remove(); }, 240);
        if (typeof onClose === 'function') onClose();
      };
      X.utils.$('.modal-close', modal).addEventListener('click', close);
      backdrop.addEventListener('click', close);
      root.appendChild(backdrop);
      root.appendChild(modal);
      root.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => {
        backdrop.classList.add('show');
        modal.classList.add('show');
      });
      return { close, modal, bodyEl, footEl };
    },

    /** 确认弹窗（Promise<boolean>） */
    confirm(message, title = '') {
      return new Promise(resolve => {
        const ok = X.utils.h('button', { class: 'btn primary' }, [X.t('common.confirm')]);
        const cancel = X.utils.h('button', { class: 'btn ghost' }, [X.t('common.cancel')]);
        let inst;
        ok.addEventListener('click', () => { inst.close(); resolve(true); });
        cancel.addEventListener('click', () => { inst.close(); resolve(false); });
        inst = X.ui.modal({
          title,
          body: X.utils.h('p', { style: { margin: 0 } }, [message]),
          footer: [cancel, ok]
        });
      });
    },

    /** 输入弹窗（带原因必填等） */
    prompt({ title, label, placeholder = '', multiline = false, confirmText, validate, value }) {
      return new Promise(resolve => {
        const input = multiline
          ? X.utils.h('textarea', { class: 'textarea', placeholder, rows: 3 })
          : X.utils.h('input', { class: 'input', placeholder, type: 'text' });
        if (value) input.value = value;

        // 包一层 label，让 a11y 工具能关联
        const wrap = X.utils.h('label', { class: 'field' }, [
          X.utils.h('span', { class: 'label' }, [label || '']),
          input
        ]);
        const err = X.utils.h('div', { class: 'error-text', style: { display: 'none' } });
        wrap.appendChild(err);

        const ok = X.utils.h('button', { class: 'btn primary' }, [confirmText || X.t('common.confirm')]);
        const cancel = X.utils.h('button', { class: 'btn ghost' }, [X.t('common.cancel')]);
        let inst;
        const submit = () => {
          const v = input.value.trim();
          if (typeof validate === 'function') {
            const e = validate(v);
            if (e) { err.textContent = e; err.style.display = 'block'; return; }
          }
          inst.close(); resolve(v);
        };
        ok.addEventListener('click', submit);
        cancel.addEventListener('click', () => { inst.close(); resolve(null); });
        if (multiline) {
          input.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); });
        } else {
          input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
        }
        inst = X.ui.modal({ title, body: wrap, footer: [cancel, ok] });
        setTimeout(() => input.focus(), 240);
      });
    },

    /** 渲染导航栏（纯内存，不查任何接口） */
    renderNav() {
      const nav = X.utils.$('#nav');
      if (!nav) return;
      const lang = X.i18n.engine.getLang();
      const cur = X.auth.currentUser();

      const items = [
        { name: 'home',     icon: '🏠', text: X.t('nav.home') },
        { name: 'chat',     icon: '💬', text: X.t('nav.chat') },
        { name: 'works',    icon: '📦', text: X.t('nav.works') },
        { name: 'editor',   icon: '⚡', text: X.t('nav.editor') },
        { name: 'social',   icon: '👥', text: X.t('nav.social') },
        // v2.1 新增导航
        { name: 'leaderboard',    icon: '🏆', text: X.t('nav.leaderboard') },
        { name: 'tasks',          icon: '📋', text: X.t('nav.tasks') },
        { name: 'polls',          icon: '📊', text: X.t('nav.polls') },
        { name: 'announcements',  icon: '📢', text: X.t('nav.announcements') }
      ];
      // 管理员才显示 admin 入口（普通用户看不到）
      if (X.auth.isAdmin()) {
        items.push({ name: 'admin', icon: '🛡️', text: X.t('nav.admin') });
      }
      // 视频入口（占位）
      items.push({ name: 'video', icon: '🎬', text: X.t('nav.video'), badge: 'DEV' });

      nav.innerHTML = '';
      items.forEach(it => {
        const a = X.utils.h('a', {
          class: 'nav-item',
          href: '#/' + it.name,
          onclick: (e) => { e.preventDefault(); X.router.go(it.name); }
        }, [
          X.utils.h('span', { class: 'icon', text: it.icon }),
          X.utils.h('span', { class: 'text', text: it.text }),
          ...(it.badge ? [X.utils.h('span', { class: 'badge', text: it.badge })] : [])
        ]);
        nav.appendChild(a);
      });
    },

    /** 渲染用户胶囊（只在登录时查 profiles；未登录时只显示登录/注册按钮） */
    renderUserChip() {
      const chip = X.utils.$('#userChip');
      if (!chip) return;
      const cur = X.auth.currentUser();
      chip.innerHTML = '';
      if (!cur) {
        chip.appendChild(X.utils.h('a', {
          class: 'btn ghost sm', href: '#/login', text: X.t('auth.login'),
          onclick: (e) => { e.preventDefault(); X.router.go('login'); }
        }));
        chip.appendChild(X.utils.h('a', {
          class: 'btn primary sm', href: '#/register', text: X.t('auth.register'),
          onclick: (e) => { e.preventDefault(); X.router.go('register'); }
        }));
        // 兑换码按钮（未登录也可点，开启临时管理员）
        chip.appendChild(X.utils.h('button', {
          class: 'btn icon-only', title: X.t('nav.redeem'), text: '✦',
          onclick: () => X.auth.openRedeem()
        }));
        return;
      }
      // 已登录：头像 + 用户名 + 余额 + 退出
      const av = cur.avatar_type === 'dataurl'
        ? X.utils.h('img', { class: 'avatar sm', src: cur.avatar, alt: cur.username })
        : X.utils.h('span', { class: 'avatar sm emoji', text: cur.avatar || '🐧' });
      chip.appendChild(av);
      chip.appendChild(X.utils.h('span', { class: 'uname', text: cur.username }));
      chip.appendChild(X.utils.h('span', { class: 'coin', text: '🪙 ' + X.utils.fmtCoin(cur.balance) }));
      chip.appendChild(X.utils.h('a', {
        class: 'btn ghost sm', href: '#/profile', text: X.t('nav.profile'),
        onclick: (e) => { e.preventDefault(); X.router.go('profile'); }
      }));
      chip.appendChild(X.utils.h('button', {
        class: 'btn ghost sm', text: X.t('auth.logout'),
        onclick: () => X.auth.logout()
      }));
    },

    /** 同时刷新导航 + 用户胶囊 */
    refresh() {
      X.ui.renderNav();
      X.ui.renderUserChip();
    }
  };
})(window.Xiao = window.Xiao || {});
