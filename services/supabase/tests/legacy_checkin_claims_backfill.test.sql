\set QUIET on
\pset footer off
set client_min_messages = warning;

\ir legacy_checkin_claims_backfill_bootstrap.sql

insert into vault.decrypted_secrets values ('box_code_pepper', 'legacy-checkin-test-pepper');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'coach@legacy-checkin.test'),
  ('00000000-0000-0000-0000-000000000105', 'backfill@legacy-checkin.test');

insert into public.camp_admins (email, auth_user_id, role, is_active) values
  ('coach@legacy-checkin.test', '00000000-0000-0000-0000-000000000001', 'coach', true);

insert into public.box_codes (
  code_id, code_hash, code_type, code_format, state, coach_id, case_id,
  max_checkins, used_checkins, box_spec, inventory_status, code_ciphertext, expires_at
) values (
  '00000000-0000-0000-0000-000000009001', 'legacy-backfill-code', 'experience', 'short',
  'unused', '00000000-0000-0000-0000-000000000001', gen_random_uuid(),
  21, 0, '21_bags', 'coach',
  pgp_sym_encrypt('JH-LEGACY-BACKFILL', 'legacy-checkin-test-pepper'),
  '2099-01-01T00:00:00+00:00'
);

insert into public.checkin_daily_claims (code_id, auth_user_id, physical_day, used_checkins)
values (
  '00000000-0000-0000-0000-000000009001',
  '00000000-0000-0000-0000-000000000105',
  current_date - 1,
  1
);

\ir ../migrations/20261112130000_legacy_checkin_claims.sql

begin;

select test.assert_true(
  (select count(*) = 0 from public.checkin_daily_claims where claim_id is null),
  'existing claims must receive generated claim ids during migration'
);
select test.assert_true(
  (select count(*) = 1
   from public.checkin_daily_claims
   where code_id = '00000000-0000-0000-0000-000000009001'
     and claim_source = 'box_code'
     and claim_id is not null),
  'existing claims must backfill as box_code without changing their business keys'
);
select test.assert_true(
  not has_table_privilege('authenticated', 'public.checkin_daily_claims', 'select,insert,update,delete')
    and not has_table_privilege('anon', 'public.checkin_daily_claims', 'select,insert,update,delete'),
  'claims table privileges must remain closed to browser roles'
);

rollback;

select 'PASS: legacy claim backfill preserves business keys and closed table privileges' as result;
