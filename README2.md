# Xiao · 企海狐协会 · 2.0 部署说明

> 企鹅 + 海豚 + 雪狐 · 理科技术社区
> 纯前端 + Supabase，部署到 GitHub Pages 即可上线。

---

## 一、快速开始（3 步上线）

1. **建表**：把 `schema.sql` 整段粘进 Supabase SQL Editor → Run。
2. **填密钥**：编辑 `assets/js/core/config.js`，填入你的 Supabase URL 与 anon key。
3. **部署**：把 `XiaoCommity2/` 目录推到 GitHub Pages 仓库即可。

---

## 二、数据库建表步骤（必做）

### 1. 注册 Supabase 项目

- 打开 https://supabase.com → New Project
- 设置数据库密码、区域（建议 Singapore / Hong Kong）
- 创建后等待 1~2 分钟完成初始化

### 2. 执行 schema.sql

进入 Dashboard：

```
左侧菜单 → SQL Editor → New query
```

打开本目录下的 `schema.sql`，**整段复制**进去，点 **Run**。

执行成功后会创建：

| # | 表名 | 用途 |
|---|---|---|
| 1 | profiles | 用户主资料（id=auth.users.id） |
| 2 | messages | 公共大厅消息（带作者快照） |
| 3 | dm_messages | 私聊（pair_key 简化查询） |
| 4 | groups | 私有群组（20 人上限） |
| 5 | group_members | 群成员（owner/admin/member） |
| 6 | group_messages | 群消息（带作者快照） |
| 7 | works | 作品（论文/文件夹/代码） |
| 8 | work_likes | 点赞（unique 防重复） |
| 9 | download_requests | 下载申请 |
| 10 | friend_requests | 好友申请 |
| 11 | friendships | 已建立好友关系 |
| 12 | blocks | 拉黑关系 |
| 13 | reports | 举报 |
| 14 | admin_logs | 管理员操作日志 |

外加：
- RPC 函数 `adjust_coin(target, delta)`：原子增减代币（点赞 +0.01 / 建群 -20 / 管理员奖惩）
- 触发器 `handle_new_user`：新用户注册后自动建 profile（balance=10, role=user）
- RLS 策略：所有表已开启行级安全
- Realtime publication：所有业务表已加入推送
- Storage buckets：`avatars` 与 `works`（public=true）

### 3. 关闭邮箱确认（关键！）

进入 Dashboard：

```
Authentication → Providers → Email → 关闭 Confirm email
```

否则 `signUp` 之后账号会被标记为未确认，登录会报 400。

### 4. 设置超级管理员

注册一个账号后，回到 SQL Editor 执行：

```sql
update public.profiles set role = 'super' where username = '你的用户名';
```

这样该账号就有超级管理员权限（能增设/撤销其他管理员）。

---

## 三、密钥填写位置

**文件路径**：`assets/js/core/config.js`

打开后修改这两个值：

```javascript
X.SUPABASE_CONFIG = {
  SUPABASE_URL: 'YOUR_SUPABASE_URL',            // ← 改这里
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',  // ← 改这里
  ...
};
```

获取方式：

```
Dashboard → Project Settings → API
  → Project URL          → 填到 SUPABASE_URL
  → Project API Keys → anon public → 填到 SUPABASE_ANON_KEY
```

⚠️ **只填 anon public 密钥**，绝对不要在前端使用 `service_role`！
（anon 在 RLS 保护下，service_role 会绕过所有权限）

---

## 四、部署到 GitHub Pages

### 方法 A：直接静态托管

1. 在 GitHub 新建一个公开仓库，例如 `xiao-community`
2. 把 `XiaoCommity2/` 目录里的所有文件（含 `index.html`）推上去：

   ```
   git init
   git add .
   git commit -m "Xiao 2.0 deploy"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/xiao-community.git
   git push -u origin main
   ```

3. 进仓库 Settings → Pages
4. Source 选 `Deploy from a branch`，Branch 选 `main` / root，Save
5. 等 1~2 分钟，访问 `https://<你的用户名>.github.io/xiao-community/`

### 方法 B：本地预览

无需 Node 后端，任意静态服务器即可：

```bash
# 方式 1：Python
python -m http.server 8080

# 方式 2：npx serve
npx serve .

# 方式 3：VS Code Live Server 插件
```

打开 `http://localhost:8080/` 即可。

⚠️ 注意：Supabase Auth 重定向需要 HTTPS。本地 HTTP 测试时，登录/注册走的是
`signInWithPassword`（无需重定向），可以正常工作；只有在 OAuth 第三方登录时
才需要配置 Site URL。

---

## 五、业务规则对照（全部保留）

| 模块 | 规则 | 实现位置 |
|---|---|---|
| 账号 | 账号名 + 密码 + 二次密码 + 手机号 | `modules/auth.js` + `core/auth.js` |
| 账号 | 头像支持上传 / 默认 emoji | `modules/auth.js` + `modules/profile.js` |
| 账号 | 登录记住密码 | `core/auth.js` REMEMBER_KEY |
| 账号 | 新用户初始 10 Ttpx_A | `schema.sql` profiles.balance default + RPC |
| 管理 | 兑换码 `867899gnhh` 临时管理员 | `core/auth.js` REDEEM_CODE |
| 管理 | 超级管理员可增设/撤销管理员 | `modules/admin.js` toggleAdmin（仅 super） |
| 管理 | 所有奖惩必须填原因 + 留日志 | `modules/admin.js` askReason + addLog |
| 管理 | 余额查询 / 作品审核 / 奖惩代币 / 封禁 / 禁言 / 举报审核 | `modules/admin.js` 全部子标签 |
| 社交 | 公共大厅 + 私聊 + @用户 + Emoji + 链接 | `modules/chat.js` + `modules/social.js` |
| 社交 | 好友拉黑 | `modules/social.js` block |
| 社交 | 全页面举报进后台 | `modules/misc.js` report |
| 社交 | 消耗 20 创建 20 人上限私有群组 | `core/store.js` createGroup |
| 社交 | 入群需群主审核 | `core/store.js` requestJoinGroup + approveJoinGroup |
| 社交 | 群主/群管踢人 / 禁言 / 分享 | `modules/social.js` openMembers |
| 作品 | 上传论文/文件夹/代码 + 在线预览 | `modules/works.js` openUpload + openPreview |
| 作品 | 创作者自主定价/免费 | `core/store.js` createWork price |
| 作品 | 下载需创作者同意 | `core/store.js` requestDownload + approveDownload |
| 作品 | 按需加载（每批 20） | `modules/works.js` BATCH=20 |
| 作品 | 点赞免费，作者 +0.01 | `core/store.js` toggleLike + adjust_coin |
| 作品 | 游戏分区下载需实名 | `modules/works.js` requestDownload isGame check |
| 其他 | 在线 JS/HTML/CSS/Python 编辑器 | `modules/editor.js` |
| 其他 | 三语言切换 中/英/俄 | `core/i18n.js` + `assets/js/i18n/*.js` |
| 其他 | 科研长视频入口标注"开发中" | `modules/misc.js` videoRender |
| 其他 | 联系我们跳 B 站 | `modules/misc.js` contact |

---

## 六、目录结构

```
XiaoCommity2/
├── index.html                  # 入口 HTML
├── schema.sql                  # 数据库建表 SQL（粘到 Supabase 执行）
├── README2.md                  # 本文档
└── assets/
    ├── css/
    │   └── style.css           # 全局样式
    └── js/
        ├── app.js              # 启动入口
        ├── core/               # 核心层
        │   ├── config.js       # ★ Supabase 密钥填写位置
        │   ├── supabase.js     # 客户端 + 统一请求封装
        │   ├── utils.js        # 工具函数
        │   ├── ui.js           # Toast / Modal / 导航渲染
        │   ├── i18n.js         # 国际化引擎
        │   ├── store.js       # 数据访问层（每张表对应一组方法）
        │   ├── auth.js         # 认证 + 权限 + 兑换码
        │   └── router.js       # hash 路由 + onLeave 清理
        ├── i18n/
        │   ├── zh-CN.js
        │   ├── en.js
        │   └── ru.js
        └── modules/            # 业务模块层
            ├── home.js         # 首页
            ├── auth.js         # 登录/注册
            ├── chat.js         # 公共大厅
            ├── social.js       # 私聊+群组+好友+拉黑
            ├── works.js       # 作品
            ├── editor.js       # 代码编辑器
            ├── profile.js     # 个人中心
            ├── admin.js        # 管理后台
            └── misc.js         # 视频占位 / 联系我们 / 举报
```

---

## 七、常见问题

### Q1. 注册时报 "Email rate limit exceeded"
Supabase 免费版每小时有邮件配额。注册失败时，检查是否已关闭 Confirm email
（见步骤二·3）。

### Q2. 聊天大厅消息发送后看不到
检查：
1. `schema.sql` 是否完整执行（特别是 `alter publication supabase_realtime add table public.messages`）
2. 浏览器控制台是否有 Realtime 连接错误
3. Supabase Dashboard → Realtime 是否启用

### Q3. 上传头像/作品失败
检查：
1. Storage buckets `avatars` / `works` 是否创建（`schema.sql` 已包含）
2. Storage RLS 是否允许 authenticated 写入
3. 文件大小限制：头像 1.5MB，作品 50MB

### Q4. 管理员入口不显示
管理员入口仅在 `X.auth.isAdmin()` 为 true 时显示。
- 永久管理员：执行 SQL `update profiles set role='admin' where id='...';`
- 临时管理员：右上角 ✦ 兑换码按钮，输入 `867899gnhh`

### Q5. 临时管理员能做什么 / 不能做什么
- 能：浏览管理后台、查看用户/作品/举报/日志
- 不能：写入数据（因为没登录态，RLS 会拒绝）
- 需要：真正注册一个账号，再用 SQL 提权为 super/admin

### Q6. GitHub Pages 刷新 404
纯前端 hash 路由，URL 形如 `https://xxx.github.io/Repository/#/chat`，
不需要服务器配置，直接刷新即可。如果出现 404，检查 Pages 是否选对分支。

---

## 八、技术栈

- **前端**：原生 HTML/CSS/JS（无框架，纯 ES2017+）
- **后端**：Supabase（Postgres + Auth + Realtime + Storage）
- **SDK**：`@supabase/supabase-js@2.39.0`（UMD）
- **部署**：GitHub Pages 静态托管

---

## 九、License

MIT

---

# 🚀 Xiao 2.1 升级指南

> 在 2.0 基础上全面升级，新增 13 张表 + 6 大功能模块 + 4 项体验优化。
> 已部署 2.0 的用户，**只需追加执行 `schema-v2.1-upgrade.sql` 即可升级**，无需改库结构。

---

## 十、v2.1 升级步骤（3 步）

### 1. 追加建表

进入 Supabase SQL Editor，**整段复制** `schema-v2.1-upgrade.sql` 内容，点 **Run**。

成功后新增 15 张表 + 2 个 RPC 函数 + 多条触发器/RLS：

| # | 表名 | 用途 |
|---|---|---|
| 1 | comments | 作品评论（带作者快照 + 嵌套回复） |
| 2 | favorites | 作品收藏 |
| 3 | tags / work_tags | 标签 + 作品-标签关联 |
| 4 | announcements | 公告中心（支持置顶） |
| 5 | polls / poll_options / poll_votes | 投票系统（单选/多选/过期） |
| 6 | tasks | 任务看板（Kanban：待办/进行中/已完成） |
| 7 | user_levels | 等级配置（icon/title/min_exp/color） |
| 8 | medals / user_medals | 勋章定义 + 用户勋章授予 |
| 9 | pinned_messages | 聊天大厅置顶消息 |
| 10 | message_edits | 消息编辑历史审计 |
| 11 | snippets | 代码片段云端保存与分享 |

扩展字段：
- `messages.reply_to` / `messages.edited_at` / `messages.deleted`（回复引用 + 编辑标记 + 软删除）
- `profiles.exp` / `profiles.level` / `profiles.bio` / `profiles.status_text` / `profiles.last_seen`

新增 RPC：
- `award_exp(target uuid, delta int)`：经验值原子增减 + 自动升级（触发器调用）

### 2. 配置等级与勋章（可选，丰富体验）

```sql
-- 等级配置示例
insert into public.user_levels (level, title, min_exp, icon, color) values
  (1, '萌新',    0,    '🌱', '#4493f8'),
  (2, '学徒',    100,  '📖', '#3fb950'),
  (3, '研究者',  500,  '🔬', '#d29922'),
  (4, '专家',    2000, '🎓', '#f85149'),
  (5, '宗师',    8000, '🏆', '#ffcc00');

-- 勋章定义示例
insert into public.medals (code, name, description, icon, color) values
  ('first_work',  '初露锋芒',  '发布第一个作品',         '🎨', '#4493f8'),
  ('popular',     '人气王',     '收到 10 个点赞',          '❤️', '#f85149'),
  ('rich',        '富豪',       '余额达到 100 Ttpx_A',    '🪙', '#d29922'),
  ('social',      '社交达人',   '添加 5 个好友',          '👥', '#3fb950'),
  ('contributor', '代码贡献者', '保存 10 个公开代码片段', '⚡', '#ffcc00');
```

### 3. 部署前端

把 `XiaoCommity2/` 目录推到 GitHub Pages 即可，**无需任何后端改动**。

---

## 十一、v2.1 新功能一览

| 功能 | 入口 | 说明 |
|---|---|---|
| 🎨 **三主题切换** | 顶部 🌙/☀️/🛸 按钮 | dark / light / cyber，localStorage 持久化 |
| ⌘ **命令面板** | 顶部 ⌘ 按钮 或 Ctrl/Cmd+K | 快速跳转 + 主题/语言切换 |
| 🦴 **骨架屏** | 各页面加载时 | 脉冲动画占位，避免白屏 |
| 🟢 **在线状态** | 聊天大厅侧边栏 | Supabase Presence 实时同步 |
| 📣 **消息撤回/编辑/回复/置顶** | 聊天大厅 hover 消息 | 软删除 + 编辑历史 + 引用 + 管理员置顶 |
| 💬 **作品评论** | 作品详情页 | 嵌套回复 + 作者快照 |
| ⭐ **作品收藏** | 作品详情页 | 一键收藏 + 个人中心「我的收藏」 |
| 🏷 **作品标签** | 作品详情页 | 自由打标 + 按标签筛选 |
| 📢 **公告中心** | 导航 📢 | 管理员发布/编辑/删除/置顶 + 实时推送 |
| 📊 **投票系统** | 导航 📊 | 单选/多选 + 过期 + 进度条 + 实时刷新 |
| 📋 **任务看板** | 导航 📋 | Kanban 三列 + 拖拽移动 + 截止日提醒 + Realtime |
| 🏆 **排行榜** | 导航 🏆 | 作品点赞榜 / 创作者榜 / 富豪榜 / 等级榜 |
| 🏅 **等级 + 勋章** | 个人中心 | 经验进度条 + 勋章展示 |
| 📈 **管理员看板** | 管理后台 | 数据卡片 + 7 日柱状图 + CSV 导出 |
| ⚡ **编辑器升级** | 代码编辑器 | 语法高亮 + 多文件标签 + 云端保存 + 分享链接 |
| 📱 **PWA** | 浏览器安装 | 可安装到桌面 + 静态资源离线缓存 |
| 🌐 **个人简介/状态** | 个人中心 | bio + status_text 自由编辑 |

---

## 十二、v2.1 文件清单

新增/修改的核心文件：

```
XiaoCommity2/
├── index.html                  # 升级：加载新核心层 + PWA + 命令面板按钮
├── manifest.json               # 新增：PWA 配置
├── sw.js                        # 新增：Service Worker（离线缓存）
├── schema.sql                   # 2.0 基础表
├── schema-v2.1-upgrade.sql      # 新增：2.0 → 2.1 升级 SQL
└── assets/
    ├── css/style.css           # 升级：多主题 + 骨架屏 + 命令面板 + 看板 + 投票 + 勋章 + 图表
    └── js/
        ├── app.js              # 升级：主题初始化 + Presence 启动 + 命令面板绑定
        ├── core/
        │   ├── theme.js        # 新增：三主题管理
        │   ├── presence.js      # 新增：在线状态（Supabase Presence）
        │   ├── skeleton.js      # 新增：骨架屏工厂
        │   ├── cmdk.js          # 新增：Ctrl+K 命令面板
        │   ├── store.js         # 升级：13 张新表 CRUD + 消息撤回/编辑/回复/置顶
        │   └── ui.js            # 升级：导航栏新增 4 个入口
        ├── i18n/
        │   ├── zh-CN.js        # 升级：12 条新功能词条
        │   ├── en.js           # 升级：12 条新功能词条
        │   └── ru.js           # 升级：12 条新功能词条
        └── modules/
            ├── chat.js         # 升级：撤回/编辑/回复/置顶 + 在线状态
            ├── works.js        # 升级：评论/收藏/标签 + 骨架屏
            ├── editor.js       # 升级：语法高亮 + 多文件 + 云端保存 + 分享
            ├── admin.js        # 升级：数据看板 + 公告管理 + CSV 导出
            ├── profile.js      # 升级：等级/经验/勋章 + 简介/状态
            ├── home.js         # 升级：12 条功能介绍
            ├── leaderboard.js  # 新增：四榜单
            ├── tasks.js        # 新增：Kanban 看板
            ├── polls.js        # 新增：投票系统
            └── announcements.js # 新增：公告中心
```

---

## 十三、v2.1 快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl+K` / `Cmd+K` | 打开命令面板 |
| `↑` / `↓` | 命令面板内选择 |
| `Enter` | 执行当前命令 |
| `Esc` | 关闭命令面板 |

---

## 十四、v2.1 兼容性

- ✅ 完全兼容 2.0 数据库，无需迁移
- ✅ 纯前端，GitHub Pages 直接部署
- ✅ 不依赖任何第三方框架，原生 ES2017+
- ✅ 三主题不破坏 2.0 默认暗色风格（默认 dark）
- ✅ PWA Service Worker 仅缓存静态资源，不影响 Supabase 实时通讯
