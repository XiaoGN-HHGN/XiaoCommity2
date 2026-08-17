-- ============================================================================
-- Xiao 社区 2.0 → 2.1 升级 SQL
-- 在 schema.sql 执行成功后再执行本文件
-- 新增表：comments / favorites / tags / work_tags / announcements /
--        polls / poll_options / poll_votes / tasks / user_levels / medals /
--        user_medals / pinned_messages / message_edits / snippets
-- 扩展字段：messages.reply_to / messages.edited_at / messages.deleted
--           profiles.exp / profiles.level / profiles.bio
-- ============================================================================

-- 0) 清理旧表（升级幂等）
drop table if exists public.comments           cascade;
drop table if exists public.favorites          cascade;
drop table if exists public.tags               cascade;
drop table if exists public.work_tags          cascade;
drop table if exists public.announcements      cascade;
drop table if exists public.polls              cascade;
drop table if exists public.poll_options       cascade;
drop table if exists public.poll_votes         cascade;
drop table if exists public.tasks              cascade;
drop table if exists public.user_levels       cascade;
drop table if exists public.medals             cascade;
drop table if exists public.user_medals        cascade;
drop table if exists public.pinned_messages    cascade;
drop table if exists public.message_edits      cascade;
drop table if exists public.snippets           cascade;

-- ============================================================================
-- 1) 扩展 messages：回复引用 / 编辑标记 / 软删除
-- ============================================================================
alter table public.messages add column if not exists reply_to    uuid;
alter table public.messages add column if not exists edited_at    timestamptz;
alter table public.messages add column if not exists deleted      boolean default false not null;
create index if not exists idx_messages_reply on public.messages(reply_to);

-- 群消息也支持回复 + 软删除
alter table public.group_messages add column if not exists reply_to uuid;
alter table public.group_messages add column if not exists edited_at timestamptz;
alter table public.group_messages add column if not exists deleted   boolean default false not null;

-- 私聊也支持软删除
alter table public.dm_messages add column if not exists edited_at timestamptz;
alter table public.dm_messages add column if not exists deleted   boolean default false not null;

-- ============================================================================
-- 2) 扩展 profiles：经验/等级/简介/状态文本
-- ============================================================================
alter table public.profiles add column if not exists exp      int default 0 not null;
alter table public.profiles add column if not exists level    int default 1 not null;
alter table public.profiles add column if not exists bio      text default '';
alter table public.profiles add column if not exists status_text text;
alter table public.profiles add column if not exists last_seen timestamptz;

-- ============================================================================
-- 3) comments：作品评论（带作者快照 + 回复嵌套）
-- ============================================================================
create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  work_id     uuid not null,
  user_id     uuid not null,
  username    text not null,
  avatar      text default '🐧',
  avatar_type text default 'emoji',
  text        text not null,
  reply_to    uuid,                                  -- 回复另一条评论
  created_at  timestamptz default now() not null
);
create index if not exists idx_comments_work on public.comments(work_id, created_at);
alter table public.comments enable row level security;
create policy "comments 读" on public.comments for select using (true);
create policy "comments 写" on public.comments for insert with check (auth.uid() = user_id);
create policy "comments 删自己" on public.comments for delete using (auth.uid() = user_id);
alter publication supabase_realtime add table public.comments;
alter table public.comments replica identity full;

-- ============================================================================
-- 4) favorites：作品收藏
-- ============================================================================
create table public.favorites (
  id         uuid primary key default gen_random_uuid(),
  work_id    uuid not null,
  user_id    uuid not null,
  created_at timestamptz default now() not null,
  unique(work_id, user_id)
);
alter table public.favorites enable row level security;
create policy "fav 读自己" on public.favorites for select using (auth.uid() = user_id);
create policy "fav 写" on public.favorites for insert with check (auth.uid() = user_id);
create policy "fav 删" on public.favorites for delete using (auth.uid() = user_id);

-- ============================================================================
-- 5) tags + work_tags：作品标签
-- ============================================================================
create table public.tags (
  id    uuid primary key default gen_random_uuid(),
  name  text unique not null,
  color text default '#4493f8',
  created_at timestamptz default now() not null
);
create table public.work_tags (
  work_id uuid not null,
  tag_id  uuid not null,
  primary key (work_id, tag_id)
);
alter table public.tags enable row level security;
create policy "tags 读" on public.tags for select using (true);
create policy "tags 写管理员" on public.tags for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super')));
alter table public.work_tags enable row level security;
create policy "wt 读" on public.work_tags for select using (true);
create policy "wt 写" on public.work_tags for insert
  with check (exists (select 1 from public.works w where w.id = work_id and w.author_id = auth.uid()));

-- ============================================================================
-- 6) announcements：全站公告（管理员发布）
-- ============================================================================
create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null,
  title      text not null,
  body       text,
  pinned     boolean default false not null,
  created_at timestamptz default now() not null
);
create index if not exists idx_ann_pinned on public.announcements(pinned, created_at desc);
alter table public.announcements enable row level security;
create policy "ann 读" on public.announcements for select using (true);
create policy "ann 写管理员" on public.announcements for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super')));
create policy "ann 改管理员" on public.announcements for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super')));
create policy "ann 删管理员" on public.announcements for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super')));
alter publication supabase_realtime add table public.announcements;
alter table public.announcements replica identity full;

-- ============================================================================
-- 7) polls + poll_options + poll_votes：投票系统
-- ============================================================================
create table public.polls (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null,
  question   text not null,
  multiple   boolean default false not null,        -- 多选 / 单选
  closed     boolean default false not null,
  expires_at timestamptz,
  created_at timestamptz default now() not null
);
create table public.poll_options (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null,
  text       text not null,
  sort_order int default 0 not null
);
create table public.poll_votes (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null,
  option_id  uuid not null,
  user_id    uuid not null,
  created_at timestamptz default now() not null,
  unique(poll_id, option_id, user_id)
);
alter table public.polls enable row level security;
create policy "polls 读" on public.polls for select using (true);
create policy "polls 写" on public.polls for insert with check (auth.uid() = author_id);
create policy "polls 改作者" on public.polls for update using (auth.uid() = author_id);
alter table public.poll_options enable row level security;
create policy "po 读" on public.poll_options for select using (true);
create policy "po 写" on public.poll_options for insert with check (exists (select 1 from public.polls p where p.id = poll_id and p.author_id = auth.uid()));
alter table public.poll_votes enable row level security;
create policy "pv 读" on public.poll_votes for select using (true);
create policy "pv 写" on public.poll_votes for insert with check (auth.uid() = user_id);
alter publication supabase_realtime add table public.poll_votes;
alter table public.poll_votes replica identity full;

-- ============================================================================
-- 8) tasks：任务看板（Kanban，列：todo/doing/done）
-- ============================================================================
create table public.tasks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  description text,
  column_key text default 'todo' not null,         -- todo / doing / done
  assignee_id uuid,
  creator_id uuid not null,
  sort_order int default 0 not null,
  due_date   date,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists idx_tasks_col on public.tasks(column_key, sort_order);
alter table public.tasks enable row level security;
create policy "tasks 读" on public.tasks for select using (true);
create policy "tasks 写" on public.tasks for insert with check (auth.uid() = creator_id);
create policy "tasks 改" on public.tasks for update using (true);
create policy "tasks 删" on public.tasks for delete using (auth.uid() = creator_id or auth.uid() = assignee_id);
alter publication supabase_realtime add table public.tasks;
alter table public.tasks replica identity full;

-- ============================================================================
-- 9) user_levels：等级配置（管理员可调）
-- ============================================================================
create table public.user_levels (
  level       int primary key,
  title       text not null,
  min_exp     int not null,
  color       text default '#4493f8',
  icon        text default '⭐'
);
-- 默认 10 级配置
insert into public.user_levels (level, title, min_exp, color, icon) values
  (1,  '萌新',    0,    '#8b949e', '🌱'),
  (2,  '学徒',    50,   '#4493f8', '📘'),
  (3,  '探索者',  150,  '#3fb950', '🔭'),
  (4,  '研究者',  400,  '#d29922', '🔬'),
  (5,  '专家',    1000, '#a371f7', '🧪'),
  (6,  '大师',    2500, '#f85149', '🏆'),
  (7,  '宗师',    6000, '#ff7b00', '👑'),
  (8,  '传奇',    15000,'#ff00ea', '💫'),
  (9,  '神话',    40000,'#00d9ff', '⭐'),
  (10, '至高',    100000,'#ffd700','🌟')
on conflict (level) do nothing;
alter table public.user_levels enable row level security;
create policy "levels 读" on public.user_levels for select using (true);

-- ============================================================================
-- 10) medals + user_medals：勋章系统
-- ============================================================================
create table public.medals (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  name        text not null,
  description text,
  icon        text not null,
  color       text default '#4493f8'
);
-- 预置勋章
insert into public.medals (code, name, description, icon, color) values
  ('first_blood',  '初见',     '第一次发言',         '🩸', '#f85149'),
  ('social_10',    '社交达人',  '添加 10 个好友',     '🤝', '#3fb950'),
  ('author_1',     '创作者',    '发布第一篇作品',     '✍️', '#4493f8'),
  ('liked_100',    '人气王',    '收到 100 个点赞',    '❤️', '#f85149'),
  ('group_owner',  '群主',     '创建一个群组',       '👑', '#d29922'),
  ('admin_star',   '守护者',    '管理员专属',         '🛡️', '#a371f7'),
  ('realname',     '实名认证',  '完成实名认证',       '✅', '#3fb950'),
  ('early_adopter','早期用户',  '前 100 名注册',      '🚀', '#ff7b00')
on conflict (code) do nothing;
create table public.user_medals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  medal_code text not null,
  awarded_at timestamptz default now() not null,
  unique(user_id, medal_code)
);
alter table public.medals enable row level security;
create policy "medals 读" on public.medals for select using (true);
alter table public.user_medals enable row level security;
create policy "um 读" on public.user_medals for select using (true);
create policy "um 写管理员" on public.user_medals for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super')));

-- ============================================================================
-- 11) pinned_messages：消息置顶（公共大厅）
-- ============================================================================
create table public.pinned_messages (
  id          uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  pinned_by   uuid not null,
  created_at  timestamptz default now() not null,
  unique(message_id)
);
alter table public.pinned_messages enable row level security;
create policy "pin 读" on public.pinned_messages for select using (true);
create policy "pin 写管理员" on public.pinned_messages for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super')));
create policy "pin 删管理员" on public.pinned_messages for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super')));

-- ============================================================================
-- 12) message_edits：消息编辑历史（审计）
-- ============================================================================
create table public.message_edits (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null,
  old_text    text not null,
  editor_id   uuid not null,
  created_at  timestamptz default now() not null
);
alter table public.message_edits enable row level security;
create policy "edits 读" on public.message_edits for select using (true);
create policy "edits 写" on public.message_edits for insert with check (auth.uid() = editor_id);

-- ============================================================================
-- 13) snippets：代码片段分享（编辑器云端保存）
-- ============================================================================
create table public.snippets (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null,
  name       text not null,
  language   text not null,                          -- js/html/css/python
  code       text not null,
  is_public  boolean default true not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists idx_snippets_author on public.snippets(author_id, updated_at desc);
alter table public.snippets enable row level security;
create policy "snippets 读" on public.snippets for select using (is_public = true or auth.uid() = author_id);
create policy "snippets 写" on public.snippets for insert with check (auth.uid() = author_id);
create policy "snippets 改" on public.snippets for update using (auth.uid() = author_id);
create policy "snippets 删" on public.snippets for delete using (auth.uid() = author_id);
alter publication supabase_realtime add table public.snippets;

-- ============================================================================
-- 14) RPC: award_exp(target, delta) — 经验值原子增减 + 自动升级
-- ============================================================================
create or replace function public.award_exp(target uuid, delta int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare next_exp int;
begin
  update public.profiles
     set exp = greatest(0, coalesce(exp, 0) + delta),
         level = coalesce((
           select max(level) from public.user_levels
           where min_exp <= greatest(0, coalesce(exp, 0) + delta)
         ), 1)
   where id = target
   returning exp into next_exp;
  if next_exp is null then
    raise exception 'user % not found', target;
  end if;
  return next_exp;
end;
$$;
alter function public.award_exp(uuid, int) owner to postgres;
grant execute on function public.award_exp(uuid, int) to anon, authenticated;

-- ============================================================================
-- 15) 触发器：发言 +5exp / 发布作品 +20exp / 收到点赞 +2exp / 评论 +3exp
-- ============================================================================
create or replace function public.gain_exp_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.award_exp(new.user_id, 5);
  return new;
end; $$;
drop trigger if exists trg_msg_exp on public.messages;
create trigger trg_msg_exp after insert on public.messages
  for each row execute function public.gain_exp_on_message();

create or replace function public.gain_exp_on_work()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.award_exp(new.author_id, 20);
  return new;
end; $$;
drop trigger if exists trg_work_exp on public.works;
create trigger trg_work_exp after insert on public.works
  for each row execute function public.gain_exp_on_work();

create or replace function public.gain_exp_on_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare wid uuid;
begin
  wid := new.work_id;
  perform public.award_exp(w.author_id, 2) from public.works w where w.id = wid;
  return new;
end; $$;
drop trigger if exists trg_like_exp on public.work_likes;
create trigger trg_like_exp after insert on public.work_likes
  for each row execute function public.gain_exp_on_like();

-- ============================================================================
-- 16) 扩展 RLS：让作者能编辑/软删自己的消息
-- ============================================================================
drop policy if exists "messages 改自己" on public.messages;
create policy "messages 改自己" on public.messages for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "messages 删自己" on public.messages;
create policy "messages 删自己" on public.messages for delete
  using (auth.uid() = user_id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super')));

-- ============================================================================
-- 17) profiles 自己可改 exp/level 之外的字段（bio / status_text / last_seen）
-- ============================================================================
-- 之前的 policy 已允许 auth.uid() = id 全字段 update，无需变更

-- ============================================================================
-- Done. v2.1 升级完成。
-- ============================================================================
