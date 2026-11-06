begin;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

alter table public.camp_admins
  add column if not exists auth_user_id uuid,
  add column if not exists role text default 'admin';

create unique index if not exists camp_admins_auth_user_id_key
  on public.camp_admins (auth_user_id)
  where auth_user_id is not null;

create table public.user_profiles (
  auth_user_id uuid primary key references auth.users(id) on delete restrict,
  phone text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from anon, authenticated;

create table public.box_codes (
  code_id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_type text not null check (code_type in ('experience', 'recharge')),
  state text not null default 'unused' check (
    state in ('unused', 'pending_review', 'active', 'revoked')
  ),
  coach_id uuid not null references auth.users(id) on delete restrict,
  case_id uuid not null,
  activation_id uuid unique,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint box_codes_activation_presence check (
    (state = 'active' and activation_id is not null)
    or (state in ('unused', 'pending_review') and activation_id is null)
    or state = 'revoked'
  )
);

create table public.code_activations (
  activation_id uuid primary key default gen_random_uuid(),
  code_id uuid not null unique references public.box_codes(code_id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  camper_code text not null,
  expected_code_type text not null check (
    expected_code_type in ('experience', 'recharge')
  ),
  shipment_verification_ref text,
  payment_verification_ref text,
  review_state text not null default 'pending' check (
    review_state in ('pending', 'approved', 'rejected')
  ),
  target_referrer_id uuid references auth.users(id) on delete restrict,
  decided_by uuid references auth.users(id) on delete restrict,
  decided_at timestamptz,
  rejection_reason_code text,
  replacement_code_id uuid references public.box_codes(code_id) on delete restrict,
  activated_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint code_activations_review_decision check (
    (
      review_state = 'pending'
      and target_referrer_id is null
      and decided_by is null
      and decided_at is null
      and rejection_reason_code is null
      and replacement_code_id is null
    )
    or (
      review_state = 'approved'
      and target_referrer_id is not null
      and decided_by is not null
      and decided_at is not null
      and rejection_reason_code is null
      and replacement_code_id is null
    )
    or (
      review_state = 'rejected'
      and target_referrer_id is null
      and decided_by is not null
      and decided_at is not null
      and rejection_reason_code is not null
      and replacement_code_id is not null
    )
  ),
  constraint code_activations_replacement_distinct check (
    replacement_code_id is null or replacement_code_id <> code_id
  ),
  constraint code_activations_activation_evidence check (
    activated_at is null
    or (
      review_state = 'approved'
      and shipment_verification_ref is not null
      and (
        expected_code_type = 'experience'
        or payment_verification_ref is not null
      )
    )
  )
);

alter table public.box_codes
  add constraint box_codes_activation_fk
  foreign key (activation_id)
  references public.code_activations(activation_id)
  on delete restrict;

create table public.user_coach_relation (
  relation_id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  camper_code text not null,
  referrer_id uuid not null references auth.users(id) on delete restrict,
  source_code_id uuid references public.box_codes(code_id) on delete restrict,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  reason text not null check (
    reason in ('activation', 'dormancy_trusteeship', 'admin_correction')
  ),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_coach_relation_valid_period check (
    valid_to is null or valid_to > valid_from
  ),
  constraint user_coach_relation_no_overlap exclude using gist (
    auth_user_id with =,
    tstzrange(valid_from, valid_to, '[)') with &&
  )
);

create unique index user_coach_relation_one_current
  on public.user_coach_relation (auth_user_id)
  where valid_to is null;

create table public.box_code_commands (
  idempotency_key text primary key,
  command_type text not null check (
    command_type in ('activation', 'review', 'revocation', 'replacement', 'case_generation')
  ),
  payload_hash text not null,
  caller_auth_user_id uuid not null references auth.users(id) on delete restrict,
  result jsonb,
  created_at timestamptz not null default now(),
  constraint box_code_commands_result_object check (
    result is null or jsonb_typeof(result) = 'object'
  )
);

create table public.box_code_events (
  event_id uuid primary key default gen_random_uuid(),
  event_type text not null check (
    event_type in (
      'CodeActivationRequested',
      'CodeActivated',
      'CodeActivationRejected',
      'CodeReplacementIssued',
      'CodeRevoked',
      'CoachCaseGenerated',
      'UserCoachRelationAssigned'
    )
  ),
  code_id uuid references public.box_codes(code_id) on delete restrict,
  activation_id uuid references public.code_activations(activation_id) on delete restrict,
  relation_id uuid references public.user_coach_relation(relation_id) on delete restrict,
  actor_auth_user_id uuid references auth.users(id) on delete restrict,
  reason_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint box_code_events_metadata_object check (
    jsonb_typeof(metadata) = 'object'
  )
);

create or replace function public.guard_box_code_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if TG_OP = 'DELETE' then
    raise exception 'BOX_CODE_HISTORY_IMMUTABLE';
  end if;

  if
    NEW.code_id is distinct from OLD.code_id
    or NEW.code_hash is distinct from OLD.code_hash
    or NEW.code_type is distinct from OLD.code_type
    or NEW.coach_id is distinct from OLD.coach_id
    or NEW.case_id is distinct from OLD.case_id
    or NEW.created_at is distinct from OLD.created_at
  then
    raise exception 'BOX_CODE_IDENTITY_IMMUTABLE';
  end if;

  if NEW.version <> OLD.version + 1 then
    raise exception 'BOX_CODE_VERSION_CONFLICT';
  end if;

  if NEW.state is distinct from OLD.state and not (
    (OLD.state = 'unused' and NEW.state in ('pending_review', 'revoked'))
    or (OLD.state = 'pending_review' and NEW.state in ('active', 'revoked'))
    or (OLD.state = 'active' and NEW.state = 'revoked')
  ) then
    raise exception 'BOX_CODE_STATE_CONFLICT';
  end if;

  if NEW.activation_id is distinct from OLD.activation_id and not (
    OLD.state = 'pending_review'
    and NEW.state = 'active'
    and OLD.activation_id is null
    and NEW.activation_id is not null
  ) then
    raise exception 'BOX_CODE_ACTIVATION_IMMUTABLE';
  end if;

  return NEW;
end;
$function$;

create trigger box_code_mutation_guard
before update or delete on public.box_codes
for each row execute function public.guard_box_code_mutation();

create or replace function public.guard_code_activation_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if TG_OP = 'DELETE' then
    raise exception 'CODE_ACTIVATION_HISTORY_IMMUTABLE';
  end if;

  if
    NEW.activation_id is distinct from OLD.activation_id
    or NEW.code_id is distinct from OLD.code_id
    or NEW.auth_user_id is distinct from OLD.auth_user_id
    or NEW.camper_code is distinct from OLD.camper_code
    or NEW.expected_code_type is distinct from OLD.expected_code_type
    or NEW.created_at is distinct from OLD.created_at
  then
    raise exception 'CODE_ACTIVATION_IDENTITY_IMMUTABLE';
  end if;

  if NEW.version <> OLD.version + 1 then
    raise exception 'CODE_ACTIVATION_VERSION_CONFLICT';
  end if;

  if OLD.review_state in ('approved', 'rejected') and (
    NEW.review_state is distinct from OLD.review_state
    or NEW.target_referrer_id is distinct from OLD.target_referrer_id
    or NEW.decided_by is distinct from OLD.decided_by
    or NEW.decided_at is distinct from OLD.decided_at
    or NEW.rejection_reason_code is distinct from OLD.rejection_reason_code
    or NEW.replacement_code_id is distinct from OLD.replacement_code_id
  ) then
    raise exception 'REVIEW_DECISION_IMMUTABLE';
  end if;

  if OLD.activated_at is not null and NEW.activated_at is distinct from OLD.activated_at then
    raise exception 'CODE_ACTIVATION_TIME_IMMUTABLE';
  end if;

  return NEW;
end;
$function$;

create trigger code_activation_mutation_guard
before update or delete on public.code_activations
for each row execute function public.guard_code_activation_mutation();

create or replace function public.guard_user_coach_relation_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if TG_OP = 'DELETE' then
    raise exception 'RELATION_HISTORY_IMMUTABLE';
  end if;

  if OLD.valid_to is not null then
    raise exception 'RELATION_HISTORY_IMMUTABLE';
  end if;

  if
    NEW.relation_id is distinct from OLD.relation_id
    or NEW.auth_user_id is distinct from OLD.auth_user_id
    or NEW.camper_code is distinct from OLD.camper_code
    or NEW.referrer_id is distinct from OLD.referrer_id
    or NEW.source_code_id is distinct from OLD.source_code_id
    or NEW.valid_from is distinct from OLD.valid_from
    or NEW.created_at is distinct from OLD.created_at
  then
    raise exception 'RELATION_IDENTITY_IMMUTABLE';
  end if;

  if NEW.valid_to is null then
    raise exception 'RELATION_CURRENT_INTERVAL_MUST_CLOSE';
  end if;

  if NEW.reason is distinct from OLD.reason
    and NEW.reason not in ('dormancy_trusteeship', 'admin_correction')
  then
    raise exception 'RELATION_REASON_CONFLICT';
  end if;

  if NEW.version <> OLD.version + 1 then
    raise exception 'RELATION_VERSION_CONFLICT';
  end if;

  return NEW;
end;
$function$;

create trigger user_coach_relation_mutation_guard
before update or delete on public.user_coach_relation
for each row execute function public.guard_user_coach_relation_mutation();

create or replace function public.guard_box_code_command_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if TG_OP = 'DELETE' then
    raise exception 'IDEMPOTENCY_HISTORY_IMMUTABLE';
  end if;

  if
    NEW.idempotency_key is distinct from OLD.idempotency_key
    or NEW.command_type is distinct from OLD.command_type
    or NEW.payload_hash is distinct from OLD.payload_hash
    or NEW.caller_auth_user_id is distinct from OLD.caller_auth_user_id
    or NEW.created_at is distinct from OLD.created_at
  then
    raise exception 'IDEMPOTENCY_IDENTITY_IMMUTABLE';
  end if;

  if OLD.result is not null then
    raise exception 'IDEMPOTENCY_RESULT_IMMUTABLE';
  end if;

  if NEW.result is null then
    raise exception 'IDEMPOTENCY_RESULT_REQUIRED';
  end if;

  return NEW;
end;
$function$;

create trigger box_code_command_mutation_guard
before update or delete on public.box_code_commands
for each row execute function public.guard_box_code_command_mutation();

create or replace function public.prevent_box_code_event_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  raise exception 'BOX_CODE_EVENT_APPEND_ONLY';
end;
$function$;

create trigger box_code_event_append_only
before update or delete on public.box_code_events
for each row execute function public.prevent_box_code_event_mutation();

create or replace function public.admin_get_box_code_overview()
returns table (
  code_id uuid,
  code_type text,
  state text,
  coach_id uuid,
  case_id uuid,
  activation_id uuid,
  applicant_auth_user_id uuid,
  phone text,
  review_state text,
  activated_at timestamptz,
  code_version integer,
  created_at timestamptz,
  updated_at timestamptz
)
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
    select 1
    from public.camp_admins a
    where a.auth_user_id = v_auth_user_id
      and a.role = 'admin'
      and a.is_active
  ) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    b.code_id,
    b.code_type,
    b.state,
    b.coach_id,
    b.case_id,
    b.activation_id,
    a.auth_user_id as applicant_auth_user_id,
    p.phone,
    a.review_state,
    a.activated_at,
    b.version as code_version,
    b.created_at,
    b.updated_at
  from public.box_codes b
  left join public.code_activations a on a.code_id = b.code_id
  left join public.user_profiles p on p.auth_user_id = a.auth_user_id
  order by b.created_at desc, b.code_id;
end;
$function$;

revoke all on function public.admin_get_box_code_overview()
from public, anon, authenticated;
grant execute on function public.admin_get_box_code_overview() to authenticated;

commit;
