# 菌衡有道品牌网站

`v1.9.0` · Vite + React + TypeScript · 静态托管 + Supabase（仅 anon key）

品牌官网 + 21 天打卡 + 跨设备云同步（Supabase 匿名登录 / 邮箱 OTP）+ 管理员打卡统计后台。

## 30 秒上手

要求：Node.js 22、npm。

```bash
git clone https://github.com/arthurcaoxl/junheng.git
cd junheng/apps/web
npm ci
npm test
npm run build
```

可选：复制 `.env.example` 为 `.env` 并填入 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 即可启用云同步与管理后台；不配置时网站与本地打卡照常工作。

本地开发：

```bash
npm run dev
```

或在仓库根目录运行 `docker compose up web`，访问 `http://localhost:3000`。

## 仓库结构

```text
apps/web/              网站源码与测试（含 /check-in 打卡页与 /admin/check-in 后台）
services/supabase/     已接入：checkin_sync 备份表、管理员白名单与只读 RPC 迁移
docs/contracts/        存储与发布契约
docs/decisions/        ADR
docs/operations/       验证与迭代流程
scripts/               仓库级脚本
ops/logs/              文本验证记录
assets-archive/        素材出处清单，不含原始素材
```

## 工程入口

- 协作规则：`AGENTS.md`
- 打卡数据契约：`docs/contracts/storage-v3.md`
- 发布契约：`docs/contracts/publish.md`
- 迭代流程：`docs/operations/iteration-workflow.md`

CI 在每次 push 时执行 `npm ci`、lint、98 项测试和生产构建；CI 不发布网站。

线上入口：官网 `https://junheng.ok.kimi.link`；管理后台 `/admin/check-in`（管理员邮箱 OTP 登录，白名单见 `services/supabase/README.md`）。
