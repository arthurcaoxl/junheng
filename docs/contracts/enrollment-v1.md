# Enrollment 契约 v1

## 所有权

enrollment 拥有报名单、交易上下文快照和报名生命周期，不拥有审核决定、支付事实或流程实例。

## 实体

| 字段 | 类型 / 规则 |
| --- | --- |
| `enrollmentId` / `campaignId` | 报名与期次 ID。 |
| `applicantRef` | 受限申请人引用，不进入公共事件。 |
| `formPayloadRef` | 受限报名资料引用，不进入日志或事件。 |
| `seatReservationId` | campaign.ReserveSeat 返回的名额预留 ID；有名额限制时必填。 |
| `priceSnapshot` | SubmitEnrollment 时复制的 campaign.price；付费营必填，后续改价不影响本报名。 |
| `state` | `submitted / reviewing / needs_info / payment_pending / confirmed / rejected / cancelled / expired`。 |
| `version` / `createdAt` / `updatedAt` | 通用并发与审计字段。 |

## 命令与事件

- `SubmitEnrollment` → `EnrollmentSubmitted`：先通过 campaign 公开 `ReserveSeat` 原子预留名额，再创建报名并保存 seatReservationId 与 priceSnapshot。
- `StartReview` → `EnrollmentReviewStarted`：submitted → reviewing；只表示报名进入审核，不代替 review 实体。
- `RequestEnrollmentInfo` / `SubmitEnrollmentInfo` → `EnrollmentInfoRequested` / `EnrollmentInfoSubmitted`：reviewing ↔ needs_info。
- `MarkEnrollmentPaymentPending` → `EnrollmentPaymentPending`：submitted 或 reviewing → payment_pending；仅由 camp-flow 按策略请求，payment 不得使用此命令。
- `ConfirmEnrollment` → `EnrollmentConfirmed`：submitted、reviewing 或 payment_pending → confirmed；仅允许 camp-flow 按策略调用。
- `RejectEnrollment`、`CancelEnrollment`、`ExpireEnrollment`：按状态机进入终态，并由 camp-flow 调用 campaign.ReleaseSeat 释放未确认名额。

## 提交事务与补偿

1. 生成 enrollmentId 和幂等键，调用 campaign.ReserveSeat；名额检查与预留计数必须在 campaign 同一原子操作中完成。
2. 预留成功后创建 enrollment，并关联 seatReservationId、保存 priceSnapshot。不得先查询 capacity 再无锁写入。
3. 报名创建失败时使用相同关联 ID 调用 ReleaseSeat；无法立即释放的预留只能按孤立预留过期规则处理。
4. 已关联活动报名的预留不得因 TTL 自动释放；只有报名进入 rejected/cancelled/expired 才释放。
5. EnrollmentConfirmed 后由 camp-flow 调用 campaign.CommitSeat；确认中的报名取消不自动释放名额，后续是否释放需另立政策。

## 幂等与并发

- 同一 applicantRef、campaignId、idempotencyKey 和规范化 payload 返回原报名。
- 同幂等键不同 payload 返回 `IDEMPOTENCY_CONFLICT`；重复提交不得占用两个名额。
- ReserveSeat 与 SubmitEnrollment 使用同一关联幂等键，重复提交返回原预留和原报名。
- ConfirmEnrollment 校验 expectedVersion 和当前状态；payment 不能直接调用数据库修改报名。
- `EnrollmentConfirmed` 只表示报名确认，营员身份仍需独立 `ProvisionCamper`。

## 事件 payload

只包含 enrollmentId、campaignId、状态事实、occurredAt 和必要原因码，不包含 applicantRef、formPayloadRef 或本机 userCode。priceSnapshot 可作为内部交易上下文传给 payment，但不进入公共报名事件。
