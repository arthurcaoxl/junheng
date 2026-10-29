# camp-flow 状态机与流程编排 v1

## 流程实例

`camp-flow` 的唯一权威实体是 `FlowInstance`：

| 字段 | 定义 |
| --- | --- |
| `flowId` | `flw_` 前缀的不透明 ID。 |
| `campaignId` / `enrollmentId` | 关联期次和报名，不复制其实体。 |
| `state` | `running / waiting_review / waiting_payment / completed / cancelled / failed`。 |
| `policySnapshot` | 启动时的 `requiresReview`、`requiresPayment`。 |
| `currentStep` | 当前编排步骤，仅用于恢复，不是业务状态。 |
| `version` / `createdAt` / `updatedAt` | 并发与审计字段。 |

编排日志追加保存 `sequence`、`commandId`、`eventId`、`correlationId`、`occurredAt`、`result`、`attempt`。日志不含报名资料或支付敏感报文。

## 标准路径

```text
EnrollmentSubmitted
  → camp-flow: StartReview
  → enrollment: EnrollmentReviewStarted
  → camp-flow: RequestReview
  → review: ReviewRequested
  → reviewer: ApproveReview
  → review: ReviewApproved
  → camp-flow: MarkPaymentPending
  → enrollment: EnrollmentPaymentPending
  → camp-flow: RequestPayment
  → payment: PaymentRequested
  → provider callback → payment 验签与校验
  → payment: PaymentSucceeded
  → camp-flow: ConfirmEnrollment
  → enrollment: EnrollmentConfirmed
  → camp-flow: ProvisionCamper
  → identity: CamperProvisioned
  → camp-flow: completed
```

`requiresReview=false` 时跳过 `StartReview` 与审核命令；`requiresPayment=false` 时跳过 `MarkPaymentPending` 与支付命令。策略只改变编排路径，模块命令和事件语义不变。

补资料路径由事件继续编排：`ReviewInfoRequested` 触发 `RequestEnrollmentInfo`，`EnrollmentInfoSubmitted` 触发 `SubmitReviewInfo`。review 与 enrollment 各自推进自己的状态，不互相写数据。

## 流程状态与业务状态

| camp-flow 状态 | 含义 | 不代表 |
| --- | --- | --- |
| `running` | 正在决定或执行下一步 | 报名已确认 |
| `waiting_review` | 已请求审核，等待审核事实 | 审核已通过 |
| `waiting_payment` | 已请求支付，等待支付事实 | 已收到资金 |
| `completed` | 所需编排步骤已完成 | 所有未来退款或取消都完成 |
| `cancelled` | 流程已取消，后续事实按竞态规则处理 | 已自动退款 |
| `failed` | 编排无法继续，需要补偿或人工处理 | 业务实体被统一回滚 |

## 命令处理规则

1. 以 `eventId` 去重，以 `correlationId` 串联流程。
2. 读取流程实例并校验 `version`、当前状态和策略快照。
3. 创建带幂等键的模块命令，记录编排日志；业务模块自行决定状态跃迁。
4. 只有收到对应模块已提交事件后，流程才推进到下一状态。
5. 重复事件返回首次处理结果，不重复发命令；乱序事件不覆盖当前状态。

## 取消、过期与竞态

- 取消流程不等于取消所有业务实体；各模块通过独立命令完成可执行的取消。
- 若取消先提交，晚到 `PaymentSucceeded` 不得触发 `ConfirmEnrollment`；记录支付事实并发起退款或人工对账。
- 若 `EnrollmentConfirmed` 先提交，后续取消按已确认营员取消规则处理，不能删除历史事件。
- 支付过期后的晚到成功标记 `lateSuccess`，流程保持 cancelled/failed，不自动入营。
- 审核并发只有一个决定成功；后续重复或冲突决定不改变已提交事实。

## 失败恢复

- 临时错误使用相同幂等键有限重试；永久状态冲突不重试。
- 重试只重发当前命令，不重新执行已确认的上游步骤。
- 无法自动恢复时流程进入 `failed`，保留当前步骤和关联 ID。
- 已收款但流程失败时，补偿动作是 `RequestRefund` 或人工对账，不是修改或删除支付历史。

机器可读状态跃迁见 `docs/contracts/state-machines.json`。
