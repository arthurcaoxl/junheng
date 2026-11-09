\set ON_ERROR_STOP on

-- 隔离 PostgreSQL 行为测试；使用空数据库运行，不连接真实 Supabase。
-- 本文件只准备最小表与既有 helper 的同口径实现，再载入待测迁移。

do $setup_roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end;
$setup_roles$;

create schema auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid()
returns uuid
language sql
stable
as $function$
  select nullif(current_setting('test.auth_uid', true), '')::uuid;
$function$;

create table public.camp_admins (
  email text primary key,
  auth_user_id uuid unique,
  role text not null,
  is_active boolean not null default true
);
create table public.user_coach_relation (
  relation_id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  referrer_id uuid not null,
  camper_code text not null,
  valid_to timestamptz
);
create table public.checkin_sync (
  auth_user_id uuid primary key references auth.users(id),
  user_code text not null,
  start_date date not null,
  records jsonb not null default '{}'::jsonb
);

create or replace function public.coach_radar_json_number(p_value jsonb)
returns numeric
language sql
immutable
strict
set search_path = public, pg_temp
as $function$
  select case
    when jsonb_typeof(p_value) = 'number'
      then (p_value #>> '{}')::numeric
    when jsonb_typeof(p_value) = 'string'
      and btrim(p_value #>> '{}') ~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$'
      then btrim(p_value #>> '{}')::numeric
    else null
  end;
$function$;

create or replace function public.coach_radar_representative_weight(p_day jsonb)
returns numeric
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $function$
declare
  v_weights jsonb := p_day->'weights';
  v_clothes numeric;
  v_node numeric;
  v_total numeric := 0;
  v_weighted numeric := 0;
  v_legacy numeric;
begin
  if jsonb_typeof(p_day) <> 'object' then return null; end if;
  v_clothes := coalesce(public.coach_radar_json_number(p_day->'clothes'), 0);
  if v_clothes < 0 then v_clothes := 0; end if;
  if jsonb_typeof(v_weights) = 'object' then
    v_node := public.coach_radar_json_number(v_weights->'morning');
    if v_node is not null and v_node - v_clothes >= 20 then
      v_total := v_total + 0.6;
      v_weighted := v_weighted + (v_node - v_clothes) * 0.6;
    end if;
    v_node := public.coach_radar_json_number(v_weights->'noon');
    if v_node is not null and v_node >= 20 then
      v_total := v_total + 0.2;
      v_weighted := v_weighted + v_node * 0.2;
    end if;
    v_node := public.coach_radar_json_number(v_weights->'evening');
    if v_node is not null and v_node >= 20 then
      v_total := v_total + 0.2;
      v_weighted := v_weighted + v_node * 0.2;
    end if;
    if v_total > 0 then return round(v_weighted / v_total, 1); end if;
  end if;
  v_legacy := public.coach_radar_json_number(p_day->'weight');
  if v_legacy is not null and v_legacy > 0 then return v_legacy; end if;
  return null;
end;
$function$;

create or replace function public.coach_radar_record_date(p_key text)
returns date
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $function$
begin
  return p_key::date;
exception when others then
  return null;
end;
$function$;

create or replace function public.coach_radar_day_has_content(p_day jsonb)
returns boolean
language sql
immutable
strict
set search_path = public, pg_temp
as $function$
  select case
    when jsonb_typeof(p_day) <> 'object' then false
    when nullif(btrim(p_day->>'weight'), '') is not null then true
    when nullif(btrim(p_day->>'waist'), '') is not null then true
    when jsonb_typeof(p_day->'weights') = 'object' and (
      nullif(btrim(p_day->'weights'->>'morning'), '') is not null
      or nullif(btrim(p_day->'weights'->>'noon'), '') is not null
      or nullif(btrim(p_day->'weights'->>'evening'), '') is not null
    ) then true
    when jsonb_typeof(p_day->'meals') = 'array'
      and p_day->'meals' @> 'true'::jsonb then true
    when jsonb_typeof(p_day->'water') = 'boolean'
      and (p_day->>'water')::boolean then true
    when jsonb_typeof(p_day->'movement') = 'boolean'
      and (p_day->>'movement')::boolean then true
    when jsonb_typeof(p_day->'sleep') = 'boolean'
      and (p_day->>'sleep')::boolean then true
    else false
  end;
$function$;

\ir ../migrations/20261109153000_coach_camp_trends.sql

begin;

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'camper-a@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'camper-b@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'camper-c@example.test'),
  ('20000000-0000-0000-0000-000000000001', 'admin@example.test'),
  ('20000000-0000-0000-0000-000000000002', 'coach@example.test'),
  ('20000000-0000-0000-0000-000000000003', 'other-coach@example.test'),
  ('20000000-0000-0000-0000-000000000004', 'staff@example.test'),
  ('20000000-0000-0000-0000-000000000005', 'ordinary@example.test'),
  ('20000000-0000-0000-0000-000000000006', 'inactive@example.test');

insert into public.camp_admins (email, auth_user_id, role, is_active) values
  ('admin@example.test', '20000000-0000-0000-0000-000000000001', 'admin', true),
  ('coach@example.test', '20000000-0000-0000-0000-000000000002', 'coach', true),
  ('other-coach@example.test', '20000000-0000-0000-0000-000000000003', 'coach', true),
  ('staff@example.test', '20000000-0000-0000-0000-000000000004', 'staff', true),
  ('inactive@example.test', '20000000-0000-0000-0000-000000000006', 'coach', false);

insert into public.user_coach_relation
  (auth_user_id, referrer_id, camper_code, valid_to)
values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'JH-AAAAA', null),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 'JH-BBBBB', null),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'JH-BBBBB', now());

insert into public.checkin_sync (auth_user_id, user_code, start_date, records) values
  (
    '10000000-0000-0000-0000-000000000001', 'JH-AAAAA', '2026-01-01',
    '{
      "2025-12-31": {"weight":"10", "waist":"10"},
      "2026-01-01": {"weight":"80", "waist":"90", "meals":[true,true,true], "water":true, "movement":true, "sleep":false},
      "2026-01-02": {"weight":"79", "waist":"89", "meals":[true,false,false], "water":false, "movement":false, "sleep":true},
      "2026-01-03": {"weight":"", "waist":"", "meals":[false,false,false], "water":true, "movement":false, "sleep":false},
      "2026-01-04": {},
      "2026-01-22": {"weight":"1", "waist":"1", "meals":[true,true,true], "water":true, "movement":true, "sleep":true}
    }'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000002', 'JH-BBBBB', '2026-02-01',
    '{
      "2026-02-01": {"weight":"70", "waist":"80", "meals":[true,false,false], "water":true, "movement":false, "sleep":true},
      "2026-02-02": {"weights":{"morning":"69"}, "clothes":"0", "waist":"79", "meals":[true,false,false], "water":false, "movement":false, "sleep":false}
    }'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000003', 'JH-CCCCC', '2026-03-01',
    '{
      "2026-03-01": {"weight":"60", "waist":"70", "meals":[false,false,false], "water":false, "movement":true, "sleep":true}
    }'::jsonb
  );

commit;

-- 只读事务中执行全部 RPC 断言；任何写副作用都会由数据库直接拒绝。
begin;
set transaction read only;

do $test$
declare
  v_admin uuid := '20000000-0000-0000-0000-000000000001';
  v_coach uuid := '20000000-0000-0000-0000-000000000002';
  v_other_coach uuid := '20000000-0000-0000-0000-000000000003';
  v_staff uuid := '20000000-0000-0000-0000-000000000004';
  v_ordinary uuid := '20000000-0000-0000-0000-000000000005';
  v_inactive uuid := '20000000-0000-0000-0000-000000000006';
  v_points jsonb;
  v_coach_all_points jsonb;
begin
  perform set_config('test.auth_uid', v_coach::text, false);
  select jsonb_agg(row_to_json(t) order by t.day_index)
  into v_points
  from public.get_coach_camp_trends_v1('own') t;
  if jsonb_array_length(v_points) <> 21 then
    raise exception 'coach own must return exactly 21 points: %', v_points;
  end if;
  if not exists (
    select 1 from jsonb_to_recordset(v_points) as x(
      day_index integer, participants integer, weight_samples integer,
      waist_samples integer, avg_weight_change_percent numeric,
      avg_waist_change_percent numeric, meal_completion_rate numeric,
      water_rate numeric, movement_rate numeric, sleep_rate numeric
    )
    where day_index = 1 and participants = 1 and weight_samples = 1
      and waist_samples = 1 and avg_weight_change_percent = 0
      and avg_waist_change_percent = 0 and meal_completion_rate = 100
      and water_rate = 100 and movement_rate = 100 and sleep_rate = 0
  ) then
    raise exception 'coach own D1 mismatch: %', v_points;
  end if;
  if not exists (
    select 1 from jsonb_to_recordset(v_points) as x(
      day_index integer, participants integer, weight_samples integer,
      avg_weight_change_percent numeric, water_rate numeric
    )
    where day_index = 3 and participants = 1 and weight_samples = 0
      and avg_weight_change_percent is null and water_rate = 100
  ) then
    raise exception 'metric-specific null/sample mismatch: %', v_points;
  end if;
  if exists (
    select 1 from jsonb_to_recordset(v_points) as x(
      day_index integer, participants integer, weight_samples integer,
      avg_weight_change_percent numeric, meal_completion_rate numeric
    )
    where day_index between 4 and 21 and (
      participants <> 0 or weight_samples <> 0
      or avg_weight_change_percent is not null or meal_completion_rate is not null
    )
  ) then
    raise exception 'empty days must be zero counts and null metrics: %', v_points;
  end if;

  select jsonb_agg(row_to_json(t) order by t.day_index)
  into v_coach_all_points
  from public.get_coach_camp_trends_v1('all') t;
  if jsonb_array_length(v_coach_all_points) <> 21 then
    raise exception 'coach all must return exactly 21 points: %', v_coach_all_points;
  end if;
  if not exists (
    select 1 from jsonb_to_recordset(v_coach_all_points) as x(
      day_index integer, participants integer, weight_samples integer,
      waist_samples integer, avg_weight_change_percent numeric
    )
    where day_index = 1 and participants = 3 and weight_samples = 3
      and waist_samples = 3 and avg_weight_change_percent = 0
  ) then
    raise exception 'coach all must use the stack-wide aggregate: %', v_coach_all_points;
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_coach_all_points) as point(value)
    where exists (
      select 1 from jsonb_object_keys(point.value) as field(name)
      where field.name not in (
        'day_index', 'participants', 'weight_samples', 'waist_samples',
        'avg_weight_change_percent', 'avg_waist_change_percent',
        'meal_completion_rate', 'water_rate', 'movement_rate', 'sleep_rate'
      )
    )
  ) then
    raise exception 'coach all must not expose new or identifying fields: %', v_coach_all_points;
  end if;

  perform set_config('test.auth_uid', v_other_coach::text, false);
  if (select participants from public.get_coach_camp_trends_v1('own') where day_index = 1) <> 1 then
    raise exception 'other coach must see only their own current camper';
  end if;

  perform set_config('test.auth_uid', v_admin::text, false);
  select jsonb_agg(row_to_json(t) order by t.day_index)
  into v_points
  from public.get_coach_camp_trends_v1('all') t;
  if v_coach_all_points is distinct from v_points then
    raise exception 'coach all and Admin all must return identical aggregate points';
  end if;
  if not exists (
    select 1 from jsonb_to_recordset(v_points) as x(
      day_index integer, participants integer, weight_samples integer,
      waist_samples integer, avg_weight_change_percent numeric,
      avg_waist_change_percent numeric, meal_completion_rate numeric,
      water_rate numeric, movement_rate numeric, sleep_rate numeric
    )
    where day_index = 1 and participants = 3 and weight_samples = 3
      and waist_samples = 3 and avg_weight_change_percent = 0
      and avg_waist_change_percent = 0 and meal_completion_rate = 44.4
      and water_rate = 66.7 and movement_rate = 66.7 and sleep_rate = 66.7
  ) then
    raise exception 'Admin all D1 must include unassigned camper and match rates: %', v_points;
  end if;
  if not exists (
    select 1 from jsonb_to_recordset(v_points) as x(
      day_index integer, participants integer, weight_samples integer,
      waist_samples integer, avg_weight_change_percent numeric,
      avg_waist_change_percent numeric, meal_completion_rate numeric,
      water_rate numeric, movement_rate numeric, sleep_rate numeric
    )
    where day_index = 2 and participants = 2 and weight_samples = 2
      and waist_samples = 2 and avg_weight_change_percent = -1.4
      and avg_waist_change_percent = -1.2 and meal_completion_rate = 33.3
      and water_rate = 0 and movement_rate = 0 and sleep_rate = 50
  ) then
    raise exception 'Admin all D2 rounding or baseline mismatch: %', v_points;
  end if;
  if (select count(*) from public.get_coach_camp_trends_v1('all')) <> 21 then
    raise exception 'Admin all must return 21 rows';
  end if;
  if (select participants from public.get_coach_camp_trends_v1('own') where day_index = 1) <> 0 then
    raise exception 'Admin own must not silently widen to all';
  end if;

  perform set_config('test.auth_uid', v_staff::text, false);
  begin
    perform public.get_coach_camp_trends_v1('own');
    raise exception 'staff own must be rejected';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.get_coach_camp_trends_v1('all');
    raise exception 'staff all must be rejected';
  exception when sqlstate '42501' then null;
  end;

  perform set_config('test.auth_uid', v_ordinary::text, false);
  begin
    perform public.get_coach_camp_trends_v1('all');
    raise exception 'ordinary user must be rejected';
  exception when sqlstate '42501' then null;
  end;

  perform set_config('test.auth_uid', v_inactive::text, false);
  begin
    perform public.get_coach_camp_trends_v1('own');
    raise exception 'inactive role must be rejected';
  exception when sqlstate '42501' then null;
  end;

  perform set_config('test.auth_uid', '', false);
  begin
    perform public.get_coach_camp_trends_v1('own');
    raise exception 'anonymous caller must be rejected';
  exception when sqlstate '42501' then null;
  end;

  perform set_config('test.auth_uid', v_admin::text, false);
  begin
    perform public.get_coach_camp_trends_v1(null);
    raise exception 'NULL scope must be rejected';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.get_coach_camp_trends_v1('ALL');
    raise exception 'unknown scope must be rejected';
  exception when sqlstate '22023' then null;
  end;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_coach_camp_trends_v1'
      and p.provolatile = 's'
      and pg_get_function_result(p.oid) =
        'TABLE(day_index integer, participants integer, weight_samples integer, waist_samples integer, avg_weight_change_percent numeric, avg_waist_change_percent numeric, meal_completion_rate numeric, water_rate numeric, movement_rate numeric, sleep_rate numeric)'
  ) then
    raise exception 'return signature must be STABLE and contain only aggregate fields';
  end if;
end;
$test$;

rollback;

select 'PASS: scopes, RBAC, 21 points, nulls, samples, aggregation, desensitization and read-only execution' as result;
