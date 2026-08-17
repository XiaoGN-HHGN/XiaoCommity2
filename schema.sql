-- ============================================================================
-- Xiao 社区 2.0 · Supabase 数据库 Schema
-- 设计原则：前端字段名 = SQL 列名，零映射层；不带 FK，避免 23503 冲突；
--          作者快照列直接写在消息表里，渲染零 JOIN；RLS 最简；
--          Realtime publication 直接在 SQL 里启用。
--
-- 使用方式：登录 Supabase Dashboard → SQL Editor → 粘贴整段 → Run
-- 注意：会 drop 你之前在 public schema 建的旧表（如果你确认无重要数据）
-- ============================================================================

-- 0) 清理旧表 + 旧函数 + 旧 trigger（2.0 重置）
drop table if exists public.profiles           cascade;
drop table if exists public.messages           cascade;
drop table if exists public.dm_messages        cascade;
drop table if exists public.groups              cascade;
drop table if exists public.group_members      cascade;
drop table if exists public.group_messages     cascade;
drop table if exists public.works              cascade;
drop table if exists public.work_likes        cascade;
drop table if exists public.download_requests cascade;
drop table if exists public.friend_requests   cascade;
drop table if exists public.friendships       cascade;
drop table if exists public.blocks             cascade;
drop table if exists public.reports            cascade;
drop table if exists public.admin_logs         cascade;

drop function if exists public.adjust_coin(uuid, numeric);
drop function if exists public.handle_new_user();
drop trigger if exists on_auth_user_created on auth.users;

-- ============================================================================
-- 1) profiles：用户主资料表
--    id 直接 = auth.users.id，由 trigger handle_new_user 自动建行
-- ============================================================================
create table public.profiles (
  id            uuid primary key,                       -- = auth.users.id
  username      text unique not null,
  phone         text,
  avatar        text default '🐧',                       -- emoji 或 dataurl
  avatar_type   text default 'emoji',                    -- emoji / dataurl
  balance       numeric(12,2) default 10.00 not null,    -- Ttpx_A 余额，新用户 10 枚
  role          text default 'user' not null,            -- user / admin / super
  banned        jsonb,                                   -- {"perm":true} 或 {"until":1735xxx}
  muted         jsonb,                                   -- {"perm":true} 或 {"until":1735xxx}
  realname      boolean default false,                  -- 是否实名认证
  realname_info text,                                    -- 实名信息（姓名+证件号 hash）
  created_at    timestamptz default now() not null
);
comment on table public.profiles is 'Xiao 2.0 用户主资料表，id=auth.users.id';

-- ============================================================================
-- 2) messages：公共大厅消息（带作者快照，渲染零 JOIN）
-- ============================================================================
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,                             -- = profiles.id
  username    text not null,                             -- 作者快照
  avatar      text default '🐧',                         -- 作者快照
  avatar_type text default 'emoji',
  text        text not null,
  created_at  timestamptz default now() not null
);

-- ============================================================================
-- 3) dm_messages：私聊消息（带 pair_key 简化查询 + 作者快照）
-- ============================================================================
create table public.dm_messages (
  id          uuid primary key default gen_random_uuid(),
  pair_key    text not null,                             -- [a,b].sort().join('__')
  from_id     uuid not null,
  to_id       uuid not null,
  from_name   text,
  from_avatar text,
  text        text not null,
  created_at  timestamptz default now() not null
);
create index if not exists idx_dm_pair on public.dm_messages(pair_key);
create index if not exists idx_dm_created on public.dm_messages(created_at);

-- ============================================================================
-- 4) groups：私有群组（20 人上限，消耗 20 代币创建）
-- ============================================================================
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null,
  name        text not null,
  max_member  int default 20 not null,
  created_at  timestamptz default now() not null
);

-- ============================================================================
-- 5) group_members：群成员（含群管理员角色）
-- ============================================================================
create table public.group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null,
  user_id    uuid not null,
  role       text default 'member' not null,             -- owner / admin / member
  status     text default 'pending' not null,            -- pending / approved / kicked
  joined_at  timestamptz default now() not null,
  unique(group_id, user_id)
);

-- ============================================================================
-- 6) group_messages：群消息（带作者快照）
-- ============================================================================
create table public.group_messages (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null,
  user_id     uuid not null,
  username    text,
  avatar      text,
  avatar_type text default 'emoji',
  text        text not null,
  created_at  timestamptz default now() not null
);
create index if not exists idx_gm_group on public.group_messages(group_id, created_at);

-- ============================================================================
-- 7) works：作品（论文/文件夹/代码，定价/免费，按需加载）
-- ============================================================================
create table public.works (
  id          uuid primary key default gen_random_uuid(),
  author_id  uuid not null,
  name        text not null,
  description text,
  category    text not null,                            -- paper / folder / code
  price       numeric(12,2) default 0 not null,         -- 0=免费
  file_name   text,
  file_path   text,                                      -- Storage 路径
  file_type   text,                                      -- txt/python/js/html/css/...
  status      text default 'pending' not null,          -- pending / approved / rejected
  likes       int default 0 not null,
  created_at  timestamptz default now() not null
);
create index if not exists idx_works_status on public.works(status, created_at);

-- ============================================================================
-- 8) work_likes：点赞（unique 防重复，每次 +0.01 给作者）
-- ============================================================================
create table public.work_likes (
  id         uuid primary key default gen_random_uuid(),
  work_id    uuid not null,
  user_id    uuid not null,
  created_at timestamptz default now() not null,
  unique(work_id, user_id)
);

-- ============================================================================
-- 9) download_requests：下载申请（需作者同意，游戏分区需实名）
-- ============================================================================
create table public.download_requests (
  id         uuid primary key default gen_random_uuid(),
  work_id    uuid not null,
  user_id    uuid not null,
  status     text default 'pending' not null,           -- pending / approved / rejected
  created_at timestamptz default now() not null,
  unique(work_id, user_id)
);

-- ============================================================================
-- 10) friend_requests：好友申请
-- ============================================================================
create table public.friend_requests (
  id         uuid primary key default gen_random_uuid(),
  from_id    uuid not null,
  to_id      uuid not null,
  status     text default 'pending' not null,           -- pending / accepted / rejected
  created_at timestamptz default now() not null,
  unique(from_id, to_id)
);

-- ============================================================================
-- 11) friendships：已建立好友关系（双向各插一行）
-- ============================================================================
create table public.friendships (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  friend_id  uuid not null,
  created_at timestamptz default now() not null,
  unique(user_id, friend_id)
);

-- ============================================================================
-- 12) blocks：拉黑关系
-- ============================================================================
create table public.blocks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  blocked_id uuid not null,
  created_at timestamptz default now() not null,
  unique(user_id, blocked_id)
);

-- ============================================================================
-- 13) reports：举报（全页面支持，进后台审核）
-- ============================================================================
create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid not null,
  target_type   text not null,                          -- user / message / work / group
  target_id     text,                                   -- 字符串，兼容 uuid 与 bigint
  reason        text not null,
  status        text default 'pending' not null,        -- pending / resolved
  action        text,
  note          text,
  resolved_at   timestamptz,
  created_at    timestamptz default now() not null
);

-- ============================================================================
-- 14) admin_logs：管理员操作日志（所有奖惩/审核操作留存）
-- ============================================================================
create table public.admin_logs (
  id              uuid primary key default gen_random_uuid(),
  operator_id     uuid not null,
  action          text not null,                        -- ban / unban / mute / unmute / adjust_coin / approve_work / reject_work / resolve_report
  target_user_id  uuid,
  target_id       text,                                 -- 通用 id
  reason          text,
  meta            jsonb,
  created_at      timestamptz default now() not null
);
create index if not exists idx_logs_created on public.admin_logs(created_at desc);

-- ============================================================================
-- RPC: adjust_coin(target, delta) — 原子增减代币，点赞 +0.01 / 建群 -20 / 管理员奖惩都用它
-- ============================================================================
create or replace function public.adjust_coin(target uuid, delta numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare next_bal numeric;
begin
  update public.profiles
     set balance = coalesce(balance, 0) + delta
   where id = target
   returning balance into next_bal;
  if next_bal is null then
    raise exception 'user % not found', target;
  end if;
  return next_bal;
end;
$$;
alter function public.adjust_coin(uuid, numeric) owner to postgres;
grant execute on function public.adjust_coin(uuid, numeric) to anon, authenticated;

-- ============================================================================
-- Trigger: handle_new_user — 新用户注册后自动建 profile（balance=10, role=user）
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, phone, avatar, avatar_type, balance, role, created_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'phone',
    coalesce(new.raw_user_meta_data ->> 'avatar', '🐧'),
    coalesce(new.raw_user_meta_data ->> 'avatar_type', 'emoji'),
    10.00,
    'user',
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- RLS：最简策略
--   - profiles/messages/groups/works 等公共内容：anon+authenticated 可读
--   - 自己的行：自己可写
--   - 管理员：通过 role='admin' or 'super' 全权
-- ============================================================================

-- profiles
alter table public.profiles enable row level security;
create policy "profiles 读"  on public.profiles for select using (true);
create policy "profiles 自己写" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- messages：公共大厅，登录后可写（user_id 必须是自己）
alter table public.messages enable row level security;
create policy "messages 读" on public.messages for select using (true);
create policy "messages 写" on public.messages for insert with check (auth.uid() = user_id);

-- dm_messages
alter table public.dm_messages enable row level security;
create policy "dm 读自己相关" on public.dm_messages for select
  using (auth.uid() = from_id or auth.uid() = to_id);
create policy "dm 写" on public.dm_messages for insert
  with check (auth.uid() = from_id);

-- groups
alter table public.groups enable row level security;
create policy "groups 读" on public.groups for select using (true);
create policy "groups 写" on public.groups for insert with check (auth.uid() = owner_id);

-- group_members
alter table public.group_members enable row level security;
create policy "gm 读" on public.group_members for select using (true);
create policy "gm 写" on public.group_members for insert with check (auth.uid() = user_id);
create policy "gm 改" on public.group_members for update using (auth.uid() = user_id or auth.uid() = (select owner_id from public.groups where id = group_id));

-- group_messages
alter table public.group_messages enable row level security;
create policy "gmsg 读" on public.group_messages for select using (true);
create policy "gmsg 写" on public.group_messages for insert with check (auth.uid() = user_id);

-- works
alter table public.works enable row level security;
create policy "works 读" on public.works for select using (true);
create policy "works 写" on public.works for insert with check (auth.uid() = author_id);
create policy "works 改" on public.works for update using (auth.uid() = author_id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super')));

-- work_likes
alter table public.work_likes enable row level security;
create policy "likes 读" on public.work_likes for select using (true);
create policy "likes 写" on public.work_likes for insert with check (auth.uid() = user_id);
create policy "likes 删" on public.work_likes for delete using (auth.uid() = user_id);

-- download_requests
alter table public.download_requests enable row level security;
create policy "dr 读自己" on public.download_requests for select
  using (auth.uid() = user_id or exists (
    select 1 from public.works w where w.id = work_id and w.author_id = auth.uid()
  ) or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super')));
create policy "dr 写" on public.download_requests for insert with check (auth.uid() = user_id);
create policy "dr 改" on public.download_requests for update using (true);

-- friend_requests
alter table public.friend_requests enable row level security;
create policy "fr 读" on public.friend_requests for select
  using (auth.uid() = from_id or auth.uid() = to_id);
create policy "fr 写" on public.friend_requests for insert with check (auth.uid() = from_id);
create policy "fr 改" on public.friend_requests for update using (auth.uid() = to_id);

-- friendships
alter table public.friendships enable row level security;
create policy "fs 读自己" on public.friendships for select using (auth.uid() = user_id or auth.uid() = friend_id);
create policy "fs 写" on public.friendships for insert with check (auth.uid() = user_id or auth.uid() = friend_id);
create policy "fs 删" on public.friendships for delete using (auth.uid() = user_id or auth.uid() = friend_id);

-- blocks
alter table public.blocks enable row level security;
create policy "bl 读自己" on public.blocks for select using (auth.uid() = user_id);
create policy "bl 写" on public.blocks for insert with check (auth.uid() = user_id);
create policy "bl 删" on public.blocks for delete using (auth.uid() = user_id);

-- reports
alter table public.reports enable row level security;
create policy "rep 读管理员" on public.reports for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super')));
create policy "rep 写" on public.reports for insert with check (auth.uid() = reporter_id);
create policy "rep 改管理员" on public.reports for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super')));

-- admin_logs
alter table public.admin_logs enable row level security;
create policy "log 读管理员" on public.admin_logs for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super')));
create policy "log 写" on public.admin_logs for insert with check (true);

-- ============================================================================
-- Realtime：把所有业务表加入 supabase_realtime publication（前端订阅才能推送）
-- ============================================================================
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.dm_messages;
alter publication supabase_realtime add table public.group_messages;
alter publication supabase_realtime add table public.works;
alter publication supabase_realtime add table public.work_likes;
alter publication supabase_realtime add table public.friend_requests;
alter publication supabase_realtime add table public.download_requests;
alter publication supabase_realtime add table public.reports;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.group_members;

-- replica identity full：让 Realtime 推送整行（默认 only PK 不够）
alter table public.messages replica identity full;
alter table public.dm_messages replica identity full;
alter table public.group_messages replica identity full;
alter table public.works replica identity full;
alter table public.work_likes replica identity full;
alter table public.profiles replica identity full;

-- ============================================================================
-- Storage：avatars / works 两个 public bucket（头像 / 作品文件）
-- 如已存在不会重复创建，public=true 允许前端直传
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('works', 'works', true)
on conflict (id) do nothing;

-- Storage RLS：登录用户可上传，所有人可读
create policy "avatars 读" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars 写" on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.role() = 'authenticated');
create policy "works 读" on storage.objects for select using (bucket_id = 'works');
create policy "works 写" on storage.objects for insert
  with check (bucket_id = 'works' and auth.role() = 'authenticated');

-- ============================================================================
-- 超级管理员：手动把你的账号设为 super（注册一次后，把邮箱替换成你的）
-- ============================================================================
-- update public.profiles set role = 'super' where username = '你的用户名';

-- ============================================================================
-- Done. 现在到 Authentication → Providers → Email → 关闭 Confirm email
-- 否则 signUp 后账号会被标记为未确认，登录会报 400。
-- ============================================================================
