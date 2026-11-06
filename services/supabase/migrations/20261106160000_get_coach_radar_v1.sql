-- 10.5：教练雷达只读 RPC + 浏览器激活适配。
-- 不修改 10.4 四参数 activate_box_code；二参数适配只在服务端读取真实版本。

begin;

-- 浏览器只提供码面和幂等键。版本号由服务端读取；成功重放时从首次结果
-- 还原原始 expectedVersion，继续走 10.4 的幂等、防爆破和原子激活流程。
create or replace function public.activate_box_code(
  p_code text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_pepper text;
  v_code_hash text;
  v_code_expected_version integer;
  v_activation_expected_version integer;
  v_existing_command public.box_code_commands%rowtype;
begin
  if v_auth_user_id is not null and p_idempotency_key is not null then
    select * into v_existing_command
    from public.box_code_commands
    where idempotency_key = p_idempotency_key;

    if
      found
      and v_existing_command.command_type = 'activation'
      and v_existing_command.caller_auth_user_id = v_auth_user_id
      and v_existing_command.result is not null
    then
      v_code_expected_version :=
        (v_existing_command.result->>'codeVersion')::integer - 1;
      v_activation_expected_version :=
        (v_existing_command.result->>'activationVersion')::integer - 1;
    else
      v_pepper := nullif(current_setting('app.box_code_pepper', true), '');
      if v_pepper is not null and p_code is not null then
        v_code_hash := encode(hmac(p_code, v_pepper, 'sha256'), 'hex');
        select b.version, a.version
        into v_code_expected_version, v_activation_expected_version
        from public.box_codes b
        join public.code_activations a on a.code_id = b.code_id
        where b.code_hash = v_code_hash
          and a.auth_user_id = v_auth_user_id;
      end if;
    end if;
  end if;

  return public.activate_box_code(
    p_code,
    v_code_expected_version,
    v_activation_expected_version,
    p_idempotency_key
  );
end;
$function$;

revoke all on function public.activate_box_code(text, text)
from public, anon, authenticated;
grant execute on function public.activate_box_code(text, text) to authenticated;

-- JSON 数字安全读取：非法格式、空字符串和非有限业务输入均不参与计算。
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

-- storage-v3 唯一代表体重语义的 SQL 对应实现。
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
  if jsonb_typeof(p_day) <> 'object' then
    return null;
  end if;

  v_clothes := coalesce(public.coach_radar_json_number(p_day->'clothes'), 0);
  if v_clothes < 0 then
    v_clothes := 0;
  end if;

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

    if v_total > 0 then
      return round(v_weighted / v_total, 1);
    end if;
  end if;

  v_legacy := public.coach_radar_json_number(p_day->'weight');
  if v_legacy is not null and v_legacy > 0 then
    return v_legacy;
  end if;
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

-- 与 storage-v3 hasContent 对齐；空 JSON 对象不能制造“已打卡”绿灯。
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

revoke all on function public.coach_radar_json_number(jsonb)
from public, anon, authenticated;
revoke all on function public.coach_radar_representative_weight(jsonb)
from public, anon, authenticated;
revoke all on function public.coach_radar_record_date(text)
from public, anon, authenticated;
revoke all on function public.coach_radar_day_has_content(jsonb)
from public, anon, authenticated;

create or replace function public.get_coach_radar_v1()
returns table (
  camper_code text,
  weight_delta numeric,
  waist_delta numeric,
  bmi numeric,
  alert_level text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_role text;
  v_today date := (now() at time zone 'Asia/Shanghai')::date;
begin
  if v_auth_user_id is null then
    return;
  end if;

  select a.role into v_role
  from public.camp_admins a
  where a.auth_user_id = v_auth_user_id
    and a.is_active;

  if not found or v_role not in ('coach', 'admin') then
    return;
  end if;

  return query
  with visible_campers as (
    select
      r.auth_user_id,
      r.camper_code,
      c.start_date,
      c.height_cm,
      c.initial_weight_kg,
      c.records
    from public.user_coach_relation r
    left join public.checkin_sync c on c.auth_user_id = r.auth_user_id
    where r.valid_to is null
      and (
        (v_role = 'coach' and r.referrer_id = v_auth_user_id)
        or v_role = 'admin'
      )
  ),
  raw_record_days as (
    select
      vc.*,
      days.key as record_key,
      days.value as day
    from visible_campers vc
    left join lateral jsonb_each(
      case
        when jsonb_typeof(vc.records) = 'object' then vc.records
        else '{}'::jsonb
      end
    ) days on true
  ),
  parsed_record_days as (
    select
      raw.auth_user_id,
      raw.start_date,
      public.coach_radar_record_date(raw.record_key) as record_date,
      public.coach_radar_representative_weight(raw.day) as representative_weight,
      public.coach_radar_json_number(raw.day->'waist') as waist,
      public.coach_radar_day_has_content(raw.day) as has_content
    from raw_record_days raw
  ),
  record_days as (
    select parsed.*
    from parsed_record_days parsed
    where parsed.record_date is not null
      and parsed.start_date is not null
      and parsed.record_date between parsed.start_date and parsed.start_date + 20
  ),
  ranked_weights as (
    select
      record_days.auth_user_id,
      record_days.representative_weight,
      row_number() over (
        partition by record_days.auth_user_id
        order by record_days.record_date desc
      ) as rn
    from record_days
    where record_days.representative_weight is not null
  ),
  ranked_initial_weights as (
    select
      record_days.auth_user_id,
      record_days.representative_weight,
      row_number() over (
        partition by record_days.auth_user_id
        order by record_days.record_date asc
      ) as rn
    from record_days
    where record_days.representative_weight is not null
  ),
  ranked_waists as (
    select
      record_days.auth_user_id,
      record_days.waist,
      row_number() over (
        partition by record_days.auth_user_id
        order by record_days.record_date desc
      ) as rn
    from record_days
    where record_days.waist is not null and record_days.waist > 0
  ),
  ranked_initial_waists as (
    select
      record_days.auth_user_id,
      record_days.waist,
      row_number() over (
        partition by record_days.auth_user_id
        order by record_days.record_date asc
      ) as rn
    from record_days
    where record_days.waist is not null and record_days.waist > 0
  ),
  ranked_activity as (
    select
      record_days.auth_user_id,
      record_days.record_date,
      row_number() over (
        partition by record_days.auth_user_id
        order by record_days.record_date desc
      ) as rn
    from record_days
    where record_days.has_content
  )
  select
    vc.camper_code,
    case
      when current_weight.representative_weight is null
        or coalesce(
          case when vc.initial_weight_kg > 0 then vc.initial_weight_kg end,
          initial_weight.representative_weight
        ) is null
        then null
      when current_weight.representative_weight - coalesce(
        case when vc.initial_weight_kg > 0 then vc.initial_weight_kg end,
        initial_weight.representative_weight
      ) = 0 then 0::numeric
      else current_weight.representative_weight - coalesce(
        case when vc.initial_weight_kg > 0 then vc.initial_weight_kg end,
        initial_weight.representative_weight
      )
    end as weight_delta,
    case
      when current_waist.waist is null or initial_waist.waist is null then null
      when current_waist.waist - initial_waist.waist = 0 then 0::numeric
      else current_waist.waist - initial_waist.waist
    end as waist_delta,
    case
      when current_weight.representative_weight is null
        or vc.height_cm is null or vc.height_cm <= 0 then null
      else current_weight.representative_weight / power(vc.height_cm / 100, 2)
    end as bmi,
    case
      when vc.start_date is not null
        and v_today > vc.start_date + 20
        and not exists (
          select 1
          from public.code_activations recharge
          join public.box_codes recharge_code
            on recharge_code.activation_id = recharge.activation_id
            and recharge_code.state = 'active'
          where recharge.auth_user_id = vc.auth_user_id
            and recharge.expected_code_type = 'recharge'
            and recharge.activated_at is not null
        ) then 'red'
      when latest_activity.record_date is null then 'red'
      when v_today - latest_activity.record_date >= 3 then 'red'
      when v_today - latest_activity.record_date = 2 then 'yellow'
      else 'green'
    end as alert_level
  from visible_campers vc
  left join (
    select ranked.auth_user_id, ranked.representative_weight
    from ranked_weights ranked
    where ranked.rn = 1
  ) current_weight on current_weight.auth_user_id = vc.auth_user_id
  left join (
    select ranked.auth_user_id, ranked.representative_weight
    from ranked_initial_weights ranked
    where ranked.rn = 1
  ) initial_weight on initial_weight.auth_user_id = vc.auth_user_id
  left join (
    select ranked.auth_user_id, ranked.waist
    from ranked_waists ranked
    where ranked.rn = 1
  ) current_waist on current_waist.auth_user_id = vc.auth_user_id
  left join (
    select ranked.auth_user_id, ranked.waist
    from ranked_initial_waists ranked
    where ranked.rn = 1
  ) initial_waist on initial_waist.auth_user_id = vc.auth_user_id
  left join (
    select ranked.auth_user_id, ranked.record_date
    from ranked_activity ranked
    where ranked.rn = 1
  ) latest_activity on latest_activity.auth_user_id = vc.auth_user_id;
end;
$function$;

revoke all on function public.get_coach_radar_v1()
from public, anon, authenticated;
grant execute on function public.get_coach_radar_v1() to authenticated;

comment on function public.get_coach_radar_v1() is
  'Desensitized coach radar: five approved fields only; current relations drive LEFT JOINed snapshots.';

commit;
