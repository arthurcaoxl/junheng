# 方案 A 架构与契约预留验证

- 日期：2026-10-29（本机时区）
- 范围：仅 `ARCHITECTURE.md`、`docs/`、`scripts/validate_contracts.py` 与本日志。
- 未执行：前端改动、数据库创建、真实支付、用户数据迁移、线上发布。

## 契约校验

```bash
python -B scripts/validate_contracts.py
```

结果：PASS。

- 8 个 JSON Schema，8 个有效示例全部通过。
- 6 组状态机通过初始态、状态引用、重复跃迁、不可达状态、终态与终态可达性检查。
- 13 个必需文档及命令/事件归属标记通过检查。
- 负向校验通过：将 `retryable` 改为字符串后被拒绝。
- 校验器仅使用 Python 标准库，覆盖本仓库 Schema 子集；不支持的关键字会 fail closed，不宣称是通用 JSON Schema 元校验器。

## 零影响验证

- `apps/web` 基线树：`6e193dfd7ff220d67038987773d8743e44051cf3`。
- 完成后树哈希相同，`git diff --exit-code HEAD -- apps/web` 无差异。
- `apps/web/package.json` 未修改，版本保持 `1.7.0`。
- 现有 Vitest：10 个文件、45/45 项通过。
- 生产构建成功；20/20 个网站文件与 v1.7.0 基线 SHA-256 一致。
- 构建清单 SHA-256：`ba6c1e366b446cf6a821d4d3b7256e749f46387d2eec6e4eb1c720730742ba09`。
- `dist/docs` 与 `dist/scripts` 均不存在，新增契约与脚本不进入网站产物。
