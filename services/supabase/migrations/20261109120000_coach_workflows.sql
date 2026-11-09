begin;

-- TASK-10.12 模块二：跟进、无码补货与教练直推。五字段雷达和人工终审保持不变。
create table public.coach_camper_followups (
  coach_id uuid not null references auth.users(id) on delete restrict,
  camper_id uuid not null references auth.users(id) on delete restrict,
  followup_status text not null default 'pending' check (
    followup_status in ('pending', 'contacted', 'waiting_reply', 'resolved', 'escalated')
  ),
  note text not null default '' check (char_length(note) <= 1000),
  version integer not null default 1 check (version > 0),
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (coach_id, camper_id)
);

create table public.coach_restock_requests (
  request_id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete restrict,
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'fulfilled', 'rejected')),
  resolved_by uuid references auth.users(id) on delete restrict,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint coach_restock_resolution_presence check (
    (status = 'pending' and resolved_by is null and resolved_at is null)
    or (status <> 'pending' and resolved_by is not null and resolved_at is not null)
  )
);

create unique index coach_restock_requests_one_pending
  on public.coach_restock_requests (coach_id)
  where status = 'pending';

alter table public.coach_camper_followups enable row level security;
alter table public.coach_restock_requests enable row level security;
revoke all on public.coach_camper_followups from anon, authenticated;
revoke all on public.coach_restock_requests from anon, authenticated;

-- 只暴露当前 relation_id 作为 camper_ref，不向教练返回认证 UID。
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

create or replace function public.admin_get_camper_followup_v1(p_camper_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_coach_id uuid;
  v_followup public.coach_camper_followups%rowtype;
begin
  if v_auth_user_id is null or not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select r.referrer_id into v_coach_id
  from public.user_coach_relation r
  where r.auth_user_id = p_camper_id and r.valid_to is null;
  if not found then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select f.* into v_followup
  from public.coach_camper_followups f
  where f.coach_id = v_coach_id and f.camper_id = p_camper_id;
  return jsonb_build_object(
    'followupStatus', coalesce(v_followup.followup_status, 'pending'),
    'note', coalesce(v_followup.note, ''),
    'version', coalesce(v_followup.version, 0)
  );
end;
$function$;

create or replace function public.admin_set_camper_followup_v1(
  p_camper_id uuid,
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
  v_coach_id uuid;
  v_note text := btrim(coalesce(p_note, ''));
  v_followup public.coach_camper_followups%rowtype;
begin
  if v_auth_user_id is null or not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_followup_status not in ('pending', 'contacted', 'waiting_reply', 'resolved', 'escalated')
    or char_length(v_note) > 1000
  then
    raise exception 'FOLLOWUP_INPUT_INVALID';
  end if;
  select r.referrer_id into v_coach_id
  from public.user_coach_relation r
  where r.auth_user_id = p_camper_id and r.valid_to is null
  for update of r;
  if not found then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select f.* into v_followup
  from public.coach_camper_followups f
  where f.coach_id = v_coach_id and f.camper_id = p_camper_id
  for update;
  if found then
    if p_expected_version is null or p_expected_version <> v_followup.version then
      raise exception 'FOLLOWUP_VERSION_CONFLICT';
    end if;
    update public.coach_camper_followups f
    set followup_status = p_followup_status, note = v_note,
      version = f.version + 1, updated_by = v_auth_user_id, updated_at = now()
    where f.coach_id = v_coach_id and f.camper_id = p_camper_id
    returning f.* into v_followup;
  else
    if p_expected_version is distinct from 0 then
      raise exception 'FOLLOWUP_VERSION_CONFLICT';
    end if;
    insert into public.coach_camper_followups (
      coach_id, camper_id, followup_status, note, updated_by
    ) values (
      v_coach_id, p_camper_id, p_followup_status, v_note, v_auth_user_id
    ) returning * into v_followup;
  end if;
  return jsonb_build_object(
    'ok', true, 'followupStatus', v_followup.followup_status,
    'note', v_followup.note, 'version', v_followup.version
  );
end;
$function$;

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
    select 1 from public.user_coach_relation r
    where r.referrer_id = v_auth_user_id and r.valid_to is null
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

create or replace function public.admin_get_coach_restock_requests_v1()
returns table (request_id uuid, coach_id uuid, note text, status text, created_at timestamptz)
language plpgsql
stable
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
  return query
  select q.request_id, q.coach_id, q.note, q.status, q.created_at
  from public.coach_restock_requests q
  order by (q.status = 'pending') desc, q.created_at, q.request_id;
end;
$function$;

create or replace function public.admin_resolve_coach_restock_request_v1(
  p_request_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_request public.coach_restock_requests%rowtype;
begin
  if v_auth_user_id is null or not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_decision not in ('fulfilled', 'rejected') then
    raise exception 'RESTOCK_DECISION_INVALID';
  end if;
  select q.* into v_request
  from public.coach_restock_requests q
  where q.request_id = p_request_id
  for update;
  if not found or v_request.status <> 'pending' then
    raise exception 'RESTOCK_STATE_CONFLICT';
  end if;
  if p_decision = 'fulfilled' and not exists (
    select 1 from public.coach_inventory i
    where i.coach_id = v_request.coach_id and i.available_count > 0
  ) and not exists (
    select 1 from public.box_codes b
    where b.coach_id = v_request.coach_id and b.inventory_status = 'coach' and b.state = 'unused'
  ) then
    raise exception 'RESTOCK_NOT_FULFILLED';
  end if;
  update public.coach_restock_requests q
  set status = p_decision, resolved_by = v_auth_user_id, resolved_at = now()
  where q.request_id = p_request_id;
  return jsonb_build_object('ok', true, 'requestId', p_request_id, 'status', p_decision);
end;
$function$;

-- 直推只创建 pending 审核；锁顺序为 box_codes → user_coach_relation，不触碰库存计数。
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

revoke all on function public.get_coach_campers_v1() from public, anon, authenticated;
revoke all on function public.get_coach_camper_followup_v1(uuid) from public, anon, authenticated;
revoke all on function public.set_coach_camper_followup_v1(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.admin_get_camper_followup_v1(uuid) from public, anon, authenticated;
revoke all on function public.admin_set_camper_followup_v1(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.request_coach_restock_v1(text) from public, anon, authenticated;
revoke all on function public.admin_get_coach_restock_requests_v1() from public, anon, authenticated;
revoke all on function public.admin_resolve_coach_restock_request_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.coach_push_code_v1(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.get_coach_campers_v1() to authenticated;
grant execute on function public.get_coach_camper_followup_v1(uuid) to authenticated;
grant execute on function public.set_coach_camper_followup_v1(uuid, text, text, integer) to authenticated;
grant execute on function public.admin_get_camper_followup_v1(uuid) to authenticated;
grant execute on function public.admin_set_camper_followup_v1(uuid, text, text, integer) to authenticated;
grant execute on function public.request_coach_restock_v1(text) to authenticated;
grant execute on function public.admin_get_coach_restock_requests_v1() to authenticated;
grant execute on function public.admin_resolve_coach_restock_request_v1(uuid, text) to authenticated;
grant execute on function public.coach_push_code_v1(uuid, uuid, text) to authenticated;

commit;
