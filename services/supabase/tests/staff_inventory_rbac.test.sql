\ir staff_rbac_test_bootstrap.sql

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'inventory-admin@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'inventory-coach@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'inventory-staff@example.test');
insert into public.camp_admins (email, auth_user_id, role, is_active) values
  ('inventory-admin@example.test', '10000000-0000-0000-0000-000000000001', 'admin', true),
  ('inventory-coach@example.test', '10000000-0000-0000-0000-000000000002', 'coach', true),
  ('inventory-staff@example.test', '10000000-0000-0000-0000-000000000003', 'staff', true);
insert into vault.decrypted_secrets (name, decrypted_secret)
values ('box_code_pepper', 'staff-inventory-rbac-test-pepper');
update public.system_configs set config_value = '2'::jsonb where config_key = 'coach_restock_point';

insert into public.box_codes (
  code_id, code_hash, code_type, code_format, state, coach_id, case_id,
  max_checkins, used_checkins, box_spec, inventory_status, code_ciphertext
) values
  ('10000000-0000-0000-0000-000000001002', encode(digest('inventory-coach-code', 'sha256'), 'hex'),
   'experience', 'short', 'unused', '10000000-0000-0000-0000-000000000002', gen_random_uuid(),
   21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-C002', 'staff-inventory-rbac-test-pepper')),
  ('10000000-0000-0000-0000-000000001003', encode(digest('inventory-staff-code', 'sha256'), 'hex'),
   'experience', 'short', 'unused', '10000000-0000-0000-0000-000000000003', gen_random_uuid(),
   21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-S003', 'staff-inventory-rbac-test-pepper'));

set role authenticated;
select set_config('app.test_auth_uid', '10000000-0000-0000-0000-000000000003', false);
select test.assert_raises_sqlstate('42501', 'select public.get_my_code_inventory()');
select test.assert_raises_sqlstate('42501', 'select public.get_coach_inventory_v3(null)');
select test.assert_true(
  (select role = 'staff' and can_view_radar and not can_manage_inventory from public.get_my_access_profile()),
  'staff access profile must retain radar and deny inventory'
);

select set_config('app.test_auth_uid', '10000000-0000-0000-0000-000000000002', false);
create temporary table inventory_coach_result as
select public.get_coach_inventory_v3(null) as result;
select test.assert_true(
  (select result ->> 'ok' = 'true'
    and (result ->> 'availableCount')::integer = 1
    and result -> 'codes' -> 0 ->> 'code' = 'JH-EL-C002'
    and result::text not like '%JH-EL-S003%'
  from inventory_coach_result),
  'formal coach must retain exactly the own inventory response'
);
select test.assert_true(
  (select role = 'coach' and can_view_radar and can_manage_inventory from public.get_my_access_profile()),
  'formal coach access profile must retain inventory'
);

select set_config('app.test_auth_uid', '10000000-0000-0000-0000-000000000001', false);
select test.assert_raises_sqlstate('42501', 'select public.get_coach_inventory_v3(null)');
reset role;

select 'PASS: TASK-10.15 G-S1 staff inventory denied; coach and admin behavior preserved' as result;
