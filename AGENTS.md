# AGENTS.md

> ⚠️ 本项目多对话协同流程见 `docs/workflow.md`，所有对话开工必读。

## 项目

菌衡有道品牌网站，当前版本 `v1.13.3`。前端位于 `apps/web`，技术栈为 Vite、React、TypeScript、Vitest；静态托管站点，后端服务仅使用 Supabase（浏览器侧仅 `anon key`，禁止 `service_role` 进仓库）。当前测试基线 291 项。

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