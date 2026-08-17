// ============================================================================
// Xiao 2.0 · Supabase 配置
// 【密钥填写位置】把下面两个常量替换成你自己的 Supabase 项目值
//   获取路径：https://supabase.com/dashboard → 选择项目 →
//   Project Settings → API → Project URL 与 Project API Keys (anon public)
// 仅使用 anon 公共密钥，绝对不要在前端使用 service_role！
// 未填写时应用会在控制台告警，但不会崩溃。
// ============================================================================
(function (X) {
  X.SUPABASE_CONFIG = {
    SUPABASE_URL: 'YOUR_SUPABASE_URL',            // 例：https://abcd1234.supabase.co
    SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',  // 例：eyJhbGciOiJI...
    STORAGE_BUCKET_AVATAR: 'avatars',
    STORAGE_BUCKET_WORKS: 'works',
    EMAIL_DOMAIN: 'xiao.local'                     // 合成邮箱后缀（不真发邮件）
  };

  // 表名常量（前端 store 和 SQL 一一对应，零映射层）
  X.TABLES = {
    PROFILES: 'profiles',
    MESSAGES: 'messages',
    DM_MESSAGES: 'dm_messages',
    GROUPS: 'groups',
    GROUP_MEMBERS: 'group_members',
    GROUP_MESSAGES: 'group_messages',
    WORKS: 'works',
    WORK_LIKES: 'work_likes',
    DOWNLOAD_REQUESTS: 'download_requests',
    FRIEND_REQUESTS: 'friend_requests',
    FRIENDSHIPS: 'friendships',
    BLOCKS: 'blocks',
    REPORTS: 'reports',
    ADMIN_LOGS: 'admin_logs'
  };

  // 业务常量
  X.BIZ = {
    REDEEM_CODE: '867899gnhh',                    // 兑换码 → 临时管理员
    INIT_BALANCE: 10,                              // 新用户初始 Ttpx_A
    GROUP_COST: 20,                                // 建群消耗
    GROUP_MAX: 20,                                 // 群上限人数
    LIKE_REWARD: 0.01                              // 收到点赞作者+0.01
  };
})(window.Xiao = window.Xiao || {});
