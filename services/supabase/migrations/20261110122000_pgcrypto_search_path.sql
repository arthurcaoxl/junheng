begin;

-- Supabase installs pgcrypto in extensions. Preserve every final function body,
-- return contract and authorization decision; only pin its execution path and ACL.
alter function public.admin_assign_staff_coach(uuid, uuid, integer, text)
  set search_path = public, extensions, pg_temp;
revoke all on function public.admin_assign_staff_coach(uuid, uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.admin_assign_staff_coach(uuid, uuid, integer, text)
  to authenticated;

alter function public.admin_get_pending_box_code_reviews()
  set search_path = public, extensions, pg_temp;
revoke all on function public.admin_get_pending_box_code_reviews()
  from public, anon, authenticated;
grant execute on function public.admin_get_pending_box_code_reviews()
  to authenticated;

-- The v2 review delegates rejected replacement issuance to this legacy function.
alter function public.admin_review_box_code_activation(uuid, text, text, text, text, integer, integer)
  set search_path = public, extensions, pg_temp;
revoke all on function public.admin_review_box_code_activation(uuid, text, text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.admin_review_box_code_activation(uuid, text, text, text, text, integer, integer)
  to authenticated;

alter function public.admin_revoke_staff_coach(uuid, integer, text)
  set search_path = public, extensions, pg_temp;
revoke all on function public.admin_revoke_staff_coach(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.admin_revoke_staff_coach(uuid, integer, text)
  to authenticated;

alter function public.admin_set_coach_role(text, boolean, integer, text)
  set search_path = public, extensions, pg_temp;
revoke all on function public.admin_set_coach_role(text, boolean, integer, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_coach_role(text, boolean, integer, text)
  to authenticated;

alter function public.get_coach_pending_reviews()
  set search_path = public, extensions, pg_temp;
revoke all on function public.get_coach_pending_reviews()
  from public, anon, authenticated;
grant execute on function public.get_coach_pending_reviews()
  to authenticated;

alter function public.request_box_code_activation(text, text, text)
  set search_path = public, extensions, pg_temp;
revoke all on function public.request_box_code_activation(text, text, text)
  from public, anon, authenticated;
grant execute on function public.request_box_code_activation(text, text, text)
  to authenticated;

commit;
