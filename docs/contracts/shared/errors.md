# 错误与异常契约 v1

## 错误 envelope

```json
{
  "code": "STATE_CONFLICT",
  "message": "Entity version does not match",
  "retryable": false,
  "details": {},
  "correlationId": "cor_01JYC8M4F6N2Q0A7R3T5V9XBDE"
}
```

`message` 面向调试但不得泄露敏感信息；用户文案由展示层处理。`retryable` 表示相同请求是否可直接重试，不代表可绕过状态检查。

## 通用错误码

- `VALIDATION_FAILED`：字段或格式错误。
- `UNAUTHORIZED` / `FORBIDDEN`：未认证或无权限。
- `NOT_FOUND`：实体不存在或不可见。
- `STATE_CONFLICT`：当前状态或版本不允许该命令。
- `IDEMPOTENCY_CONFLICT`：幂等键相同但请求内容不同。
- `RATE_LIMITED`：可稍后重试。
- `TEMPORARY_UNAVAILABLE`：适配器或依赖暂时不可用。

## 优先异常规则

| 场景 | 处理 |
| --- | --- |
| 重复提交报名 | 相同 applicant、campaign、幂等键和 payload 返回原报名；相同键不同 payload 返回 `IDEMPOTENCY_CONFLICT`。 |
| 审核并发 | `ApproveReview` / `RejectReview` 校验 `expectedVersion`；只有一个决定提交，其余返回 `REVIEW_CONFLICT`，不覆盖决定。 |
| 支付回调重复 | 按 provider 事件 ID 和支付单去重；相同内容返回首次结果，不重复发 `PaymentSucceeded` 或推进流程。 |
| 回调内容冲突 | 同一事件或渠道交易号出现不同金额、币种、订单归属时停止成功处理，记录安全审计并进入人工对账。 |
| 金额不一致 | 不产生 `PaymentSucceeded`，不确认报名；保留支付单和审计事实，按渠道协议响应。 |
| 支付过期 | 过期后不得创建新的支付成功流程；仍可接收晚到成功事实并标记 `lateSuccess`，进入退款或人工对账。 |
| 取消与支付成功竞态 | 以各聚合版本和已提交事实串行化；若先取消，晚到成功不确认报名；若先确认，后续取消走取消与退款规则，不改写历史。 |
| 流程命令失败 | camp-flow 记录失败和重试次数；仅对 `retryable=true` 做有限重试，最终进入 `failed` 并等待补偿或人工处理。 |

## 恢复原则

- 不使用跨模块分布式事务；采用可重试命令、幂等事件和补偿动作。
- 已收到资金但无法完成入营时，不得简单丢弃支付事实；必须进入退款或人工对账。
- 日志只记录错误码、关联 ID 和必要元数据，不记录报名资料、密钥或完整支付报文。
