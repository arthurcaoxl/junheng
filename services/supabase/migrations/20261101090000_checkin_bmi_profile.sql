-- 用户中心 BMI 动态追踪：为现有打卡快照增加可空基础档案列。
-- 只新增列与注释，不修改 records、RLS、管理员 RPC 或历史数据。

begin;

alter table public.checkin_sync
  add column if not exists height_cm numeric,
  add column if not exists initial_weight_kg numeric;

comment on column public.checkin_sync.height_cm is
  'User height in centimeters; nullable until the user completes the profile.';

comment on column public.checkin_sync.initial_weight_kg is
  'Optional user-defined initial weight in kilograms; null means derive from check-in records.';

commit;
