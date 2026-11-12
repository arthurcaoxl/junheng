\set QUIET on
\pset footer off
set client_min_messages = warning;

\ir ux_flow_test_bootstrap.sql

insert into vault.decrypted_secrets values ('box_code_pepper', 'legacy-checkin-test-pepper');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'coach@legacy-checkin.test'),
  ('00000000-0000-0000-0000-000000000002', 'admin@legacy-checkin.test'),
  ('00000000-0000-0000-0000-000000000101', 'whitelist@legacy-checkin.test'),
  ('00000000-0000-0000-0000-000000000102', 'runtime@legacy-checkin.test'),
  ('00000000-0000-0000-0000-000000000103', 'ordinary@legacy-checkin.test'),
  ('00000000-0000-0000-0000-000000000104', 'fallback@legacy-checkin.test');

insert into public.camp_admins (email, auth_user_id, role, is_active) values
  ('coach@legacy-checkin.test', '00000000-0000-0000-0000-000000000001', 'coach', true),
  ('admin@legacy-checkin.test', '00000000-0000-0000-0000-000000000002', 'admin', true);

insert into public.checkin_sync (auth_user_id, user_code, start_date, records) values
  ('00000000-0000-0000-0000-000000000101', 'LEGACY-WHITE', '2026-11-01', '{"2026-11-01":{"water":true}}'::jsonb),
  ('00000000-0000-0000-0000-000000000102', 'LEGACY-RUNTIME', '2026-11-01', '{"2026-11-01":{"water":true}}'::jsonb),
  ('00000000-0000-0000-0000-000000000103', 'LEGACY-NONE', current_date, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000104', 'LEGACY-FALLBACK', '2026-11-01', '{"2026-11-01":{"water":true}}'::jsonb);

update public.system_configs
set config_value = '["whitelist@legacy-checkin.test", "fallback@legacy-checkin.test"]'::jsonb
where config_key = 'seed_user_whitelist';

insert into public.system_configs (config_key, config_value) values
  ('box_code_expiry_policy', '{"default_expires_at":"2099-01-01T00:00:00+00:00"}'::jsonb);

begin;

set role authenticated;

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000101', false);
create temporary table legacy_first_response as
select public.verify_checkin(
  current_date,
  '{"2026-11-12":{"water":true}}'::jsonb,
  null,
  null
) as response;
select test.assert_true(
  (select (response ->> 'ok')::boolean
     and not (response ->> 'idempotent')::boolean
     and response ->> 'physicalDay' = ((now() at time zone 'Asia/Shanghai')::date)::text
     and (response ->> 'maxCheckins')::integer = 1
     and (response ->> 'usedCheckins')::integer = 1
     and (response ->> 'remainingCheckins')::integer = 0
     and response ->> 'boxSpec' = 'legacy'
   from legacy_first_response),
  'whitelist legacy first save must return the physical-day compatibility response'
);

create temporary table legacy_replay_response as
select public.verify_checkin(
  current_date,
  '{"2026-11-12":{"water":true,"sleep":true}}'::jsonb,
  null,
  null
) as response;
select test.assert_true(
  (select (response ->> 'idempotent')::boolean from legacy_replay_response),
  'same physical day legacy replay must be idempotent'
);
reset role;
select test.assert_true(
  (select count(*) = 1
   from public.checkin_daily_claims
   where auth_user_id = '00000000-0000-0000-0000-000000000101'
     and claim_source = 'legacy'
     and code_id is null
     and used_checkins = 1),
  'legacy replay must retain exactly one NULL-code claim'
);
select test.assert_true(
  (select records -> '2026-11-12' ->> 'sleep' = 'true'
   from public.checkin_sync
   where auth_user_id = '00000000-0000-0000-0000-000000000101'),
  'legacy idempotent replay must still save the latest snapshot'
);

set role authenticated;
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000102', false);
create temporary table runtime_first_response as
select public.verify_checkin(
  current_date,
  '{"2026-11-12":{"movement":true}}'::jsonb,
  null,
  null
) as response;
select test.assert_true(
  (select (response ->> 'ok')::boolean
     and not (response ->> 'idempotent')::boolean
     and response ->> 'boxSpec' = 'legacy'
   from runtime_first_response),
  'runtime legacy must pass server-side verification without a box code'
);

select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000103', false);
select test.assert_raises(
  'CHECKIN_CODE_NOT_AVAILABLE',
  'select public.verify_checkin(current_date, ''{}''::jsonb, null, null)'
);

reset role;

select test.assert_true(
  (select count(*) = 2 from public.checkin_daily_claims where claim_source = 'legacy'),
  'only whitelist and runtime users may create legacy claims'
);
select test.assert_true(
  (select count(*) = 0 from public.box_codes)
    and (select count(*) = 0 from public.box_code_events),
  'legacy saves must not create box codes or box events'
);

do $legacy_unique$
begin
  insert into public.checkin_daily_claims (
    code_id, auth_user_id, physical_day, used_checkins, claim_source
  ) values (
    null,
    '00000000-0000-0000-0000-000000000101',
    (now() at time zone 'Asia/Shanghai')::date,
    1,
    'legacy'
  );
  raise exception 'duplicate legacy INSERT unexpectedly succeeded';
exception
  when unique_violation then null;
end;
$legacy_unique$;

insert into public.box_codes (
  code_id, code_hash, code_type, code_format, state, coach_id, case_id,
  max_checkins, used_checkins, box_spec, inventory_status, code_ciphertext, expires_at
) values (
  '00000000-0000-0000-0000-000000009002', 'legacy-mixed-active-code', 'experience', 'short',
  'pending_review', '00000000-0000-0000-0000-000000000001', gen_random_uuid(),
  21, 0, '21_bags', 'coach',
  pgp_sym_encrypt('JH-LEGACY-MIXED', 'legacy-checkin-test-pepper'),
  '2099-01-01T00:00:00+00:00'
);

insert into public.code_activations (
  activation_id, code_id, auth_user_id, camper_code,
  expected_code_type, expected_code_format, shipment_verification_ref,
  review_state, target_referrer_id, decided_by, decided_at, activated_at, request_source
) values (
  '00000000-0000-0000-0000-000000008002',
  '00000000-0000-0000-0000-000000009002',
  '00000000-0000-0000-0000-000000000101',
  'LEGACY-WHITE',
  'experience', 'short', 'LEGACY-MIXED-VERIFIED',
  'approved',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  now(), now(), 'manual_code'
);

update public.box_codes
set state = 'active', activation_id = '00000000-0000-0000-0000-000000008002', version = 2
where code_id = '00000000-0000-0000-0000-000000009002';

set role authenticated;
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000101', false);
create temporary table mixed_legacy_then_box_response as
select public.verify_checkin(
  current_date,
  '{"2026-11-12":{"water":true,"movement":true}}'::jsonb,
  null,
  null
) as response;
reset role;

select test.assert_true(
  (select (response ->> 'idempotent')::boolean from mixed_legacy_then_box_response),
  'legacy followed by a real code on the same day must be cross-source idempotent'
);
select test.assert_true(
  (select used_checkins = 0 and version = 2
   from public.box_codes
   where code_id = '00000000-0000-0000-0000-000000009002'),
  'same-day real code binding must not consume box quota after a legacy claim'
);
select test.assert_true(
  not exists (
    select 1 from public.checkin_daily_claims
    where code_id = '00000000-0000-0000-0000-000000009002'
  ) and (select count(*) = 0 from public.box_code_events),
  'mixed legacy-to-box replay must not create a box claim or event'
);

insert into public.box_codes (
  code_id, code_hash, code_type, code_format, state, coach_id, case_id,
  max_checkins, used_checkins, box_spec, inventory_status, code_ciphertext, expires_at
) values (
  '00000000-0000-0000-0000-000000009003', 'legacy-fallback-code', 'experience', 'short',
  'unused', '00000000-0000-0000-0000-000000000001', gen_random_uuid(),
  21, 0, '21_bags', 'coach',
  pgp_sym_encrypt('JH-LEGACY-FALLBACK', 'legacy-checkin-test-pepper'),
  '2099-01-01T00:00:00+00:00'
);

insert into public.checkin_daily_claims (
  code_id, auth_user_id, physical_day, used_checkins, claim_source
) values (
  '00000000-0000-0000-0000-000000009003',
  '00000000-0000-0000-0000-000000000104',
  (now() at time zone 'Asia/Shanghai')::date,
  1,
  'box_code'
);

set role authenticated;
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000104', false);
create temporary table mixed_box_then_legacy_response as
select public.verify_checkin(
  current_date,
  '{"2026-11-12":{"water":true}}'::jsonb,
  null,
  null
) as response;
reset role;

select test.assert_true(
  (select (response ->> 'idempotent')::boolean from mixed_box_then_legacy_response),
  'box claim followed by same-day no-code legacy fallback must be idempotent'
);
select test.assert_true(
  not exists (
    select 1 from public.checkin_daily_claims
    where auth_user_id = '00000000-0000-0000-0000-000000000104'
      and claim_source = 'legacy'
  ),
  'box-to-legacy fallback must not create a second cross-source claim'
);

do $box_unique$
begin
  insert into public.checkin_daily_claims (
    code_id, auth_user_id, physical_day, used_checkins, claim_source
  ) values (
    '00000000-0000-0000-0000-000000009003',
    '00000000-0000-0000-0000-000000000104',
    (now() at time zone 'Asia/Shanghai')::date,
    2,
    'box_code'
  );
  raise exception 'duplicate box_code INSERT unexpectedly succeeded';
exception
  when unique_violation then null;
end;
$box_unique$;

select test.assert_true(
  public.coach_promotion_effective_checkin_days('00000000-0000-0000-0000-000000000101') = 0
    and public.coach_promotion_effective_checkin_days('00000000-0000-0000-0000-000000000102') = 0,
  'legacy and mixed-state claims must not enter coach promotion effective days'
);

select test.assert_true(
  not has_table_privilege('authenticated', 'public.checkin_daily_claims', 'select,insert,update,delete')
    and not has_table_privilege('anon', 'public.checkin_daily_claims', 'select,insert,update,delete'),
  'claims table privileges must remain closed to browser roles'
);

rollback;

select 'PASS: real NULL inserts, partial unique indexes, idempotency, mixed states and side-effect boundaries' as result;
