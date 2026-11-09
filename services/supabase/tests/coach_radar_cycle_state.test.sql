\ir ux_flow_test_bootstrap.sql
\ir ../migrations/20261109160000_coach_radar_cycle_state.sql

update public.system_configs set config_value = '5'::jsonb where config_key = 'max_checkins_per_box';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'coach@example.test'),
  ('00000000-0000-0000-0000-000000000003', 'other-coach@example.test'),
  ('00000000-0000-0000-0000-000000000004', 'staff@example.test'),
  ('00000000-0000-0000-0000-000000000005', 'probational@example.test'),
  ('00000000-0000-0000-0000-000000000006', 'ordinary@example.test'),
  ('00000000-0000-0000-0000-000000000101', 'missed@example.test'),
  ('00000000-0000-0000-0000-000000000102', 'expired@example.test'),
  ('00000000-0000-0000-0000-000000000103', 'renewed@example.test'),
  ('00000000-0000-0000-0000-000000000104', 'other-camper@example.test'),
  ('00000000-0000-0000-0000-000000000105', 'probational-camper@example.test');
insert into public.camp_admins (email, auth_user_id, role, is_active) values
  ('admin@example.test', '00000000-0000-0000-0000-000000000001', 'admin', true),
  ('coach@example.test', '00000000-0000-0000-0000-000000000002', 'coach', true),
  ('other-coach@example.test', '00000000-0000-0000-0000-000000000003', 'coach', true),
  ('staff@example.test', '00000000-0000-0000-0000-000000000004', 'staff', true);
insert into public.coach_promotions (
  auth_user_id, state, checkin_days_snapshot, recruit_baseline, decided_by, decided_at
) values (
  '00000000-0000-0000-0000-000000000005', 'probational_coach', 21, 0,
  '00000000-0000-0000-0000-000000000001', now()
);
insert into public.staff_coach_assignment (staff_id, coach_id, assigned_by) values
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001');

insert into public.checkin_sync (auth_user_id, user_code, start_date, records) values
  ('00000000-0000-0000-0000-000000000101', 'JH-M0001', current_date, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000102', 'JH-E0002', current_date - 5, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000103', 'JH-R0003', current_date - 5, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000104', 'JH-O0004', current_date, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000105', 'JH-P0005', current_date, '{}'::jsonb);
insert into public.user_coach_relation (auth_user_id, camper_code, referrer_id, reason) values
  ('00000000-0000-0000-0000-000000000101', 'JH-M0001', '00000000-0000-0000-0000-000000000002', 'activation'),
  ('00000000-0000-0000-0000-000000000102', 'JH-E0002', '00000000-0000-0000-0000-000000000002', 'activation'),
  ('00000000-0000-0000-0000-000000000103', 'JH-R0003', '00000000-0000-0000-0000-000000000002', 'activation'),
  ('00000000-0000-0000-0000-000000000104', 'JH-O0004', '00000000-0000-0000-0000-000000000003', 'activation'),
  ('00000000-0000-0000-0000-000000000105', 'JH-P0005', '00000000-0000-0000-0000-000000000005', 'activation');

insert into public.box_codes (
  code_id, code_hash, code_type, code_format, state, coach_id, case_id,
  max_checkins, used_checkins, box_spec, inventory_status
) values (
  '00000000-0000-0000-0000-000000001003', encode(digest('active-recharge', 'sha256'), 'hex'),
  'recharge', 'short', 'pending_review', '00000000-0000-0000-0000-000000000002',
  gen_random_uuid(), 5, 0, '21_bags', 'coach'
);
insert into public.code_activations (
  activation_id, code_id, auth_user_id, camper_code, expected_code_type,
  review_state, target_referrer_id, decided_by, decided_at,
  shipment_verification_ref, payment_verification_ref, activated_at,
  expected_code_format, request_source
) values (
  '00000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000001003',
  '00000000-0000-0000-0000-000000000103', 'JH-R0003', 'recharge',
  'approved', '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001', now(), 'TEST/RECHARGE', 'TEST/PAYMENT', now(),
  'short', 'coach_push'
);
update public.box_codes set state = 'active', activation_id = '00000000-0000-0000-0000-000000002003', version = 2
where code_id = '00000000-0000-0000-0000-000000001003';

set role authenticated;
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000002', false);
create temporary table test_coach_cycle as
select row_to_json(r)::jsonb as result from public.get_coach_radar_v1() r;
select result as cycle_state_json from test_coach_cycle order by result ->> 'camper_code';
select test.assert_true((select count(*) = 3 from test_coach_cycle), 'coach no-arg radar must retain only own three campers');
select test.assert_true(
  (select result ->> 'cycle_state' = 'in_cycle' and result ->> 'alert_level' = 'red'
    from test_coach_cycle where result ->> 'camper_code' = 'JH-M0001'),
  'in-window missed check-ins must remain in_cycle and red'
);
select test.assert_true(
  (select result ->> 'cycle_state' = 'cycle_complete_pending_renewal' and result ->> 'alert_level' = 'red'
    from test_coach_cycle where result ->> 'camper_code' = 'JH-E0002'),
  'configured five-day expiry without recharge must be pending renewal'
);
select test.assert_true(
  (select result ->> 'cycle_state' = 'in_cycle'
    from test_coach_cycle where result ->> 'camper_code' = 'JH-R0003'),
  'active recharge fact must clear pending renewal independently of alert light'
);
select test.assert_true(
  (select count(*) = 6 from jsonb_object_keys((select result from test_coach_cycle limit 1))),
  'radar row must contain original five fields plus cycle_state'
);
select test.assert_true(
  (select count(*) = 3 from public.get_coach_radar_v1('own')),
  'explicit own scope must preserve coach results'
);
select test.assert_raises('FORBIDDEN', 'select * from public.get_coach_radar_v1(''all'')');

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000004', false);
select test.assert_true(
  (select count(*) = 3 and bool_and(camper_code <> 'JH-O0004') from public.get_coach_radar_v1()),
  'staff must retain only currently assigned coach radar rows'
);
select test.assert_raises('FORBIDDEN', 'select * from public.get_coach_radar_v1(''all'')');

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000001', false);
select test.assert_true(
  (select count(*) = 5 from public.get_coach_radar_v1('all')),
  'Admin all scope must retain all five campers'
);
select test.assert_true(
  (select count(*) = 5 from public.get_coach_radar_v1()),
  'Admin legacy no-arg radar must retain the all scope'
);

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000005', false);
select test.assert_true(
  (select count(*) = 1 and bool_and(camper_code = 'JH-P0005' and cycle_state = 'in_cycle') from public.get_coach_radar_v1()),
  'probational coach must retain own radar and cycle state'
);
select test.assert_raises('FORBIDDEN', 'select * from public.get_coach_radar_v1(''all'')');

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000006', false);
select test.assert_true((select count(*) = 0 from public.get_coach_radar_v1()), 'ordinary user radar must remain empty');
select set_config('app.test_auth_uid', '', false);
select test.assert_true((select count(*) = 0 from public.get_coach_radar_v1()), 'anonymous radar must remain empty');
reset role;

update public.system_configs set config_value = '0'::jsonb where config_key = 'max_checkins_per_box';
set role authenticated;
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000002', false);
select test.assert_raises('SYSTEM_CONFIG_MISSING', 'select * from public.get_coach_radar_v1()');
reset role;
update public.system_configs set config_value = '"invalid"'::jsonb where config_key = 'max_checkins_per_box';
set role authenticated;
select test.assert_raises('SYSTEM_CONFIG_MISSING', 'select * from public.get_coach_radar_v1()');
reset role;
delete from public.system_configs where config_key = 'max_checkins_per_box';
set role authenticated;
select test.assert_raises('SYSTEM_CONFIG_MISSING', 'select * from public.get_coach_radar_v1()');
reset role;

select test.assert_true(not has_function_privilege('anon', 'public.get_coach_radar_v1()', 'execute'), 'anon must not execute no-arg radar');
select test.assert_true(not has_function_privilege('anon', 'public.get_coach_radar_v1(text)', 'execute'), 'anon must not execute scoped radar');
select test.assert_true(not has_function_privilege('public', 'public.get_coach_radar_v1()', 'execute'), 'public must not execute no-arg radar');
select test.assert_true(has_function_privilege('authenticated', 'public.get_coach_radar_v1()', 'execute'), 'authenticated no-arg radar grant missing');
select test.assert_true(has_function_privilege('authenticated', 'public.get_coach_radar_v1(text)', 'execute'), 'authenticated scoped radar grant missing');
select test.assert_true(
  (select bool_and(p.provolatile = 's') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_coach_radar_v1'),
  'both radar overloads must remain STABLE'
);

select 'PASS: radar configured cycle state, renewal facts, alert independence and RBAC regression' as result;
