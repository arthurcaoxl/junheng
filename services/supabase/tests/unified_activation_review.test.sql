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
\ir ../migrations/20261109153000_coach_camp_trends.sql
\ir ../migrations/20261109154000_coach_ssot_vault.sql

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

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'coach@example.test'),
  ('00000000-0000-0000-0000-000000000003', 'inactive-coach@example.test'),
  ('00000000-0000-0000-0000-000000000004', 'staff@example.test'),
  ('00000000-0000-0000-0000-000000000005', 'ordinary@example.test'),
  ('00000000-0000-0000-0000-000000000101', 'history-pending@example.test'),
  ('00000000-0000-0000-0000-000000000102', 'history-approved@example.test'),
  ('00000000-0000-0000-0000-000000000103', 'history-rejected@example.test'),
  ('00000000-0000-0000-0000-000000000201', 'manual@example.test'),
  ('00000000-0000-0000-0000-000000000202', 'coach-camper@example.test'),
  ('00000000-0000-0000-0000-000000000203', 'inactive-camper@example.test'),
  ('00000000-0000-0000-0000-000000000204', 'staff-camper@example.test'),
  ('00000000-0000-0000-0000-000000000205', 'ordinary-camper@example.test');

insert into public.camp_admins (email, auth_user_id, role, is_active) values
  ('admin@example.test', '00000000-0000-0000-0000-000000000001', 'admin', true),
  ('coach@example.test', '00000000-0000-0000-0000-000000000002', 'coach', true),
  ('inactive-coach@example.test', '00000000-0000-0000-0000-000000000003', 'coach', false),
  ('staff@example.test', '00000000-0000-0000-0000-000000000004', 'staff', true);

insert into vault.decrypted_secrets (name, decrypted_secret)
values ('box_code_pepper', 'vault-test-pepper');
select set_config('app.box_code_pepper', 'wrong-guc-pepper', false);

insert into public.checkin_sync (auth_user_id, user_code, start_date, records) values
  ('00000000-0000-0000-0000-000000000201', 'JH-M0001', current_date, '{}'::jsonb);

insert into public.user_coach_relation (
  relation_id, auth_user_id, camper_code, referrer_id, reason
) values
  ('00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000000202', 'JH-C0002', '00000000-0000-0000-0000-000000000002', 'activation'),
  ('00000000-0000-0000-0000-000000003002', '00000000-0000-0000-0000-000000000203', 'JH-C0003', '00000000-0000-0000-0000-000000000003', 'activation'),
  ('00000000-0000-0000-0000-000000003003', '00000000-0000-0000-0000-000000000204', 'JH-C0004', '00000000-0000-0000-0000-000000000004', 'activation'),
  ('00000000-0000-0000-0000-000000003004', '00000000-0000-0000-0000-000000000205', 'JH-C0005', '00000000-0000-0000-0000-000000000005', 'activation');

insert into public.coach_inventory (coach_id, allocated_count, available_count) values
  ('00000000-0000-0000-0000-000000000002', 10, 10),
  ('00000000-0000-0000-0000-000000000003', 10, 10),
  ('00000000-0000-0000-0000-000000000004', 10, 10),
  ('00000000-0000-0000-0000-000000000005', 10, 10);

-- 历史 pending：码版本 2、申请版本 1。
insert into public.box_codes (
  code_id, code_hash, code_type, code_format, state, coach_id, case_id,
  max_checkins, used_checkins, box_spec, inventory_status, code_ciphertext, version
) values
  ('00000000-0000-0000-0000-000000001001', encode(hmac('JH-EL-HP01', 'vault-test-pepper', 'sha256'), 'hex'), 'experience', 'short', 'pending_review', '00000000-0000-0000-0000-000000000002', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-HP01', 'vault-test-pepper'), 2),
  ('00000000-0000-0000-0000-000000001002', encode(hmac('JH-EL-HA02', 'vault-test-pepper', 'sha256'), 'hex'), 'experience', 'short', 'pending_review', '00000000-0000-0000-0000-000000000002', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-HA02', 'vault-test-pepper'), 1),
  ('00000000-0000-0000-0000-000000001003', encode(hmac('JH-EL-HR03', 'vault-test-pepper', 'sha256'), 'hex'), 'experience', 'short', 'revoked', '00000000-0000-0000-0000-000000000002', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-HR03', 'vault-test-pepper'), 1),
  ('00000000-0000-0000-0000-000000001004', encode(hmac('JH-EL-HR04', 'vault-test-pepper', 'sha256'), 'hex'), 'experience', 'short', 'unused', '00000000-0000-0000-0000-000000000002', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-HR04', 'vault-test-pepper'), 1);

insert into public.code_activations (
  activation_id, code_id, auth_user_id, camper_code, expected_code_type,
  shipment_verification_ref, payment_verification_ref, review_state,
  target_referrer_id, decided_by, decided_at, rejection_reason_code,
  replacement_code_id, activated_at, expected_code_format, version
) values
  ('00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000101', 'JH-H0001', 'experience', null, null, 'pending', null, null, null, null, null, null, 'short', 1),
  ('00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000102', 'JH-H0002', 'experience', 'HISTORY/APPROVED', null, 'approved', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', now(), null, null, now(), 'short', 3),
  ('00000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000000103', 'JH-H0003', 'experience', null, null, 'rejected', null, '00000000-0000-0000-0000-000000000001', now(), 'HISTORY_REJECTED', '00000000-0000-0000-0000-000000001004', null, 'short', 3);
update public.box_codes
set state = 'active', activation_id = '00000000-0000-0000-0000-000000002002',
    version = 2, updated_at = now()
where code_id = '00000000-0000-0000-0000-000000001002';

insert into public.box_code_events (event_type, code_id, activation_id, actor_auth_user_id) values
  ('CodeActivationRequested', '00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000000101'),
  ('CodeActivationRequested', '00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000000102'),
  ('CodeActivationRequested', '00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000000002');

create temporary table test_history_versions as
select activation_id, version from public.code_activations;

-- 新申请使用的 unused 码。
insert into public.box_codes (
  code_id, code_hash, code_type, code_format, state, coach_id, case_id,
  max_checkins, used_checkins, box_spec, inventory_status, code_ciphertext
) values
  ('00000000-0000-0000-0000-000000001005', encode(hmac('JH-EL-MN55', 'vault-test-pepper', 'sha256'), 'hex'), 'experience', 'short', 'unused', '00000000-0000-0000-0000-000000000002', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-MN55', 'vault-test-pepper')),
  ('00000000-0000-0000-0000-000000001006', encode(hmac('JH-EL-CP66', 'vault-test-pepper', 'sha256'), 'hex'), 'experience', 'short', 'unused', '00000000-0000-0000-0000-000000000002', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-CP66', 'vault-test-pepper')),
  ('00000000-0000-0000-0000-000000001007', encode(hmac('JH-EL-CI07', 'vault-test-pepper', 'sha256'), 'hex'), 'experience', 'short', 'unused', '00000000-0000-0000-0000-000000000003', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-CI07', 'vault-test-pepper')),
  ('00000000-0000-0000-0000-000000001008', encode(hmac('JH-EL-CS08', 'vault-test-pepper', 'sha256'), 'hex'), 'experience', 'short', 'unused', '00000000-0000-0000-0000-000000000004', gen_random_uuid(), 21, 0, '21_bags', 'coach', pgp_sym_encrypt('JH-EL-CS08', 'vault-test-pepper'));

\ir ../migrations/20261109156000_unified_activation_review.sql

select test.assert_true(
  (select count(*) = 3 from public.code_activations a
   join test_history_versions h on h.activation_id = a.activation_id
   where a.request_source is not null and a.version = h.version),
  'history backfill must cover pending/approved/rejected without changing versions'
);
select test.assert_true(
  (select request_source = 'manual_code' from public.code_activations
   where activation_id = '00000000-0000-0000-0000-000000002001'),
  'pending history should retain manual source'
);
select test.assert_true(
  (select request_source = 'manual_code' from public.code_activations
   where activation_id = '00000000-0000-0000-0000-000000002002'),
  'approved history should retain manual source and version'
);
select test.assert_true(
  (select request_source = 'coach_push' from public.code_activations
   where activation_id = '00000000-0000-0000-0000-000000002003'),
  'rejected history should retain coach push source and version'
);
select test.assert_true(
  (select tgenabled = 'O' from pg_trigger
   where tgname = 'code_activation_mutation_guard' and tgrelid = 'public.code_activations'::regclass),
  'legacy version guard must be restored immediately after controlled backfill'
);
select test.assert_raises(
  'CODE_ACTIVATION_IDENTITY_IMMUTABLE',
  'update public.code_activations set request_source = ''coach_push'', version = version + 1 where activation_id = ''00000000-0000-0000-0000-000000002001'''
);
select test.assert_true(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosrc ilike '%current_setting(''app.box_code_pepper''%'
  ),
  'combined final functions must not contain the pepper GUC fallback'
);
select test.assert_true(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'activate_box_code'
      and pg_get_function_identity_arguments(p.oid) in ('text, text', 'text, integer, integer, text')
  ),
  'both legacy self-service activation signatures must be absent'
);
select test.assert_true(
  not has_function_privilege('authenticated', 'public.admin_review_box_code_activation(uuid,text,text,text,text,integer,integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.admin_review_box_code_activation_v2(uuid,text,uuid,text,text,text,integer,integer)', 'EXECUTE'),
  'only the ownership-checking v2 review may remain executable by authenticated'
);

-- 手动入口：错误 GUC 不得覆盖 Vault；同键重放与异载荷冲突保持 JSON 语义。
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000201', false);
select b.state,
  b.code_hash = encode(hmac('JH-EL-MN55', 'vault-test-pepper', 'sha256'), 'hex') as hash_matches,
  'JH-EL-MN55' ~ '^JH-(EL|RC)-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$' as format_matches
from public.box_codes b where b.code_id = '00000000-0000-0000-0000-000000001005';
create temporary table test_manual_result as
select public.request_box_code_activation('JH-EL-MN55', 'manual-key', 'manual-device') as result;
select result as manual_rpc_result from test_manual_result;
select test.assert_true(
  (select result ->> 'state' = 'pending_review' from test_manual_result),
  'manual request should create pending using Vault despite wrong GUC'
);
select test.assert_true(
  (select request_source = 'manual_code' from public.code_activations
   where activation_id = (select (result ->> 'activationId')::uuid from test_manual_result)),
  'manual request should persist its source'
);
select test.assert_true(
  (select metadata ->> 'requestSource' = 'manual_code' from public.box_code_events
   where activation_id = (select (result ->> 'activationId')::uuid from test_manual_result)
     and event_type = 'CodeActivationRequested'),
  'manual request event should carry its source'
);
select test.assert_true(
  public.request_box_code_activation('JH-EL-MN55', 'manual-key', 'manual-device') ->> 'replayed' = 'true',
  'manual same-key replay should return the original result'
);
select test.assert_true(
  public.request_box_code_activation('JH-EL-HP01', 'manual-key', 'manual-device') ->> 'errorCode' = 'IDEMPOTENCY_CONFLICT',
  'manual same-key different payload should conflict'
);

-- 有效 coach 成功；停用 coach、staff 和普通用户在 Vault／目标读取前拒绝。
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000002', false);
create temporary table test_push_result as
select public.coach_push_code_v1(
  '00000000-0000-0000-0000-000000003001',
  '00000000-0000-0000-0000-000000001006',
  'push-key'
) as result;
select test.assert_true(
  (select result ->> 'state' = 'pending_review' from test_push_result),
  'active coach should create pending for own current camper'
);
select test.assert_true(
  (select request_source = 'coach_push' from public.code_activations
   where activation_id = (select (result ->> 'activationId')::uuid from test_push_result)),
  'coach push should persist its source'
);
select test.assert_true(
  public.coach_push_code_v1('00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000001006', 'push-key') ->> 'replayed' = 'true',
  'coach same-key replay should return the original result'
);
select test.assert_true(
  public.coach_push_code_v1('00000000-0000-0000-0000-000000003002', '00000000-0000-0000-0000-000000001006', 'push-key') ->> 'errorCode' = 'IDEMPOTENCY_CONFLICT',
  'coach same-key different payload should conflict'
);

delete from vault.decrypted_secrets where name = 'box_code_pepper';
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000003', false);
select test.assert_true(
  public.coach_push_code_v1('00000000-0000-0000-0000-000000003002', '00000000-0000-0000-0000-000000001007', 'inactive-key') ->> 'errorCode' = 'FORBIDDEN',
  'inactive coach should be forbidden before Vault and despite retained relation and inventory'
);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000005', false);
select test.assert_true(
  public.coach_push_code_v1(gen_random_uuid(), gen_random_uuid(), 'ordinary-key') ->> 'errorCode' = 'FORBIDDEN',
  'ordinary user should be forbidden before target lookup'
);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000004', false);
select test.assert_true(
  public.coach_push_code_v1('00000000-0000-0000-0000-000000003003', '00000000-0000-0000-0000-000000001008', 'staff-key') ->> 'errorCode' = 'FORBIDDEN',
  'staff denial should return JSON rather than rollback'
);
select test.assert_true(
  (select count(*) = 1 from public.staff_rbac_audit
   where actor_id = '00000000-0000-0000-0000-000000000004'
     and action = 'staff_finance_denied' and metadata ->> 'operation' = 'coach_push_code_v1'),
  'staff JSON denial should commit its audit row'
);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000002', false);
select test.assert_true(
  public.coach_push_code_v1('00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000001006', 'active-missing-vault') ->> 'errorCode' = 'BOX_CODE_PEPPER_NOT_CONFIGURED',
  'active coach should reach the unified Vault guard'
);
insert into vault.decrypted_secrets (name, decrypted_secret)
values ('box_code_pepper', 'vault-test-pepper');

-- staff／普通用户不能终审；Admin 分别拒绝手动单、通过直推单并保留来源审计。
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000004', false);
select test.assert_raises(
  'FORBIDDEN',
  'select public.admin_review_box_code_activation_v2((select (result ->> ''activationId'')::uuid from test_manual_result), ''approved'', ''00000000-0000-0000-0000-000000000002'', ''SHIP/MANUAL'', null, null, 2, 1)'
);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000005', false);
select test.assert_raises(
  'FORBIDDEN',
  'select public.admin_review_box_code_activation_v2((select (result ->> ''activationId'')::uuid from test_manual_result), ''approved'', ''00000000-0000-0000-0000-000000000002'', ''SHIP/MANUAL'', null, null, 2, 1)'
);

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000001', false);
select test.assert_true(
  public.admin_review_box_code_activation_v2(
    (select (result ->> 'activationId')::uuid from test_manual_result),
    'rejected', '00000000-0000-0000-0000-000000000002', null, null,
    'MANUAL_REJECTED', 2, 1
  ) ->> 'state' = 'revoked',
  'Admin should reject the manual pending request through the sole v2 review'
);
select test.assert_true(
  (select metadata ->> 'requestSource' = 'manual_code' from public.audit_logs
   where target_id = (select (result ->> 'activationId')::uuid from test_manual_result)
     and action = 'code_activation_rejected'),
  'rejection audit should retain manual source'
);
select test.assert_true(
  public.admin_review_box_code_activation_v2(
    (select (result ->> 'activationId')::uuid from test_push_result),
    'approved', '00000000-0000-0000-0000-000000000002', 'SHIP/PUSH', null, null, 2, 1
  ) ->> 'state' = 'active',
  'Admin should approve the coach pending request through the sole v2 review'
);
select test.assert_true(
  (select metadata ->> 'requestSource' = 'coach_push' from public.audit_logs
   where target_id = (select (result ->> 'activationId')::uuid from test_push_result)
     and action = 'code_activation_approved'),
  'approval audit should retain coach push source'
);
select test.assert_true(
  (select available_count = 9 from public.coach_inventory
   where coach_id = '00000000-0000-0000-0000-000000000002'),
  'only final approval should decrement coach inventory once'
);

select 'PASS: unified activation review combined behavior (30 assertions)' as result;
