-- 在同一真实 PostgreSQL 会话中接续 final_clearance.test.sql 的全量迁移与 P0 数据。
\ir ../migrations/20261110121000_direct_staff_inventory.sql
\ir ../migrations/20261110122000_pgcrypto_search_path.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000001008', 'assigned-camper@example.test'),
  ('00000000-0000-0000-0000-000000001009', 'outside-camper@example.test'),
  ('00000000-0000-0000-0000-000000001010', 'coach-camper@example.test');
insert into public.staff_coach_assignment (staff_id, coach_id, assigned_by) values
  ('00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000001007', '00000000-0000-0000-0000-000000001001');
insert into public.user_coach_relation (
  relation_id, auth_user_id, camper_code, referrer_id, reason
) values
  ('00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000001008', 'JH-S0008', '00000000-0000-0000-0000-000000001007', 'activation'),
  ('00000000-0000-0000-0000-000000003002', '00000000-0000-0000-0000-000000001009', 'JH-S0009', '00000000-0000-0000-0000-000000001002', 'activation'),
  ('00000000-0000-0000-0000-000000003003', '00000000-0000-0000-0000-000000001010', 'JH-S0010', '00000000-0000-0000-0000-000000001007', 'activation');

-- 员工目录只返回有效 staff，并复用完整目录统计与分配字段。
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000001001', false);
select test.assert_true(
  exists (
    select 1 from public.admin_search_staff_directory_v1('active-staff') d
    where d.staff_id = '00000000-0000-0000-0000-000000001004'
      and d.email = 'active-staff@example.test' and d.is_active
      and d.coach_count = 1 and d.camper_count = 2
      and jsonb_array_length(d.assignments) = 1 and d.version = 1
  ),
  'staff search must return directory fields and current assignment aggregates'
);
select test.assert_true(
  not exists (
    select 1 from public.admin_search_staff_directory_v1('staff@example.test')
    where staff_id = '00000000-0000-0000-0000-000000001005' or not is_active
  ),
  'staff search must exclude inactive staff'
);
select test.assert_true(
  not exists (
    select 1 from public.admin_search_staff_directory_v1('example.test') d
    join public.camp_admins a on a.auth_user_id = d.staff_id
    where a.role <> 'staff'
  ),
  'staff search must not leak admin or coach directory entries'
);
select test.assert_true(
  (select count(*) = 0 from public.admin_search_staff_directory_v1('')),
  'empty staff search must return an empty result'
);
select test.assert_true(
  (select count(*) = 0 from public.admin_search_staff_directory_v1(null)),
  'null staff search must return an empty result'
);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000001002', false);
select test.assert_raises('FORBIDDEN', 'select * from public.admin_search_staff_directory_v1(''staff'')');
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000001004', false);
select test.assert_raises('FORBIDDEN', 'select * from public.admin_search_staff_directory_v1(''staff'')');
select test.assert_raises('FORBIDDEN', 'select * from public.admin_get_staff_directory()');

-- Admin 从平台 SSOT 库存原子划拨一盒，写同一库存表、流水和员工审计。
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000001001', false);
create temporary table staff_allocation_result as
select public.allocate_codes_to_staff_v1('00000000-0000-0000-0000-000000001004', 1) as result;
select test.assert_true(
  (select result = '{"ok":true,"allocatedCount":1}'::jsonb from staff_allocation_result),
  'staff allocation must return exactly ok and allocatedCount'
);
select test.assert_true(
  (select count(*) = 1 from public.box_codes
   where coach_id = '00000000-0000-0000-0000-000000001004'
     and inventory_status = 'coach' and state = 'unused'),
  'one platform code must move to the staff holder in box_codes'
);
select test.assert_true(
  (select allocated_count = 1 and available_count = 1 from public.coach_inventory
   where coach_id = '00000000-0000-0000-0000-000000001004'),
  'staff allocation must reuse coach_inventory SSOT'
);
select test.assert_true(
  (select count(*) = 1 from public.inventory_logs
   where event_type = 'staff_allocated' and coach_id = '00000000-0000-0000-0000-000000001004' and quantity = 1),
  'staff allocation must append one inventory log'
);
select test.assert_true(
  (select count(*) = 1 from public.staff_rbac_audit
   where action = 'staff_inventory_allocated' and target_id = '00000000-0000-0000-0000-000000001004' and result = 'success'),
  'staff allocation must append one success audit'
);

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000001004', false);
select test.assert_true(
  (public.get_coach_inventory_v3() ->> 'availableCount')::integer = 1,
  'staff must read own allocated inventory through the v3 wrapper'
);
select test.assert_true(
  (select can_manage_inventory from public.get_my_access_profile()),
  'staff access profile must expose only the newly allowed own-inventory capability'
);
select test.assert_raises('FORBIDDEN', 'select public.allocate_codes_to_staff_v1(''00000000-0000-0000-0000-000000001004'', 1)');
select test.assert_raises('FORBIDDEN', 'select public.allocate_codes_to_coach(''00000000-0000-0000-0000-000000001007'', 1)');
select test.assert_raises(
  'FORBIDDEN',
  'select public.admin_set_staff_role(''other-staff@example.test'', true, 1, ''staff-self-manage'')'
);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000001006', false);
select test.assert_true(
  (public.get_my_code_inventory() ->> 'availableCount')::integer = 0
    and public.get_my_code_inventory() -> 'codes' = '[]'::jsonb,
  'another staff must not read the allocated staff inventory'
);

-- 库存不足、非法数量、无效目标均整体回滚。
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000001001', false);
create temporary table staff_allocation_rollback_baseline as
select
  (select count(*) from public.box_codes where inventory_status = 'platform' and state = 'unused') as platform_count,
  (select count(*) from public.inventory_logs where event_type = 'staff_allocated') as log_count,
  (select count(*) from public.staff_rbac_audit where action = 'staff_inventory_allocated') as audit_count;
select test.assert_raises(
  'INVENTORY_INSUFFICIENT',
  'select public.allocate_codes_to_staff_v1(''00000000-0000-0000-0000-000000001004'', 1000000)'
);
select test.assert_true(
  (select count(*) from public.box_codes where inventory_status = 'platform' and state = 'unused')
    = (select platform_count from staff_allocation_rollback_baseline)
    and (select count(*) from public.inventory_logs where event_type = 'staff_allocated')
      = (select log_count from staff_allocation_rollback_baseline)
    and (select count(*) from public.staff_rbac_audit where action = 'staff_inventory_allocated')
      = (select audit_count from staff_allocation_rollback_baseline)
    and (select available_count = 1 from public.coach_inventory where coach_id = '00000000-0000-0000-0000-000000001004'),
  'insufficient staff allocation must roll back codes, inventory, logs and audit'
);
select test.assert_raises('INVALID_ALLOCATION', 'select public.allocate_codes_to_staff_v1(''00000000-0000-0000-0000-000000001004'', 0)');
select test.assert_raises('INVALID_ALLOCATION', 'select public.allocate_codes_to_staff_v1(''00000000-0000-0000-0000-000000001004'', -1)');
select test.assert_raises('STAFF_NOT_FOUND', 'select public.allocate_codes_to_staff_v1(''00000000-0000-0000-0000-000000001007'', 1)');
select test.assert_raises('STAFF_NOT_FOUND', 'select public.allocate_codes_to_staff_v1(''00000000-0000-0000-0000-000000001005'', 1)');

-- 直营 staff 仅可向当前分配教练的当前营员直推，终审仍由 Admin 完成且归属 coach。
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000001004', false);
create temporary table staff_push_context as
select code_id, version from public.box_codes
where coach_id = '00000000-0000-0000-0000-000000001004' and state = 'unused'
order by created_at, code_id limit 1;
create temporary table staff_push_result as
select public.coach_push_code_v1(
  '00000000-0000-0000-0000-000000003001',
  (select code_id from staff_push_context),
  'staff-assigned-push'
) as result;
select test.assert_true(
  (select result ->> 'state' = 'pending_review' from staff_push_result),
  'staff must push an own code to a current camper in the assigned coach scope'
);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000001001', false);
select test.assert_true(
  public.admin_review_box_code_activation_v2(
    (select (result ->> 'activationId')::uuid from staff_push_result),
    'approved', '00000000-0000-0000-0000-000000001004', 'TEST/STAFF_PUSH', null, null,
    (select version + 1 from staff_push_context), 1
  ) ->> 'state' = 'active',
  'Admin must approve a staff-held push while preserving the assigned coach holder selection'
);
select test.assert_true(
  (select target_referrer_id = '00000000-0000-0000-0000-000000001007'
   from public.code_activations
   where activation_id = (select (result ->> 'activationId')::uuid from staff_push_result)),
  'staff push approval must preserve the camper current coach relation, not reassign to staff'
);
select test.assert_true(
  (select available_count = 0 from public.coach_inventory where coach_id = '00000000-0000-0000-0000-000000001004'),
  'staff push approval must decrement the staff holder inventory exactly once'
);

-- 另拨一盒用于越范围拒绝；不得创建目标申请或消耗库存。
select public.allocate_codes_to_staff_v1('00000000-0000-0000-0000-000000001004', 1);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000001004', false);
create temporary table staff_outside_context as
select code_id from public.box_codes
where coach_id = '00000000-0000-0000-0000-000000001004' and state = 'unused'
order by created_at, code_id limit 1;
select test.assert_true(
  public.coach_push_code_v1(
    '00000000-0000-0000-0000-000000003002',
    (select code_id from staff_outside_context),
    'staff-outside-push'
  ) ->> 'errorCode' = 'FORBIDDEN',
  'staff must not push to a camper outside current assignments'
);
select test.assert_true(
  not exists (select 1 from public.code_activations where auth_user_id = '00000000-0000-0000-0000-000000001009')
    and (select state = 'unused' from public.box_codes where code_id = (select code_id from staff_outside_context)),
  'out-of-scope staff push must not create an activation or consume the code'
);

-- 他人码不可见不可用；教练原有本人库存和直推路径保持不回归。
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000001001', false);
select public.allocate_codes_to_staff_v1('00000000-0000-0000-0000-000000001006', 1);
select public.allocate_codes_to_coach('00000000-0000-0000-0000-000000001007', 1);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000001004', false);
select test.assert_true(
  public.coach_push_code_v1(
    '00000000-0000-0000-0000-000000003001',
    (select code_id from public.box_codes where coach_id = '00000000-0000-0000-0000-000000001006' and state = 'unused' limit 1),
    'staff-other-code-push'
  ) ->> 'errorCode' = 'CODE_NOT_AVAILABLE',
  'staff must not use another staff holder code'
);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000001007', false);
select test.assert_true(
  (public.get_coach_inventory_v3() ->> 'availableCount')::integer = 1,
  'coach own-inventory path must remain available'
);
select test.assert_true(
  public.coach_push_code_v1(
    '00000000-0000-0000-0000-000000003003',
    (select code_id from public.box_codes where coach_id = '00000000-0000-0000-0000-000000001007' and state = 'unused' limit 1),
    'coach-original-push'
  ) ->> 'state' = 'pending_review',
  'coach original direct-push path must not regress'
);

-- pgcrypto 仅安装在 extensions 时，两个在审入口必须真实解密且保持各自脱敏契约。
create temporary table final_coach_pending_result as
select row_to_json(r)::jsonb as result
from public.get_coach_pending_reviews() r;
select test.assert_true(
  (select count(*) = 1 from final_coach_pending_result),
  'coach pending RPC must decrypt and return the original coach pending row'
);
select test.assert_true(
  (select result ->> 'code' = (
    select pgp_sym_decrypt(b.code_ciphertext, 'final-clearance-test-pepper')
    from public.box_codes b
    where b.code_id = (select (result ->> 'code_id')::uuid from final_coach_pending_result)
  ) and result ->> 'entry_path' = 'coach_push'
    and (select count(*) = 5 from jsonb_object_keys(result))
    and not result ? 'auth_user_id'
  from final_coach_pending_result),
  'coach pending RPC must preserve the exact five-field scoped code contract'
);

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000001001', false);
create temporary table final_admin_pending_result as
select row_to_json(r)::jsonb as result
from public.admin_get_pending_box_code_reviews() r;
select test.assert_true(
  (select count(*) = 1 from final_admin_pending_result),
  'Admin pending RPC must decrypt and return the real pending row'
);
select test.assert_true(
  (select result ->> 'code_masked' = (
    select left(pgp_sym_decrypt(b.code_ciphertext, 'final-clearance-test-pepper'), 6)
      || '…' || right(pgp_sym_decrypt(b.code_ciphertext, 'final-clearance-test-pepper'), 4)
    from public.box_codes b
    where b.code_id = (select (result ->> 'code_id')::uuid from final_admin_pending_result)
  ) and result ->> 'code_masked' <> (
    select pgp_sym_decrypt(b.code_ciphertext, 'final-clearance-test-pepper')
    from public.box_codes b
    where b.code_id = (select (result ->> 'code_id')::uuid from final_admin_pending_result)
  ) and (select count(*) = 11 from jsonb_object_keys(result))
    and not result ? 'code'
  from final_admin_pending_result),
  'Admin pending RPC must return only the established masked code and eleven fields'
);

-- 全量迁移后的所有 pgcrypto RPC 必须固定扩展路径；以下为当前完整命中清单。
select test.assert_extension_search_path('admin_assign_staff_coach');
select test.assert_extension_search_path('admin_get_pending_box_code_reviews');
select test.assert_extension_search_path('admin_review_box_code_activation');
select test.assert_extension_search_path('admin_revoke_staff_coach');
select test.assert_extension_search_path('admin_set_coach_role');
select test.assert_extension_search_path('admin_set_staff_role');
select test.assert_extension_search_path('coach_push_code_v1');
select test.assert_extension_search_path('generate_platform_codes');
select test.assert_extension_search_path('get_coach_pending_reviews');
select test.assert_extension_search_path('get_my_code_inventory');
select test.assert_extension_search_path('request_box_code_activation');
select test.assert_true(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ~* '(^|[^a-z0-9_])(pgp_sym_decrypt|pgp_sym_encrypt|digest|gen_random_bytes|gen_random_uuid|encode|decode|hmac)[[:space:]]*\('
      and not exists (
        select 1 from pg_options_to_table(p.proconfig) option
        where option.option_name = 'search_path'
          and option.option_value = 'public, extensions, pg_temp'
      )
  ),
  'every final public RPC calling pgcrypto must use public, extensions, pg_temp'
);
select test.assert_authenticated_only('public.admin_assign_staff_coach(uuid,uuid,integer,text)');
select test.assert_authenticated_only('public.admin_get_pending_box_code_reviews()');
select test.assert_authenticated_only('public.admin_review_box_code_activation(uuid,text,text,text,text,integer,integer)');
select test.assert_authenticated_only('public.admin_revoke_staff_coach(uuid,integer,text)');
select test.assert_authenticated_only('public.admin_set_coach_role(text,boolean,integer,text)');
select test.assert_authenticated_only('public.get_coach_pending_reviews()');
select test.assert_authenticated_only('public.request_box_code_activation(text,text,text)');

select test.assert_extension_search_path('admin_search_staff_directory_v1');
select test.assert_extension_search_path('allocate_codes_to_staff_v1');
select test.assert_extension_search_path('get_my_code_inventory');
select test.assert_extension_search_path('coach_push_code_v1');
select test.assert_extension_search_path('admin_review_box_code_activation_v2');
select test.assert_authenticated_only('public.admin_search_staff_directory_v1(text)');
select test.assert_authenticated_only('public.allocate_codes_to_staff_v1(uuid,integer)');
select test.assert_authenticated_only('public.get_my_code_inventory()');
select test.assert_authenticated_only('public.coach_push_code_v1(uuid,uuid,text)');

select 'PASS: direct-staff search, allocation, scoped push and coach regression behavior' as result;
