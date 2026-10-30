-- 管理员统计模块：营员白名单 + checkin_sync 管理员只读 + 汇总 RPC
-- 适用：现有 checkin_sync 已上线后的增量迁移；不改动 storage-v3 本地契约。

begin;

-- 1. 打卡同步表（幂等保留；已存在时不会重建）
create table if not exists public.checkin_sync (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  user_code text not null,
  start_date date not null,
  records jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.checkin_sync enable row level security;

-- 普通营员仍可读写自己的一行；管理员额外获得只读权限。
grant select, insert, update on public.checkin_sync to authenticated;

drop policy if exists "checkin_sync_select_own_admin_module" on public.checkin_sync;
create policy "checkin_sync_select_own_admin_module"
on public.checkin_sync
for select
to authenticated
using (auth_user_id = auth.uid());

drop policy if exists "checkin_sync_insert_own_admin_module" on public.checkin_sync;
create policy "checkin_sync_insert_own_admin_module"
on public.checkin_sync
for insert
to authenticated
with check (auth_user_id = auth.uid());

drop policy if exists "checkin_sync_update_own_admin_module" on public.checkin_sync;
create policy "checkin_sync_update_own_admin_module"
on public.checkin_sync
for update
to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

-- 2. 管理员白名单：只允许本人在数据库 API 中读取自己的白名单记录。
create table if not exists public.camp_admins (
  email text primary key,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.camp_admins enable row level security;
create unique index if not exists camp_admins_email_lower_key
  on public.camp_admins (lower(email));
revoke all on public.camp_admins from anon, authenticated;
grant select on public.camp_admins to authenticated;

drop policy if exists "camp_admins_self_select_admin_module" on public.camp_admins;
create policy "camp_admins_self_select_admin_module"
on public.camp_admins
for select
to authenticated
using (
  is_active
  and lower(email) = lower(auth.jwt() ->> 'email')
);

drop policy if exists "checkin_sync_admin_readonly_admin_module" on public.checkin_sync;
create policy "checkin_sync_admin_readonly_admin_module"
on public.checkin_sync
for select
to authenticated
using (
  exists (
    select 1
    from public.camp_admins a
    where a.is_active
      and lower(a.email) = lower(auth.jwt() ->> 'email')
  )
);

-- 3. 管理员汇总 RPC：在数据库侧验证白名单并连接 auth.users 取得邮箱。
-- 前端只使用 anon key 调用此函数，不接触 service_role key。
create or replace function public.admin_checkin_overview()
returns table (
  auth_user_id uuid,
  email text,
  user_code text,
  start_date date,
  records jsonb,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not exists (
    select 1
    from public.camp_admins a
    where a.is_active
      and lower(a.email) = lower(auth.jwt() ->> 'email')
  ) then
    raise exception '当前邮箱不是管理员';
  end if;

  return query
  select
    c.auth_user_id,
    u.email::text,
    c.user_code,
    c.start_date,
    c.records,
    c.updated_at
  from public.checkin_sync c
  join auth.users u on u.id = c.auth_user_id
  order by c.updated_at desc;
end;
$function$;

revoke all on function public.admin_checkin_overview() from public, anon, authenticated;
grant execute on function public.admin_checkin_overview() to authenticated;

commit;

-- 4. 把自己加入管理员白名单（在 SQL Editor 执行；替换邮箱）。
-- insert into public.camp_admins (email)
-- values ('your-admin@example.com')
-- on conflict (email) do update set is_active = true;
