begin;

-- 联系方式由受控服务端维护，浏览器不得直读或直写。
create table public.coach_contact_profiles (
  coach_id uuid primary key references auth.users(id) on delete restrict,
  phone text,
  wechat text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.coach_contact_profiles enable row level security;
revoke all on public.coach_contact_profiles from anon, authenticated;

create or replace function public.get_my_coach_contact_v1()
returns table (phone text, wechat text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.phone, c.wechat
  from public.user_coach_relation r
  join public.coach_contact_profiles c
    on r.referrer_id = c.coach_id
  where r.auth_user_id = auth.uid()
    and r.valid_to is null
  limit 1;
$$;

revoke all on function public.get_my_coach_contact_v1() from public, anon, authenticated;
grant execute on function public.get_my_coach_contact_v1() to authenticated;

comment on function public.get_my_coach_contact_v1() is
  '仅返回 auth.uid() 当前有效归属教练的手机号与微信号；无归属时返回空。';

commit;
