\ir ux_flow_test_bootstrap.sql
\ir ../migrations/20261112120000_seed_activation_compat.sql

-- TASK-10.16 冻结边界守卫：is_test_record 字段、触发器和统计 RPC 过滤本轮均未放行。
-- 本文件只读目录并执行现有只读 RPC，不创建字段、触发器或统计过滤，也不写 checkin_daily_claims。
-- TODO(-R-02)：仅当 -R-02 明确放行后，才以真正的测试记录置标行为测试整体替换本文件。
begin;

select test.assert_true(
  not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name in ('checkin_sync', 'code_activations', 'checkin_daily_claims')
      and c.column_name = 'is_test_record'
  ),
  'frozen schema must not contain is_test_record on sync, activation or daily claims'
);

select test.assert_true(
  (select count(*) = 5
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'checkin_daily_claims'
    and c.column_name in ('code_id', 'auth_user_id', 'physical_day', 'used_checkins', 'created_at')),
  'checkin_daily_claims must retain its frozen five-column structure'
);

select test.assert_true(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'mark_test_record'
  ),
  'no test-record marker trigger function may be introduced before -R-02'
);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000201', 'frozen-marker@seed-compat.test');

set role authenticated;
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000201', false);
create temporary table frozen_status_response as
select public.get_my_activation_status() as result;

select test.assert_true(
  (select result ->> 'state' = 'none'
    and not (result ? 'is_test_record')
    and (select count(*) = 4 from jsonb_object_keys(result))
  from frozen_status_response),
  'current status RPC must preserve its four-field response without test-record filtering metadata'
);
reset role;

select test.assert_true(
  (select count(*) = 0 from public.checkin_daily_claims),
  'frozen guard must not write checkin_daily_claims'
);

rollback;

select test.assert_true(
  (select count(*) = 0 from auth.users where email = 'frozen-marker@seed-compat.test'),
  'ROLLBACK must remove the frozen guard auth fixture'
);
select test.assert_true(
  not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'checkin_sync'
      and c.column_name = 'is_test_record'
  ),
  'this guard itself must leave checkin_sync without is_test_record after ROLLBACK'
);

select 'PASS: test-record marker remains frozen pending -R-02; no marker schema or claims writes' as result;
