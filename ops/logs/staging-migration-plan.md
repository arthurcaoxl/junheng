# 测试环境 Migration 执行清单

按顺序执行以下 SQL 文件（位于 `services/supabase/migrations/`）：

1. `20261106130000_box_code_activation.sql`
   - 作用：建立盒码主表、HMAC 散列存储、基础约束。
2. `20261106150000_activate_box_code.sql`
   - 作用：创建激活 RPC，包含并发锁与防爆破机制（10 分钟窗口内连续失败 5 次，锁定 15 分钟）。
3. `20261106160000_get_coach_radar_v1.sql`
   - 作用：创建教练雷达 RPC，物理脱敏（仅返回 5 个规范字段）。
