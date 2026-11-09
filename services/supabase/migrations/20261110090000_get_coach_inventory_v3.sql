begin;

-- PostgREST 签名兼容层：只委托最新库存函数，禁止复制鉴权、Vault 或库存逻辑。
create or replace function public.get_coach_inventory_v3(p_dummy boolean default null)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $function$
  select public.get_my_code_inventory();
$function$;

revoke all on function public.get_coach_inventory_v3(boolean) from public, anon, authenticated;
grant execute on function public.get_coach_inventory_v3(boolean) to authenticated;

comment on function public.get_coach_inventory_v3(boolean) is
  'PostgREST compatibility wrapper; p_dummy is ignored and latest get_my_code_inventory authorization is authoritative.';

commit;
