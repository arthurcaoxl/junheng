-- Restore the contract seed while preserving and normalizing existing members.
-- The caller owns the transaction; this single DO statement is atomic.
do $migration$
declare
  v_config_value jsonb;
  v_config_exists boolean;
  v_item jsonb;
  v_email text;
  v_emails text[] := '{}'::text[];
  v_after jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('system_configs:seed_user_whitelist', 0));

  select c.config_value into v_config_value
  from public.system_configs c
  where c.config_key = 'seed_user_whitelist'
  for update;
  v_config_exists := found;

  if not v_config_exists then
    insert into public.system_configs (config_key, config_value)
    values ('seed_user_whitelist', '["cnwine@163.com"]'::jsonb);
    return;
  end if;

  if jsonb_typeof(v_config_value) is distinct from 'array' then
    raise exception 'SEED_USER_WHITELIST_CONFIG_INVALID' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(v_config_value) loop
    if jsonb_typeof(v_item) is distinct from 'string' then
      raise exception 'SEED_USER_WHITELIST_CONFIG_INVALID' using errcode = '22023';
    end if;
    v_email := lower(btrim(v_item #>> '{}'));
    if not v_email = any(v_emails) then
      v_emails := array_append(v_emails, v_email);
    end if;
  end loop;

  if not 'cnwine@163.com' = any(v_emails) then
    v_emails := array_append(v_emails, 'cnwine@163.com');
  end if;
  v_after := to_jsonb(v_emails);

  if v_config_value = v_after then
    return;
  end if;

  update public.system_configs c
  set config_value = v_after
  where c.config_key = 'seed_user_whitelist';
end;
$migration$;
