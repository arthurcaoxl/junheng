begin;

alter table public.checkin_sync
  add column if not exists consent_granted boolean,
  add column if not exists consent_at timestamptz;

comment on column public.checkin_sync.consent_granted is '用户是否明确同意脱敏健康数据用于产品优化与代谢研究';
comment on column public.checkin_sync.consent_at is '用户明确授权的 UTC 时间戳';

commit;
