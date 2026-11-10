begin;

-- 迁移执行台账由受控执行器写入；浏览器角色无直读、直写权限。
create table if not exists public.supabase_migrations (
  version text primary key,
  filename text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  executed_at timestamptz not null default now(),
  result text not null check (result in ('success', 'failed')),
  execution_environment text not null,
  notes text
);

revoke all on table public.supabase_migrations from public, anon, authenticated;

comment on table public.supabase_migrations is
  'Controlled migration execution ledger. SHA-256 is calculated and inserted by the external migration runner.';

-- 不依赖人工函数清单：穷举最终 public 普通函数，并显式覆盖不含 pgcrypto
-- 关键词的库存包装器。只改变执行路径，不改变函数体、鉴权或返回结构。
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

-- 保持既有最小权限，不因路径补丁扩大其他函数的 ACL。
revoke all on function public.get_coach_inventory_v3(boolean)
  from public, anon, authenticated;
grant execute on function public.get_coach_inventory_v3(boolean)
  to authenticated;

commit;
