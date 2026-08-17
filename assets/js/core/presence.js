// ============================================================================
// Xiao 2.0 · 核心层 · 在线状态（Presence）
// 职责：
//   1. 基于 Supabase Realtime Presence 维护在线用户集合
//   2. track()/untrack() 加入/离开频道
//   3. isOnline()/list() 查询在线状态
//   4. onChange(cb) 注册回调，presence 变化时通知
//   5. 每 30 秒 heartbeat 更新 last_seen
//   6. X.supabaseReady=false 时全部静默降级（不报错）
// ============================================================================
(function (X) {
  const CHANNEL_NAME = 'xiao-presence';
  const HEARTBEAT_MS = 30 * 1000;

  const presence = {
    /** Realtime 频道句柄 */
    channel: null,
    /** 在线用户集合（Set<user_id>） */
    online: new Set(),
    /** 完整在线用户信息映射 user_id -> {user_id, username, avatar, last_seen} */
    _map: {},
    /** onChange 回调列表 */
    _callbacks: [],
    /** heartbeat 定时器 */
    _heartbeatTimer: null,
    /** 当前 track 的用户信息 */
    _me: null,

    /**
     * 初始化：创建频道 + 订阅 join/leave/sync
     * 静默降级：Supabase 未就绪时直接返回
     */
    init() {
      if (!X.supabaseReady || !X.db) return;
      const ch = X.db.channel(CHANNEL_NAME);
      this.channel = ch;
      ch
        .on('presence', { event: 'join' },  () => this._onSync())
        .on('presence', { event: 'leave' }, () => this._onSync())
        .on('presence', { event: 'sync' },  () => this._onSync())
        .subscribe();
    },

    /**
     * 内部：同步 presence 状态
     * 从 channel.presenceState() 重建 online 集合与 _map，并通知回调
     */
    _onSync() {
      if (!this.channel) return;
      let state;
      try { state = this.channel.presenceState(); }
      catch (e) { console.debug('[Xiao] presenceState error:', e); return; }

      const next = new Set();
      const map = {};
      for (const key in state) {
        const conns = state[key];
        if (!Array.isArray(conns)) continue;
        for (const c of conns) {
          const uid = c && (c.user_id || c.id);
          if (!uid) continue;
          next.add(uid);
          map[uid] = c;
        }
      }
      this.online = next;
      this._map = map;
      // 通知所有回调
      const list = this.list();
      this._callbacks.forEach(cb => {
        try { cb(list); } catch (e) { console.warn('[Xiao] presence onChange error:', e); }
      });
    },

    /**
     * 加入 presence
     * @param {Object} user { user_id, username, avatar }
     */
    track(user) {
      if (!X.supabaseReady || !this.channel) return;
      this._me = user;
      const payload = {
        user_id: user && user.user_id,
        username: user && user.username,
        avatar: user && user.avatar,
        last_seen: new Date().toISOString()
      };
      try {
        this.channel.track(payload);
      } catch (e) {
        console.warn('[Xiao] presence.track error:', e);
      }
      // 启动 heartbeat
      this._startHeartbeat();
    },

    /** 离开 presence */
    untrack() {
      this._stopHeartbeat();
      if (!this.channel) return;
      try { this.channel.untrack(); }
      catch (e) { console.warn('[Xiao] presence.untrack error:', e); }
      this._me = null;
    },

    /** 启动 heartbeat：每 30 秒重新 track 更新 last_seen */
    _startHeartbeat() {
      this._stopHeartbeat();
      this._heartbeatTimer = setInterval(() => {
        if (!this.channel || !this._me) return;
        const payload = {
          user_id: this._me.user_id,
          username: this._me.username,
          avatar: this._me.avatar,
          last_seen: new Date().toISOString()
        };
        try { this.channel.track(payload); }
        catch (e) { console.debug('[Xiao] heartbeat error:', e); }
      }, HEARTBEAT_MS);
    },

    /** 停止 heartbeat */
    _stopHeartbeat() {
      if (this._heartbeatTimer) {
        clearInterval(this._heartbeatTimer);
        this._heartbeatTimer = null;
      }
    },

    /**
     * 查询用户是否在线
     * @param {string} userId
     * @returns {boolean}
     */
    isOnline(userId) {
      return this.online.has(userId);
    },

    /**
     * 返回在线用户数组
     * @returns {Array<{user_id,username,avatar,last_seen}>}
     */
    list() {
      return Object.keys(this._map).map(uid => this._map[uid]);
    },

    /**
     * 注册 presence 变化回调
     * @param {(list:Array)=>void} cb
     * @returns {Function} 取消注册函数
     */
    onChange(cb) {
      if (typeof cb !== 'function') return () => {};
      this._callbacks.push(cb);
      return () => {
        const i = this._callbacks.indexOf(cb);
        if (i >= 0) this._callbacks.splice(i, 1);
      };
    }
  };

  X.presence = presence;
})(window.Xiao = window.Xiao || {});
