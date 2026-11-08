\set QUIET on
set client_min_messages = warning;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text
);
create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.test_auth_uid', true), '')::uuid;
$$;
create function auth.jwt()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object('email', nullif(current_setting('app.test_jwt_email', true), ''));
$$;
create role anon;
create role authenticated;

\ir ../migrations/20261030100000_admin_checkin_overview.sql
\ir ../migrations/20261101090000_checkin_bmi_profile.sql
\ir ../migrations/20261106130000_box_code_activation.sql
\ir ../migrations/20261106150000_activate_box_code.sql
\ir ../migrations/20261106160000_get_coach_radar_v1.sql
\ir ../migrations/20261107120000_verify_checkin.sql
\ir ../migrations/20261108120000_code_pool_inventory.sql

set client_min_messages = notice;
create schema test;

create function test.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION_FAILED: %', p_message;
  end if;
end;
$$;

create function test.assert_raises(p_expected text, p_sql text)
returns void
language plpgsql
as $$
declare
  v_message text;
begin
  execute p_sql;
  raise exception 'ASSERTION_FAILED: expected %, but statement succeeded', p_expected;
exception
  when others then
    get stacked diagnostics v_message = message_text;
    if v_message = p_expected then
      return;
    end if;
    raise exception 'ASSERTION_FAILED: expected %, got %', p_expected, v_message;
end;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'coach@example.test');
insert into public.camp_admins (email, is_active, auth_user_id, role) values
  ('admin@example.test', true, '00000000-0000-0000-0000-000000000001', 'admin');

select set_config('app.box_code_pepper', 'test-only-pepper', false);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000001', false);

-- 发码：服务端配置快照到每一枚码，调用方不能传入 expires_at。
insert into public.system_configs (config_key, config_value) values
  ('box_code_expiry_policy', '{"default_expires_at":"2030-01-02T03:04:05+00:00"}'::jsonb);
select public.generate_platform_codes(24, '21_bags', 'TEST/INIT');
select test.assert_true(
  (select count(*) from public.box_codes) = 24,
  'generate_platform_codes should create 24 codes'
);
select test.assert_true(
  (select count(*) from public.box_codes
   where expires_at = '2030-01-02T03:04:05+00:00'::timestamptz) = 24,
  'every generated code should persist the configured expires_at snapshot'
);

-- 发码配置缺失：不得生成任何码。
delete from public.system_configs where config_key = 'box_code_expiry_policy';
select test.assert_raises(
  'SYSTEM_CONFIG_MISSING',
  'select public.generate_platform_codes(24, ''21_bags'', ''TEST/INIT'')'
);
select test.assert_true(
  (select count(*) from public.box_codes) = 24,
  'missing expiry policy should roll back the whole generation batch'
);

select 'PASS: expiry generation behavior (4 assertions)' as result;

create function test.create_active_code(
  p_auth_user_id uuid,
  p_expires_at timestamptz,
  p_sequence integer
)
returns uuid
language plpgsql
as $$
declare
  v_code_id uuid := gen_random_uuid();
  v_activation_id uuid := gen_random_uuid();
begin
  insert into public.box_codes (
    code_id,
    code_hash,
    code_type,
    state,
    coach_id,
    case_id,
    max_checkins,
    used_checkins,
    box_spec,
    expires_at
  ) values (
    v_code_id,
    'test-' || v_code_id::text,
    'experience',
    'pending_review',
    '00000000-0000-0000-0000-000000000002',
    gen_random_uuid(),
    21,
    0,
    '21_bags',
    p_expires_at
  );

  insert into public.code_activations (
    activation_id,
    code_id,
    auth_user_id,
    camper_code,
    expected_code_type,
    shipment_verification_ref,
    review_state,
    target_referrer_id,
    decided_by,
    decided_at,
    activated_at
  ) values (
    v_activation_id,
    v_code_id,
    p_auth_user_id,
    'JH-T' || p_sequence::text,
    'experience',
    'TEST/INIT',
    'approved',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    now(),
    now()
  );

  update public.box_codes
  set
    state = 'active',
    activation_id = v_activation_id,
    version = version + 1
  where code_id = v_code_id;

  return v_code_id;
end;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000010', 'fresh@example.test'),
  ('00000000-0000-0000-0000-000000000011', 'expired@example.test'),
  ('00000000-0000-0000-0000-000000000012', 'missing-config@example.test');
insert into public.checkin_sync (auth_user_id, user_code, start_date, records) values
  ('00000000-0000-0000-0000-000000000010', 'JH-T10', current_date, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000011', 'JH-T11', current_date, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000012', 'JH-T12', current_date, '{}'::jsonb);

insert into public.system_configs (config_key, config_value) values
  ('box_code_expiry_policy', '{"default_expires_at":"2030-01-02T03:04:05+00:00"}'::jsonb);

create function test.case_expired_rejected()
returns void
language plpgsql
as $$
declare
  v_code_id uuid;
begin
  v_code_id := test.create_active_code(
    '00000000-0000-0000-0000-000000000011',
    now() - interval '1 second',
    11
  );
  perform set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000011', false);
  perform test.assert_raises(
    'CHECKIN_CODE_EXPIRED',
    'select public.verify_checkin(current_date, ''{}''::jsonb, null, null)'
  );
  perform test.assert_true(
    (select used_checkins from public.box_codes where code_id = v_code_id) = 0,
    'expired code must not consume quota'
  );
  perform test.assert_true(
    not exists (select 1 from public.checkin_daily_claims where code_id = v_code_id),
    'expired code must not create a daily claim'
  );
end;
$$;

create function test.case_unexpired_allowed()
returns void
language plpgsql
as $$
declare
  v_code_id uuid;
  v_result jsonb;
begin
  v_code_id := test.create_active_code(
    '00000000-0000-0000-0000-000000000010',
    now() + interval '1 day',
    10
  );
  perform set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000010', false);
  v_result := public.verify_checkin(current_date, '{}'::jsonb, null, null);
  perform test.assert_true(
    (v_result ->> 'ok')::boolean,
    'unexpired active code should pass verify_checkin'
  );
  perform test.assert_true(
    (select used_checkins from public.box_codes where code_id = v_code_id) = 1,
    'unexpired active code should consume exactly one quota'
  );
end;
$$;

create function test.case_missing_config_rejected()
returns void
language plpgsql
as $$
declare
  v_code_id uuid;
begin
  v_code_id := test.create_active_code(
    '00000000-0000-0000-0000-000000000012',
    now() + interval '1 day',
    12
  );
  perform set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000012', false);
  delete from public.system_configs where config_key = 'box_code_expiry_policy';
  perform test.assert_raises(
    'SYSTEM_CONFIG_MISSING',
    'select public.verify_checkin(current_date, ''{}''::jsonb, null, null)'
  );
  perform test.assert_true(
    (select used_checkins from public.box_codes where code_id = v_code_id) = 0,
    'missing expiry config must not consume quota'
  );
  insert into public.system_configs (config_key, config_value) values
    ('box_code_expiry_policy', '{"default_expires_at":"2030-01-02T03:04:05+00:00"}'::jsonb);
end;
$$;

create table test.results (
  case_name text primary key,
  passed boolean not null,
  detail text
);

create function test.capture_case(p_case_name text, p_sql text)
returns void
language plpgsql
as $$
declare
  v_message text;
begin
  execute p_sql;
  insert into test.results (case_name, passed) values (p_case_name, true);
exception
  when others then
    get stacked diagnostics v_message = message_text;
    insert into test.results (case_name, passed, detail)
    values (p_case_name, false, v_message);
end;
$$;

select test.capture_case('expired_rejected', 'select test.case_expired_rejected()');
select test.capture_case('unexpired_allowed', 'select test.case_unexpired_allowed()');
select test.capture_case('missing_config_rejected', 'select test.case_missing_config_rejected()');

select case_name, passed, detail from test.results order by case_name;
select test.assert_true(
  not exists (select 1 from test.results where not passed),
  'one or more verify_checkin expiry behavior cases failed'
);
select 'PASS: verify_checkin expiry behavior (3 cases, 7 assertions)' as result;
