begin;

-- TASK-10.15 G-S1：staff 仅保留分配范围雷达；库存查询在 Vault 与业务读取前物理拒绝。
create or replace function public.get_my_access_profile()
returns table (role text, can_view_radar boolean, can_manage_inventory boolean)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_role text;
begin
  select a.role into v_role
  from public.camp_admins a
  where a.auth_user_id = auth.uid() and a.is_active;
  if not found then return; end if;
  return query select v_role, true, v_role = 'coach';
end;
$function$;

create or replace function public.get_my_code_inventory()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_pepper text;
  v_restock_point integer;
  v_available_count integer;
  v_codes jsonb;
begin
  if v_auth_user_id is null then raise exception 'UNAUTHORIZED'; end if;
  if public.coach_promotion_is_probational(v_auth_user_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'staff'
  ) or not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'coach' and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select decrypted_secret into v_pepper from vault.decrypted_secrets where name = 'box_code_pepper';
  if v_pepper is null or v_pepper = '' then raise exception 'BOX_CODE_PEPPER_NOT_CONFIGURED'; end if;
  select (c.config_value #>> '{}')::integer into v_restock_point
  from public.system_configs c where c.config_key = 'coach_restock_point';
  if not found or v_restock_point is null or v_restock_point < 0 then
    raise exception 'SYSTEM_CONFIG_MISSING';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'codeId', b.code_id, 'code', pgp_sym_decrypt(b.code_ciphertext, v_pepper),
      'boxSpec', b.box_spec, 'maxCheckins', b.max_checkins, 'createdAt', b.created_at
    ) order by b.created_at, b.code_id
  ), '[]'::jsonb) into v_codes
  from public.box_codes b
  where b.coach_id = v_auth_user_id and b.state = 'unused'
    and b.inventory_status = 'coach' and b.code_ciphertext is not null;
  v_available_count := coalesce(jsonb_array_length(v_codes), 0);
  return jsonb_build_object(
    'ok', true, 'availableCount', v_available_count, 'restockPoint', v_restock_point,
    'needsRestock', v_available_count < v_restock_point, 'codes', v_codes
  );
end;
$function$;

revoke all on function public.get_my_access_profile() from public, anon, authenticated;
revoke all on function public.get_my_code_inventory() from public, anon, authenticated;
grant execute on function public.get_my_access_profile() to authenticated;
grant execute on function public.get_my_code_inventory() to authenticated;

comment on function public.get_my_code_inventory() is
  'TASK-10.15: formal coach own inventory only; staff is denied with SQLSTATE 42501 before Vault or inventory reads.';

commit;
