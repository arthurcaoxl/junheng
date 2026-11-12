\ir ux_flow_test_bootstrap.sql
\ir ../migrations/20261112120000_seed_activation_compat.sql

-- 所有业务夹具均在外层事务内创建；末尾 ROLLBACK 后再物理检查无残留。
begin;

create function pg_temp.assert_activation_raises(
  p_expected_message text,
  p_expected_sqlstate text,
  p_sql text
)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'ASSERTION_FAILED: expected %, but statement succeeded', p_expected_message;
exception when others then
  if sqlerrm = p_expected_message and sqlstate = p_expected_sqlstate then
    return;
  end if;
  raise exception 'ASSERTION_FAILED: expected % / %, got % / %',
    p_expected_message, p_expected_sqlstate, sqlerrm, sqlstate;
end;
$$;

-- 配置写入辅助函数只用于构造 fail-closed 场景；SECURITY DEFINER 不代表浏览器授权。
create function pg_temp.write_seed_config(p_key text, p_value jsonb)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.system_configs (config_key, config_value)
  values (p_key, p_value)
  on conflict (config_key) do update set config_value = excluded.config_value;
$$;

create function pg_temp.delete_seed_config(p_key text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.system_configs where config_key = p_key;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'coach@seed-compat.test'),
  ('00000000-0000-0000-0000-000000000002', 'admin@seed-compat.test'),
  ('00000000-0000-0000-0000-000000000101', 'WhiteList@Seed-Compat.Test'),
  ('00000000-0000-0000-0000-000000000102', 'runtime@seed-compat.test'),
  ('00000000-0000-0000-0000-000000000103', 'none@seed-compat.test'),
  ('00000000-0000-0000-0000-000000000104', 'pending@seed-compat.test'),
  ('00000000-0000-0000-0000-000000000105', 'active@seed-compat.test'),
  ('00000000-0000-0000-0000-000000000106', 'rejected@seed-compat.test');

insert into public.camp_admins (email, auth_user_id, role, is_active) values
  ('coach@seed-compat.test', '00000000-0000-0000-0000-000000000001', 'coach', true),
  ('admin@seed-compat.test', '00000000-0000-0000-0000-000000000002', 'admin', true);

insert into vault.decrypted_secrets values ('box_code_pepper', 'seed-compat-test-pepper');

insert into public.checkin_sync (auth_user_id, user_code, start_date, records) values
  ('00000000-0000-0000-0000-000000000102', 'SEED-RUNTIME', '2026-11-06', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000106', 'SEED-REJECTED', '2026-11-01', '{}'::jsonb);

insert into public.box_codes (
  code_id, code_hash, code_type, code_format, state, coach_id, case_id,
  max_checkins, used_checkins, box_spec, inventory_status, code_ciphertext
) values
  ('00000000-0000-0000-0000-000000001001', 'seed-compat-whitelist', 'experience', 'short', 'pending_review', '00000000-0000-0000-0000-000000000001', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-W101', 'seed-compat-test-pepper')),
  ('00000000-0000-0000-0000-000000001002', 'seed-compat-pending', 'experience', 'short', 'pending_review', '00000000-0000-0000-0000-000000000001', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-P102', 'seed-compat-test-pepper')),
  ('00000000-0000-0000-0000-000000001003', 'seed-compat-active', 'experience', 'short', 'pending_review', '00000000-0000-0000-0000-000000000001', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-A103', 'seed-compat-test-pepper')),
  ('00000000-0000-0000-0000-000000001004', 'seed-compat-rejected', 'experience', 'short', 'pending_review', '00000000-0000-0000-0000-000000000001', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-R104', 'seed-compat-test-pepper')),
  ('00000000-0000-0000-0000-000000001005', 'seed-compat-replacement', 'experience', 'short', 'unused', '00000000-0000-0000-0000-000000000001', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-R105', 'seed-compat-test-pepper'));

insert into public.code_activations (
  activation_id, code_id, auth_user_id, camper_code, expected_code_type,
  review_state, created_at, expected_code_format, request_source
) values
  ('00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000101', 'SEED-WHITELIST', 'experience', 'pending', '2026-11-01 01:00:00+00', 'short', 'manual_code'),
  ('00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000104', 'SEED-PENDING', 'experience', 'pending', '2026-11-01 02:00:00+00', 'short', 'manual_code'),
  ('00000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000000105', 'SEED-ACTIVE', 'experience', 'pending', '2026-11-01 03:00:00+00', 'short', 'coach_push'),
  ('00000000-0000-0000-0000-000000002004', '00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000000106', 'SEED-REJECTED', 'experience', 'pending', '2026-11-01 04:00:00+00', 'short', 'manual_code');

update public.code_activations set
  review_state = 'approved', target_referrer_id = '00000000-0000-0000-0000-000000000001',
  decided_by = '00000000-0000-0000-0000-000000000002', decided_at = '2026-11-02 03:00:00+00',
  shipment_verification_ref = 'SEED/ACTIVE', activated_at = '2026-11-02 03:00:00+00',
  version = version + 1, updated_at = '2026-11-02 03:00:00+00'
where activation_id = '00000000-0000-0000-0000-000000002003';
update public.box_codes set
  state = 'active', activation_id = '00000000-0000-0000-0000-000000002003', version = 2
where code_id = '00000000-0000-0000-0000-000000001003';

update public.code_activations set
  review_state = 'rejected', decided_by = '00000000-0000-0000-0000-000000000002',
  decided_at = '2026-11-02 04:00:00+00', rejection_reason_code = 'INTERNAL_SEED_REASON',
  replacement_code_id = '00000000-0000-0000-0000-000000001005',
  version = version + 1, updated_at = '2026-11-02 04:00:00+00'
where activation_id = '00000000-0000-0000-0000-000000002004';
update public.box_codes set state = 'revoked', version = 2
where code_id = '00000000-0000-0000-0000-000000001004';

create temporary table seed_business_counts as
select
  (select count(*) from public.box_codes) as box_codes,
  (select count(*) from public.code_activations) as code_activations,
  (select count(*) from public.box_code_events) as box_code_events,
  (select count(*) from public.box_code_commands) as box_code_commands,
  (select count(*) from public.inventory_logs) as inventory_logs,
  (select count(*) from public.coach_restock_requests) as coach_restock_requests,
  (select count(*) from public.user_coach_relation) as user_coach_relation,
  (select count(*) from public.checkin_daily_claims) as checkin_daily_claims,
  (select count(*) from public.audit_logs) as audit_logs;

select test.assert_true(
  (select config_value = '"2026-11-06"'::jsonb from public.system_configs where config_key = 'seed_cutoff_date'),
  'seed cutoff must be the configured contract value'
);
select test.assert_true(
  (select config_value = '1'::jsonb from public.system_configs where config_key = 'seed_min_records'),
  'seed minimum must be the configured contract value'
);
select test.assert_true(
  (select config_value = '["cnwine@163.com"]'::jsonb from public.system_configs where config_key = 'seed_user_whitelist'),
  'seed whitelist must be the configured contract value'
);

set role authenticated;

-- 匿名错误必须同时校验消息与 SQLSTATE；辅助函数的异常块是真实子事务。
select set_config('app.test_auth_uid', '', false);
select pg_temp.assert_activation_raises(
  'UNAUTHORIZED', '42501', 'select public.get_my_activation_status()'
);

-- 白名单优先于既有申请与损坏的运行时配置，邮箱匹配不区分大小写。
savepoint whitelist_priority;
select pg_temp.delete_seed_config('seed_cutoff_date');
select pg_temp.delete_seed_config('seed_min_records');
select pg_temp.write_seed_config('seed_user_whitelist', '["whitelist@seed-compat.test"]'::jsonb);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000101', false);
select test.assert_true(
  public.get_my_activation_status() = '{"state":"legacy_granted","source":"whitelist","requested_at":null,"rejection_hint":null}'::jsonb,
  'whitelist must win over an existing application and broken runtime config'
);
rollback to savepoint whitelist_priority;

-- 白名单缺失等同空数组；start_date 等于 cutoff 不满足严格小于门槛。
select pg_temp.delete_seed_config('seed_user_whitelist');
select pg_temp.write_seed_config('seed_min_records', '2'::jsonb);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000102', false);
select test.assert_true(
  public.get_my_activation_status() ->> 'state' = 'none',
  'start_date equal to cutoff must not grant runtime access'
);

-- 有效日期键数量低于门槛时不放行；非法日历日期不得计数。
update public.checkin_sync set
  start_date = '2026-11-05',
  records = '{"2026-10-01":{},"2026-02-30":{},"not-a-date":{}}'::jsonb
where auth_user_id = '00000000-0000-0000-0000-000000000102';
select test.assert_true(
  public.get_my_activation_status() ->> 'state' = 'none',
  'invalid calendar keys must not count toward seed_min_records'
);

-- 达到边界的两个真实日期键即放行；多出的非法键不影响结果。
update public.checkin_sync set
  records = '{"2026-10-01":{},"2026-10-02":{},"2026-02-30":{}}'::jsonb
where auth_user_id = '00000000-0000-0000-0000-000000000102';
select test.assert_true(
  public.get_my_activation_status() = '{"state":"legacy_granted","source":"runtime","requested_at":null,"rejection_hint":null}'::jsonb,
  'valid record count equal to threshold and start_date before cutoff must grant runtime access'
);

-- none 仍走旧状态机，source 只能是 null。
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000103', false);
select test.assert_true(
  public.get_my_activation_status() = '{"state":"none","source":null,"requested_at":null,"rejection_hint":null}'::jsonb,
  'user without applications or qualifying runtime history must receive none'
);

-- 任一既有申请都隔离运行时配置故障，旧四态语义保持不变。
select pg_temp.delete_seed_config('seed_cutoff_date');
select pg_temp.delete_seed_config('seed_min_records');

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000104', false);
create temporary table seed_pending_status as select public.get_my_activation_status() as result;
select test.assert_true(
  (select result ->> 'state' = 'pending_review'
    and result -> 'source' = 'null'::jsonb
    and result -> 'requested_at' = to_jsonb('2026-11-01 02:00:00+00'::timestamptz)
    and result -> 'rejection_hint' = 'null'::jsonb
  from seed_pending_status),
  'pending application must bypass broken runtime config and preserve timestamp'
);

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000105', false);
create temporary table seed_active_status as select public.get_my_activation_status() as result;
select test.assert_true(
  (select result ->> 'state' = 'active'
    and result -> 'source' = 'null'::jsonb
    and result -> 'requested_at' = to_jsonb('2026-11-01 03:00:00+00'::timestamptz)
    and result -> 'rejection_hint' = 'null'::jsonb
  from seed_active_status),
  'approved application must remain active without runtime config'
);

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000106', false);
create temporary table seed_rejected_status as select public.get_my_activation_status() as result;
select test.assert_true(
  (select result ->> 'state' = 'rejected'
    and result -> 'source' = 'null'::jsonb
    and result -> 'requested_at' = to_jsonb('2026-11-01 04:00:00+00'::timestamptz)
    and result ->> 'rejection_hint' = 'contact_coach'
    and not (result ? 'INTERNAL_SEED_REASON')
  from seed_rejected_status),
  'rejected application must retain generic hint and source null'
);

-- 每个非法配置场景都用 SAVEPOINT 回滚夹具，预期异常在子事务内捕获。
savepoint bad_whitelist_shape;
select pg_temp.write_seed_config('seed_user_whitelist', '"not-an-array"'::jsonb);
select pg_temp.assert_activation_raises(
  'SYSTEM_CONFIG_MISSING', 'P0001', 'select public.get_my_activation_status()'
);
rollback to savepoint bad_whitelist_shape;

savepoint bad_whitelist_item;
select pg_temp.write_seed_config('seed_user_whitelist', '["valid@example.test", 1]'::jsonb);
select pg_temp.assert_activation_raises(
  'SYSTEM_CONFIG_MISSING', 'P0001', 'select public.get_my_activation_status()'
);
rollback to savepoint bad_whitelist_item;

-- 无申请用户才读取运行时配置；逐项覆盖缺失、非法日期和非法正整数。
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000103', false);

savepoint missing_cutoff;
select pg_temp.assert_activation_raises(
  'SYSTEM_CONFIG_MISSING', 'P0001', 'select public.get_my_activation_status()'
);
rollback to savepoint missing_cutoff;

savepoint invalid_cutoff;
select pg_temp.write_seed_config('seed_cutoff_date', '"2026-02-30"'::jsonb);
select pg_temp.assert_activation_raises(
  'SYSTEM_CONFIG_MISSING', 'P0001', 'select public.get_my_activation_status()'
);
rollback to savepoint invalid_cutoff;

savepoint missing_min_records;
select pg_temp.assert_activation_raises(
  'SYSTEM_CONFIG_MISSING', 'P0001', 'select public.get_my_activation_status()'
);
rollback to savepoint missing_min_records;

savepoint fractional_min_records;
select pg_temp.write_seed_config('seed_min_records', '1.5'::jsonb);
select pg_temp.assert_activation_raises(
  'SYSTEM_CONFIG_MISSING', 'P0001', 'select public.get_my_activation_status()'
);
rollback to savepoint fractional_min_records;

savepoint zero_min_records;
select pg_temp.write_seed_config('seed_min_records', '0'::jsonb);
select pg_temp.assert_activation_raises(
  'SYSTEM_CONFIG_MISSING', 'P0001', 'select public.get_my_activation_status()'
);
rollback to savepoint zero_min_records;

savepoint string_min_records;
select pg_temp.write_seed_config('seed_min_records', '"1"'::jsonb);
select pg_temp.assert_activation_raises(
  'SYSTEM_CONFIG_MISSING', 'P0001', 'select public.get_my_activation_status()'
);
rollback to savepoint string_min_records;

-- 所有调用结束后，盒码、申请、库存、流水、归属和审核事实必须一行未变。
-- 计数由测试超级用户执行，不向 authenticated 增加任何业务表权限。
reset role;
select test.assert_true(
  (select count(*) = 1
  from seed_business_counts b
  where b.box_codes = (select count(*) from public.box_codes)
    and b.code_activations = (select count(*) from public.code_activations)
    and b.box_code_events = (select count(*) from public.box_code_events)
    and b.box_code_commands = (select count(*) from public.box_code_commands)
    and b.inventory_logs = (select count(*) from public.inventory_logs)
    and b.coach_restock_requests = (select count(*) from public.coach_restock_requests)
    and b.user_coach_relation = (select count(*) from public.user_coach_relation)
    and b.checkin_daily_claims = (select count(*) from public.checkin_daily_claims)
    and b.audit_logs = (select count(*) from public.audit_logs)),
  'status reads must not create or modify synthetic business facts'
);

reset role;
select test.assert_true(
  not has_function_privilege('anon', 'public.get_my_activation_status()', 'execute')
    and not has_function_privilege('public', 'public.get_my_activation_status()', 'execute')
    and has_function_privilege('authenticated', 'public.get_my_activation_status()', 'execute'),
  'activation status execute grants must remain authenticated-only'
);
select test.assert_true(
  not has_table_privilege('authenticated', 'public.system_configs', 'select')
    and not has_table_privilege('authenticated', 'public.code_activations', 'select'),
  'seed compatibility must not expose backing tables'
);

rollback;

-- 外层 ROLLBACK 后再次查询永久表，证明夹具和配置修改均无残留。
select test.assert_true(
  (select count(*) = 0 from auth.users where email ilike '%@seed-compat.test'),
  'ROLLBACK must remove all seed compatibility auth fixtures'
);
select test.assert_true(
  (select count(*) = 0 from public.checkin_sync where user_code like 'SEED-%')
    and (select count(*) = 0 from public.code_activations where camper_code like 'SEED-%')
    and (select count(*) = 0 from public.box_codes where code_hash like 'seed-compat-%'),
  'ROLLBACK must remove all seed compatibility business fixtures'
);
select test.assert_true(
  (select config_value = '"2026-11-06"'::jsonb from public.system_configs where config_key = 'seed_cutoff_date')
    and (select config_value = '1'::jsonb from public.system_configs where config_key = 'seed_min_records')
    and (select config_value = '["cnwine@163.com"]'::jsonb from public.system_configs where config_key = 'seed_user_whitelist'),
  'ROLLBACK must restore the original seeded configuration'
);

select 'PASS: seed whitelist/runtime thresholds, legacy states, fail-closed config, no side effects, ROLLBACK cleanup' as result;
