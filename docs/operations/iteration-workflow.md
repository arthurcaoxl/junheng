# 迭代与重建验证流程

## 每次迭代

1. 从最新 `main` 创建 `feat/<scope>` 或 `fix/<scope>` 分支。
2. 先读 `AGENTS.md` 和相关契约；数据结构变化先改契约与 ADR。
3. 小步修改并补测试，其他模型只提交分支提议，不直接改 `main`。
4. 在 `apps/web` 执行 `npm ci`、`npm run lint`、`npm test`、`npm run build`。
5. 审查差异后合并；需要发布时另走 `docs/contracts/publish.md`，迭代不等于发布。

## 干净重建与基线比对

1. 保存源基线 `dist` 的只读副本，不把副本放进 Git。
2. 在 `apps/web` 执行 `npm ci`，再运行 lint、完整测试和生产构建。
3. 用递归文件清单、相对路径和 SHA-256 比较新旧 `dist`。
4. 文件集合一致且每个共同文件哈希一致，才算文件级一致；仅有相同文件数量不算通过。
5. 将命令、环境、测试数、构建结果、文件数和比对结论写入 `ops/logs/` 的 Markdown 文件。

构建产物与依赖目录始终忽略，不提交 Git。
