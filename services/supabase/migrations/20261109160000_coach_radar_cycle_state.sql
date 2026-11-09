begin;

-- 返回类型新增字段，必须在同一事务内替换最新两个重载；历史迁移保持不变。
drop function public.get_coach_radar_v1(p_scope text);
drop function public.get_coach_radar_v1();

create function public.get_coach_radar_v1(p_scope text)
returns table (
  camper_code text,
  weight_delta numeric,
  waist_delta numeric,
  bmi numeric,
  alert_level text,
  cycle_state text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_role text;
  v_today date := (now() at time zone 'Asia/Shanghai')::date;
  v_is_probational boolean;
  v_cycle_days_text text;
  v_cycle_days integer;
begin
  if p_scope is null or p_scope not in ('own', 'all') then
    raise exception 'INVALID_SCOPE' using errcode = '22023';
  end if;
  if v_auth_user_id is null then return; end if;
  v_is_probational := public.coach_promotion_is_probational(v_auth_user_id);
  if v_is_probational and p_scope = 'all' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select a.role into v_role from public.camp_admins a
  where a.auth_user_id = v_auth_user_id and a.is_active;
  if v_is_probational then
    v_role := 'probational_coach';
  elsif not found or v_role not in ('coach', 'admin', 'staff') then
    return;
  end if;
  if p_scope = 'all' and v_role <> 'admin' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select case
    when jsonb_typeof(c.config_value) = 'number' then c.config_value #>> '{}'
  end into v_cycle_days_text
  from public.system_configs c
  where c.config_key = 'max_checkins_per_box';
  if v_cycle_days_text is null or v_cycle_days_text !~ '^[1-9][0-9]*$' then
    raise exception 'SYSTEM_CONFIG_MISSING';
  end if;
  begin
    v_cycle_days := v_cycle_days_text::integer;
  exception when numeric_value_out_of_range then
    raise exception 'SYSTEM_CONFIG_MISSING';
  end;

  return query
  with visible_campers as (
    select r.auth_user_id, r.camper_code, c.start_date, c.height_cm, c.initial_weight_kg, c.records
    from public.user_coach_relation r
    left join public.checkin_sync c on c.auth_user_id = r.auth_user_id
    where r.valid_to is null and (
      (v_role in ('coach', 'probational_coach') and r.referrer_id = v_auth_user_id)
      or (v_role = 'admin' and (p_scope = 'all' or r.referrer_id = v_auth_user_id))
      or (
        v_role = 'staff' and exists (
          select 1 from public.staff_coach_assignment sa
          where sa.staff_id = v_auth_user_id and sa.coach_id = r.referrer_id
            and sa.state = 'active' and sa.valid_from <= now()
            and (sa.valid_to is null or sa.valid_to > now())
        )
      )
    )
  ),
  raw_record_days as (
    select vc.*, days.key as record_key, days.value as day
    from visible_campers vc
    left join lateral jsonb_each(
      case when jsonb_typeof(vc.records) = 'object' then vc.records else '{}'::jsonb end
    ) days on true
  ),
  parsed_record_days as (
    select
      raw.auth_user_id, raw.start_date,
      public.coach_radar_record_date(raw.record_key) as record_date,
      public.coach_radar_representative_weight(raw.day) as representative_weight,
      public.coach_radar_json_number(raw.day->'waist') as waist,
      public.coach_radar_day_has_content(raw.day) as has_content
    from raw_record_days raw
  ),
  record_days as (
    select parsed.* from parsed_record_days parsed
    where parsed.record_date is not null and parsed.start_date is not null
      and parsed.record_date between parsed.start_date and parsed.start_date + (v_cycle_days - 1)
  ),
  ranked_weights as (
    select record_days.auth_user_id, record_days.representative_weight,
      row_number() over (partition by record_days.auth_user_id order by record_days.record_date desc) as rn
    from record_days where record_days.representative_weight is not null
  ),
  ranked_initial_weights as (
    select record_days.auth_user_id, record_days.representative_weight,
      row_number() over (partition by record_days.auth_user_id order by record_days.record_date asc) as rn
    from record_days where record_days.representative_weight is not null
  ),
  ranked_waists as (
    select record_days.auth_user_id, record_days.waist,
      row_number() over (partition by record_days.auth_user_id order by record_days.record_date desc) as rn
    from record_days where record_days.waist is not null and record_days.waist > 0
  ),
  ranked_initial_waists as (
    select record_days.auth_user_id, record_days.waist,
      row_number() over (partition by record_days.auth_user_id order by record_days.record_date asc) as rn
    from record_days where record_days.waist is not null and record_days.waist > 0
  ),
  ranked_activity as (
    select record_days.auth_user_id, record_days.record_date,
      row_number() over (partition by record_days.auth_user_id order by record_days.record_date desc) as rn
    from record_days where record_days.has_content
  )
  select
    vc.camper_code,
    case
      when current_weight.representative_weight is null or coalesce(
        case when vc.initial_weight_kg > 0 then vc.initial_weight_kg end,
        initial_weight.representative_weight
      ) is null then null
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
      when current_weight.representative_weight is null or vc.height_cm is null or vc.height_cm <= 0 then null
      else current_weight.representative_weight / power(vc.height_cm / 100, 2)
    end as bmi,
    case
      when vc.start_date is not null and v_today > vc.start_date + (v_cycle_days - 1) and not exists (
        select 1 from public.code_activations recharge
        join public.box_codes recharge_code
          on recharge_code.activation_id = recharge.activation_id and recharge_code.state = 'active'
        where recharge.auth_user_id = vc.auth_user_id
          and recharge.expected_code_type = 'recharge' and recharge.activated_at is not null
      ) then 'red'
      when latest_activity.record_date is null then 'red'
      when v_today - latest_activity.record_date >= 3 then 'red'
      when v_today - latest_activity.record_date = 2 then 'yellow'
      else 'green'
    end as alert_level,
    case
      when vc.start_date is not null and v_today > vc.start_date + (v_cycle_days - 1) and not exists (
        select 1 from public.code_activations recharge
        join public.box_codes recharge_code
          on recharge_code.activation_id = recharge.activation_id and recharge_code.state = 'active'
        where recharge.auth_user_id = vc.auth_user_id
          and recharge.expected_code_type = 'recharge' and recharge.activated_at is not null
      ) then 'cycle_complete_pending_renewal'
      else 'in_cycle'
    end as cycle_state
  from visible_campers vc
  left join (
    select ranked.auth_user_id, ranked.representative_weight from ranked_weights ranked where ranked.rn = 1
  ) current_weight on current_weight.auth_user_id = vc.auth_user_id
  left join (
    select ranked.auth_user_id, ranked.representative_weight from ranked_initial_weights ranked where ranked.rn = 1
  ) initial_weight on initial_weight.auth_user_id = vc.auth_user_id
  left join (
    select ranked.auth_user_id, ranked.waist from ranked_waists ranked where ranked.rn = 1
  ) current_waist on current_waist.auth_user_id = vc.auth_user_id
  left join (
    select ranked.auth_user_id, ranked.waist from ranked_initial_waists ranked where ranked.rn = 1
  ) initial_waist on initial_waist.auth_user_id = vc.auth_user_id
  left join (
    select ranked.auth_user_id, ranked.record_date from ranked_activity ranked where ranked.rn = 1
  ) latest_activity on latest_activity.auth_user_id = vc.auth_user_id;
end;
$function$;

-- 无参入口保持历史 Admin 全栈、coach 本人、staff 分配范围；准教练固定 own。
create function public.get_coach_radar_v1()
returns table (
  camper_code text,
  weight_delta numeric,
  waist_delta numeric,
  bmi numeric,
  alert_level text,
  cycle_state text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role text;
begin
  select a.role into v_role from public.camp_admins a
  where a.auth_user_id = auth.uid() and a.is_active;
  if v_role = 'admin' then
    return query select * from public.get_coach_radar_v1('all');
  else
    return query select * from public.get_coach_radar_v1('own');
  end if;
end;
$function$;

revoke all on function public.get_coach_radar_v1() from public, anon, authenticated;
revoke all on function public.get_coach_radar_v1(text) from public, anon, authenticated;
grant execute on function public.get_coach_radar_v1() to authenticated;
grant execute on function public.get_coach_radar_v1(text) to authenticated;

comment on function public.get_coach_radar_v1(text) is
  'Six-field radar: original five fields plus server-side cycle_state; existing RBAC and masking retained.';

commit;
