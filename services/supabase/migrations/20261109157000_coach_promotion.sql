-- TASK-10.13-CORE-UNLOCK：21 有效打卡日 + 基线后 8 名真实直推的服务端晋升状态机。
begin;

insert into public.system_configs (config_key, config_value) values
  ('coach_promotion_required_checkins', '21'::jsonb),
  ('probational_coach_required_recruits', '8'::jsonb)
on conflict (config_key) do nothing;

alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check check (action in (
  'code_activation_approved',
  'code_activation_rejected',
  'coach_users_trusteed',
  'coach_promotion_requested',
  'coach_promotion_approved',
  'coach_promotion_rejected',
  'coach_promotion_promoted'
));

create table public.coach_promotions (
  promotion_id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  state text not null check (state in (
    'promotion_pending', 'promotion_rejected', 'probational_coach', 'coach'
  )),
  checkin_days_snapshot integer not null check (checkin_days_snapshot >= 0),
  recruit_baseline integer check (recruit_baseline >= 0),
  decided_by uuid references auth.users(id) on delete restrict,
  decided_at timestamptz,
  rejection_reason_code text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_promotions_state_evidence check (
    (
      state = 'promotion_pending'
      and recruit_baseline is null and decided_by is null and decided_at is null
      and rejection_reason_code is null
    ) or (
      state = 'promotion_rejected'
      and recruit_baseline is null and decided_by is not null and decided_at is not null
      and nullif(btrim(rejection_reason_code), '') is not null
    ) or (
      state in ('probational_coach', 'coach')
      and recruit_baseline is not null and decided_by is not null and decided_at is not null
      and rejection_reason_code is null
    )
  )
);
create unique index coach_promotions_one_pending
  on public.coach_promotions (auth_user_id) where state = 'promotion_pending';
create unique index coach_promotions_one_current
  on public.coach_promotions (auth_user_id) where state in ('probational_coach', 'coach');
create index coach_promotions_latest
  on public.coach_promotions (auth_user_id, created_at desc, promotion_id desc);
alter table public.coach_promotions enable row level security;
revoke all on public.coach_promotions from public, anon, authenticated;

create or replace function public.coach_promotion_config(p_key text)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_value numeric;
begin
  select (c.config_value #>> '{}')::numeric into v_value
  from public.system_configs c
  where c.config_key = p_key and jsonb_typeof(c.config_value) = 'number';
  if not found or v_value is null or v_value <= 0 or v_value <> trunc(v_value) then
    raise exception 'SYSTEM_CONFIG_MISSING';
  end if;
  return v_value::integer;
end;
$function$;

create or replace function public.coach_promotion_is_probational(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1 from public.coach_promotions p
    where p.auth_user_id = p_user_id and p.state = 'probational_coach'
  );
$function$;

create or replace function public.coach_promotion_effective_checkin_days(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select count(distinct d.physical_day)::integer
  from public.checkin_daily_claims d
  join public.box_codes b on b.code_id = d.code_id and b.state = 'active'
  join public.code_activations a
    on a.code_id = b.code_id and a.activation_id = b.activation_id
  where d.auth_user_id = p_user_id
    and a.auth_user_id = p_user_id
    and d.used_checkins > 0
    and a.review_state = 'approved'
    and a.activated_at is not null;
$function$;

create or replace function public.coach_promotion_real_recruit_count(p_coach_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select count(distinct r.auth_user_id)::integer
  from public.user_coach_relation r
  join public.code_activations a
    on a.auth_user_id = r.auth_user_id and a.code_id = r.source_code_id
  join public.box_codes b
    on b.code_id = a.code_id and b.activation_id = a.activation_id and b.state = 'active'
  where r.referrer_id = p_coach_id
    and r.auth_user_id <> p_coach_id
    and r.valid_to is null
    and a.review_state = 'approved'
    and a.activated_at is not null
    and not exists (
      select 1 from public.system_configs c
      where c.config_key = 'platform_official_account_id'
        and c.config_value #>> '{}' = p_coach_id::text
    );
$function$;

create or replace function public.request_coach_promotion()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_existing public.coach_promotions%rowtype;
  v_required integer;
  v_days integer;
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('coach-promotion-user:' || v_auth_user_id::text, 0));

  select p.* into v_existing from public.coach_promotions p
  where p.auth_user_id = v_auth_user_id and p.state = 'promotion_pending'
  for update;
  if found then
    return jsonb_build_object(
      'ok', true, 'promotionId', v_existing.promotion_id, 'state', v_existing.state,
      'checkinDays', v_existing.checkin_days_snapshot, 'version', v_existing.version, 'replayed', true
    );
  end if;
  if exists (
    select 1 from public.coach_promotions p
    where p.auth_user_id = v_auth_user_id and p.state in ('probational_coach', 'coach')
  ) or exists (
    select 1 from public.camp_admins a where a.auth_user_id = v_auth_user_id and a.is_active
  ) then
    raise exception 'PROMOTION_STATE_CONFLICT';
  end if;

  v_required := public.coach_promotion_config('coach_promotion_required_checkins');
  v_days := public.coach_promotion_effective_checkin_days(v_auth_user_id);
  if v_days < v_required then
    raise exception 'PROMOTION_CHECKINS_INSUFFICIENT';
  end if;

  insert into public.coach_promotions (auth_user_id, state, checkin_days_snapshot)
  values (v_auth_user_id, 'promotion_pending', v_days)
  returning * into v_existing;
  insert into public.audit_logs (action, target_id, actor_id, reviewer_id, metadata)
  values (
    'coach_promotion_requested', v_existing.promotion_id, v_auth_user_id, v_auth_user_id,
    jsonb_build_object('checkinDays', v_days, 'requiredCheckins', v_required)
  );
  return jsonb_build_object(
    'ok', true, 'promotionId', v_existing.promotion_id, 'state', v_existing.state,
    'checkinDays', v_days, 'version', v_existing.version, 'replayed', false
  );
end;
$function$;

create or replace function public.get_my_coach_promotion()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_promotion public.coach_promotions%rowtype;
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;
  select p.* into v_promotion from public.coach_promotions p
  where p.auth_user_id = v_auth_user_id
  order by p.created_at desc, p.promotion_id desc limit 1;
  if not found then
    return jsonb_build_object('ok', true, 'state', 'camper', 'version', 0);
  end if;
  return jsonb_build_object(
    'ok', true, 'promotionId', v_promotion.promotion_id, 'state', v_promotion.state,
    'checkinDaysSnapshot', v_promotion.checkin_days_snapshot,
    'recruitBaseline', v_promotion.recruit_baseline,
    'rejectionReasonCode', v_promotion.rejection_reason_code,
    'version', v_promotion.version, 'createdAt', v_promotion.created_at,
    'updatedAt', v_promotion.updated_at
  );
end;
$function$;

create or replace function public.admin_review_coach_promotion(
  p_promotion_id uuid,
  p_decision text,
  p_expected_version integer,
  p_reason_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_admin_id uuid := auth.uid();
  v_promotion public.coach_promotions%rowtype;
  v_required integer;
  v_days integer;
  v_baseline integer;
  v_action text;
begin
  if v_admin_id is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_admin_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_promotion_id is null or p_decision not in ('approve', 'reject')
    or p_expected_version is null or p_expected_version < 1 then
    raise exception 'PROMOTION_REVIEW_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('coach-promotion-review:' || p_promotion_id::text, 0));
  select p.* into v_promotion from public.coach_promotions p
  where p.promotion_id = p_promotion_id for update;
  if not found then raise exception 'PROMOTION_NOT_FOUND'; end if;
  if v_promotion.state <> 'promotion_pending' then
    raise exception 'PROMOTION_STATE_CONFLICT';
  end if;
  if v_promotion.version <> p_expected_version then
    raise exception 'PROMOTION_VERSION_CONFLICT';
  end if;

  if p_decision = 'approve' then
    v_required := public.coach_promotion_config('coach_promotion_required_checkins');
    v_days := public.coach_promotion_effective_checkin_days(v_promotion.auth_user_id);
    if v_days < v_required then raise exception 'PROMOTION_CHECKINS_INSUFFICIENT'; end if;
    v_baseline := public.coach_promotion_real_recruit_count(v_promotion.auth_user_id);
    update public.coach_promotions
    set state = 'probational_coach', checkin_days_snapshot = v_days,
      recruit_baseline = v_baseline, decided_by = v_admin_id, decided_at = now(),
      version = version + 1, updated_at = now()
    where promotion_id = p_promotion_id
    returning * into v_promotion;
    v_action := 'coach_promotion_approved';
  else
    if nullif(btrim(coalesce(p_reason_code, '')), '') is null then
      raise exception 'PROMOTION_REASON_REQUIRED';
    end if;
    update public.coach_promotions
    set state = 'promotion_rejected', decided_by = v_admin_id, decided_at = now(),
      rejection_reason_code = btrim(p_reason_code), version = version + 1, updated_at = now()
    where promotion_id = p_promotion_id
    returning * into v_promotion;
    v_action := 'coach_promotion_rejected';
  end if;

  insert into public.audit_logs (action, target_id, actor_id, reviewer_id, metadata)
  values (
    v_action, p_promotion_id, v_admin_id, v_admin_id,
    jsonb_build_object(
      'checkinDays', v_promotion.checkin_days_snapshot,
      'recruitBaseline', v_promotion.recruit_baseline,
      'reasonCode', v_promotion.rejection_reason_code
    )
  );
  return jsonb_build_object(
    'ok', true, 'promotionId', p_promotion_id, 'state', v_promotion.state,
    'recruitBaseline', v_promotion.recruit_baseline, 'version', v_promotion.version
  );
end;
$function$;

create or replace function public.evaluate_coach_promotion(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_promotion public.coach_promotions%rowtype;
  v_role public.camp_admins%rowtype;
  v_required integer;
  v_current integer;
  v_actor uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('coach-promotion-user:' || p_user_id::text, 0));
  select p.* into v_promotion from public.coach_promotions p
  where p.auth_user_id = p_user_id and p.state = 'probational_coach'
  for update;
  if not found then return; end if;

  v_required := public.coach_promotion_config('probational_coach_required_recruits');
  v_current := public.coach_promotion_real_recruit_count(p_user_id);
  if v_current - v_promotion.recruit_baseline < v_required then return; end if;

  select a.* into v_role from public.camp_admins a where a.auth_user_id = p_user_id for update;
  if found then
    if v_role.role <> 'coach' then raise exception 'ROLE_ASSIGNMENT_CONFLICT'; end if;
    update public.camp_admins
    set is_active = true, version = version + 1, updated_at = now(), updated_by = null
    where auth_user_id = p_user_id;
  else
    insert into public.camp_admins (email, auth_user_id, role, is_active, version, updated_at, updated_by)
    select u.email, u.id, 'coach', true, 1, now(), null
    from auth.users u where u.id = p_user_id and u.email is not null;
    if not found then raise exception 'COACH_IDENTITY_NOT_FOUND'; end if;
  end if;

  update public.coach_promotions
  set state = 'coach', version = version + 1, updated_at = now()
  where promotion_id = v_promotion.promotion_id;
  v_actor := coalesce(auth.uid(), p_user_id);
  insert into public.audit_logs (action, target_id, actor_id, reviewer_id, metadata)
  values (
    'coach_promotion_promoted', v_promotion.promotion_id, v_actor, v_actor,
    jsonb_build_object(
      'recruitBaseline', v_promotion.recruit_baseline,
      'currentRecruits', v_current, 'requiredNetRecruits', v_required
    )
  );
end;
$function$;

create or replace function public.evaluate_coach_promotion_relation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if NEW.valid_to is null then
    perform public.evaluate_coach_promotion(NEW.referrer_id);
  end if;
  return NEW;
end;
$function$;

drop trigger if exists user_coach_relation_promotion_eval on public.user_coach_relation;
create trigger user_coach_relation_promotion_eval
after insert or update of auth_user_id, referrer_id, source_code_id, valid_to
on public.user_coach_relation
for each row execute function public.evaluate_coach_promotion_relation();

revoke all on function public.coach_promotion_config(text) from public, anon, authenticated;
revoke all on function public.coach_promotion_is_probational(uuid) from public, anon, authenticated;
revoke all on function public.coach_promotion_effective_checkin_days(uuid) from public, anon, authenticated;
revoke all on function public.coach_promotion_real_recruit_count(uuid) from public, anon, authenticated;
revoke all on function public.evaluate_coach_promotion(uuid) from public, anon, authenticated;
revoke all on function public.evaluate_coach_promotion_relation() from public, anon, authenticated;
revoke all on function public.request_coach_promotion() from public, anon, authenticated;
revoke all on function public.get_my_coach_promotion() from public, anon, authenticated;
revoke all on function public.admin_review_coach_promotion(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.request_coach_promotion() to authenticated;
grant execute on function public.get_my_coach_promotion() to authenticated;
grant execute on function public.admin_review_coach_promotion(uuid, text, integer, text) to authenticated;


-- 准教练在任何 Vault、码面或库存目标读取之前物理拒绝。
create or replace function public.get_my_code_inventory()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_pepper text;
  v_restock_point integer;
  v_available_count integer;
  v_codes jsonb;
begin
  if v_auth_user_id is null then raise exception 'UNAUTHORIZED'; end if;
  if public.coach_promotion_is_probational(v_auth_user_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'staff'
  ) or not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'coach' and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select decrypted_secret into v_pepper from vault.decrypted_secrets where name = 'box_code_pepper';
  if v_pepper is null or v_pepper = '' then raise exception 'BOX_CODE_PEPPER_NOT_CONFIGURED'; end if;
  select (c.config_value #>> '{}')::integer into v_restock_point
  from public.system_configs c where c.config_key = 'coach_restock_point';
  if not found or v_restock_point is null or v_restock_point < 0 then
    raise exception 'SYSTEM_CONFIG_MISSING';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'codeId', b.code_id, 'code', pgp_sym_decrypt(b.code_ciphertext, v_pepper),
      'boxSpec', b.box_spec, 'maxCheckins', b.max_checkins, 'createdAt', b.created_at
    ) order by b.created_at, b.code_id
  ), '[]'::jsonb) into v_codes
  from public.box_codes b
  where b.coach_id = v_auth_user_id and b.state = 'unused'
    and b.inventory_status = 'coach' and b.code_ciphertext is not null;
  v_available_count := coalesce(jsonb_array_length(v_codes), 0);
  return jsonb_build_object(
    'ok', true, 'availableCount', v_available_count, 'restockPoint', v_restock_point,
    'needsRestock', v_available_count < v_restock_point, 'codes', v_codes
  );
end;
$function$;

create or replace function public.request_coach_restock_v1(p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_note text := btrim(coalesce(p_note, ''));
  v_request_id uuid;
begin
  if v_auth_user_id is null or public.coach_promotion_is_probational(v_auth_user_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'coach' and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if char_length(v_note) > 500 then raise exception 'RESTOCK_INPUT_INVALID'; end if;
  if exists (
    select 1 from public.coach_inventory i
    where i.coach_id = v_auth_user_id and (i.available_count = 0) is not true
  ) or exists (
    select 1 from public.box_codes b
    where b.coach_id = v_auth_user_id and b.inventory_status = 'coach' and b.state = 'unused'
  ) then
    raise exception 'RESTOCK_NOT_EMPTY';
  end if;

  select q.request_id into v_request_id from public.coach_restock_requests q
  where q.coach_id = v_auth_user_id and q.status = 'pending' for update;
  if found then
    return jsonb_build_object('ok', true, 'requestId', v_request_id, 'status', 'pending', 'replayed', true);
  end if;
  insert into public.coach_restock_requests (coach_id, note) values (v_auth_user_id, v_note)
  on conflict (coach_id) where status = 'pending' do nothing
  returning request_id into v_request_id;
  if v_request_id is null then
    select q.request_id into v_request_id from public.coach_restock_requests q
    where q.coach_id = v_auth_user_id and q.status = 'pending';
  end if;
  return jsonb_build_object('ok', true, 'requestId', v_request_id, 'status', 'pending', 'replayed', false);
end;
$function$;

create or replace function public.coach_push_code_v1(
  p_camper_ref uuid,
  p_code_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_pepper text;
  v_payload_hash text;
  v_code_text text;
  v_code_format text;
  v_code public.box_codes%rowtype;
  v_relation public.user_coach_relation%rowtype;
  v_command public.box_code_commands%rowtype;
  v_activation_id uuid;
  v_result jsonb;
begin
  if v_auth_user_id is null then return public.box_code_error('UNAUTHORIZED'); end if;
  if public.coach_promotion_is_probational(v_auth_user_id) then
    return public.box_code_error('FORBIDDEN');
  end if;
  if nullif(p_idempotency_key, '') is null then return public.box_code_error('IDEMPOTENCY_CONFLICT'); end if;
  if exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'staff'
  ) then
    insert into public.staff_rbac_audit (
      action, actor_id, target_id, target_role, result, reason_code, metadata
    ) values (
      'staff_finance_denied', v_auth_user_id, v_auth_user_id, 'staff',
      'denied', 'FORBIDDEN', jsonb_build_object('operation', 'coach_push_code_v1')
    );
    return public.box_code_error('FORBIDDEN');
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'coach' and a.is_active
  ) then
    return public.box_code_error('FORBIDDEN');
  end if;

  select decrypted_secret into v_pepper from vault.decrypted_secrets where name = 'box_code_pepper';
  if v_pepper is null or v_pepper = '' then return public.box_code_error('BOX_CODE_PEPPER_NOT_CONFIGURED'); end if;
  v_payload_hash := encode(hmac(
    'coach_push|' || v_auth_user_id::text || '|' || coalesce(p_camper_ref::text, '') || '|' || coalesce(p_code_id::text, ''),
    v_pepper, 'sha256'
  ), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('box-code-command:' || p_idempotency_key, 0));

  select * into v_command from public.box_code_commands where idempotency_key = p_idempotency_key for update;
  if found then
    if v_command.command_type <> 'activation' or v_command.caller_auth_user_id <> v_auth_user_id
      or v_command.payload_hash <> v_payload_hash then
      return public.box_code_error('IDEMPOTENCY_CONFLICT');
    end if;
    if v_command.result is null then return public.box_code_error('ACTIVATION_STATE_CONFLICT'); end if;
    return jsonb_set(v_command.result, '{replayed}', 'true'::jsonb);
  end if;

  select b.* into v_code from public.box_codes b
  where b.code_id = p_code_id and b.coach_id = v_auth_user_id
    and b.inventory_status = 'coach' and b.state = 'unused'
  for update of b;
  if not found then return public.box_code_error('CODE_NOT_AVAILABLE'); end if;
  select r.* into v_relation from public.user_coach_relation r
  where r.relation_id = p_camper_ref and r.referrer_id = v_auth_user_id and r.valid_to is null
  for update of r;
  if not found then return public.box_code_error('FORBIDDEN'); end if;

  v_code_text := pgp_sym_decrypt(v_code.code_ciphertext, v_pepper);
  if v_code_text ~ '^JH-(EL|RC)-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$' then
    v_code_format := 'short';
  elsif v_code_text ~ '^JH-(EL|RC)-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12,16}$' then
    v_code_format := 'long';
  else
    return public.box_code_error('CODE_NOT_AVAILABLE');
  end if;

  insert into public.code_activations (
    code_id, auth_user_id, camper_code, expected_code_type,
    expected_code_format, review_state, request_source
  ) values (
    v_code.code_id, v_relation.auth_user_id, v_relation.camper_code,
    v_code.code_type, v_code_format, 'pending', 'coach_push'
  ) returning activation_id into v_activation_id;
  update public.box_codes set state = 'pending_review', version = version + 1, updated_at = now()
  where code_id = v_code.code_id and version = v_code.version;
  insert into public.box_code_events (
    event_type, code_id, activation_id, actor_auth_user_id, metadata
  ) values (
    'CodeActivationRequested', v_code.code_id, v_activation_id, v_auth_user_id,
    jsonb_build_object('requestSource', 'coach_push')
  );
  v_result := jsonb_build_object(
    'ok', true, 'activationId', v_activation_id, 'codeId', v_code.code_id,
    'state', 'pending_review', 'replayed', false
  );
  insert into public.box_code_commands (
    idempotency_key, command_type, payload_hash, caller_auth_user_id, result
  ) values (p_idempotency_key, 'activation', v_payload_hash, v_auth_user_id, v_result);
  return v_result;
end;
$function$;

create or replace function public.allocate_codes_to_coach(p_coach_id uuid, p_count integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_code_ids uuid[];
  v_selected_count integer;
  v_inventory public.coach_inventory%rowtype;
begin
  if v_auth_user_id is null then raise exception 'UNAUTHORIZED'; end if;
  if public.coach_promotion_is_probational(v_auth_user_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_coach_id is null or p_count is null or p_count <= 0 then raise exception 'INVALID_ALLOCATION'; end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = p_coach_id and a.role = 'coach' and a.is_active
  ) then
    raise exception 'COACH_NOT_FOUND';
  end if;

  select array_agg(locked.code_id) into v_code_ids from (
    select b.code_id from public.box_codes b
    where b.inventory_status = 'platform' and b.state = 'unused'
    order by b.created_at, b.code_id limit p_count for update skip locked
  ) locked;
  v_selected_count := coalesce(array_length(v_code_ids, 1), 0);
  if v_selected_count <> p_count then raise exception 'INVENTORY_INSUFFICIENT'; end if;
  perform set_config('app.inventory_allocation_verified', 'on', true);
  update public.box_codes
  set coach_id = p_coach_id, inventory_status = 'coach', version = version + 1, updated_at = now()
  where code_id = any(v_code_ids);

  select * into v_inventory from public.coach_inventory where coach_id = p_coach_id for update;
  if found then
    update public.coach_inventory
    set allocated_count = allocated_count + p_count, available_count = available_count + p_count,
      version = version + 1, updated_at = now()
    where coach_id = p_coach_id;
  else
    insert into public.coach_inventory (coach_id, allocated_count, available_count)
    values (p_coach_id, p_count, p_count);
  end if;
  insert into public.inventory_logs (event_type, coach_id, quantity, operator_id)
  values ('coach_allocated', p_coach_id, p_count, v_auth_user_id);
  return jsonb_build_object(
    'ok', true, 'coachId', p_coach_id, 'allocatedCount', p_count, 'codeIds', to_jsonb(v_code_ids)
  );
end;
$function$;

create or replace function public.generate_platform_codes(
  p_count integer,
  p_box_spec text,
  p_offline_receipt_no text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_max_checkins integer;
  v_box_spec text;
  v_expires_at timestamptz;
  v_pepper text;
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_case_id uuid;
  v_case_ids uuid[] := '{}';
  v_code text;
  v_code_hash text;
  v_case_index integer;
  v_code_index integer;
begin
  if v_auth_user_id is null then raise exception 'UNAUTHORIZED'; end if;
  if public.coach_promotion_is_probational(v_auth_user_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if nullif(btrim(p_offline_receipt_no), '') is null then raise exception 'OFFLINE_RECEIPT_REQUIRED'; end if;
  if p_count is null or p_count <= 0 or p_count % 24 <> 0 or p_count > 2400 then
    raise exception 'INVALID_CODE_COUNT';
  end if;

  select (c.config_value #>> '{}')::integer into v_max_checkins
  from public.system_configs c where c.config_key = 'max_checkins_per_box' for update;
  if not found or v_max_checkins is null or v_max_checkins <= 0 then raise exception 'SYSTEM_CONFIG_MISSING'; end if;
  select c.config_value #>> '{}' into v_box_spec
  from public.system_configs c where c.config_key = 'default_box_spec' for update;
  if not found or v_box_spec is null or p_box_spec is distinct from v_box_spec then
    raise exception 'BOX_SPEC_CONFIG_MISMATCH';
  end if;
  select (c.config_value ->> 'default_expires_at')::timestamptz into v_expires_at
  from public.system_configs c where c.config_key = 'box_code_expiry_policy' for update;
  if not found or v_expires_at is null then raise exception 'SYSTEM_CONFIG_MISSING'; end if;
  select decrypted_secret into v_pepper from vault.decrypted_secrets where name = 'box_code_pepper';
  if v_pepper is null or v_pepper = '' then raise exception 'BOX_CODE_PEPPER_NOT_CONFIGURED'; end if;

  for v_case_index in 1..(p_count / 24) loop
    v_case_id := gen_random_uuid();
    v_case_ids := array_append(v_case_ids, v_case_id);
    for v_code_index in 1..24 loop
      loop
        select string_agg(
          substr(v_alphabet, 1 + get_byte(secret.random_bytes, position.index - 1) % length(v_alphabet), 1), ''
        ) into v_code
        from (select gen_random_bytes(4) as random_bytes) secret
        cross join lateral (select generate_series(1, 4) as index) position;
        v_code := 'JH-EL-' || v_code;
        v_code_hash := encode(hmac(v_code, v_pepper, 'sha256'), 'hex');
        exit when not exists (select 1 from public.box_codes b where b.code_hash = v_code_hash);
      end loop;
      insert into public.box_codes (
        code_hash, code_type, code_format, state, coach_id, case_id,
        max_checkins, used_checkins, box_spec, inventory_status, code_ciphertext, expires_at
      ) values (
        v_code_hash, 'experience', 'short', 'unused', v_auth_user_id, v_case_id,
        v_max_checkins, 0, v_box_spec, 'platform', pgp_sym_encrypt(v_code, v_pepper), v_expires_at
      );
    end loop;
    insert into public.inventory_logs (
      event_type, case_id, quantity, operator_id, offline_receipt_no
    ) values ('platform_generated', v_case_id, 24, v_auth_user_id, btrim(p_offline_receipt_no));
  end loop;
  return jsonb_build_object(
    'ok', true, 'generatedCount', p_count, 'caseIds', to_jsonb(v_case_ids),
    'boxSpec', v_box_spec, 'maxCheckins', v_max_checkins
  );
end;
$function$;


create or replace function public.get_coach_camp_trends_v1(p_scope text)
returns table (
  day_index integer,
  participants integer,
  weight_samples integer,
  waist_samples integer,
  avg_weight_change_percent numeric,
  avg_waist_change_percent numeric,
  meal_completion_rate numeric,
  water_rate numeric,
  movement_rate numeric,
  sleep_rate numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_role text;
  v_scope text := p_scope;
  v_is_probational boolean;
begin
  if p_scope is null or p_scope not in ('own', 'all') then
    raise exception 'INVALID_SCOPE' using errcode = '22023';
  end if;
  if v_auth_user_id is null then raise exception 'UNAUTHORIZED' using errcode = '42501'; end if;
  v_is_probational := public.coach_promotion_is_probational(v_auth_user_id);
  if v_is_probational and v_scope = 'all' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select a.role into v_role from public.camp_admins a
  where a.auth_user_id = v_auth_user_id and a.is_active;
  if not v_is_probational and (not found or v_role not in ('admin', 'coach')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  with visible_campers as (
    select c.auth_user_id, c.start_date, c.records
    from public.checkin_sync c
    where (v_scope = 'all') or (
      v_scope = 'own' and exists (
        select 1 from public.user_coach_relation r
        where r.auth_user_id = c.auth_user_id
          and r.referrer_id = v_auth_user_id and r.valid_to is null
      )
    )
  ),
  raw_record_days as (
    select vc.auth_user_id, vc.start_date, days.key as record_key, days.value as day
    from visible_campers vc
    left join lateral jsonb_each(
      case when jsonb_typeof(vc.records) = 'object' then vc.records else '{}'::jsonb end
    ) days on true
  ),
  parsed_record_days as (
    select
      raw.auth_user_id, raw.start_date,
      public.coach_radar_record_date(raw.record_key) as record_date,
      public.coach_radar_representative_weight(raw.day) as representative_weight,
      public.coach_radar_json_number(raw.day->'waist') as waist,
      public.coach_radar_day_has_content(raw.day) as has_content,
      raw.day
    from raw_record_days raw
  ),
  record_days as (
    select parsed.*, parsed.record_date - parsed.start_date + 1 as day_index
    from parsed_record_days parsed
    where parsed.record_date is not null and parsed.start_date is not null
      and parsed.record_date between parsed.start_date and parsed.start_date + 20
  ),
  ranked_weight_baselines as (
    select record_days.auth_user_id, record_days.representative_weight,
      row_number() over (partition by record_days.auth_user_id order by record_days.record_date asc) as rn
    from record_days
    where record_days.representative_weight is not null and record_days.representative_weight > 0
  ),
  ranked_waist_baselines as (
    select record_days.auth_user_id, record_days.waist,
      row_number() over (partition by record_days.auth_user_id order by record_days.record_date asc) as rn
    from record_days
    where record_days.waist is not null and record_days.waist > 0
  ),
  changed_days as (
    select
      rd.day_index, rd.has_content, rd.day,
      case
        when rd.has_content and rd.representative_weight > 0 and weight_baseline.representative_weight > 0
        then round(
          (rd.representative_weight - weight_baseline.representative_weight)
            / weight_baseline.representative_weight * 100, 1
        ) else null
      end as weight_change_percent,
      case
        when rd.has_content and rd.waist > 0 and waist_baseline.waist > 0
        then round((rd.waist - waist_baseline.waist) / waist_baseline.waist * 100, 1)
        else null
      end as waist_change_percent
    from record_days rd
    left join (
      select ranked.auth_user_id, ranked.representative_weight
      from ranked_weight_baselines ranked where ranked.rn = 1
    ) weight_baseline on weight_baseline.auth_user_id = rd.auth_user_id
    left join (
      select ranked.auth_user_id, ranked.waist
      from ranked_waist_baselines ranked where ranked.rn = 1
    ) waist_baseline on waist_baseline.auth_user_id = rd.auth_user_id
  ),
  aggregated as (
    select
      rd.day_index,
      count(*) filter (where rd.has_content)::integer as participants,
      count(*) filter (where rd.has_content and rd.weight_change_percent is not null)::integer as weight_samples,
      count(*) filter (where rd.has_content and rd.waist_change_percent is not null)::integer as waist_samples,
      round(avg(rd.weight_change_percent), 1) as avg_weight_change_percent,
      round(avg(rd.waist_change_percent), 1) as avg_waist_change_percent,
      case when count(*) filter (where rd.has_content) = 0 then null else round(
        sum(case
          when rd.has_content and jsonb_typeof(rd.day->'meals') = 'array'
            and jsonb_array_length(rd.day->'meals') = 3
          then
            (case when rd.day->'meals'->0 = 'true'::jsonb then 1 else 0 end)
            + (case when rd.day->'meals'->1 = 'true'::jsonb then 1 else 0 end)
            + (case when rd.day->'meals'->2 = 'true'::jsonb then 1 else 0 end)
          else 0
        end)::numeric / (count(*) filter (where rd.has_content) * 3) * 100, 1
      ) end as meal_completion_rate,
      case when count(*) filter (where rd.has_content) = 0 then null else round(
        count(*) filter (
          where rd.has_content and jsonb_typeof(rd.day->'water') = 'boolean'
            and (rd.day->>'water')::boolean
        )::numeric / count(*) filter (where rd.has_content) * 100, 1
      ) end as water_rate,
      case when count(*) filter (where rd.has_content) = 0 then null else round(
        count(*) filter (
          where rd.has_content and jsonb_typeof(rd.day->'movement') = 'boolean'
            and (rd.day->>'movement')::boolean
        )::numeric / count(*) filter (where rd.has_content) * 100, 1
      ) end as movement_rate,
      case when count(*) filter (where rd.has_content) = 0 then null else round(
        count(*) filter (
          where rd.has_content and jsonb_typeof(rd.day->'sleep') = 'boolean'
            and (rd.day->>'sleep')::boolean
        )::numeric / count(*) filter (where rd.has_content) * 100, 1
      ) end as sleep_rate
    from changed_days rd group by rd.day_index
  ),
  aligned_days as (
    select days.day_index from generate_series(1, 21) as days(day_index)
  )
  select
    days.day_index,
    coalesce(a.participants, 0)::integer,
    coalesce(a.weight_samples, 0)::integer,
    coalesce(a.waist_samples, 0)::integer,
    a.avg_weight_change_percent,
    a.avg_waist_change_percent,
    case when coalesce(a.participants, 0) = 0 then null else a.meal_completion_rate end,
    case when coalesce(a.participants, 0) = 0 then null else a.water_rate end,
    case when coalesce(a.participants, 0) = 0 then null else a.movement_rate end,
    case when coalesce(a.participants, 0) = 0 then null else a.sleep_rate end
  from aligned_days days
  left join aggregated a on a.day_index = days.day_index
  order by days.day_index;
end;
$function$;


create or replace function public.get_coach_radar_v1(p_scope text)
returns table (
  camper_code text,
  weight_delta numeric,
  waist_delta numeric,
  bmi numeric,
  alert_level text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_role text;
  v_today date := (now() at time zone 'Asia/Shanghai')::date;
  v_is_probational boolean;
begin
  if p_scope is null or p_scope not in ('own', 'all') then
    raise exception 'INVALID_SCOPE' using errcode = '22023';
  end if;
  if v_auth_user_id is null then return; end if;
  v_is_probational := public.coach_promotion_is_probational(v_auth_user_id);
  if v_is_probational and p_scope = 'all' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select a.role into v_role from public.camp_admins a
  where a.auth_user_id = v_auth_user_id and a.is_active;
  if v_is_probational then
    v_role := 'probational_coach';
  elsif not found or v_role not in ('coach', 'admin', 'staff') then
    return;
  end if;
  if p_scope = 'all' and v_role <> 'admin' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  with visible_campers as (
    select r.auth_user_id, r.camper_code, c.start_date, c.height_cm, c.initial_weight_kg, c.records
    from public.user_coach_relation r
    left join public.checkin_sync c on c.auth_user_id = r.auth_user_id
    where r.valid_to is null and (
      (v_role in ('coach', 'probational_coach') and r.referrer_id = v_auth_user_id)
      or (v_role = 'admin' and (p_scope = 'all' or r.referrer_id = v_auth_user_id))
      or (
        v_role = 'staff' and exists (
          select 1 from public.staff_coach_assignment sa
          where sa.staff_id = v_auth_user_id and sa.coach_id = r.referrer_id
            and sa.state = 'active' and sa.valid_from <= now()
            and (sa.valid_to is null or sa.valid_to > now())
        )
      )
    )
  ),
  raw_record_days as (
    select vc.*, days.key as record_key, days.value as day
    from visible_campers vc
    left join lateral jsonb_each(
      case when jsonb_typeof(vc.records) = 'object' then vc.records else '{}'::jsonb end
    ) days on true
  ),
  parsed_record_days as (
    select
      raw.auth_user_id, raw.start_date,
      public.coach_radar_record_date(raw.record_key) as record_date,
      public.coach_radar_representative_weight(raw.day) as representative_weight,
      public.coach_radar_json_number(raw.day->'waist') as waist,
      public.coach_radar_day_has_content(raw.day) as has_content
    from raw_record_days raw
  ),
  record_days as (
    select parsed.* from parsed_record_days parsed
    where parsed.record_date is not null and parsed.start_date is not null
      and parsed.record_date between parsed.start_date and parsed.start_date + 20
  ),
  ranked_weights as (
    select record_days.auth_user_id, record_days.representative_weight,
      row_number() over (partition by record_days.auth_user_id order by record_days.record_date desc) as rn
    from record_days where record_days.representative_weight is not null
  ),
  ranked_initial_weights as (
    select record_days.auth_user_id, record_days.representative_weight,
      row_number() over (partition by record_days.auth_user_id order by record_days.record_date asc) as rn
    from record_days where record_days.representative_weight is not null
  ),
  ranked_waists as (
    select record_days.auth_user_id, record_days.waist,
      row_number() over (partition by record_days.auth_user_id order by record_days.record_date desc) as rn
    from record_days where record_days.waist is not null and record_days.waist > 0
  ),
  ranked_initial_waists as (
    select record_days.auth_user_id, record_days.waist,
      row_number() over (partition by record_days.auth_user_id order by record_days.record_date asc) as rn
    from record_days where record_days.waist is not null and record_days.waist > 0
  ),
  ranked_activity as (
    select record_days.auth_user_id, record_days.record_date,
      row_number() over (partition by record_days.auth_user_id order by record_days.record_date desc) as rn
    from record_days where record_days.has_content
  )
  select
    vc.camper_code,
    case
      when current_weight.representative_weight is null or coalesce(
        case when vc.initial_weight_kg > 0 then vc.initial_weight_kg end,
        initial_weight.representative_weight
      ) is null then null
      when current_weight.representative_weight - coalesce(
        case when vc.initial_weight_kg > 0 then vc.initial_weight_kg end,
        initial_weight.representative_weight
      ) = 0 then 0::numeric
      else current_weight.representative_weight - coalesce(
        case when vc.initial_weight_kg > 0 then vc.initial_weight_kg end,
        initial_weight.representative_weight
      )
    end as weight_delta,
    case
      when current_waist.waist is null or initial_waist.waist is null then null
      when current_waist.waist - initial_waist.waist = 0 then 0::numeric
      else current_waist.waist - initial_waist.waist
    end as waist_delta,
    case
      when current_weight.representative_weight is null or vc.height_cm is null or vc.height_cm <= 0 then null
      else current_weight.representative_weight / power(vc.height_cm / 100, 2)
    end as bmi,
    case
      when vc.start_date is not null and v_today > vc.start_date + 20 and not exists (
        select 1 from public.code_activations recharge
        join public.box_codes recharge_code
          on recharge_code.activation_id = recharge.activation_id and recharge_code.state = 'active'
        where recharge.auth_user_id = vc.auth_user_id
          and recharge.expected_code_type = 'recharge' and recharge.activated_at is not null
      ) then 'red'
      when latest_activity.record_date is null then 'red'
      when v_today - latest_activity.record_date >= 3 then 'red'
      when v_today - latest_activity.record_date = 2 then 'yellow'
      else 'green'
    end as alert_level
  from visible_campers vc
  left join (
    select ranked.auth_user_id, ranked.representative_weight from ranked_weights ranked where ranked.rn = 1
  ) current_weight on current_weight.auth_user_id = vc.auth_user_id
  left join (
    select ranked.auth_user_id, ranked.representative_weight from ranked_initial_weights ranked where ranked.rn = 1
  ) initial_weight on initial_weight.auth_user_id = vc.auth_user_id
  left join (
    select ranked.auth_user_id, ranked.waist from ranked_waists ranked where ranked.rn = 1
  ) current_waist on current_waist.auth_user_id = vc.auth_user_id
  left join (
    select ranked.auth_user_id, ranked.waist from ranked_initial_waists ranked where ranked.rn = 1
  ) initial_waist on initial_waist.auth_user_id = vc.auth_user_id
  left join (
    select ranked.auth_user_id, ranked.record_date from ranked_activity ranked where ranked.rn = 1
  ) latest_activity on latest_activity.auth_user_id = vc.auth_user_id;
end;
$function$;

-- 无参入口保持历史 Admin 全栈、coach 本人、staff 分配范围；准教练固定 own。
create or replace function public.get_coach_radar_v1()
returns table (
  camper_code text,
  weight_delta numeric,
  waist_delta numeric,
  bmi numeric,
  alert_level text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role text;
begin
  select a.role into v_role from public.camp_admins a
  where a.auth_user_id = auth.uid() and a.is_active;
  if v_role = 'admin' then
    return query select * from public.get_coach_radar_v1('all');
  else
    return query select * from public.get_coach_radar_v1('own');
  end if;
end;
$function$;

revoke all on function public.get_my_code_inventory() from public, anon, authenticated;
revoke all on function public.request_coach_restock_v1(text) from public, anon, authenticated;
revoke all on function public.coach_push_code_v1(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.allocate_codes_to_coach(uuid, integer) from public, anon, authenticated;
revoke all on function public.generate_platform_codes(integer, text, text) from public, anon, authenticated;
revoke all on function public.get_coach_camp_trends_v1(text) from public, anon, authenticated;
revoke all on function public.get_coach_radar_v1() from public, anon, authenticated;
revoke all on function public.get_coach_radar_v1(text) from public, anon, authenticated;
grant execute on function public.get_my_code_inventory() to authenticated;
grant execute on function public.request_coach_restock_v1(text) to authenticated;
grant execute on function public.coach_push_code_v1(uuid, uuid, text) to authenticated;
grant execute on function public.allocate_codes_to_coach(uuid, integer) to authenticated;
grant execute on function public.generate_platform_codes(integer, text, text) to authenticated;
grant execute on function public.get_coach_camp_trends_v1(text) to authenticated;
grant execute on function public.get_coach_radar_v1() to authenticated;
grant execute on function public.get_coach_radar_v1(text) to authenticated;

comment on function public.get_coach_camp_trends_v1(text) is
  'D1-D21 aggregate: Admin own/all, formal coach own/all, probational own only.';
comment on function public.get_coach_radar_v1(text) is
  'Five-field radar: Admin own/all, coach own, staff assigned own, probational own only.';

commit;
