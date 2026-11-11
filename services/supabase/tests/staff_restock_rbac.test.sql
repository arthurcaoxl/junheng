\ir staff_rbac_test_bootstrap.sql

insert into auth.users (id, email) values
  ('20000000-0000-0000-0000-000000000002', 'restock-coach@example.test'),
  ('20000000-0000-0000-0000-000000000003', 'restock-staff@example.test');
insert into public.camp_admins (email, auth_user_id, role, is_active) values
  ('restock-coach@example.test', '20000000-0000-0000-0000-000000000002', 'coach', true),
  ('restock-staff@example.test', '20000000-0000-0000-0000-000000000003', 'staff', true);
insert into public.coach_restock_requests (coach_id, note)
values ('20000000-0000-0000-0000-000000000003', 'existing staff row must remain unchanged');

set role authenticated;
select set_config('app.test_auth_uid', '20000000-0000-0000-0000-000000000003', false);
select test.assert_raises_sqlstate(
  '42501',
  'select public.request_coach_restock_v1(''staff must not create or modify a request'')'
);
reset role;
select test.assert_true(
  (select count(*) = 1 from public.coach_restock_requests where coach_id = '20000000-0000-0000-0000-000000000003')
    and (select note = 'existing staff row must remain unchanged' and status = 'pending'
      from public.coach_restock_requests where coach_id = '20000000-0000-0000-0000-000000000003'),
  'staff denial must not insert or modify restock requests'
);

set role authenticated;
select set_config('app.test_auth_uid', '20000000-0000-0000-0000-000000000002', false);
create temporary table restock_coach_first as
select public.request_coach_restock_v1('coach needs restock') as result;
create temporary table restock_coach_replay as
select public.request_coach_restock_v1('coach needs restock') as result;
select test.assert_true(
  (select result ->> 'ok' = 'true' and result ->> 'status' = 'pending'
    and result ->> 'replayed' = 'false' from restock_coach_first),
  'empty formal coach must create a pending restock request'
);
select test.assert_true(
  (select result ->> 'ok' = 'true' and result ->> 'replayed' = 'true'
    and result ->> 'requestId' = (select result ->> 'requestId' from restock_coach_first)
  from restock_coach_replay),
  'formal coach repeat request must remain idempotent'
);
reset role;
select test.assert_true(
  (select count(*) = 1 from public.coach_restock_requests where coach_id = '20000000-0000-0000-0000-000000000002'),
  'formal coach idempotent replay must not duplicate rows'
);

select 'PASS: TASK-10.15 G-S2 existing coach-only restock guard preserved' as result;
