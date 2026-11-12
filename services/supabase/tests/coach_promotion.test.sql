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

create function test.activate_user(
  p_user uuid,
  p_referrer uuid,
  p_label text,
  p_current boolean default true,
  p_with_relation boolean default true
) returns void language plpgsql as $$
declare
  v_code uuid := gen_random_uuid();
  v_activation uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (p_user, p_label || '@example.test');
  insert into public.box_codes (
    code_id, code_hash, code_type, code_format, state, coach_id, case_id,
    max_checkins, used_checkins, box_spec, inventory_status
  ) values (
    v_code, encode(digest(v_code::text, 'sha256'), 'hex'), 'experience', 'short',
    'pending_review', '00000000-0000-0000-0000-000000000001', gen_random_uuid(),
    21, 0, '21_bags', 'platform'
  );
  insert into public.code_activations (
    activation_id, code_id, auth_user_id, camper_code, expected_code_type,
    shipment_verification_ref, review_state, target_referrer_id, decided_by,
    decided_at, activated_at, expected_code_format, request_source
  ) values (
    v_activation, v_code, p_user, 'JH-' || p_label, 'experience',
    'TEST/' || p_label, 'approved', p_referrer,
    '00000000-0000-0000-0000-000000000001', now(), now(), 'short', 'manual_code'
  );
  update public.box_codes
  set state = 'active', activation_id = v_activation, version = 2, updated_at = now()
  where code_id = v_code;
  if p_with_relation then
    insert into public.user_coach_relation (
      auth_user_id, camper_code, referrer_id, source_code_id,
      valid_from, valid_to, reason
    ) values (
      p_user, 'JH-' || p_label, p_referrer, v_code,
      now() - interval '1 day', case when p_current then null else now() end,
      'activation'
    );
  end if;
  if p_label in ('OWN', 'OTHER') then
    perform set_config('app.checkin_quota_verified', 'on', true);
    insert into public.checkin_sync (auth_user_id, user_code, start_date, records)
    values (
      p_user, 'JH-' || p_label, current_date,
      jsonb_build_object(current_date::text, jsonb_build_object('weight', '60', 'waist', '70'))
    );
  end if;
end;
$$;

create function test.give_checkins(p_user uuid, p_days integer)
returns void language plpgsql as $$
begin
  insert into public.checkin_daily_claims (code_id, auth_user_id, physical_day, used_checkins)
  select b.code_id, p_user, current_date - (days.n - 1), days.n
  from public.box_codes b
  join public.code_activations a on a.code_id = b.code_id
  cross join lateral generate_series(1, p_days) as days(n)
  where a.auth_user_id = p_user and b.state = 'active';
end;
$$;

create function test.attach_relation(p_user uuid, p_referrer uuid)
returns void language plpgsql as $$
begin
  insert into public.user_coach_relation (
    auth_user_id, camper_code, referrer_id, source_code_id, valid_from, reason
  )
  select a.auth_user_id, a.camper_code, p_referrer, a.code_id,
    now(), 'activation'
  from public.code_activations a
  join public.box_codes b on b.code_id = a.code_id and b.state = 'active'
  where a.auth_user_id = p_user and a.review_state = 'approved' and a.activated_at is not null;
end;
$$;

grant usage on schema test to authenticated;
grant execute on all functions in schema test to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'coach@example.test'),
  ('00000000-0000-0000-0000-000000000003', 'other-coach@example.test'),
  ('00000000-0000-0000-0000-000000000004', 'staff@example.test'),
  ('00000000-0000-0000-0000-000000000005', 'ordinary@example.test'),
  ('00000000-0000-0000-0000-000000000008', 'platform@example.test');
insert into public.camp_admins (email, auth_user_id, role, is_active) values
  ('admin@example.test', '00000000-0000-0000-0000-000000000001', 'admin', true),
  ('coach@example.test', '00000000-0000-0000-0000-000000000002', 'coach', true),
  ('other-coach@example.test', '00000000-0000-0000-0000-000000000003', 'coach', true),
  ('staff@example.test', '00000000-0000-0000-0000-000000000004', 'staff', true);
insert into public.system_configs (config_key, config_value) values
  ('platform_official_account_id', '"00000000-0000-0000-0000-000000000008"'::jsonb);

-- 20 日不足；配置缺失优先 fail-closed；第 21 个物理日才可申请。
select test.activate_user('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'APPLICANT');
select test.give_checkins('00000000-0000-0000-0000-000000000010', 20);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000010', false);
select test.assert_true(public.get_my_coach_promotion()->>'state' = 'camper', 'no archive must read as camper');
select test.assert_raises('PROMOTION_CHECKINS_INSUFFICIENT', 'select public.request_coach_promotion()');
delete from public.system_configs where config_key = 'coach_promotion_required_checkins';
select test.assert_raises('SYSTEM_CONFIG_MISSING', 'select public.request_coach_promotion()');
insert into public.system_configs (config_key, config_value) values ('coach_promotion_required_checkins', '21');
insert into public.checkin_daily_claims (code_id, auth_user_id, physical_day, used_checkins)
select b.code_id, '00000000-0000-0000-0000-000000000010', current_date - 20, 21
from public.box_codes b
join public.code_activations a on a.code_id = b.code_id
where a.auth_user_id = '00000000-0000-0000-0000-000000000010' and b.state = 'active';
select public.request_coach_promotion();
select test.assert_true(
  (select count(*) = 21 from public.checkin_daily_claims where auth_user_id = '00000000-0000-0000-0000-000000000010'),
  'fixture must contain 21 distinct physical days'
);
select test.assert_true(
  (select count(*) = 1 from public.coach_promotions where auth_user_id = '00000000-0000-0000-0000-000000000010' and state = 'promotion_pending'),
  '21 days must create one pending request'
);
select test.assert_true(
  (public.request_coach_promotion()->>'replayed')::boolean,
  'repeat pending request must be idempotent'
);
select test.assert_true(
  (select count(*) = 1 from public.coach_promotions where auth_user_id = '00000000-0000-0000-0000-000000000010'),
  'repeat request must not create another row'
);

-- 非 Admin 不得审核；拒绝须原因码，拒绝历史保留且可重申。
select test.assert_raises(
  'FORBIDDEN',
  'select public.admin_review_coach_promotion((select promotion_id from public.coach_promotions where auth_user_id = ''00000000-0000-0000-0000-000000000010''), ''approve'', 1, null)'
);
set role authenticated;
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000010', false);
select test.assert_raises(
  'permission denied for table coach_promotions',
  'insert into public.coach_promotions (auth_user_id, state, checkin_days_snapshot) values (''00000000-0000-0000-0000-000000000010'', ''coach'', 21)'
);
reset role;
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000001', false);
select test.assert_raises(
  'PROMOTION_REASON_REQUIRED',
  'select public.admin_review_coach_promotion((select promotion_id from public.coach_promotions where auth_user_id = ''00000000-0000-0000-0000-000000000010''), ''reject'', 1, null)'
);
select test.assert_raises(
  'PROMOTION_VERSION_CONFLICT',
  'select public.admin_review_coach_promotion((select promotion_id from public.coach_promotions where auth_user_id = ''00000000-0000-0000-0000-000000000010''), ''reject'', 99, ''INSUFFICIENT_DATA'')'
);
select public.admin_review_coach_promotion(
  (select promotion_id from public.coach_promotions where auth_user_id = '00000000-0000-0000-0000-000000000010'),
  'reject', 1, 'INSUFFICIENT_DATA'
);
select test.assert_true(
  (select state = 'promotion_rejected' and rejection_reason_code = 'INSUFFICIENT_DATA' from public.coach_promotions where auth_user_id = '00000000-0000-0000-0000-000000000010'),
  'rejection must preserve state and reason'
);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000010', false);
select public.request_coach_promotion();
select test.assert_true(
  (select count(*) = 2 from public.coach_promotions where auth_user_id = '00000000-0000-0000-0000-000000000010'),
  'reapply must retain rejected history and add a new request'
);

-- 审核前真实基数为 2；批准时再次复核 21 日。
select test.activate_user(gen_random_uuid(), '00000000-0000-0000-0000-000000000010', 'BASE1');
select test.activate_user(gen_random_uuid(), '00000000-0000-0000-0000-000000000010', 'BASE2');
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000001', false);
select public.admin_review_coach_promotion(
  (select promotion_id from public.coach_promotions where auth_user_id = '00000000-0000-0000-0000-000000000010' and state = 'promotion_pending'),
  'approve', 1, null
);
select test.assert_true(
  (select state = 'probational_coach' and recruit_baseline = 2 and checkin_days_snapshot >= 21 from public.coach_promotions where auth_user_id = '00000000-0000-0000-0000-000000000010' and state = 'probational_coach'),
  'approval must snapshot 21-day evidence and real recruit baseline'
);
select test.assert_true(
  not exists (select 1 from public.camp_admins where auth_user_id = '00000000-0000-0000-0000-000000000010'),
  'probational coach must not receive formal coach identity'
);
select test.assert_true(
  not exists (select 1 from public.coach_lifecycles where coach_id = '00000000-0000-0000-0000-000000000010'),
  'probational coach must not enter formal coach lifecycle'
);

-- 申请后不足 21 日（证据被移除）时，Admin 批准也必须复核失败。
select test.activate_user('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'REVIEWSHORT');
select test.give_checkins('00000000-0000-0000-0000-000000000011', 21);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000011', false);
select public.request_coach_promotion();
delete from public.checkin_daily_claims
where auth_user_id = '00000000-0000-0000-0000-000000000011'
  and physical_day = current_date;
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000001', false);
select test.assert_raises(
  'PROMOTION_CHECKINS_INSUFFICIENT',
  'select public.admin_review_coach_promotion((select promotion_id from public.coach_promotions where auth_user_id = ''00000000-0000-0000-0000-000000000011''), ''approve'', 1, null)'
);

-- 准教练 own 可用，all 与库存/划拨/发码/直推/补货均物理拒绝。
select test.activate_user('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010', 'OWN');
select test.activate_user('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000003', 'OTHER');
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000010', false);
select test.assert_true(
  not exists (select 1 from public.get_coach_radar_v1('own') where camper_code = 'JH-OTHER'),
  'probational radar own must not leak another coach camper'
);
select test.assert_true(
  (select count(*) = (select count(*) from public.get_coach_radar_v1('own')) from public.get_coach_radar_v1()),
  'legacy no-arg radar must match own for probational coach'
);
select test.assert_raises('FORBIDDEN', 'select * from public.get_coach_radar_v1(''all'')');
select test.assert_true(
  (select participants = 1 from public.get_coach_camp_trends_v1('own') where day_index = 1),
  'probational trends own must include only own snapshot'
);
select test.assert_raises('FORBIDDEN', 'select * from public.get_coach_camp_trends_v1(''all'')');
select test.assert_raises('FORBIDDEN', 'select public.get_my_code_inventory()');
select test.assert_raises('FORBIDDEN', 'select public.request_coach_restock_v1(''probational'')');
select test.assert_true(
  public.coach_push_code_v1(null, null, 'probational-push')->>'errorCode' = 'FORBIDDEN',
  'probational direct push must fail before Vault or target lookup'
);
select test.assert_raises('FORBIDDEN', 'select public.allocate_codes_to_coach(''00000000-0000-0000-0000-000000000010'', 1)');
select test.assert_raises('FORBIDDEN', 'select public.generate_platform_codes(1, ''experience'', ''TEST/PROBATIONAL'')');

-- 历史、未激活、间接、自我和平台关系均不计入净增。
select test.activate_user(gen_random_uuid(), '00000000-0000-0000-0000-000000000010', 'HISTORY', false);
insert into public.user_coach_relation (auth_user_id, camper_code, referrer_id, reason)
values ('00000000-0000-0000-0000-000000000005', 'JH-NOACTIVATION', '00000000-0000-0000-0000-000000000010', 'activation');
select test.activate_user(gen_random_uuid(), '00000000-0000-0000-0000-000000000003', 'INDIRECT');
update public.user_coach_relation
set valid_to = now(), reason = 'admin_correction', version = version + 1, updated_at = now()
where auth_user_id = '00000000-0000-0000-0000-000000000010' and valid_to is null;
select test.attach_relation('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000010');
select test.activate_user(gen_random_uuid(), '00000000-0000-0000-0000-000000000008', 'PLATFORMREL');
select test.assert_true(
  public.coach_promotion_real_recruit_count('00000000-0000-0000-0000-000000000008') = 0,
  'platform official account relations must not count'
);
select test.assert_true(
  (select state = 'probational_coach' from public.coach_promotions where auth_user_id = '00000000-0000-0000-0000-000000000010' and state in ('probational_coach', 'coach')),
  'invalid and indirect relations must not promote'
);

select test.assert_true(
  public.coach_promotion_real_recruit_count('00000000-0000-0000-0000-000000000010') = 3,
  'OWN must be the first net new valid direct recruit after the baseline of two'
);

-- OWN 已是基线后第 1 人；再加 6 人共 7 人不晋升，第 8 个真实有效直推原子晋升。
select test.activate_user(gen_random_uuid(), '00000000-0000-0000-0000-000000000010', 'R1');
select test.activate_user(gen_random_uuid(), '00000000-0000-0000-0000-000000000010', 'R2');
select test.activate_user(gen_random_uuid(), '00000000-0000-0000-0000-000000000010', 'R3');
select test.activate_user(gen_random_uuid(), '00000000-0000-0000-0000-000000000010', 'R4');
select test.activate_user(gen_random_uuid(), '00000000-0000-0000-0000-000000000010', 'R5');
select test.activate_user(gen_random_uuid(), '00000000-0000-0000-0000-000000000010', 'R6');
select test.assert_true(
  (select state = 'probational_coach' from public.coach_promotions where auth_user_id = '00000000-0000-0000-0000-000000000010' and state in ('probational_coach', 'coach')),
  'seven net new valid direct recruits must not promote'
);
select test.assert_true(
  not exists (select 1 from public.camp_admins where auth_user_id = '00000000-0000-0000-0000-000000000010'),
  'seven recruits must not create coach role'
);
select test.activate_user(gen_random_uuid(), '00000000-0000-0000-0000-000000000010', 'R7');
select test.assert_true(
  (select state = 'coach' from public.coach_promotions where auth_user_id = '00000000-0000-0000-0000-000000000010' and state in ('probational_coach', 'coach')),
  'eighth net new valid direct recruit must promote'
);
select test.assert_true(
  (select role = 'coach' and is_active from public.camp_admins where auth_user_id = '00000000-0000-0000-0000-000000000010'),
  'atomic promotion must create active coach SSOT row'
);
select test.assert_true(
  (select count(*) = 1 from public.audit_logs where action = 'coach_promotion_promoted' and target_id = (select promotion_id from public.coach_promotions where auth_user_id = '00000000-0000-0000-0000-000000000010' and state = 'coach')),
  'automatic promotion must write exactly one audit row'
);
select test.assert_true(
  not exists (select 1 from public.coach_lifecycles where coach_id = '00000000-0000-0000-0000-000000000010'),
  'automatic promotion must not fabricate lifecycle row'
);

-- 正式 coach / Admin 不回归；Vault 与 SSOT 口径保持。
insert into vault.decrypted_secrets values ('box_code_pepper', 'vault-test-pepper');
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000002', false);
select test.assert_true((public.get_my_code_inventory()->>'ok')::boolean, 'formal coach inventory must still work');
select test.assert_true((select count(*) = 21 from public.get_coach_camp_trends_v1('all')), 'formal coach trends all must remain available');
select test.assert_raises('FORBIDDEN', 'select * from public.get_coach_radar_v1(''all'')');
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000001', false);
select test.assert_true((select count(*) = 21 from public.get_coach_camp_trends_v1('all')), 'Admin trends all must remain available');
select test.assert_true((select count(*) > 0 from public.get_coach_radar_v1('all')), 'Admin radar all must remain available');

select test.assert_true(not has_function_privilege('anon', 'public.request_coach_promotion()', 'execute'), 'anon must not execute request RPC');
select test.assert_true(has_function_privilege('authenticated', 'public.request_coach_promotion()', 'execute'), 'authenticated request RPC grant missing');
select test.assert_true(not has_table_privilege('authenticated', 'public.coach_promotions', 'insert'), 'authenticated must not insert promotion rows');
select test.assert_true(not has_table_privilege('authenticated', 'public.coach_promotions', 'update'), 'authenticated must not update promotion rows');

-- 供运行脚本执行真实双会话并发：重复申请与第 8/9 名同时写入。
select test.activate_user('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001', 'CONCURRENTPENDING');
select test.give_checkins('00000000-0000-0000-0000-000000000030', 21);
select test.activate_user('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', 'CONCURRENTCOACH');
select test.give_checkins('00000000-0000-0000-0000-000000000031', 21);
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000031', false);
select public.request_coach_promotion();
select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000001', false);
select public.admin_review_coach_promotion(
  (select promotion_id from public.coach_promotions where auth_user_id = '00000000-0000-0000-0000-000000000031'),
  'approve', 1, null
);
select test.activate_user(gen_random_uuid(), '00000000-0000-0000-0000-000000000031', 'C1');
select test.activate_user(gen_random_uuid(), '00000000-0000-0000-0000-000000000031', 'C2');
select test.activate_user(gen_random_uuid(), '00000000-0000-0000-0000-000000000031', 'C3');
select test.activate_user(gen_random_uuid(), '00000000-0000-0000-0000-000000000031', 'C4');
select test.activate_user(gen_random_uuid(), '00000000-0000-0000-0000-000000000031', 'C5');
select test.activate_user(gen_random_uuid(), '00000000-0000-0000-0000-000000000031', 'C6');
select test.activate_user(gen_random_uuid(), '00000000-0000-0000-0000-000000000031', 'C7');
select test.activate_user('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000001', 'C8', true, false);
select test.activate_user('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000001', 'C9', true, false);

select 'PASS: coach promotion state, evidence, RBAC, scopes, atomic promotion and regression fixtures' as result;
