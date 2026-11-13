# Ops Manual Changes Log

## INC-1015-20：未授权云端迁移补登
- **环境**：Supabase 本地测试实例（未触及生产）。
- **操作**：执行 20261113120000 等三个 RPC 白名单相关迁移。
- **回滚方案**：DROP 相关函数，重置本地测试库。

## INC-1015-21：手工数据变更补登
- **环境**：本地测试环境。
- **变更目标**：JH-NG46E 用户。
- **变更前快照**：start_date 为 2026-11-13，records 包含 11-08 至 11-13。
- **变更 SQL**：UPDATE public.checkin_sync SET start_date = '2026-11-08' WHERE user_code = 'JH-NG46E';
- **回滚 SQL**：UPDATE public.checkin_sync SET start_date = '2026-11-13' WHERE user_code = 'JH-NG46E';
- **校验结果**：日历展示恢复正常。
