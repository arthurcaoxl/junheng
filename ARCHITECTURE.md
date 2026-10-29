# 菌衡业务架构定稿

状态：方案 A 定稿基础，2026-10-29。

本仓库采用 **模块化单体＋稳定契约＋可替换适配器**。当前只预留架构和契约；现有品牌网站 `v1.7.0` 保持纯静态实现。

## 目标与非目标

### 目标

- 招募、报名、审核、支付、营员身份和流程编排各自拥有清晰边界。
- 新需求优先通过新增模块、适配器或流程策略实现，不改变核心依赖方向。
- 契约可审查、可版本化、可独立校验，未来实现不依赖某个支付渠道。
- 架构预留对 `apps/web`、45 项测试和线上版本零影响。

### 非目标

- 不实现页面、API、数据库、Supabase 迁移、登录或真实支付。
- 不迁移 `junheng-checkin-v3` 的本机数据，不处理真实个人信息。
- 不发布网站，不提升 `apps/web/package.json` 版本。
- 不采用微服务、分布式事务或渠道专属业务模型。

## 总体结构

```text
现有品牌官网 apps/web（独立、零改动）

未来业务模块
campaign ───── 招募期次与流程策略
enrollment ─── 报名单与报名生命周期
review ─────── 审核决定与审核记录
payment ────── 支付单、回调、退款
identity ───── 服务端营员身份与权限
check-in ───── 现有本机打卡；未来服务端能力另立契约

camp-flow ───── 流程实例与编排日志；不拥有上述业务状态

适配器
PersistencePort ── 未来可适配 Supabase
PaymentProvider ── 微信、支付宝等渠道隔离在适配器
NotificationPort ─ 可选通知模块
```

依赖方向：流程编排依赖各模块公开命令和事件；业务模块不依赖 `camp-flow`，业务模块之间不直接写对方数据。共享层只包含 ID、时间、金额、事件、错误等通用类型。

## camp-flow 的所有权边界

`camp-flow` 只拥有：

- 流程实例：`running / waiting_review / waiting_payment / completed / cancelled / failed`。
- 本期流程策略快照：`requiresReview`、`requiresPayment`。
- 编排日志：收到的命令、事件、关联 ID、处理结果和重试记录。

`camp-flow` 不拥有报名、审核、支付或营员身份状态。所有业务状态变更必须通过所属模块命令完成。流程状态不得复制为 `enrollment.status`，也不得用作支付或审核状态。

## 命令与事件归属

| 触发方 | 命令 / 输入 | 状态所有者 | 产出事件 | camp-flow 后续动作 |
| --- | --- | --- | --- | --- |
| 报名入口 | `SubmitEnrollment` | enrollment | `EnrollmentSubmitted` | 按策略推进报名并请求审核或支付 |
| camp-flow | `StartReview` | enrollment | `EnrollmentReviewStarted` | 发 `RequestReview` |
| camp-flow | `RequestReview` | review | `ReviewRequested` | 流程进入 `waiting_review` |
| 审核人 | `ApproveReview` | review | `ReviewApproved` | 需要支付时先发 `MarkPaymentPending`，否则发 `ConfirmEnrollment` |
| camp-flow | `MarkPaymentPending` | enrollment | `EnrollmentPaymentPending` | 发 `RequestPayment` |
| camp-flow | `RequestPayment` | payment | `PaymentRequested` | 流程进入 `waiting_payment` |
| 支付适配器 → payment | 验签后的支付成功输入 | payment | `PaymentSucceeded` | 发 `ConfirmEnrollment`；不得由 payment 修改 enrollment |
| camp-flow | `ConfirmEnrollment` | enrollment | `EnrollmentConfirmed` | 发 `ProvisionCamper` |
| camp-flow | `ProvisionCamper` | identity | `CamperProvisioned` | 流程进入 `completed` |

事件至少一次投递；每个命令和事件处理器必须幂等。完整规则见 `docs/architecture/camp-flow.md`。

## 流程策略

| requiresReview | requiresPayment | 主路径 |
| --- | --- | --- |
| true | true | 报名 → 审核 → 支付 → 确认报名 → 开通营员 |
| false | true | 报名 → 支付 → 确认报名 → 开通营员 |
| true | false | 报名 → 审核 → 确认报名 → 开通营员 |
| false | false | 报名 → 确认报名 → 开通营员 |

取消审核、免费营只改变流程策略和编排路径，不改变模块内部结构。

## identity 与 storage-v3 隔离

- `docs/contracts/storage-v3.md` 的 `userCode` 继续只用于本机记录、海报和 CSV。
- 服务端 `camperId`、认证主体和权限由未来 `identity` 模块拥有；`userCode` 不是登录账号、认证凭据或全局唯一身份。
- 如需关联本机 `userCode` 与服务端营员，必须另立映射契约，明确用户授权、唯一性、冲突和撤销。
- 服务端时间使用 UTC ISO 8601；storage-v3 使用本地 `YYYY-MM-DD`，两者不转换、不混用。
- 未来服务端打卡另立契约，不修改 storage-v3 的键、迁移或 CSV 语义。

## 支付硬约束

- 支付单在服务端创建，金额由服务端依据招募期次计算，客户端金额不是依据。
- 金额使用最小货币单位整数与币种；验签、商户号、订单号、金额和币种全部校验。
- 只有验签成功的服务端回调可以产生 `PaymentSucceeded`，前端返回页不能确认支付。
- 创建支付、回调、退款均幂等；原始敏感报文不进入公共事件或普通日志。
- 重复回调不重复推进流程；金额不一致不确认成功；过期或取消后的支付成功进入退款或人工对账路径。
- v1 只定义全额退款；部分退款需要后续契约版本。
- `PaymentProvider` 只接收和返回规范字段，微信、支付宝等渠道字段不得泄漏到业务层。

## 演进规则

1. 模块只暴露版本化命令、事件和查询，不公开内部表。
2. 同一主版本只允许向后兼容的新增；删除、改名或语义变化必须升级主版本。
3. 消费者忽略未知可选字段；同版本 Schema 严格校验仅用于契约测试。
4. 新渠道通过适配器增加；新流程通过策略或编排版本增加。
5. 共享层不得吸收模块业务规则，避免重新形成耦合单体。

## 零影响边界

- 基线提交：`05e42c6e1ebb8523118e45325e83f1d0bcd39e29`。
- 基线 `apps/web` Git 树：`6e193dfd7ff220d67038987773d8743e44051cf3`。
- 本次完成后上述树哈希必须不变，`apps/web` 不得出现任何 diff。
- 文档和 `scripts/` 不进入 Vite `dist`；不运行发布，不修改线上 v1.7.0。
- 独立契约校验不加入现有 Vitest，不改变 45 项测试基线。

## 文档入口与校验

- 模块边界：`docs/architecture/module-boundaries.md`
- 状态机与编排：`docs/architecture/camp-flow.md`
- 通用契约：`docs/contracts/shared/`
- 模块契约：`docs/contracts/{campaign,enrollment,review,payment,identity}-v1.md`
- 机器可读契约：`docs/contracts/schemas/`、`docs/contracts/state-machines.json`

```bash
python scripts/validate_contracts.py
```
