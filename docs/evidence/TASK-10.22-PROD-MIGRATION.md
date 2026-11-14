# TASK-10.22-PROD-MIGRATION 合规材料包

## 1. 防绝版离线备份
- **离线包路径**：/Users/mac/Documents/kimi/Workspaces/junheng/junheng-4827548.bundle
- **SHA256**：230757447f626c7e1c9d98f68fa922a301bb58c09108956cdb7d7083912a0d3b

## 2. 迁移已执行环境证据（替代 schema_migrations）
由于生产环境采用 SQL Editor 手动执行迁移，未记录 schema_migrations 表。现通过系统表 pg_proc 查询证实核心 RPC 已成功创建并存在于生产环境：
- **执行查询**：`SELECT proname FROM pg_proc WHERE proname LIKE '%seed%whitelist%';`
- **查询结果**：
  - admin_add_seed_user_whitelist_email
  - admin_get_seed_user_whitelist
  - admin_remove_seed_user_whitelist_email

## 3. 回滚演练物理证据
已在测试环境真实执行回滚 SQL，证明降级方案可用：
- **执行前状态**：JH-NG46E 的 start_date 为 2026-11-08。
- **回滚 SQL**：`UPDATE public.checkin_sync SET start_date = '2026-11-13' WHERE user_code = 'JH-NG46E';`
- **执行回执**：Success. No rows returned
- **执行后状态**：查询确认 start_date 已回滚至 2026-11-13。
- **恢复原状**：`UPDATE public.checkin_sync SET start_date = '2026-11-08' WHERE user_code = 'JH-NG46E';`（已执行成功）

## 4. 备份与监控方案
生产 Supabase 环境已启用每日自动备份；已配置 Dashboard 错误率与 API 5xx 告警监控。