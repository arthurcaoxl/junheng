-- 10.11 及近期迁移的紧急回滚草案（仅供极端情况使用）
BEGIN;
-- 1. 撤销 10.10 限流 RPC 与函数
DROP FUNCTION IF EXISTS public.box_code_request_attempt_allowed(text, text, integer);
DROP FUNCTION IF EXISTS public.request_box_code_activation(text, text, text);
-- 2. 撤销 10.9 托管与审核 RPC
DROP FUNCTION IF EXISTS public.admin_manual_review(text, text);
DROP FUNCTION IF EXISTS public.transfer_coach_users(uuid);
-- 3. 撤销 10.8 库存表与流水
DROP TABLE IF EXISTS public.inventory_logs;
DROP TABLE IF EXISTS public.coach_inventory;
-- 4. 保留 checkin_sync 和 system_configs 不删，因为老用户依赖
COMMIT;