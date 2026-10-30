# AGENTS.md

## 项目

菌衡有道品牌网站，当前版本 `v1.9.0`。前端位于 `apps/web`，技术栈为 Vite、React、TypeScript、Vitest；静态托管站点，后端服务仅使用 Supabase（浏览器侧仅 `anon key`，禁止 `service_role` 进仓库）。

## 目录约定

- `apps/web/`：网站源码、前端测试与构建配置；含 `/check-in` 打卡页与 `/admin/check-in` 管理后台。
- `services/supabase/`：已接入的 Supabase 迁移与服务说明（打卡云同步 + 管理员只读统计）；迁移在 `migrations/`，变更需同步更新其 `README.md`。
- `docs/contracts/`：存储、发布等跨会话契约。
- `docs/decisions/`：架构决策记录（ADR）。
- `docs/operations/`：本地验证与迭代流程。
- `scripts/`：仓库级脚本；版本验证脚本暂保留在 `apps/web/scripts/`。
- `ops/logs/`：文本验证记录；截图和大文件不得入库。
- `assets-archive/`：只保存素材出处清单，不保存原始素材。

## 常用命令

```bash
cd apps/web
npm ci
npm run lint
npm test
npm run build
npm run dev
```

Docker 开发环境：

```bash
docker compose up web
```

发布仅允许按 `docs/contracts/publish.md` 执行。禁止把 CI、本地构建或预览命令当作发布命令。

## 禁止事项

- 未经所有者在当前会话明确授权，禁止直接发布、回滚或改动任何线上内容。
- 修改存储字段、键名、迁移逻辑、CSV 列或导出语义前，先更新 `docs/contracts/storage-v3.md` 并补兼容性测试。
- 修改发布目标、版本规则或回滚方式前，先更新 `docs/contracts/publish.md`。
- 其他模型与自动化对 `main` 只读；只能提交分支和变更提议，不得直接推送 `main`、合并或发布。
- 禁止提交 `node_modules/`、`dist/`、`.env`、验证截图、原始大素材、压缩包或任何凭据。
- 禁止把 `service_role` key 写入前端代码或仓库；管理页面与导出不得出现用户 UID。
- 修改云同步表结构、RLS 或管理员 RPC 前，先更新 `services/supabase/README.md` 与 `docs/contracts/storage-v3.md` 的云端同步章节，并在 Supabase 以幂等迁移方式执行。
- 禁止移动或删除历史工作区文件；本仓库是独立副本。
