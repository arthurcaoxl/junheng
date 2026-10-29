# 架构评估修订与零影响验证

日期：2026-10-29
范围：方案 A 架构与契约预留；不实现业务，不发布网站。

## 评估意见处理

- payment 状态机改为 `created → RequestPayment → pending`；enrollment 专用命令统一为 `MarkEnrollmentPaymentPending`。
- enrollment 拥有 `priceSnapshot`；payment 只复制该快照，不读取 campaign 当前价。
- campaign 拥有 `SeatReservation` 与 `ReserveSeat / ReleaseSeat / CommitSeat`，禁止查询容量后无锁写入。
- camp-flow 以 enrollmentId 幂等创建；补齐 currentStep 枚举、补资料双向联动、名额补偿和向前重试。
- flow 的同名编排动作显式归入 `orchestration` 作用域，不与领域命令混用。
- Schema 增加付费价格条件约束、UTC 毫秒时间格式和流程步骤枚举。
- 新增命令目录及跨契约校验，检查命令声明、业务命令唯一归属、状态机引用和 ARCHITECTURE 所有权表。

## 契约校验

命令：`python -B scripts/validate_contracts.py`

- 8 份 Schema，9 个有效示例全部通过。
- 6 台状态机全部通过内部一致性与命令交叉引用检查。
- 6 个模块、41 个分作用域命令全部在所属契约中声明。
- ARCHITECTURE.md 的 10 行命令归属全部与命令目录一致。
- 额外反例：requiresPayment=true 且缺少 price 的 campaign 被拒绝。
- `git diff --check` 通过。

## 前端零影响验证

- `apps/web` 基线 Git 树：`6e193dfd7ff220d67038987773d8743e44051cf3`。
- 工作区 `apps/web` 无修改；未 bump v1.7.0。
- Vitest：10 个测试文件，45/45 项通过。
- 构建：`npm run build` 成功；仅有既有的大 chunk 提示，无构建错误。
- dist 文件级比对：源 20、重建 20、缺失 0、新增 0、内容变化 0，20/20 一致。
- 规范清单 SHA-256：`ba6c1e366b446cf6a821d4d3b7256e749f46387d2eec6e4eb1c720730742ba09`。

## 边界确认

未修改线上内容，未发布，未创建数据库或 Supabase 迁移，未接真实支付，未改变 45 项 Vitest 基线。
