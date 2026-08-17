// ============================================================================
// Xiao 2.0 · 认证 & 权限（Supabase Auth）
// 职责：
//   1. 注册/登录/退出/恢复会话（Supabase Auth，账号名合成 hex 邮箱）
//   2. currentUser() 返回同步缓存 _profile（由 restoreSession/register/login 刷新）
//   3. isAdmin() / isBanned() / isMuted() 权限/状态判断
//   4. requireLogin() / requireAdmin() 路由守卫
//   5. 兑换码 867899gnhh → 临时管理员（localStorage 标记，仅当前浏览器）
// ============================================================================

(function (X) {
  const REDEEM_CODE = X.BIZ.REDEEM_CODE;
  const SESSION_TEMP_ADMIN = 'xiao.tempAdmin';
  const REMEMBER_KEY = 'xiao.remember';

  /**
   * 用户名 → 稳定 ASCII 邮箱
   * 方案：username → UTF-8 bytes → hex → `u_<hex>@<domain>`
   * 同一个用户名恒等映射，注册/登录对得上；local-part 只含 [0-9a-f_]，绝对 RFC 5322 合规
   */
  function _encodeUsername(u) {
    if (!u) return 'empty';
    const s = String(u).trim();
    const bytes = new TextEncoder().encode(s);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    let out = 'u_' + hex;
    if (out.length > 62) {
      let h = 5381;
      for (let i = 0; i < out.length; i++) h = ((h << 5) + h + out.charCodeAt(i)) | 0;
      out = 'u_' + Math.abs(h).toString(16) + '_' + hex.slice(0, 50);
      if (out.length > 62) out = out.slice(0, 62);
    }
    return out;
  }
  function _userEmail(username) {
    return `${_encodeUsername(username)}@${X.SUPABASE_CONFIG.EMAIL_DOMAIN}`;
  }

  /** 解析 banned/muted jsonb 字段 → 状态对象 */
  function _parseStatus(v) {
    if (!v) return null;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (_) { return null; }
  }

  const auth = {
    REDEEM_CODE,
    _profile: null,

    sb() { return X.db; },

    /** 当前用户（同步缓存，由 restoreSession/register/login 刷新） */
    currentUser() { return this._profile; },

    /** 是否管理员（含临时管理员） */
    isAdmin() {
      const p = this._profile;
      if (p && (p.role === 'admin' || p.role === 'super')) return true;
      if (localStorage.getItem(SESSION_TEMP_ADMIN) === '1') return true;
      return false;
    },
    /** 是否超级管理员 */
    isSuper() {
      const p = this._profile;
      return !!(p && p.role === 'super');
    },
    /** 是否被封禁 */
    isBanned(p) {
      p = p || this._profile;
      if (!p) return false;
      const b = _parseStatus(p.banned);
      if (!b) return false;
      if (b.perm) return '您已被永久封禁';
      if (b.until && Date.parse(b.until) > Date.now()) return '您已被限时封禁，至 ' + X.utils.time(b.until);
      return false;
    },
    /** 是否被禁言 */
    isMuted(p) {
      p = p || this._profile;
      if (!p) return false;
      const m = _parseStatus(p.muted);
      if (!m) return false;
      if (m.perm) return true;
      if (m.until && Date.parse(m.until) > Date.now()) return true;
      return false;
    },
    /** 是否实名 */
    isRealname(p) {
      p = p || this._profile;
      return !!(p && p.realname);
    },

    /** 路由守卫：未登录跳转到登录页 */
    requireLogin() {
      if (this._profile) return true;
      // 兑换码临时管理员允许无登录态浏览 admin（无写权限）
      if (localStorage.getItem(SESSION_TEMP_ADMIN) === '1') return true;
      X.ui.toast(X.t('err.notLoggedIn'), 'err');
      setTimeout(() => X.router.go('login'), 400);
      return false;
    },
    /** 路由守卫：非管理员拒绝访问 */
    requireAdmin() {
      if (this.isAdmin()) return true;
      X.ui.toast(X.t('err.notAdmin'), 'err');
      setTimeout(() => X.router.go('home'), 400);
      return false;
    },

    /**
     * 注册：
     *   username + password + confirm + phone + avatar/avatarType
     *   - Supabase Auth signUp（合成 hex 邮箱）
     *   - trigger handle_new_user 自动建 profile（balance=10, role=user）
     *   - 前端 upsert 兜底：万一 trigger 失败，前端补写一行
     */
    async register({ username, password, confirm, phone, avatar, avatarType }) {
      if (!X.supabaseReady) return { ok: false, msg: 'Supabase 未配置' };
      // 精准字段必填提示
      if (!username) return { ok: false, msg: '账号名必填' };
      if (!confirm)  return { ok: false, msg: '二次密码必填' };
      if (!phone)    return { ok: false, msg: '手机号必填' };
      if (!password) return { ok: false, msg: '密码必填' };
      if (!X.utils.isPassword(password)) return { ok: false, msg: '密码至少 6 位' };
      if (password !== confirm) return { ok: false, msg: X.t('err.passwordMismatch') };
      if (!X.utils.isPhone(phone)) return { ok: false, msg: X.t('err.phoneFormat') || '手机号格式不正确（6-15 位数字）' };

      const email = _userEmail(username);
      const { data, error } = await X.db.auth.signUp({
        email, password,
        options: {
          data: { username, phone, avatar: avatar || '🐧', avatar_type: avatarType || 'emoji' }
        }
      });
      if (error) {
        console.warn('[Xiao] signUp error →', error);
        const m = error.message || String(error);
        if (m.indexOf('already') >= 0 || m.indexOf('exist') >= 0) return { ok: false, msg: X.t('err.userExists') };
        return { ok: false, msg: m };
      }
      const uid = data.user && data.user.id;
      if (!uid) return { ok: false, msg: X.t('err.registerFail') };

      // 兜底：万一 trigger handle_new_user 没建 profile，前端 upsert
      // 列名 = SQL 列名，零映射
      try {
        await X.dbq.upsert(T.PROFILES, {
          id: uid, username, phone, avatar: avatar || '🐧', avatar_type: avatarType || 'emoji',
          balance: X.BIZ.INIT_BALANCE, role: 'user', created_at: new Date().toISOString()
        }, { onConflict: 'id' });
      } catch (e) {
        console.debug('[Xiao] upsert profile fallback skipped:', e && e.message);
      }

      // 自动登录
      this._profile = await X.store.getProfile(uid);
      if (this._profile && this._profile.username === username) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username, password }));
      }
      return { ok: true, user: this._profile };
    },

    /** 登录 */
    async login(username, password, remember) {
      if (!X.supabaseReady) return { ok: false, msg: 'Supabase 未配置' };
      const email = _userEmail(username);
      const { data, error } = await X.db.auth.signInWithPassword({ email, password });
      if (error || !data.user) {
        console.warn('[Xiao] signIn error:', error && error.status, error && error.message);
        const m = (error && error.message) || X.t('err.loginFail');
        return { ok: false, msg: m };
      }
      const uid = data.user.id;
      this._profile = await X.store.getProfile(uid);
      if (!this._profile) return { ok: false, msg: X.t('err.loginFail') };

      // 封禁检查
      const b = this.isBanned(this._profile);
      if (b) { await X.db.auth.signOut(); this._profile = null; return { ok: false, msg: b }; }

      if (remember) localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username, password }));
      else localStorage.removeItem(REMEMBER_KEY);
      return { ok: true, user: this._profile };
    },

    /** 退出登录 */
    async logout() {
      try { await X.db.auth.signOut(); } catch (_) {}
      this._profile = null;
      localStorage.removeItem(SESSION_TEMP_ADMIN);
      X.ui.refresh();
      X.router.go('home');
    },

    /** 恢复会话：页面加载时调用，从 Supabase Auth 拿 session，再读 profile */
    async restoreSession() {
      if (!X.supabaseReady) return;
      try {
        const { data } = await X.db.auth.getSession();
        const uid = data.session && data.session.user && data.session.user.id;
        if (uid) {
          this._profile = await X.store.getProfile(uid);
        }
      } catch (e) {
        console.debug('[Xiao] restoreSession fail:', e && e.message);
      }
    },

    /** 兑换码弹窗：输入 867899gnhh → 临时管理员（仅当前浏览器） */
    openRedeem() {
      X.ui.prompt({
        title: X.t('nav.redeem'),
        label: X.t('nav.redeem'),
        placeholder: '输入兑换码',
        confirmText: X.t('common.confirm'),
        validate: v => v ? null : X.t('err.required')
      }).then(async code => {
        if (!code) return;
        if (code !== REDEEM_CODE) {
          X.ui.toast(X.t('err.redeemFail'), 'err');
          return;
        }
        localStorage.setItem(SESSION_TEMP_ADMIN, '1');
        X.ui.toast('临时管理员权限已开启', 'ok');
        X.ui.refresh();
        X.router.go('admin');
      });
    }
  };

  // 让 store 也能引用表名常量
  const T = X.TABLES;
  X.auth = auth;
})(window.Xiao = window.Xiao || {});
