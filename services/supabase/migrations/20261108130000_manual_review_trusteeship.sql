begin;

-- TASK-10.9：只负责人工审核与休眠托管，不改变打卡扣次和库存分配规则。
create table public.audit_logs (
  audit_id uuid primary key default gen_random_uuid(),
  action text not null check (action in (
    'code_activation_approved',
    'code_activation_rejected',
    'coach_users_trusteed'
  )),
  target_id uuid not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  from_coach_id uuid references auth.users(id) on delete restrict,
  to_coach_id uuid references auth.users(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;

create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  raise exception 'AUDIT_LOG_APPEND_ONLY';
end;
$function$;

create trigger audit_log_append_only
before update or delete on public.audit_logs
for each row execute function public.prevent_audit_log_mutation();

-- 月度判定由受控服务端或后续生命周期任务写入；本迁移不自动推进状态。
create table public.coach_lifecycles (
  coach_id uuid primary key references auth.users(id) on delete restrict,
  state text not null default 'active' check (state in ('active', 'buffer', 'dormant')),
  version integer not null default 1 check (version > 0),
  state_entered_at timestamptz not null default now(),
  dormant_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_lifecycle_dormant_time check (
    (state = 'dormant' and dormant_at is not null)
    or (state <> 'dormant' and dormant_at is null)
  )
);

alter table public.coach_lifecycles enable row level security;
revoke all on public.coach_lifecycles from anon, authenticated;

-- 用户输入码只提交审核申请。没有归属写入、激活授权或库存扣减。
create or replace function public.request_box_code_activation(
  p_code text,
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
  v_code_hash text;
  v_code_format text;
  v_payload_hash text;
  v_code public.box_codes%rowtype;
  v_command public.box_code_commands%rowtype;
  v_camper_code text;
  v_activation_id uuid;
  v_result jsonb;
begin
  if v_auth_user_id is null then
    return public.box_code_error('UNAUTHORIZED');
  end if;
  if nullif(p_idempotency_key, '') is null then
    return public.box_code_error('IDEMPOTENCY_CONFLICT');
  end if;

  v_pepper := nullif(current_setting('app.box_code_pepper', true), '');
  if v_pepper is null then
    return public.box_code_error('CODE_HASH_NOT_CONFIGURED');
  end if;

  v_payload_hash := encode(hmac(
    'request|' || v_auth_user_id::text || '|' || coalesce(p_code, ''),
    v_pepper,
    'sha256'
  ), 'hex');

  select * into v_command
  from public.box_code_commands
  where idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_command.command_type <> 'activation'
      or v_command.caller_auth_user_id <> v_auth_user_id
      or v_command.payload_hash <> v_payload_hash
    then
      return public.box_code_error('IDEMPOTENCY_CONFLICT');
    end if;
    if v_command.result is null then
      return public.box_code_error('ACTIVATION_STATE_CONFLICT');
    end if;
    return jsonb_set(v_command.result, '{replayed}', 'true'::jsonb);
  end if;

  if p_code ~ '^JH-(EL|RC)-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$' then
    v_code_format := 'short';
  elsif p_code ~ '^JH-(EL|RC)-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12,16}$' then
    v_code_format := 'long';
  else
    return public.box_code_error('CODE_NOT_AVAILABLE');
  end if;

  v_code_hash := encode(hmac(p_code, v_pepper, 'sha256'), 'hex');
  select * into v_code
  from public.box_codes
  where code_hash = v_code_hash
  for update;
  if not found then
    return public.box_code_error('CODE_NOT_AVAILABLE');
  end if;

  -- 同一码被并发申请时，后取得锁的请求不能排队共享激活。
  if v_code.state <> 'unused' then
    return public.box_code_error('ACTIVATION_STATE_CONFLICT');
  end if;

  select user_code into v_camper_code
  from public.checkin_sync
  where auth_user_id = v_auth_user_id;
  if not found then
    return public.box_code_error('ACTIVATION_STATE_CONFLICT');
  end if;

  insert into public.code_activations (
    code_id,
    auth_user_id,
    camper_code,
    expected_code_type,
    expected_code_format,
    review_state
  ) values (
    v_code.code_id,
    v_auth_user_id,
    v_camper_code,
    v_code.code_type,
    v_code_format,
    'pending'
  )
  returning activation_id into v_activation_id;

  update public.box_codes
  set state = 'pending_review', version = version + 1, updated_at = now()
  where code_id = v_code.code_id
    and version = v_code.version;

  insert into public.box_code_events (
    event_type,
    code_id,
    activation_id,
    actor_auth_user_id
  ) values (
    'CodeActivationRequested',
    v_code.code_id,
    v_activation_id,
    v_auth_user_id
  );

  v_result := jsonb_build_object(
    'ok', true,
    'activationId', v_activation_id,
    'codeId', v_code.code_id,
    'state', 'pending_review',
    'replayed', false
  );
  insert into public.box_code_commands (
    idempotency_key,
    command_type,
    payload_hash,
    caller_auth_user_id,
    result
  ) values (
    p_idempotency_key,
    'activation',
    v_payload_hash,
    v_auth_user_id,
    v_result
  );

  return v_result;
end;
$function$;

-- Admin 列表只返回脱数码面与不透明主体 ID，线下凭证保留在受限审核链路。
create or replace function public.admin_get_pending_box_code_reviews()
returns table (
  activation_id uuid,
  auth_user_id uuid,
  camper_code text,
  coach_id uuid,
  code_id uuid,
  code_masked text,
  code_type text,
  shipment_verification_ref text,
  payment_verification_ref text,
  code_version integer,
  activation_version integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_pepper text;
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN';
  end if;

  v_pepper := nullif(current_setting('app.box_code_pepper', true), '');
  if v_pepper is null then
    raise exception 'CODE_HASH_NOT_CONFIGURED';
  end if;

  return query
  select
    a.activation_id,
    a.auth_user_id,
    a.camper_code,
    b.coach_id,
    b.code_id,
    case
      when b.code_ciphertext is null then '历史码不可用'
      else left(pgp_sym_decrypt(b.code_ciphertext, v_pepper), 6)
        || '…' || right(pgp_sym_decrypt(b.code_ciphertext, v_pepper), 4)
    end as code_masked,
    b.code_type,
    a.shipment_verification_ref,
    a.payment_verification_ref,
    b.version as code_version,
    a.version as activation_version
  from public.code_activations a
  join public.box_codes b on b.code_id = a.code_id
  where a.review_state = 'pending'
    and b.state = 'pending_review'
  order by a.created_at, a.activation_id;
end;
$function$;

-- 人工终审：通过才原子开通权益；拒绝必须留原因并补发新 code_id。
create or replace function public.admin_review_box_code_activation(
  p_activation_id uuid,
  p_decision text,
  p_shipment_verification_ref text default null,
  p_payment_verification_ref text default null,
  p_rejection_reason_code text default null,
  p_expected_code_version integer default null,
  p_expected_activation_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_code public.box_codes%rowtype;
  v_activation public.code_activations%rowtype;
  v_relation public.user_coach_relation%rowtype;
  v_inventory public.coach_inventory%rowtype;
  v_target_referrer_id uuid;
  v_relation_id uuid;
  v_shipment_ref text := nullif(btrim(p_shipment_verification_ref), '');
  v_payment_ref text := nullif(btrim(p_payment_verification_ref), '');
  v_rejection_reason text := nullif(btrim(p_rejection_reason_code), '');
  v_platform_id uuid;
  v_pepper text;
  v_replacement_code_id uuid;
  v_replacement_code text;
  v_replacement_hash text;
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code_length integer;
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'REVIEW_DECISION_INVALID';
  end if;

  -- 锁顺序：box_codes → code_activations → user_coach_relation → coach_inventory。
  select b.* into v_code
  from public.box_codes b
  join public.code_activations a on a.code_id = b.code_id
  where a.activation_id = p_activation_id
  for update of b;
  if not found then
    raise exception 'CODE_NOT_AVAILABLE';
  end if;

  select * into v_activation
  from public.code_activations
  where activation_id = p_activation_id
  for update;
  if v_code.state <> 'pending_review'
    or v_activation.review_state <> 'pending'
    or v_code.version is distinct from p_expected_code_version
    or v_activation.version is distinct from p_expected_activation_version
  then
    raise exception 'ACTIVATION_STATE_CONFLICT';
  end if;

  if p_decision = 'rejected' then
    if v_rejection_reason is null then
      raise exception 'REJECTION_REASON_REQUIRED';
    end if;

    v_pepper := nullif(current_setting('app.box_code_pepper', true), '');
    if v_pepper is null then
      raise exception 'CODE_HASH_NOT_CONFIGURED';
    end if;
    v_code_length := case when v_code.code_format = 'short' then 4 else 12 end;
    loop
      select string_agg(
        substr(v_alphabet, 1 + get_byte(secret.random_bytes, position.index - 1) % length(v_alphabet), 1),
        ''
      ) into v_replacement_code
      from (select gen_random_bytes(v_code_length) as random_bytes) secret
      cross join lateral (select generate_series(1, v_code_length) as index) position;
      v_replacement_code := (case when v_code.code_type = 'experience' then 'JH-EL-' else 'JH-RC-' end)
        || v_replacement_code;
      v_replacement_hash := encode(hmac(v_replacement_code, v_pepper, 'sha256'), 'hex');
      exit when not exists (select 1 from public.box_codes b where b.code_hash = v_replacement_hash);
    end loop;

    insert into public.box_codes (
      code_hash,
      code_type,
      code_format,
      state,
      coach_id,
      case_id,
      max_checkins,
      used_checkins,
      box_spec,
      inventory_status,
      code_ciphertext
    ) values (
      v_replacement_hash,
      v_code.code_type,
      v_code.code_format,
      'unused',
      v_code.coach_id,
      gen_random_uuid(),
      v_code.max_checkins,
      0,
      v_code.box_spec,
      v_code.inventory_status,
      pgp_sym_encrypt(v_replacement_code, v_pepper)
    )
    returning code_id into v_replacement_code_id;

    update public.code_activations
    set
      review_state = 'rejected',
      decided_by = v_auth_user_id,
      decided_at = now(),
      rejection_reason_code = v_rejection_reason,
      replacement_code_id = v_replacement_code_id,
      version = version + 1,
      updated_at = now()
    where activation_id = v_activation.activation_id;

    update public.box_codes
    set state = 'revoked', version = version + 1, updated_at = now()
    where code_id = v_code.code_id;

    insert into public.box_code_events (event_type, code_id, activation_id, actor_auth_user_id, reason_code)
    values ('CodeActivationRejected', v_code.code_id, v_activation.activation_id, v_auth_user_id, v_rejection_reason);
    insert into public.box_code_events (event_type, code_id, activation_id, actor_auth_user_id, metadata)
    values (
      'CodeReplacementIssued',
      v_replacement_code_id,
      v_activation.activation_id,
      v_auth_user_id,
      jsonb_build_object('replacedCodeId', v_code.code_id)
    );
    insert into public.audit_logs (action, target_id, actor_id, reviewer_id, metadata)
    values (
      'code_activation_rejected',
      v_activation.activation_id,
      v_auth_user_id,
      v_auth_user_id,
      jsonb_build_object(
        'codeId', v_code.code_id,
        'replacementCodeId', v_replacement_code_id,
        'reason', v_rejection_reason
      )
    );

    return jsonb_build_object(
      'ok', true,
      'state', 'revoked',
      'activationId', v_activation.activation_id,
      'replacementCodeId', v_replacement_code_id
    );
  end if;

  v_shipment_ref := coalesce(v_shipment_ref, nullif(v_activation.shipment_verification_ref, ''));
  v_payment_ref := coalesce(v_payment_ref, nullif(v_activation.payment_verification_ref, ''));
  if v_shipment_ref is null then
    raise exception 'SHIPMENT_VERIFICATION_REQUIRED';
  end if;
  if v_code.code_type = 'recharge' and v_payment_ref is null then
    raise exception 'PAYMENT_VERIFICATION_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('relation:' || v_activation.auth_user_id::text, 0));
  select * into v_relation
  from public.user_coach_relation
  where auth_user_id = v_activation.auth_user_id
    and valid_to is null
  for update;

  if found then
    v_target_referrer_id := v_relation.referrer_id;
  elsif exists (
    select 1 from public.coach_lifecycles c
    where c.coach_id = v_code.coach_id and c.state = 'dormant'
  ) then
    select (c.config_value #>> '{}')::uuid into v_platform_id
    from public.system_configs c
    where c.config_key = 'platform_official_account_id';
    if v_platform_id is null or not exists (select 1 from auth.users u where u.id = v_platform_id) then
      raise exception 'PLATFORM_ACCOUNT_NOT_CONFIGURED';
    end if;
    v_target_referrer_id := v_platform_id;
  else
    v_target_referrer_id := v_code.coach_id;
  end if;

  if v_code.inventory_status = 'coach' then
    select * into v_inventory
    from public.coach_inventory
    where coach_id = v_code.coach_id
    for update;
    if not found or v_inventory.available_count < 1 then
      raise exception 'INVENTORY_INSUFFICIENT';
    end if;
  end if;

  update public.code_activations
  set
    shipment_verification_ref = v_shipment_ref,
    payment_verification_ref = v_payment_ref,
    review_state = 'approved',
    target_referrer_id = v_target_referrer_id,
    decided_by = v_auth_user_id,
    decided_at = now(),
    activated_at = now(),
    version = version + 1,
    updated_at = now()
  where activation_id = v_activation.activation_id;

  update public.box_codes
  set
    state = 'active',
    activation_id = v_activation.activation_id,
    version = version + 1,
    updated_at = now()
  where code_id = v_code.code_id;

  if v_relation.relation_id is null then
    insert into public.user_coach_relation (
      auth_user_id,
      camper_code,
      referrer_id,
      source_code_id,
      reason
    ) values (
      v_activation.auth_user_id,
      v_activation.camper_code,
      v_target_referrer_id,
      v_code.code_id,
      'activation'
    )
    returning relation_id into v_relation_id;

    insert into public.box_code_events (event_type, code_id, activation_id, relation_id, actor_auth_user_id)
    values (
      'UserCoachRelationAssigned',
      v_code.code_id,
      v_activation.activation_id,
      v_relation_id,
      v_auth_user_id
    );
  else
    v_relation_id := v_relation.relation_id;
  end if;

  if v_code.inventory_status = 'coach' then
    update public.coach_inventory
    set available_count = available_count - 1, version = version + 1, updated_at = now()
    where coach_id = v_code.coach_id;
    insert into public.inventory_logs (event_type, coach_id, code_id, quantity, operator_id)
    values ('code_activated', v_code.coach_id, v_code.code_id, 1, v_auth_user_id);
  end if;

  insert into public.box_code_events (event_type, code_id, activation_id, actor_auth_user_id)
  values ('CodeActivated', v_code.code_id, v_activation.activation_id, v_auth_user_id);
  insert into public.audit_logs (action, target_id, actor_id, reviewer_id, metadata)
  values (
    'code_activation_approved',
    v_activation.activation_id,
    v_auth_user_id,
    v_auth_user_id,
    jsonb_build_object('codeId', v_code.code_id, 'relationId', v_relation_id)
  );

  return jsonb_build_object(
    'ok', true,
    'state', 'active',
    'activationId', v_activation.activation_id,
    'relationId', v_relation_id
  );
end;
$function$;

create or replace function public.admin_get_dormant_coaches()
returns table (coach_id uuid, current_user_count bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    c.coach_id,
    count(r.relation_id) as current_user_count
  from public.coach_lifecycles c
  left join public.user_coach_relation r
    on r.referrer_id = c.coach_id and r.valid_to is null
  where c.state = 'dormant'
  group by c.coach_id
  order by c.coach_id;
end;
$function$;

-- 一次人工确认处理全部 dormant 教练；整个批次在同一函数事务内完成。
create or replace function public.admin_transfer_dormant_coaches(
  p_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_platform_id uuid;
  v_effective_at timestamptz := clock_timestamp();
  v_coach_id uuid;
  v_relation public.user_coach_relation%rowtype;
  v_transferred_count integer := 0;
  v_coach_count integer := 0;
  v_coach_transferred integer;
begin
  if v_auth_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_confirmed is not true then
    raise exception 'MANUAL_CONFIRMATION_REQUIRED';
  end if;

  select (c.config_value #>> '{}')::uuid into v_platform_id
  from public.system_configs c
  where c.config_key = 'platform_official_account_id';
  if v_platform_id is null or not exists (select 1 from auth.users u where u.id = v_platform_id) then
    raise exception 'PLATFORM_ACCOUNT_NOT_CONFIGURED';
  end if;

  for v_coach_id in
    select c.coach_id from public.coach_lifecycles c
    where c.state = 'dormant'
    order by c.coach_id
  loop
    perform pg_advisory_xact_lock(hashtextextended('trusteeship:' || v_coach_id::text, 0));
    v_coach_transferred := 0;

    for v_relation in
      select r.* from public.user_coach_relation r
      where r.referrer_id = v_coach_id
        and r.valid_to is null
      order by r.auth_user_id
      for update
    loop
      update public.user_coach_relation
      set
        valid_to = v_effective_at,
        reason = 'dormancy_trusteeship',
        version = version + 1,
        updated_at = now()
      where relation_id = v_relation.relation_id;

      insert into public.user_coach_relation (
        auth_user_id,
        camper_code,
        referrer_id,
        source_code_id,
        valid_from,
        reason
      ) values (
        v_relation.auth_user_id,
        v_relation.camper_code,
        v_platform_id,
        v_relation.source_code_id,
        v_effective_at,
        'dormancy_trusteeship'
      );

      insert into public.audit_logs (
        action,
        target_id,
        actor_id,
        reviewer_id,
        from_coach_id,
        to_coach_id,
        metadata
      ) values (
        'coach_users_trusteed',
        v_relation.auth_user_id,
        v_auth_user_id,
        v_auth_user_id,
        v_relation.referrer_id,
        v_platform_id,
        jsonb_build_object(
          'authUserId', v_relation.auth_user_id,
          'effectiveAt', v_effective_at,
          'relationId', v_relation.relation_id
        )
      );
      v_coach_transferred := v_coach_transferred + 1;
      v_transferred_count := v_transferred_count + 1;
    end loop;

    if v_coach_transferred > 0 then
      v_coach_count := v_coach_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'transferredCount', v_transferred_count,
    'coachCount', v_coach_count,
    'effectiveAt', v_effective_at
  );
end;
$function$;

revoke all on function public.request_box_code_activation(text, text) from public, anon, authenticated;
revoke all on function public.admin_get_pending_box_code_reviews() from public, anon, authenticated;
revoke all on function public.admin_review_box_code_activation(uuid, text, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_get_dormant_coaches() from public, anon, authenticated;
revoke all on function public.admin_transfer_dormant_coaches(boolean) from public, anon, authenticated;
-- 用户不再直接终审；唯一激活推进入口是管理员人工审核 RPC。
revoke all on function public.activate_box_code(text, integer, integer, text) from public, anon, authenticated;

grant execute on function public.request_box_code_activation(text, text) to authenticated;
grant execute on function public.admin_get_pending_box_code_reviews() to authenticated;
grant execute on function public.admin_review_box_code_activation(uuid, text, text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_get_dormant_coaches() to authenticated;
grant execute on function public.admin_transfer_dormant_coaches(boolean) to authenticated;

commit;
