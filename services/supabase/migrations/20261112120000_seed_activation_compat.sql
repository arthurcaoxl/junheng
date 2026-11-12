begin;

-- TASK-10.16：种子兼容配置只播种一次，后续调整由受控配置审计承接。
insert into public.system_configs (config_key, config_value) values
  ('seed_cutoff_date', '"2026-11-06"'::jsonb),
  ('seed_min_records', '1'::jsonb),
  ('seed_user_whitelist', '["cnwine@163.com"]'::jsonb)
on conflict (config_key) do nothing;

create or replace function public.get_my_activation_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_activation public.code_activations%rowtype;
  v_sync public.checkin_sync%rowtype;
  v_whitelist jsonb;
  v_min_records_config jsonb;
  v_email text;
  v_cutoff_text text;
  v_cutoff_date date;
  v_min_records_numeric numeric;
  v_min_records integer;
  v_valid_record_count integer;
  v_record_key text;
  v_record_date date;
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  -- 白名单是增强通道：缺失视为空数组，存在但结构非法时 fail-closed。
  select c.config_value into v_whitelist
  from public.system_configs c
  where c.config_key = 'seed_user_whitelist';
  if not found then
    v_whitelist := '[]'::jsonb;
  end if;
  if jsonb_typeof(v_whitelist) is distinct from 'array' then
    raise exception 'SYSTEM_CONFIG_MISSING';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_whitelist) as whitelist_item(value)
    where jsonb_typeof(whitelist_item.value) <> 'string'
  ) then
    raise exception 'SYSTEM_CONFIG_MISSING';
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = v_auth_user_id;
  if v_email is not null and exists (
    select 1
    from jsonb_array_elements_text(v_whitelist) as whitelist_email(email)
    where whitelist_email.email = v_email
  ) then
    return jsonb_build_object(
      'state', 'legacy_granted',
      'source', 'whitelist',
      'requested_at', null,
      'rejection_hint', null
    );
  end if;

  -- 只有完全没有激活申请的用户才依赖运行时配置与历史快照。
  if not exists (
    select 1
    from public.code_activations a
    where a.auth_user_id = v_auth_user_id
  ) then
    select c.config_value #>> '{}' into v_cutoff_text
    from public.system_configs c
    where c.config_key = 'seed_cutoff_date'
      and jsonb_typeof(c.config_value) = 'string';
    if not found or v_cutoff_text is null
      or v_cutoff_text !~ '^\d{4}-\d{2}-\d{2}$'
    then
      raise exception 'SYSTEM_CONFIG_MISSING';
    end if;
    begin
      v_cutoff_date := v_cutoff_text::date;
    exception when others then
      raise exception 'SYSTEM_CONFIG_MISSING';
    end;

    select c.config_value into v_min_records_config
    from public.system_configs c
    where c.config_key = 'seed_min_records';
    if not found or jsonb_typeof(v_min_records_config) is distinct from 'number' then
      raise exception 'SYSTEM_CONFIG_MISSING';
    end if;
    begin
      v_min_records_numeric := (v_min_records_config #>> '{}')::numeric;
    exception when others then
      raise exception 'SYSTEM_CONFIG_MISSING';
    end;
    if v_min_records_numeric is null or v_min_records_numeric <= 0
      or v_min_records_numeric <> trunc(v_min_records_numeric)
      or v_min_records_numeric > 2147483647
    then
      raise exception 'SYSTEM_CONFIG_MISSING';
    end if;
    v_min_records := v_min_records_numeric::integer;

    select s.* into v_sync
    from public.checkin_sync s
    where s.auth_user_id = v_auth_user_id;

    if found and v_sync.start_date < v_cutoff_date
      and jsonb_typeof(v_sync.records) = 'object'
    then
      v_valid_record_count := 0;
      for v_record_key in
        select record_key.key
        from jsonb_object_keys(v_sync.records) as record_key(key)
      loop
        if v_record_key ~ '^\d{4}-\d{2}-\d{2}$' then
          begin
            v_record_date := v_record_key::date;
          exception when others then
            v_record_date := null;
          end;
          if v_record_date is not null then
            v_valid_record_count := v_valid_record_count + 1;
            if v_valid_record_count >= v_min_records then
              return jsonb_build_object(
                'state', 'legacy_granted',
                'source', 'runtime',
                'requested_at', null,
                'rejection_hint', null
              );
            end if;
          end if;
        end if;
      end loop;
    end if;
  end if;

  -- 既有最新申请状态机保持不变。
  select a.* into v_activation
  from public.code_activations a
  where a.auth_user_id = v_auth_user_id
  order by a.created_at desc, a.activation_id desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'state', 'none',
      'source', null,
      'requested_at', null,
      'rejection_hint', null
    );
  end if;

  return jsonb_build_object(
    'state', case v_activation.review_state
      when 'pending' then 'pending_review'
      when 'approved' then 'active'
      when 'rejected' then 'rejected'
    end,
    'source', null,
    'requested_at', v_activation.created_at,
    'rejection_hint', case
      when v_activation.review_state = 'rejected' then 'contact_coach'
      else null
    end
  );
end;
$function$;

revoke all on function public.get_my_activation_status() from public, anon, authenticated;
grant execute on function public.get_my_activation_status() to authenticated;

comment on function public.get_my_activation_status() is
  'Current user activation review with whitelist-first legacy seed compatibility; no synthetic activation facts.';

commit;
