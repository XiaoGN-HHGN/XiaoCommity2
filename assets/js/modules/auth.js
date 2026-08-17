// ============================================================================
// Xiao 2.0 · 登录/注册模块
// 注册：账号名 + 密码 + 二次密码 + 手机号 + 头像（emoji/dataurl）
// 登录：账号名 + 密码 + 记住密码
// ============================================================================
(function (X) {
  const AVATAR_PRESETS = ['🐧', '🐬', '🦊', '❄️', '🌊', '🔬', '🧪', '⚛️', '🛰️', '📊', '🧬', '🌌'];

  const authView = {
    mode: 'login',
    pickedAvatar: '🐧',
    avatarDataUrl: null,
    avatarType: 'emoji',

    render() {
      const isLogin = this.mode === 'login';
      const avatars = AVATAR_PRESETS.map(a =>
        `<button type="button" class="opt${a === this.pickedAvatar ? ' active' : ''}" data-av="${a}">${a}</button>`
      ).join('');
      return `
        <section class="auth-page">
          <div class="auth-card">
            <h2>${isLogin ? X.t('auth.login') : X.t('auth.register')}</h2>
            <label class="field">
              <span class="label">${X.t('auth.username')}</span>
              <input id="${isLogin ? 'lg_un' : 'rg_un'}" class="input" type="text" autocomplete="username" />
            </label>
            <label class="field">
              <span class="label">${X.t('auth.password')}</span>
              <input id="${isLogin ? 'lg_pw' : 'rg_pw'}" class="input" type="password" autocomplete="current-password" />
            </label>
            ${isLogin ? `
              <label class="field inline">
                <input id="lg_remember" type="checkbox" />
                <span>${X.t('auth.remember')}</span>
              </label>
            ` : `
              <label class="field">
                <span class="label">${X.t('auth.confirmPwd')}</span>
                <input id="rg_pw2" class="input" type="password" autocomplete="new-password" />
              </label>
              <label class="field">
                <span class="label">${X.t('auth.phone')}</span>
                <input id="rg_phone" class="input" type="tel" autocomplete="tel" placeholder="6-15 位数字" />
              </label>
              <div class="field">
                <span class="label">${X.t('auth.avatar')}</span>
                <div class="avatar-row">
                  <div class="avatar-preview" id="rg_avprev">${this.pickedAvatar}</div>
                  <div class="avatar-opts" id="rg_avopts">${avatars}</div>
                  <label class="btn ghost sm">
                    ${X.t('auth.uploadAvatar')}
                    <input id="rg_avfile" type="file" accept="image/*" style="display:none" />
                  </label>
                </div>
              </div>
            `}
            <button id="${isLogin ? 'lg_btn' : 'rg_btn'}" class="btn primary lg full">
              ${isLogin ? X.t('auth.login') : X.t('auth.register')}
            </button>
            <p class="auth-switch">
              <a href="#/${isLogin ? 'register' : 'login'}">${isLogin ? X.t('auth.noAccount') : X.t('auth.hasAccount')}</a>
            </p>
          </div>
        </section>
      `;
    },

    afterRender() {
      const isLogin = this.mode === 'login';

      // 预填记住密码
      if (isLogin) {
        try {
          const rem = JSON.parse(localStorage.getItem('xiao.remember') || 'null');
          if (rem && rem.username && rem.password) {
            X.utils.$('#lg_un').value = rem.username;
            X.utils.$('#lg_pw').value = rem.password;
            X.utils.$('#lg_remember').checked = true;
          }
        } catch (_) {}
      }

      // 切换模式链接
      X.utils.$$('.auth-switch a').forEach(a => {
        a.addEventListener('click', e => {
          e.preventDefault();
          this.mode = a.getAttribute('href').slice(2);
          X.router.go(this.mode);
        });
      });

      // 默认头像选择
      X.utils.$$('#rg_avopts .opt').forEach(b => {
        b.addEventListener('click', () => {
          this.pickedAvatar = b.dataset.av;
          this.avatarType = 'emoji';
          this.avatarDataUrl = null;
          X.utils.$('#rg_avprev').textContent = b.dataset.av;
          X.utils.$$('#rg_avopts .opt').forEach(o => o.classList.toggle('active', o === b));
        });
      });

      // 上传头像
      const avf = X.utils.$('#rg_avfile');
      if (avf) avf.addEventListener('change', e => this.uploadAvatar(e));

      // 按钮事件
      const btn = X.utils.$(isLogin ? '#lg_btn' : '#rg_btn');
      if (btn) btn.addEventListener('click', () => isLogin ? this.doLogin() : this.doRegister());

      // Enter 提交
      [isLogin ? '#lg_pw' : '#rg_pw2', isLogin ? '#lg_un' : '#rg_un'].forEach(sel => {
        const el = X.utils.$(sel);
        if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); isLogin ? this.doLogin() : this.doRegister(); } });
      });
    },

    async uploadAvatar(e) {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 1.5 * 1024 * 1024) { X.ui.toast('头像 ≤ 1.5MB', 'err'); return; }
      const url = await X.utils.readDataURL(file);
      this.avatarDataUrl = url;
      this.avatarType = 'dataurl';
      X.utils.$('#rg_avprev').innerHTML = `<img src="${url}" alt="avatar" />`;
      X.utils.$$('#rg_avopts .opt').forEach(b => b.classList.remove('active'));
    },

    async doLogin() {
      const username = X.utils.$('#lg_un').value.trim();
      const password = X.utils.$('#lg_pw').value;
      const remember = X.utils.$('#lg_remember').checked;
      const btn = X.utils.$('#lg_btn');
      if (btn) { btn.disabled = true; btn.textContent = '...'; }
      try {
        const r = await X.auth.login(username, password, remember);
        if (!r.ok) { X.ui.toast(r.msg, 'err'); return; }
        X.ui.toast(X.t('ok.loggedIn'), 'ok');
        X.ui.refresh();
        X.router.go('home');
      } catch (e) {
        X.ui.toast(X.t('err.loginFail'), 'err');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = X.t('auth.login'); }
      }
    },

    async doRegister() {
      const username = X.utils.$('#rg_un').value.trim();
      const password = X.utils.$('#rg_pw').value;
      const confirm = X.utils.$('#rg_pw2').value;
      const phone = X.utils.$('#rg_phone').value.trim();
      const avatar = this.avatarType === 'dataurl' ? this.avatarDataUrl : this.pickedAvatar;
      const btn = X.utils.$('#rg_btn');
      if (btn) { btn.disabled = true; btn.textContent = '...'; }
      try {
        const r = await X.auth.register({ username, password, confirm, phone, avatar, avatarType: this.avatarType });
        if (!r.ok) { X.ui.toast(r.msg, 'err'); return; }
        X.ui.toast(X.t('ok.registered'), 'ok');
        X.ui.refresh();
        X.router.go('home');
      } catch (e) {
        X.ui.toast(X.t('err.registerFail'), 'err');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = X.t('auth.register'); }
      }
    }
  };

  X.modules = X.modules || {};
  X.modules.authView = authView;
  X.router.register('login', {
    render: () => { authView.mode = 'login'; return authView.render(); },
    afterRender: () => authView.afterRender()
  });
  X.router.register('register', {
    render: () => { authView.mode = 'register'; return authView.render(); },
    afterRender: () => authView.afterRender()
  });
})(window.Xiao = window.Xiao || {});
