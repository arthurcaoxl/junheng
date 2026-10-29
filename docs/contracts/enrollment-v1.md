# Enrollment 契约 v1

## 所有权

enrollment 拥有报名单和报名生命周期，不拥有审核决定、支付事实或流程实例。

## 实体

| 字段 | 类型 / 规则 |
| --- | --- |
| `enrollmentId` / `campaignId` | 报名与期次 ID。 |
| `applicantRef` | 受限申请人引用，不进入公共事件。 |
| `formPayloadRef` | 受限报名资料引用，不进入日志或事件。 |
| `state` | `submitted / reviewing / needs_info / payment_pending / confirmed / rejected / cancelled / expired`。 |
| `version` / `createdAt` / `updatedAt` | 通用并发与审计字段。 |

## 命令与事件

- `SubmitEnrollment` → `EnrollmentSubmitted`：只在 campaign open 且名额可用时创建。
- `StartReview` → `EnrollmentReviewStarted`：submitted → reviewing；只表示报名进入审核，不代替 review 实体。
- `RequestEnrollmentInfo` / `SubmitEnrollmentInfo` → `EnrollmentInfoRequested` / `EnrollmentInfoSubmitted`：reviewing ↔ needs_info。
- `MarkPaymentPending` → `EnrollmentPaymentPending`：submitted 或 reviewing → payment_pending；由 camp-flow 按策略请求。
- `ConfirmEnrollment` → `EnrollmentConfirmed`：submitted、reviewing 或 payment_pending → confirmed；仅允许 camp-flow 按策略调用。
- `RejectEnrollment`、`CancelEnrollment`、`ExpireEnrollment`：按状态机进入终态。

## 幂等与并发

- 同一 applicantRef、campaignId、idempotencyKey 和规范化 payload 返回原报名。
- 同幂等键不同 payload 返回 `IDEMPOTENCY_CONFLICT`；重复提交不得占用两个名额。
- ConfirmEnrollment 校验 expectedVersion 和当前状态；payment 不能直接调用数据库修改报名。
- `EnrollmentConfirmed` 只表示报名确认，营员身份仍需独立 `ProvisionCamper`。

## 事件 payload

只包含 enrollmentId、campaignId、状态事实、occurredAt 和必要原因码，不包含 applicantRef、formPayloadRef 或本机 userCode。
