# 2026-11-03 Supabase 测试用户清理核验记录

- 日期：2026-11-03
- 操作者：所有者（Supabase 控制台 Authentication → Users）
- 清理范围：4 个 Anonymous 测试残留 + 测试邮箱账号 `240652430@qq.com`（uid `07234ba5-5aad-4388-9c52-05d77816085b`）
- 操作依据：`services/supabase/README.md`「测试用户清理操作指引」（级联规则与删除步骤，commit `7589380`）

## 级联验证（SQL Editor 只读查询）

1. 孤儿行检查：
   ```sql
   select count(*) as orphaned_rows
   from public.checkin_sync cs
   where not exists (select 1 from auth.users u where u.id = cs.auth_user_id);
   ```
   结果：`0` —— `checkin_sync` 无任何残留 `auth_user_id`，`on delete cascade` 行为符合 `20261030100000_admin_checkin_overview.sql` 的表定义。
2. 匿名用户清零：
   ```sql
   select count(*) as anonymous_users from auth.users where email is null;
   ```
   结果：`0`。

## 结论

- 删除 auth 用户即自动清空业务数据（打卡快照 / 合规表态 / BMI 档案），无需手工对账，级联规则实测成立。
- 本次清理闭环；后续每轮真实环境测试收尾按 README 指引自查（Anonymous 直接清、邮箱账号仅删确认的测试号）。
