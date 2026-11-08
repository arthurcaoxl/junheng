begin;

-- TASK-10.10：默认阈值只播种一次；运行期判断始终读取 SystemConfig。
insert into public.system_configs (config_key, config_value) values
  ('activation_request_ip_rate_limit_per_minute', '30'::jsonb),
  ('activation_request_device_rate_limit_per_minute', '3'::jsonb)
on conflict (config_key) do nothing;

alter table public.box_code_attempt_guards
  drop constraint if exists box_code_attempt_guards_scope_type_check;
alter table public.box_code_attempt_guards
  add constraint box_code_attempt_guards_scope_type_check
  check (scope_type in ('auth_user', 'ip', 'device'));

-- 申请入口的 IP / 设备维采用独立的一分钟固定窗口；不改动既有 auth_user 防护函数。
create or replace function public.box_code_request_attempt_allowed(
  p_scope_type text,
  p_scope_hash text,
  p_max_attempts integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_guard public.box_code_attempt_guards%rowtype;
begin
  if p_scope_type not in ('ip', 'device')
    or nullif(p_scope_hash, '') is null
    or p_max_attempts is null
    or p_max_attempts <= 0
  then
    raise exception 'SYSTEM_CONFIG_MISSING';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('activation-request:' || p_scope_type || ':' || p_scope_hash, 0)
  );

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
      window_started_at,
      blocked_until
    ) values (
      p_scope_type,
      p_scope_hash,
      1,
      now(),
      null
    );
    return true;
  end if;

  if v_guard.window_started_at is null
    or v_guard.window_started_at <= now() - interval '1 minute'
  then
    update public.box_code_attempt_guards
    set
      failure_count = 1,
      window_started_at = now(),
      blocked_until = null,
      updated_at = now()
    where scope_type = p_scope_type
      and scope_hash = p_scope_hash;
    return true;
  end if;

  -- 第 N 次允许并计数，第 N+1 次起在同一窗口内拒绝。
  if v_guard.failure_count >= p_max_attempts then
    update public.box_code_attempt_guards
    set
      failure_count = v_guard.failure_count + 1,
      blocked_until = v_guard.window_started_at + interval '1 minute',
      updated_at = now()
    where scope_type = p_scope_type
      and scope_hash = p_scope_hash;
    return false;
  end if;

  update public.box_code_attempt_guards
  set
    failure_count = v_guard.failure_count + 1,
    blocked_until = null,
    updated_at = now()
  where scope_type = p_scope_type
    and scope_hash = p_scope_hash;
  return true;
end;
$function$;

-- 删除旧两参入口，避免保留可绕过设备维的重载函数。
drop function public.request_box_code_activation(text, text);

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

  v_pepper := nullif(current_setting('app.box_code_pepper', true), '');
  if v_pepper is null then
    return public.box_code_error('CODE_HASH_NOT_CONFIGURED');
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

revoke all on function public.box_code_request_attempt_allowed(text, text, integer)
from public, anon, authenticated;
revoke all on function public.request_box_code_activation(text, text, text)
from public, anon, authenticated;
grant execute on function public.request_box_code_activation(text, text, text)
to authenticated;

commit;
