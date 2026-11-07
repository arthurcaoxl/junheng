begin;

-- 运行期业务配置仅由受控服务端维护；客户端无表权限。
create table if not exists public.system_configs (
  config_key text primary key,
  config_value jsonb not null,
  updated_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.system_configs enable row level security;
revoke all on public.system_configs from anon, authenticated;

insert into public.system_configs (config_key, config_value) values
  ('max_checkins_per_box', '21'::jsonb),
  ('default_box_spec', '"21_bags"'::jsonb)
on conflict (config_key) do nothing;

create table if not exists public.system_config_audit (
  audit_id uuid primary key default gen_random_uuid(),
  config_key text not null,
  old_value jsonb,
  new_value jsonb not null,
  changed_by uuid references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now()
);

alter table public.system_config_audit enable row level security;
revoke all on public.system_config_audit from anon, authenticated;

create or replace function public.audit_system_config_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  insert into public.system_config_audit (
    config_key,
    old_value,
    new_value,
    changed_by
  ) values (
    NEW.config_key,
    case when TG_OP = 'UPDATE' then OLD.config_value else null end,
    NEW.config_value,
    auth.uid()
  );
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  return NEW;
end;
$function$;

drop trigger if exists system_config_audit_mutation on public.system_configs;
create trigger system_config_audit_mutation
before insert or update on public.system_configs
for each row execute function public.audit_system_config_mutation();

-- 历史码保留原生命周期，只补齐新额度快照：未消耗、剩余一个完整盒规格。
alter table public.box_codes
  add column if not exists max_checkins integer,
  add column if not exists used_checkins integer,
  add column if not exists box_spec text;

update public.box_codes
set
  max_checkins = (
    select c.config_value #>> '{}'
    from public.system_configs c
    where c.config_key = 'max_checkins_per_box'
  )::integer,
  version = version + 1
where max_checkins is null;

update public.box_codes
set used_checkins = 0,
  version = version + 1
where used_checkins is null;

update public.box_codes
set
  box_spec = (
    select c.config_value #>> '{}'
    from public.system_configs c
    where c.config_key = 'default_box_spec'
  ),
  version = version + 1
where box_spec is null;

alter table public.box_codes
  alter column max_checkins set default 21,
  alter column max_checkins set not null,
  alter column used_checkins set default 0,
  alter column used_checkins set not null,
  alter column box_spec set default '21_bags',
  alter column box_spec set not null,
  add constraint box_codes_checkin_quota_check check (
    max_checkins > 0
    and used_checkins >= 0
    and used_checkins <= max_checkins
  ),
  add constraint box_codes_box_spec_check check (
    box_spec in ('21_bags', '30_bags')
  );

-- 一盒一物理日一条扣次记录；客户端不能直接读写或删除。
create table public.checkin_daily_claims (
  code_id uuid not null references public.box_codes(code_id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  physical_day date not null,
  used_checkins integer not null check (used_checkins > 0),
  created_at timestamptz not null default now(),
  primary key (code_id, physical_day)
);

alter table public.checkin_daily_claims enable row level security;
revoke all on public.checkin_daily_claims from anon, authenticated;

alter table public.box_code_events
  drop constraint if exists box_code_events_event_type_check;

alter table public.box_code_events
  add constraint box_code_events_event_type_check check (
    event_type in (
      'CodeActivationRequested',
      'CodeActivated',
      'CodeActivationRejected',
      'CodeReplacementIssued',
      'CodeRevoked',
      'CoachCaseGenerated',
      'UserCoachRelationAssigned',
      'CheckinVerified'
    )
  );

-- 防止已激活用户绕过 RPC 直接修改云端打卡；无变化的保持性同步仍兼容。
create or replace function public.guard_checkin_sync_quota()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if exists (
    select 1
    from public.box_codes b
    join public.code_activations a on a.code_id = b.code_id
    where a.auth_user_id = NEW.auth_user_id
      and b.state = 'active'
  ) and coalesce(current_setting('app.checkin_quota_verified', true), '') <> 'on'
    and (
      TG_OP = 'INSERT'
      or NEW.start_date is distinct from OLD.start_date
      or NEW.records is distinct from OLD.records
      or NEW.height_cm is distinct from OLD.height_cm
      or NEW.initial_weight_kg is distinct from OLD.initial_weight_kg
    )
  then
    raise exception 'CHECKIN_RPC_REQUIRED';
  end if;
  return NEW;
end;
$function$;

drop trigger if exists checkin_sync_quota_guard on public.checkin_sync;
create trigger checkin_sync_quota_guard
before insert or update on public.checkin_sync
for each row execute function public.guard_checkin_sync_quota();

create or replace function public.get_checkin_quota()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_code public.box_codes%rowtype;
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select b.* into v_code
  from public.box_codes b
  join public.code_activations a on a.code_id = b.code_id
  where a.auth_user_id = v_auth_user_id
  order by a.activated_at desc nulls last, a.created_at desc, b.code_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'errorCode', 'CHECKIN_CODE_NOT_AVAILABLE');
  end if;

  if v_code.state <> 'active' then
    return jsonb_build_object('ok', false, 'errorCode', 'CHECKIN_NOT_ACTIVE');
  end if;

  return jsonb_build_object(
    'ok', true,
    'maxCheckins', v_code.max_checkins,
    'usedCheckins', v_code.used_checkins,
    'remainingCheckins', greatest(v_code.max_checkins - v_code.used_checkins, 0),
    'boxSpec', v_code.box_spec
  );
end;
$function$;

create or replace function public.verify_checkin(
  p_start_date date,
  p_records jsonb,
  p_height_cm numeric,
  p_initial_weight_kg numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_code public.box_codes%rowtype;
  v_physical_day date := (now() at time zone 'Asia/Shanghai')::date;
  v_claimed_code_id uuid;
  v_idempotent boolean := false;
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_start_date is null or jsonb_typeof(p_records) <> 'object' then
    raise exception 'CHECKIN_SNAPSHOT_INVALID';
  end if;

  perform 1
  from public.checkin_sync s
  where s.auth_user_id = v_auth_user_id;
  if not found then
    raise exception 'CHECKIN_PROFILE_REQUIRED';
  end if;

  -- 行锁覆盖状态、幂等、额度和扣次全过程，并发连点不能越过额度边界。
  select b.* into v_code
  from public.box_codes b
  join public.code_activations a on a.code_id = b.code_id
  where a.auth_user_id = v_auth_user_id
  order by a.activated_at desc nulls last, a.created_at desc, b.code_id
  limit 1
  for update of b;

  if not found then
    raise exception 'CHECKIN_CODE_NOT_AVAILABLE';
  end if;

  if v_code.state <> 'active' then
    raise exception 'CHECKIN_NOT_ACTIVE';
  end if;

  perform 1
  from public.checkin_daily_claims d
  where d.code_id = v_code.code_id
    and d.physical_day = v_physical_day;

  if found then
    v_idempotent := true;
  else
    if v_code.used_checkins >= v_code.max_checkins then
      raise exception 'CHECKIN_QUOTA_EXHAUSTED';
    end if;

    insert into public.checkin_daily_claims (
      code_id,
      auth_user_id,
      physical_day,
      used_checkins
    ) values (
      v_code.code_id,
      v_auth_user_id,
      v_physical_day,
      v_code.used_checkins + 1
    )
    on conflict (code_id, physical_day) do nothing
    returning code_id into v_claimed_code_id;

    if v_claimed_code_id is null then
      v_idempotent := true;
    else
      update public.box_codes
      set
        used_checkins = v_code.used_checkins + 1,
        version = version + 1,
        updated_at = now()
      where code_id = v_code.code_id;

      v_code.used_checkins := v_code.used_checkins + 1;

      insert into public.box_code_events (
        event_type,
        code_id,
        activation_id,
        actor_auth_user_id,
        metadata
      ) values (
        'CheckinVerified',
        v_code.code_id,
        v_code.activation_id,
        v_auth_user_id,
        jsonb_build_object(
          'physicalDay', v_physical_day,
          'usedCheckins', v_code.used_checkins,
          'maxCheckins', v_code.max_checkins
        )
      );
    end if;
  end if;

  -- 同日重复保存仍保存最新快照；任一步失败，整个函数事务回滚。
  perform set_config('app.checkin_quota_verified', 'on', true);
  update public.checkin_sync
  set
    start_date = p_start_date,
    records = p_records,
    height_cm = p_height_cm,
    initial_weight_kg = p_initial_weight_kg,
    updated_at = now()
  where auth_user_id = v_auth_user_id;

  if v_idempotent then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'physicalDay', v_physical_day,
      'maxCheckins', v_code.max_checkins,
      'usedCheckins', v_code.used_checkins,
      'remainingCheckins', greatest(v_code.max_checkins - v_code.used_checkins, 0),
      'boxSpec', v_code.box_spec
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'physicalDay', v_physical_day,
    'maxCheckins', v_code.max_checkins,
    'usedCheckins', v_code.used_checkins,
    'remainingCheckins', greatest(v_code.max_checkins - v_code.used_checkins, 0),
    'boxSpec', v_code.box_spec
  );
end;
$function$;

revoke all on function public.get_checkin_quota()
from public, anon, authenticated;
revoke all on function public.verify_checkin(date, jsonb, numeric, numeric)
from public, anon, authenticated;

grant execute on function public.get_checkin_quota() to authenticated;
grant execute on function public.verify_checkin(date, jsonb, numeric, numeric) to authenticated;

commit;
