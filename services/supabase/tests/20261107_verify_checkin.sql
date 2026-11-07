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

do $test$
declare
  camper uuid := '10000000-0000-0000-0000-000000000001';
  pending_camper uuid := '10000000-0000-0000-0000-000000000002';
  coach uuid := '20000000-0000-0000-0000-000000000001';
  code_id uuid := '30000000-0000-0000-0000-000000000001';
  pending_code_id uuid := '30000000-0000-0000-0000-000000000002';
  activation_id uuid := '40000000-0000-0000-0000-000000000001';
  pending_activation_id uuid := '40000000-0000-0000-0000-000000000002';
  result jsonb;
begin
  insert into auth.users (id, email) values
    (camper, 'camper@example.com'),
    (pending_camper, 'pending@example.com'),
    (coach, 'coach@example.com');

  insert into public.checkin_sync (auth_user_id, user_code, start_date, records)
  values
    (camper, 'JH-CAMP1', current_date, '{}'::jsonb),
    (pending_camper, 'JH-CAMP2', current_date, '{}'::jsonb);

  insert into public.box_codes (
    code_id, code_hash, code_type, code_format, state,
    coach_id, case_id
  ) values (
    code_id, 'active-code-hash', 'experience', 'short', 'pending_review',
    coach, '50000000-0000-0000-0000-000000000001'
  );

  -- 新列缺省时必须得到一个完整盒的额度，而不是 NULL 或预扣次数。
  if not exists (
    select 1 from public.box_codes
    where code_id = code_id
      and max_checkins = 21
      and used_checkins = 0
      and box_spec = '21_bags'
  ) then
    raise exception 'Legacy-compatible quota defaults are incorrect';
  end if;

  insert into public.code_activations (
    activation_id, code_id, auth_user_id, camper_code,
    expected_code_type, expected_code_format,
    shipment_verification_ref, review_state,
    target_referrer_id, decided_by, decided_at, activated_at
  ) values (
    activation_id, code_id, camper, 'JH-CAMP1',
    'experience', 'short', 'shipment-verified', 'approved',
    coach, coach, now(), now()
  );

  update public.box_codes
  set state = 'active', activation_id = activation_id, version = version + 1
  where code_id = code_id;

  perform set_config('test.auth_uid', camper::text, false);
  result := public.verify_checkin(current_date, '{"2026-11-07":{"water":true}}'::jsonb, null, null);
  if not coalesce((result->>'ok')::boolean, false)
    or coalesce((result->>'idempotent')::boolean, true)
    or (result->>'remainingCheckins')::integer <> 20 then
    raise exception 'First check-in result is incorrect: %', result;
  end if;

  result := public.verify_checkin(current_date, '{"2026-11-07":{"water":true,"sleep":true}}'::jsonb, null, null);
  if not coalesce((result->>'idempotent')::boolean, false) then
    raise exception 'Same physical day must be idempotent: %', result;
  end if;
  if (select used_checkins from public.box_codes where code_id = code_id) <> 1 then
    raise exception 'Same physical day consumed quota more than once';
  end if;
  if not exists (
    select 1 from public.checkin_sync
    where auth_user_id = camper and records->'2026-11-07'->>'sleep' = 'true'
  ) then
    raise exception 'Idempotent replay must still save the latest snapshot';
  end if;

  -- 模拟已有扣次发生在上一物理日，新物理日才允许再扣一次。
  update public.checkin_daily_claims
  set physical_day = (now() at time zone 'Asia/Shanghai')::date - 1
  where code_id = code_id;
  result := public.verify_checkin(current_date, '{}'::jsonb, null, null);
  if (result->>'usedCheckins')::integer <> 2 then
    raise exception 'Next physical day must consume exactly one more check-in: %', result;
  end if;
  if (select count(*) from public.box_code_events where code_id = code_id and event_type = 'CheckinVerified') <> 2 then
    raise exception 'Each real deduction must append one audit event';
  end if;

  -- 无当日幂等记录且达到上限时必须抛错。
  delete from public.checkin_daily_claims where code_id = code_id;
  update public.box_codes
  set max_checkins = 2, used_checkins = 2, version = version + 1
  where code_id = code_id;
  begin
    result := public.verify_checkin(current_date, '{}'::jsonb, null, null);
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
    pending_code_id, 'pending-code-hash', 'experience', 'short', 'pending_review',
    coach, '50000000-0000-0000-0000-000000000002'
  );
  insert into public.code_activations (
    activation_id, code_id, auth_user_id, camper_code,
    expected_code_type, expected_code_format
  ) values (
    pending_activation_id, pending_code_id, pending_camper, 'JH-CAMP2',
    'experience', 'short'
  );

  perform set_config('test.auth_uid', pending_camper::text, false);
  begin
    result := public.verify_checkin(current_date, '{}'::jsonb, null, null);
    raise exception 'Expected CHECKIN_NOT_ACTIVE';
  exception when others then
    if sqlerrm <> 'CHECKIN_NOT_ACTIVE' then
      raise;
    end if;
  end;
  if (select used_checkins from public.box_codes where code_id = pending_code_id) <> 0 then
    raise exception 'pending_review must never consume quota';
  end if;
end;
$test$;

select 'PASS: defaults, physical-day idempotency, cross-day deduction, audit, quota exhaustion and pending_review rejection' as result;
