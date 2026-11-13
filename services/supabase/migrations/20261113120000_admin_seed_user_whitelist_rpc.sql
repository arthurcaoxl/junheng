begin;

alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check check (action in (
  'code_activation_approved',
  'code_activation_rejected',
  'coach_users_trusteed',
  'coach_promotion_requested',
  'coach_promotion_approved',
  'coach_promotion_rejected',
  'coach_promotion_promoted',
  'seed_user_whitelist_email_added',
  'seed_user_whitelist_email_removed'
));

create or replace function public.admin_get_seed_user_whitelist()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_config_value jsonb;
  v_updated_at timestamptz;
  v_item jsonb;
  v_email text;
  v_emails text[] := '{}'::text[];
  v_email_pattern constant text := '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$';
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select c.config_value, c.updated_at into v_config_value, v_updated_at
  from public.system_configs c
  where c.config_key = 'seed_user_whitelist';
  if not found then
    return jsonb_build_object(
      'ok', true, 'configExists', false, 'emails', '[]'::jsonb, 'updatedAt', null
    );
  end if;
  if jsonb_typeof(v_config_value) <> 'array' then
    raise exception 'SEED_USER_WHITELIST_CONFIG_INVALID' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(v_config_value) loop
    if jsonb_typeof(v_item) <> 'string' then
      raise exception 'SEED_USER_WHITELIST_CONFIG_INVALID' using errcode = '22023';
    end if;
    v_email := lower(btrim(v_item #>> '{}'));
    if char_length(v_email) < 3 or char_length(v_email) > 254
      or position('..' in v_email) > 0 or v_email !~ v_email_pattern then
      raise exception 'SEED_USER_WHITELIST_CONFIG_INVALID' using errcode = '22023';
    end if;
    v_emails := array_append(v_emails, v_email);
  end loop;
  select coalesce(array_agg(e order by e), '{}'::text[]) into v_emails from unnest(v_emails) e;

  return jsonb_build_object(
    'ok', true,
    'configExists', true,
    'emails', to_jsonb(v_emails),
    'updatedAt', v_updated_at
  );
end;
$function$;

create or replace function public.admin_add_seed_user_whitelist_email(
  p_email text,
  p_expected_config_exists boolean,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_config_value jsonb;
  v_updated_at timestamptz;
  v_config_exists boolean;
  v_item jsonb;
  v_existing_email text;
  v_emails text[] := '{}'::text[];
  v_before jsonb;
  v_after jsonb;
  v_audit_id uuid;
  v_audited_at timestamptz;
  v_email_pattern constant text := '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$';
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if char_length(v_email) < 3 or char_length(v_email) > 254
    or position('..' in v_email) > 0 or v_email !~ v_email_pattern then
    raise exception 'INVALID_EMAIL' using errcode = '22023';
  end if;
  if p_expected_config_exists is null
    or (not p_expected_config_exists and p_expected_updated_at is not null)
    or (p_expected_config_exists and p_expected_updated_at is null) then
    raise exception 'SEED_USER_WHITELIST_VERSION_CONFLICT' using errcode = '40001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('system_configs:seed_user_whitelist', 0));
  select c.config_value, c.updated_at into v_config_value, v_updated_at
  from public.system_configs c
  where c.config_key = 'seed_user_whitelist'
  for update;
  v_config_exists := found;
  if v_config_exists is distinct from p_expected_config_exists
    or (v_config_exists and v_updated_at is distinct from p_expected_updated_at) then
    raise exception 'SEED_USER_WHITELIST_VERSION_CONFLICT' using errcode = '40001';
  end if;

  if v_config_exists then
    if jsonb_typeof(v_config_value) <> 'array' then
      raise exception 'SEED_USER_WHITELIST_CONFIG_INVALID' using errcode = '22023';
    end if;
    for v_item in select value from jsonb_array_elements(v_config_value) loop
      if jsonb_typeof(v_item) <> 'string' then
        raise exception 'SEED_USER_WHITELIST_CONFIG_INVALID' using errcode = '22023';
      end if;
      v_existing_email := lower(btrim(v_item #>> '{}'));
      if char_length(v_existing_email) < 3 or char_length(v_existing_email) > 254
        or position('..' in v_existing_email) > 0 or v_existing_email !~ v_email_pattern then
        raise exception 'SEED_USER_WHITELIST_CONFIG_INVALID' using errcode = '22023';
      end if;
      v_emails := array_append(v_emails, v_existing_email);
    end loop;
  end if;
  select coalesce(array_agg(e order by e), '{}'::text[]) into v_emails from unnest(v_emails) e;

  if v_email = any(v_emails) then
    return jsonb_build_object(
      'ok', true, 'changed', false, 'reason', 'ALREADY_EXISTS',
      'configExists', v_config_exists, 'emails', to_jsonb(v_emails),
      'updatedAt', v_updated_at, 'auditId', null, 'auditedAt', null
    );
  end if;

  v_before := to_jsonb(v_emails);
  v_emails := array_append(v_emails, v_email);
  select coalesce(array_agg(e order by e), '{}'::text[]) into v_emails from unnest(v_emails) e;
  v_after := to_jsonb(v_emails);

  if v_config_exists then
    update public.system_configs c
    set config_value = v_after
    where c.config_key = 'seed_user_whitelist'
    returning c.updated_at into v_updated_at;
  else
    insert into public.system_configs (config_key, config_value)
    values ('seed_user_whitelist', v_after)
    on conflict (config_key) do nothing
    returning updated_at into v_updated_at;
    if not found then
      raise exception 'SEED_USER_WHITELIST_VERSION_CONFLICT' using errcode = '40001';
    end if;
  end if;

  insert into public.audit_logs (
    action, target_id, actor_id, reviewer_id, from_coach_id, to_coach_id, metadata
  ) values (
    'seed_user_whitelist_email_added', gen_random_uuid(), v_auth_user_id, v_auth_user_id, null, null,
    jsonb_build_object(
      'target', 'system_configs:seed_user_whitelist',
      'key', 'seed_user_whitelist',
      'operation', 'add',
      'email', v_email,
      'before', v_before,
      'after', v_after,
      'configExistedBefore', v_config_exists
    )
  ) returning audit_id, created_at into v_audit_id, v_audited_at;

  return jsonb_build_object(
    'ok', true, 'changed', true, 'reason', null,
    'configExists', true, 'emails', v_after,
    'updatedAt', v_updated_at, 'auditId', v_audit_id, 'auditedAt', v_audited_at
  );
end;
$function$;

create or replace function public.admin_remove_seed_user_whitelist_email(
  p_email text,
  p_expected_config_exists boolean,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_config_value jsonb;
  v_updated_at timestamptz;
  v_config_exists boolean;
  v_item jsonb;
  v_existing_email text;
  v_emails text[] := '{}'::text[];
  v_before jsonb;
  v_after jsonb;
  v_audit_id uuid;
  v_audited_at timestamptz;
  v_email_pattern constant text := '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$';
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if char_length(v_email) < 3 or char_length(v_email) > 254
    or position('..' in v_email) > 0 or v_email !~ v_email_pattern then
    raise exception 'INVALID_EMAIL' using errcode = '22023';
  end if;
  if p_expected_config_exists is null
    or (not p_expected_config_exists and p_expected_updated_at is not null)
    or (p_expected_config_exists and p_expected_updated_at is null) then
    raise exception 'SEED_USER_WHITELIST_VERSION_CONFLICT' using errcode = '40001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('system_configs:seed_user_whitelist', 0));
  select c.config_value, c.updated_at into v_config_value, v_updated_at
  from public.system_configs c
  where c.config_key = 'seed_user_whitelist'
  for update;
  v_config_exists := found;
  if v_config_exists is distinct from p_expected_config_exists
    or (v_config_exists and v_updated_at is distinct from p_expected_updated_at) then
    raise exception 'SEED_USER_WHITELIST_VERSION_CONFLICT' using errcode = '40001';
  end if;

  if not v_config_exists then
    return jsonb_build_object(
      'ok', true, 'changed', false, 'reason', 'CONFIG_MISSING',
      'configExists', false, 'emails', '[]'::jsonb,
      'updatedAt', null, 'auditId', null, 'auditedAt', null
    );
  end if;
  if jsonb_typeof(v_config_value) <> 'array' then
    raise exception 'SEED_USER_WHITELIST_CONFIG_INVALID' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(v_config_value) loop
    if jsonb_typeof(v_item) <> 'string' then
      raise exception 'SEED_USER_WHITELIST_CONFIG_INVALID' using errcode = '22023';
    end if;
    v_existing_email := lower(btrim(v_item #>> '{}'));
    if char_length(v_existing_email) < 3 or char_length(v_existing_email) > 254
      or position('..' in v_existing_email) > 0 or v_existing_email !~ v_email_pattern then
      raise exception 'SEED_USER_WHITELIST_CONFIG_INVALID' using errcode = '22023';
    end if;
    v_emails := array_append(v_emails, v_existing_email);
  end loop;
  select coalesce(array_agg(e order by e), '{}'::text[]) into v_emails from unnest(v_emails) e;

  if not v_email = any(v_emails) then
    return jsonb_build_object(
      'ok', true, 'changed', false, 'reason', 'NOT_FOUND',
      'configExists', true, 'emails', to_jsonb(v_emails),
      'updatedAt', v_updated_at, 'auditId', null, 'auditedAt', null
    );
  end if;

  v_before := to_jsonb(v_emails);
  v_emails := array_remove(v_emails, v_email);
  select coalesce(array_agg(e order by e), '{}'::text[]) into v_emails from unnest(v_emails) e;
  v_after := to_jsonb(v_emails);

  update public.system_configs c
  set config_value = v_after
  where c.config_key = 'seed_user_whitelist'
  returning c.updated_at into v_updated_at;

  insert into public.audit_logs (
    action, target_id, actor_id, reviewer_id, from_coach_id, to_coach_id, metadata
  ) values (
    'seed_user_whitelist_email_removed', gen_random_uuid(), v_auth_user_id, v_auth_user_id, null, null,
    jsonb_build_object(
      'target', 'system_configs:seed_user_whitelist',
      'key', 'seed_user_whitelist',
      'operation', 'remove',
      'email', v_email,
      'before', v_before,
      'after', v_after,
      'configExistedBefore', v_config_exists
    )
  ) returning audit_id, created_at into v_audit_id, v_audited_at;

  return jsonb_build_object(
    'ok', true, 'changed', true, 'reason', null,
    'configExists', true, 'emails', v_after,
    'updatedAt', v_updated_at, 'auditId', v_audit_id, 'auditedAt', v_audited_at
  );
end;
$function$;

revoke all on function public.admin_get_seed_user_whitelist() from public, anon, authenticated;
revoke all on function public.admin_add_seed_user_whitelist_email(text, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_remove_seed_user_whitelist_email(text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_get_seed_user_whitelist() to authenticated;
grant execute on function public.admin_add_seed_user_whitelist_email(text, boolean, timestamptz) to authenticated;
grant execute on function public.admin_remove_seed_user_whitelist_email(text, boolean, timestamptz) to authenticated;

revoke all on public.system_configs from public, anon, authenticated;
revoke all on public.system_config_audit from public, anon, authenticated;
revoke all on public.audit_logs from public, anon, authenticated;
grant select on public.camp_admins to authenticated;

commit;
