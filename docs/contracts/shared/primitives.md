# 通用基础契约 v1

## 标识与版本

- 实体 ID 为不透明字符串，格式 `prefix_random`，前缀包括 `cmp`、`enr`、`rev`、`pay`、`flw`、`cam`、`evt`。
- ID 不含姓名、手机号、营员代码或支付敏感信息；实现可选择 UUID、ULID 等生成方式。
- 实体带整数 `version >= 1`。写命令必须携带 `expectedVersion`，不一致返回 `STATE_CONFLICT` 或模块专用冲突码。
- 所有契约文件名中的 `v1` 表示主版本；破坏兼容性时必须升级主版本。

## 时间与日期

- 服务端时间点使用 UTC ISO 8601，精确到毫秒，例如 `2026-10-29T08:38:00.000Z`。
- 开放、截止、过期时间比较均基于服务端时间，不信任客户端时钟。
- storage-v3 的 `YYYY-MM-DD` 是浏览器本地日历日期，不是服务端时间点；未来服务端打卡另立日期契约。

## 金额

```json
{ "amountMinor": 19900, "currency": "CNY" }
```

- `amountMinor` 为非负整数，使用最小货币单位；禁止浮点数。
- `currency` 使用三位大写 ISO 4217 代码；v1 业务示例为 CNY。
- 支付金额由服务端依据 campaign 快照计算，客户端提交金额不作为定价依据。

## 操作者与审计

- `actor.type`：`applicant / reviewer / admin / system / provider`。
- `actor.id` 为不透明 ID；公共事件和日志不记录姓名、手机号、原始回调或表单内容。
- 业务实体至少保留 `createdAt`、`updatedAt` 和 `version`；关键决定额外记录操作者、关联 ID 和原因码。
- 编排日志和审计日志追加写，不通过覆盖历史记录实现状态变更。

## 数据分级

- `public`：可公开招募信息。
- `internal`：实体 ID、状态、金额快照和一般审计元数据。
- `restricted`：报名资料、联系方式、认证主体、支付原始报文、本机 userCode 映射。

`restricted` 数据不得进入公共事件 payload、普通日志或前端可读的全局配置。
