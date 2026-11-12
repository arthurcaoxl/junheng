-- TASK-10.16-R05：种子兼容打卡与真实盒码扣次共用物理日幂等边界。
begin;

alter table public.checkin_daily_claims
  add column claim_id uuid,
  add column claim_source text;

update public.checkin_daily_claims
set
  claim_id = coalesce(claim_id, gen_random_uuid()),
  claim_source = coalesce(claim_source, 'box_code');

do $migration$
begin
  if exists (
    select 1
    from public.checkin_daily_claims d
    where d.claim_id is null
      or d.claim_source is null
      or d.claim_source <> 'box_code'
      or d.code_id is null
  ) then
    raise exception 'LEGACY_CLAIM_BACKFILL_INVALID';
  end if;
  if exists (
    select 1
    from public.checkin_daily_claims d
    group by d.code_id, d.physical_day
    having count(*) > 1
  ) then
    raise exception 'LEGACY_CLAIM_BACKFILL_DUPLICATE';
  end if;
end;
$migration$;

alter table public.checkin_daily_claims
  alter column claim_id set default gen_random_uuid(),
  alter column claim_id set not null,
  alter column claim_source set default 'box_code',
  alter column claim_source set not null;

create unique index checkin_daily_claims_claim_id_unique
  on public.checkin_daily_claims (claim_id);

alter table public.checkin_daily_claims
  drop constraint checkin_daily_claims_pkey;

alter table public.checkin_daily_claims
  add constraint checkin_daily_claims_pkey
  primary key using index checkin_daily_claims_claim_id_unique;

alter table public.checkin_daily_claims
  alter column code_id drop not null;

alter table public.checkin_daily_claims
  add constraint checkin_daily_claims_source_check
    check (claim_source in ('box_code', 'legacy')),
  add constraint checkin_daily_claims_source_code_check
    check (
      (claim_source = 'box_code' and code_id is not null)
      or (claim_source = 'legacy' and code_id is null)
    ),
  add constraint checkin_daily_claims_legacy_used_check
    check (claim_source <> 'legacy' or used_checkins = 1);

create unique index checkin_daily_claims_box_code_day_unique
  on public.checkin_daily_claims (code_id, physical_day)
  where claim_source = 'box_code';
create unique index checkin_daily_claims_legacy_user_day_unique
  on public.checkin_daily_claims (auth_user_id, physical_day)
  where claim_source = 'legacy';
create index checkin_daily_claims_user_day_source
  on public.checkin_daily_claims (auth_user_id, physical_day, claim_source);

alter table public.checkin_daily_claims enable row level security;
revoke all on public.checkin_daily_claims from public, anon, authenticated;

create or replace function public.verify_checkin(
  p_start_date date,
  p_records jsonb,
  p_height_cm numeric,
  p_initial_weight_kg numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_code public.box_codes%rowtype;
  v_physical_day date := (now() at time zone 'Asia/Shanghai')::date;
  v_claimed_id uuid;
  v_idempotent boolean := false;
  v_legacy boolean := false;
  v_activation_status jsonb;
  v_expiry_policy_expires_at timestamptz;
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_start_date is null or jsonb_typeof(p_records) <> 'object' then
    raise exception 'CHECKIN_SNAPSHOT_INVALID';
  end if;

  -- 所有分支先串行化同一用户，再按固定顺序锁真实盒码，覆盖无码与混合态并发。
  perform pg_advisory_xact_lock(hashtextextended('verify-checkin-user:' || v_auth_user_id::text, 0));

  perform 1
  from public.checkin_sync s
  where s.auth_user_id = v_auth_user_id;
  if not found then
    raise exception 'CHECKIN_PROFILE_REQUIRED';
  end if;

  select b.* into v_code
  from public.box_codes b
  join public.code_activations a on a.code_id = b.code_id
  where a.auth_user_id = v_auth_user_id
  order by a.activated_at desc nulls last, a.created_at desc, b.code_id
  limit 1
  for update of b;

  if not found then
    -- 只有完全没有盒码申请时才读取种子资格，不能由客户端指定 claim_source。
    v_legacy := true;
    v_activation_status := public.get_my_activation_status();
    if v_activation_status ->> 'state' is distinct from 'legacy_granted' then
      raise exception 'CHECKIN_CODE_NOT_AVAILABLE';
    end if;

    perform 1
    from public.checkin_daily_claims d
    where d.auth_user_id = v_auth_user_id
      and d.physical_day = v_physical_day;
    if found then
      v_idempotent := true;
    else
      insert into public.checkin_daily_claims (
        code_id,
        auth_user_id,
        physical_day,
        used_checkins,
        claim_source
      ) values (
        null,
        v_auth_user_id,
        v_physical_day,
        1,
        'legacy'
      )
      on conflict (auth_user_id, physical_day) where claim_source = 'legacy' do nothing
      returning claim_id into v_claimed_id;

      if v_claimed_id is null then
        v_idempotent := true;
      end if;
    end if;
  else
    if v_code.state <> 'active' then
      raise exception 'CHECKIN_NOT_ACTIVE';
    end if;

    select (c.config_value ->> 'default_expires_at')::timestamptz
    into v_expiry_policy_expires_at
    from public.system_configs c
    where c.config_key = 'box_code_expiry_policy';
    if not found or v_expiry_policy_expires_at is null then
      raise exception 'SYSTEM_CONFIG_MISSING';
    end if;

    if v_code.expires_at is null or v_code.expires_at <= now() then
      raise exception 'CHECKIN_CODE_EXPIRED';
    end if;

    -- 原盒码同日幂等保持不变，同时覆盖同日 legacy 后绑定真实盒码的回放。
    perform 1
    from public.checkin_daily_claims d
    where d.physical_day = v_physical_day
      and (
        d.code_id = v_code.code_id
        or (d.auth_user_id = v_auth_user_id and d.claim_source = 'legacy')
      );
    if found then
      v_idempotent := true;
    else
      if v_code.used_checkins >= v_code.max_checkins then
        raise exception 'CHECKIN_QUOTA_EXHAUSTED';
      end if;

      insert into public.checkin_daily_claims (
        code_id,
        auth_user_id,
        physical_day,
        used_checkins,
        claim_source
      ) values (
        v_code.code_id,
        v_auth_user_id,
        v_physical_day,
        v_code.used_checkins + 1,
        'box_code'
      )
      on conflict (code_id, physical_day) where claim_source = 'box_code' do nothing
      returning code_id into v_claimed_id;

      if v_claimed_id is null then
        v_idempotent := true;
      else
        update public.box_codes
        set
          used_checkins = v_code.used_checkins + 1,
          version = version + 1,
          updated_at = now()
        where code_id = v_code.code_id;

        v_code.used_checkins := v_code.used_checkins + 1;

        insert into public.box_code_events (
          event_type,
          code_id,
          activation_id,
          actor_auth_user_id,
          metadata
        ) values (
          'CheckinVerified',
          v_code.code_id,
          v_code.activation_id,
          v_auth_user_id,
          jsonb_build_object(
            'physicalDay', v_physical_day,
            'usedCheckins', v_code.used_checkins,
            'maxCheckins', v_code.max_checkins
          )
        );
      end if;
    end if;
  end if;

  -- 同日重复保存仍保存最新快照；任一步失败，整个函数事务回滚。
  perform set_config('app.checkin_quota_verified', 'on', true);
  update public.checkin_sync
  set
    start_date = p_start_date,
    records = p_records,
    height_cm = p_height_cm,
    initial_weight_kg = p_initial_weight_kg,
    updated_at = now()
  where auth_user_id = v_auth_user_id;

  if v_legacy then
    return jsonb_build_object(
      'ok', true,
      'idempotent', v_idempotent,
      'physicalDay', v_physical_day,
      'maxCheckins', 1,
      'usedCheckins', 1,
      'remainingCheckins', 0,
      'boxSpec', 'legacy'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'idempotent', v_idempotent,
    'physicalDay', v_physical_day,
    'maxCheckins', v_code.max_checkins,
    'usedCheckins', v_code.used_checkins,
    'remainingCheckins', greatest(v_code.max_checkins - v_code.used_checkins, 0),
    'boxSpec', v_code.box_spec
  );
end;
$function$;

create or replace function public.coach_promotion_effective_checkin_days(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $function$
  select count(distinct d.physical_day)::integer
  from public.checkin_daily_claims d
  join public.box_codes b on b.code_id = d.code_id and b.state = 'active'
  join public.code_activations a
    on a.code_id = b.code_id and a.activation_id = b.activation_id
  where d.auth_user_id = p_user_id
    and a.auth_user_id = p_user_id
    and d.claim_source = 'box_code'
    and d.used_checkins > 0
    and a.review_state = 'approved'
    and a.activated_at is not null;
$function$;

revoke all on function public.verify_checkin(date, jsonb, numeric, numeric)
from public, anon, authenticated;
grant execute on function public.verify_checkin(date, jsonb, numeric, numeric) to authenticated;

commit;
