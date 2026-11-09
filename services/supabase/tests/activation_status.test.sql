\ir ux_flow_test_bootstrap.sql
\ir ../migrations/20261109158000_get_my_activation_status.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'coach@example.test'),
  ('00000000-0000-0000-0000-000000000010', 'none@example.test'),
  ('00000000-0000-0000-0000-000000000011', 'pending@example.test'),
  ('00000000-0000-0000-0000-000000000012', 'active@example.test'),
  ('00000000-0000-0000-0000-000000000013', 'rejected@example.test'),
  ('00000000-0000-0000-0000-000000000014', 'other@example.test');
insert into public.camp_admins (email, auth_user_id, role, is_active) values
  ('admin@example.test', '00000000-0000-0000-0000-000000000001', 'admin', true),
  ('coach@example.test', '00000000-0000-0000-0000-000000000002', 'coach', true);
insert into vault.decrypted_secrets values ('box_code_pepper', 'vault-test-pepper');
insert into public.checkin_sync (auth_user_id, user_code, start_date, records) values
  ('00000000-0000-0000-0000-000000000013', 'JH-R0003', current_date, '{}'::jsonb);

insert into public.box_codes (
  code_id, code_hash, code_type, code_format, state, coach_id, case_id,
  max_checkins, used_checkins, box_spec, inventory_status, code_ciphertext
) values
  ('00000000-0000-0000-0000-000000001001', encode(digest('status-pending', 'sha256'), 'hex'), 'experience', 'short', 'pending_review', '00000000-0000-0000-0000-000000000002', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-P001', 'vault-test-pepper')),
  ('00000000-0000-0000-0000-000000001002', encode(digest('status-active', 'sha256'), 'hex'), 'experience', 'short', 'pending_review', '00000000-0000-0000-0000-000000000002', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-A002', 'vault-test-pepper')),
  ('00000000-0000-0000-0000-000000001003', encode(digest('status-rejected', 'sha256'), 'hex'), 'experience', 'short', 'pending_review', '00000000-0000-0000-0000-000000000002', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-R003', 'vault-test-pepper')),
  ('00000000-0000-0000-0000-000000001004', encode(hmac('JH-EL-R567', 'vault-test-pepper', 'sha256'), 'hex'), 'experience', 'short', 'unused', '00000000-0000-0000-0000-000000000002', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-R567', 'vault-test-pepper')),
  ('00000000-0000-0000-0000-000000001005', encode(digest('status-other', 'sha256'), 'hex'), 'experience', 'short', 'pending_review', '00000000-0000-0000-0000-000000000002', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-O005', 'vault-test-pepper'));

insert into public.code_activations (
  activation_id, code_id, auth_user_id, camper_code, expected_code_type,
  review_state, created_at, expected_code_format, request_source
) values
  ('00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000011', 'JH-P0001', 'experience', 'pending', now() - interval '4 hours', 'short', 'manual_code'),
  ('00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000012', 'JH-A0002', 'experience', 'pending', now() - interval '3 hours', 'short', 'coach_push'),
  ('00000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000000013', 'JH-R0003', 'experience', 'pending', now() - interval '2 hours', 'short', 'manual_code'),
  ('00000000-0000-0000-0000-000000002005', '00000000-0000-0000-0000-000000001005', '00000000-0000-0000-0000-000000000014', 'JH-O0005', 'experience', 'pending', now() - interval '1 hours', 'short', 'manual_code');

update public.code_activations set
  review_state = 'approved', target_referrer_id = '00000000-0000-0000-0000-000000000002',
  decided_by = '00000000-0000-0000-0000-000000000001', decided_at = now(),
  shipment_verification_ref = 'TEST/ACTIVE', activated_at = now(),
  version = version + 1, updated_at = now()
where activation_id = '00000000-0000-0000-0000-000000002002';
update public.box_codes set state = 'active', activation_id = '00000000-0000-0000-0000-000000002002', version = 2
where code_id = '00000000-0000-0000-0000-000000001002';
update public.code_activations set
  review_state = 'rejected', decided_by = '00000000-0000-0000-0000-000000000001',
  decided_at = now(), rejection_reason_code = 'INTERNAL_SHIPMENT_MISMATCH',
  replacement_code_id = '00000000-0000-0000-0000-000000001004',
  version = version + 1, updated_at = now()
where activation_id = '00000000-0000-0000-0000-000000002003';
update public.box_codes set state = 'revoked', version = 2
where code_id = '00000000-0000-0000-0000-000000001003';

set role authenticated;
select set_config('app.test_auth_uid', '', false);
select test.assert_raises('UNAUTHORIZED', 'select public.get_my_activation_status()');

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000010', false);
select test.assert_true(
  public.get_my_activation_status() = '{"state":"none","requested_at":null,"rejection_hint":null}'::jsonb,
  'user without applications must receive the exact none object'
);

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000011', false);
create temporary table test_pending_status as select public.get_my_activation_status() as result;
select result as pending_status_json from test_pending_status;
select test.assert_true(
  (select result ->> 'state' = 'pending_review' and result ->> 'requested_at' is not null and result -> 'rejection_hint' = 'null'::jsonb from test_pending_status),
  'pending status must expose only pending semantics and request time'
);

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000012', false);
create temporary table test_active_status as select public.get_my_activation_status() as result;
select result as active_status_json from test_active_status;
select test.assert_true(
  (select result ->> 'state' = 'active' and result -> 'rejection_hint' = 'null'::jsonb from test_active_status),
  'approved latest application must map to active'
);

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000013', false);
create temporary table test_rejected_status as select public.get_my_activation_status() as result;
select result as rejected_status_json from test_rejected_status;
select test.assert_true(
  (select result ->> 'state' = 'rejected' and result ->> 'rejection_hint' = 'contact_coach'
    and result::text not like '%INTERNAL_SHIPMENT_MISMATCH%' from test_rejected_status),
  'rejected status must use a generic hint without internal reason'
);
select test.assert_true(
  (select count(*) = 3 from jsonb_object_keys((select result from test_rejected_status))),
  'status response must contain exactly three contract fields'
);

create temporary table test_reapply_result as
select public.request_box_code_activation('JH-EL-R567', 'reapply-after-rejection', 'test-device') as result;
select result as reapply_result_json from test_reapply_result;
select test.assert_true(
  (select result ->> 'state' = 'pending_review' from test_reapply_result),
  'rejected user must be able to reapply through the existing state machine'
);
select test.assert_true(
  public.get_my_activation_status() ->> 'state' = 'pending_review',
  'new pending request must become the latest status without rewriting rejected history'
);
reset role;
select test.assert_true(
  (select count(*) = 2 from public.code_activations where auth_user_id = '00000000-0000-0000-0000-000000000013'),
  'reapply must retain rejected history and add one request'
);
set role authenticated;

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000010', false);
select test.assert_true(
  public.get_my_activation_status() ->> 'state' = 'none',
  'another user pending row must not leak into the current user status'
);
reset role;
select test.assert_true(not has_function_privilege('anon', 'public.get_my_activation_status()', 'execute'), 'anon must not execute status RPC');
select test.assert_true(not has_function_privilege('public', 'public.get_my_activation_status()', 'execute'), 'public must not execute status RPC');
select test.assert_true(has_function_privilege('authenticated', 'public.get_my_activation_status()', 'execute'), 'authenticated status RPC grant missing');
select test.assert_true(not has_table_privilege('authenticated', 'public.code_activations', 'select'), 'authenticated must not directly read activation rows');

select 'PASS: activation status privacy, latest state, reapply and grants' as result;
