begin;

-- 仅回填历史 NULL 映射；邮箱不区分大小写，已绑定的 auth 主体不得被重复占用。
update public.camp_admins a
set auth_user_id = u.id
from auth.users u
where a.auth_user_id is null
  and lower(a.email) = lower(u.email)
  and not exists (
    select 1
    from public.camp_admins existing
    where existing.auth_user_id = u.id
  );

-- Admin 鉴权继续使用有效 admin 白名单；教练目录以当前有效归属关系为准。
create or replace function public.admin_get_coach_directory(p_query text)
returns table (coach_id uuid, email text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_query text := btrim(coalesce(p_query, ''));
begin
  if v_auth_user_id is null or not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if char_length(v_query) < 2 then
    return;
  end if;

  return query
  select u.id, u.email
  from (
    select distinct r.referrer_id
    from public.user_coach_relation r
    where r.referrer_id is not null
      and r.valid_to is null
  ) coaches
  join auth.users u on u.id = coaches.referrer_id
  where u.email ilike '%' || v_query || '%'
  order by u.email, u.id
  limit 10;
end;
$function$;

create or replace function public.allocate_codes_to_coach(
  p_coach_id uuid,
  p_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_code_ids uuid[];
  v_selected_count integer;
  v_inventory public.coach_inventory%rowtype;
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id
      and a.role = 'admin'
      and a.is_active
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_coach_id is null or p_count is null or p_count <= 0 then
    raise exception 'INVALID_ALLOCATION';
  end if;
  if not exists (
    select 1
    from public.user_coach_relation r
    where r.referrer_id = p_coach_id
      and r.valid_to is null
  ) then
    raise exception 'COACH_NOT_FOUND';
  end if;

  -- 先锁平台码行；SKIP LOCKED 让并发划拨只能取得互不重叠的库存。
  select array_agg(locked.code_id) into v_code_ids
  from (
    select b.code_id
    from public.box_codes b
    where b.inventory_status = 'platform'
      and b.state = 'unused'
    order by b.created_at, b.code_id
    limit p_count
    for update skip locked
  ) locked;

  v_selected_count := coalesce(array_length(v_code_ids, 1), 0);
  if v_selected_count <> p_count then
    raise exception 'INVENTORY_INSUFFICIENT';
  end if;

  perform set_config('app.inventory_allocation_verified', 'on', true);
  update public.box_codes
  set
    coach_id = p_coach_id,
    inventory_status = 'coach',
    version = version + 1,
    updated_at = now()
  where code_id = any(v_code_ids);

  -- 遵循 box_codes 后再锁库存行的全局顺序。
  select * into v_inventory
  from public.coach_inventory
  where coach_id = p_coach_id
  for update;

  if found then
    update public.coach_inventory
    set
      allocated_count = allocated_count + p_count,
      available_count = available_count + p_count,
      version = version + 1,
      updated_at = now()
    where coach_id = p_coach_id;
  else
    insert into public.coach_inventory (
      coach_id,
      allocated_count,
      available_count
    ) values (
      p_coach_id,
      p_count,
      p_count
    );
  end if;

  insert into public.inventory_logs (
    event_type,
    coach_id,
    quantity,
    operator_id
  ) values (
    'coach_allocated',
    p_coach_id,
    p_count,
    v_auth_user_id
  );

  return jsonb_build_object(
    'ok', true,
    'coachId', p_coach_id,
    'allocatedCount', p_count,
    'codeIds', to_jsonb(v_code_ids)
  );
end;
$function$;

-- 在原有原子审核事务前增加服务端归属核对；旧函数权限与校验仍继续生效。
create or replace function public.admin_review_box_code_activation_v2(
  p_activation_id uuid,
  p_decision text,
  p_target_coach_id uuid,
  p_shipment_verification_ref text default null,
  p_payment_verification_ref text default null,
  p_rejection_reason_code text default null,
  p_expected_code_version integer default null,
  p_expected_activation_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is null or not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_target_coach_id is null or not exists (
    select 1
    from public.user_coach_relation r
    where r.referrer_id = p_target_coach_id
      and r.valid_to is null
  ) then
    raise exception 'COACH_SELECTION_MISMATCH';
  end if;
  if not exists (
    select 1
    from public.code_activations a
    join public.box_codes b on b.code_id = a.code_id
    where a.activation_id = p_activation_id
      and a.review_state = 'pending'
      and b.state = 'pending_review'
      and b.coach_id = p_target_coach_id
  ) then
    raise exception 'COACH_SELECTION_MISMATCH';
  end if;

  return public.admin_review_box_code_activation(
    p_activation_id,
    p_decision,
    p_shipment_verification_ref,
    p_payment_verification_ref,
    p_rejection_reason_code,
    p_expected_code_version,
    p_expected_activation_version
  );
end;
$function$;

create or replace function public.get_my_code_inventory()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_pepper text;
  v_restock_point integer;
  v_available_count integer;
  v_codes jsonb;
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select decrypted_secret into v_pepper
  from vault.decrypted_secrets
  where name = 'box_code_pepper';
  if v_pepper is null or v_pepper = '' then
    raise exception 'BOX_CODE_PEPPER_NOT_CONFIGURED';
  end if;

  select (c.config_value #>> '{}')::integer into v_restock_point
  from public.system_configs c
  where c.config_key = 'coach_restock_point';
  if not found or v_restock_point is null or v_restock_point < 0 then
    raise exception 'SYSTEM_CONFIG_MISSING';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'codeId', b.code_id,
      'code', pgp_sym_decrypt(b.code_ciphertext, v_pepper),
      'boxSpec', b.box_spec,
      'maxCheckins', b.max_checkins,
      'createdAt', b.created_at
    ) order by b.created_at, b.code_id
  ), '[]'::jsonb)
  into v_codes
  from public.box_codes b
  where b.coach_id = v_auth_user_id
    and b.state = 'unused'
    and b.inventory_status = 'coach'
    and b.code_ciphertext is not null;

  v_available_count := coalesce(jsonb_array_length(v_codes), 0);
  return jsonb_build_object(
    'ok', true,
    'availableCount', v_available_count,
    'restockPoint', v_restock_point,
    'needsRestock', v_available_count < v_restock_point,
    'codes', v_codes
  );
end;
$function$;

commit;
