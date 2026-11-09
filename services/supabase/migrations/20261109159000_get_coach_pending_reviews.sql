begin;

create or replace function public.get_coach_pending_reviews()
returns table (
  code_id uuid,
  code text,
  camper_code text,
  requested_at timestamptz,
  entry_path text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_pepper text;
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id
      and a.role = 'coach'
      and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select decrypted_secret into v_pepper
  from vault.decrypted_secrets
  where name = 'box_code_pepper';
  if v_pepper is null or v_pepper = '' then
    raise exception 'BOX_CODE_PEPPER_NOT_CONFIGURED';
  end if;

  return query
  select
    b.code_id,
    pgp_sym_decrypt(b.code_ciphertext, v_pepper) as code,
    a.camper_code,
    a.created_at as requested_at,
    a.request_source as entry_path
  from public.code_activations a
  join public.box_codes b on b.code_id = a.code_id
  where b.coach_id = v_auth_user_id
    and b.inventory_status = 'coach'
    and b.state = 'pending_review'
    and a.review_state = 'pending'
  order by a.created_at, a.activation_id;
end;
$function$;

revoke all on function public.get_coach_pending_reviews() from public, anon, authenticated;
grant execute on function public.get_coach_pending_reviews() to authenticated;

comment on function public.get_coach_pending_reviews() is
  'Formal coach own pending inventory only; manual and direct-push sources; no UID, email or health records.';

commit;
