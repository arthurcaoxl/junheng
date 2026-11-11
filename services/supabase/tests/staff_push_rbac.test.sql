\ir staff_rbac_test_bootstrap.sql

insert into auth.users (id, email) values
  ('30000000-0000-0000-0000-000000000002', 'push-coach@example.test'),
  ('30000000-0000-0000-0000-000000000003', 'push-staff@example.test'),
  ('30000000-0000-0000-0000-000000000004', 'push-staff-camper@example.test'),
  ('30000000-0000-0000-0000-000000000005', 'push-coach-camper@example.test');
insert into public.camp_admins (email, auth_user_id, role, is_active) values
  ('push-coach@example.test', '30000000-0000-0000-0000-000000000002', 'coach', true),
  ('push-staff@example.test', '30000000-0000-0000-0000-000000000003', 'staff', true);
insert into public.staff_coach_assignment (staff_id, coach_id, assigned_by)
values ('30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002');
insert into public.user_coach_relation (relation_id, auth_user_id, camper_code, referrer_id, reason) values
  ('30000000-0000-0000-0000-000000003004', '30000000-0000-0000-0000-000000000004', 'JH-S3004', '30000000-0000-0000-0000-000000000002', 'activation'),
  ('30000000-0000-0000-0000-000000003005', '30000000-0000-0000-0000-000000000005', 'JH-C3005', '30000000-0000-0000-0000-000000000002', 'activation');
insert into vault.decrypted_secrets (name, decrypted_secret)
values ('box_code_pepper', 'staff-push-rbac-test-pepper');
insert into public.box_codes (
  code_id, code_hash, code_type, code_format, state, coach_id, case_id,
  max_checkins, used_checkins, box_spec, inventory_status, code_ciphertext
) values
  ('30000000-0000-0000-0000-000000001002', encode(digest('push-coach-code', 'sha256'), 'hex'),
   'experience', 'short', 'unused', '30000000-0000-0000-0000-000000000002', gen_random_uuid(),
   21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-C234', 'staff-push-rbac-test-pepper')),
  ('30000000-0000-0000-0000-000000001003', encode(digest('push-staff-code', 'sha256'), 'hex'),
   'experience', 'short', 'unused', '30000000-0000-0000-0000-000000000003', gen_random_uuid(),
   21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-S234', 'staff-push-rbac-test-pepper'));

set role authenticated;
select set_config('app.test_auth_uid', '30000000-0000-0000-0000-000000000003', false);
select test.assert_raises_sqlstate(
  '42501',
  'select public.coach_push_code_v1(''30000000-0000-0000-0000-000000003004'', ''30000000-0000-0000-0000-000000001003'', ''staff-push-must-fail'')'
);
reset role;
select test.assert_true(
  not exists (select 1 from public.code_activations where auth_user_id = '30000000-0000-0000-0000-000000000004')
    and not exists (select 1 from public.box_code_commands where idempotency_key = 'staff-push-must-fail')
    and not exists (select 1 from public.box_code_events where actor_auth_user_id = '30000000-0000-0000-0000-000000000003')
    and (select state = 'unused' and version = 1 from public.box_codes where code_id = '30000000-0000-0000-0000-000000001003'),
  'staff denial must not create activation, command or event and must not consume the code'
);

set role authenticated;
select set_config('app.test_auth_uid', '30000000-0000-0000-0000-000000000002', false);
create temporary table push_coach_result as
select public.coach_push_code_v1(
  '30000000-0000-0000-0000-000000003005',
  '30000000-0000-0000-0000-000000001002',
  'coach-push-must-succeed'
) as result;
select test.assert_true(
  (select result ->> 'ok' = 'true' and result ->> 'state' = 'pending_review'
    and result ->> 'replayed' = 'false' from push_coach_result),
  'formal coach must retain own-code own-camper direct push'
);
reset role;
select test.assert_true(
  (select review_state = 'pending' and request_source = 'coach_push'
    from public.code_activations where auth_user_id = '30000000-0000-0000-0000-000000000005')
    and (select state = 'pending_review' from public.box_codes where code_id = '30000000-0000-0000-0000-000000001002'),
  'formal coach direct push must preserve the pending review state machine'
);

select 'PASS: TASK-10.15 G-S3 staff direct push denied without side effects; coach preserved' as result;
