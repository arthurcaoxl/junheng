# 命令与事件契约 v1

## 命令

命令使用现在时，例如 `SubmitEnrollment`、`RequestPayment`。命令 envelope 至少包含：

- `commandId`、`commandType`、`issuedAt`、`actor`、`payload`。
- 写操作使用 `idempotencyKey`；实体更新另带 `expectedVersion`。
- 同一幂等键和相同请求返回首次结果；相同键对应不同请求返回 `IDEMPOTENCY_CONFLICT`。

## 事件 envelope

事件使用过去时，至少包含：

| 字段 | 规则 |
| --- | --- |
| `eventId` | 全局唯一、消费者用于去重。 |
| `eventType` | 过去时业务事实，如 `PaymentSucceeded`。 |
| `schemaVersion` | 字符串，如 `1.0`；主版本变化表示不兼容。 |
| `occurredAt` | 业务事实发生的服务端 UTC 时间。 |
| `aggregateType` / `aggregateId` | 产生事件的模块实体及 ID。 |
| `correlationId` | 串联一次端到端流程。 |
| `causationId` | 导致本事件的命令或事件 ID，可为空。 |
| `actor` | 操作者或系统适配器。 |
| `payload` | 只含规范业务字段和 ID，不含 restricted 数据。 |

## 投递与顺序

- 按至少一次投递设计；发布者和消费者都必须幂等。
- 消费者以 `eventId` 建立去重记录，重复事件返回首次处理结果，不重复发命令。
- 只保证同一 aggregate 的顺序，不假定全局顺序；乱序事件通过版本和状态机拒绝或暂存。
- 公共事件只表示已提交事实，不作为跨模块分布式事务。

## 兼容性

- 同主版本可新增可选字段，消费者必须忽略未知可选字段。
- 不得在同主版本删除字段、改名、缩小取值范围或改变语义。
- 严格 JSON Schema 用于同版本契约测试；跨版本消费者不得仅因未知可选字段拒绝事件。
- payload 仅含 ID、状态事实、金额快照、原因码等规范字段，不包含渠道专属字段。
