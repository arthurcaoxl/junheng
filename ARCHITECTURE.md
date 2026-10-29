# 菌衡全栈业务架构定稿

状态：方案 A 全栈定稿基础，2026-10-29。

本仓库采用 **模块化单体＋稳定契约＋可替换适配器**。当前只预留架构和契约；现有品牌网站 `v1.7.0` 保持纯静态实现。文中标记“未来”的目录、端点和运行服务均为逻辑预留，不表示已经创建或部署。

## 目标与非目标

### 目标

- 招募、报名、审核、支付、营员身份和流程编排各自拥有清晰边界。
- 新需求优先通过新增模块、适配器或流程策略实现，不改变核心依赖方向。
- 契约可审查、可版本化、可独立校验，未来实现不依赖某个支付渠道。
- 前端、API、数据、异步事件、安全和部署使用同一套模块边界。
- 架构预留对 `apps/web`、45 项测试和线上版本零影响。

### 非目标

- 不实现页面、API、数据库、Supabase 迁移、登录或真实支付。
- 不迁移 `junheng-checkin-v3` 的本机数据，不处理真实个人信息。
- 不发布网站，不提升 `apps/web/package.json` 版本。
- 不采用微服务、分布式事务或渠道专属业务模型。
- 当前不锁定 API Web 框架、未来前端托管平台或云厂商。

## 全栈总览

```text
体验层
├── apps/web        当前品牌官网 v1.7.0；静态、零改动
├── apps/camp-web   未来报名与营员前端；React + TypeScript
└── apps/admin-web  未来审核与运营后台；React + TypeScript

接入层（未来）
├── 静态托管        品牌站与未来前端分别构建、分别发布
├── API /api/v1     命令、查询、认证、限流、输入校验、关联 ID
└── Webhooks        支付等外部回调；只由对应适配器接收

应用与领域层（未来 services/api，模块化单体）
├── campaign      招募期次与流程策略
├── enrollment    报名单与报名生命周期
├── review        审核决定与审核记录
├── payment       支付单、回调、退款
├── identity      服务端营员身份与权限
├── camp-flow     流程实例与编排日志，不拥有业务状态
└── check-in      当前仅本机 storage-v3；未来服务端能力另立契约

异步与适配层（未来）
├── Worker          与 API 同仓库、同模块边界的独立运行角色
├── Outbox / Inbox  可靠事件发布、消费者去重与重试
├── PersistencePort 未来适配 Supabase Postgres
├── PaymentProvider 微信、支付宝等渠道隔离
└── NotificationPort 可选通知模块

数据与外部服务（未来）
├── Postgres        单数据库、按模块划分逻辑 schema
├── Supabase Auth   认证适配，不替代业务 identity
├── Object Storage  受限报名材料与审核附件
└── 支付渠道        只通过 PaymentProvider 接入
```

依赖方向：体验层只调用 API；API 调用模块公开应用服务；领域模块不依赖前端或 Web 框架；camp-flow 只依赖模块命令和事件；业务模块之间不直接写对方数据。共享层只包含 ID、时间、金额、事件、错误等通用类型。

## 当前与未来仓库映射

| 路径 | 状态 | 职责 | 部署形态 |
| --- | --- | --- | --- |
| `apps/web` | 当前存在 | 品牌内容与本机打卡 | 静态构建，沿用现有发布契约 |
| `apps/camp-web` | 未来逻辑预留 | 报名、支付进度、营员服务 | 独立静态前端，不回写品牌站 |
| `apps/admin-web` | 未来逻辑预留 | 审核、对账和运营 | 独立静态前端，必须经 API 授权 |
| `services/api` | 未来逻辑预留 | 模块化 API、领域服务与 Worker | 同一服务的 API/Worker 两种运行角色 |
| `services/supabase` | 当前仅预留 | 未来 SQL 迁移与 RLS | Supabase/Postgres |
| `docs/contracts` | 当前存在 | 人工可读的权威业务契约 | 随 Git 版本化，不进入 dist |
| `packages/contracts` | 未来可选 | 从权威契约生成类型和客户端 | 构建期生成，不手工复制多份 |

未来目录只有在对应模块获得实现批准后才创建。当前不因本文新增这些目录。

## 前端契约

- 当前品牌站继续使用 Vite、React、TypeScript 和本机 storage-v3，不承载审核、支付或服务端身份。
- 未来 camp-web 只保存临时表单状态和短期 UI 状态；报名、支付、营员状态以 API 为准。
- 未来 admin-web 不直连数据库，不在浏览器持有 service role key，不通过隐藏按钮代替权限控制。
- 所有前端只依赖版本化 API/事件查询模型，不复制领域状态机，不根据前端跳转推断支付成功。
- 受限资料上传使用短期签名 URL 或 API 中转；公共事件和客户端日志不得包含敏感内容。
- 各前端独立构建、测试和发布，共享类型可由 `docs/contracts` 生成，但不共享可变业务状态。

## API 与应用服务契约

未来 API 推荐 TypeScript/Node.js 模块化单体；具体 Web 框架由实现 ADR 决定。

- 命令与查询使用 `/api/v1` 版本前缀；外部回调使用独立 webhook 边界。
- 写命令接收 `Idempotency-Key`，实体更新携带 `expectedVersion` 或等价并发标记。
- 每个请求生成或透传 `correlationId`，错误采用 `docs/contracts/shared/errors.md` 的统一 envelope。
- API 层负责认证、权限前置检查、限流、Content-Type/Schema 校验，不承载领域状态跃迁。
- 应用服务负责命令校验、事务边界和事件写入；领域实体负责自身不变量。
- 查询模型可以按展示需要组合只读数据，但写操作必须回到对应模块，禁止通过查询服务绕过所有权。
- OpenAPI 和客户端类型在未来实现阶段从契约生成；当前不创建虚假端点或空控制器。

## 数据与事务架构

- 使用一个 Postgres 数据库，按 `campaign`、`enrollment`、`review`、`payment`、`identity`、`camp_flow` 划分逻辑 schema。
- 每个模块拥有自己的表、迁移和仓储；跨模块只保存关联 ID，不允许直接更新对方表。
- 单次业务命令只使用本模块本地事务。跨模块流程通过 camp-flow、事件和补偿动作完成，不使用分布式事务。
- 业务状态变更与 Outbox 事件在同一本地事务提交；Worker 至少一次投递，消费者以 Inbox/eventId 去重。
- enrollment 在提交时拥有 `priceSnapshot`；payment 创建支付单时复制该金额，均不得读取 campaign 当前价改变在途交易。
- campaign 通过 `ReserveSeat / ReleaseSeat / CommitSeat` 原子管理名额；禁止“查询 capacity 后无锁写入”。
- 流程实例只保存策略快照、等待步骤和编排日志，不保存价格快照，也不复制其他模块的可变状态。
- 受限表单、附件和认证主体使用受限引用与对象存储；公共事件只包含规范 ID、状态和原因码。
- 每个模块迁移可独立审查和回滚，但不得假设跨模块同时回滚；数据保留与删除期限在实现前另立隐私契约。

## 认证、授权与安全边界

- 公开招募信息可匿名读取；报名提交是否需要登录由后续产品决策确定，但必须有验证码/限流等滥用防护。
- 审核与运营接口必须经服务端认证和角色授权；营员权限由 identity 管理。
- Supabase Auth 只作为未来认证适配器；业务 camperId 不直接使用 storage-v3 userCode。
- service role key、支付密钥和 webhook 密钥只允许存在于服务端密钥配置，浏览器包不得包含。
- 数据库启用 RLS 作为纵深防御，但 RLS 不替代应用层模块边界与输入校验。
- 支付回调必须验签并校验商户、订单、金额、币种和重放；原始敏感报文进入受限审计，不进入普通日志。
- 日志、错误响应、分析事件和监控标签默认不含个人资料、认证主体或支付敏感信息。

## 异步处理与可靠性

- API 负责同步命令和查询；Worker 负责 Outbox 投递、流程重试、过期扫描和对账任务。
- API 与 Worker 使用同一代码库和模块边界，可独立扩缩容，但不因此拆成不同业务服务。
- 所有异步处理器支持幂等、有限重试、死信记录和人工重放；重放不能重复产生业务副作用。
- 支付过期、取消与晚到成功按契约串行化；已收款但流程失败时必须退款或人工对账。
- 缓存只用于公开招募和只读查询，不作为支付、审核或报名状态的权威来源。

## 部署与环境

当前唯一运行形态仍是 `apps/web` 静态网站。未来目标部署单元为：

| 单元 | 内容 | 扩缩容与发布边界 |
| --- | --- | --- |
| 静态前端 | brand、camp-web、admin-web 各自产物 | 独立构建与回滚，不随 API 强制同版发布 |
| API | 无状态模块化应用 | 可水平扩展；数据库迁移与 API 发布需兼容窗口 |
| Worker | 同镜像的异步运行角色 | 独立并发和重试配置，不接收公共写命令 |
| Supabase | Postgres、Auth、Storage | 按项目环境隔离，迁移先审查后执行 |
| 外部适配器 | 支付与通知 | 沙箱和生产配置隔离，渠道密钥不入库 |

- 环境分为 local、test、staging、production；配置只通过环境变量和密钥管理注入。
- local/test 不使用生产个人数据或真实支付；staging 使用支付沙箱。
- 数据库迁移采用向后兼容的 expand/contract 顺序，禁止在发布中直接删除仍被旧版本读取的字段。
- 当前 CI 只验证品牌站；未来按变更范围增加契约、API、Worker、RLS 和 E2E 检查，同时保留品牌站基线。
- 本文不授予任何部署或发布权限，现有 `docs/contracts/publish.md` 继续独立生效。

## 可观测性与审计

- API、Worker 和 camp-flow 使用结构化日志，统一 correlationId、eventId、commandId 和模块名。
- 基础指标包括请求错误率、延迟、Outbox 积压、重试/死信数量、流程等待时长和支付对账异常。
- 审核决定、支付事实、权限变更、退款和人工重放使用追加式审计记录。
- 金额不一致、回调冲突、支付晚到成功和流程长时间等待应触发告警。
- 指标和日志标签不得使用姓名、手机号、userCode、认证主体或原始支付报文。

## 测试与交付策略

- 当前：JSON Schema/状态机独立校验，品牌站保持 45 项 Vitest 和生产构建基线。
- 模块实现后：领域状态机单元测试、命令幂等测试、API 契约测试、仓储集成测试、RLS 越权测试。
- 异步链路：Outbox 重试、Inbox 去重、乱序事件、死信重放和补偿测试。
- 支付：沙箱、验签失败、重复/乱序回调、金额不一致、过期、取消竞态和退款测试。
- 端到端：按四种 requiresReview/requiresPayment 策略分别验证主路径和关键失败路径。
- CI 不自动处理生产迁移、真实支付或发布；上线与回滚分别保留明确授权。

## 典型扩展方式

| 新需求 | 扩展点 | 不需要改变 |
| --- | --- | --- |
| 免费营或取消审核 | campaign 策略与 camp-flow 编排版本 | enrollment/review/payment 内部结构 |
| 新支付渠道 | 新 PaymentProvider 适配器 | 业务支付单、报名和审核模块 |
| 通知、优惠、发票 | 新模块订阅公开事件 | 现有模块数据所有权 |
| 新增运营报表 | 只读查询模型或分析副本 | 权威业务表和命令路径 |
| 服务端打卡 | 新契约和新模块适配 | storage-v3 本机语义 |
| 独立扩容异步任务 | 增加 Worker 运行实例 | 模块化单体业务边界 |

## camp-flow 的所有权边界

`camp-flow` 只拥有：

- 流程实例：`running / waiting_review / waiting_payment / completed / cancelled / failed`。
- 本期流程策略快照：`requiresReview`、`requiresPayment`。
- 编排日志：收到的命令、事件、关联 ID、处理结果和重试记录。

`camp-flow` 不拥有报名、审核、支付或营员身份状态。所有业务状态变更必须通过所属模块命令完成。流程状态不得复制为 `enrollment.status`，也不得用作支付或审核状态。

## 命令与事件归属

| 触发方 | 命令 / 输入 | 状态所有者 | 产出事件 | camp-flow 后续动作 |
| --- | --- | --- | --- | --- |
| 报名入口 | `SubmitEnrollment` | enrollment | `EnrollmentSubmitted` | 以 enrollmentId 幂等创建流程，按策略推进 |
| camp-flow | `StartReview` | enrollment | `EnrollmentReviewStarted` | 发 `RequestReview` |
| camp-flow | `RequestReview` | review | `ReviewRequested` | 流程进入 `waiting_review` |
| 审核人 | `ApproveReview` | review | `ReviewApproved` | 需要支付时先发 `MarkEnrollmentPaymentPending`，否则发 `ConfirmEnrollment` |
| camp-flow | `MarkEnrollmentPaymentPending` | enrollment | `EnrollmentPaymentPending` | 发 `RequestPayment` |
| camp-flow | `RequestPayment` | payment | `PaymentRequested` | 流程进入 `waiting_payment` |
| 支付适配器 → payment | `ConfirmPaymentSuccess` | payment | `PaymentSucceeded` | 发 `ConfirmEnrollment`；不得由 payment 修改 enrollment |
| camp-flow | `ConfirmEnrollment` | enrollment | `EnrollmentConfirmed` | 有预留时先发 `CommitSeat`，否则发 `ProvisionCamper` |
| camp-flow | `CommitSeat` | campaign | `SeatCommitted` | 发 `ProvisionCamper` |
| camp-flow | `ProvisionCamper` | identity | `CamperProvisioned` | 执行 `CompleteFlow` |

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

- 支付单在服务端创建，金额只能复制 `enrollment.priceSnapshot`；客户端金额和 campaign 当前价都不是在途支付依据。
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
- 机器可读契约：`docs/contracts/schemas/`、`docs/contracts/state-machines.json`、`docs/contracts/command-catalog.json`

```bash
python scripts/validate_contracts.py
```
