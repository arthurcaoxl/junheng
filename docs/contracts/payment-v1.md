# Payment 契约 v1

## 所有权

payment 拥有服务端支付单、规范支付事实和退款状态，不拥有报名状态。禁止 payment 直接修改 enrollment。

## 实体

| 字段 | 类型 / 规则 |
| --- | --- |
| `paymentId` / `enrollmentId` / `campaignId` | 支付及关联 ID。 |
| `amount` | Money；只能复制 enrollment.priceSnapshot，不读取 campaign 当前价。 |
| `state` | `created / pending / succeeded / failed / expired / refund_pending / refunded`。 |
| `providerKey` | 适配器标识，不是渠道专属 payload。 |
| `providerTransactionRef` | 可选不透明交易引用，受限保存。 |
| `requestedAt` / `expiresAt` / `succeededAt` | 服务端 UTC 时间。 |
| `lateSuccess` | 过期或取消后收到成功事实时为 true。 |
| `version` / `createdAt` / `updatedAt` | 通用并发与审计字段。 |

## 命令与内部输入

| 名称 | 范围 | 状态跃迁与副作用 |
| --- | --- | --- |
| `RequestPayment` | 公开领域命令 | 以 idempotencyKey 创建支付单，使用 enrollment.priceSnapshot 校验金额、归属和有效期；调用 PaymentProvider.createOrder，成功后 created → pending 并发布 PaymentRequested。 |
| `FailPayment` | 内部 / 适配器输入 | created/pending → failed；记录规范失败原因，不触发报名确认。 |
| `ExpirePayment` | 内部 / 定时输入 | created/pending → expired；发布 PaymentExpired。 |
| `ConfirmPaymentSuccess` | 仅验签回调 | pending → succeeded；完成全部校验后发布 PaymentSucceeded。 |
| `RecordLatePaymentSuccess` | 仅验签回调 | expired → succeeded 且 lateSuccess=true；不自动确认报名，进入退款或人工对账。 |
| `RequestRefund` | 公开领域命令 | succeeded → refund_pending；v1 仅全额、幂等退款。 |
| `CompleteRefund` | 验签回调 / 可信对账 | refund_pending → refunded；发布 RefundCompleted。 |

payment 不使用 enrollment 专用的 `MarkEnrollmentPaymentPending`。所有命令和内部输入均以状态机为唯一跃迁定义。

## 创建与回调

1. `RequestPayment` 必须带 idempotencyKey；金额来自 enrollment.priceSnapshot，客户端金额和 campaign 当前价均不是支付依据。
2. 支付单先在服务端创建，再调用 PaymentProvider；只有 created → pending 成功后才产生 `PaymentRequested`。
3. 回调只在适配器验签后进入 payment；还要校验商户、paymentId、渠道交易号、金额和币种。
4. 满足全部条件才产生 `PaymentSucceeded`；前端跳转、客户端截图和客户端金额均不能确认支付。
5. 重复回调按渠道事件 ID、支付单和交易号去重；重复事件不重复通知 camp-flow。
6. 金额或归属不一致不确认成功，记录安全审计并对账。

## 过期与竞态

- created/pending 可过期；过期不得再由普通流程自动确认报名。
- 过期或取消后收到的真实成功仍须保存，并标记 lateSuccess=true；进入退款或人工对账。
- 取消先提交时，晚到 PaymentSucceeded 不触发 ConfirmEnrollment；确认先提交时，后续取消走退款规则。

## 退款规则

- v1 只允许对已 succeeded 支付单发起全额 `RequestRefund`。
- 退款命令必须幂等，金额等于原支付 amount；不得对 failed/expired 支付单退款。
- `refund_pending → refunded` 只能由验签后的渠道事实或可信对账结果推进。
- 部分退款、多次退款和退款手续费不在 v1，需要后续契约版本。

## PaymentProvider 适配器

规范接口：`createOrder`、`verifyCallback`、`queryOrder`、`requestRefund`。

输入输出只使用 paymentId、Money、expiresAt、规范状态和受限交易引用。微信/支付宝字段、签名算法和原始报文只存在于对应适配器与受限审计存储，不进入业务实体、公共事件或其他模块。
