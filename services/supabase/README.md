# Supabase

当前前端通过 `@supabase/supabase-js` 连接远程 Supabase，浏览器只使用 `anon key`。

## 迁移

1. 在 Supabase **SQL Editor** 执行 `migrations/` 下的 SQL（按文件名顺序）。
2. `20261030100000_admin_checkin_overview.sql` 会创建：
   - `checkin_sync`：体验官打卡快照（若表已存在则幂等保留）
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

## 测试用户清理操作指引

前端设备标识复用 Supabase 匿名登录的 `auth.uid`（SDK 会话持久化）。每次本地 `npm run dev` 起新会话做真实链路测试（OTP、同步、合规门禁），都会在 `auth.users` 新增一个 Anonymous 用户，测试后需定期自查清理。

### 级联规则（删除前必读）

- 全部业务数据（打卡快照、合规表态 `consent_granted/consent_at`、BMI 档案 `height_cm/initial_weight_kg`）都存于 `checkin_sync` 一张表。
- `checkin_sync.auth_user_id` 是主键，且带 `references auth.users(id) on delete cascade`（见 `migrations/20261030100000_admin_checkin_overview.sql`）。
- 因此在 **Authentication → Users 删除 auth 用户 = 业务数据自动级联清空**，不需要手写 SQL 清理。
- 匿名升级为邮箱绑定（OTP）时，邮箱身份挂在**同一个 uid** 上，Providers 变为 Email；仍显示 Anonymous 的用户从未绑定邮箱，删除零资产损失。
- 删除立即永久生效，无回收站；同一邮箱再登录会生成全新 uid。

### 删除步骤

1. Supabase 控制台 → **Authentication → Users**。
2. 勾选目标用户（Anonymous 测试残留直接勾；邮箱账号先确认是测试号再勾）。
3. 点左上角 **“Delete N users”** → 确认。
4. 可选留痕：删除前在 SQL Editor 执行，预览将被级联删除的业务行：
   ```sql
   select auth_user_id, consent_granted, updated_at
   from public.checkin_sync
   where auth_user_id = '<uid>';
   ```

### 每次测试后自查口径

- Anonymous 用户：本地每轮真实环境测试产生的均可直接清理。
- 邮箱用户：只删所有者明确确认为测试号的账号；真用户绝不代删。
- 清理后 `checkin_sync` 不应残留 `auth.users` 中已不存在的 `auth_user_id`（级联保证，无需手工对账）。
