begin;

-- TASK-10.8：补货阈值只播种一次，后续调整由受控配置审计承接。
insert into public.system_configs (config_key, config_value) values
  ('coach_restock_point', '12'::jsonb)
on conflict (config_key) do nothing;

alter table public.box_codes
  add column inventory_status text not null default 'platform'
    check (inventory_status in ('platform', 'coach')),
  add column code_ciphertext bytea;

create table public.coach_inventory (
  coach_id uuid primary key references auth.users(id) on delete restrict,
  allocated_count integer not null default 0 check (allocated_count >= 0),
  available_count integer not null default 0 check (available_count >= 0),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_inventory_available_within_allocated check (
    available_count <= allocated_count
  )
);

create table public.inventory_logs (
  log_id uuid primary key default gen_random_uuid(),
  event_type text not null check (
    event_type in ('platform_generated', 'coach_allocated', 'code_activated')
  ),
  coach_id uuid references auth.users(id) on delete restrict,
  code_id uuid references public.box_codes(code_id) on delete restrict,
  case_id uuid,
  quantity integer not null check (quantity > 0),
  operator_id uuid not null references auth.users(id) on delete restrict,
  offline_receipt_no text,
  created_at timestamptz not null default now(),
  constraint inventory_generation_receipt_required check (
    event_type <> 'platform_generated'
    or nullif(btrim(offline_receipt_no), '') is not null
  )
);

alter table public.coach_inventory enable row level security;
alter table public.inventory_logs enable row level security;
revoke all on public.coach_inventory from anon, authenticated;
revoke all on public.inventory_logs from anon, authenticated;
revoke all on public.box_codes from anon, authenticated;

create or replace function public.prevent_inventory_log_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  raise exception 'INVENTORY_LOG_APPEND_ONLY';
end;
$function$;

create trigger inventory_log_append_only
before update or delete on public.inventory_logs
for each row execute function public.prevent_inventory_log_mutation();

-- 仅划拨 RPC 可将平台 unused 码改属教练；其余身份与生命周期保护保持不变。
create or replace function public.guard_box_code_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if TG_OP = 'DELETE' then
    raise exception 'BOX_CODE_HISTORY_IMMUTABLE';
  end if;

  if
    NEW.code_id is distinct from OLD.code_id
    or NEW.code_hash is distinct from OLD.code_hash
    or NEW.code_type is distinct from OLD.code_type
    or NEW.coach_id is distinct from OLD.coach_id
    or NEW.case_id is distinct from OLD.case_id
    or NEW.created_at is distinct from OLD.created_at
  then
    if not (
      NEW.coach_id is distinct from OLD.coach_id
      and NEW.code_id is not distinct from OLD.code_id
      and NEW.code_hash is not distinct from OLD.code_hash
      and NEW.code_type is not distinct from OLD.code_type
      and NEW.case_id is not distinct from OLD.case_id
      and NEW.created_at is not distinct from OLD.created_at
      and OLD.state = 'unused'
      and NEW.state = 'unused'
      and OLD.inventory_status = 'platform'
      and NEW.inventory_status = 'coach'
      and coalesce(current_setting('app.inventory_allocation_verified', true), '') = 'on'
    ) then
      raise exception 'BOX_CODE_IDENTITY_IMMUTABLE';
    end if;
  end if;

  if NEW.code_ciphertext is distinct from OLD.code_ciphertext then
    raise exception 'BOX_CODE_SECRET_IMMUTABLE';
  end if;

  if NEW.inventory_status is distinct from OLD.inventory_status and not (
    OLD.state = 'unused'
    and NEW.state = 'unused'
    and OLD.inventory_status = 'platform'
    and NEW.inventory_status = 'coach'
    and coalesce(current_setting('app.inventory_allocation_verified', true), '') = 'on'
  ) then
    raise exception 'BOX_CODE_INVENTORY_STATUS_IMMUTABLE';
  end if;

  if NEW.version <> OLD.version + 1 then
    raise exception 'BOX_CODE_VERSION_CONFLICT';
  end if;

  if NEW.state is distinct from OLD.state and not (
    (OLD.state = 'unused' and NEW.state in ('pending_review', 'revoked'))
    or (OLD.state = 'pending_review' and NEW.state in ('active', 'revoked'))
    or (OLD.state = 'active' and NEW.state = 'revoked')
  ) then
    raise exception 'BOX_CODE_STATE_CONFLICT';
  end if;

  if NEW.activation_id is distinct from OLD.activation_id and not (
    OLD.state = 'pending_review'
    and NEW.state = 'active'
    and OLD.activation_id is null
    and NEW.activation_id is not null
  ) then
    raise exception 'BOX_CODE_ACTIVATION_IMMUTABLE';
  end if;

  return NEW;
end;
$function$;

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

  v_pepper := nullif(current_setting('app.box_code_pepper', true), '');
  if v_pepper is null then
    raise exception 'CODE_HASH_NOT_CONFIGURED';
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
  if not exists (select 1 from auth.users u where u.id = p_coach_id) then
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

  v_pepper := nullif(current_setting('app.box_code_pepper', true), '');
  if v_pepper is null then
    raise exception 'CODE_HASH_NOT_CONFIGURED';
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

-- 在既有激活函数中追加库存闸门；原认证、限流、幂等、审核与归属逻辑不变。
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

  v_pepper := nullif(current_setting('app.box_code_pepper', true), '');
  if v_pepper is null then
    return public.box_code_error('CODE_HASH_NOT_CONFIGURED');
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

revoke all on function public.generate_platform_codes(integer, text, text)
from public, anon, authenticated;
revoke all on function public.allocate_codes_to_coach(uuid, integer)
from public, anon, authenticated;
revoke all on function public.get_my_code_inventory()
from public, anon, authenticated;
revoke all on function public.activate_box_code(text, integer, integer, text)
from public, anon, authenticated;

grant execute on function public.generate_platform_codes(integer, text, text) to authenticated;
grant execute on function public.allocate_codes_to_coach(uuid, integer) to authenticated;
grant execute on function public.get_my_code_inventory() to authenticated;
grant execute on function public.activate_box_code(text, integer, integer, text) to authenticated;

commit;
