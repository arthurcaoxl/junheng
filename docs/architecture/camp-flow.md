# camp-flow 状态机与流程编排 v1

## 流程实例与创建

`camp-flow` 的唯一权威实体是 `FlowInstance`：

| 字段 | 定义 |
| --- | --- |
| `flowId` | `flw_` 前缀的不透明 ID。 |
| `campaignId` / `enrollmentId` | 关联期次和报名，不复制其实体。 |
| `state` | `running / waiting_review / waiting_payment / completed / cancelled / failed`。 |
| `policySnapshot` | 启动时的 `requiresReview`、`requiresPayment`，不含价格或支付状态。 |
| `currentStep` | 当前编排步骤，仅用于恢复，不是业务状态。 |
| `version` / `createdAt` / `updatedAt` | 并发与审计字段。 |

收到 `EnrollmentSubmitted` 后，以 `enrollmentId` 作为流程创建幂等键执行 `StartFlow`。同一报名只创建一个活动流程；重复事件返回原流程，不重复发送后续命令。创建时保存策略快照，价格快照仍归 enrollment，支付事实仍归 payment。

`currentStep` 只允许：`initialize / start_review / request_review / await_review / mark_enrollment_payment_pending / request_payment / await_payment / confirm_enrollment / provision_camper / finalize / compensate / finished`。进入 `compensate` 不改变业务实体状态，进入 `finished` 前必须完成本流程应执行的收尾动作。

编排日志追加保存 `sequence`、`commandId`、`eventId`、`correlationId`、`occurredAt`、`result`、`attempt`。日志不含报名资料或支付敏感报文。

## 标准路径

```text
EnrollmentSubmitted
  → camp-flow: StartFlow（幂等键=enrollmentId）
  → camp-flow: StartReview
  → enrollment: EnrollmentReviewStarted
  → camp-flow: RequestReview
  → review: ReviewRequested
  → reviewer: ApproveReview
  → review: ReviewApproved
  → camp-flow: MarkEnrollmentPaymentPending
  → enrollment: EnrollmentPaymentPending
  → camp-flow: RequestPayment
  → payment: PaymentRequested
  → provider callback → payment 验签与校验
  → payment: PaymentSucceeded
  → camp-flow: ConfirmEnrollment
  → enrollment: EnrollmentConfirmed
  → camp-flow: CommitSeat（有名额预留时）
  → campaign: SeatCommitted
  → camp-flow: ProvisionCamper
  → identity: CamperProvisioned
  → camp-flow: CompleteFlow
```

`requiresReview=false` 时跳过 `StartReview` 与审核命令；`requiresPayment=false` 时跳过 `MarkEnrollmentPaymentPending` 与支付命令；无 `seatReservationId` 时跳过 `CommitSeat`。策略只改变编排路径，模块命令和事件语义不变。

流程状态机中的 `RequestReview`、`RequestPayment` 是 `orchestration` 作用域的编排动作；交付给 review、payment 后才是对应模块的 `domain` 命令。二者通过命令目录和接收方模块区分，不代表 camp-flow 拥有审核或支付状态。

## 步骤与等待事实

| currentStep | 动作或等待 | 成功后进入 |
| --- | --- | --- |
| `initialize` | 创建流程并读取策略快照 | 按策略选择后续步骤 |
| `start_review` | 发 `StartReview` | 等 `EnrollmentReviewStarted` 后进入 `request_review` |
| `request_review` | 发 `RequestReview` | 等 `ReviewRequested` 后进入 `await_review` |
| `await_review` | 等审核决定或补资料事实 | 按事件选择支付、确认或补偿 |
| `mark_enrollment_payment_pending` | 发 `MarkEnrollmentPaymentPending` | 等 `EnrollmentPaymentPending` 后进入 `request_payment` |
| `request_payment` | 发 `RequestPayment` | 等 `PaymentRequested` 后进入 `await_payment` |
| `await_payment` | 等支付事实 | 成功后进入 `confirm_enrollment`；失败按规则补偿 |
| `confirm_enrollment` | 发 `ConfirmEnrollment` | 等 `EnrollmentConfirmed`，再提交名额并进入 `provision_camper` |
| `provision_camper` | 发 `ProvisionCamper` | 等 `CamperProvisioned` 后进入 `finalize` |
| `finalize` | 执行 `CompleteFlow` | `finished` |
| `compensate` | 释放名额、退款或人工对账 | 完成后由 `CancelFlow` 或 `FailFlow` 收尾 |

业务事实以所属模块为准。flow 只记录已发命令、已收到事实、当前等待与重试，不用 `currentStep` 推断业务状态。

## 补资料双向联动

1. reviewer 调用 `RequestReviewInfo`，review 提交 `ReviewInfoRequested` 并进入 `needs_info`。
2. camp-flow 收到该事件后调用 `RequestEnrollmentInfo`；只有收到 `EnrollmentInfoRequested` 才确认联动完成。失败时使用相同幂等键重试，review 不回滚已提交的补资料要求。
3. 用户调用 `SubmitEnrollmentInfo`，enrollment 提交 `EnrollmentInfoSubmitted` 并返回 `reviewing`。
4. camp-flow 收到该事件后调用 `SubmitReviewInfo`；只有 review 返回 `pending` 的事实后才恢复等待审核决定。失败时保留 enrollment 已提交资料并向前重试，不要求用户重复提交。
5. 每个事件按 `eventId` 去重，每个联动命令以 `enrollmentId + 联动类型 + 来源事件ID` 幂等；重复或乱序事件不得反复切换状态。

## 命令处理规则

1. 以 `eventId` 去重，以 `correlationId` 串联流程。
2. 读取流程实例并校验 `version`、当前状态和策略快照。
3. 创建带幂等键的模块命令，记录编排日志；业务模块自行决定状态跃迁。
4. 只有收到对应模块已提交事件后，流程才推进到下一步骤。
5. 重复事件返回首次处理结果，不重复发命令；乱序事件不覆盖当前状态。
6. `CancelFlow`、`FailFlow` 只终结编排，不直接取消报名、撤销审核或修改支付。

## 名额补偿时机

- 名额在 `EnrollmentSubmitted` 之前由 enrollment 通过 campaign 的 `ReserveSeat` 原子预留；flow 不参与“先查再写”。
- 收到 `EnrollmentRejected`、`EnrollmentCancelled`、`EnrollmentExpired` 后，flow 对未 committed 预留调用 `ReleaseSeat`，重复终态事件不重复释放。
- 收到 `EnrollmentConfirmed` 后调用 `CommitSeat`；只有 `SeatCommitted` 已提交才继续 `ProvisionCamper`。
- `ReleaseSeat` 或 `CommitSeat` 临时失败时以相同幂等键重试；业务报名状态不回滚。无预留 ID 时跳过这两个动作。

## 取消、过期与竞态

- 取消流程不等于取消所有业务实体；各模块通过独立命令完成可执行的取消。
- 若取消先提交，晚到 `PaymentSucceeded` 不得触发 `ConfirmEnrollment`；记录支付事实并发起 `RequestRefund` 或人工对账。
- 若 `EnrollmentConfirmed` 先提交，后续取消按已确认营员取消规则处理，不能删除历史事件或默认释放已确认名额。
- 支付过期后的晚到成功标记 `lateSuccess`，流程保持 cancelled/failed，不自动入营。
- 审核并发只有一个决定成功；后续重复或冲突决定不改变已提交事实。

## 失败恢复与补偿

- 临时错误使用相同 `commandId` 和幂等键有限重试，增加 `attempt`；永久状态冲突交给 `RetryFlowStep` 人工重放前必须先核对模块事实，不盲目重发。
- `StartReview` 已成功而 `RequestReview` 失败时，enrollment 保持 `reviewing`，flow 停在 `request_review` 重试，不再次执行 `StartReview`。
- `MarkEnrollmentPaymentPending` 已成功而 `RequestPayment` 失败时，enrollment 保持 `payment_pending`，flow 停在 `request_payment` 重试，不重复创建上游事实。
- `ConfirmEnrollment` 已成功而 `ProvisionCamper` 失败时，保留报名确认和已提交名额，flow 停在 `provision_camper` 重试 identity；不得取消报名或伪造 `CamperProvisioned`。
- 无法自动恢复时执行 `FailFlow`，保留当前步骤和关联 ID；`failed` 不表示业务实体统一回滚。
- 已收款但流程失败时，补偿动作是 `RequestRefund` 或人工对账，不是修改或删除支付历史。

机器可读状态跃迁见 `docs/contracts/state-machines.json`；命令作用域见 `docs/contracts/command-catalog.json`。
