\ir ux_flow_test_bootstrap.sql
\ir ../migrations/20261109159000_get_coach_pending_reviews.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'coach@example.test'),
  ('00000000-0000-0000-0000-000000000003', 'other-coach@example.test'),
  ('00000000-0000-0000-0000-000000000004', 'inactive-coach@example.test'),
  ('00000000-0000-0000-0000-000000000005', 'staff@example.test'),
  ('00000000-0000-0000-0000-000000000006', 'probational@example.test'),
  ('00000000-0000-0000-0000-000000000007', 'ordinary@example.test'),
  ('00000000-0000-0000-0000-000000000011', 'manual-camper@example.test'),
  ('00000000-0000-0000-0000-000000000012', 'push-camper@example.test'),
  ('00000000-0000-0000-0000-000000000013', 'other-camper@example.test');
insert into public.camp_admins (email, auth_user_id, role, is_active) values
  ('admin@example.test', '00000000-0000-0000-0000-000000000001', 'admin', true),
  ('coach@example.test', '00000000-0000-0000-0000-000000000002', 'coach', true),
  ('other-coach@example.test', '00000000-0000-0000-0000-000000000003', 'coach', true),
  ('inactive-coach@example.test', '00000000-0000-0000-0000-000000000004', 'coach', false),
  ('staff@example.test', '00000000-0000-0000-0000-000000000005', 'staff', true);
insert into public.coach_promotions (
  auth_user_id, state, checkin_days_snapshot, recruit_baseline, decided_by, decided_at
) values (
  '00000000-0000-0000-0000-000000000006', 'probational_coach', 21, 0,
  '00000000-0000-0000-0000-000000000001', now()
);
insert into vault.decrypted_secrets values ('box_code_pepper', 'vault-test-pepper');

insert into public.user_coach_relation (auth_user_id, camper_code, referrer_id, reason) values
  ('00000000-0000-0000-0000-000000000012', 'JH-P0002', '00000000-0000-0000-0000-000000000002', 'activation');

insert into public.box_codes (
  code_id, code_hash, code_type, code_format, state, coach_id, case_id,
  max_checkins, used_checkins, box_spec, inventory_status, code_ciphertext
) values
  ('00000000-0000-0000-0000-000000001001', encode(digest('coach-manual', 'sha256'), 'hex'), 'experience', 'short', 'pending_review', '00000000-0000-0000-0000-000000000002', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-M001', 'vault-test-pepper')),
  ('00000000-0000-0000-0000-000000001002', encode(digest('coach-push', 'sha256'), 'hex'), 'recharge', 'short', 'pending_review', '00000000-0000-0000-0000-000000000002', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-RC-P002', 'vault-test-pepper')),
  ('00000000-0000-0000-0000-000000001003', encode(digest('other-coach', 'sha256'), 'hex'), 'experience', 'short', 'pending_review', '00000000-0000-0000-0000-000000000003', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-O003', 'vault-test-pepper')),
  ('00000000-0000-0000-0000-000000001004', encode(digest('inactive-coach', 'sha256'), 'hex'), 'experience', 'short', 'pending_review', '00000000-0000-0000-0000-000000000004', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-I004', 'vault-test-pepper')),
  ('00000000-0000-0000-0000-000000001005', encode(digest('platform-code', 'sha256'), 'hex'), 'experience', 'short', 'pending_review', '00000000-0000-0000-0000-000000000002', gen_random_uuid(), 21, 0, '21_bags', 'platform', pgp_sym_encrypt('JH-EL-X005', 'vault-test-pepper'));

insert into public.code_activations (
  activation_id, code_id, auth_user_id, camper_code, expected_code_type,
  review_state, created_at, expected_code_format, request_source
) values
  ('00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000011', 'JH-M0001', 'experience', 'pending', now() - interval '2 hours', 'short', 'manual_code'),
  ('00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000012', 'JH-P0002', 'recharge', 'pending', now() - interval '1 hours', 'short', 'coach_push'),
  ('00000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000000013', 'JH-O0003', 'experience', 'pending', now(), 'short', 'manual_code'),
  ('00000000-0000-0000-0000-000000002004', '00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000000013', 'JH-I0004', 'experience', 'pending', now(), 'short', 'manual_code'),
  ('00000000-0000-0000-0000-000000002005', '00000000-0000-0000-0000-000000001005', '00000000-0000-0000-0000-000000000013', 'JH-X0005', 'experience', 'pending', now(), 'short', 'manual_code');

set role authenticated;
select set_config('app.test_auth_uid', '', false);
select test.assert_raises('UNAUTHORIZED', 'select * from public.get_coach_pending_reviews()');

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000002', false);
create temporary table test_coach_pending as
select row_to_json(r)::jsonb as result from public.get_coach_pending_reviews() r order by r.requested_at;
select result as coach_pending_json from test_coach_pending;
select test.assert_true((select count(*) = 2 from test_coach_pending), 'coach must see exactly manual and direct-push pending rows');
select test.assert_true(
  (select result ->> 'code' = 'JH-EL-M001' and result ->> 'camper_code' = 'JH-M0001'
    and result ->> 'entry_path' = 'manual_code' and result ->> 'code_id' = '00000000-0000-0000-0000-000000001001'
    from test_coach_pending order by result ->> 'requested_at' limit 1),
  'manual request must expose the own inventory code and server camper code'
);
select test.assert_true(
  (select result ->> 'code' = 'JH-RC-P002' and result ->> 'camper_code' = 'JH-P0002'
    and result ->> 'entry_path' = 'coach_push' and result ->> 'code_id' = '00000000-0000-0000-0000-000000001002'
    from test_coach_pending order by result ->> 'requested_at' desc limit 1),
  'direct push must be visible with its own source'
);
select test.assert_true(
  (select count(*) = 5 from jsonb_object_keys((select result from test_coach_pending limit 1))),
  'coach pending item must contain exactly five contract fields'
);
select test.assert_true(
  not exists (select 1 from test_coach_pending where result::text like '%@example.test%' or result ? 'auth_user_id'),
  'coach pending response must not contain email or authentication UID'
);

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000003', false);
select test.assert_true(
  (select count(*) = 1 and bool_and(code = 'JH-EL-O003') from public.get_coach_pending_reviews()),
  'another coach must see only their own inventory pending row'
);

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000001', false);
select test.assert_raises('FORBIDDEN', 'select * from public.get_coach_pending_reviews()');
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000005', false);
select test.assert_raises('FORBIDDEN', 'select * from public.get_coach_pending_reviews()');
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000006', false);
select test.assert_raises('FORBIDDEN', 'select * from public.get_coach_pending_reviews()');
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000007', false);
select test.assert_raises('FORBIDDEN', 'select * from public.get_coach_pending_reviews()');
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000004', false);
select test.assert_raises('FORBIDDEN', 'select * from public.get_coach_pending_reviews()');

reset role;
delete from vault.decrypted_secrets where name = 'box_code_pepper';
set role authenticated;
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000002', false);
select test.assert_raises('BOX_CODE_PEPPER_NOT_CONFIGURED', 'select * from public.get_coach_pending_reviews()');
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000007', false);
select test.assert_raises('FORBIDDEN', 'select * from public.get_coach_pending_reviews()');
reset role;

select test.assert_true(not has_function_privilege('anon', 'public.get_coach_pending_reviews()', 'execute'), 'anon must not execute coach pending RPC');
select test.assert_true(not has_function_privilege('public', 'public.get_coach_pending_reviews()', 'execute'), 'public must not execute coach pending RPC');
select test.assert_true(has_function_privilege('authenticated', 'public.get_coach_pending_reviews()', 'execute'), 'authenticated coach pending RPC grant missing');
select test.assert_true(not has_table_privilege('authenticated', 'public.box_codes', 'select'), 'authenticated must not directly read box codes');
select test.assert_true(not has_table_privilege('authenticated', 'public.code_activations', 'select'), 'authenticated must not directly read activations');
select test.assert_true(not has_table_privilege('authenticated', 'vault.decrypted_secrets', 'select'), 'authenticated must not directly read Vault');

select 'PASS: coach pending ownership, both sources, field privacy, RBAC and Vault' as result;
