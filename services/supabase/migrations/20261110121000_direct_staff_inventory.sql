begin;

-- TASK-10.13-FINAL-CLEARANCE：复用盒码与持有者库存 SSOT，不新增平行库存。
alter table public.inventory_logs drop constraint if exists inventory_logs_event_type_check;
alter table public.inventory_logs add constraint inventory_logs_event_type_check check (
  event_type in ('platform_generated', 'coach_allocated', 'staff_allocated', 'code_activated')
);

alter table public.staff_rbac_audit drop constraint if exists staff_rbac_audit_action_check;
alter table public.staff_rbac_audit add constraint staff_rbac_audit_action_check check (action in (
  'access_denied',
  'staff_role_granted',
  'staff_role_changed',
  'staff_role_deactivated',
  'staff_assignment_created',
  'staff_assignment_revoked',
  'staff_capacity_warning',
  'staff_governance_followup',
  'staff_finance_denied',
  'staff_inventory_allocated'
));

create or replace function public.admin_search_staff_directory_v1(p_query text)
returns table (
  staff_id uuid,
  email text,
  is_active boolean,
  version integer,
  coach_count integer,
  camper_count integer,
  assignments jsonb
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_query text := btrim(coalesce(p_query, ''));
begin
  if v_auth_user_id is null then raise exception 'UNAUTHORIZED' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_query = '' then return; end if;

  return query
  select d.staff_id, d.email, d.is_active, d.version,
    d.coach_count, d.camper_count, d.assignments
  from public.admin_get_staff_directory() d
  where d.is_active and d.email ilike '%' || v_query || '%'
  order by d.email, d.staff_id
  limit 10;
end;
$function$;

create or replace function public.allocate_codes_to_staff_v1(p_staff_id uuid, p_count integer)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_code_ids uuid[];
  v_selected_count integer;
  v_inventory public.coach_inventory%rowtype;
begin
  if v_auth_user_id is null then raise exception 'UNAUTHORIZED' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_staff_id is null or p_count is null or p_count <= 0 then raise exception 'INVALID_ALLOCATION'; end if;
  if not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = p_staff_id and a.role = 'staff' and a.is_active
  ) then
    raise exception 'STAFF_NOT_FOUND';
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
  set coach_id = p_staff_id, inventory_status = 'coach', version = version + 1, updated_at = now()
  where code_id = any(v_code_ids);

  select * into v_inventory from public.coach_inventory where coach_id = p_staff_id for update;
  if found then
    update public.coach_inventory
    set allocated_count = allocated_count + p_count, available_count = available_count + p_count,
      version = version + 1, updated_at = now()
    where coach_id = p_staff_id;
  else
    insert into public.coach_inventory (coach_id, allocated_count, available_count)
    values (p_staff_id, p_count, p_count);
  end if;

  insert into public.inventory_logs (event_type, coach_id, quantity, operator_id)
  values ('staff_allocated', p_staff_id, p_count, v_auth_user_id);
  insert into public.staff_rbac_audit (
    action, actor_id, target_id, target_role, result, metadata
  ) values (
    'staff_inventory_allocated', v_auth_user_id, p_staff_id, 'staff', 'success',
    jsonb_build_object('allocatedCount', p_count)
  );
  return jsonb_build_object('ok', true, 'allocatedCount', p_count);
end;
$function$;

create or replace function public.get_my_access_profile()
returns table (role text, can_view_radar boolean, can_manage_inventory boolean)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_role text;
begin
  select a.role into v_role
  from public.camp_admins a
  where a.auth_user_id = auth.uid() and a.is_active;
  if not found then return; end if;
  return query select v_role, true, v_role in ('coach', 'staff');
end;
$function$;

-- 本人库存查询保持不变，仅将有效直营 staff 纳入同一持有者边界。
create or replace function public.get_my_code_inventory()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_role text;
  v_pepper text;
  v_restock_point integer;
  v_available_count integer;
  v_codes jsonb;
begin
  if v_auth_user_id is null then raise exception 'UNAUTHORIZED'; end if;
  if public.coach_promotion_is_probational(v_auth_user_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select a.role into v_role from public.camp_admins a
  where a.auth_user_id = v_auth_user_id and a.is_active;
  if not found or v_role not in ('coach', 'staff') then
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

-- coach 路径不变；staff 仅能使用本人码与当前分配教练的当前营员关系。
create or replace function public.coach_push_code_v1(
  p_camper_ref uuid,
  p_code_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_role text;
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
  select a.role into v_role from public.camp_admins a
  where a.auth_user_id = v_auth_user_id and a.is_active;
  if not found or v_role not in ('coach', 'staff') then
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
  where r.relation_id = p_camper_ref and r.valid_to is null
    and (
      (v_role = 'coach' and r.referrer_id = v_auth_user_id)
      or (
        v_role = 'staff' and exists (
          select 1 from public.staff_coach_assignment sa
          where sa.staff_id = v_auth_user_id and sa.coach_id = r.referrer_id
            and sa.state = 'active' and sa.valid_from <= now()
            and (sa.valid_to is null or sa.valid_to > now())
        )
      )
    )
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

-- staff 持有码只能在当前分配范围仍成立时进入既有 Admin 原子终审。
create or replace function public.admin_review_box_code_activation_v2(
  p_activation_id uuid,
  p_decision text,
  p_target_coach_id uuid,
  p_shipment_verification_ref text default null,
  p_payment_verification_ref text default null,
  p_rejection_reason_code text default null,
  p_expected_code_version integer default null,
  p_expected_activation_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_holder_role text;
begin
  if v_auth_user_id is null or not exists (
    select 1 from public.camp_admins a
    where a.auth_user_id = v_auth_user_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_target_coach_id is null then raise exception 'COACH_SELECTION_MISMATCH'; end if;
  select a.role into v_holder_role from public.camp_admins a
  where a.auth_user_id = p_target_coach_id and a.is_active and a.role in ('coach', 'staff');
  if not found then raise exception 'COACH_SELECTION_MISMATCH'; end if;

  if not exists (
    select 1
    from public.code_activations a
    join public.box_codes b on b.code_id = a.code_id
    where a.activation_id = p_activation_id
      and a.review_state = 'pending' and b.state = 'pending_review'
      and b.coach_id = p_target_coach_id
      and (
        v_holder_role = 'coach'
        or (
          v_holder_role = 'staff' and a.request_source = 'coach_push'
          and exists (
            select 1 from public.user_coach_relation r
            where r.auth_user_id = a.auth_user_id and r.valid_to is null
              and exists (
                select 1 from public.staff_coach_assignment sa
                where sa.staff_id = p_target_coach_id and sa.coach_id = r.referrer_id
                  and sa.state = 'active' and sa.valid_from <= now()
                  and (sa.valid_to is null or sa.valid_to > now())
              )
          )
        )
      )
  ) then
    raise exception 'COACH_SELECTION_MISMATCH';
  end if;

  return public.admin_review_box_code_activation(
    p_activation_id,
    p_decision,
    p_shipment_verification_ref,
    p_payment_verification_ref,
    p_rejection_reason_code,
    p_expected_code_version,
    p_expected_activation_version
  );
end;
$function$;

revoke all on function public.admin_search_staff_directory_v1(text) from public, anon, authenticated;
revoke all on function public.allocate_codes_to_staff_v1(uuid, integer) from public, anon, authenticated;
revoke all on function public.get_my_access_profile() from public, anon, authenticated;
revoke all on function public.get_my_code_inventory() from public, anon, authenticated;
revoke all on function public.coach_push_code_v1(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_review_box_code_activation_v2(uuid, text, uuid, text, text, text, integer, integer) from public, anon, authenticated;

grant execute on function public.admin_search_staff_directory_v1(text) to authenticated;
grant execute on function public.allocate_codes_to_staff_v1(uuid, integer) to authenticated;
grant execute on function public.get_my_access_profile() to authenticated;
grant execute on function public.get_my_code_inventory() to authenticated;
grant execute on function public.coach_push_code_v1(uuid, uuid, text) to authenticated;
grant execute on function public.admin_review_box_code_activation_v2(uuid, text, uuid, text, text, text, integer, integer) to authenticated;

commit;
