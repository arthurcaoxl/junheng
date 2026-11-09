\ir ux_flow_test_bootstrap.sql
\ir ../migrations/20261109158000_get_my_activation_status.sql
\ir ../migrations/20261109159000_get_coach_pending_reviews.sql
\ir ../migrations/20261109160000_coach_radar_cycle_state.sql
\ir ../migrations/20261110090000_get_coach_inventory_v3.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'coach@example.test'),
  ('00000000-0000-0000-0000-000000000003', 'other-coach@example.test'),
  ('00000000-0000-0000-0000-000000000004', 'staff@example.test'),
  ('00000000-0000-0000-0000-000000000005', 'ordinary@example.test'),
  ('00000000-0000-0000-0000-000000000006', 'probational@example.test');
insert into public.camp_admins (email, auth_user_id, role, is_active) values
  ('admin@example.test', '00000000-0000-0000-0000-000000000001', 'admin', true),
  ('coach@example.test', '00000000-0000-0000-0000-000000000002', 'coach', true),
  ('other-coach@example.test', '00000000-0000-0000-0000-000000000003', 'coach', true),
  ('staff@example.test', '00000000-0000-0000-0000-000000000004', 'staff', true);
insert into public.coach_promotions (
  auth_user_id, state, checkin_days_snapshot, recruit_baseline, decided_by, decided_at
) values (
  '00000000-0000-0000-0000-000000000006', 'probational_coach', 21, 0,
  '00000000-0000-0000-0000-000000000001', now()
);
insert into vault.decrypted_secrets values ('box_code_pepper', 'vault-test-pepper');
update public.system_configs set config_value = '2'::jsonb where config_key = 'coach_restock_point';

insert into public.box_codes (
  code_id, code_hash, code_type, code_format, state, coach_id, case_id,
  max_checkins, used_checkins, box_spec, inventory_status, code_ciphertext, created_at
) values
  ('00000000-0000-0000-0000-000000001001', encode(digest('v3-own-a', 'sha256'), 'hex'), 'experience', 'short', 'unused', '00000000-0000-0000-0000-000000000002', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-A001', 'vault-test-pepper'), now() - interval '2 hours'),
  ('00000000-0000-0000-0000-000000001002', encode(digest('v3-own-b', 'sha256'), 'hex'), 'recharge', 'short', 'unused', '00000000-0000-0000-0000-000000000002', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-RC-B002', 'vault-test-pepper'), now() - interval '1 hours'),
  ('00000000-0000-0000-0000-000000001003', encode(digest('v3-other', 'sha256'), 'hex'), 'experience', 'short', 'unused', '00000000-0000-0000-0000-000000000003', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-O003', 'vault-test-pepper'), now()),
  ('00000000-0000-0000-0000-000000001004', encode(digest('v3-pending', 'sha256'), 'hex'), 'experience', 'short', 'pending_review', '00000000-0000-0000-0000-000000000002', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-P004', 'vault-test-pepper'), now());

set role authenticated;
select set_config('app.test_auth_uid', '', false);
select test.assert_raises('UNAUTHORIZED', 'select public.get_coach_inventory_v3(null)');

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000002', false);
create temporary table test_inventory_baseline as select public.get_my_code_inventory() as result;
create temporary table test_inventory_v3_null as select public.get_coach_inventory_v3(p_dummy => null) as result;
create temporary table test_inventory_v3_omitted as select public.get_coach_inventory_v3() as result;
select result as inventory_v3_json from test_inventory_v3_null;
select test.assert_true(
  (select result = (select result from test_inventory_baseline) from test_inventory_v3_null),
  'explicit null dummy must return the exact latest inventory JSON'
);
select test.assert_true(
  (select result = (select result from test_inventory_baseline) from test_inventory_v3_omitted),
  'omitted dummy must use the default and return the exact latest inventory JSON'
);
select test.assert_true(
  public.get_coach_inventory_v3(true) = (select result from test_inventory_baseline)
    and public.get_coach_inventory_v3(false) = (select result from test_inventory_baseline),
  'dummy values must not alter inventory behavior or authorization'
);
select test.assert_true(
  (select result ->> 'ok' = 'true' and (result ->> 'availableCount')::integer = 2
    and (result ->> 'restockPoint')::integer = 2
    and (result ->> 'needsRestock')::boolean = false
    and jsonb_array_length(result -> 'codes') = 2 from test_inventory_v3_null),
  'formal coach must receive real available inventory summary fields'
);
select test.assert_true(
  (select result -> 'codes' -> 0 ->> 'code' = 'JH-EL-A001'
    and result -> 'codes' -> 0 ->> 'boxSpec' = '21_bags'
    and (result -> 'codes' -> 0 ->> 'maxCheckins')::integer = 21
    and result -> 'codes' -> 0 ->> 'codeId' = '00000000-0000-0000-0000-000000001001'
    and result -> 'codes' -> 0 ->> 'createdAt' is not null from test_inventory_v3_null),
  'inventory code item must preserve codeId/code/boxSpec/maxCheckins/createdAt'
);
select test.assert_true(
  (select result::text not like '%JH-EL-O003%' and result::text not like '%JH-EL-P004%' from test_inventory_v3_null),
  'other coach and non-unused codes must not enter the response'
);

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000006', false);
select test.assert_raises('FORBIDDEN', 'select public.get_coach_inventory_v3(null)');
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000004', false);
select test.assert_raises('FORBIDDEN', 'select public.get_coach_inventory_v3()');
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000005', false);
select test.assert_raises('FORBIDDEN', 'select public.get_coach_inventory_v3(null)');
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000001', false);
select test.assert_raises('FORBIDDEN', 'select public.get_coach_inventory_v3()');

reset role;
delete from vault.decrypted_secrets where name = 'box_code_pepper';
set role authenticated;
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000002', false);
select test.assert_raises('BOX_CODE_PEPPER_NOT_CONFIGURED', 'select public.get_coach_inventory_v3(null)');
select test.assert_raises('BOX_CODE_PEPPER_NOT_CONFIGURED', 'select public.get_my_code_inventory()');
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000005', false);
select test.assert_raises('FORBIDDEN', 'select public.get_coach_inventory_v3()');
reset role;

select test.assert_true(not has_function_privilege('anon', 'public.get_coach_inventory_v3(boolean)', 'execute'), 'anon must not execute inventory v3');
select test.assert_true(not has_function_privilege('public', 'public.get_coach_inventory_v3(boolean)', 'execute'), 'public must not execute inventory v3');
select test.assert_true(has_function_privilege('authenticated', 'public.get_coach_inventory_v3(boolean)', 'execute'), 'authenticated inventory v3 grant missing');
select test.assert_true(
  (select p.pronargs = 1 and p.pronargdefaults = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_coach_inventory_v3'),
  'inventory v3 must expose exactly one defaulted boolean parameter'
);

select 'PASS: inventory v3 null/omitted calls, exact latest JSON, RBAC, Vault and grants' as result;
