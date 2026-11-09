-- TASK-10.13-CORE-FIX：D1-D21 营期趋势只读聚合。
-- 原始快照与身份仅在函数内部参与聚合，返回列严格遵循 storage-v3 契约。

begin;

create or replace function public.get_coach_camp_trends_v1(p_scope text)
returns table (
  day_index integer,
  participants integer,
  weight_samples integer,
  waist_samples integer,
  avg_weight_change_percent numeric,
  avg_waist_change_percent numeric,
  meal_completion_rate numeric,
  water_rate numeric,
  movement_rate numeric,
  sleep_rate numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_role text;
  v_scope text := p_scope;
begin
  if p_scope is null or p_scope not in ('own', 'all') then
    raise exception 'INVALID_SCOPE' using errcode = '22023';
  end if;

  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  select a.role into v_role
  from public.camp_admins a
  where a.auth_user_id = v_auth_user_id
    and a.is_active;

  if not found or v_role not in ('admin', 'coach') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_scope = 'all' and v_role <> 'admin' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  with visible_campers as (
    select c.auth_user_id, c.start_date, c.records
    from public.checkin_sync c
    where
      (v_scope = 'all' and v_role = 'admin')
      or (
        v_scope = 'own'
        and exists (
          select 1
          from public.user_coach_relation r
          where r.auth_user_id = c.auth_user_id
            and r.referrer_id = v_auth_user_id
            and r.valid_to is null
        )
      )
  ),
  raw_record_days as (
    select
      vc.auth_user_id,
      vc.start_date,
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
      public.coach_radar_day_has_content(raw.day) as has_content,
      raw.day
    from raw_record_days raw
  ),
  record_days as (
    select
      parsed.*,
      parsed.record_date - parsed.start_date + 1 as day_index
    from parsed_record_days parsed
    where parsed.record_date is not null
      and parsed.start_date is not null
      and parsed.record_date between parsed.start_date and parsed.start_date + 20
  ),
  ranked_weight_baselines as (
    select
      record_days.auth_user_id,
      record_days.representative_weight,
      row_number() over (
        partition by record_days.auth_user_id
        order by record_days.record_date asc
      ) as rn
    from record_days
    where record_days.representative_weight is not null
      and record_days.representative_weight > 0
  ),
  ranked_waist_baselines as (
    select
      record_days.auth_user_id,
      record_days.waist,
      row_number() over (
        partition by record_days.auth_user_id
        order by record_days.record_date asc
      ) as rn
    from record_days
    where record_days.waist is not null
      and record_days.waist > 0
  ),
  changed_days as (
    select
      rd.day_index,
      rd.has_content,
      rd.day,
      case
        when rd.has_content
          and rd.representative_weight > 0
          and weight_baseline.representative_weight > 0
        then round(
          (rd.representative_weight - weight_baseline.representative_weight)
            / weight_baseline.representative_weight * 100,
          1
        )
        else null
      end as weight_change_percent,
      case
        when rd.has_content
          and rd.waist > 0
          and waist_baseline.waist > 0
        then round(
          (rd.waist - waist_baseline.waist) / waist_baseline.waist * 100,
          1
        )
        else null
      end as waist_change_percent
    from record_days rd
    left join (
      select ranked.auth_user_id, ranked.representative_weight
      from ranked_weight_baselines ranked
      where ranked.rn = 1
    ) weight_baseline on weight_baseline.auth_user_id = rd.auth_user_id
    left join (
      select ranked.auth_user_id, ranked.waist
      from ranked_waist_baselines ranked
      where ranked.rn = 1
    ) waist_baseline on waist_baseline.auth_user_id = rd.auth_user_id
  ),
  aggregated as (
    select
      rd.day_index,
      count(*) filter (where rd.has_content)::integer as participants,
      count(*) filter (
        where rd.has_content and rd.weight_change_percent is not null
      )::integer as weight_samples,
      count(*) filter (
        where rd.has_content and rd.waist_change_percent is not null
      )::integer as waist_samples,
      round(avg(rd.weight_change_percent), 1) as avg_weight_change_percent,
      round(avg(rd.waist_change_percent), 1) as avg_waist_change_percent,
      case
        when count(*) filter (where rd.has_content) = 0 then null
        else round(
          sum(
            case
              when rd.has_content
                and jsonb_typeof(rd.day->'meals') = 'array'
                and jsonb_array_length(rd.day->'meals') = 3
              then
                (case when rd.day->'meals'->0 = 'true'::jsonb then 1 else 0 end)
                + (case when rd.day->'meals'->1 = 'true'::jsonb then 1 else 0 end)
                + (case when rd.day->'meals'->2 = 'true'::jsonb then 1 else 0 end)
              else 0
            end
          )::numeric / (count(*) filter (where rd.has_content) * 3) * 100,
          1
        )
      end as meal_completion_rate,
      case
        when count(*) filter (where rd.has_content) = 0 then null
        else round(
          count(*) filter (
            where rd.has_content
              and jsonb_typeof(rd.day->'water') = 'boolean'
              and (rd.day->>'water')::boolean
          )::numeric / count(*) filter (where rd.has_content) * 100,
          1
        )
      end as water_rate,
      case
        when count(*) filter (where rd.has_content) = 0 then null
        else round(
          count(*) filter (
            where rd.has_content
              and jsonb_typeof(rd.day->'movement') = 'boolean'
              and (rd.day->>'movement')::boolean
          )::numeric / count(*) filter (where rd.has_content) * 100,
          1
        )
      end as movement_rate,
      case
        when count(*) filter (where rd.has_content) = 0 then null
        else round(
          count(*) filter (
            where rd.has_content
              and jsonb_typeof(rd.day->'sleep') = 'boolean'
              and (rd.day->>'sleep')::boolean
          )::numeric / count(*) filter (where rd.has_content) * 100,
          1
        )
      end as sleep_rate
    from changed_days rd
    group by rd.day_index
  ),
  aligned_days as (
    select days.day_index
    from generate_series(1, 21) as days(day_index)
  )
  select
    days.day_index,
    coalesce(a.participants, 0)::integer,
    coalesce(a.weight_samples, 0)::integer,
    coalesce(a.waist_samples, 0)::integer,
    a.avg_weight_change_percent,
    a.avg_waist_change_percent,
    case when coalesce(a.participants, 0) = 0 then null else a.meal_completion_rate end,
    case when coalesce(a.participants, 0) = 0 then null else a.water_rate end,
    case when coalesce(a.participants, 0) = 0 then null else a.movement_rate end,
    case when coalesce(a.participants, 0) = 0 then null else a.sleep_rate end
  from aligned_days days
  left join aggregated a on a.day_index = days.day_index
  order by days.day_index;
end;
$function$;

revoke all on function public.get_coach_camp_trends_v1(text)
from public, anon, authenticated;
grant execute on function public.get_coach_camp_trends_v1(text) to authenticated;

comment on function public.get_coach_camp_trends_v1(text) is
  'STABLE D1-D21 aggregate only: Admin own/all, coach own; no identity, raw records or per-user rows.';

commit;
