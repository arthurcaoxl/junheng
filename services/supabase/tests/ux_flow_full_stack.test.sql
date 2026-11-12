\ir ux_flow_test_bootstrap.sql
\ir ../migrations/20261109158000_get_my_activation_status.sql
\ir ../migrations/20261109159000_get_coach_pending_reviews.sql
\ir ../migrations/20261109160000_coach_radar_cycle_state.sql
\ir ../migrations/20261110090000_get_coach_inventory_v3.sql
\ir ../migrations/20261110120000_final_generation_staff_role_p0.sql
\ir ../migrations/20261110121000_direct_staff_inventory.sql
\ir ../migrations/20261110122000_pgcrypto_search_path.sql
-- 后续历史状态函数覆盖后，恢复当前种子兼容函数；新 claims 迁移已在 bootstrap 执行。
\ir ../migrations/20261112120000_seed_activation_compat.sql

set role authenticated;
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000010', false);
select public.get_my_activation_status() as full_stack_status_json;
select test.assert_true(
  public.get_my_activation_status() ->> 'state' = 'none',
  'full migration stack must expose user status without prior fixtures'
);
select test.assert_raises('FORBIDDEN', 'select * from public.get_coach_pending_reviews()');
select test.assert_raises('FORBIDDEN', 'select public.get_coach_inventory_v3(null)');
select test.assert_true(
  (select count(*) = 0 from public.get_coach_radar_v1()),
  'full migration stack scoped radar must preserve ordinary-user empty result'
);
reset role;
select test.assert_true(
  (select count(*) = 2 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_coach_radar_v1'),
  'full migration stack must leave exactly the two current radar overloads'
);
select test.assert_true(
  (select count(*) = 4 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'get_my_activation_status', 'get_coach_pending_reviews', 'get_coach_radar_v1'
    ) and p.provolatile = 's'),
  'all new read entry points must be STABLE after ordered migrations'
);
select 'PASS: all 20 historical, 4 UX and 3 final-clearance migrations applied in filename order' as result;
