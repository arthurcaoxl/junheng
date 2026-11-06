begin;

alter table public.box_codes
  add column code_format text not null default 'short'
  check (code_format in ('short', 'long'));

alter table public.code_activations
  add column expected_code_format text not null default 'short'
  check (expected_code_format in ('short', 'long'));

create table public.box_code_attempt_guards (
  scope_type text not null check (scope_type in ('auth_user', 'ip')),
  scope_hash text not null,
  failure_count integer not null default 0 check (failure_count >= 0),
  window_started_at timestamptz,
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (scope_type, scope_hash)
);

alter table public.box_code_attempt_guards enable row level security;
revoke all on public.box_code_attempt_guards from anon, authenticated;

alter table public.box_codes enable row level security;
alter table public.code_activations enable row level security;
alter table public.user_coach_relation enable row level security;
alter table public.box_code_commands enable row level security;
alter table public.box_code_events enable row level security;

revoke all on public.box_codes from anon, authenticated;
revoke all on public.code_activations from anon, authenticated;
revoke all on public.user_coach_relation from anon, authenticated;
revoke all on public.box_code_commands from anon, authenticated;
revoke all on public.box_code_events from anon, authenticated;

create or replace function public.box_code_error(p_error_code text)
returns jsonb
language sql
immutable
strict
set search_path = public, pg_temp
as $function$
  select jsonb_build_object('ok', false, 'errorCode', p_error_code);
$function$;

create or replace function public.box_code_attempt_allowed(
  p_scope_type text,
  p_scope_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_guard public.box_code_attempt_guards%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_scope_type || ':' || p_scope_hash, 0)
  );

  select * into v_guard
  from public.box_code_attempt_guards
  where scope_type = p_scope_type
    and scope_hash = p_scope_hash
  for update;

  if not found then
    return true;
  end if;

  if v_guard.blocked_until is not null and v_guard.blocked_until > now() then
    return false;
  end if;

  if
    v_guard.blocked_until is not null
    or v_guard.window_started_at <= now() - interval '10 minutes'
  then
    update public.box_code_attempt_guards
    set
      failure_count = 0,
      window_started_at = null,
      blocked_until = null,
      updated_at = now()
    where scope_type = p_scope_type
      and scope_hash = p_scope_hash;
  end if;

  return true;
end;
$function$;

create or replace function public.box_code_note_failure(
  p_scope_type text,
  p_scope_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_guard public.box_code_attempt_guards%rowtype;
  v_failure_count integer;
  v_window_started_at timestamptz;
  v_blocked_until timestamptz;
begin
  select * into v_guard
  from public.box_code_attempt_guards
  where scope_type = p_scope_type
    and scope_hash = p_scope_hash
  for update;

  if not found then
    insert into public.box_code_attempt_guards (
      scope_type,
      scope_hash,
      failure_count,
      window_started_at
    ) values (
      p_scope_type,
      p_scope_hash,
      1,
      now()
    );
    return false;
  end if;

  if
    v_guard.window_started_at is null
    or v_guard.window_started_at <= now() - interval '10 minutes'
  then
    v_failure_count := 1;
    v_window_started_at := now();
  else
    v_failure_count := v_guard.failure_count + 1;
    v_window_started_at := v_guard.window_started_at;
  end if;

  if v_failure_count >= 5 then
    v_blocked_until := now() + interval '15 minutes';
  end if;

  update public.box_code_attempt_guards
  set
    failure_count = v_failure_count,
    window_started_at = v_window_started_at,
    blocked_until = v_blocked_until,
    updated_at = now()
  where scope_type = p_scope_type
    and scope_hash = p_scope_hash;

  return v_failure_count >= 5;
end;
$function$;

create or replace function public.box_code_reset_failures(
  p_scope_type text,
  p_scope_hash text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  update public.box_code_attempt_guards
  set
    failure_count = 0,
    window_started_at = null,
    blocked_until = null,
    updated_at = now()
  where scope_type = p_scope_type
    and scope_hash = p_scope_hash;
end;
$function$;

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

  v_actor_hash := encode(
    hmac(v_auth_user_id::text, v_pepper, 'sha256'),
    'hex'
  );
  v_trusted_ip := nullif(current_setting('app.trusted_client_ip', true), '');
  if v_trusted_ip is not null then
    v_ip_hash := encode(hmac(v_trusted_ip, v_pepper, 'sha256'), 'hex');
  end if;

  v_payload_hash := encode(
    hmac(
      v_auth_user_id::text || '|' || coalesce(p_code, '') || '|'
        || coalesce(p_code_expected_version::text, '') || '|'
        || coalesce(p_activation_expected_version::text, ''),
      v_pepper,
      'sha256'
    ),
    'hex'
  );

  select * into v_command
  from public.box_code_commands
  where idempotency_key = p_idempotency_key
  for update;

  if found then
    if
      v_command.command_type <> 'activation'
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

  if
    v_ip_hash is not null
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
    if
      v_command.command_type <> 'activation'
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

  if
    v_code.version <> p_code_expected_version
    or v_activation.version <> p_activation_expected_version
    or v_activation.activated_at is not null
  then
    return public.box_code_error('ACTIVATION_STATE_CONFLICT');
  end if;

  if v_activation.review_state <> 'approved' then
    return public.box_code_error('ACTIVATION_STATE_CONFLICT');
  end if;

  if
    v_code.code_type <> v_activation.expected_code_type
    or v_code.code_format <> v_code_format
    or v_activation.expected_code_format <> v_code_format
  then
    return public.box_code_error('CODE_TYPE_MISMATCH');
  end if;

  if nullif(v_activation.shipment_verification_ref, '') is null then
    return public.box_code_error('SHIPMENT_VERIFICATION_REQUIRED');
  end if;

  if
    v_code.code_type = 'recharge'
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

  perform pg_advisory_xact_lock(
    hashtextextended('relation:' || v_auth_user_id::text, 0)
  );

  select relation_id into v_relation_id
  from public.user_coach_relation
  where auth_user_id = v_auth_user_id
    and valid_to is null
  for update;

  if v_relation_id is null and v_activation.target_referrer_id is null then
    return public.box_code_error('COACH_NOT_ELIGIBLE');
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

    if
      v_command.command_type <> 'activation'
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
  set
    activated_at = now(),
    version = version + 1,
    updated_at = now()
  where activation_id = v_activation.activation_id
    and version = p_activation_expected_version;

  if not found then
    raise exception 'ACTIVATION_STATE_CONFLICT';
  end if;

  update public.box_codes
  set
    state = 'active',
    activation_id = v_activation.activation_id,
    version = version + 1,
    updated_at = now()
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

revoke all on function public.box_code_error(text)
from public, anon, authenticated;
revoke all on function public.box_code_attempt_allowed(text, text)
from public, anon, authenticated;
revoke all on function public.box_code_note_failure(text, text)
from public, anon, authenticated;
revoke all on function public.box_code_reset_failures(text, text)
from public, anon, authenticated;
revoke all on function public.activate_box_code(text, integer, integer, text)
from public, anon, authenticated;

grant execute on function public.activate_box_code(text, integer, integer, text)
to authenticated;

commit;
