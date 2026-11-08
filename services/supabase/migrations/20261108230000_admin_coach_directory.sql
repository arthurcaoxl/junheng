begin;

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
  select a.auth_user_id, a.email
  from public.camp_admins a
  where a.role = 'coach'
    and a.is_active
    and a.auth_user_id is not null
    and a.email ilike '%' || v_query || '%'
  order by a.email, a.auth_user_id
  limit 10;
end;
$function$;

revoke all on function public.admin_get_coach_directory(text) from public, anon, authenticated;
grant execute on function public.admin_get_coach_directory(text) to authenticated;

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
    select 1 from public.camp_admins a
    where a.auth_user_id = p_target_coach_id and a.role = 'coach' and a.is_active
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

revoke all on function public.admin_review_box_code_activation_v2(uuid, text, uuid, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_review_box_code_activation_v2(uuid, text, uuid, text, text, text, integer, integer) to authenticated;

commit;
