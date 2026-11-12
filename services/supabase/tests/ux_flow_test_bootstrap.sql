\set QUIET on
set client_min_messages = warning;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  phone text
);
create function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('app.test_auth_uid', true), '')::uuid;
$$;
create function auth.jwt()
returns jsonb language sql stable as $$
  select jsonb_build_object('email', nullif(current_setting('app.test_jwt_email', true), ''));
$$;
create role anon;
create role authenticated;
create schema vault;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);

\ir ../migrations/20261030100000_admin_checkin_overview.sql
\ir ../migrations/20261101090000_checkin_bmi_profile.sql
\ir ../migrations/20261106130000_box_code_activation.sql
\ir ../migrations/20261106150000_activate_box_code.sql
\ir ../migrations/20261106160000_get_coach_radar_v1.sql
\ir ../migrations/20261107120000_verify_checkin.sql
\ir ../migrations/20261108120000_code_pool_inventory.sql
\ir ../migrations/20261108130000_manual_review_trusteeship.sql
\ir ../migrations/20261108140000_activation_request_rate_limit.sql
\ir ../migrations/20261108224000_user_coach_contact.sql
\ir ../migrations/20261108230000_admin_coach_directory.sql
\ir ../migrations/20261109094500_p0_rbac_vault.sql
\ir ../migrations/20261109120000_admin_staff_rbac.sql
\ir ../migrations/20261109120000_coach_workflows.sql
\ir ../migrations/20261109153000_coach_camp_trends.sql
\ir ../migrations/20261109154000_coach_ssot_vault.sql
\ir ../migrations/20261109156000_unified_activation_review.sql
\ir ../migrations/20261109157000_coach_promotion.sql
\ir ../migrations/20261112120000_seed_activation_compat.sql
\ir ../migrations/20261112130000_legacy_checkin_claims.sql

set client_min_messages = notice;
create schema test;
create function test.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION_FAILED: %', p_message;
  end if;
end;
$$;
create function test.assert_raises(p_expected text, p_sql text)
returns void language plpgsql as $$
declare
  v_message text;
begin
  execute p_sql;
  raise exception 'ASSERTION_FAILED: expected %, but statement succeeded', p_expected;
exception when others then
  get stacked diagnostics v_message = message_text;
  if v_message = p_expected then return; end if;
  raise exception 'ASSERTION_FAILED: expected %, got %', p_expected, v_message;
end;
$$;

grant usage on schema test to authenticated;
grant execute on all functions in schema test to authenticated;
