\set QUIET on
set client_min_messages = warning;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  phone text
);
create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.test_auth_uid', true), '')::uuid;
$$;
create function auth.jwt()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object('email', nullif(current_setting('app.test_jwt_email', true), ''));
$$;
create role anon;
create role authenticated;

create schema vault;
create table vault.decrypted_secrets (
  name text primary key,
  decrypted_secret text
);

\ir ../migrations/20261030100000_admin_checkin_overview.sql
\ir ../migrations/20261101090000_checkin_bmi_profile.sql
\ir ../migrations/20261106130000_box_code_activation.sql
\ir ../migrations/20261106150000_activate_box_code.sql
\ir ../migrations/20261106160000_get_coach_radar_v1.sql
\ir ../migrations/20261107120000_verify_checkin.sql
\ir ../migrations/20261108120000_code_pool_inventory.sql
\ir ../migrations/20261108130000_manual_review_trusteeship.sql
\ir ../migrations/20261108140000_activation_request_rate_limit.sql
\ir ../migrations/20261108224000_user_coach_contact.sql
\ir ../migrations/20261108230000_admin_coach_directory.sql
\ir ../migrations/20261109094500_p0_rbac_vault.sql
\ir ../migrations/20261109120000_admin_staff_rbac.sql
\ir ../migrations/20261109120000_coach_workflows.sql

set client_min_messages = notice;
create schema test;
create function test.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION_FAILED: %', p_message;
  end if;
end;
$$;
create function test.assert_raises(p_expected text, p_sql text)
returns void
language plpgsql
as $$
declare
  v_message text;
begin
  execute p_sql;
  raise exception 'ASSERTION_FAILED: expected %, but statement succeeded', p_expected;
exception
  when others then
    get stacked diagnostics v_message = message_text;
    if v_message = p_expected then
      return;
    end if;
    raise exception 'ASSERTION_FAILED: expected %, got %', p_expected, v_message;
end;
$$;

insert into auth.users (id, email, raw_user_meta_data, phone) values
  ('00000000-0000-0000-0000-000000000001', 'admin@example.test', '{"full_name":"Admin"}', null),
  ('00000000-0000-0000-0000-000000000002', 'legacy-new@example.test', '{"full_name":"Legacy New"}', null),
  ('00000000-0000-0000-0000-000000000003', 'legacy-inactive@example.test', '{"name":"Legacy Inactive"}', null),
  ('00000000-0000-0000-0000-000000000004', 'legacy-staff@example.test', '{}', null),
  ('00000000-0000-0000-0000-000000000005', 'new-coach@example.test', '{"full_name":"New Coach"}', '13000000005'),
  ('00000000-0000-0000-0000-000000000006', 'staff@example.test', '{}', null),
  ('00000000-0000-0000-0000-000000000007', 'ordinary@example.test', '{}', null),
  ('00000000-0000-0000-0000-000000000008', 'platform@example.test', '{}', null),
  ('00000000-0000-0000-0000-000000000101', 'legacy-camper-1@example.test', '{}', null),
  ('00000000-0000-0000-0000-000000000102', 'legacy-camper-2@example.test', '{}', null),
  ('00000000-0000-0000-0000-000000000103', 'legacy-camper-3@example.test', '{}', null),
  ('00000000-0000-0000-0000-000000000104', 'platform-camper@example.test', '{}', null),
  ('00000000-0000-0000-0000-000000000201', 'new-camper@example.test', '{}', null);

insert into public.camp_admins (email, auth_user_id, role, is_active) values
  ('admin@example.test', '00000000-0000-0000-0000-000000000001', 'admin', true),
  ('legacy-inactive@example.test', '00000000-0000-0000-0000-000000000003', 'coach', false),
  ('legacy-staff@example.test', '00000000-0000-0000-0000-000000000004', 'staff', true);
insert into public.user_coach_relation (auth_user_id, camper_code, referrer_id, reason) values
  ('00000000-0000-0000-0000-000000000101', 'JH-L0001', '00000000-0000-0000-0000-000000000002', 'activation'),
  ('00000000-0000-0000-0000-000000000102', 'JH-L0002', '00000000-0000-0000-0000-000000000003', 'activation'),
  ('00000000-0000-0000-0000-000000000103', 'JH-L0003', '00000000-0000-0000-0000-000000000004', 'activation'),
  ('00000000-0000-0000-0000-000000000104', 'JH-L0004', '00000000-0000-0000-0000-000000000008', 'dormancy_trusteeship');
insert into public.system_configs (config_key, config_value) values
  ('platform_official_account_id', '"00000000-0000-0000-0000-000000000008"'::jsonb);

\ir ../migrations/20261109154000_coach_ssot_vault.sql

select test.assert_true(
  (select role = 'coach' and is_active from public.camp_admins
   where auth_user_id = '00000000-0000-0000-0000-000000000002'),
  'migration should backfill a coach with current campers and no role row'
);
select test.assert_true(
  not exists (select 1 from public.camp_admins
    where auth_user_id = '00000000-0000-0000-0000-000000000008'),
  'configured platform account must not be backfilled as a coach from relations'
);
select test.assert_true(
  (select role = 'coach' and is_active and version = 2 from public.camp_admins
   where auth_user_id = '00000000-0000-0000-0000-000000000003'),
  'migration should reactivate and version an existing inactive coach row'
);
select test.assert_true(
  (select role = 'staff' and is_active from public.camp_admins
   where auth_user_id = '00000000-0000-0000-0000-000000000004'),
  'migration must not downgrade staff even when current relations exist'
);
insert into public.coach_lifecycles (coach_id, state, dormant_at)
values ('00000000-0000-0000-0000-000000000004', 'dormant', now());
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000001', false);
select test.assert_true(
  not exists (
    select 1 from public.admin_get_dormant_coaches()
    where coach_id = '00000000-0000-0000-0000-000000000004'
  ),
  'dormant coach enumeration must not treat a staff lifecycle row as coach identity'
);
select p.proname, pg_get_function_identity_arguments(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosrc ilike '%current_setting(''app.box_code_pepper''%';
select test.assert_true(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ilike '%current_setting(''app.box_code_pepper''%'
  ),
  'no active public function may read the pepper GUC'
);

insert into public.system_configs (config_key, config_value) values
  ('box_code_expiry_policy', '{"default_expires_at":"2030-01-02T03:04:05+00:00"}'::jsonb)
on conflict (config_key) do update set config_value = excluded.config_value;
insert into vault.decrypted_secrets (name, decrypted_secret)
values ('box_code_pepper', 'vault-test-pepper');
select set_config('app.box_code_pepper', 'wrong-guc-pepper', false);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000001', false);

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000007', false);
select test.assert_raises(
  'FORBIDDEN',
  'select public.admin_set_coach_role(''new-coach@example.test'', true, 0, ''coach-create'')'
);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000001', false);
select public.admin_set_coach_role('new-coach@example.test', true, 0, 'coach-create');
select test.assert_true(
  (select version = 1 and role = 'coach' and is_active from public.camp_admins
   where auth_user_id = '00000000-0000-0000-0000-000000000005'),
  'admin should create an active coach at version 1'
);
select test.assert_true(
  (select count(*) = 1 from public.staff_rbac_audit
   where target_id = '00000000-0000-0000-0000-000000000005'
     and target_role = 'coach' and result = 'success'),
  'successful coach creation should write exactly one audit row'
);
select test.assert_true(
  (public.admin_set_coach_role('new-coach@example.test', true, 0, 'coach-create') ->> 'version')::integer = 1,
  'same idempotency key and payload should replay the original result'
);
select test.assert_true(
  (select count(*) = 1 from public.staff_rbac_audit
   where target_id = '00000000-0000-0000-0000-000000000005'
     and target_role = 'coach' and result = 'success'),
  'idempotent replay must not duplicate success audit'
);
select test.assert_raises(
  'IDEMPOTENCY_CONFLICT',
  'select public.admin_set_coach_role(''new-coach@example.test'', false, 0, ''coach-create'')'
);
select test.assert_raises(
  'ROLE_VERSION_CONFLICT',
  'select public.admin_set_coach_role(''new-coach@example.test'', false, 0, ''coach-stale'')'
);
select test.assert_raises(
  'ROLE_ASSIGNMENT_CONFLICT',
  'select public.admin_set_coach_role(''admin@example.test'', true, 1, ''coach-admin-downgrade'')'
);

insert into public.user_profiles (auth_user_id, phone)
values ('00000000-0000-0000-0000-000000000005', '13100000005');
insert into public.coach_contact_profiles (coach_id, phone, wechat)
values ('00000000-0000-0000-0000-000000000005', '13100000005', 'new-coach-wechat');

select test.assert_true(
  (select count(*) = 1 from public.admin_get_coach_directory('new-coach')
   where coach_id = '00000000-0000-0000-0000-000000000005'
     and name = 'New Coach' and phone = '13100000005'),
  'zero-camper coach should be searchable with Admin-only contact fields'
);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000007', false);
select test.assert_raises('FORBIDDEN', 'select * from public.admin_get_coach_directory(''new-coach'')');
select test.assert_raises(
  'FORBIDDEN',
  'select public.admin_set_coach_role(''ordinary@example.test'', true, 0, ''ordinary-self-coach'')'
);

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000005', false);
select test.assert_true(
  (select role = 'coach' and can_manage_inventory from public.get_my_access_profile()) ,
  'zero-camper coach should read coach access profile'
);
select test.assert_true(
  (select count(*) = 0 from public.get_coach_radar_v1()),
  'zero-camper coach should read an empty radar without an identity error'
);
select test.assert_true(
  (public.get_my_code_inventory() ->> 'availableCount')::integer = 0,
  'zero-camper coach should read an empty inventory'
);
select test.assert_true(
  (public.request_coach_restock_v1('need first box') ->> 'ok')::boolean,
  'zero-camper coach should create a restock request'
);

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000001', false);
select public.admin_set_staff_role('staff@example.test', true, 0, 'staff-create');
select test.assert_true(
  (public.admin_assign_staff_coach(
    '00000000-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000005',
    1,
    'staff-zero-camper-coach'
  ) ->> 'ok')::boolean,
  'staff should be assignable to a zero-camper coach'
);
select test.assert_raises(
  'ROLE_ASSIGNMENT_CONFLICT',
  'select public.admin_set_coach_role(''staff@example.test'', true, 1, ''coach-staff-downgrade'')'
);

-- Vault，而不是错误 GUC，用于真实发码；缺失时各链路统一 fail-closed。
select public.generate_platform_codes(24, '21_bags', 'TEST/VAULT');
select test.assert_true(
  (select count(*) = 24 from public.box_codes),
  'generation should succeed from Vault while the GUC contains a wrong value'
);
select test.assert_true(
  (select b.code_hash = encode(hmac(pgp_sym_decrypt(b.code_ciphertext, 'vault-test-pepper'), 'vault-test-pepper', 'sha256'), 'hex')
   from public.box_codes b limit 1),
  'generated hash and ciphertext should both use the Vault pepper'
);

delete from vault.decrypted_secrets where name = 'box_code_pepper';
select test.assert_raises(
  'BOX_CODE_PEPPER_NOT_CONFIGURED',
  'select public.generate_platform_codes(24, ''21_bags'', ''TEST/MISSING'')'
);
select test.assert_true(
  public.request_box_code_activation('JH-EL-AAAA', 'request-missing-pepper', 'device-missing-pepper') ->> 'errorCode'
    = 'BOX_CODE_PEPPER_NOT_CONFIGURED',
  'manual activation request should report the unified Vault error'
);
select test.assert_true(
  public.activate_box_code('JH-EL-AAAA', 1, 1, 'legacy-missing-pepper') ->> 'errorCode'
    = 'BOX_CODE_PEPPER_NOT_CONFIGURED',
  'legacy activation function should report the unified Vault error'
);
select test.assert_true(
  public.activate_box_code('JH-EL-AAAA', 'legacy-two-arg-missing-pepper') ->> 'errorCode'
    = 'BOX_CODE_PEPPER_NOT_CONFIGURED',
  'two-argument legacy activation should report the unified Vault error'
);
select test.assert_raises(
  'BOX_CODE_PEPPER_NOT_CONFIGURED',
  'select * from public.admin_get_pending_box_code_reviews()'
);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000005', false);
select test.assert_raises(
  'BOX_CODE_PEPPER_NOT_CONFIGURED',
  'select public.get_my_code_inventory()'
);
select test.assert_true(
  public.coach_push_code_v1(gen_random_uuid(), gen_random_uuid(), 'push-missing-pepper') ->> 'errorCode'
    = 'BOX_CODE_PEPPER_NOT_CONFIGURED',
  'coach push should report the unified Vault error'
);
insert into vault.decrypted_secrets (name, decrypted_secret)
values ('box_code_pepper', 'vault-test-pepper');

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000001', false);
select test.assert_true(
  (public.allocate_codes_to_coach('00000000-0000-0000-0000-000000000005', 1) ->> 'ok')::boolean,
  'Admin should allocate to a coach with no campers'
);

insert into public.checkin_sync (auth_user_id, user_code, start_date, records)
values ('00000000-0000-0000-0000-000000000201', 'JH-N0001', current_date, '{}'::jsonb);

create temporary table test_review_context as
select b.code_id, b.version as code_version
from public.box_codes b
where b.coach_id = '00000000-0000-0000-0000-000000000005'
  and b.inventory_status = 'coach' and b.state = 'unused'
order by b.created_at, b.code_id
limit 1;
insert into public.code_activations (
  code_id, auth_user_id, camper_code, expected_code_type, expected_code_format, review_state
)
select code_id, '00000000-0000-0000-0000-000000000201', 'JH-N0001', 'experience', 'short', 'pending'
from test_review_context;
update public.box_codes b
set state = 'pending_review', version = version + 1, updated_at = now()
from test_review_context c
where b.code_id = c.code_id;

select test.assert_true(
  (public.admin_review_box_code_activation_v2(
    (select activation_id from public.code_activations a join test_review_context c on c.code_id = a.code_id),
    'approved',
    '00000000-0000-0000-0000-000000000005',
    'TEST/SHIPMENT',
    null,
    null,
    (select code_version + 1 from test_review_context),
    1
  ) ->> 'state') = 'active',
  'review v2 should accept an active coach even before any current relation exists'
);
select test.assert_true(
  (select count(*) = 1 from public.user_coach_relation
   where auth_user_id = '00000000-0000-0000-0000-000000000201'
     and referrer_id = '00000000-0000-0000-0000-000000000005' and valid_to is null),
  'successful review should create the first current relation'
);

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000005', false);
select test.assert_true(
  (select count(*) = 1 from public.get_coach_radar_v1()),
  'coach radar should use role identity and relation only for camper scope'
);
select test.assert_true(
  (select count(*) = 1 from public.get_coach_campers_v1()),
  'coach camper list should use role identity and relation only for camper scope'
);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000201', false);
select test.assert_true(
  (select phone = '13100000005' and wechat = 'new-coach-wechat' from public.get_my_coach_contact_v1()),
  'camper contact lookup should require an active coach role'
);

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000006', false);
select test.assert_raises('FORBIDDEN', 'select public.get_my_code_inventory()');
select test.assert_raises('FORBIDDEN', 'select * from public.admin_get_coach_directory(''new-coach'')');
select test.assert_true(
  (select count(*) = 1 from public.get_coach_radar_v1()),
  'staff should retain only assigned desensitized radar access'
);

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000001', false);
select test.assert_true(
  (public.admin_set_coach_role('new-coach@example.test', false, 1, 'coach-deactivate') ->> 'version')::integer = 2,
  'Admin should deactivate coach with exact optimistic version'
);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000005', false);
select test.assert_true(
  (select count(*) = 0 from public.get_my_access_profile()),
  'deactivated coach should immediately lose access profile'
);
select test.assert_raises('FORBIDDEN', 'select public.get_my_code_inventory()');
select test.assert_raises('FORBIDDEN', 'select public.request_coach_restock_v1(''after deactivate'')');
select test.assert_raises('FORBIDDEN', 'select * from public.get_coach_campers_v1()');

select 'PASS: coach SSOT and Vault behavior (46 assertions)' as result;
