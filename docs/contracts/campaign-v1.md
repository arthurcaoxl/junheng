# Campaign 契约 v1

## 所有权

campaign 拥有招募期次、开放窗口、名额、价格与流程策略，不拥有报名、审核或支付状态。

## 实体

| 字段 | 类型 / 规则 |
| --- | --- |
| `campaignId` | `cmp_` 前缀 ID。 |
| `name` | 1–120 字符。 |
| `state` | `draft / open / paused / closed / archived`。 |
| `opensAt` / `closesAt` | UTC 时间；closesAt 必须晚于 opensAt。 |
| `capacity` | 可选正整数；名额判断由 enrollment 查询契约配合完成。 |
| `price` | Money；`requiresPayment=true` 时必填且金额大于 0。 |
| `requiresReview` / `requiresPayment` | 流程策略；open 后修改不影响已启动流程的策略快照。 |
| `version` / `createdAt` / `updatedAt` | 通用并发与审计字段。 |

## 命令与事件

- `CreateCampaign`：创建 draft；开放时间、价格与策略必须通过不变量校验。
- `OpenCampaign` → `CampaignOpened`：仅在服务端当前时间位于开放窗口内且配置完整时允许。
- `PauseCampaign` / `ResumeCampaign`：暂停或恢复新报名；在途流程继续按原策略执行。
- `CloseCampaign` → `CampaignClosed`：停止新报名，不自动取消在途支付或退款。
- `ArchiveCampaign`：只读归档，不删除关联历史。

## 不变量

- paused、closed、archived 均不接受新 `SubmitEnrollment`。
- requiresPayment=true 时 price 必须存在；免费营 requiresPayment=false 且 price 可为空。
- 名额、价格和策略更新均使用 expectedVersion；在途支付保留原金额快照。
