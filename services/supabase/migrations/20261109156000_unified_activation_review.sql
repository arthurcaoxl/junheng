begin;

-- TASK-10.13：两条申请路径共用既有 Admin 终审；删除遗留自助激活公开入口。
drop function public.activate_box_code(text, text);
drop function public.activate_box_code(text, integer, integer, text);

-- 来源是申请身份的一部分，不接受客户端传参，也不允许后续改写。
alter table public.code_activations
  add column request_source text;

update public.code_activations a
set request_source = coalesce(
  (
    select case
      when e.actor_auth_user_id = a.auth_user_id then 'manual_code'
      when e.actor_auth_user_id is not null then 'coach_push'
      else 'manual_code'
    end
    from public.box_code_events e
    where e.activation_id = a.activation_id
      and e.event_type = 'CodeActivationRequested'
    order by e.created_at, e.event_id
    limit 1
  ),
  'manual_code'
);

alter table public.code_activations
  alter column request_source set not null,
  add constraint code_activations_request_source_check
    check (request_source in ('manual_code', 'coach_push'));

create or replace function public.guard_code_activation_source_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if NEW.request_source is distinct from OLD.request_source then
    raise exception 'CODE_ACTIVATION_IDENTITY_IMMUTABLE';
  end if;
  return NEW;
end;
$function$;

create trigger code_activation_source_immutable
before update on public.code_activations
for each row execute function public.guard_code_activation_source_immutable();

-- 不复制终审状态机：仅在既有终审审计落库时补充申请来源。
create or replace function public.enrich_code_activation_audit_source()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_request_source text;
begin
  if NEW.action in ('code_activation_approved', 'code_activation_rejected') then
    select a.request_source into v_request_source
    from public.code_activations a
    where a.activation_id = NEW.target_id;
    if v_request_source is null then
      raise exception 'ACTIVATION_SOURCE_REQUIRED';
    end if;
    NEW.metadata := jsonb_set(
      NEW.metadata,
      '{requestSource}',
      to_jsonb(v_request_source),
      true
    );
  end if;
  return NEW;
end;
$function$;

create trigger audit_log_code_activation_source
before insert on public.audit_logs
for each row execute function public.enrich_code_activation_audit_source();

-- 用户输码仍只创建 pending；同键首写串行化后才读取命令结果。
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

  v_actor_hash := encode(hmac(v_auth_user_id::text, v_pepper, 'sha256'), 'hex');
  v_device_hash := encode(hmac(p_device_hash, v_pepper, 'sha256'), 'hex');
  v_trusted_ip := nullif(current_setting('app.trusted_client_ip', true), '');
  if v_trusted_ip is not null then
    v_ip_hash := encode(hmac(v_trusted_ip, v_pepper, 'sha256'), 'hex');
  end if;

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

  perform pg_advisory_xact_lock(
    hashtextextended('box-code-command:' || p_idempotency_key, 0)
  );

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
    review_state,
    request_source
  ) values (
    v_code.code_id,
    v_auth_user_id,
    v_camper_code,
    v_code.code_type,
    v_code_format,
    'pending',
    'manual_code'
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
    actor_auth_user_id,
    metadata
  ) values (
    'CodeActivationRequested',
    v_code.code_id,
    v_activation_id,
    v_auth_user_id,
    jsonb_build_object('requestSource', 'manual_code')
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

-- 教练直推仍只创建 pending；staff 在读取 Vault 或目标数据前被拒并留痕。
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
  if exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id
      and a.role = 'staff'
  ) then
    insert into public.staff_rbac_audit (
      action, actor_id, target_id, target_role, result, reason_code, metadata
    ) values (
      'staff_finance_denied', v_auth_user_id, v_auth_user_id, 'staff',
      'denied', 'FORBIDDEN', jsonb_build_object('operation', 'coach_push_code_v1')
    );
    return public.box_code_error('FORBIDDEN');
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

  perform pg_advisory_xact_lock(
    hashtextextended('box-code-command:' || p_idempotency_key, 0)
  );

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
    code_id,
    auth_user_id,
    camper_code,
    expected_code_type,
    expected_code_format,
    review_state,
    request_source
  ) values (
    v_code.code_id,
    v_relation.auth_user_id,
    v_relation.camper_code,
    v_code.code_type,
    v_code_format,
    'pending',
    'coach_push'
  ) returning activation_id into v_activation_id;

  update public.box_codes
  set state = 'pending_review', version = version + 1, updated_at = now()
  where code_id = v_code.code_id and version = v_code.version;

  insert into public.box_code_events (
    event_type,
    code_id,
    activation_id,
    actor_auth_user_id,
    metadata
  ) values (
    'CodeActivationRequested',
    v_code.code_id,
    v_activation_id,
    v_auth_user_id,
    jsonb_build_object('requestSource', 'coach_push')
  );

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

revoke all on function public.guard_code_activation_source_immutable() from public, anon, authenticated;
revoke all on function public.enrich_code_activation_audit_source() from public, anon, authenticated;
revoke all on function public.request_box_code_activation(text, text, text) from public, anon, authenticated;
revoke all on function public.coach_push_code_v1(uuid, uuid, text) from public, anon, authenticated;

-- 浏览器只能调用带归属核对的 v2；原函数仅作为其内部原子事务保留。
revoke all on function public.admin_review_box_code_activation(uuid, text, text, text, text, integer, integer)
from public, anon, authenticated;
revoke all on function public.admin_review_box_code_activation_v2(uuid, text, uuid, text, text, text, integer, integer)
from public, anon, authenticated;

grant execute on function public.request_box_code_activation(text, text, text) to authenticated;
grant execute on function public.coach_push_code_v1(uuid, uuid, text) to authenticated;
grant execute on function public.admin_review_box_code_activation_v2(uuid, text, uuid, text, text, text, integer, integer) to authenticated;

commit;
