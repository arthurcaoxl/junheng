# Campaign 契约 v1

## 所有权

campaign 拥有招募期次、开放窗口、名额及其原子预留、当前价格与流程策略，不拥有报名、审核或支付状态。

## 实体

| 字段 | 类型 / 规则 |
| --- | --- |
| `campaignId` | `cmp_` 前缀 ID。 |
| `name` | 1–120 字符。 |
| `state` | `draft / open / paused / closed / archived`。 |
| `opensAt` / `closesAt` | UTC 时间；closesAt 必须晚于 opensAt。 |
| `capacity` | 可选正整数；有上限时通过 SeatReservation 原子控制，不允许查询后无锁写入。 |
| `price` | 当前新报名价格；requiresPayment=true 时必填且金额大于 0。 |
| `requiresReview` / `requiresPayment` | 流程策略；open 后修改不影响已启动流程的策略快照。 |
| `version` / `createdAt` / `updatedAt` | 通用并发与审计字段。 |

## 名额预留

`SeatReservation` 属于 campaign，至少包含 reservationId、campaignId、enrollmentId、state（reserved/committed/released）、expiresAt 与审计字段。

- `ReserveSeat` → `SeatReserved`：在 campaign 单事务内检查 state、开放窗口和 reserved+committed 计数，并创建预留；容量不足返回 `SEAT_UNAVAILABLE`，不得超卖。
- `ReleaseSeat` → `SeatReleased`：报名拒绝、取消、过期或创建失败时幂等释放未 committed 预留。
- `CommitSeat` → `SeatCommitted`：EnrollmentConfirmed 后把预留转为已确认占用；committed 不按 TTL 释放。
- 孤立预留可在 expiresAt 后释放；一旦关联活动 enrollment，不得仅凭 TTL 释放，必须依据报名终态或明确补偿命令。
- capacity 修改使用 expectedVersion，且不得小于当前 reserved+committed 数。

## 命令与事件

- `CreateCampaign`：创建 draft；开放时间、价格与策略必须通过不变量校验。
- `OpenCampaign` → `CampaignOpened`：仅在服务端当前时间位于开放窗口内且配置完整时允许。
- `PauseCampaign` / `ResumeCampaign`：暂停或恢复新报名；在途流程继续按原策略执行。
- `CloseCampaign` → `CampaignClosed`：停止新报名，不自动取消在途支付或退款。
- `ArchiveCampaign`：只读归档，不删除关联历史。

## 不变量

- paused、closed、archived 均不接受新 ReserveSeat 或 SubmitEnrollment。
- requiresPayment=true 时 price 必须存在；免费营 requiresPayment=false 且 price 可为空。
- SubmitEnrollment 保存当时的 priceSnapshot；后续 campaign 改价只影响新报名，在途 payment 不得读取 campaign 当前价。
- 名额、价格和策略更新均使用 expectedVersion。
