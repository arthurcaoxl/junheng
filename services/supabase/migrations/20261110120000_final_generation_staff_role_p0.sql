begin;

-- TASK-10.13-FINAL-CLEARANCE：最终函数必须看到 Supabase extensions schema。
-- 一盒一码；24 仅表示既有物理整箱容量，尾箱按实际数量生成与记账。
create or replace function public.generate_platform_codes(
  p_count integer,
  p_box_spec text,
  p_offline_receipt_no text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
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
  v_case_count integer;
  v_codes_in_case integer;
begin
  if v_auth_user_id is null then raise exception 'UNAUTHORIZED'; end if;
  if public.coach_promotion_is_probational(v_auth_user_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if nullif(btrim(p_offline_receipt_no), '') is null then raise exception 'OFFLINE_RECEIPT_REQUIRED'; end if;
  if p_count is null or p_count <= 0 then
    raise exception 'INVALID_CODE_COUNT';
  end if;

  select (c.config_value #>> '{}')::integer into v_max_checkins
  from public.system_configs c where c.config_key = 'max_checkins_per_box' for update;
  if not found or v_max_checkins is null or v_max_checkins <= 0 then raise exception 'SYSTEM_CONFIG_MISSING'; end if;
  select c.config_value #>> '{}' into v_box_spec
  from public.system_configs c where c.config_key = 'default_box_spec' for update;
  if not found or v_box_spec is null or p_box_spec is distinct from v_box_spec then
    raise exception 'BOX_SPEC_CONFIG_MISMATCH';
  end if;
  select (c.config_value ->> 'default_expires_at')::timestamptz into v_expires_at
  from public.system_configs c where c.config_key = 'box_code_expiry_policy' for update;
  if not found or v_expires_at is null then raise exception 'SYSTEM_CONFIG_MISSING'; end if;
  select decrypted_secret into v_pepper from vault.decrypted_secrets where name = 'box_code_pepper';
  if v_pepper is null or v_pepper = '' then raise exception 'BOX_CODE_PEPPER_NOT_CONFIGURED'; end if;

  v_case_count := ceil(p_count / 24.0)::integer;
  for v_case_index in 1..v_case_count loop
    v_case_id := gen_random_uuid();
    v_case_ids := array_append(v_case_ids, v_case_id);
    v_codes_in_case := least(24, p_count - ((v_case_index - 1) * 24));
    for v_code_index in 1..v_codes_in_case loop
      loop
        select string_agg(
          substr(v_alphabet, 1 + get_byte(secret.random_bytes, position.index - 1) % length(v_alphabet), 1), ''
        ) into v_code
        from (select gen_random_bytes(4) as random_bytes) secret
        cross join lateral (select generate_series(1, 4) as index) position;
        v_code := 'JH-EL-' || v_code;
        v_code_hash := encode(hmac(v_code, v_pepper, 'sha256'), 'hex');
        exit when not exists (select 1 from public.box_codes b where b.code_hash = v_code_hash);
      end loop;
      insert into public.box_codes (
        code_hash, code_type, code_format, state, coach_id, case_id,
        max_checkins, used_checkins, box_spec, inventory_status, code_ciphertext, expires_at
      ) values (
        v_code_hash, 'experience', 'short', 'unused', v_auth_user_id, v_case_id,
        v_max_checkins, 0, v_box_spec, 'platform', pgp_sym_encrypt(v_code, v_pepper), v_expires_at
      );
    end loop;
    insert into public.inventory_logs (
      event_type, case_id, quantity, operator_id, offline_receipt_no
    ) values ('platform_generated', v_case_id, v_codes_in_case, v_auth_user_id, btrim(p_offline_receipt_no));
  end loop;
  return jsonb_build_object(
    'ok', true, 'generatedCount', p_count, 'caseIds', to_jsonb(v_case_ids),
    'boxSpec', v_box_spec, 'maxCheckins', v_max_checkins
  );
end;
$function$;

-- 保持既有乐观版本、幂等与角色冲突语义，仅补齐扩展可见性。
create or replace function public.admin_set_staff_role(
  p_email text,
  p_is_active boolean,
  p_expected_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
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

revoke all on function public.generate_platform_codes(integer, text, text) from public, anon, authenticated;
revoke all on function public.admin_set_staff_role(text, boolean, integer, text) from public, anon, authenticated;
grant execute on function public.generate_platform_codes(integer, text, text) to authenticated;
grant execute on function public.admin_set_staff_role(text, boolean, integer, text) to authenticated;

commit;
