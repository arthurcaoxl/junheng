begin;

-- TASK-10.15 G-S3：staff 在幂等、Vault、码与关系读取前物理拒绝；coach 状态机不变。
create or replace function public.coach_push_code_v1(
  p_camper_ref uuid,
  p_code_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
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
  if v_auth_user_id is null then return public.box_code_error('UNAUTHORIZED'); end if;
  if exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'staff'
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if public.coach_promotion_is_probational(v_auth_user_id) then
    return public.box_code_error('FORBIDDEN');
  end if;
  if nullif(p_idempotency_key, '') is null then return public.box_code_error('IDEMPOTENCY_CONFLICT'); end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'coach' and a.is_active
  ) then
    return public.box_code_error('FORBIDDEN');
  end if;

  select decrypted_secret into v_pepper from vault.decrypted_secrets where name = 'box_code_pepper';
  if v_pepper is null or v_pepper = '' then return public.box_code_error('BOX_CODE_PEPPER_NOT_CONFIGURED'); end if;
  v_payload_hash := encode(hmac(
    'coach_push|' || v_auth_user_id::text || '|' || coalesce(p_camper_ref::text, '') || '|' || coalesce(p_code_id::text, ''),
    v_pepper, 'sha256'
  ), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('box-code-command:' || p_idempotency_key, 0));

  select * into v_command from public.box_code_commands where idempotency_key = p_idempotency_key for update;
  if found then
    if v_command.command_type <> 'activation' or v_command.caller_auth_user_id <> v_auth_user_id
      or v_command.payload_hash <> v_payload_hash then
      return public.box_code_error('IDEMPOTENCY_CONFLICT');
    end if;
    if v_command.result is null then return public.box_code_error('ACTIVATION_STATE_CONFLICT'); end if;
    return jsonb_set(v_command.result, '{replayed}', 'true'::jsonb);
  end if;

  select b.* into v_code from public.box_codes b
  where b.code_id = p_code_id and b.coach_id = v_auth_user_id
    and b.inventory_status = 'coach' and b.state = 'unused'
  for update of b;
  if not found then return public.box_code_error('CODE_NOT_AVAILABLE'); end if;

  select r.* into v_relation from public.user_coach_relation r
  where r.relation_id = p_camper_ref and r.valid_to is null
    and r.referrer_id = v_auth_user_id
  for update of r;
  if not found then return public.box_code_error('FORBIDDEN'); end if;

  v_code_text := pgp_sym_decrypt(v_code.code_ciphertext, v_pepper);
  if v_code_text ~ '^JH-(EL|RC)-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$' then
    v_code_format := 'short';
  elsif v_code_text ~ '^JH-(EL|RC)-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12,16}$' then
    v_code_format := 'long';
  else
    return public.box_code_error('CODE_NOT_AVAILABLE');
  end if;

  insert into public.code_activations (
    code_id, auth_user_id, camper_code, expected_code_type,
    expected_code_format, review_state, request_source
  ) values (
    v_code.code_id, v_relation.auth_user_id, v_relation.camper_code,
    v_code.code_type, v_code_format, 'pending', 'coach_push'
  ) returning activation_id into v_activation_id;
  update public.box_codes set state = 'pending_review', version = version + 1, updated_at = now()
  where code_id = v_code.code_id and version = v_code.version;
  insert into public.box_code_events (
    event_type, code_id, activation_id, actor_auth_user_id, metadata
  ) values (
    'CodeActivationRequested', v_code.code_id, v_activation_id, v_auth_user_id,
    jsonb_build_object('requestSource', 'coach_push')
  );
  v_result := jsonb_build_object(
    'ok', true, 'activationId', v_activation_id, 'codeId', v_code.code_id,
    'state', 'pending_review', 'replayed', false
  );
  insert into public.box_code_commands (
    idempotency_key, command_type, payload_hash, caller_auth_user_id, result
  ) values (p_idempotency_key, 'activation', v_payload_hash, v_auth_user_id, v_result);
  return v_result;
end;
$function$;

revoke all on function public.coach_push_code_v1(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.coach_push_code_v1(uuid, uuid, text) to authenticated;

comment on function public.coach_push_code_v1(uuid, uuid, text) is
  'TASK-10.15: staff denied with SQLSTATE 42501 before command, Vault, code or relation access; formal coach path unchanged.';

commit;
