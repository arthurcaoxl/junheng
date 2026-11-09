begin;

-- TASK-10.12 模块三：Admin 联系方式、员工最小权限、分配与审计。
alter table public.camp_admins
  add column if not exists version integer not null default 1,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete restrict;

alter table public.camp_admins drop constraint if exists camp_admins_role_allowed;
alter table public.camp_admins
  add constraint camp_admins_role_allowed check (role in ('admin', 'coach', 'staff')),
  add constraint camp_admins_version_positive check (version > 0);

create table public.staff_coach_assignment (
  assignment_id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references auth.users(id) on delete restrict,
  coach_id uuid not null references auth.users(id) on delete restrict,
  state text not null default 'active' check (state in ('active', 'revoked', 'expired')),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  constraint staff_coach_assignment_period check (valid_to is null or valid_to > valid_from)
);

create unique index staff_coach_assignment_one_current
  on public.staff_coach_assignment (staff_id, coach_id)
  where state = 'active' and valid_to is null;

alter table public.staff_coach_assignment enable row level security;
revoke all on public.staff_coach_assignment from anon, authenticated;

create table public.staff_rbac_commands (
  idempotency_key text primary key,
  command_type text not null check (command_type in ('staff_role', 'assignment_create', 'assignment_revoke')),
  payload_hash text not null,
  caller_auth_user_id uuid not null references auth.users(id) on delete restrict,
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.staff_rbac_commands enable row level security;
revoke all on public.staff_rbac_commands from anon, authenticated;

create table public.staff_rbac_audit (
  audit_id uuid primary key default gen_random_uuid(),
  action text not null check (action in (
    'access_denied',
    'staff_role_granted',
    'staff_role_changed',
    'staff_role_deactivated',
    'staff_assignment_created',
    'staff_assignment_revoked',
    'staff_capacity_warning',
    'staff_governance_followup',
    'staff_finance_denied'
  )),
  actor_id uuid references auth.users(id) on delete restrict,
  target_id uuid references auth.users(id) on delete restrict,
  target_role text,
  assignment_id uuid references public.staff_coach_assignment(assignment_id) on delete restrict,
  result text not null,
  reason_code text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.staff_rbac_audit enable row level security;
revoke all on public.staff_rbac_audit from anon, authenticated;

create trigger staff_rbac_audit_append_only
before update or delete on public.staff_rbac_audit
for each row execute function public.prevent_audit_log_mutation();

create or replace function public.staff_rbac_require_admin()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is null then
    insert into public.staff_rbac_audit (action, result, reason_code)
    values ('access_denied', 'denied', 'UNAUTHORIZED');
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id
      and a.role = 'admin'
      and a.is_active
  ) then
    insert into public.staff_rbac_audit (action, actor_id, result, reason_code)
    values ('access_denied', v_auth_user_id, 'denied', 'FORBIDDEN');
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return v_auth_user_id;
end;
$function$;

revoke all on function public.staff_rbac_require_admin() from public, anon, authenticated;

-- 返回类型扩展必须先删除旧签名；旧授权不继承到新函数。
drop function public.admin_get_coach_directory(text);
create or replace function public.admin_get_coach_directory(p_query text)
returns table (coach_id uuid, email text, name text, phone text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_query text := btrim(coalesce(p_query, ''));
begin
  if v_auth_user_id is null or not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if char_length(v_query) < 2 then
    return;
  end if;

  return query
  select
    u.id,
    u.email::text,
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), '')
    ),
    coalesce(nullif(btrim(p.phone), ''), nullif(btrim(u.phone), ''))
  from (
    select distinct r.referrer_id
    from public.user_coach_relation r
    where r.referrer_id is not null
      and r.valid_to is null
  ) coaches
  join auth.users u on u.id = coaches.referrer_id
  left join public.user_profiles p on p.auth_user_id = u.id
  where u.email ilike '%' || v_query || '%'
  order by u.email, u.id
  limit 10;
end;
$function$;

revoke all on function public.admin_get_coach_directory(text) from public, anon, authenticated;
grant execute on function public.admin_get_coach_directory(text) to authenticated;

-- 历史策略只判断白名单有效，必须同步按认证主体和 admin 角色收口。
drop policy if exists "checkin_sync_admin_readonly_admin_module" on public.checkin_sync;
create policy "checkin_sync_admin_readonly_admin_module"
on public.checkin_sync
for select
to authenticated
using (
  exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = auth.uid()
      and a.role = 'admin'
      and a.is_active
  )
);

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
set search_path = public, pg_temp
as $function$
begin
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = auth.uid()
      and a.role = 'admin'
      and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select c.auth_user_id, u.email::text, c.user_code, c.start_date, c.records, c.updated_at
  from public.checkin_sync c
  join auth.users u on u.id = c.auth_user_id
  order by c.updated_at desc;
end;
$function$;

revoke all on function public.admin_checkin_overview() from public, anon, authenticated;
grant execute on function public.admin_checkin_overview() to authenticated;

create or replace function public.admin_get_staff_directory()
returns table (
  staff_id uuid,
  email text,
  is_active boolean,
  version integer,
  coach_count integer,
  camper_count integer,
  assignments jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_admin_id uuid := public.staff_rbac_require_admin();
begin
  return query
  with visible_assignments as (
    select sa.*, u.email::text as coach_email
    from public.staff_coach_assignment sa
    join auth.users u on u.id = sa.coach_id
    where sa.state = 'active'
      and sa.valid_from <= now()
      and (sa.valid_to is null or sa.valid_to > now())
  ),
  assignment_stats as (
    select
      va.staff_id,
      count(*)::integer as coach_count,
      jsonb_agg(
        jsonb_build_object(
          'assignmentId', va.assignment_id,
          'coachId', va.coach_id,
          'coachEmail', va.coach_email,
          'version', va.version
        ) order by va.coach_email, va.assignment_id
      ) as assignments
    from visible_assignments va
    group by va.staff_id
  ),
  camper_stats as (
    select va.staff_id, count(distinct r.auth_user_id)::integer as camper_count
    from visible_assignments va
    left join public.user_coach_relation r
      on r.referrer_id = va.coach_id
      and r.valid_to is null
    group by va.staff_id
  )
  select
    a.auth_user_id,
    a.email,
    a.is_active,
    a.version,
    coalesce(s.coach_count, 0),
    coalesce(c.camper_count, 0),
    coalesce(s.assignments, '[]'::jsonb)
  from public.camp_admins a
  left join assignment_stats s on s.staff_id = a.auth_user_id
  left join camper_stats c on c.staff_id = a.auth_user_id
  where a.role = 'staff'
    and a.auth_user_id is not null
  order by a.email, a.auth_user_id;
end;
$function$;

revoke all on function public.admin_get_staff_directory() from public, anon, authenticated;
grant execute on function public.admin_get_staff_directory() to authenticated;

create or replace function public.admin_set_staff_role(
  p_email text,
  p_is_active boolean,
  p_expected_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_admin_id uuid := public.staff_rbac_require_admin();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_payload_hash text;
  v_command_type text := 'staff_role';
  v_target_id uuid;
  v_target_email text;
  v_existing public.camp_admins%rowtype;
  v_found boolean := false;
  v_action text;
  v_version integer;
  v_result jsonb;
begin
  if v_email = '' or position('@' in v_email) = 0 or p_is_active is null
    or p_expected_version is null or p_expected_version < 0
    or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'ROLE_ASSIGNMENT_CONFLICT';
  end if;

  v_payload_hash := encode(digest(
    'staff_role|' || v_email || '|' || p_is_active::text || '|' || p_expected_version::text,
    'sha256'
  ), 'hex');
  select c.result into v_result
  from public.staff_rbac_commands c
  where c.idempotency_key = p_idempotency_key
  for update;
  if found then
    if exists (
      select 1 from public.staff_rbac_commands c
      where c.idempotency_key = p_idempotency_key
        and (
          c.command_type <> v_command_type
          or c.payload_hash <> v_payload_hash
          or c.caller_auth_user_id <> v_admin_id
        )
    ) then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return v_result;
  end if;

  select u.id, u.email::text into v_target_id, v_target_email
  from auth.users u
  where lower(u.email) = v_email;
  if not found then raise exception 'STAFF_IDENTITY_NOT_FOUND'; end if;

  select * into v_existing from public.camp_admins a where a.auth_user_id = v_target_id for update;
  if found then v_found := true; end if;
  if not v_found then
    select * into v_existing from public.camp_admins a where lower(a.email) = v_email for update;
    if found then v_found := true; end if;
  end if;

  if v_found and (
    v_existing.role <> 'staff'
    or (v_existing.auth_user_id is not null and v_existing.auth_user_id <> v_target_id)
  ) then
    raise exception 'ROLE_ASSIGNMENT_CONFLICT';
  end if;
  if (v_found and v_existing.version <> p_expected_version)
    or (not v_found and p_expected_version <> 0) then
    raise exception 'ROLE_VERSION_CONFLICT';
  end if;

  if v_found then
    v_version := v_existing.version + 1;
    update public.camp_admins
    set auth_user_id = v_target_id,
      email = v_target_email,
      is_active = p_is_active,
      version = v_version,
      updated_at = now(),
      updated_by = v_admin_id
    where email = v_existing.email;
    v_action := case when not p_is_active then 'staff_role_deactivated' else 'staff_role_changed' end;
  else
    v_version := 1;
    insert into public.camp_admins (
      email, auth_user_id, role, is_active, version, updated_at, updated_by
    ) values (
      v_target_email, v_target_id, 'staff', p_is_active, v_version, now(), v_admin_id
    );
    v_action := 'staff_role_granted';
  end if;

  insert into public.staff_rbac_audit (
    action, actor_id, target_id, target_role, result, metadata
  ) values (
    v_action, v_admin_id, v_target_id, 'staff', 'success',
    jsonb_build_object('isActive', p_is_active)
  );

  v_result := jsonb_build_object(
    'ok', true,
    'staffId', v_target_id,
    'email', v_target_email,
    'isActive', p_is_active,
    'version', v_version
  );
  insert into public.staff_rbac_commands (
    idempotency_key, command_type, payload_hash, caller_auth_user_id, result
  ) values (
    p_idempotency_key, 'staff_role', v_payload_hash, v_admin_id, v_result
  );
  return v_result;
end;
$function$;

revoke all on function public.admin_set_staff_role(text, boolean, integer, text) from public, anon, authenticated;
grant execute on function public.admin_set_staff_role(text, boolean, integer, text) to authenticated;

create or replace function public.admin_assign_staff_coach(
  p_staff_id uuid,
  p_coach_id uuid,
  p_expected_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_admin_id uuid := public.staff_rbac_require_admin();
  v_payload_hash text;
  v_command_type text := 'assignment_create';
  v_staff public.camp_admins%rowtype;
  v_assignment_id uuid;
  v_coach_count integer;
  v_camper_count integer;
  v_warnings jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if p_staff_id is null or p_coach_id is null or p_expected_version is null
    or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'ASSIGNMENT_CONFLICT';
  end if;

  v_payload_hash := encode(digest(
    'assignment_create|' || p_staff_id::text || '|' || p_coach_id::text || '|' || p_expected_version::text,
    'sha256'
  ), 'hex');
  select c.result into v_result
  from public.staff_rbac_commands c
  where c.idempotency_key = p_idempotency_key
  for update;
  if found then
    if exists (
      select 1 from public.staff_rbac_commands c
      where c.idempotency_key = p_idempotency_key
        and (
          c.command_type <> v_command_type
          or c.payload_hash <> v_payload_hash
          or c.caller_auth_user_id <> v_admin_id
        )
    ) then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return v_result;
  end if;

  select * into v_staff from public.camp_admins a where a.auth_user_id = p_staff_id for update;
  if not found or v_staff.role <> 'staff' or not v_staff.is_active then
    raise exception 'ROLE_ASSIGNMENT_CONFLICT';
  end if;
  if v_staff.version <> p_expected_version then raise exception 'ROLE_VERSION_CONFLICT'; end if;
  if not exists (
    select 1 from public.user_coach_relation r
    where r.referrer_id = p_coach_id and r.valid_to is null
  ) then
    raise exception 'COACH_NOT_FOUND';
  end if;
  if exists (
    select 1 from public.staff_coach_assignment sa
    where sa.staff_id = p_staff_id
      and sa.coach_id = p_coach_id
      and sa.state = 'active'
      and sa.valid_from <= now()
      and (sa.valid_to is null or sa.valid_to > now())
  ) then
    raise exception 'ASSIGNMENT_CONFLICT';
  end if;

  insert into public.staff_coach_assignment (staff_id, coach_id, assigned_by)
  values (p_staff_id, p_coach_id, v_admin_id)
  returning assignment_id into v_assignment_id;

  select count(*)::integer into v_coach_count
  from public.staff_coach_assignment sa
  where sa.staff_id = p_staff_id
    and sa.state = 'active'
    and sa.valid_from <= now()
    and (sa.valid_to is null or sa.valid_to > now());

  select count(distinct r.auth_user_id)::integer into v_camper_count
  from public.staff_coach_assignment sa
  left join public.user_coach_relation r
    on r.referrer_id = sa.coach_id and r.valid_to is null
  where sa.staff_id = p_staff_id
    and sa.state = 'active'
    and sa.valid_from <= now()
    and (sa.valid_to is null or sa.valid_to > now());

  if v_coach_count > 5 then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code', 'STAFF_CAPACITY_WARNING', 'type', 'coach_count', 'count', v_coach_count, 'threshold', 5
    ));
    insert into public.staff_rbac_audit (
      action, actor_id, target_id, target_role, assignment_id, result, reason_code, metadata
    ) values (
      'staff_capacity_warning', v_admin_id, p_staff_id, 'staff', v_assignment_id,
      'success', 'STAFF_CAPACITY_WARNING',
      jsonb_build_object('type', 'coach_count', 'coachCount', v_coach_count)
    ), (
      'staff_governance_followup', v_admin_id, p_staff_id, 'staff', v_assignment_id,
      'success', 'STAFF_CAPACITY_WARNING',
      jsonb_build_object('type', 'coach_count', 'coachCount', v_coach_count)
    );
  end if;
  if v_camper_count > 150 then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code', 'STAFF_CAPACITY_WARNING', 'type', 'camper_count', 'count', v_camper_count, 'threshold', 150
    ));
    insert into public.staff_rbac_audit (
      action, actor_id, target_id, target_role, assignment_id, result, reason_code, metadata
    ) values (
      'staff_capacity_warning', v_admin_id, p_staff_id, 'staff', v_assignment_id,
      'success', 'STAFF_CAPACITY_WARNING',
      jsonb_build_object('type', 'camper_count', 'camperCount', v_camper_count)
    ), (
      'staff_governance_followup', v_admin_id, p_staff_id, 'staff', v_assignment_id,
      'success', 'STAFF_CAPACITY_WARNING',
      jsonb_build_object('type', 'camper_count', 'camperCount', v_camper_count)
    );
  end if;

  insert into public.staff_rbac_audit (
    action, actor_id, target_id, target_role, assignment_id, result, metadata
  ) values (
    'staff_assignment_created', v_admin_id, p_staff_id, 'staff', v_assignment_id,
    'success', jsonb_build_object('coachId', p_coach_id)
  );

  v_result := jsonb_build_object(
    'ok', true,
    'assignmentId', v_assignment_id,
    'staffVersion', v_staff.version,
    'coachCount', v_coach_count,
    'camperCount', v_camper_count,
    'warnings', v_warnings
  );
  insert into public.staff_rbac_commands (
    idempotency_key, command_type, payload_hash, caller_auth_user_id, result
  ) values (
    p_idempotency_key, 'assignment_create', v_payload_hash, v_admin_id, v_result
  );
  return v_result;
end;
$function$;

revoke all on function public.admin_assign_staff_coach(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.admin_assign_staff_coach(uuid, uuid, integer, text) to authenticated;

create or replace function public.admin_revoke_staff_coach(
  p_assignment_id uuid,
  p_expected_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_admin_id uuid := public.staff_rbac_require_admin();
  v_payload_hash text;
  v_command_type text := 'assignment_revoke';
  v_assignment public.staff_coach_assignment%rowtype;
  v_result jsonb;
begin
  if p_assignment_id is null or p_expected_version is null
    or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'ASSIGNMENT_CONFLICT';
  end if;

  v_payload_hash := encode(digest(
    'assignment_revoke|' || p_assignment_id::text || '|' || p_expected_version::text,
    'sha256'
  ), 'hex');
  select c.result into v_result
  from public.staff_rbac_commands c
  where c.idempotency_key = p_idempotency_key
  for update;
  if found then
    if exists (
      select 1 from public.staff_rbac_commands c
      where c.idempotency_key = p_idempotency_key
        and (
          c.command_type <> v_command_type
          or c.payload_hash <> v_payload_hash
          or c.caller_auth_user_id <> v_admin_id
        )
    ) then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return v_result;
  end if;

  select * into v_assignment
  from public.staff_coach_assignment sa
  where sa.assignment_id = p_assignment_id
  for update;
  if not found or v_assignment.state <> 'active' or v_assignment.valid_to is not null then
    raise exception 'ASSIGNMENT_CONFLICT';
  end if;
  if v_assignment.version <> p_expected_version then raise exception 'ASSIGNMENT_CONFLICT'; end if;

  update public.staff_coach_assignment
  set state = 'revoked', valid_to = now(), version = version + 1
  where assignment_id = p_assignment_id;

  insert into public.staff_rbac_audit (
    action, actor_id, target_id, target_role, assignment_id, result, metadata
  ) values (
    'staff_assignment_revoked', v_admin_id, v_assignment.staff_id, 'staff',
    p_assignment_id, 'success', jsonb_build_object('coachId', v_assignment.coach_id)
  );

  v_result := jsonb_build_object('ok', true, 'assignmentId', p_assignment_id, 'revoked', true);
  insert into public.staff_rbac_commands (
    idempotency_key, command_type, payload_hash, caller_auth_user_id, result
  ) values (
    p_idempotency_key, 'assignment_revoke', v_payload_hash, v_admin_id, v_result
  );
  return v_result;
end;
$function$;

revoke all on function public.admin_revoke_staff_coach(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.admin_revoke_staff_coach(uuid, integer, text) to authenticated;

create or replace function public.get_my_access_profile()
returns table (role text, can_view_radar boolean, can_manage_inventory boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role text;
begin
  select a.role into v_role
  from public.camp_admins a
  where a.auth_user_id = auth.uid()
    and a.is_active;
  if not found then return; end if;
  return query select v_role, true, v_role = 'coach';
end;
$function$;

revoke all on function public.get_my_access_profile() from public, anon, authenticated;
grant execute on function public.get_my_access_profile() to authenticated;

-- 保持原五字段计算，只扩展 staff 的服务端可见集合。
create or replace function public.get_coach_radar_v1()
returns table (
  camper_code text,
  weight_delta numeric,
  waist_delta numeric,
  bmi numeric,
  alert_level text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_role text;
  v_today date := (now() at time zone 'Asia/Shanghai')::date;
begin
  if v_auth_user_id is null then
    return;
  end if;

  select a.role into v_role
  from public.camp_admins a
  where a.auth_user_id = v_auth_user_id
    and a.is_active;

  if not found or v_role not in ('coach', 'admin', 'staff') then
    return;
  end if;

  return query
  with visible_campers as (
    select
      r.auth_user_id,
      r.camper_code,
      c.start_date,
      c.height_cm,
      c.initial_weight_kg,
      c.records
    from public.user_coach_relation r
    left join public.checkin_sync c on c.auth_user_id = r.auth_user_id
    where r.valid_to is null
      and (
        (v_role = 'coach' and r.referrer_id = v_auth_user_id)
        or v_role = 'admin'
        or (
          v_role = 'staff'
          and exists (
            select 1 from public.staff_coach_assignment sa
            where sa.staff_id = v_auth_user_id
              and sa.coach_id = r.referrer_id
              and sa.state = 'active'
              and sa.valid_from <= now()
              and (sa.valid_to is null or sa.valid_to > now())
          )
        )
      )
  ),
  raw_record_days as (
    select vc.*, days.key as record_key, days.value as day
    from visible_campers vc
    left join lateral jsonb_each(
      case when jsonb_typeof(vc.records) = 'object' then vc.records else '{}'::jsonb end
    ) days on true
  ),
  parsed_record_days as (
    select
      raw.auth_user_id,
      raw.start_date,
      public.coach_radar_record_date(raw.record_key) as record_date,
      public.coach_radar_representative_weight(raw.day) as representative_weight,
      public.coach_radar_json_number(raw.day->'waist') as waist,
      public.coach_radar_day_has_content(raw.day) as has_content
    from raw_record_days raw
  ),
  record_days as (
    select parsed.*
    from parsed_record_days parsed
    where parsed.record_date is not null
      and parsed.start_date is not null
      and parsed.record_date between parsed.start_date and parsed.start_date + 20
  ),
  ranked_weights as (
    select record_days.auth_user_id, record_days.representative_weight,
      row_number() over (partition by record_days.auth_user_id order by record_days.record_date desc) as rn
    from record_days
    where record_days.representative_weight is not null
  ),
  ranked_initial_weights as (
    select record_days.auth_user_id, record_days.representative_weight,
      row_number() over (partition by record_days.auth_user_id order by record_days.record_date asc) as rn
    from record_days
    where record_days.representative_weight is not null
  ),
  ranked_waists as (
    select record_days.auth_user_id, record_days.waist,
      row_number() over (partition by record_days.auth_user_id order by record_days.record_date desc) as rn
    from record_days
    where record_days.waist is not null and record_days.waist > 0
  ),
  ranked_initial_waists as (
    select record_days.auth_user_id, record_days.waist,
      row_number() over (partition by record_days.auth_user_id order by record_days.record_date asc) as rn
    from record_days
    where record_days.waist is not null and record_days.waist > 0
  ),
  ranked_activity as (
    select record_days.auth_user_id, record_days.record_date,
      row_number() over (partition by record_days.auth_user_id order by record_days.record_date desc) as rn
    from record_days
    where record_days.has_content
  )
  select
    vc.camper_code,
    case
      when current_weight.representative_weight is null
        or coalesce(
          case when vc.initial_weight_kg > 0 then vc.initial_weight_kg end,
          initial_weight.representative_weight
        ) is null then null
      when current_weight.representative_weight - coalesce(
        case when vc.initial_weight_kg > 0 then vc.initial_weight_kg end,
        initial_weight.representative_weight
      ) = 0 then 0::numeric
      else current_weight.representative_weight - coalesce(
        case when vc.initial_weight_kg > 0 then vc.initial_weight_kg end,
        initial_weight.representative_weight
      )
    end as weight_delta,
    case
      when current_waist.waist is null or initial_waist.waist is null then null
      when current_waist.waist - initial_waist.waist = 0 then 0::numeric
      else current_waist.waist - initial_waist.waist
    end as waist_delta,
    case
      when current_weight.representative_weight is null or vc.height_cm is null or vc.height_cm <= 0 then null
      else current_weight.representative_weight / power(vc.height_cm / 100, 2)
    end as bmi,
    case
      when vc.start_date is not null
        and v_today > vc.start_date + 20
        and not exists (
          select 1
          from public.code_activations recharge
          join public.box_codes recharge_code
            on recharge_code.activation_id = recharge.activation_id
            and recharge_code.state = 'active'
          where recharge.auth_user_id = vc.auth_user_id
            and recharge.expected_code_type = 'recharge'
            and recharge.activated_at is not null
        ) then 'red'
      when latest_activity.record_date is null then 'red'
      when v_today - latest_activity.record_date >= 3 then 'red'
      when v_today - latest_activity.record_date = 2 then 'yellow'
      else 'green'
    end as alert_level
  from visible_campers vc
  left join (
    select ranked.auth_user_id, ranked.representative_weight from ranked_weights ranked where ranked.rn = 1
  ) current_weight on current_weight.auth_user_id = vc.auth_user_id
  left join (
    select ranked.auth_user_id, ranked.representative_weight from ranked_initial_weights ranked where ranked.rn = 1
  ) initial_weight on initial_weight.auth_user_id = vc.auth_user_id
  left join (
    select ranked.auth_user_id, ranked.waist from ranked_waists ranked where ranked.rn = 1
  ) current_waist on current_waist.auth_user_id = vc.auth_user_id
  left join (
    select ranked.auth_user_id, ranked.waist from ranked_initial_waists ranked where ranked.rn = 1
  ) initial_waist on initial_waist.auth_user_id = vc.auth_user_id
  left join (
    select ranked.auth_user_id, ranked.record_date from ranked_activity ranked where ranked.rn = 1
  ) latest_activity on latest_activity.auth_user_id = vc.auth_user_id;
end;
$function$;

revoke all on function public.get_coach_radar_v1() from public, anon, authenticated;
grant execute on function public.get_coach_radar_v1() to authenticated;

-- 保留 P0 Vault 口径；staff 即使绕过隐藏界面也不能读取库存。
create or replace function public.get_my_code_inventory()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_pepper text;
  v_restock_point integer;
  v_available_count integer;
  v_codes jsonb;
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'staff'
  ) then
    insert into public.staff_rbac_audit (
      action, actor_id, target_id, target_role, result, reason_code
    ) values (
      'staff_finance_denied', v_auth_user_id, v_auth_user_id, 'staff',
      'denied', 'FORBIDDEN'
    );
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select decrypted_secret into v_pepper
  from vault.decrypted_secrets
  where name = 'box_code_pepper';
  if v_pepper is null or v_pepper = '' then
    raise exception 'BOX_CODE_PEPPER_NOT_CONFIGURED';
  end if;

  select (c.config_value #>> '{}')::integer into v_restock_point
  from public.system_configs c
  where c.config_key = 'coach_restock_point';
  if not found or v_restock_point is null or v_restock_point < 0 then
    raise exception 'SYSTEM_CONFIG_MISSING';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'codeId', b.code_id,
      'code', pgp_sym_decrypt(b.code_ciphertext, v_pepper),
      'boxSpec', b.box_spec,
      'maxCheckins', b.max_checkins,
      'createdAt', b.created_at
    ) order by b.created_at, b.code_id
  ), '[]'::jsonb)
  into v_codes
  from public.box_codes b
  where b.coach_id = v_auth_user_id
    and b.state = 'unused'
    and b.inventory_status = 'coach'
    and b.code_ciphertext is not null;

  v_available_count := coalesce(jsonb_array_length(v_codes), 0);
  return jsonb_build_object(
    'ok', true,
    'availableCount', v_available_count,
    'restockPoint', v_restock_point,
    'needsRestock', v_available_count < v_restock_point,
    'codes', v_codes
  );
end;
$function$;

revoke all on function public.get_my_code_inventory() from public, anon, authenticated;
grant execute on function public.get_my_code_inventory() to authenticated;

commit;
