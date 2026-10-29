# 模块边界与数据所有权

## 依赖规则

- 模块只拥有本契约列出的实体和状态；其他模块通过命令请求变更。
- 跨模块读取通过公开查询契约，禁止读取或修改内部表。
- 事件是已提交事实，不是让接收方直接写数据库的授权。
- camp-flow 可以发命令和响应事件，但不能成为业务状态的第二份权威副本。
- 适配器只转换规范模型与外部协议，不拥有业务流程。

## 所有权表

| 模块 | 权威数据 | 可接收命令 | 可发布事件 | 明确禁止 |
| --- | --- | --- | --- | --- |
| campaign | 期次、开放时间、名额、价格、流程策略 | `CreateCampaign`、`OpenCampaign`、`PauseCampaign`、`CloseCampaign` | `CampaignOpened`、`CampaignClosed` | 修改报名或支付状态 |
| enrollment | 报名单、申请资料引用、报名生命周期 | `SubmitEnrollment`、`StartReview`、`MarkPaymentPending`、`ConfirmEnrollment`、`CancelEnrollment` | `EnrollmentSubmitted`、`EnrollmentReviewStarted`、`EnrollmentPaymentPending`、`EnrollmentConfirmed` | 自行解释支付回调或审核决定 |
| review | 审核单、决定、原因码、审核人 | `RequestReview`、`ApproveReview`、`RejectReview`、`RequestReviewInfo` | `ReviewRequested`、`ReviewApproved`、`ReviewRejected` | 直接创建支付或确认报名 |
| payment | 服务端支付单、规范回调事实、退款状态 | `RequestPayment`、`ExpirePayment`、`RequestRefund` | `PaymentRequested`、`PaymentSucceeded`、`PaymentExpired`、`RefundCompleted` | 直接修改 enrollment；保存渠道字段到业务层 |
| identity | 服务端营员、认证主体引用、权限状态 | `ProvisionCamper`、`SuspendCamper` | `CamperProvisioned`、`CamperSuspended` | 把 storage-v3 userCode 当登录账号 |
| camp-flow | 流程实例、策略快照、编排日志 | `StartFlow`、`CancelFlow`、`RetryFlowStep` | `FlowCompleted`、`FlowFailed` | 拥有或直接写业务实体状态 |

## 查询与数据引用

- 报名资料、审核意见和认证主体以受限引用保存；公共事件只传实体 ID 和必要原因码。
- campaign 的价格与流程策略在关键步骤保存快照，避免期次后续编辑改变在途订单含义。
- payment 可以保存 enrollmentId 和金额快照，但不能据此直接更新 enrollment。
- flow instance 保存 campaignId、enrollmentId、当前等待步骤和策略快照，不复制 review/payment 状态。

## 新增或移除模块

- 新增通知、优惠、发票等模块时，只订阅公开事件并提供自己的命令与数据。
- 移除可选模块时，由流程策略或新版本编排停止发对应命令；已有事件历史仍可读。
- 新支付渠道新增 `PaymentProvider` 适配器，不修改 payment 的规范实体。
- 新增服务端打卡必须新建模块契约，不能复用或改变 storage-v3 的本机语义。
