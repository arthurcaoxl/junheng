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

do $test$
declare
  camper uuid := '10000000-0000-0000-0000-000000000001';
  coach_a uuid := '20000000-0000-0000-0000-000000000001';
  coach_b uuid := '20000000-0000-0000-0000-000000000002';
  code_id uuid := '30000000-0000-0000-0000-000000000001';
  activation_id uuid := '40000000-0000-0000-0000-000000000001';
  result jsonb;
begin
  insert into auth.users (id, email) values
    (camper, 'camper@example.com'),
    (coach_a, 'coach-a@example.com'),
    (coach_b, 'coach-b@example.com');

  insert into public.camp_admins (email, auth_user_id, role, is_active) values
    ('coach-a@example.com', coach_a, 'coach', true),
    ('coach-b@example.com', coach_b, 'coach', true);

  insert into public.checkin_sync (auth_user_id, user_code, start_date, records)
  values (camper, 'JH-CAMP1', current_date, '{}'::jsonb);

  perform set_config('app.box_code_pepper', 'integration-test-pepper', false);
  insert into public.box_codes (
    code_id, code_hash, code_type, code_format, state,
    coach_id, case_id, version
  ) values (
    code_id,
    encode(hmac('JH-EL-AB23', 'integration-test-pepper', 'sha256'), 'hex'),
    'experience', 'short', 'pending_review', coach_a,
    '50000000-0000-0000-0000-000000000001', 2
  );
  insert into public.code_activations (
    activation_id, code_id, auth_user_id, camper_code,
    expected_code_type, expected_code_format,
    shipment_verification_ref, review_state,
    target_referrer_id, decided_by, decided_at, version
  ) values (
    activation_id, code_id, camper, 'JH-CAMP1',
    'experience', 'short', 'shipment-verified', 'approved',
    coach_a, coach_a, now(), 2
  );

  perform set_config('test.auth_uid', camper::text, false);
  result := public.activate_box_code('JH-EL-AB23', 'integration-activation-1');
  if not coalesce((result->>'ok')::boolean, false) then
    raise exception 'Activation failed: %', result;
  end if;

  -- 同一幂等键重放必须仍成功，不能因版本已递增而变成冲突。
  result := public.activate_box_code('JH-EL-AB23', 'integration-activation-1');
  if not coalesce((result->>'ok')::boolean, false)
    or not coalesce((result->>'replayed')::boolean, false) then
    raise exception 'Activation replay failed: %', result;
  end if;

  perform set_config('test.auth_uid', coach_a::text, false);
  if (
    select count(*) from public.get_coach_radar_v1()
  ) <> 1 then
    raise exception 'Activated camper without records must appear exactly once';
  end if;
  if not exists (
    select 1 from public.get_coach_radar_v1()
    where camper_code = 'JH-CAMP1'
      and weight_delta is null
      and waist_delta is null
      and bmi is null
      and alert_level = 'red'
  ) then
    raise exception 'No-record radar row or red alert is incorrect';
  end if;

  perform set_config('test.auth_uid', coach_b::text, false);
  if exists (select 1 from public.get_coach_radar_v1()) then
    raise exception 'Another coach must not see the camper';
  end if;

  -- 三条记录只产生一行；最新代表体重和腰围按日期选取，最新行为使灯号为绿。
  update public.checkin_sync
  set
    start_date = current_date - 2,
    height_cm = 170,
    records = jsonb_build_object(
      to_char(current_date - 2, 'YYYY-MM-DD'),
      jsonb_build_object(
        'weights', jsonb_build_object('morning', '70'),
        'clothes', '0.5', 'waist', '80',
        'meals', '[false,false,false]'::jsonb,
        'water', false, 'movement', false, 'sleep', false
      ),
      to_char(current_date - 1, 'YYYY-MM-DD'),
      jsonb_build_object(
        'weights', jsonb_build_object('morning', '68'),
        'clothes', '0.5', 'waist', '78',
        'meals', '[false,false,false]'::jsonb,
        'water', false, 'movement', false, 'sleep', false
      ),
      to_char(current_date, 'YYYY-MM-DD'),
      jsonb_build_object(
        'weight', '', 'waist', '',
        'meals', '[false,false,false]'::jsonb,
        'water', true, 'movement', false, 'sleep', false
      )
    )
  where auth_user_id = camper;

  perform set_config('test.auth_uid', coach_a::text, false);
  if (
    select count(*) from public.get_coach_radar_v1()
  ) <> 1 then
    raise exception 'ROW_NUMBER must prevent record join multiplication';
  end if;
  if not exists (
    select 1 from public.get_coach_radar_v1()
    where camper_code = 'JH-CAMP1'
      and weight_delta = -2
      and waist_delta = -2
      and abs(bmi - (67.5 / power(1.70, 2))) < 0.000001
      and alert_level = 'green'
  ) then
    raise exception 'Delta, BMI or green alert is incorrect: %',
      (select row_to_json(r) from public.get_coach_radar_v1() r);
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_coach_radar_v1'
      and pg_get_function_result(p.oid) =
        'TABLE(camper_code text, weight_delta numeric, waist_delta numeric, bmi numeric, alert_level text)'
  ) then
    raise exception 'Radar return contract must contain exactly five approved fields';
  end if;
end;
$test$;

select 'PASS: activation, replay, radar visibility, metrics, alerts and desensitization' as result;
