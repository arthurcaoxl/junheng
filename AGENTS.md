# AGENTS.md

> ⚠️ 本项目多对话协同流程见 `docs/workflow.md`，所有对话开工必读。

## 项目现状
- 当前版本：`v1.13.3`
- 测试基线：`291` 项
- 前端路径：`apps/web` (Vite + React + TS + Supabase)
- 后端：仅 Supabase（浏览器侧仅 `anon key`，禁止 `service_role` 进仓库）

## 目录约定
- `apps/web/`：前端源码、测试与构建配置
- `services/supabase/`：数据库迁移与服务说明
- `docs/contracts/`：存储、发布等跨会话契约
- `ops/logs/`：发布与验证记录
- `assets-archive/`：素材出处清单

## 常用命令
```bash
cd apps/web
npm run dev
npm test
npm run build
```