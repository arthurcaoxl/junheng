begin;

-- TASK-10.13：教练身份只认 camp_admins 的有效 coach 行；归属仍只认当前关系。
alter table public.staff_rbac_commands
  drop constraint if exists staff_rbac_commands_command_type_check;
alter table public.staff_rbac_commands
  add constraint staff_rbac_commands_command_type_check
  check (command_type in ('staff_role', 'coach_role', 'assignment_create', 'assignment_revoke'));

alter table public.staff_rbac_audit
  drop constraint if exists staff_rbac_audit_action_check;
alter table public.staff_rbac_audit
  add constraint staff_rbac_audit_action_check
  check (action in (
    'access_denied',
    'staff_role_granted',
    'staff_role_changed',
    'staff_role_deactivated',
    'staff_assignment_created',
    'staff_assignment_revoked',
    'staff_capacity_warning',
    'staff_governance_followup',
    'staff_finance_denied',
    'coach_role_granted',
    'coach_role_changed',
    'coach_role_deactivated'
  ));

-- 只同步已有 coach 行；admin/staff、平台账号或其他身份占用均跳过，绝不自动降权。
with current_coaches as (
  select distinct r.referrer_id as coach_id
  from public.user_coach_relation r
  where r.valid_to is null
    and not exists (
      select 1 from public.system_configs config
      where config.config_key = 'platform_official_account_id'
        and config.config_value #>> '{}' = r.referrer_id::text
    )
), synced as (
  update public.camp_admins a
  set auth_user_id = u.id,
    email = u.email,
    is_active = true,
    version = a.version + 1,
    updated_at = now()
  from auth.users u
  join current_coaches c on c.coach_id = u.id
  where a.role = 'coach'
    and (
      a.auth_user_id = u.id
      or (a.auth_user_id is null and lower(a.email) = lower(u.email))
    )
    and not exists (
      select 1 from public.camp_admins occupied
      where occupied.ctid <> a.ctid
        and (occupied.auth_user_id = u.id or lower(occupied.email) = lower(u.email))
    )
  returning a.auth_user_id
)
insert into public.camp_admins (
  email, auth_user_id, role, is_active, version, updated_at, updated_by
)
select u.email, u.id, 'coach', true, 1, now(), null
from auth.users u
join current_coaches c on c.coach_id = u.id
where not exists (
  select 1 from public.camp_admins a
  where a.auth_user_id = u.id or lower(a.email) = lower(u.email)
)
on conflict do nothing;

insert into public.staff_rbac_audit (
  action, actor_id, target_id, target_role, result, metadata
)
select
  'coach_role_granted', null, c.coach_id, 'coach', 'success',
  jsonb_build_object('source', '20261109154000_coach_ssot_vault')
from (
  select distinct r.referrer_id as coach_id
  from public.user_coach_relation r
  where r.valid_to is null
    and not exists (
      select 1 from public.system_configs config
      where config.config_key = 'platform_official_account_id'
        and config.config_value #>> '{}' = r.referrer_id::text
    )
) c
join public.camp_admins a
  on a.auth_user_id = c.coach_id and a.role = 'coach' and a.is_active
where not exists (
  select 1 from public.staff_rbac_audit audit
  where audit.target_id = c.coach_id
    and audit.metadata ->> 'source' = '20261109154000_coach_ssot_vault'
);

create or replace function public.admin_set_coach_role(
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
  v_command_type text := 'coach_role';
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

  perform pg_advisory_xact_lock(hashtextextended('coach-role:' || p_idempotency_key, 0));
  v_payload_hash := encode(digest(
    'coach_role|' || v_email || '|' || p_is_active::text || '|' || p_expected_version::text,
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

  perform pg_advisory_xact_lock(hashtextextended('coach-role-target:' || v_email, 0));
  select u.id, u.email::text into v_target_id, v_target_email
  from auth.users u
  where lower(u.email) = v_email;
  if not found then raise exception 'COACH_IDENTITY_NOT_FOUND'; end if;

  select * into v_existing from public.camp_admins a where a.auth_user_id = v_target_id for update;
  if found then v_found := true; end if;
  if not v_found then
    select * into v_existing from public.camp_admins a where lower(a.email) = v_email for update;
    if found then v_found := true; end if;
  end if;

  if v_found and (
    v_existing.role <> 'coach'
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
    v_action := case when not p_is_active then 'coach_role_deactivated' else 'coach_role_changed' end;
  else
    v_version := 1;
    insert into public.camp_admins (
      email, auth_user_id, role, is_active, version, updated_at, updated_by
    ) values (
      v_target_email, v_target_id, 'coach', p_is_active, v_version, now(), v_admin_id
    );
    v_action := 'coach_role_granted';
  end if;

  insert into public.staff_rbac_audit (
    action, actor_id, target_id, target_role, result, metadata
  ) values (
    v_action, v_admin_id, v_target_id, 'coach', 'success',
    jsonb_build_object('isActive', p_is_active)
  );

  v_result := jsonb_build_object(
    'ok', true,
    'coachId', v_target_id,
    'email', v_target_email,
    'isActive', p_is_active,
    'version', v_version
  );
  insert into public.staff_rbac_commands (
    idempotency_key, command_type, payload_hash, caller_auth_user_id, result
  ) values (
    p_idempotency_key, 'coach_role', v_payload_hash, v_admin_id, v_result
  );
  return v_result;
end;
$function$;

revoke all on function public.admin_set_coach_role(text, boolean, integer, text)
from public, anon, authenticated;
grant execute on function public.admin_set_coach_role(text, boolean, integer, text) to authenticated;

-- 0 学员教练同样可搜索；联系方式仍只向有效 Admin 返回。
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
  from public.camp_admins coaches
  join auth.users u on u.id = coaches.auth_user_id
  left join public.user_profiles p on p.auth_user_id = u.id
  where coaches.role = 'coach'
    and coaches.is_active
    and u.email ilike '%' || v_query || '%'
  order by u.email, u.id
  limit 10;
end;
$function$;

-- 划拨只校验有效 coach 角色，平台码锁与库存事务保持不变。
create or replace function public.allocate_codes_to_coach(
  p_coach_id uuid,
  p_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_code_ids uuid[];
  v_selected_count integer;
  v_inventory public.coach_inventory%rowtype;
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id
      and a.role = 'admin'
      and a.is_active
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_coach_id is null or p_count is null or p_count <= 0 then
    raise exception 'INVALID_ALLOCATION';
  end if;
  if not exists (
    select 1
    from public.camp_admins a
    where a.auth_user_id = p_coach_id
      and a.role = 'coach'
      and a.is_active
  ) then
    raise exception 'COACH_NOT_FOUND';
  end if;

  -- 先锁平台码行；SKIP LOCKED 让并发划拨只能取得互不重叠的库存。
  select array_agg(locked.code_id) into v_code_ids
  from (
    select b.code_id
    from public.box_codes b
    where b.inventory_status = 'platform'
      and b.state = 'unused'
    order by b.created_at, b.code_id
    limit p_count
    for update skip locked
  ) locked;

  v_selected_count := coalesce(array_length(v_code_ids, 1), 0);
  if v_selected_count <> p_count then
    raise exception 'INVENTORY_INSUFFICIENT';
  end if;

  perform set_config('app.inventory_allocation_verified', 'on', true);
  update public.box_codes
  set
    coach_id = p_coach_id,
    inventory_status = 'coach',
    version = version + 1,
    updated_at = now()
  where code_id = any(v_code_ids);

  -- 遵循 box_codes 后再锁库存行的全局顺序。
  select * into v_inventory
  from public.coach_inventory
  where coach_id = p_coach_id
  for update;

  if found then
    update public.coach_inventory
    set
      allocated_count = allocated_count + p_count,
      available_count = available_count + p_count,
      version = version + 1,
      updated_at = now()
    where coach_id = p_coach_id;
  else
    insert into public.coach_inventory (
      coach_id,
      allocated_count,
      available_count
    ) values (
      p_coach_id,
      p_count,
      p_count
    );
  end if;

  insert into public.inventory_logs (
    event_type,
    coach_id,
    quantity,
    operator_id
  ) values (
    'coach_allocated',
    p_coach_id,
    p_count,
    v_auth_user_id
  );

  return jsonb_build_object(
    'ok', true,
    'coachId', p_coach_id,
    'allocatedCount', p_count,
    'codeIds', to_jsonb(v_code_ids)
  );
end;
$function$;

-- 审核归属选择只认有效 coach 角色；原审核状态机不变。
create or replace function public.admin_review_box_code_activation_v2(
  p_activation_id uuid,
  p_decision text,
  p_target_coach_id uuid,
  p_shipment_verification_ref text default null,
  p_payment_verification_ref text default null,
  p_rejection_reason_code text default null,
  p_expected_code_version integer default null,
  p_expected_activation_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is null or not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_target_coach_id is null or not exists (
    select 1
    from public.camp_admins a
    where a.auth_user_id = p_target_coach_id
      and a.role = 'coach'
      and a.is_active
  ) then
    raise exception 'COACH_SELECTION_MISMATCH';
  end if;
  if not exists (
    select 1
    from public.code_activations a
    join public.box_codes b on b.code_id = a.code_id
    where a.activation_id = p_activation_id
      and a.review_state = 'pending'
      and b.state = 'pending_review'
      and b.coach_id = p_target_coach_id
  ) then
    raise exception 'COACH_SELECTION_MISMATCH';
  end if;

  return public.admin_review_box_code_activation(
    p_activation_id,
    p_decision,
    p_shipment_verification_ref,
    p_payment_verification_ref,
    p_rejection_reason_code,
    p_expected_code_version,
    p_expected_activation_version
  );
end;
$function$;

-- staff 可分配给 0 学员教练；容量统计仍只读当前关系。
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
    select 1 from public.camp_admins a
    where a.auth_user_id = p_coach_id and a.role = 'coach' and a.is_active
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

-- 无码补货只要求有效 coach 角色，不要求已有营员。
create or replace function public.request_coach_restock_v1(p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_note text := btrim(coalesce(p_note, ''));
  v_request_id uuid;
begin
  if v_auth_user_id is null or not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'coach' and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'RESTOCK_INPUT_INVALID';
  end if;

  -- 缺库存行视为零；已有行时只有 available_count = 0 才允许申请。
  if exists (
    select 1 from public.coach_inventory i
    where i.coach_id = v_auth_user_id and (i.available_count = 0) is not true
  ) or exists (
    select 1 from public.box_codes b
    where b.coach_id = v_auth_user_id and b.inventory_status = 'coach' and b.state = 'unused'
  ) then
    raise exception 'RESTOCK_NOT_EMPTY';
  end if;

  select q.request_id into v_request_id
  from public.coach_restock_requests q
  where q.coach_id = v_auth_user_id and q.status = 'pending'
  for update;
  if found then
    return jsonb_build_object('ok', true, 'requestId', v_request_id, 'status', 'pending', 'replayed', true);
  end if;

  insert into public.coach_restock_requests (coach_id, note)
  values (v_auth_user_id, v_note)
  on conflict (coach_id) where status = 'pending' do nothing
  returning request_id into v_request_id;
  if v_request_id is null then
    select q.request_id into v_request_id
    from public.coach_restock_requests q
    where q.coach_id = v_auth_user_id and q.status = 'pending';
  end if;
  return jsonb_build_object('ok', true, 'requestId', v_request_id, 'status', 'pending', 'replayed', false);
end;
$function$;

-- get_coach_campers_v1：角色判定与营员归属分离。
create or replace function public.get_coach_campers_v1()
returns table (
  camper_ref uuid,
  camper_code text,
  activity_status text,
  followup_status text,
  followup_note text,
  followup_version integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is null then
    return;
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'coach' and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select
    r.relation_id,
    r.camper_code,
    case when exists (
      select 1
      from public.checkin_sync cs
      cross join lateral jsonb_each(cs.records) as record_days(record_date, record_value)
      where cs.auth_user_id = r.auth_user_id
        and record_days.record_date >= cs.start_date::text
        and record_days.record_date <= (cs.start_date + 20)::text
        and jsonb_typeof(record_days.record_value) = 'object'
        and (
          nullif(btrim(record_days.record_value->>'weight'), '') is not null
          or nullif(btrim(record_days.record_value->>'waist'), '') is not null
          or nullif(btrim(record_days.record_value->'weights'->>'morning'), '') is not null
          or nullif(btrim(record_days.record_value->'weights'->>'noon'), '') is not null
          or nullif(btrim(record_days.record_value->'weights'->>'evening'), '') is not null
          or (
            jsonb_typeof(record_days.record_value->'meals') = 'array'
            and (record_days.record_value->'meals') @> '[true]'::jsonb
          )
          or record_days.record_value->>'water' = 'true'
          or record_days.record_value->>'movement' = 'true'
          or record_days.record_value->>'sleep' = 'true'
        )
    ) then 'active' else 'new_registered' end,
    coalesce(f.followup_status, 'pending'),
    coalesce(f.note, ''),
    coalesce(f.version, 0)
  from public.user_coach_relation r
  left join public.coach_camper_followups f
    on f.coach_id = r.referrer_id and f.camper_id = r.auth_user_id
  where r.referrer_id = v_auth_user_id
    and r.valid_to is null
  order by r.created_at, r.relation_id;
end;
$function$;

-- get_coach_camper_followup_v1：角色判定与营员归属分离。
create or replace function public.get_coach_camper_followup_v1(p_camper_ref uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_camper_id uuid;
  v_followup public.coach_camper_followups%rowtype;
begin
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'coach' and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select r.auth_user_id into v_camper_id
  from public.user_coach_relation r
  where r.relation_id = p_camper_ref
    and r.referrer_id = v_auth_user_id
    and r.valid_to is null;
  if not found then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select f.* into v_followup
  from public.coach_camper_followups f
  where f.coach_id = v_auth_user_id and f.camper_id = v_camper_id;
  return jsonb_build_object(
    'followupStatus', coalesce(v_followup.followup_status, 'pending'),
    'note', coalesce(v_followup.note, ''),
    'version', coalesce(v_followup.version, 0)
  );
end;
$function$;

-- set_coach_camper_followup_v1：角色判定与营员归属分离。
create or replace function public.set_coach_camper_followup_v1(
  p_camper_ref uuid,
  p_followup_status text,
  p_note text,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_camper_id uuid;
  v_note text := btrim(coalesce(p_note, ''));
  v_followup public.coach_camper_followups%rowtype;
begin
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'coach' and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_followup_status not in ('pending', 'contacted', 'waiting_reply', 'resolved', 'escalated')
    or char_length(v_note) > 1000
  then
    raise exception 'FOLLOWUP_INPUT_INVALID';
  end if;

  select r.auth_user_id into v_camper_id
  from public.user_coach_relation r
  where r.relation_id = p_camper_ref
    and r.referrer_id = v_auth_user_id
    and r.valid_to is null
  for update of r;
  if not found then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select f.* into v_followup
  from public.coach_camper_followups f
  where f.coach_id = v_auth_user_id and f.camper_id = v_camper_id
  for update;
  if found then
    if p_expected_version is null or p_expected_version <> v_followup.version then
      raise exception 'FOLLOWUP_VERSION_CONFLICT';
    end if;
    update public.coach_camper_followups f
    set followup_status = p_followup_status, note = v_note,
      version = f.version + 1, updated_by = v_auth_user_id, updated_at = now()
    where f.coach_id = v_auth_user_id and f.camper_id = v_camper_id
    returning f.* into v_followup;
  else
    if p_expected_version is distinct from 0 then
      raise exception 'FOLLOWUP_VERSION_CONFLICT';
    end if;
    insert into public.coach_camper_followups (
      coach_id, camper_id, followup_status, note, updated_by
    ) values (
      v_auth_user_id, v_camper_id, p_followup_status, v_note, v_auth_user_id
    ) returning * into v_followup;
  end if;

  return jsonb_build_object(
    'ok', true, 'followupStatus', v_followup.followup_status,
    'note', v_followup.note, 'version', v_followup.version
  );
end;
$function$;

-- 直推先验有效 coach，再按原锁顺序处理本人码与当前营员。
create or replace function public.coach_push_code_v1(
  p_camper_ref uuid,
  p_code_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_pepper text;
  v_payload_hash text;
  v_code_text text;
  v_code_format text;
  v_code public.box_codes%rowtype;
  v_relation public.user_coach_relation%rowtype;
  v_command public.box_code_commands%rowtype;
  v_activation_id uuid;
  v_result jsonb;
begin
  if v_auth_user_id is null then
    return public.box_code_error('UNAUTHORIZED');
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'coach' and a.is_active
  ) then
    return public.box_code_error('FORBIDDEN');
  end if;
  if nullif(p_idempotency_key, '') is null then
    return public.box_code_error('IDEMPOTENCY_CONFLICT');
  end if;

  select decrypted_secret into v_pepper
  from vault.decrypted_secrets
  where name = 'box_code_pepper';
  if v_pepper is null or v_pepper = '' then
    return public.box_code_error('BOX_CODE_PEPPER_NOT_CONFIGURED');
  end if;
  v_payload_hash := encode(hmac(
    'coach_push|' || v_auth_user_id::text || '|' || coalesce(p_camper_ref::text, '') || '|' || coalesce(p_code_id::text, ''),
    v_pepper,
    'sha256'
  ), 'hex');

  select * into v_command
  from public.box_code_commands
  where idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_command.command_type <> 'activation'
      or v_command.caller_auth_user_id <> v_auth_user_id
      or v_command.payload_hash <> v_payload_hash
    then
      return public.box_code_error('IDEMPOTENCY_CONFLICT');
    end if;
    if v_command.result is null then
      return public.box_code_error('ACTIVATION_STATE_CONFLICT');
    end if;
    return jsonb_set(v_command.result, '{replayed}', 'true'::jsonb);
  end if;

  select b.* into v_code
  from public.box_codes b
  where b.code_id = p_code_id
    and b.coach_id = v_auth_user_id
    and b.inventory_status = 'coach'
    and b.state = 'unused'
  for update of b;
  if not found then
    return public.box_code_error('CODE_NOT_AVAILABLE');
  end if;

  select r.* into v_relation
  from public.user_coach_relation r
  where r.relation_id = p_camper_ref
    and r.referrer_id = v_auth_user_id
    and r.valid_to is null
  for update of r;
  if not found then
    return public.box_code_error('FORBIDDEN');
  end if;

  v_code_text := pgp_sym_decrypt(v_code.code_ciphertext, v_pepper);
  if v_code_text ~ '^JH-(EL|RC)-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$' then
    v_code_format := 'short';
  elsif v_code_text ~ '^JH-(EL|RC)-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12,16}$' then
    v_code_format := 'long';
  else
    return public.box_code_error('CODE_NOT_AVAILABLE');
  end if;

  insert into public.code_activations (
    code_id, auth_user_id, camper_code, expected_code_type, expected_code_format, review_state
  ) values (
    v_code.code_id, v_relation.auth_user_id, v_relation.camper_code,
    v_code.code_type, v_code_format, 'pending'
  ) returning activation_id into v_activation_id;

  update public.box_codes
  set state = 'pending_review', version = version + 1, updated_at = now()
  where code_id = v_code.code_id and version = v_code.version;

  insert into public.box_code_events (event_type, code_id, activation_id, actor_auth_user_id)
  values ('CodeActivationRequested', v_code.code_id, v_activation_id, v_auth_user_id);

  v_result := jsonb_build_object(
    'ok', true, 'activationId', v_activation_id, 'codeId', v_code.code_id,
    'state', 'pending_review', 'replayed', false
  );
  insert into public.box_code_commands (
    idempotency_key, command_type, payload_hash, caller_auth_user_id, result
  ) values (
    p_idempotency_key, 'activation', v_payload_hash, v_auth_user_id, v_result
  );
  return v_result;
end;
$function$;

-- staff 必须先于 Vault 读取被拒绝；其他非 coach 也不能读取云库存。
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
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'coach' and a.is_active
  ) then
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

-- 当前归属只决定可见教练；返回前仍要求该教练角色有效。
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
  join public.camp_admins a
    on a.auth_user_id = c.coach_id
    and a.role = 'coach'
    and a.is_active
  where r.auth_user_id = auth.uid()
    and r.valid_to is null
  limit 1;
$$;

-- 发码统一读取 Vault，不回退 GUC。
create or replace function public.generate_platform_codes(
  p_count integer,
  p_box_spec text,
  p_offline_receipt_no text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_max_checkins integer;
  v_box_spec text;
  v_expires_at timestamptz;
  v_pepper text;
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_case_id uuid;
  v_case_ids uuid[] := '{}';
  v_code text;
  v_code_hash text;
  v_case_index integer;
  v_code_index integer;
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if not exists (
    select 1
    from public.camp_admins a
    where a.auth_user_id = v_auth_user_id
      and a.role = 'admin'
      and a.is_active
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if nullif(btrim(p_offline_receipt_no), '') is null then
    raise exception 'OFFLINE_RECEIPT_REQUIRED';
  end if;
  if p_count is null or p_count <= 0 or p_count % 24 <> 0 or p_count > 2400 then
    raise exception 'INVALID_CODE_COUNT';
  end if;

  select (c.config_value #>> '{}')::integer into v_max_checkins
  from public.system_configs c
  where c.config_key = 'max_checkins_per_box'
  for update;
  if not found or v_max_checkins is null or v_max_checkins <= 0 then
    raise exception 'SYSTEM_CONFIG_MISSING';
  end if;

  select c.config_value #>> '{}' into v_box_spec
  from public.system_configs c
  where c.config_key = 'default_box_spec'
  for update;
  if not found or v_box_spec is null or p_box_spec is distinct from v_box_spec then
    raise exception 'BOX_SPEC_CONFIG_MISMATCH';
  end if;

  select (c.config_value ->> 'default_expires_at')::timestamptz into v_expires_at
  from public.system_configs c
  where c.config_key = 'box_code_expiry_policy'
  for update;
  if not found or v_expires_at is null then
    raise exception 'SYSTEM_CONFIG_MISSING';
  end if;

  select decrypted_secret into v_pepper
  from vault.decrypted_secrets
  where name = 'box_code_pepper';
  if v_pepper is null or v_pepper = '' then
    raise exception 'BOX_CODE_PEPPER_NOT_CONFIGURED';
  end if;

  for v_case_index in 1..(p_count / 24) loop
    v_case_id := gen_random_uuid();
    v_case_ids := array_append(v_case_ids, v_case_id);

    for v_code_index in 1..24 loop
      loop
        select string_agg(
          substr(v_alphabet, 1 + get_byte(secret.random_bytes, position.index - 1) % length(v_alphabet), 1),
          ''
        ) into v_code
        from (
          select gen_random_bytes(4) as random_bytes
        ) secret
        cross join lateral (
          select generate_series(1, 4) as index
        ) position;
        v_code := 'JH-EL-' || v_code;
        v_code_hash := encode(hmac(v_code, v_pepper, 'sha256'), 'hex');
        exit when not exists (
          select 1 from public.box_codes b where b.code_hash = v_code_hash
        );
      end loop;

      insert into public.box_codes (
        code_hash,
        code_type,
        code_format,
        state,
        coach_id,
        case_id,
        max_checkins,
        used_checkins,
        box_spec,
        inventory_status,
        code_ciphertext,
        expires_at
      ) values (
        v_code_hash,
        'experience',
        'short',
        'unused',
        v_auth_user_id,
        v_case_id,
        v_max_checkins,
        0,
        v_box_spec,
        'platform',
        pgp_sym_encrypt(v_code, v_pepper),
        v_expires_at
      );
    end loop;

    insert into public.inventory_logs (
      event_type,
      case_id,
      quantity,
      operator_id,
      offline_receipt_no
    ) values (
      'platform_generated',
      v_case_id,
      24,
      v_auth_user_id,
      btrim(p_offline_receipt_no)
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'generatedCount', p_count,
    'caseIds', to_jsonb(v_case_ids),
    'boxSpec', v_box_spec,
    'maxCheckins', v_max_checkins
  );
end;
$function$;

-- 手动申请保留三维限流与幂等，仅收口密钥来源。
create or replace function public.request_box_code_activation(
  p_code text,
  p_idempotency_key text,
  p_device_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_pepper text;
  v_actor_hash text;
  v_trusted_ip text;
  v_ip_hash text;
  v_device_hash text;
  v_ip_rate_limit integer;
  v_device_rate_limit integer;
  v_auth_allowed boolean;
  v_device_allowed boolean;
  v_ip_allowed boolean := true;
  v_code_hash text;
  v_code_format text;
  v_payload_hash text;
  v_code public.box_codes%rowtype;
  v_command public.box_code_commands%rowtype;
  v_camper_code text;
  v_activation_id uuid;
  v_result jsonb;
begin
  if v_auth_user_id is null then
    return public.box_code_error('UNAUTHORIZED');
  end if;
  if nullif(p_idempotency_key, '') is null then
    return public.box_code_error('IDEMPOTENCY_CONFLICT');
  end if;
  if nullif(p_device_hash, '') is null then
    return public.box_code_error('DEVICE_FINGERPRINT_REQUIRED');
  end if;

  select decrypted_secret into v_pepper
  from vault.decrypted_secrets
  where name = 'box_code_pepper';
  if v_pepper is null or v_pepper = '' then
    return public.box_code_error('BOX_CODE_PEPPER_NOT_CONFIGURED');
  end if;

  -- 阈值缺失或非法时关闭申请入口，不使用字面值兜底。
  select (c.config_value #>> '{}')::integer into v_ip_rate_limit
  from public.system_configs c
  where c.config_key = 'activation_request_ip_rate_limit_per_minute';
  select (c.config_value #>> '{}')::integer into v_device_rate_limit
  from public.system_configs c
  where c.config_key = 'activation_request_device_rate_limit_per_minute';
  if v_ip_rate_limit is null or v_ip_rate_limit <= 0
    or v_device_rate_limit is null or v_device_rate_limit <= 0
  then
    return public.box_code_error('SYSTEM_CONFIG_MISSING');
  end if;

  -- 原始 IP 与设备 UUID 只用于本函数内计算 HMAC，落库值不可逆。
  v_actor_hash := encode(hmac(v_auth_user_id::text, v_pepper, 'sha256'), 'hex');
  v_device_hash := encode(hmac(p_device_hash, v_pepper, 'sha256'), 'hex');
  v_trusted_ip := nullif(current_setting('app.trusted_client_ip', true), '');
  if v_trusted_ip is not null then
    v_ip_hash := encode(hmac(v_trusted_ip, v_pepper, 'sha256'), 'hex');
  end if;

  -- 三个维度分别求值，避免认证主体超限后短路跳过设备维计数。
  v_auth_allowed := public.box_code_attempt_allowed('auth_user', v_actor_hash);
  if v_ip_hash is not null then
    v_ip_allowed := public.box_code_request_attempt_allowed('ip', v_ip_hash, v_ip_rate_limit);
  end if;
  v_device_allowed := public.box_code_request_attempt_allowed('device', v_device_hash, v_device_rate_limit);
  if not v_device_allowed or not v_ip_allowed or not v_auth_allowed then
    return public.box_code_error('TOO_MANY_ATTEMPTS');
  end if;

  v_payload_hash := encode(hmac(
    'request|' || v_auth_user_id::text || '|' || coalesce(p_code, ''),
    v_pepper,
    'sha256'
  ), 'hex');

  select * into v_command
  from public.box_code_commands
  where idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_command.command_type <> 'activation'
      or v_command.caller_auth_user_id <> v_auth_user_id
      or v_command.payload_hash <> v_payload_hash
    then
      return public.box_code_error('IDEMPOTENCY_CONFLICT');
    end if;
    if v_command.result is null then
      return public.box_code_error('ACTIVATION_STATE_CONFLICT');
    end if;
    return jsonb_set(v_command.result, '{replayed}', 'true'::jsonb);
  end if;

  if p_code ~ '^JH-(EL|RC)-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$' then
    v_code_format := 'short';
  elsif p_code ~ '^JH-(EL|RC)-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12,16}$' then
    v_code_format := 'long';
  else
    if public.box_code_note_failure('auth_user', v_actor_hash) then
      return public.box_code_error('TOO_MANY_ATTEMPTS');
    end if;
    return public.box_code_error('CODE_NOT_AVAILABLE');
  end if;

  v_code_hash := encode(hmac(p_code, v_pepper, 'sha256'), 'hex');
  select * into v_code
  from public.box_codes
  where code_hash = v_code_hash
  for update;
  if not found then
    if public.box_code_note_failure('auth_user', v_actor_hash) then
      return public.box_code_error('TOO_MANY_ATTEMPTS');
    end if;
    return public.box_code_error('CODE_NOT_AVAILABLE');
  end if;

  -- 同一码被并发申请时，后取得锁的请求不能排队共享激活。
  if v_code.state <> 'unused' then
    return public.box_code_error('ACTIVATION_STATE_CONFLICT');
  end if;

  select user_code into v_camper_code
  from public.checkin_sync
  where auth_user_id = v_auth_user_id;
  if not found then
    return public.box_code_error('ACTIVATION_STATE_CONFLICT');
  end if;

  insert into public.code_activations (
    code_id,
    auth_user_id,
    camper_code,
    expected_code_type,
    expected_code_format,
    review_state
  ) values (
    v_code.code_id,
    v_auth_user_id,
    v_camper_code,
    v_code.code_type,
    v_code_format,
    'pending'
  )
  returning activation_id into v_activation_id;

  update public.box_codes
  set state = 'pending_review', version = version + 1, updated_at = now()
  where code_id = v_code.code_id
    and version = v_code.version;

  insert into public.box_code_events (
    event_type,
    code_id,
    activation_id,
    actor_auth_user_id
  ) values (
    'CodeActivationRequested',
    v_code.code_id,
    v_activation_id,
    v_auth_user_id
  );

  v_result := jsonb_build_object(
    'ok', true,
    'activationId', v_activation_id,
    'codeId', v_code.code_id,
    'state', 'pending_review',
    'replayed', false
  );
  insert into public.box_code_commands (
    idempotency_key,
    command_type,
    payload_hash,
    caller_auth_user_id,
    result
  ) values (
    p_idempotency_key,
    'activation',
    v_payload_hash,
    v_auth_user_id,
    v_result
  );

  return v_result;
end;
$function$;

-- 旧激活函数虽已回收执行权限，生效定义仍统一为 Vault。
create or replace function public.activate_box_code(
  p_code text,
  p_code_expected_version integer,
  p_activation_expected_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_pepper text;
  v_actor_hash text;
  v_trusted_ip text;
  v_ip_hash text;
  v_code_hash text;
  v_code_format text;
  v_payload_hash text;
  v_code public.box_codes%rowtype;
  v_activation public.code_activations%rowtype;
  v_command public.box_code_commands%rowtype;
  v_inventory public.coach_inventory%rowtype;
  v_relation_id uuid;
  v_camper_code text;
  v_inserted_key text;
  v_blocked boolean;
  v_result jsonb;
begin
  if v_auth_user_id is null then
    return public.box_code_error('UNAUTHORIZED');
  end if;

  if p_idempotency_key is null or p_idempotency_key = '' then
    return public.box_code_error('IDEMPOTENCY_CONFLICT');
  end if;

  select decrypted_secret into v_pepper
  from vault.decrypted_secrets
  where name = 'box_code_pepper';
  if v_pepper is null or v_pepper = '' then
    return public.box_code_error('BOX_CODE_PEPPER_NOT_CONFIGURED');
  end if;

  v_actor_hash := encode(hmac(v_auth_user_id::text, v_pepper, 'sha256'), 'hex');
  v_trusted_ip := nullif(current_setting('app.trusted_client_ip', true), '');
  if v_trusted_ip is not null then
    v_ip_hash := encode(hmac(v_trusted_ip, v_pepper, 'sha256'), 'hex');
  end if;

  v_payload_hash := encode(hmac(
    v_auth_user_id::text || '|' || coalesce(p_code, '') || '|'
      || coalesce(p_code_expected_version::text, '') || '|'
      || coalesce(p_activation_expected_version::text, ''),
    v_pepper,
    'sha256'
  ), 'hex');

  select * into v_command
  from public.box_code_commands
  where idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_command.command_type <> 'activation'
      or v_command.caller_auth_user_id <> v_auth_user_id
      or v_command.payload_hash <> v_payload_hash
    then
      return public.box_code_error('IDEMPOTENCY_CONFLICT');
    end if;
    if v_command.result is null then
      return public.box_code_error('ACTIVATION_STATE_CONFLICT');
    end if;
    return jsonb_set(v_command.result, '{replayed}', 'true'::jsonb);
  end if;

  if not public.box_code_attempt_allowed('auth_user', v_actor_hash) then
    return public.box_code_error('TOO_MANY_ATTEMPTS');
  end if;
  if v_ip_hash is not null
    and not public.box_code_attempt_allowed('ip', v_ip_hash)
  then
    return public.box_code_error('TOO_MANY_ATTEMPTS');
  end if;

  if p_code ~ '^JH-(EL|RC)-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$' then
    v_code_format := 'short';
  elsif p_code ~ '^JH-(EL|RC)-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12,16}$' then
    v_code_format := 'long';
  end if;

  if v_code_format is null then
    v_blocked := public.box_code_note_failure('auth_user', v_actor_hash);
    if v_ip_hash is not null then
      v_blocked := public.box_code_note_failure('ip', v_ip_hash) or v_blocked;
    end if;
    if v_blocked then
      return public.box_code_error('TOO_MANY_ATTEMPTS');
    end if;
    return public.box_code_error('CODE_NOT_AVAILABLE');
  end if;

  v_code_hash := encode(hmac(p_code, v_pepper, 'sha256'), 'hex');
  select * into v_code
  from public.box_codes
  where code_hash = v_code_hash
  for update;

  if not found then
    v_blocked := public.box_code_note_failure('auth_user', v_actor_hash);
    if v_ip_hash is not null then
      v_blocked := public.box_code_note_failure('ip', v_ip_hash) or v_blocked;
    end if;
    if v_blocked then
      return public.box_code_error('TOO_MANY_ATTEMPTS');
    end if;
    return public.box_code_error('CODE_NOT_AVAILABLE');
  end if;

  select * into v_command
  from public.box_code_commands
  where idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_command.command_type <> 'activation'
      or v_command.caller_auth_user_id <> v_auth_user_id
      or v_command.payload_hash <> v_payload_hash
    then
      return public.box_code_error('IDEMPOTENCY_CONFLICT');
    end if;
    if v_command.result is null then
      return public.box_code_error('ACTIVATION_STATE_CONFLICT');
    end if;
    return jsonb_set(v_command.result, '{replayed}', 'true'::jsonb);
  end if;

  if v_code.state <> 'pending_review' then
    return public.box_code_error('ACTIVATION_STATE_CONFLICT');
  end if;

  select * into v_activation
  from public.code_activations
  where code_id = v_code.code_id
  for update;
  if not found then
    return public.box_code_error('CODE_NOT_AVAILABLE');
  end if;
  if v_activation.auth_user_id <> v_auth_user_id then
    return public.box_code_error('CODE_NOT_AVAILABLE');
  end if;
  if v_code.version <> p_code_expected_version
    or v_activation.version <> p_activation_expected_version
    or v_activation.activated_at is not null
  then
    return public.box_code_error('ACTIVATION_STATE_CONFLICT');
  end if;
  if v_activation.review_state <> 'approved' then
    return public.box_code_error('ACTIVATION_STATE_CONFLICT');
  end if;
  if v_code.code_type <> v_activation.expected_code_type
    or v_code.code_format <> v_code_format
    or v_activation.expected_code_format <> v_code_format
  then
    return public.box_code_error('CODE_TYPE_MISMATCH');
  end if;
  if nullif(v_activation.shipment_verification_ref, '') is null then
    return public.box_code_error('SHIPMENT_VERIFICATION_REQUIRED');
  end if;
  if v_code.code_type = 'recharge'
    and nullif(v_activation.payment_verification_ref, '') is null
  then
    return public.box_code_error('PAYMENT_VERIFICATION_REQUIRED');
  end if;

  select user_code into v_camper_code
  from public.checkin_sync
  where auth_user_id = v_auth_user_id;
  if not found or v_camper_code <> v_activation.camper_code then
    return public.box_code_error('ACTIVATION_STATE_CONFLICT');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('relation:' || v_auth_user_id::text, 0));
  select relation_id into v_relation_id
  from public.user_coach_relation
  where auth_user_id = v_auth_user_id
    and valid_to is null
  for update;
  if v_relation_id is null and v_activation.target_referrer_id is null then
    return public.box_code_error('COACH_NOT_ELIGIBLE');
  end if;

  -- 教练码必须在同一事务内先锁库存再扣减；历史平台码不伪造教练库存。
  if v_code.inventory_status = 'coach' then
    select * into v_inventory
    from public.coach_inventory
    where coach_id = v_code.coach_id
    for update;

    if not found or v_inventory.available_count < 1 then
      return public.box_code_error('INVENTORY_INSUFFICIENT');
    end if;

    update public.coach_inventory
    set
      available_count = available_count - 1,
      version = version + 1,
      updated_at = now()
    where coach_id = v_code.coach_id;

    insert into public.inventory_logs (
      event_type,
      coach_id,
      code_id,
      quantity,
      operator_id
    ) values (
      'code_activated',
      v_code.coach_id,
      v_code.code_id,
      1,
      v_auth_user_id
    );
  end if;

  insert into public.box_code_commands (
    idempotency_key,
    command_type,
    payload_hash,
    caller_auth_user_id
  ) values (
    p_idempotency_key,
    'activation',
    v_payload_hash,
    v_auth_user_id
  )
  on conflict (idempotency_key) do nothing
  returning idempotency_key into v_inserted_key;

  if v_inserted_key is null then
    select * into v_command
    from public.box_code_commands
    where idempotency_key = p_idempotency_key
    for update;
    if v_command.command_type <> 'activation'
      or v_command.caller_auth_user_id <> v_auth_user_id
      or v_command.payload_hash <> v_payload_hash
    then
      return public.box_code_error('IDEMPOTENCY_CONFLICT');
    end if;
    if v_command.result is null then
      return public.box_code_error('ACTIVATION_STATE_CONFLICT');
    end if;
    return jsonb_set(v_command.result, '{replayed}', 'true'::jsonb);
  end if;

  update public.code_activations
  set activated_at = now(), version = version + 1, updated_at = now()
  where activation_id = v_activation.activation_id
    and version = p_activation_expected_version;
  if not found then
    raise exception 'ACTIVATION_STATE_CONFLICT';
  end if;

  update public.box_codes
  set state = 'active', activation_id = v_activation.activation_id,
    version = version + 1, updated_at = now()
  where code_id = v_code.code_id
    and version = p_code_expected_version;
  if not found then
    raise exception 'ACTIVATION_STATE_CONFLICT';
  end if;

  if v_relation_id is null then
    insert into public.user_coach_relation (
      auth_user_id,
      camper_code,
      referrer_id,
      source_code_id,
      reason
    ) values (
      v_auth_user_id,
      v_activation.camper_code,
      v_activation.target_referrer_id,
      v_code.code_id,
      'activation'
    )
    returning relation_id into v_relation_id;

    insert into public.box_code_events (
      event_type,
      code_id,
      activation_id,
      relation_id,
      actor_auth_user_id
    ) values (
      'UserCoachRelationAssigned',
      v_code.code_id,
      v_activation.activation_id,
      v_relation_id,
      v_auth_user_id
    );
  end if;

  insert into public.box_code_events (
    event_type,
    code_id,
    activation_id,
    actor_auth_user_id
  ) values (
    'CodeActivated',
    v_code.code_id,
    v_activation.activation_id,
    v_auth_user_id
  );

  perform public.box_code_reset_failures('auth_user', v_actor_hash);
  if v_ip_hash is not null then
    perform public.box_code_reset_failures('ip', v_ip_hash);
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'activationId', v_activation.activation_id,
    'codeId', v_code.code_id,
    'relationId', v_relation_id,
    'state', 'active',
    'codeFormat', v_code_format,
    'codeVersion', p_code_expected_version + 1,
    'activationVersion', p_activation_expected_version + 1,
    'replayed', false
  );

  update public.box_code_commands
  set result = v_result
  where idempotency_key = p_idempotency_key;
  return v_result;
end;
$function$;

-- 待审列表只在 Admin 门后读取 Vault 并继续遮蔽码面。
create or replace function public.admin_get_pending_box_code_reviews()
returns table (
  activation_id uuid,
  auth_user_id uuid,
  camper_code text,
  coach_id uuid,
  code_id uuid,
  code_masked text,
  code_type text,
  shipment_verification_ref text,
  payment_verification_ref text,
  code_version integer,
  activation_version integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_pepper text;
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN';
  end if;

  select decrypted_secret into v_pepper
  from vault.decrypted_secrets
  where name = 'box_code_pepper';
  if v_pepper is null or v_pepper = '' then
    raise exception 'BOX_CODE_PEPPER_NOT_CONFIGURED';
  end if;

  return query
  select
    a.activation_id,
    a.auth_user_id,
    a.camper_code,
    b.coach_id,
    b.code_id,
    case
      when b.code_ciphertext is null then '历史码不可用'
      else left(pgp_sym_decrypt(b.code_ciphertext, v_pepper), 6)
        || '…' || right(pgp_sym_decrypt(b.code_ciphertext, v_pepper), 4)
    end as code_masked,
    b.code_type,
    a.shipment_verification_ref,
    a.payment_verification_ref,
    b.version as code_version,
    a.version as activation_version
  from public.code_activations a
  join public.box_codes b on b.code_id = a.code_id
  where a.review_state = 'pending'
    and b.state = 'pending_review'
  order by a.created_at, a.activation_id;
end;
$function$;

-- 人工终审保留原子状态机；新教练归属必须有有效 coach 角色。
create or replace function public.admin_review_box_code_activation(
  p_activation_id uuid,
  p_decision text,
  p_shipment_verification_ref text default null,
  p_payment_verification_ref text default null,
  p_rejection_reason_code text default null,
  p_expected_code_version integer default null,
  p_expected_activation_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_code public.box_codes%rowtype;
  v_activation public.code_activations%rowtype;
  v_relation public.user_coach_relation%rowtype;
  v_inventory public.coach_inventory%rowtype;
  v_target_referrer_id uuid;
  v_relation_id uuid;
  v_shipment_ref text := nullif(btrim(p_shipment_verification_ref), '');
  v_payment_ref text := nullif(btrim(p_payment_verification_ref), '');
  v_rejection_reason text := nullif(btrim(p_rejection_reason_code), '');
  v_platform_id uuid;
  v_pepper text;
  v_replacement_code_id uuid;
  v_replacement_code text;
  v_replacement_hash text;
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code_length integer;
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'REVIEW_DECISION_INVALID';
  end if;

  -- 锁顺序：box_codes → code_activations → user_coach_relation → coach_inventory。
  select b.* into v_code
  from public.box_codes b
  join public.code_activations a on a.code_id = b.code_id
  where a.activation_id = p_activation_id
  for update of b;
  if not found then
    raise exception 'CODE_NOT_AVAILABLE';
  end if;

  select * into v_activation
  from public.code_activations
  where activation_id = p_activation_id
  for update;
  if v_code.state <> 'pending_review'
    or v_activation.review_state <> 'pending'
    or v_code.version is distinct from p_expected_code_version
    or v_activation.version is distinct from p_expected_activation_version
  then
    raise exception 'ACTIVATION_STATE_CONFLICT';
  end if;

  if p_decision = 'rejected' then
    if v_rejection_reason is null then
      raise exception 'REJECTION_REASON_REQUIRED';
    end if;

    select decrypted_secret into v_pepper
    from vault.decrypted_secrets
    where name = 'box_code_pepper';
    if v_pepper is null or v_pepper = '' then
      raise exception 'BOX_CODE_PEPPER_NOT_CONFIGURED';
    end if;
    v_code_length := case when v_code.code_format = 'short' then 4 else 12 end;
    loop
      select string_agg(
        substr(v_alphabet, 1 + get_byte(secret.random_bytes, position.index - 1) % length(v_alphabet), 1),
        ''
      ) into v_replacement_code
      from (select gen_random_bytes(v_code_length) as random_bytes) secret
      cross join lateral (select generate_series(1, v_code_length) as index) position;
      v_replacement_code := (case when v_code.code_type = 'experience' then 'JH-EL-' else 'JH-RC-' end)
        || v_replacement_code;
      v_replacement_hash := encode(hmac(v_replacement_code, v_pepper, 'sha256'), 'hex');
      exit when not exists (select 1 from public.box_codes b where b.code_hash = v_replacement_hash);
    end loop;

    insert into public.box_codes (
      code_hash,
      code_type,
      code_format,
      state,
      coach_id,
      case_id,
      max_checkins,
      used_checkins,
      box_spec,
      inventory_status,
      code_ciphertext
    ) values (
      v_replacement_hash,
      v_code.code_type,
      v_code.code_format,
      'unused',
      v_code.coach_id,
      gen_random_uuid(),
      v_code.max_checkins,
      0,
      v_code.box_spec,
      v_code.inventory_status,
      pgp_sym_encrypt(v_replacement_code, v_pepper)
    )
    returning code_id into v_replacement_code_id;

    update public.code_activations
    set
      review_state = 'rejected',
      decided_by = v_auth_user_id,
      decided_at = now(),
      rejection_reason_code = v_rejection_reason,
      replacement_code_id = v_replacement_code_id,
      version = version + 1,
      updated_at = now()
    where activation_id = v_activation.activation_id;

    update public.box_codes
    set state = 'revoked', version = version + 1, updated_at = now()
    where code_id = v_code.code_id;

    insert into public.box_code_events (event_type, code_id, activation_id, actor_auth_user_id, reason_code)
    values ('CodeActivationRejected', v_code.code_id, v_activation.activation_id, v_auth_user_id, v_rejection_reason);
    insert into public.box_code_events (event_type, code_id, activation_id, actor_auth_user_id, metadata)
    values (
      'CodeReplacementIssued',
      v_replacement_code_id,
      v_activation.activation_id,
      v_auth_user_id,
      jsonb_build_object('replacedCodeId', v_code.code_id)
    );
    insert into public.audit_logs (action, target_id, actor_id, reviewer_id, metadata)
    values (
      'code_activation_rejected',
      v_activation.activation_id,
      v_auth_user_id,
      v_auth_user_id,
      jsonb_build_object(
        'codeId', v_code.code_id,
        'replacementCodeId', v_replacement_code_id,
        'reason', v_rejection_reason
      )
    );

    return jsonb_build_object(
      'ok', true,
      'state', 'revoked',
      'activationId', v_activation.activation_id,
      'replacementCodeId', v_replacement_code_id
    );
  end if;

  v_shipment_ref := coalesce(v_shipment_ref, nullif(v_activation.shipment_verification_ref, ''));
  v_payment_ref := coalesce(v_payment_ref, nullif(v_activation.payment_verification_ref, ''));
  if v_shipment_ref is null then
    raise exception 'SHIPMENT_VERIFICATION_REQUIRED';
  end if;
  if v_code.code_type = 'recharge' and v_payment_ref is null then
    raise exception 'PAYMENT_VERIFICATION_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('relation:' || v_activation.auth_user_id::text, 0));
  select * into v_relation
  from public.user_coach_relation
  where auth_user_id = v_activation.auth_user_id
    and valid_to is null
  for update;

  if found then
    v_target_referrer_id := v_relation.referrer_id;
  elsif exists (
    select 1 from public.coach_lifecycles c
    where c.coach_id = v_code.coach_id and c.state = 'dormant'
  ) then
    select (c.config_value #>> '{}')::uuid into v_platform_id
    from public.system_configs c
    where c.config_key = 'platform_official_account_id';
    if v_platform_id is null or not exists (select 1 from auth.users u where u.id = v_platform_id) then
      raise exception 'PLATFORM_ACCOUNT_NOT_CONFIGURED';
    end if;
    v_target_referrer_id := v_platform_id;
  else
    v_target_referrer_id := v_code.coach_id;
  end if;

  if v_relation.relation_id is null and v_code.inventory_status = 'coach'
    and v_target_referrer_id = v_code.coach_id
    and not exists (
      select 1 from public.camp_admins a
      where a.auth_user_id = v_target_referrer_id and a.role = 'coach' and a.is_active
    ) then
    raise exception 'COACH_NOT_FOUND';
  end if;

  if v_code.inventory_status = 'coach' then
    select * into v_inventory
    from public.coach_inventory
    where coach_id = v_code.coach_id
    for update;
    if not found or v_inventory.available_count < 1 then
      raise exception 'INVENTORY_INSUFFICIENT';
    end if;
  end if;

  update public.code_activations
  set
    shipment_verification_ref = v_shipment_ref,
    payment_verification_ref = v_payment_ref,
    review_state = 'approved',
    target_referrer_id = v_target_referrer_id,
    decided_by = v_auth_user_id,
    decided_at = now(),
    activated_at = now(),
    version = version + 1,
    updated_at = now()
  where activation_id = v_activation.activation_id;

  update public.box_codes
  set
    state = 'active',
    activation_id = v_activation.activation_id,
    version = version + 1,
    updated_at = now()
  where code_id = v_code.code_id;

  if v_relation.relation_id is null then
    insert into public.user_coach_relation (
      auth_user_id,
      camper_code,
      referrer_id,
      source_code_id,
      reason
    ) values (
      v_activation.auth_user_id,
      v_activation.camper_code,
      v_target_referrer_id,
      v_code.code_id,
      'activation'
    )
    returning relation_id into v_relation_id;

    insert into public.box_code_events (event_type, code_id, activation_id, relation_id, actor_auth_user_id)
    values (
      'UserCoachRelationAssigned',
      v_code.code_id,
      v_activation.activation_id,
      v_relation_id,
      v_auth_user_id
    );
  else
    v_relation_id := v_relation.relation_id;
  end if;

  if v_code.inventory_status = 'coach' then
    update public.coach_inventory
    set available_count = available_count - 1, version = version + 1, updated_at = now()
    where coach_id = v_code.coach_id;
    insert into public.inventory_logs (event_type, coach_id, code_id, quantity, operator_id)
    values ('code_activated', v_code.coach_id, v_code.code_id, 1, v_auth_user_id);
  end if;

  insert into public.box_code_events (event_type, code_id, activation_id, actor_auth_user_id)
  values ('CodeActivated', v_code.code_id, v_activation.activation_id, v_auth_user_id);
  insert into public.audit_logs (action, target_id, actor_id, reviewer_id, metadata)
  values (
    'code_activation_approved',
    v_activation.activation_id,
    v_auth_user_id,
    v_auth_user_id,
    jsonb_build_object('codeId', v_code.code_id, 'relationId', v_relation_id)
  );

  return jsonb_build_object(
    'ok', true,
    'state', 'active',
    'activationId', v_activation.activation_id,
    'relationId', v_relation_id
  );
end;
$function$;

-- 二参浏览器适配同样是生效函数；不得遗留另一条 GUC 读取链路。
create or replace function public.activate_box_code(
  p_code text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_pepper text;
  v_code_hash text;
  v_code_expected_version integer;
  v_activation_expected_version integer;
  v_existing_command public.box_code_commands%rowtype;
begin
  if v_auth_user_id is not null and p_idempotency_key is not null then
    select * into v_existing_command
    from public.box_code_commands
    where idempotency_key = p_idempotency_key;

    if
      found
      and v_existing_command.command_type = 'activation'
      and v_existing_command.caller_auth_user_id = v_auth_user_id
      and v_existing_command.result is not null
    then
      v_code_expected_version :=
        (v_existing_command.result->>'codeVersion')::integer - 1;
      v_activation_expected_version :=
        (v_existing_command.result->>'activationVersion')::integer - 1;
    else
      select decrypted_secret into v_pepper
      from vault.decrypted_secrets
      where name = 'box_code_pepper';
      if v_pepper is null or v_pepper = '' then
        return public.box_code_error('BOX_CODE_PEPPER_NOT_CONFIGURED');
      end if;
      if p_code is not null then
        v_code_hash := encode(hmac(p_code, v_pepper, 'sha256'), 'hex');
        select b.version, a.version
        into v_code_expected_version, v_activation_expected_version
        from public.box_codes b
        join public.code_activations a on a.code_id = b.code_id
        where b.code_hash = v_code_hash
          and a.auth_user_id = v_auth_user_id;
      end if;
    end if;
  end if;

  return public.activate_box_code(
    p_code,
    v_code_expected_version,
    v_activation_expected_version,
    p_idempotency_key
  );
end;
$function$;

-- 休眠生命周期只描述状态；枚举与托管对象仍须具备有效 coach 身份。
create or replace function public.admin_get_dormant_coaches()
returns table (coach_id uuid, current_user_count bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    c.coach_id,
    count(r.relation_id) as current_user_count
  from public.coach_lifecycles c
  join public.camp_admins identity
    on identity.auth_user_id = c.coach_id
    and identity.role = 'coach'
    and identity.is_active
  left join public.user_coach_relation r
    on r.referrer_id = c.coach_id and r.valid_to is null
  where c.state = 'dormant'
  group by c.coach_id
  order by c.coach_id;
end;
$function$;

create or replace function public.admin_transfer_dormant_coaches(
  p_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_platform_id uuid;
  v_effective_at timestamptz := clock_timestamp();
  v_coach_id uuid;
  v_relation public.user_coach_relation%rowtype;
  v_transferred_count integer := 0;
  v_coach_count integer := 0;
  v_coach_transferred integer;
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_confirmed is not true then
    raise exception 'MANUAL_CONFIRMATION_REQUIRED';
  end if;

  select (c.config_value #>> '{}')::uuid into v_platform_id
  from public.system_configs c
  where c.config_key = 'platform_official_account_id';
  if v_platform_id is null or not exists (select 1 from auth.users u where u.id = v_platform_id) then
    raise exception 'PLATFORM_ACCOUNT_NOT_CONFIGURED';
  end if;

  for v_coach_id in
    select c.coach_id
    from public.coach_lifecycles c
    join public.camp_admins identity
      on identity.auth_user_id = c.coach_id
      and identity.role = 'coach'
      and identity.is_active
    where c.state = 'dormant'
    order by c.coach_id
  loop
    perform pg_advisory_xact_lock(hashtextextended('trusteeship:' || v_coach_id::text, 0));
    v_coach_transferred := 0;

    for v_relation in
      select r.* from public.user_coach_relation r
      where r.referrer_id = v_coach_id
        and r.valid_to is null
      order by r.auth_user_id
      for update
    loop
      update public.user_coach_relation
      set
        valid_to = v_effective_at,
        reason = 'dormancy_trusteeship',
        version = version + 1,
        updated_at = now()
      where relation_id = v_relation.relation_id;

      insert into public.user_coach_relation (
        auth_user_id,
        camper_code,
        referrer_id,
        source_code_id,
        valid_from,
        reason
      ) values (
        v_relation.auth_user_id,
        v_relation.camper_code,
        v_platform_id,
        v_relation.source_code_id,
        v_effective_at,
        'dormancy_trusteeship'
      );

      insert into public.audit_logs (
        action,
        target_id,
        actor_id,
        reviewer_id,
        from_coach_id,
        to_coach_id,
        metadata
      ) values (
        'coach_users_trusteed',
        v_relation.auth_user_id,
        v_auth_user_id,
        v_auth_user_id,
        v_relation.referrer_id,
        v_platform_id,
        jsonb_build_object(
          'authUserId', v_relation.auth_user_id,
          'effectiveAt', v_effective_at,
          'relationId', v_relation.relation_id
        )
      );
      v_coach_transferred := v_coach_transferred + 1;
      v_transferred_count := v_transferred_count + 1;
    end loop;

    if v_coach_transferred > 0 then
      v_coach_count := v_coach_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'transferredCount', v_transferred_count,
    'coachCount', v_coach_count,
    'effectiveAt', v_effective_at
  );
end;
$function$;

commit;
