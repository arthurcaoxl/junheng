# Supabase

当前前端通过 `@supabase/supabase-js` 连接远程 Supabase，浏览器只使用 `anon key`。

## 迁移

1. 在 Supabase **SQL Editor** 执行 `migrations/` 下的 SQL（按文件名顺序）。
2. `20261030100000_admin_checkin_overview.sql` 会创建：
   - `checkin_sync`：营员打卡快照（若表已存在则幂等保留）
   - `camp_admins`：管理员邮箱白名单
   - 普通用户只能读写自己的 `checkin_sync` 行
   - 白名单管理员只读全部打卡快照
   - `admin_checkin_overview()`：管理员汇总 RPC

## 添加管理员

在 SQL Editor 执行：

```sql
insert into public.camp_admins (email)
values ('your-admin@example.com')
on conflict (email) do update set is_active = true;
```

## 管理入口

本地或发布后访问：

```text
/admin/check-in
```

管理员使用自己的邮箱接收 OTP 验证码登录。普通用户即使打开该页面，也无法通过 RLS 读取他人记录。

## 安全边界

- `.env` 中的 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 可进入浏览器。
- `service_role` key 只能留在服务端或 SQL Editor，**不得写入前端代码或仓库**。
- 管理员 CSV 导出不包含 Supabase UID、邮箱等账户字段。
