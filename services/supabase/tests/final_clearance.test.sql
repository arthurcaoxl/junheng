\set QUIET on
\pset footer off
set client_min_messages = warning;
set search_path = public, extensions, pg_temp;

create schema extensions;
create extension pgcrypto with schema extensions;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  phone text
);
create function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('app.test_auth_uid', true), '')::uuid;
$$;
create function auth.jwt()
returns jsonb language sql stable as $$
  select jsonb_build_object('email', nullif(current_setting('app.test_jwt_email', true), ''));
$$;
create role anon;
create role authenticated;
create schema vault;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);

\ir ../migrations/20261030100000_admin_checkin_overview.sql
\ir ../migrations/20261101090000_checkin_bmi_profile.sql
\ir ../migrations/20261106130000_box_code_activation.sql
\ir ../migrations/20261106150000_activate_box_code.sql
\ir ../migrations/20261106160000_get_coach_radar_v1.sql
\ir ../migrations/20261107120000_verify_checkin.sql
\ir ../migrations/20261108120000_code_pool_inventory.sql
\ir ../migrations/20261108130000_manual_review_trusteeship.sql
\ir ../migrations/20261108140000_activation_request_rate_limit.sql
\ir ../migrations/20261108224000_user_coach_contact.sql
\ir ../migrations/20261108230000_admin_coach_directory.sql
\ir ../migrations/20261109094500_p0_rbac_vault.sql
\ir ../migrations/20261109120000_admin_staff_rbac.sql
\ir ../migrations/20261109120000_coach_workflows.sql
\ir ../migrations/20261109153000_coach_camp_trends.sql
\ir ../migrations/20261109154000_coach_ssot_vault.sql
\ir ../migrations/20261109156000_unified_activation_review.sql
\ir ../migrations/20261109157000_coach_promotion.sql
\ir ../migrations/20261109158000_get_my_activation_status.sql
\ir ../migrations/20261109159000_get_coach_pending_reviews.sql
\ir ../migrations/20261109160000_coach_radar_cycle_state.sql
\ir ../migrations/20261110090000_get_coach_inventory_v3.sql
\ir ../migrations/20261110120000_final_generation_staff_role_p0.sql
\ir ../migrations/20261112120000_seed_activation_compat.sql
\ir ../migrations/20261112130000_legacy_checkin_claims.sql

create schema test;
create function test.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION_FAILED: %', p_message;
  end if;
end;
$$;
create function test.assert_succeeds(p_sql text)
returns void language plpgsql as $$
declare
  v_message text;
begin
  execute p_sql;
exception when others then
  get stacked diagnostics v_message = message_text;
  raise exception 'ASSERTION_FAILED: expected success, got %', v_message;
end;
$$;
create function test.assert_raises(p_expected text, p_sql text)
returns void language plpgsql as $$
declare
  v_message text;
begin
  execute p_sql;
  raise exception 'ASSERTION_FAILED: expected %, but statement succeeded', p_expected;
exception when others then
  get stacked diagnostics v_message = message_text;
  if v_message = p_expected then return; end if;
  raise exception 'ASSERTION_FAILED: expected %, got %', p_expected, v_message;
end;
$$;
create function test.assert_raises_sqlstate(p_expected text, p_sql text)
returns void language plpgsql as $$
declare
  v_sqlstate text;
  v_message text;
begin
  execute p_sql;
  raise exception 'ASSERTION_FAILED: expected SQLSTATE %, but statement succeeded', p_expected;
exception when others then
  get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
  if v_sqlstate = p_expected then return; end if;
  raise exception 'ASSERTION_FAILED: expected SQLSTATE %, got % (%)', p_expected, v_sqlstate, v_message;
end;
$$;
create function test.assert_authenticated_only(p_signature text)
returns void language plpgsql as $$
begin
  perform test.assert_true(
    has_function_privilege('authenticated', p_signature, 'execute'),
    p_signature || ' must be executable by authenticated'
  );
  perform test.assert_true(
    not has_function_privilege('anon', p_signature, 'execute')
      and not has_function_privilege('public', p_signature, 'execute'),
    p_signature || ' must not be executable by anon/public'
  );
end;
$$;
create function test.assert_extension_search_path(p_function_name text)
returns void language plpgsql as $$
begin
  perform test.assert_true(
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = p_function_name
        and exists (
          select 1 from pg_options_to_table(p.proconfig) option
          where option.option_name = 'search_path'
            and option.option_value = 'public, extensions, pg_temp'
        )
    ),
    p_function_name || ' must use public, extensions, pg_temp'
  );
end;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000001001', 'admin@example.test'),
  ('00000000-0000-0000-0000-000000001002', 'ordinary@example.test'),
  ('00000000-0000-0000-0000-000000001003', 'new-staff@example.test'),
  ('00000000-0000-0000-0000-000000001004', 'active-staff@example.test'),
  ('00000000-0000-0000-0000-000000001005', 'inactive-staff@example.test'),
  ('00000000-0000-0000-0000-000000001006', 'other-staff@example.test'),
  ('00000000-0000-0000-0000-000000001007', 'coach@example.test');
insert into public.camp_admins (email, auth_user_id, role, is_active) values
  ('admin@example.test', '00000000-0000-0000-0000-000000001001', 'admin', true),
  ('active-staff@example.test', '00000000-0000-0000-0000-000000001004', 'staff', true),
  ('inactive-staff@example.test', '00000000-0000-0000-0000-000000001005', 'staff', false),
  ('other-staff@example.test', '00000000-0000-0000-0000-000000001006', 'staff', true),
  ('coach@example.test', '00000000-0000-0000-0000-000000001007', 'coach', true);
insert into public.system_configs (config_key, config_value) values
  ('box_code_expiry_policy', '{"default_expires_at":"2030-01-02T03:04:05+00:00"}'::jsonb)
on conflict (config_key) do update set config_value = excluded.config_value;
insert into vault.decrypted_secrets (name, decrypted_secret)
values ('box_code_pepper', 'final-clearance-test-pepper');

-- P0 红灯复现：扩展只在 extensions 时，旧函数必须实际可执行。
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000001001', false);
select test.assert_succeeds(
  'select public.generate_platform_codes(24, ''21_bags'', ''TEST/EXTENSIONS'')'
);
select test.assert_true(
  (select count(*) = 24 from public.box_codes),
  '24-code legacy path must create 24 rows with pgcrypto in extensions'
);

-- 任意正整数生成；每个 case 的流水数量必须等于实际码行数。
create temporary table generation_1_result as
select public.generate_platform_codes(1, '21_bags', 'TEST/ONE') as result;
create temporary table generation_2_result as
select public.generate_platform_codes(2, '21_bags', 'TEST/TWO') as result;
create temporary table generation_25_result as
select public.generate_platform_codes(25, '21_bags', 'TEST/TWENTY_FIVE') as result;
select test.assert_true(
  (select result ->> 'generatedCount' = '1' and jsonb_array_length(result -> 'caseIds') = 1 from generation_1_result),
  'p_count=1 must create one case and one code'
);
select test.assert_true(
  (select result ->> 'generatedCount' = '2' and jsonb_array_length(result -> 'caseIds') = 1 from generation_2_result),
  'p_count=2 must create one case and two codes'
);
select test.assert_true(
  (select result ->> 'generatedCount' = '25' and jsonb_array_length(result -> 'caseIds') = 2 from generation_25_result),
  'p_count=25 must create two cases and 25 codes'
);
select test.assert_true(
  (select count(*) = 52 from public.box_codes),
  '24 + 1 + 2 + 25 generation must persist exactly 52 codes'
);
select test.assert_true(
  (select count(*) = 5 and sum(quantity) = 52 from public.inventory_logs where event_type = 'platform_generated'),
  'platform generation logs must equal actual generated counts'
);
select test.assert_true(
  not exists (
    select 1 from public.inventory_logs l
    where l.event_type = 'platform_generated'
      and l.quantity <> (select count(*) from public.box_codes b where b.case_id = l.case_id)
  ),
  'partial cases must log their physical code count rather than a fixed batch size'
);

select test.assert_raises('INVALID_CODE_COUNT', 'select public.generate_platform_codes(0, ''21_bags'', ''TEST/ZERO'')');
select test.assert_raises('INVALID_CODE_COUNT', 'select public.generate_platform_codes(-1, ''21_bags'', ''TEST/NEGATIVE'')');
select test.assert_raises('INVALID_CODE_COUNT', 'select public.generate_platform_codes(null, ''21_bags'', ''TEST/NULL'')');
select test.assert_raises_sqlstate('22P02', 'select public.generate_platform_codes(''1.5'', ''21_bags'', ''TEST/FRACTION'')');
select test.assert_true(
  (select count(*) = 52 from public.box_codes),
  'invalid generation counts must not write partial codes'
);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000001002', false);
select test.assert_raises('FORBIDDEN', 'select public.generate_platform_codes(1, ''21_bags'', ''TEST/ORDINARY'')');
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000001004', false);
select test.assert_raises('FORBIDDEN', 'select public.generate_platform_codes(1, ''21_bags'', ''TEST/STAFF'')');

-- SystemConfig 仍是盒规格与打卡额度唯一来源。
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000001001', false);
update public.system_configs set config_value = '30'::jsonb where config_key = 'max_checkins_per_box';
update public.system_configs set config_value = '"30_bags"'::jsonb where config_key = 'default_box_spec';
create temporary table generation_30_result as
select public.generate_platform_codes(1, '30_bags', 'TEST/THIRTY') as result;
select test.assert_true(
  (select result ->> 'boxSpec' = '30_bags' and result ->> 'maxCheckins' = '30' from generation_30_result),
  'changed SystemConfig values must drive generated box spec and max checkins'
);
select test.assert_true(
  (select count(*) = 1 from public.box_codes where box_spec = '30_bags' and max_checkins = 30),
  '30-bag configuration must be snapshotted onto the new code'
);

-- 添加员工、未知邮箱、角色冲突与非 Admin 门禁。
select test.assert_succeeds(
  'select public.admin_set_staff_role(''new-staff@example.test'', true, 0, ''staff-create'')'
);
select test.assert_true(
  (select role = 'staff' and is_active and version = 1 from public.camp_admins
   where auth_user_id = '00000000-0000-0000-0000-000000001003'),
  'Admin must create an active staff role'
);
select test.assert_raises(
  'STAFF_IDENTITY_NOT_FOUND',
  'select public.admin_set_staff_role(''unknown@example.test'', true, 0, ''staff-unknown'')'
);
select test.assert_raises(
  'ROLE_ASSIGNMENT_CONFLICT',
  'select public.admin_set_staff_role(''coach@example.test'', true, 1, ''staff-coach-conflict'')'
);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000001002', false);
select test.assert_raises(
  'FORBIDDEN',
  'select public.admin_set_staff_role(''new-staff@example.test'', true, 1, ''staff-ordinary'')'
);

select test.assert_extension_search_path('generate_platform_codes');
select test.assert_extension_search_path('admin_set_staff_role');
select test.assert_authenticated_only('public.generate_platform_codes(integer,text,text)');
select test.assert_authenticated_only('public.admin_set_staff_role(text,boolean,integer,text)');

select 'PASS: final clearance P0 generation and staff-role behavior' as result;
