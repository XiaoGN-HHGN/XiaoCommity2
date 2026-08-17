// ============================================================================
// Xiao 2.0 · Supabase 客户端初始化 + 统一请求封装
// 职责：
//   1. 初始化 Supabase Client（含 Realtime）
//   2. X.dbq：统一数据访问层（select/insert/update/remove/upsert/rpc）
//   3. X.realtime：Realtime 订阅辅助（onInsert/onUpdate）
//   4. X.storage：Storage 上传/下载辅助
//   5. X.supabaseReady：是否成功初始化（false 时业务层全部静默降级）
// ============================================================================
(function (X) {
  const cfg = X.SUPABASE_CONFIG || {};
  const ready = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    cfg.SUPABASE_URL !== 'YOUR_SUPABASE_URL' &&
    cfg.SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';

  X.supabaseReady = false;

  if (!ready || typeof window.supabase === 'undefined') {
    if (typeof window.supabase === 'undefined') {
      console.warn('[Xiao] Supabase SDK 未加载，请检查 index.html 是否引入 supabase.min.js');
    } else {
      console.warn('[Xiao] Supabase 未配置，请到 assets/js/core/config.js 填写密钥');
    }
    return;
  }

  // 初始化客户端（v2 SDK）
  X.db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 10 } }
  });
  X.supabaseReady = true;
  console.log('[Xiao] Supabase 已连接');

  // ========================================================================
  // X.dbq：统一数据访问封装
  // 所有方法返回 Promise，失败时抛出含 code/message 的 Error 对象
  // ========================================================================
  const dbq = {
    /** 通用 SELECT，支持 filter/order/limit/single */
    async select(table, { columns = '*', filter = {}, eq = null, neq = null,
                         in_filter = null, order = null, limit = null,
                         single = false } = {}) {
      let q = X.db.from(table).select(columns);
      if (eq)   q = q.eq(eq[0], eq[1]);
      if (neq)  q = q.neq(neq[0], neq[1]);
      if (in_filter) q = q.in(in_filter[0], in_filter[1]);
      for (const k in filter) q = q.eq(k, filter[k]);
      if (order) {
        const [col, opts] = Array.isArray(order) ? order : [order];
        q = q.order(col, opts || {});
      }
      if (limit) q = q.limit(limit);
      if (single) q = q.maybeSingle();
      const { data, error } = await q;
      if (error) throw error;
      return single ? data : (data || []);
    },

    /** 插入行，返回完整行（用 select('*') 触发 PostgREST Returning） */
    async insert(table, row) {
      const { data, error } = await X.db.from(table).insert(row).select('*').single();
      if (error) throw error;
      return data;
    },

    /** 插入多行，返回数组 */
    async insertMany(table, rows) {
      const { data, error } = await X.db.from(table).insert(rows).select('*');
      if (error) throw error;
      return data || [];
    },

    /** 更新行，filter 必须是 {col: val} 形式，返回更新后的行数组 */
    async update(table, patch, { filter = {}, eq = null } = {}) {
      let q = X.db.from(table).update(patch);
      if (eq)  q = q.eq(eq[0], eq[1]);
      for (const k in filter) q = q.eq(k, filter[k]);
      const { data, error } = await q.select('*');
      if (error) throw error;
      return data || [];
    },

    /** 删除行 */
    async remove(table, { filter = {}, eq = null } = {}) {
      let q = X.db.from(table).delete();
      if (eq)  q = q.eq(eq[0], eq[1]);
      for (const k in filter) q = q.eq(k, filter[k]);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },

    /** upsert：不存在则插入，存在则更新 */
    async upsert(table, row, { onConflict = null } = {}) {
      let q = X.db.from(table).upsert(row);
      if (onConflict) q = q.onConflict(onConflict);
      const { data, error } = await q.select('*');
      if (error) throw error;
      return data;
    },

    /** 调用 RPC（如 adjust_coin） */
    async rpc(name, args) {
      const { data, error } = await X.db.rpc(name, args);
      if (error) throw error;
      return data;
    },

    /** 计数 */
    async count(table, { filter = {}, eq = null } = {}) {
      let q = X.db.from(table).select('*', { count: 'exact', head: true });
      if (eq)  q = q.eq(eq[0], eq[1]);
      for (const k in filter) q = q.eq(k, filter[k]);
      const { count, error } = await q;
      if (error) throw error;
      return count || 0;
    }
  };
  X.dbq = dbq;

  // ========================================================================
  // X.realtime：Realtime 订阅辅助
  // 每个方法返回 { unsubscribe } 句柄；页面 onLeave 时调 unsubscribe()
  // ========================================================================
  X.realtime = {
    /** 订阅表 INSERT 事件，filter 形如 'col=eq.value'，callback(payload) */
    onInsert(table, filter, callback) {
      const ch = X.db.channel('ins_' + table + '_' + Math.random().toString(36).slice(2, 8));
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: filter || undefined }, callback)
        .subscribe();
      return ch;
    },
    /** 订阅表 UPDATE 事件 */
    onUpdate(table, filter, callback) {
      const ch = X.db.channel('upd_' + table + '_' + Math.random().toString(36).slice(2, 8));
      ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: filter || undefined }, callback)
        .subscribe();
      return ch;
    },
    /** 订阅表 DELETE 事件 */
    onDelete(table, filter, callback) {
      const ch = X.db.channel('del_' + table + '_' + Math.random().toString(36).slice(2, 8));
      ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table, filter: filter || undefined }, callback)
        .subscribe();
      return ch;
    },
    /** 通用订阅：自选 events 数组 */
    on(table, events, filter, callback) {
      const ch = X.db.channel('gen_' + table + '_' + Math.random().toString(36).slice(2, 8));
      ch.on('postgres_changes', { event: events, schema: 'public', table, filter: filter || undefined }, callback)
        .subscribe();
      return ch;
    },
    /** 取消订阅（兼容 channel 句柄） */
    off(ch) {
      if (ch) { try { X.db.removeChannel(ch); } catch (_) {} }
    }
  };

  // ========================================================================
  // X.storage：Storage 上传/下载辅助
  // ========================================================================
  X.storage = {
    /** 上传文件到指定 bucket，返回 public URL */
    async upload(bucket, path, file, { upsert = false } = {}) {
      const { data, error } = await X.db.storage.from(bucket)
        .upload(path, file, { upsert, contentType: file.type || 'application/octet-stream' });
      if (error) throw error;
      return X.db.storage.from(bucket).getPublicUrl(data.path).publicUrl;
    },
    /** 下载文件为 Blob */
    async download(bucket, path) {
      const { data, error } = await X.db.storage.from(bucket).download(path);
      if (error) throw error;
      return data;
    },
    /** 下载文本文件（txt/code 等用于在线预览） */
    async downloadText(bucket, path) {
      const blob = await this.download(bucket, path);
      return await blob.text();
    },
    /** 删除文件 */
    async remove(bucket, paths) {
      const { data, error } = await X.db.storage.from(bucket).remove(paths);
      if (error) throw error;
      return data;
    },
    /** 列出文件 */
    async list(bucket, { folder = '', limit = 100 } = {}) {
      const { data, error } = await X.db.storage.from(bucket).list(folder, { limit });
      if (error) throw error;
      return data || [];
    }
  };
})(window.Xiao = window.Xiao || {});
