\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text
);
create or replace function auth.uid()
returns uuid
language sql
stable
as $function$
  select nullif(current_setting('test.auth_uid', true), '')::uuid;
$function$;
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $function$
  select '{}'::jsonb;
$function$;

\ir ../migrations/20261030100000_admin_checkin_overview.sql
\ir ../migrations/20261101090000_checkin_bmi_profile.sql
\ir ../migrations/20261106130000_box_code_activation.sql
\ir ../migrations/20261106150000_activate_box_code.sql
\ir ../migrations/20261106160000_get_coach_radar_v1.sql
\ir ../migrations/20261107120000_verify_checkin.sql
\ir ../migrations/20261112120000_seed_activation_compat.sql
\ir ../migrations/20261112130000_legacy_checkin_claims.sql

insert into public.system_configs (config_key, config_value) values
  ('box_code_expiry_policy', '{"default_expires_at":"2099-01-01T00:00:00+00:00"}'::jsonb);

do $test$
declare
  v_camper uuid := '10000000-0000-0000-0000-000000000001';
  v_pending_camper uuid := '10000000-0000-0000-0000-000000000002';
  v_coach uuid := '20000000-0000-0000-0000-000000000001';
  v_code_id uuid := '30000000-0000-0000-0000-000000000001';
  v_pending_code_id uuid := '30000000-0000-0000-0000-000000000002';
  v_activation_id uuid := '40000000-0000-0000-0000-000000000001';
  v_pending_activation_id uuid := '40000000-0000-0000-0000-000000000002';
  v_result jsonb;
begin
  insert into auth.users (id, email) values
    (v_camper, 'camper@example.com'),
    (v_pending_camper, 'pending@example.com'),
    (v_coach, 'coach@example.com');

  insert into public.checkin_sync (auth_user_id, user_code, start_date, records)
  values
    (v_camper, 'JH-CAMP1', current_date, '{}'::jsonb),
    (v_pending_camper, 'JH-CAMP2', current_date, '{}'::jsonb);

  insert into public.box_codes (
    code_id, code_hash, code_type, code_format, state,
    coach_id, case_id, expires_at
  ) values (
    v_code_id, 'active-code-hash', 'experience', 'short', 'pending_review',
    v_coach, '50000000-0000-0000-0000-000000000001', '2099-01-01T00:00:00+00:00'
  );

  -- 新列缺省时必须得到一个完整盒的额度，而不是 NULL 或预扣次数。
  if not exists (
    select 1 from public.box_codes b
    where b.code_id = v_code_id
      and b.max_checkins = 21
      and b.used_checkins = 0
      and b.box_spec = '21_bags'
  ) then
    raise exception 'Legacy-compatible quota defaults are incorrect';
  end if;

  insert into public.code_activations (
    activation_id, code_id, auth_user_id, camper_code,
    expected_code_type, expected_code_format,
    shipment_verification_ref, review_state,
    target_referrer_id, decided_by, decided_at, activated_at
  ) values (
    v_activation_id, v_code_id, v_camper, 'JH-CAMP1',
    'experience', 'short', 'shipment-verified', 'approved',
    v_coach, v_coach, now(), now()
  );

  update public.box_codes
  set state = 'active', activation_id = v_activation_id, version = version + 1
  where code_id = v_code_id;

  perform set_config('test.auth_uid', v_camper::text, false);
  v_result := public.verify_checkin(current_date, '{"2026-11-07":{"water":true}}'::jsonb, null, null);
  if not coalesce((v_result->>'ok')::boolean, false)
    or coalesce((v_result->>'idempotent')::boolean, true)
    or (v_result->>'remainingCheckins')::integer <> 20 then
    raise exception 'First check-in result is incorrect: %', v_result;
  end if;

  v_result := public.verify_checkin(current_date, '{"2026-11-07":{"water":true,"sleep":true}}'::jsonb, null, null);
  if not coalesce((v_result->>'idempotent')::boolean, false) then
    raise exception 'Same physical day must be idempotent: %', v_result;
  end if;
  if (select used_checkins from public.box_codes where code_id = v_code_id) <> 1 then
    raise exception 'Same physical day consumed quota more than once';
  end if;
  if not exists (
    select 1 from public.checkin_sync
    where auth_user_id = v_camper and records->'2026-11-07'->>'sleep' = 'true'
  ) then
    raise exception 'Idempotent replay must still save the latest snapshot';
  end if;

  -- 模拟已有扣次发生在上一物理日，新物理日才允许再扣一次。
  update public.checkin_daily_claims
  set physical_day = (now() at time zone 'Asia/Shanghai')::date - 1
  where code_id = v_code_id;
  v_result := public.verify_checkin(current_date, '{}'::jsonb, null, null);
  if (v_result->>'usedCheckins')::integer <> 2 then
    raise exception 'Next physical day must consume exactly one more check-in: %', v_result;
  end if;
  if (select count(*) from public.box_code_events where code_id = v_code_id and event_type = 'CheckinVerified') <> 2 then
    raise exception 'Each real deduction must append one audit event';
  end if;

  -- 无当日幂等记录且达到上限时必须抛错。
  delete from public.checkin_daily_claims where code_id = v_code_id;
  update public.box_codes
  set max_checkins = 2, used_checkins = 2, version = version + 1
  where code_id = v_code_id;
  begin
    v_result := public.verify_checkin(current_date, '{}'::jsonb, null, null);
    raise exception 'Expected CHECKIN_QUOTA_EXHAUSTED';
  exception when others then
    if sqlerrm <> 'CHECKIN_QUOTA_EXHAUSTED' then
      raise;
    end if;
  end;

  insert into public.box_codes (
    code_id, code_hash, code_type, code_format, state,
    coach_id, case_id
  ) values (
    v_pending_code_id, 'pending-code-hash', 'experience', 'short', 'pending_review',
    v_coach, '50000000-0000-0000-0000-000000000002'
  );
  insert into public.code_activations (
    activation_id, code_id, auth_user_id, camper_code,
    expected_code_type, expected_code_format
  ) values (
    v_pending_activation_id, v_pending_code_id, v_pending_camper, 'JH-CAMP2',
    'experience', 'short'
  );

  perform set_config('test.auth_uid', v_pending_camper::text, false);
  begin
    v_result := public.verify_checkin(current_date, '{}'::jsonb, null, null);
    raise exception 'Expected CHECKIN_NOT_ACTIVE';
  exception when others then
    if sqlerrm <> 'CHECKIN_NOT_ACTIVE' then
      raise;
    end if;
  end;
  if (select used_checkins from public.box_codes where code_id = v_pending_code_id) <> 0 then
    raise exception 'pending_review must never consume quota';
  end if;
end;
$test$;

select 'PASS: defaults, physical-day idempotency, cross-day deduction, audit, quota exhaustion and pending_review rejection' as result;
