\ir ux_flow_test_bootstrap.sql
\ir ../migrations/20261113120000_admin_seed_user_whitelist_rpc.sql

begin;

create function pg_temp.assert_seed_raises(
  p_expected_message text,
  p_expected_sqlstate text,
  p_sql text
)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'ASSERTION_FAILED: expected % / %, but statement succeeded',
    p_expected_message, p_expected_sqlstate;
exception when others then
  if sqlstate = p_expected_sqlstate
    and (p_expected_message is null or sqlerrm = p_expected_message) then
    return;
  end if;
  raise exception 'ASSERTION_FAILED: expected % / %, got % / %',
    p_expected_message, p_expected_sqlstate, sqlerrm, sqlstate;
end;
$$;

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'admin@seed-admin.test'),
  ('10000000-0000-0000-0000-000000000002', 'inactive@seed-admin.test'),
  ('10000000-0000-0000-0000-000000000003', 'staff@seed-admin.test'),
  ('10000000-0000-0000-0000-000000000004', 'coach@seed-admin.test'),
  ('10000000-0000-0000-0000-000000000005', 'user@seed-admin.test');

insert into public.camp_admins (email, auth_user_id, role, is_active) values
  ('admin@seed-admin.test', '10000000-0000-0000-0000-000000000001', 'admin', true),
  ('inactive@seed-admin.test', '10000000-0000-0000-0000-000000000002', 'admin', false),
  ('staff@seed-admin.test', '10000000-0000-0000-0000-000000000003', 'staff', true),
  ('coach@seed-admin.test', '10000000-0000-0000-0000-000000000004', 'coach', true);

delete from public.system_configs where config_key = 'seed_user_whitelist';

set role authenticated;
select set_config('app.test_auth_uid', '10000000-0000-0000-0000-000000000001', false);
create temporary table seed_initial_read as
select public.admin_get_seed_user_whitelist() as result;
select test.assert_true(
  (select result = '{"ok":true,"configExists":false,"emails":[],"updatedAt":null}'::jsonb
  from seed_initial_read),
  'missing whitelist must read as an empty versioned configuration'
);

select set_config('app.test_auth_uid', '', false);
select pg_temp.assert_seed_raises(
  'UNAUTHORIZED', '42501', 'select public.admin_get_seed_user_whitelist()'
);
select pg_temp.assert_seed_raises(
  'UNAUTHORIZED', '42501',
  'select public.admin_add_seed_user_whitelist_email(''a@example.test'', false, null)'
);
select pg_temp.assert_seed_raises(
  'UNAUTHORIZED', '42501',
  'select public.admin_remove_seed_user_whitelist_email(''a@example.test'', false, null)'
);

select set_config('app.test_auth_uid', '10000000-0000-0000-0000-000000000002', false);
select pg_temp.assert_seed_raises(
  'FORBIDDEN', '42501', 'select public.admin_get_seed_user_whitelist()'
);
select set_config('app.test_auth_uid', '10000000-0000-0000-0000-000000000003', false);
select pg_temp.assert_seed_raises(
  'FORBIDDEN', '42501',
  'select public.admin_add_seed_user_whitelist_email(''a@example.test'', false, null)'
);
select set_config('app.test_auth_uid', '10000000-0000-0000-0000-000000000004', false);
select pg_temp.assert_seed_raises(
  'FORBIDDEN', '42501',
  'select public.admin_remove_seed_user_whitelist_email(''a@example.test'', false, null)'
);
select set_config('app.test_auth_uid', '10000000-0000-0000-0000-000000000005', false);
select pg_temp.assert_seed_raises(
  'FORBIDDEN', '42501', 'select public.admin_get_seed_user_whitelist()'
);

select set_config('app.test_auth_uid', '10000000-0000-0000-0000-000000000001', false);
select pg_temp.assert_seed_raises(
  null, '42883',
  'select public.admin_add_seed_user_whitelist_email(''a@example.test'', false, null, ''10000000-0000-0000-0000-000000000001'', ''admin'')'
);
select pg_temp.assert_seed_raises(
  'INVALID_EMAIL', '22023',
  'select public.admin_add_seed_user_whitelist_email(''not-an-email'', false, null)'
);
select pg_temp.assert_seed_raises(
  'INVALID_EMAIL', '22023',
  'select public.admin_remove_seed_user_whitelist_email(null, false, null)'
);
select pg_temp.assert_seed_raises(
  'SEED_USER_WHITELIST_VERSION_CONFLICT', '40001',
  'select public.admin_add_seed_user_whitelist_email(''a@example.test'', true, null)'
);
select pg_temp.assert_seed_raises(
  'SEED_USER_WHITELIST_VERSION_CONFLICT', '40001',
  'select public.admin_add_seed_user_whitelist_email(''a@example.test'', false, now())'
);

create temporary table seed_add_alpha as
select public.admin_add_seed_user_whitelist_email(
  '  Alpha.Person@Example.TEST  ', false, null
) as result;
select test.assert_true(
  (select result ->> 'ok' = 'true'
    and result ->> 'changed' = 'true'
    and result ->> 'configExists' = 'true'
    and result -> 'emails' = '["alpha.person@example.test"]'::jsonb
    and result ->> 'updatedAt' is not null
    and result ->> 'auditId' is not null
    and result ->> 'auditedAt' is not null
  from seed_add_alpha),
  'create must normalize email and return mutation and audit metadata'
);
create temporary table seed_version_state as
select (result ->> 'updatedAt')::timestamptz as updated_at from seed_add_alpha;
reset role;
create temporary table seed_noop_counts as
select
  (select count(*) from public.system_config_audit where config_key = 'seed_user_whitelist' and changed_by = '10000000-0000-0000-0000-000000000001') as config_audits,
  (select count(*) from public.audit_logs where metadata ->> 'target' = 'system_configs:seed_user_whitelist') as admin_audits;

set role authenticated;
select set_config('app.test_auth_uid', '10000000-0000-0000-0000-000000000001', false);
create temporary table seed_duplicate_alpha as
select public.admin_add_seed_user_whitelist_email(
  'ALPHA.PERSON@example.test', true, (select updated_at from seed_version_state)
) as result;
select test.assert_true(
  (select result ->> 'changed' = 'false'
    and result ->> 'reason' = 'ALREADY_EXISTS'
    and result ->> 'auditId' is null
    and (result ->> 'updatedAt')::timestamptz = (select updated_at from seed_version_state)
  from seed_duplicate_alpha),
  'duplicate add must be a no-op with the same version'
);
reset role;
select test.assert_true(
  (select c.config_audits = (select count(*) from public.system_config_audit where config_key = 'seed_user_whitelist' and changed_by = '10000000-0000-0000-0000-000000000001')
    and c.admin_audits = (select count(*) from public.audit_logs where metadata ->> 'target' = 'system_configs:seed_user_whitelist')
  from seed_noop_counts c),
  'duplicate add must not append either audit trail'
);

set role authenticated;
select set_config('app.test_auth_uid', '10000000-0000-0000-0000-000000000001', false);
select pg_temp.assert_seed_raises(
  'SEED_USER_WHITELIST_VERSION_CONFLICT', '40001',
  'select public.admin_add_seed_user_whitelist_email(''beta@example.test'', false, null)'
);

create temporary table seed_add_beta as
select public.admin_add_seed_user_whitelist_email(
  'beta@example.test', true, (select updated_at from seed_version_state)
) as result;
update seed_version_state set updated_at = (
  select (result ->> 'updatedAt')::timestamptz from seed_add_beta
);
select test.assert_true(
  (select result -> 'emails' = '["alpha.person@example.test","beta@example.test"]'::jsonb
  from seed_add_beta),
  'second add must preserve sorted whitelist contents'
);

reset role;
select test.assert_true(
  (select count(*) = 2
    and count(distinct target_id) = 2
    and count(distinct audit_id) = 2
    and bool_and(target_id is not null)
    and bool_and(metadata ->> 'target' = 'system_configs:seed_user_whitelist')
    and bool_and(metadata ->> 'key' = 'seed_user_whitelist')
    and bool_and(actor_id = '10000000-0000-0000-0000-000000000001')
    and bool_and(reviewer_id = '10000000-0000-0000-0000-000000000001')
    and bool_and(from_coach_id is null and to_coach_id is null)
  from public.audit_logs
  where metadata ->> 'target' = 'system_configs:seed_user_whitelist'),
  'two mutations must produce distinct UUID target ids and stable metadata targets'
);
select test.assert_true(
  (select count(*) = 2
  from public.audit_logs
  where audit_id in (
    (select (result ->> 'auditId')::uuid from seed_add_alpha),
    (select (result ->> 'auditId')::uuid from seed_add_beta)
  )),
  'each mutation result audit id must identify its own audit row'
);
select test.assert_true(
  (select count(*) = 2
    and bool_and(changed_by = '10000000-0000-0000-0000-000000000001')
  from public.system_config_audit where config_key = 'seed_user_whitelist' and changed_by = '10000000-0000-0000-0000-000000000001'),
  'configuration trigger audit must contain both mutations and the authenticated admin'
);
select test.assert_true(
  (select updated_by = '10000000-0000-0000-0000-000000000001'
  from public.system_configs where config_key = 'seed_user_whitelist'),
  'configuration row must record the authenticated admin as updater'
);

set role authenticated;
select set_config('app.test_auth_uid', '10000000-0000-0000-0000-000000000001', false);
create temporary table seed_remove_missing as
select public.admin_remove_seed_user_whitelist_email(
  'missing@example.test', true, (select updated_at from seed_version_state)
) as result;
select test.assert_true(
  (select result ->> 'changed' = 'false'
    and result ->> 'reason' = 'NOT_FOUND'
    and result ->> 'auditId' is null
  from seed_remove_missing),
  'removing an absent member must be a no-op'
);
select pg_temp.assert_seed_raises(
  'SEED_USER_WHITELIST_VERSION_CONFLICT', '40001',
  'select public.admin_remove_seed_user_whitelist_email(''alpha.person@example.test'', false, null)'
);

create temporary table seed_remove_alpha as
select public.admin_remove_seed_user_whitelist_email(
  ' ALPHA.PERSON@EXAMPLE.TEST ', true, (select updated_at from seed_version_state)
) as result;
update seed_version_state set updated_at = (
  select (result ->> 'updatedAt')::timestamptz from seed_remove_alpha
);
select test.assert_true(
  (select result ->> 'changed' = 'true'
    and result -> 'emails' = '["beta@example.test"]'::jsonb
  from seed_remove_alpha),
  'remove must normalize input and persist the remaining members'
);
create temporary table seed_remove_beta as
select public.admin_remove_seed_user_whitelist_email(
  'beta@example.test', true, (select updated_at from seed_version_state)
) as result;
update seed_version_state set updated_at = (
  select (result ->> 'updatedAt')::timestamptz from seed_remove_beta
);
select test.assert_true(
  (select result ->> 'configExists' = 'true'
    and result -> 'emails' = '[]'::jsonb
  from seed_remove_beta),
  'removing the last member must retain an empty configuration row'
);
create temporary table seed_remove_from_empty as
select public.admin_remove_seed_user_whitelist_email(
  'beta@example.test', true, (select updated_at from seed_version_state)
) as result;
select test.assert_true(
  (select result ->> 'changed' = 'false' and result ->> 'reason' = 'NOT_FOUND'
  from seed_remove_from_empty),
  'empty existing configuration must still report member not found'
);

reset role;
select test.assert_true(
  (select count(*) = 4 from public.system_config_audit where config_key = 'seed_user_whitelist' and changed_by = '10000000-0000-0000-0000-000000000001')
    and (select count(*) = 4 from public.audit_logs where metadata ->> 'target' = 'system_configs:seed_user_whitelist'),
  'no-op removals must not add audit rows after four real mutations'
);
select test.assert_true(
  (select count(*) = 1
  from public.audit_logs
  where action = 'seed_user_whitelist_email_removed'
    and metadata ->> 'operation' = 'remove'
    and metadata ->> 'email' = 'beta@example.test'
    and metadata -> 'before' = '["beta@example.test"]'::jsonb
    and metadata -> 'after' = '[]'::jsonb
    and metadata ->> 'configExistedBefore' = 'true'),
  'remove audit must retain before and after arrays and operation details'
);

savepoint invalid_root;
update public.system_configs set config_value = '"not-an-array"'::jsonb
where config_key = 'seed_user_whitelist';
update seed_version_state set updated_at = (
  select updated_at from public.system_configs where config_key = 'seed_user_whitelist'
);
set role authenticated;
select set_config('app.test_auth_uid', '10000000-0000-0000-0000-000000000001', false);
select pg_temp.assert_seed_raises(
  'SEED_USER_WHITELIST_CONFIG_INVALID', '22023',
  'select public.admin_get_seed_user_whitelist()'
);
select pg_temp.assert_seed_raises(
  'SEED_USER_WHITELIST_CONFIG_INVALID', '22023',
  'select public.admin_add_seed_user_whitelist_email(''gamma@example.test'', true, (select updated_at from seed_version_state))'
);
reset role;
rollback to savepoint invalid_root;

savepoint invalid_member;
update public.system_configs set config_value = '["valid@example.test",1]'::jsonb
where config_key = 'seed_user_whitelist';
set role authenticated;
select set_config('app.test_auth_uid', '10000000-0000-0000-0000-000000000001', false);
select pg_temp.assert_seed_raises(
  'SEED_USER_WHITELIST_CONFIG_INVALID', '22023',
  'select public.admin_get_seed_user_whitelist()'
);
reset role;
rollback to savepoint invalid_member;

savepoint invalid_member_email;
update public.system_configs set config_value = '["not-an-email"]'::jsonb
where config_key = 'seed_user_whitelist';
set role authenticated;
select set_config('app.test_auth_uid', '10000000-0000-0000-0000-000000000001', false);
select pg_temp.assert_seed_raises(
  'SEED_USER_WHITELIST_CONFIG_INVALID', '22023',
  'select public.admin_get_seed_user_whitelist()'
);
reset role;
rollback to savepoint invalid_member_email;

savepoint audit_failure;
create function pg_temp.reject_seed_audit()
returns trigger
language plpgsql
as $$
begin
  raise exception 'SEED_AUDIT_INJECTED';
end;
$$;
create trigger reject_seed_audit
before insert on public.audit_logs
for each row execute function pg_temp.reject_seed_audit();
set role authenticated;
select set_config('app.test_auth_uid', '10000000-0000-0000-0000-000000000001', false);
select pg_temp.assert_seed_raises(
  'SEED_AUDIT_INJECTED', 'P0001',
  'select public.admin_add_seed_user_whitelist_email(''gamma@example.test'', true, (select updated_at from seed_version_state))'
);
reset role;
select test.assert_true(
  (select config_value = '[]'::jsonb from public.system_configs where config_key = 'seed_user_whitelist')
    and (select count(*) = 4 from public.system_config_audit where config_key = 'seed_user_whitelist' and changed_by = '10000000-0000-0000-0000-000000000001')
    and (select count(*) = 4 from public.audit_logs where metadata ->> 'target' = 'system_configs:seed_user_whitelist'),
  'admin audit failure must roll back configuration and trigger audit in the same transaction'
);
rollback to savepoint audit_failure;

savepoint legacy_actions;
alter table public.audit_logs disable trigger audit_log_code_activation_source;
insert into public.audit_logs (action, target_id, actor_id, reviewer_id, metadata)
select action, gen_random_uuid(),
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001', '{}'::jsonb
from (values
  ('code_activation_approved'),
  ('code_activation_rejected'),
  ('coach_users_trusteed'),
  ('coach_promotion_requested'),
  ('coach_promotion_approved'),
  ('coach_promotion_rejected'),
  ('coach_promotion_promoted')
) as allowed(action);
rollback to savepoint legacy_actions;

select test.assert_true(
  (select count(*) = 3
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'admin_get_seed_user_whitelist',
      'admin_add_seed_user_whitelist_email',
      'admin_remove_seed_user_whitelist_email'
    )
    and p.prosecdef
    and p.proconfig = array['search_path=public, extensions, pg_temp']),
  'all RPCs must be security definer with an explicit safe search path'
);
select test.assert_true(
  not has_function_privilege('anon', 'public.admin_get_seed_user_whitelist()', 'execute')
    and not has_function_privilege('public', 'public.admin_get_seed_user_whitelist()', 'execute')
    and has_function_privilege('authenticated', 'public.admin_get_seed_user_whitelist()', 'execute')
    and not has_function_privilege('anon', 'public.admin_add_seed_user_whitelist_email(text,boolean,timestamp with time zone)', 'execute')
    and not has_function_privilege('public', 'public.admin_add_seed_user_whitelist_email(text,boolean,timestamp with time zone)', 'execute')
    and has_function_privilege('authenticated', 'public.admin_add_seed_user_whitelist_email(text,boolean,timestamp with time zone)', 'execute')
    and not has_function_privilege('anon', 'public.admin_remove_seed_user_whitelist_email(text,boolean,timestamp with time zone)', 'execute')
    and not has_function_privilege('public', 'public.admin_remove_seed_user_whitelist_email(text,boolean,timestamp with time zone)', 'execute')
    and has_function_privilege('authenticated', 'public.admin_remove_seed_user_whitelist_email(text,boolean,timestamp with time zone)', 'execute'),
  'function privileges must be authenticated-only for all exact signatures'
);
select test.assert_true(
  not has_table_privilege('anon', 'public.system_configs', 'select')
    and not has_table_privilege('authenticated', 'public.system_configs', 'select')
    and not has_table_privilege('public', 'public.system_configs', 'select')
    and not has_table_privilege('anon', 'public.system_config_audit', 'select')
    and not has_table_privilege('authenticated', 'public.system_config_audit', 'select')
    and not has_table_privilege('public', 'public.system_config_audit', 'select')
    and not has_table_privilege('anon', 'public.audit_logs', 'select')
    and not has_table_privilege('authenticated', 'public.audit_logs', 'select')
    and not has_table_privilege('public', 'public.audit_logs', 'select')
    and has_table_privilege('authenticated', 'public.camp_admins', 'select'),
  'backing tables must stay closed while camp_admins retains authenticated select'
);

delete from public.system_configs where config_key = 'seed_user_whitelist';
set role authenticated;
select set_config('app.test_auth_uid', '10000000-0000-0000-0000-000000000001', false);
create temporary table seed_remove_missing_config as
select public.admin_remove_seed_user_whitelist_email(
  'gamma@example.test', false, null
) as result;
select test.assert_true(
  (select result ->> 'changed' = 'false'
    and result ->> 'reason' = 'CONFIG_MISSING'
    and result ->> 'configExists' = 'false'
    and result -> 'emails' = '[]'::jsonb
  from seed_remove_missing_config),
  'remove from a missing configuration must return CONFIG_MISSING without creating it'
);
reset role;
select test.assert_true(
  not exists (select 1 from public.system_configs where config_key = 'seed_user_whitelist'),
  'CONFIG_MISSING no-op must not create a configuration row'
);

rollback;

select test.assert_true(
  not exists (select 1 from auth.users where email like '%@seed-admin.test'),
  'ROLLBACK must remove all whitelist admin auth fixtures'
);
select test.assert_true(
  (select config_value = '["cnwine@163.com"]'::jsonb
  from public.system_configs where config_key = 'seed_user_whitelist'),
  'ROLLBACK must restore the original whitelist configuration'
);
select 'PASS: admin seed whitelist RBAC, validation, etag, no-op, dual audit, rollback, grants and cleanup' as result;
