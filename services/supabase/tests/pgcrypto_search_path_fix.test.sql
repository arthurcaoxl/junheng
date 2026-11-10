-- 基于全部历史迁移验证新增补丁；历史文件保持只读。
\ir final_clearance.test.sql
\ir final_staff_allocation.test.sql

-- 模拟一个未被人工清单捕获的 pgcrypto 函数，验证系统目录扫描而非记忆清单。
create or replace function public.test_pgcrypto_path_leak(p_text text)
returns text
language sql
security definer
set search_path = public, pg_temp
as $function$
  select encode(extensions.digest(p_text, 'sha256'), 'hex');
$function$;

-- 连续执行两次，验证补丁可安全重放。
\ir ../migrations/20261110175500_pgcrypto_search_path_fix.sql
\ir ../migrations/20261110175500_pgcrypto_search_path_fix.sql

select test.assert_extension_search_path('get_coach_inventory_v3');
select test.assert_extension_search_path('test_pgcrypto_path_leak');

select test.assert_true(
  to_regclass('public.supabase_migrations') is not null,
  'migration ledger table must exist'
);
select test.assert_true(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'supabase_migrations'
      and column_name = 'version'
      and data_type = 'text'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'supabase_migrations'
      and column_name = 'sha256'
      and data_type = 'text'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'supabase_migrations'
      and column_name = 'executed_at'
      and data_type = 'timestamp with time zone'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'supabase_migrations'
      and column_name = 'result'
      and data_type = 'text'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'supabase_migrations'
      and column_name = 'execution_environment'
      and data_type = 'text'
  ),
  'migration ledger must contain version/hash/time/result/environment fields'
);
select test.assert_true(
  not has_table_privilege('anon', 'public.supabase_migrations', 'select,insert,update,delete')
    and not has_table_privilege('authenticated', 'public.supabase_migrations', 'select,insert,update,delete')
    and not has_table_privilege('public', 'public.supabase_migrations', 'select,insert,update,delete'),
  'browser roles must not read or mutate the migration ledger'
);
select test.assert_true(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ilike '%pgp_sym_%'
      and (
        p.proconfig is null
        or not exists (
          select 1 from unnest(p.proconfig) c
          where c ilike 'search_path=%extensions%'
        )
      )
  ),
  'system catalog pgcrypto audit must be empty after the patch'
);

drop function public.test_pgcrypto_path_leak(text);
select 'PASS: inventory v3, exhaustive pgcrypto paths, idempotency and migration ledger' as result;
