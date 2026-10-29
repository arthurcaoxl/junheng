# Review 契约 v1

## 所有权

review 拥有审核单、审核决定、原因码和审核人，不直接创建支付或确认报名。

## 实体

| 字段 | 类型 / 规则 |
| --- | --- |
| `reviewId` / `enrollmentId` / `campaignId` | 审核及关联 ID。 |
| `state` | `pending / approved / rejected / needs_info`。 |
| `reasonCode` | 可选规范原因码，不使用自由文本代替状态。 |
| `noteRef` | 可选受限审核意见引用，不进入公共事件。 |
| `decidedBy` | 最终审核操作者；pending/needs_info 时可为空。 |
| `version` / `createdAt` / `updatedAt` | 通用并发与审计字段。 |

## 命令与事件

- `RequestReview` → `ReviewRequested`：每个 enrollment 同时最多一个活动审核单。
- `ApproveReview` → `ReviewApproved`：pending → approved。
- `RejectReview` → `ReviewRejected`：pending → rejected。
- `RequestReviewInfo` → `ReviewInfoRequested`：pending → needs_info。
- `SubmitReviewInfo`：needs_info → pending，不覆盖历史意见。

## 并发与权限

- 只有 reviewer/admin 可执行决定；操作者与决定必须审计。
- ApproveReview 和 RejectReview 必须携带 expectedVersion；冲突返回 `REVIEW_CONFLICT`。
- approved/rejected 是终态，重复相同命令返回首次结果，不同决定不得覆盖。
- ReviewApproved 只发布事实，由 camp-flow 决定 RequestPayment 或 ConfirmEnrollment。
