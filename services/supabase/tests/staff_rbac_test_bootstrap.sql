\set QUIET on
\pset footer off
set client_min_messages = warning;
set search_path = public, extensions, pg_temp;

create schema extensions;
create extension pgcrypto with schema extensions;

\ir ux_flow_test_bootstrap.sql
\ir ../migrations/20261109158000_get_my_activation_status.sql
\ir ../migrations/20261109159000_get_coach_pending_reviews.sql
\ir ../migrations/20261109160000_coach_radar_cycle_state.sql
\ir ../migrations/20261110090000_get_coach_inventory_v3.sql
\ir ../migrations/20261110120000_final_generation_staff_role_p0.sql
\ir ../migrations/20261110121000_direct_staff_inventory.sql
\ir ../migrations/20261110122000_pgcrypto_search_path.sql
\ir ../migrations/20261110175500_pgcrypto_search_path_fix.sql
\ir ../migrations/20261110213500_pgcrypto_search_path_guard.sql
\ir ../migrations/20261111121500_drop_legacy_inventory_overload.sql
\ir ../migrations/20261111130000_staff_inventory_forbidden.sql

create or replace function test.assert_raises_sqlstate(p_expected text, p_sql text)
returns void language plpgsql as $$
declare
  v_sqlstate text;
  v_message text;
begin
  execute p_sql;
  raise exception 'ASSERTION_FAILED: expected SQLSTATE %, but statement succeeded', p_expected;
exception when others then
  get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
  if v_sqlstate = p_expected then return; end if;
  raise exception 'ASSERTION_FAILED: expected SQLSTATE %, got % (%)', p_expected, v_sqlstate, v_message;
end;
$$;

grant execute on function test.assert_raises_sqlstate(text, text) to authenticated;
set client_min_messages = notice;
