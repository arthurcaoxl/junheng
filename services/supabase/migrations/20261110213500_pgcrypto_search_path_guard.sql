begin;

-- R2 双保险：保留 175500 的动态扫描作为兜底，再按系统目录提取的
-- 真实函数签名逐点设置 search_path。重复执行只重设路径，幂等。
do $patch$
declare
  v_signature text;
begin
  for v_signature in
    select format(
      '%s.%s(%s)',
      quote_ident(n.nspname),
      quote_ident(p.proname),
      pg_get_function_identity_arguments(p.oid)
    )
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and (
        pg_get_functiondef(p.oid) ~ '(pgp_sym_|hmac\(|digest\(|gen_random_bytes\(|gen_random_uuid\()'
        or (
          p.proname = 'get_coach_inventory_v3'
          and pg_get_function_identity_arguments(p.oid) = 'p_dummy boolean'
        )
      )
      and (
        p.proconfig is null
        or not exists (
          select 1
          from unnest(p.proconfig) c
          where c ilike 'search_path=%extensions%'
        )
      )
  loop
    execute format(
      'alter function %s set search_path = public, extensions, pg_temp',
      v_signature
    );
  end loop;
end;
$patch$;

-- 以下来自 2026-11-10 21:32:32 +0800 的 pg_proc 实查结果；
-- get_coach_inventory_v3 另按真实签名 p_dummy boolean 显式守卫。
alter function public.generate_platform_codes(p_count integer, p_box_spec text, p_offline_receipt_no text)
  set search_path = public, extensions, pg_temp;
alter function public.get_my_code_inventory()
  set search_path = public, extensions, pg_temp;
alter function public.admin_get_pending_box_code_reviews()
  set search_path = public, extensions, pg_temp;
alter function public.admin_review_box_code_activation(p_activation_id uuid, p_decision text, p_shipment_verification_ref text, p_payment_verification_ref text, p_rejection_reason_code text, p_expected_code_version integer, p_expected_activation_version integer)
  set search_path = public, extensions, pg_temp;
alter function public.coach_push_code_v1(p_camper_ref uuid, p_code_id uuid, p_idempotency_key text)
  set search_path = public, extensions, pg_temp;
alter function public.get_coach_pending_reviews()
  set search_path = public, extensions, pg_temp;
alter function public.get_coach_inventory_v3(p_dummy boolean)
  set search_path = public, extensions, pg_temp;

commit;
