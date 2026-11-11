begin;

-- 全仓无带参库存重载业务调用；删除预发手工遗留，避免 DEFAULT 重载歧义。
drop function if exists public.get_my_code_inventory(boolean);

commit;
