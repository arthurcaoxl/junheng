# 菌衡有道品牌网站

`v1.7.0` · Vite + React + TypeScript · 静态托管

## 30 秒上手

要求：Node.js 22、npm。

```bash
git clone https://github.com/arthurcaoxl/junheng.git
cd junheng/apps/web
npm ci
npm test
npm run build
```

本地开发：

```bash
npm run dev
```

或在仓库根目录运行 `docker compose up web`，访问 `http://localhost:3000`。

## 仓库结构

```text
apps/web/              网站源码与测试
services/supabase/     预留数据库迁移（未接入）
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

CI 在每次 push 时执行 `npm ci`、lint、45 项测试和生产构建；CI 不发布网站。
