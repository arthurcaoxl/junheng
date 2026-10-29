# Identity 契约 v1

## 所有权

identity 拥有未来服务端营员身份、认证主体引用和权限状态，不拥有报名、支付或本机打卡记录。

## 实体

| 字段 | 类型 / 规则 |
| --- | --- |
| `camperId` | `cam_` 前缀服务端营员 ID。 |
| `enrollmentId` | 已确认报名的关联 ID。 |
| `state` | `active / suspended / archived`。 |
| `authSubjectRef` | 可选受限认证主体引用；不是 userCode。 |
| `grantedRoles` | 字符串数组，v1 示例为 `camper`。 |
| `version` / `createdAt` / `updatedAt` | 通用并发与审计字段。 |

## 命令与事件

- `ProvisionCamper` → `CamperProvisioned`：只接受已确认 enrollment；同一 enrollment 幂等，只能有一个有效营员身份。
- `SuspendCamper` / `RestoreCamper`：active ↔ suspended，权限变更需审计。
- `ArchiveCamper`：归档身份，不删除历史报名或支付。

## 与 storage-v3 的隔离

- 本机 `junheng-checkin-v3.userCode` 只用于本机记录、海报和 CSV，不是登录账号、认证主体、密码或全局唯一 ID。
- identity 不读取、不迁移、不信任本机 userCode；公共事件不得携带该代码。
- 如未来需要关联，必须另立映射契约，定义用户主动授权、一次性绑定、唯一性、冲突、解绑和撤销。
- 未来服务端打卡的实体、时间、同步和权限另立契约；不得修改 storage-v3 的日期键、迁移或 CSV 规则。
