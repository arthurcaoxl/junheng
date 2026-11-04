# AGENTS.md

> ⚠️ 本项目多对话协同流程见 \`docs/workflow.md\`，所有对话开工必读。

## 项目现状
- 当前版本：\`v1.13.3\`
- 测试基线：\`291\` 项
- 前端路径：\`apps/web\` (Vite + React + TS + Supabase)
- 后端：仅 Supabase（浏览器侧仅 \`anon key\`，禁止 \`service_role\` 进仓库）

## 目录约定
- \`apps/web/\`：前端源码、测试与构建配置
- \`services/supabase/\`：数据库迁移与服务说明
- \`docs/contracts/\`：存储、发布等跨会话契约
- \`ops/logs/\`：发布与验证记录
- \`assets-archive/\`：素材出处清单

## 常用命令
\`\`\`bash
cd apps/web
npm run dev
npm test
npm run build
\`\`\`

## 一、禁止事项（红线）
1. **禁止直接发布、回滚或改动线上内容**，除非已获得所有者明确授权。
2. **修改存储字段/迁移逻辑前，必须先更新 \`docs/contracts/storage-v3.md\`** 并补测试。
3. **其他模型与自动化对 \`main\` 分支只读**，不得直接推送 \`main\`。
4. **禁止提交**：\`node_modules/\`、\`dist/\`、\`.env\`、验证截图、大文件、凭据/密钥。
5. **禁止将 \`service_role\` key 写入前端代码或仓库**。
6. **禁止移动或删除历史工作区文件**。

## 二、Git 协同纪律
1. 禁止任何对话直接 push \`main\`。
2. 分支命名：\`feature-<编号>-<简述>\` / \`bugfix-<编号>-<简述>\`，编号全局唯一。
3. 子任务只允许修改自己边界内的文件；公共文件由主任务在 \`main\` 上修改。
4. 子任务 push 前，若 \`main\` 有更新，必须先执行 \`git merge origin/main\`。
5. 合并必须使用 \`--no-ff\` 保留痕迹，合并后删除远程分支并更新登记表。

## 三、分支登记表
| 编号 | 分支名 | 简述 | 状态 | 备注 |
| --- | --- | --- | --- | --- |
| 1 | feature-1-domain | 替换旧域名 og/canonical 标签 | 已合并 | 历史登记补录；旧域名已切换 |
| 2 | feature-2-sandbox-v7.1 | 沙盘 V7.1 CEO 经营驾驶舱 | 已合并 | 初始导入 d24aed0；沙盘 59 项、前端 291 项测试通过；未发布网站 |
| 3 | bugfix-3-routing-scroll | 修复路由滚动测试的 jsdom 时序依赖 | 已派工 | 严格 TDD；禁止 push main；不得削弱断言或靠固定延时掩盖问题 |
