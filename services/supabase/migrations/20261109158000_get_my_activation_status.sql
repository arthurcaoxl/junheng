begin;

create or replace function public.get_my_activation_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_activation public.code_activations%rowtype;
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  select a.* into v_activation
  from public.code_activations a
  where a.auth_user_id = v_auth_user_id
  order by a.created_at desc, a.activation_id desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'state', 'none',
      'requested_at', null,
      'rejection_hint', null
    );
  end if;

  return jsonb_build_object(
    'state', case v_activation.review_state
      when 'pending' then 'pending_review'
      when 'approved' then 'active'
      when 'rejected' then 'rejected'
    end,
    'requested_at', v_activation.created_at,
    'rejection_hint', case
      when v_activation.review_state = 'rejected' then 'contact_coach'
      else null
    end
  );
end;
$function$;

revoke all on function public.get_my_activation_status() from public, anon, authenticated;
grant execute on function public.get_my_activation_status() to authenticated;

comment on function public.get_my_activation_status() is
  'Current user latest activation review only; no code, reviewer, internal reason or other user data.';

commit;
