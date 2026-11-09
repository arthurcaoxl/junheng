# 业务逻辑中枢字典 [BIZ-V1.7]（Logic Hub）

- 版本：**[BIZ-V1.6]**（2026-11-09 升版：TASK-10.13 契约提取——教练身份 SSOT 修复契约、双路径激活契约、教练晋升状态机、人工审核来源澄清；同日经 TASK-10.13-CONTRACT-FREEZE 终裁冻结：晋升条件固化、废弃邀请码、pepper 收口 Vault）
- 四轨标识：**[BIZ-V1.6]**（本字典即 BIZ 轨业务规则载体）
- 基线：[CORE-v1.13.3]，main @ 0eff51c（TASK-10.12 三迁移已合入）
- 定位：打卡 App（10 号体系）后续所有子任务的**唯一业务事实源**。本字典只做契约提炼，不包含任何 RPC SQL、迁移或前端代码。
- 文件约定：字典固定维护在本路径 `business-logic-hub-v1.0.md`，版本号以内嵌 [BIZ-Vx.x] 标识为准；`business-logic-hub-v1.2.md` 为历史快照。
- 事实来源：
  - `docs/business/operation-guide-v7.1.md`（V7.1 运营指南）
  - `docs/business/ceo-business-report.md`（CEO 经营驾驶舱解读）
  - `docs/business/ceo-sandbox-algo.md`（沙盘算法与参数规范 V1.1）
  - `docs/business/ceo-sandbox-dashboard.md`（沙盘面板解读）
  - 既有契约：`docs/contracts/box-code-activation-v1.md`、`docs/contracts/coach-radar-desensitized-v1.md`、`docs/contracts/coach-lifecycle-trusteeship-v1.md` 等 10.1 契约族

---

## 〇、总原则：配置与逻辑分离

> **🔥 最高指令：必须保留后期业务变更的便利性。**

1. 本字典中所有**业务参数**（打卡额度、盒规格、雷达阈值、补货点、平台账号等）一律归入 `SystemConfig`，由配置驱动。
2. 前端组件、RPC、SQL 函数**严禁硬编码任何业务参数的字面值**；必须动态读取 `SystemConfig`。
3. 未来业务调整（如出 30 袋装、雷达时间窗变更、补货点调整、平台账号更换）**只需修改配置值，严禁改动核心逻辑代码**。
4. 逻辑代码只描述"规则的形状"（如"未打卡时长超过黄灯阈值则亮黄灯"），不描述"阈值是几"（如 48 小时）。
5. 本字典与 `docs/business/` 文档冲突时，以裁判终裁的最新版业务文档为准，并按第四节"变更四步法"同步修订本字典。
6. 代号规范遵循 AGENTS.md 〇节四轨制：业务规则引用本字典写 `[BIZ-V1.5]`，核对基线写 `[CORE-<hash>]`，派工写 `[TASK-x.x]`，前端发布写 `[APP-Vx.x.x]`；严禁裸写无前缀版本号。

---

## 一、核心系统配置字典（System Configs）

### 1.1 接口定义

```typescript
/**
 * 核心系统配置字典。
 * 所有前端与 RPC 必须动态读取，严禁硬编码字面值。
 * 任何字段的变更只改配置存储，不改逻辑代码。
 */
interface SystemConfig {
  /** 单码打卡额度上限。默认 21（对应 21 袋/盒、21 天首购营）。✅ 已播种。 */
  max_checkins_per_box: 21;

  /** 默认盒规格。当前仅 '21_bags'；未来出 30 袋装时生成 '30_bags' 码即可，不改代码。✅ 已播种。 */
  default_box_spec: '21_bags' | '30_bags';

  /** 雷达黄灯阈值：超过此时长（小时）未打卡亮黄灯。默认 48。⏳ 未播种（见下）。 */
  radar_yellow_hours: 48;

  /** 雷达红灯阈值：超过此时长（小时）未打卡亮红灯。默认 72。⏳ 未播种（见下）。 */
  radar_red_hours: 72;

  /** 教练云库存补货预警点（盒）。库存低于该值触发预警，等于该值不触发。默认 12。✅ 已播种（10.8）。 */
  coach_restock_point: 12;

  /**
   * 申请入口限流阈值：单 IP 每分钟最多提交的激活申请次数。默认 30。
   * ✅ 已播种并动态读取（TASK-10.10）；消费端为 request_box_code_activation（见 3.3）。
   */
  activation_request_ip_rate_limit_per_minute: 30;

  /**
   * 申请入口限流阈值：单设备每分钟最多提交的激活申请次数。默认 3。
   * ✅ 已播种并动态读取（TASK-10.10）；设备维指纹已随 10.10 一并落地。
   */
  activation_request_device_rate_limit_per_minute: 3;

  /**
   * 平台官方账号 ID（uuid 字符串）。休眠托管转移与"来源教练已休眠"激活的归属终点。
   * ✅ 10.9 起被 RPC 动态读取；无默认字面值，必须由运营播种真实账号 UUID。
   * 未播种时相关路径 fail-closed（PLATFORM_ACCOUNT_NOT_CONFIGURED），严禁代码内置兜底账号。
   */
  platform_official_account_id: string;

  /**
   * ✅ 已终裁：申请准教练须至少有 21 个 verify_checkin 实际有效打卡物理日。
   * TASK-10.13-CORE-UNLOCK 播种；申请与 Admin 审核时均由服务端动态读取并复核，
   * 配置缺失或非法即 SYSTEM_CONFIG_MISSING，禁止客户端自报天数或传入阈值。
   */
  coach_promotion_required_checkins: 21;

  /**
   * ✅ 已终裁：准教练在 recruit_baseline 之后须净增至少 8 名当前有效且真实激活的直推营员。
   * TASK-10.13-CORE-UNLOCK 播种；自动晋升事务动态读取，缺失或非法即 fail-closed。
   * 只统计本人直接 referrer 关系，不计历史无效、未激活、间接关系或平台官方账号。
   */
  probational_coach_required_recruits: 8;
}
```

**落地状态（v1.7 终裁核对）：**

- ✅ 配置物理载体（10.7）：`system_configs` 表（RLS 锁死、客户端零权限）+ `system_config_audit` 审计表 + 变更触发器。
- ✅ 已播种：`max_checkins_per_box = 21`、`default_box_spec = '21_bags'`（10.7）；`coach_restock_point = 12`（10.8）。
- ✅ 配置消费端核对：`generate_platform_codes` 生成码时显式加锁读配置并快照写入新码；`get_my_code_inventory` 动态读取 `coach_restock_point`；10.9 的审核与托管 RPC 动态读取 `platform_official_account_id`，缺失即 `PLATFORM_ACCOUNT_NOT_CONFIGURED` fail-closed。
- ✅ 已播种（TASK-10.10）：`activation_request_ip_rate_limit_per_minute = 30`、`activation_request_device_rate_limit_per_minute = 3`。RPC 动态读取，缺失或非法即 `SYSTEM_CONFIG_MISSING` fail-closed，无字面值兜底。
- ✅ 终裁配置（TASK-10.13-CORE-UNLOCK）：`coach_promotion_required_checkins = 21`、`probational_coach_required_recruits = 8`；由新迁移播种，申请、审核及自动晋升均服务端读取，缺失或非法时拒绝。
- ⚠️ 运营待办：`platform_official_account_id` 尚未播种真实 UUID（属运营配置动作，不是代码缺陷）；播种前"来源教练已休眠的激活归属"与"托管转移"两条路径会被正确拒绝。
- ⏳ `radar_yellow_hours` / `radar_red_hours` 仍未播种：雷达灯号（10.5 RPC）按 `coach-radar-desensitized-v1.md` 的自然日差语义计算（2 天黄、≥3 天红，与 48/72 小时口径等价）。如需参数化，按第四节变更四步法另行升版。

### 1.2 参数事实依据

| 配置项 | 默认值 | 业务出处 |
| --- | --- | --- |
| `max_checkins_per_box` | 21 | V7.1 指南 2.1：21 袋/盒、21 天首购营；4.1.1 预留字段 `max_checkins` 默认 21 |
| `default_box_spec` | `'21_bags'` | V7.1 指南 4.1.1：`box_spec` 默认 `'21_bags'`，出 30 袋装直接生成 `'30_bags'` 不改代码 |
| `radar_yellow_hours` | 48 | 沙盘算法规范模块五：未打卡 48~72 小时为黄灯 |
| `radar_red_hours` | 72 | 沙盘算法规范模块五：未打卡 > 72 小时为红灯 |
| `coach_restock_point` | 12 | 沙盘算法规范模块三：库存低于 12 盒触发补货预警；雷达契约 §6：`unusedCodesCount < 12` 触发 |
| `activation_request_ip_rate_limit_per_minute` | 30 | 裁判批令（TASK-10.10-PRE 备案）：申请入口单 IP 每分钟 30 次；企业共享 IP 兼容语义见 3.3 |
| `activation_request_device_rate_limit_per_minute` | 3 | 裁判批令（同上）：申请入口单设备每分钟 3 次；设备维依赖 5.3 设备指纹 |
| `platform_official_account_id` | 无字面默认，运营播种 | V7.1 指南第七章：休眠托管转至平台官方账号；10.1 激活契约：`PLATFORM_ID` 归属 |
| `coach_promotion_required_checkins` | 21（已终裁） | 裁判批令 TASK-10.13-CORE-UNLOCK：21 个 verify_checkin 实际有效打卡物理日 |
| `probational_coach_required_recruits` | 8（已终裁） | 裁判批令 TASK-10.13-CORE-UNLOCK：recruit_baseline 后净增 8 名真实有效直推营员 |

### 1.3 读取纪律

1. `SystemConfig` 是**运行期配置**，不是编译期常量。前端通过受控查询接口读取；RPC 在服务端读取。
2. 判断逻辑中只允许出现配置项的**引用**，不允许出现 `21`、`48`、`72`、`12` 等业务字面值或任何账号 UUID 字面值。
3. 配置读取失败时必须 **fail-closed**（拒绝写入类操作并告警），严禁用兜底字面值静默降级。✅ 10.8 / 10.9 已落实（`SYSTEM_CONFIG_MISSING` / `PLATFORM_ACCOUNT_NOT_CONFIGURED`）。
4. 配置变更必须留审计记录（谁、何时、旧值、新值、依据的业务文档版本）——物理载体 `system_config_audit` 已落库。
5. 雷达灯号与自然日口径的**计算语义**属于逻辑，留在 `coach-radar-desensitized-v1.md` 契约；只有**阈值数值**进 `SystemConfig`。

---

## 二、接口契约与状态机

### 2.1 BoxCode 接口（扩展版）✅ 全部字段已落库

```typescript
/** 盒规格。当前仅 21 袋装；30 袋装为预留演进值。 */
type BoxSpec = '21_bags' | '30_bags';

/** 码生命周期状态机（物理列：box_codes.state）。 */
type BoxCodeStatus = 'unused' | 'pending_review' | 'active' | 'revoked';

/** 库存归属。平台池 / 教练云库存。 */
type InventoryStatus = 'platform' | 'coach';

interface BoxCode {
  /** 不透明服务端 ID，公共事件与前端只引用此 ID，不暴露完整码面。 */
  code_id: string;

  /** 码类型：体验码 / 充值码，由服务端生成记录决定，客户端不得伪造。 */
  code_type: 'experience' | 'recharge';

  /** 生命周期状态（物理列：box_codes.state）。 */
  status: BoxCodeStatus;

  /** 盒规格，落码时从 SystemConfig.default_box_spec 快照。✅ 10.7 落库；10.8 起生成路径显式读配置。 */
  box_spec: BoxSpec;

  /** 单码打卡额度上限，落码时从 SystemConfig.max_checkins_per_box 快照。✅ 同上。 */
  max_checkins: number;

  /** 该码已消耗的打卡次数，初值 0，只允许服务端按防刷契约递增。✅ 10.7 落库。 */
  used_checkins: number;

  /** 库存归属：platform（平台码池）或 coach（已划拨教练）。✅ 10.8 落库，迁移只可由划拨 RPC 经守卫触发器完成。 */
  inventory_status: InventoryStatus;

  /** 码所属方：平台池码为生成操作的管理员，划拨后为持有教练。 */
  coach_id: string;

  /** 所属箱 ID；每箱固定 24 个码。 */
  case_id: string;

  /** 激活后关联的唯一激活记录；一码一用，永不得改指向另一用户。 */
  activation_id: string | null;

  /** 并发控制版本号，所有写操作必须带 expectedVersion。✅ 10.8 起由触发器强制 version 恰好 +1。 */
  version: number;
}
```

> 物理安全补记（10.8 落库）：码面以 `code_hash`（HMAC-SHA256）核验、`code_ciphertext`（pgp_sym_encrypt）存储，触发器强制密文不可变；码面明文只在 `get_my_code_inventory` 对持有教练本人、以及 `admin_get_pending_box_code_reviews` 对管理员以**遮蔽形式**（前 6 + … + 后 4）返回。

### 2.2 云库存与流水接口 ✅ TASK-10.8 已落库

```typescript
/** 教练云库存（物理表：coach_inventory，10.8 落库）。 */
interface CoachInventory {
  /** 持有教练。 */
  coach_id: string;

  /** 累计划拨盒数（只增）。 */
  allocated_count: number;

  /** 当前可用盒数；不变量：0 <= available_count <= allocated_count（CHECK 约束强制）。 */
  available_count: number;

  /** 并发控制版本号。 */
  version: number;
}

/** 库存流水事件类型（物理表：inventory_logs，10.8 落库）。 */
type InventoryEventType =
  | 'platform_generated'   // 平台生成一箱（+24），必须带线下凭证号
  | 'coach_allocated'      // 平台向教练划拨
  | 'code_activated';      // 用户激活教练码，云库存 -1

/**
 * 库存流水（逐笔台账，append-only）。
 * 触发器禁止 update / delete（INVENTORY_LOG_APPEND_ONLY），杜绝手工调数。
 */
interface InventoryLog {
  log_id: string;
  event_type: InventoryEventType;
  coach_id: string | null;
  code_id: string | null;
  case_id: string | null;
  /** 数量，必须 > 0。 */
  quantity: number;
  /** 操作者（服务端 auth.uid），不得由客户端伪造。 */
  operator_id: string;
  /** 线下凭证号：platform_generated 必填（CHECK 约束强制），其余可选。 */
  offline_receipt_no: string | null;
  created_at: string;
}
```

### 2.3 审核与托管审计接口 ✅ TASK-10.9 已落库

```typescript
/** 审核与托管动作类型（物理表：audit_logs，10.9 落库）。 */
type AuditAction =
  | 'code_activation_approved'   // 人工审核通过
  | 'code_activation_rejected'   // 人工审核拒绝（含补发码关联）
  | 'coach_users_trusteed';      // 休眠托管单用户转移（逐用户一条）

/**
 * 操作审计流水（append-only）。
 * 触发器禁止 update / delete（AUDIT_LOG_APPEND_ONLY）。
 * 谁发起、谁审核、何时、从谁到谁，全部留痕。
 */
interface AuditLog {
  audit_id: string;
  action: AuditAction;
  /** 审核动作指向 activation_id；托管动作指向被转移用户的不透明 ID。 */
  target_id: string;
  /** 发起人（服务端 auth.uid）。 */
  actor_id: string;
  /** 审核人 / 确认人。 */
  reviewer_id: string;
  /** 托管来源教练（审核动作为 null）。 */
  from_coach_id: string | null;
  /** 托管终点（平台官方账号；审核动作为 null）。 */
  to_coach_id: string | null;
  /** 附加事实（码 ID、补发码 ID、原因码、生效时间等），不含码面与原始健康数据。 */
  metadata: Record<string, unknown>;
  created_at: string;
}

/** 教练生命周期状态（物理表：coach_lifecycles，10.9 落库）。 */
type CoachLifecycleState = 'active' | 'buffer' | 'dormant';

interface CoachLifecycle {
  coach_id: string;
  /**
   * 状态由受控服务端或后续生命周期任务写入；
   * 判定（月新增付费 < 4 人）本身是只读统计，本表不自动推进（对齐 5.5.1）。
   * dormant 必须带 dormant_at（CHECK 约束强制）。
   */
  state: CoachLifecycleState;
  state_entered_at: string;
  dormant_at: string | null;
  version: number;
}
```

**10.9 落库核对映射：**

| 契约要求 | 10.9 实现 | 结论 |
| --- | --- | --- |
| 用户申请只进 `pending_review` | `request_box_code_activation`：只建审核单＋状态推进，不写归属、不授权、不扣库存 | ✅ |
| 并发申请不排队共享 | 码行行级锁，非 `unused` 即 `ACTIVATION_STATE_CONFLICT`，先占先得 | ✅ |
| 审核列表脱敏 | `admin_get_pending_box_code_reviews` 白名单鉴权，码面遮蔽（前 6…后 4） | ✅ |
| 人工终审原子开通 | `admin_review_box_code_activation` 单事务：凭证核验→归属→扣库存→事件→审计 | ✅ |
| 发货/收款凭证 | 缺发货凭证 `SHIPMENT_VERIFICATION_REQUIRED`；充值码缺收款凭证 `PAYMENT_VERIFICATION_REQUIRED` | ✅ |
| 拒绝留痕＋补发 | 原因码必填；原码 `revoked` 永不回库存；补发全新码（同类型同格式）并双向关联 | ✅ |
| 充值码不改绑 | 已有当前归属时审批沿用现归属，不看发码教练 | ✅ |
| 来源教练休眠 | 归入 `system_configs.platform_official_account_id`，未配置 fail-closed | ✅ |
| 托管判定只读 | `coach_lifecycles` 不自动推进；`admin_get_dormant_coaches` 只读 | ✅ |
| 托管人工确认 | `admin_transfer_dormant_coaches(p_confirmed)` 必须显式 `true`，否则 `MANUAL_CONFIRMATION_REQUIRED` | ✅ |
| 托管原子批量 | 单函数事务；逐教练咨询锁＋关系行锁；任一失败整体回滚，无部分转移 | ✅ |
| 托管审计逐条 | 每用户一条 `audit_logs(coach_users_trusteed)`，含 from/to 教练与生效时间 | ✅ |
| 历史不改写 | 旧关系置 `valid_to`＋`reason='dormancy_trusteeship'`，新关系开新区间；原始激活绑定不动 | ✅ |
| 权限白名单 | 全部 admin RPC 校验 `camp_admins`（`role='admin'` 且 `is_active`）；旧用户自助激活 RPC `activate_box_code` 权限已回收，终审入口唯一 | ✅ |

### 2.4 码状态机（继承 10.1 契约，不可变更）✅ 已落库并由触发器强制，10.9 实现人工审核闭环

```text
unused ──提交申请──> pending_review ──审核通过──> active
  │                     │                （10.9：request_box_code_activation /
  │                     │                 admin_review_box_code_activation）
  │                     └──审核拒绝──> revoked ──补发──> 新 code_id 的 unused
  │                                       （10.9：补发含双向关联与审计）
  │
unused / active ──授权撤销或作废──> revoked（终态，不可逆）
```

- 状态跃迁由 `guard_box_code_mutation` 触发器白名单强制（非法跃迁 `BOX_CODE_STATE_CONFLICT`，删除 `BOX_CODE_HISTORY_IMMUTABLE`）。
- `pending_review` 状态下**不得**打卡、不得扣次、不得预写归属。✅ 10.7（打卡拦截）与 10.9（申请不产生任何权益）双重落实。
- `revoked` 为终态：不得恢复 `unused`、不得重新激活、不得换绑。✅ 触发器状态白名单中无 `revoked` 出口。
- 审核拒绝必须补发全新码，原码永不回库存。✅ 10.9 已实现。
- **10.9 后激活完成点**：用户不再自助终审；唯一激活推进入口是管理员人工审核 RPC（旧 `activate_box_code` 已回收权限）。激活完成时刻 = 审核通过时刻。

### 2.5 任务边界（严禁越权开发）

| 子任务 | 唯一职责 | 状态 |
| --- | --- | --- |
| **TASK-10.7** | 打卡防刷：物理日幂等锁、行级锁防并发连点、超额拦截、`pending_review` 拦截 | ✅ 已合并（5707c69） |
| **TASK-10.8** | 云库存分配：平台码池生成、教练划拨与激活扣减、补货预警、库存台账流水、发码审计 | ✅ 已合并（d8666dc） |
| **TASK-10.9** | 人工审核流：`pending_review → active / revoked` 人工核验工单、发货与线下收款凭证核验、操作审计留痕、休眠托管（人工确认＋原子批量＋逐条审计） | ✅ 已合并（b5987f6） |
| **TASK-10.10** | 申请入口三维限流与设备指纹（契约见 3.3，阈值动态读 `SystemConfig`） | ✅ 已合并（5f1a9d7） |
| **TASK-10.12** | P0 修复（白名单回填、教练目录换源 `user_coach_relation`、Vault 密钥读取）＋教练工作台（跟进、无码补货、教练直推 `coach_push_code_v1`）＋staff RBAC（角色目录、分配、审计） | ✅ 已合并（0eff51c；迁移 `20261109094500_p0_rbac_vault.sql`、`20261109120000_admin_staff_rbac.sql`、`20261109120000_coach_workflows.sql`） |
| **TASK-10.13** | 教练身份 SSOT、Vault、双路径激活与趋势已集成；CORE-UNLOCK 仅实现 2.8 晋升状态机、本人状态查询及准教练 RPC 权限边界 | ✅ 本分支已实现（SSOT/Vault：6b82a19、94b878a；CORE-UNLOCK：f3bffa4） |

- 越权判定：任何子任务在其边界外新增了写入路径或改变了其他模块的状态语义，即视为越权，直接打回。
- 跨模块协作只通过本字典与 10.1 契约族定义的接口和事件，不私开后门。
- 说明：10.9 将"激活终审"从 10.4 的用户自助 RPC 收归审核流，是裁判批准的职责迁移（旧 RPC 权限已回收），不构成越权。

### 2.6 教练身份单一事实来源契约（SSOT）✅ TASK-10.13 已实现（6b82a19、94b878a）

> 背景：TASK-10.13 两项 P0 的共同根因是"教练身份"存在两套判定口径且其一永空。本节把修复契约固化为唯一口径。

**P0 根因登记（物理证据）：**

| 现象 | 物理链路 | 根因 |
| --- | --- | --- |
| 教练端"账号权限读取失败"/"当前账号没有有效业务角色"红字 | 前端 `apps/web/src/services/accessProfile.ts:11,18` → RPC `get_my_access_profile`（迁移 `20261109120000_admin_staff_rbac.sql:627-644`）→ 渲染红字于 `CoachDashboardPanels.tsx:148` | RPC 只读 `camp_admins`；而教练身份 SSOT 已切至 `user_coach_relation`（目录/划拨/审核均用之），且全库**没有任何路径向 camp_admins 写入 `role='coach'` 行**（`admin_set_staff_role` 只写 `'staff'`，`20261109120000_admin_staff_rbac.sql:361-368`）→ 教练永远拿不到 profile |
| 教练在"产品激活码库"不出现 | `AdminCodePool.tsx:90-95` → `CoachEmailSearchSelect` → `admin_get_coach_directory`（`20261109120000_admin_staff_rbac.sql:139-144`） | 目录以 `user_coach_relation` 中"当前有有效学员"推定教练存在；**无独立教练名册（MISSING）**，新教练或学员归零的教练从目录、划拨（`COACH_NOT_FOUND`）、补货申请（`FORBIDDEN`）、审核归属核对（`COACH_SELECTION_MISMATCH`）全部枚举点系统性消失 |

**同源次生影响：** `get_coach_radar_v1` 的角色门（`20261109120000_admin_staff_rbac.sql:671-678`）同样只认 `camp_admins`，教练无角色行时雷达同样为空。

**修复契约（唯一口径）：**

```typescript
/**
 * 教练身份的单一事实来源：camp_admins 中 role='coach' 且 is_active 的行。
 * 任何"是不是教练"的判定（目录、划拨、审核归属、补货、雷达门、权限档案）
 * 必须且只能读此一处；user_coach_relation 只回答"谁名下有学员"，不回答"谁是教练"。
 */
interface CoachIdentitySSOT {
  /** 权威表：camp_admins，role='coach' 且 is_active 且 auth_user_id 非空。 */
  authority: 'camp_admins.role_coach_active';

  /**
   * ✅ 已实现：教练角色行仅经受控服务端路径写入。
   * admin_set_coach_role 对齐 admin_set_staff_role 的幂等键 + 版本号 + 审计三件套，
   * 负责创建/停用；严禁邮件手工插表。
   * 教练晋升状态机（2.8）的"晋升正式教练"由自动晋升事务写入同一权威表。
   */
  write_path: 'admin_set_coach_role_rpc + coach_promotion_atomic_tx';

  /**
   * 空盘兼容：教练身份不得依赖名下学员数。
   * admin_get_coach_directory / allocate / restock / review 的教练存在性校验
   * 一律改读 authority 表，废弃"distinct referrer_id"推定。
   */
  existence_check: 'camp_admins 角色行，而非 user_coach_relation 当前学员';
}
```

1. `get_my_access_profile` 与 `get_coach_radar_v1` 的门控逻辑本身无需改表结构，只要教练角色行有写入路径即可自愈——**修复点是补齐写入路径 + 目录/划拨等枚举点换源**，不是再造第二张表。
2. `user_coach_relation` 继续作为"归属关系"的唯一事实源（3.2 不变）；两者职责分离：身份 vs 关系。
3. 双口径禁令：任何新 RPC 不得同时用两张表回答同一个"是不是教练"问题。

### 2.7 双路径激活契约 ✅ 两条入口均已落库（10.9 / 10.12），本节为契约固化

```typescript
/** 激活申请的两个合法入口。除此之外任何创建 pending 审核单的路径均为越权。 */
type ActivationEntryPath =
  | 'manual_code'   // 用户手动输码：request_box_code_activation（10.9 落地，10.10 接入三维限流）
  | 'coach_push';   // 教练无感推送：coach_push_code_v1（10.12 落地，20261109120000_coach_workflows.sql:421）

/**
 * 双路径在 code_activations 汇合，共享同一状态机与唯一终审。
 * 路径差异只存在于"申请创建"阶段；进入 pending_review 后完全同构。
 */
interface DualPathActivationContract {
  /** 汇合点：code_activations(review_state='pending') + box_codes.state='pending_review'。 */
  convergence: 'code_activations.pending';

  /** 唯一终审：admin_review_box_code_activation(_v2)；两路径的申请都由它推进 active/rejected。 */
  sole_final_review: 'admin_review_box_code_activation';

  /**
   * 操作留痕（append-only 三件套）：
   * - box_code_events('CodeActivationRequested')：两路径申请创建时各写一条（推送路径见 coach_workflows:520-521）；
   * - box_code_commands：幂等命令留存（推送路径 command_type='activation'，payload_hash 用 Vault pepper HMAC）；
   * - audit_logs：终审时刻写 code_activation_approved / code_activation_rejected。
   */
  audit_trail: ['box_code_events', 'box_code_commands', 'audit_logs'];
}
```

**路径差异约束：**

| 维度 | 手动输码（manual_code） | 无感推送（coach_push） |
| --- | --- | --- |
| 发起人 | 营员本人（auth.uid = 申请人） | 营员当前归属教练本人 |
| 码来源 | 用户输入码面，服务端 hash 匹配 | 教练本人云库存中 `unused` 的码（`inventory_status='coach'`），服务端选定 |
| 目标营员 | 申请人自己 | 教练名下当前有效关系的营员（`camper_ref = relation_id`，客户端不得传认证 UID） |
| 防重放/幂等 | 三维限流（3.3）+ 码行锁 `ACTIVATION_STATE_CONFLICT` | `box_code_commands` 幂等键 + payload_hash；重复键同载荷返回 `replayed:true`，异载荷 `IDEMPOTENCY_CONFLICT` |
| 防越权 | 码枚举防护（错误响应不泄露有效码信息） | 码必须属本人库存（`CODE_NOT_AVAILABLE`），营员必须属本人当前关系（`FORBIDDEN`），均不泄露目标是否存在 |
| 推送后权益 | 不产生任何权益 | 同左：只建 pending 审核单，不激活、不改归属、不扣库存 |

**状态机触发点（两路径一致）：**

```text
[入口] ──创建审核单──> code_activations.review_state='pending' ∧ box_codes.state='pending_review'
                          │（guard 触发器：pending 不得打卡/扣次/预写归属）
                          ├──admin 审核通过──> active（原子事务：归属→扣库存→事件→审计）
                          └──admin 审核拒绝──> revoked + 补发新码（原码永不回库存）
```

- 幂等纪律：两路径重复提交不得产生第二条审核单；手动路径靠码行状态唯一（一码一单，`code_activations.code_id` 唯一约束），推送路径靠幂等键 + 码行锁。
- 推送路径的 `camper_code` 取自服务端关系行，严禁客户端传入（✅ 已实现，coach_workflows:512）。
- 前端不得根据路径差异渲染不同"已激活"暗示；两路径在终审前对用户均只显示"审核中"。

### 2.8 教练晋升状态机契约（✅ 已终裁，TASK-10.13-CORE-UNLOCK 落地）

> 裁判终裁闭环：用户完成 21 个有效打卡物理日 → 本人申请 → 有效 Admin 审核 → 准教练（基线后净增 8 名真实有效直推）→ 自动晋升正式教练。
> 21 / 8 为终裁播种值，仍是 SystemConfig 运行期配置；服务端动态读取并 fail-closed，业务阈值不得由客户端传入。

```typescript
/** 状态只存服务端；camper 是无当前申请时的只读虚拟状态，不插入档案行。 */
type CoachPromotionState =
  | 'camper'
  | 'promotion_pending'
  | 'promotion_rejected'  // 拒绝历史永久保留，可另开新申请
  | 'probational_coach'
  | 'coach';

/** 每次申请一行；同一用户最多一条 pending，且最多一条 probational/coach 当前档案。 */
interface CoachPromotion {
  promotion_id: string;
  auth_user_id: string;
  state: Exclude<CoachPromotionState, 'camper'>;
  /** 服务端按 checkin_daily_claims 与真实激活证据聚合，非客户端自报。 */
  checkin_days_snapshot: number;
  /** 批准为准教练时，本人名下当前有效且真实激活的直推营员基数。 */
  recruit_baseline: number | null;
  decided_by: string | null;
  decided_at: string | null;
  rejection_reason_code: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}
```

**受控接口与状态跃迁（全部服务端）：**

| 跃迁 / 查询 | 接口 | 服务端校验与原子性 |
| --- | --- | --- |
| 查询本人状态 | `get_my_coach_promotion()` | 只取 `auth.uid()`；无档案返回 `camper`，有历史返回最新申请，不泄露审核人身份 |
| camper / rejected → promotion_pending | `request_coach_promotion()` | 无客户端天数或阈值参数；有效打卡日达到配置值才受理；按用户咨询锁与部分唯一索引防并发重复，已有 pending 幂等返回原单 |
| pending → probational_coach | `admin_review_coach_promotion(promotion_id, 'approve', expected_version, null)` | 仅有效 Admin；锁申请行并校验版本；审核时复核打卡门槛；同事务快照真实直推基数并审计 |
| pending → promotion_rejected | `admin_review_coach_promotion(promotion_id, 'reject', expected_version, reason_code)` | 仅有效 Admin；原因码必填；保留拒绝历史并审计，之后允许新申请 |
| probational_coach → coach | `user_coach_relation` 写入后的受控触发器 | 按用户咨询锁与档案行锁串行化；当前真实直推数 − `recruit_baseline` 达到配置值时，同事务更新档案、写入有效 `camp_admins(role='coach')` 并审计 |

- **有效打卡口径**：按 `checkin_daily_claims.physical_day` 去重，并连接申请人对应的已批准、已激活记录及盒码扣次证据；至少达到 `coach_promotion_required_checkins`。申请与批准均重新计算，禁止信任快照或前端输入。
- **真实直推口径**：当前 `user_coach_relation.referrer_id = 申请人 AND valid_to IS NULL`，且营员本人、来源码与已批准并实际激活的记录及 active 盒码相互一致。历史关闭、未激活、间接关系、自我关系与平台官方账号均不计数；仅准教练档案可触发晋升，不得误激活其他用户。
- **防伪造与最小权限**：`coach_promotions` 启用 RLS，浏览器角色无表权限；状态只由上述 definer RPC / 触发器写入。`camp_admins` 角色行只能由既有 Admin 角色管理 RPC 或自动晋升事务写入，普通营员直写与审核 RPC 自助提权均失败。
- **准教练能力边界**：`get_coach_radar_v1('own')` / 兼容无参调用与 `get_coach_camp_trends_v1('own')` 仅返回本人当前名下数据；两者 `'all'` 均以 `FORBIDDEN` 拒绝。库存读取、平台发码、划拨、直推、补货等 RPC 必须在服务端读取 Vault、码面或目标数据之前拒绝准教练；不能依赖前端隐藏。
- **正式角色不回归**：有效 Admin 与正式 coach 的既有雷达、趋势、库存及审核权限不变；staff 边界不变。准教练不进入 `coach_lifecycles`，不获得库存、划拨、发码或正式教练其他写能力；晋升事务也不得伪造正式教练生命周期记录。
- **审计**：申请、批准、拒绝与自动晋升分别追加 `coach_promotion_requested / approved / rejected / promoted` 审计；拒绝必须含原因码，晋升必须含基数、当前真实直推数与所用配置快照。
- 合规红线：晋升与拉新考核措辞不得构成层级计酬暗示；只计单级真实激活直推，禁止扩展为多级关系或计酬规则。

---

## 三、阻断与并发契约

### 3.1 RPC `verify_checkin` 拦截逻辑 ✅ TASK-10.7 已实现

> 落库于迁移 `20261107120000_verify_checkin.sql`。已逐条核对实现与本契约一致：
>
> | 闸门 | 实现 | 拒绝错误码 |
> | --- | --- | --- |
> | `status_active` | `state <> 'active'` 即拒绝（四态全覆盖） | `CHECKIN_NOT_ACTIVE` |
> | `quota_available` | `used_checkins >= max_checkins` 即拒绝 | `CHECKIN_QUOTA_EXHAUSTED` |
> | `physical_day_idempotent` | `checkin_daily_claims` 主键 `(code_id, physical_day)`，Asia/Shanghai 当日；重复打卡幂等返回不扣次 | —（幂等返回） |
> | `row_locked` | 码行 `for update` 覆盖校验与扣次全过程 | — |
> | `atomic` | 单函数事务，扣次/幂等记录/`CheckinVerified` 事件/快照同生共死 | — |
>
> 附加防绕过：`checkin_sync` 挂 `guard_checkin_sync_quota` 触发器，绕过 RPC 直写云端打卡被 `CHECKIN_RPC_REQUIRED` 拦截。前端 `checkinQuota.ts` 只调 RPC，无额度字面值硬编码。

```typescript
/**
 * 打卡校验的拦截契约（逻辑描述，TASK-10.7 已实现）。
 * 五道闸门：状态拦截 / 额度拦截 / 物理日幂等 / 行级锁 / 事务原子性。
 */
type CheckinGate =
  | 'status_active'
  | 'quota_available'
  | 'physical_day_idempotent'
  | 'row_locked'
  | 'atomic';

interface VerifyCheckinContract {
  /** 全部五道闸门必须通过；任何一道不通过即拒绝打卡。 */
  gates: CheckinGate[];
}
```

- `max_checkins` 取自该码自身字段（落码时从 `SystemConfig.max_checkins_per_box` 快照），不实时跟随配置回改历史码；新规格码（如 30 袋装）在生成时写入新额度。
- 限流与错误响应沿用 10.1 激活契约第 9 节：失败响应不得泄露有效码清单或码面近似信息。

### 3.2 归属唯一性 ✅ 10.9 已全面落地

1. **一人只属一教练**：一个 `camper_id` 同一时间只能绑定一个 `coach_id`（或平台官方账号），以 `user_coach_relation` 当前有效区间（`valid_to is null`）为权威；审核与托管路径对该关系行使用咨询锁 + 行级锁。
2. **一码归属唯一**：码激活成功后归属即确定——**谁先输入并审核通过，额度就归谁**。
   - 申请阶段即先占先得：并发申请同一码，后取得锁的请求得到 `ACTIVATION_STATE_CONFLICT`，不得排队共享激活。✅ 10.9 落实。
   - 归属确立只在审核通过的原子流程中发生；`pending_review` 不预写归属。✅ 10.9 落实。
3. **不开放自行解绑**：用户激活后无自助解绑/换教练入口；仅休眠托管、平台审核确认或用户权益保护需要时启动变更，且必须新建关系区间、留存原因/审核人/时间，不改写原始激活绑定事实。✅ 10.9 托管路径按此实现。
4. **充值码不改绑**：已有当前归属时，充值码审核沿用现归属；休眠托管后复购继续归平台，不回绑原教练。✅ 10.9 落实。
5. **绑定机制唯一 SSOT（裁判终裁 TASK-10.13-CONTRACT-FREEZE）**：教练与用户绑定**废弃邀请码方案**，唯一合法机制为**后台审核制**——`user_coach_relation` 关系行只由两条受控路径写入：激活人工审核通过（`admin_review_box_code_activation`，reason='activation'）与休眠托管（reason='dormancy_trusteeship'；另有 admin_correction 为人工裁定预留）。任何"用户出示邀请码自助绑定教练"的前端入口或 RPC 均属越权，不得开发。

### 3.3 申请入口限流契约 ✅ TASK-10.10 已实现（v1.5 新增）

> 目标：封堵字典第六节知悉事项第 1 条记录的码枚举攻击面。**已封堵**：落库于迁移 `20261108140000_activation_request_rate_limit.sql`，核对映射如下——
>
> | 契约条款 | 10.10 实现 | 结论 |
> | --- | --- | --- |
> | 三维限流 | auth_user（既有 guards）+ ip + device 三维分别求值，不短路跳维 | ✅ |
> | 阈值动态读取 | 两项阈值从 `system_configs` 读取，缺失/非法即 `SYSTEM_CONFIG_MISSING` fail-closed | ✅ |
> | 一分钟窗口语义 | IP/设备维独立固定窗口，第 N 次放行、第 N+1 次起拒绝并置 `blocked_until` | ✅ |
> | 共享 IP 兼容 | 取不到受信 IP 时跳过 IP 维（默认放行），不并入未知桶；IP 维（30）显著高于个人量级，设备维（3）承担"人"粒度 | ✅ |
> | 失败请求计数 | 格式非法/码不存在计入 auth_user 维失败；超限统一 `TOO_MANY_ATTEMPTS`，不泄露维度信息 | ✅ |
> | 设备指纹隐私 | 前端仅存本地随机 UUID；服务端二次 HMAC 落库，不可逆；`scope_type` 扩展 `'device'`；指纹不出现在返回与事件 | ✅ |
> | 防绕过 | 旧两参 `request_box_code_activation` 重载已删除，三维入口唯一 | ✅ |

```typescript
/**
 * 申请入口（request_box_code_activation）限流契约。
 * 三维限流：认证主体 / IP / 设备，全部阈值动态读取 SystemConfig。
 */
interface ActivationRequestRateLimit {
  /** 认证主体维：沿用 10.4 既有 box_code_attempt_guards（scope 'auth_user'），窗口与上限维持既有安全实现。 */
  per_auth_user: 'existing_attempt_guards';

  /** IP 维：每分钟最多 activation_request_ip_rate_limit_per_minute（默认 30）次申请。 */
  per_ip_per_minute: 30;

  /** 设备维：每分钟最多 activation_request_device_rate_limit_per_minute（默认 3）次申请；依赖 5.3 设备指纹。 */
  per_device_per_minute: 3;
}
```

1. **计数口径**：所有到达申请入口的请求都计入对应维度（含格式非法、码不存在的失败请求）；超限返回 `TOO_MANY_ATTEMPTS`，失败响应不得泄露有效码信息（沿用 10.1 契约 §9）。
2. **企业共享 IP 兼容语义（不得误杀正常员工）**：
   - IP 维阈值（30 次/分钟）刻意显著高于个人正常使用量级，定位是**防脚本枚举的熔断阀**，不是用户行为考核线；同一大办公室/企业出口共享同一公网 IP 的多名正常员工同时申请，合计也不应触线。
   - 真正区分"人"的粒度由**认证主体维与设备维**承担（设备 3 次/分钟），IP 维不得收紧到个人量级。
   - IP 哈希只能来自受信通道（沿用 10.4 的 `app.trusted_client_ip` 机制）；取不到受信 IP 时**跳过 IP 维**而不是按单一未知桶计数，避免把所有无 IP 请求误并为一桶误杀。
   - 触限反馈必须是通用文案（"操作过于频繁，请稍后重试"），不得提示"贵司 IP 被封"等暴露限流维度的信息。
3. **与设备指纹的关系**：设备维是本契约的一部分，与 5.3 预留的设备指纹同一落点——TASK-10.10 一并实现，隐私红线（只存不可逆散列）不变。
4. **配置纪律**：30 / 3 只是 `SystemConfig` 默认值；未来调整只改配置并走变更四步法，严禁改逻辑代码。

---

## 四、业务演进与版本升级规范（Evolution Rule）

### 变更四步法

当业务参数发生变更（如出 30 袋装、雷达阈值调整、补货点调整、平台账号更换）时，严格按以下四步执行，**绝不允许跳过文档直接改代码**：

| 步骤 | 动作 | 产出物 |
| --- | --- | --- |
| **步骤 1** | 更新 `docs/business/` 下的 V7.1 运营指南，写明新参数值与业务依据 | 业务文档升版 |
| **步骤 2** | 更新本中枢字典的 `SystemConfig`（及受影响接口定义），升版本号 | 中枢字典升版（BIZ 轨升版） |
| **步骤 3** | 在对应测试文件中**先修改期望值，跑出红灯**，证明旧逻辑确实不满足新口径 | 红灯测试证据 |
| **步骤 4** | 修改底层 RPC / 引擎逻辑，直至测试**全绿**，然后 commit 合并 | 绿灯 + 真实 Hash |

### 演进纪律

1. 步骤 1、2 未完成并形成物理证据前，禁止进入步骤 3、4。
2. 纯参数变更（阈值、额度、规格取值、账号配置）只允许改配置与测试期望值，不得改规则形状。
3. 规则形状变更（如雷达从单维度升级为多维综合指标）属于契约变更，必须重新评审并升版对应契约文档，不得混入参数变更。
4. 每次演进必须在本字典的修订记录中追加一行：日期、变更项、旧值 → 新值、依据文档版本、合并 Hash。

### 修订记录

| 日期 | 版本 | 变更 | 依据 | Hash |
| --- | --- | --- | --- | --- |
| 2026-11-07 | v1.0 | 首版落盘：SystemConfig、BoxCode 扩展接口、10.7/10.8/10.9 任务边界、阻断与并发契约、变更四步法 | V7.1 四份业务文档（main @ 0e1d51e） | ce1da76 |
| 2026-11-07 | v1.1 | 同步 10.7 落地核对；补充 10.8 衔接注意 | 迁移 `20261107120000_verify_checkin.sql` 核对（main @ 5707c69） | c361a02 |
| 2026-11-08 | v1.2 | 吸收裁判五条前瞻建议（第五节）；对齐四轨制 | 裁判批令 + AGENTS.md 〇节（main @ fb86715） | 2d2334c |
| 2026-11-08 | v1.3 | TASK-10.8 落地核对：云库存/流水/发码审计/并发锁标记已实现并同步接口；字典固定回本路径 | 迁移 `20261108120000_code_pool_inventory.sql` 核对（main @ d8666dc，368 项） | 4c20d44 |
| 2026-11-08 | v1.4 | TASK-10.9 落地核对：人工审核流与休眠托管标记已实现；SystemConfig 新增 `platform_official_account_id`；新增 `AuditLog` / `CoachLifecycle` 接口；记录申请入口限流缺口等知悉事项 | 迁移 `20261108130000_manual_review_trusteeship.sql` 与前端 `manualReview.ts` 核对（main @ b5987f6，378 项） | d7c4254 |
| 2026-11-08 | v1.5 | 新增 3.3 申请入口限流契约并登记阈值 `activation_request_ip_rate_limit_per_minute=30` / `activation_request_device_rate_limit_per_minute=3`（含企业共享 IP 兼容语义）；新增第七节 Backlog，登记 `expires_at` 产品有效期（P1，仅记录不实现）；知悉事项第 1 条改指 TASK-10.10 | 裁判批令 TASK-10.10-PRE-BIZ-V1.5（本地 main @ 9aabaf8，[CORE-v1.13.3]） | 0f3fae8 |
| 2026-11-08 | v1.5（落地核对） | TASK-10.10 实现与 3.3 契约逐条核对一致；两项限流阈值标记已播种；知悉事项第 1 条"限流缺口"标记已封堵；5.3 申请入口部分标记已落地 | 迁移 `20261108140000_activation_request_rate_limit.sql` 与前端 `boxCodeActivation.ts` 核对（main @ 5f1a9d7） | 见提交记录 |
| 2026-11-09 | v1.6 | TASK-10.13 契约提取：新增 2.6 教练身份 SSOT 修复契约（登记两项 P0 根因）、2.7 双路径激活契约（手动输码+教练直推，含幂等与审计链）、2.8 教练晋升状态机草案（21 天/8 人参数待终裁）；SystemConfig 登记两个晋升草案键；知悉事项新增第 6-10 条（含 pepper 双口径分裂、审核来源澄清）；任务边界表补登 10.12/10.13 | 裁判派工 TASK-10.13-ROOT-CAUSE；迁移 `20261109094500` / `20261109120000×2` 与前端 `accessProfile.ts` / `AdminCodePool.tsx` 核对（main @ 0eff51c） | d78124b |
| 2026-11-09 | v1.6（终裁冻结） | TASK-10.13-CONTRACT-FREEZE：晋升条件 21 天/8 人清除 [待确认] 固化入 SystemConfig；废弃邀请码，后台审核制固化为绑定唯一 SSOT（3.2 第 5 条）；pepper 口径写死全库废 GUC、统一 Vault（知悉事项第 8 条） | 主脑裁决 TASK-10.13-CONTRACT-FREEZE（main @ 0eff51c） | 见提交记录 |
| 2026-11-09 | v1.7 | 2.8 晋升状态机转正式契约：21 个有效打卡物理日、基线后净增 8 名真实直推、拒绝历史保留且可重申；补齐受控 RPC、原子自动晋升、审计、并发与准教练最小权限边界；SystemConfig 两项参数改标已终裁 | 裁判批令 TASK-10.13-CORE-UNLOCK | 见本模块契约提交 |
---

## 五、前瞻演进契约（裁判批令 v1.2 新增，v1.5 更新落地状态）

### 5.1 发码审计（Code Issuance Audit）✅ TASK-10.8 已实现（风控标红面板除外）

> 落库于迁移 `20261108120000_code_pool_inventory.sql`。核对映射：
>
> | 契约 | 实现 | 结论 |
> | --- | --- | --- |
> | 发码必留痕 | 每箱生成写 `inventory_logs(platform_generated, quantity=24, operator_id, offline_receipt_no)` | ✅ |
> | 划拨留痕 | `inventory_logs(coach_allocated)` 记教练、数量、操作者 | ✅ |
> | 激活核销留痕 | `inventory_logs(code_activated)` 记码 ID，云库存同事务 -1（10.9 起核销点在审核通过时刻） | ✅ |
> | 台账不可改 | append-only 触发器（`INVENTORY_LOG_APPEND_ONLY`） | ✅ |
> | 超卖不变量 | 划拨与计数同一事务、码行 `skip locked`，结构上不存在"码 > 库存" | ✅ 结构成立 |
> | 风控标红面板 | 未单列 | ⏳ 预留至 5.4 监控任务 |

```typescript
/** 发码审计事件（已实现，物理载体为 inventory_logs）。 */
interface CodeIssuanceAudit {
  case_id: string;
  coach_id: string;                       // 平台池码为生成操作的管理员
  code_type: 'experience' | 'recharge';
  issued_count: number;                   // 必须等于箱规格 24，部分生成即整体失败
  operator_id: string;
  offline_receipt_no: string;             // 平台生成必填
  issued_at: string;
}

/** 超卖风控不变量。10.8 由事务结构保证；独立标红面板预留至 5.4。 */
interface OversellInvariant {
  rule: 'total_codes_per_coach <= cloud_stock_boxes';
  on_violation: 'flag_red';
}
```

### 5.2 并发锁纪律（Concurrency Locking Discipline）✅ 10.8 / 10.9 已落地执行

```typescript
/**
 * 跨表写的全局锁顺序（防死锁）。
 * 任何涉及多表写入的 RPC / 事务，必须按此顺序加行级锁，禁止逆序。
 */
const LOCK_ORDER = [
  'box_codes',
  'code_activations',
  'user_coach_relation',
  'coach_inventory',
] as const;
type LockOrder = typeof LOCK_ORDER;
```

1. **落地证据**：审核 RPC 源码显式注释并遵循 `box_codes → code_activations → user_coach_relation → coach_inventory` 顺序；托管转移按教练咨询锁 → 关系行锁（不触碰 box_codes，顺序不冲突）；划拨路径 `box_codes（skip locked）→ coach_inventory`；均单事务。
2. 幂等键与乐观版本继续强制；锁不替代幂等，幂等不替代锁。`box_codes` 的 version 恰好 +1 由触发器强制。
3. 新增写路径必须在方案中声明加锁表清单与顺序，裁判审查时逐条核对 `LOCK_ORDER`。

### 5.3 防刷设备指纹（Device Fingerprint Anti-fraud）— 申请入口已落地（TASK-10.10），打卡入口 device 维仍预留

```typescript
/**
 * 防刷设备指纹契约（预留）。
 * 只存不可逆散列，严禁存原始 UA、设备号或任何可还原信息。
 */
interface DeviceFingerprint {
  device_hash: string;                    // 不可逆散列
}

/** 限流维度扩展：在现有 auth_user / ip 之外增加 device 维。 */
type AttemptScope = 'auth_user' | 'ip' | 'device';
```

1. 落地点：`box_code_attempt_guards.scope_type` 扩展 `'device'` ✅ 10.10 已落库；激活申请入口已纳入三维限流 ✅。打卡入口（`verify_checkin`）的 device 维仍预留，落地另派任务。
2. 隐私红线：`device_hash` 不得出现在雷达返回、公共事件、普通日志与错误详情中；散列算法与盐属安全实现，不进仓库。✅ 10.10 已落实（前端仅存本地随机 UUID，服务端二次 HMAC 落库）。
3. 启用前须完成隐私与合规评审。✅ 申请入口部分经 TASK-10.10 落地，见 3.3。

### 5.4 监控与告警（Ops Monitoring）— 预留，归属后续运维任务

```typescript
/**
 * 运营监控指标契约（预留）。聚合口径，不含个人级数据。
 * 监控读数是观测信号，不得成为业务状态的第二份权威副本
 * （对齐 module-boundaries 原则）。
 */
interface OpsMetrics {
  /** 打卡拒绝计数，按错误码分桶。 */
  checkin_rejections_by_code: Record<string, number>;
  /** 配置读取失败次数；> 0 即告警（fail-closed 被触发的信号）。 */
  config_read_failures: number;
  /** 当前处于补货预警状态的教练数。 */
  restock_alerts_active: number;
  /** 审核积压：pending_review 单数与最老一单的小时龄。 */
  pending_review_backlog: { count: number; oldest_hours: number };
}
```

1. 告警载荷只含聚合值与不透明 ID，不含码面、原始健康数据、联系方式。
2. 监控只做只读聚合查询，严禁为监控新建写入路径。
3. 阈值与通知渠道属运维配置，不进本字典。
4. 5.1 遗留的风控标红面板（激活码总量 > 云库存时标红）并入本任务一并设计。

### 5.5 休眠托管（Dormancy Trusteeship）✅ TASK-10.9 已实现（工单转平台队列除外）

> 契约细则以 `coach-lifecycle-trusteeship-v1.md` 为准。10.9 落地核对：
>
> | 契约条款 | 10.9 实现 | 结论 |
> | --- | --- | --- |
> | 判定只读 | `coach_lifecycles` 不自动推进状态；月度判定由受控服务端或后续任务写入；`admin_get_dormant_coaches` 只读 | ✅ |
> | 转移人工确认 | `p_confirmed is not true` 即 `MANUAL_CONFIRMATION_REQUIRED`，禁止系统自动转移 | ✅ |
> | 原子批量 | 单函数事务覆盖全部 dormant 教练；逐教练咨询锁；失败整体回滚，无部分转移 | ✅ |
> | 审计逐条 | 每用户一条 `audit_logs(coach_users_trusteed)`：发起人、确认人、from/to 教练、生效时间 | ✅ |
> | 转移后雷达访问即时失效 | 雷达按当前有效关系（`valid_to is null`）取数，旧关系关闭即失效 | ✅（继承雷达契约语义） |
> | 复购归平台不回绑 | 托管后当前归属为平台账号；审核路径沿用现归属 | ✅ |
> | 未结工单转平台队列 | 工单系统本身尚未实现 | ⏳ 预留（随工单任务一并落地） |
> | 用户权益不断档 | 托管不改打卡权益与既有激活；平台账号须经 `platform_official_account_id` 配置 | ✅ |

---

## 六、裁判知悉事项（非阻断观察，v1.7 已按最终代码核对）

1. ~~申请入口限流缺口~~ → **✅ 已封堵（TASK-10.10，main @ 5f1a9d7）**：`request_box_code_activation` 已接入三维限流（auth_user / ip / device），阈值动态读 `SystemConfig`，共享 IP 兼容语义按 3.3 落实；旧两参重载已删除。本条目关闭，历史描述保留备查：10.9 新设的申请入口曾未接入限流（10.4 旧 RPC 的限流随权限回收失效），码枚举攻击面曾集中在申请入口。
2. **平台池标识方式**：平台池以 `inventory_status = 'platform'` 标识，`coach_id` 记录生成操作的管理员；归属终点则以配置 `platform_official_account_id` 为准。两套"平台"标识各司其职（库存归属 vs 关系归属），无冲突；若裁判认可，建议下一轮契约升版时回写 10.1 契约的 `PLATFORM_ID` 表述。
3. **平台码激活不扣教练库存**：仅 `inventory_status = 'coach'` 的码在审核通过时扣减云库存，平台码不伪造教练库存——语义正确，无需处理。
4. **运营待办**：`platform_official_account_id` 需运营播种真实平台账号 UUID；播种前相关路径正确 fail-closed。
5. **雷达阈值参数化**（`radar_yellow_hours` / `radar_red_hours` 播种）仍为开放项，按变更四步法另行升版。
6. **教练身份 SSOT 断裂（TASK-10.13 登记，P0）**：`get_my_access_profile` 与 `get_coach_radar_v1` 门控只读 `camp_admins`，但教练角色行无任何写入路径（`admin_set_staff_role` 只写 `'staff'`）；目录/划拨/审核/补货已切 `user_coach_relation` 口径。两套口径并存导致教练端权限读取失败与码库目录不可见。修复契约见 2.6，待修复派工。
7. **教练名册 MISSING**：教练存在性当前由"名下有当前学员"推定，新教练/空盘教练在所有枚举点消失；2.6 契约要求改为 `camp_admins` 角色行判定，写入路径（建议 `admin_set_coach_role`）待落地。
8. **pepper 读取口径已终裁收口（TASK-10.13-CONTRACT-FREEZE）**：全库彻底**废除 GUC 读取**（`current_setting('app.box_code_pepper')`），统一强制只从 Supabase Vault（`vault.decrypted_secrets`，name='box_code_pepper'）读取，缺失即 `BOX_CODE_PEPPER_NOT_CONFIGURED` fail-closed；任何新代码引用 GUC 口径直接打回。现状残留（待收口派工）：`admin_get_pending_box_code_reviews`（`20261108130000:235`）、`verify_checkin`、旧激活路径、`generate_platform_codes`、雷达（`20261106160000:41`）仍读 GUC；已切 Vault：`get_my_code_inventory`（两处）与 `coach_push_code_v1`。运维过渡期须两处同配，收口任务完成后 GUC 配置项退役。
9. **晋升条件已终裁固化**：coach_promotion_required_checkins=21、probational_coach_required_recruits=8 经 TASK-10.13-CONTRACT-FREEZE 写死为正式条件，入SystemConfig（未播种）；准教练能力边界（雷达/划拨权）已终裁：仅限查看本人名下雷达，严禁划拨库存。见 2.8。
10. **绑定机制已终裁**：废弃邀请码方案，后台审核制为唯一 SSOT（见 3.2 第 5 条）。
11. **人工审核申请来源澄清（TASK-10.13 裁定依据）**：`admin_get_pending_box_code_reviews`（`20261108130000_manual_review_trusteeship.sql:201`）的待审申请有且仅有两个合法来源——用户手动输码 `request_box_code_activation`（`20261108140000:104`）与教练直推 `coach_push_code_v1`（`20261109120000_coach_workflows.sql:421`）；两路径均只建 `pending` 审核单，终审唯一。契约固化见 2.7。

---

## 七、Backlog（仅记录，不实现）

> 本节登记已获裁判认可、但当前不立项实现的演进项。任何 Backlog 项转正式任务，必须走变更四步法并升版本字典。

### BL-1：产品有效期 `expires_at`（优先级 P1）

- **业务语义**：一盒一码绑定产品有效期；码过期后无法打卡（`verify_checkin` 拒绝）。实体产品批次有保质期，码的可用期应与批次有效期挂钩。
- **契约草案（示意，未终裁）**：

```typescript
interface BoxCode {
  // ...既有字段略
  /**
   * ⏳ Backlog：产品有效期截止（服务端时间）。
   * 落码时按批次写入；过期后 verify_checkin 拒绝（新闸门，优先级在状态拦截之后、额度拦截之前）。
   * 过期不影响历史打卡数据与归属事实，只阻断新增打卡。
   * 有效期数值/批次规则未来进 SystemConfig 或批次档案，严禁硬编码。
   */
  expires_at?: string;
}
```

- **影响面（预估）**：`box_codes` 加列、`generate_platform_codes` 按批次写入、`verify_checkin` 加闸门、前端额度展示提示、雷达与审核文案。
- **未决问题（转正式任务前须裁判终裁）**：有效期起算点（生产日/发码日/激活日？）、过期码是否可人工延期、过期是否影响"先审先得"中的在审申请、与 30 袋装演进是否同批落地。
- **纪律**：本条目仅为记录；任何代码、迁移、测试的编写都必须等裁判正式派工。

---

## 附：本字典验收清单

- [x] 所有业务参数均收敛于 `SystemConfig`（含 `platform_official_account_id` 与 3.3 两项限流阈值），无散落的字面值口径。
- [x] `BoxCode` 含 `max_checkins` / `used_checkins` / `box_spec` / `inventory_status` 字段（10.7/10.8 已落库）。
- [x] `CoachInventory` / `InventoryLog` / `AuditLog` / `CoachLifecycle` 接口已同步进字典并与物理表一致。
- [x] `verify_checkin` 五闸门契约与 10.7 实现一致。
- [x] 云库存三事件流水、行级锁、线下凭证号、权限白名单与 10.8 实现一致。
- [x] `pending_review` 状态机与人工审核闭环、托管审计流水与 10.9 实现一致。
- [x] 10.7 / 10.8 / 10.9 职责边界互不重迭，越权判定标准清晰。
- [x] 归属唯一性（一人一教练、一码一归属、先审先得、不开放自助解绑）已全面落地。
- [x] 变更四步法完整、可执行、有证据要求。
- [x] 前瞻演进五契约均有落地状态标注与边界归属。
- [x] 3.3 申请入口限流契约完整（三维限流、企业共享 IP 兼容语义、阈值配置化）。
- [x] 2.6 教练身份 SSOT 契约已固化：两项 P0 根因带物理路径行号，修复点明确（补角色写入路径 + 枚举点换源），无双口径。
- [x] 2.7 双路径激活契约已固化：两入口、汇合点、唯一终审、幂等与审计链完整。
- [x] 2.8 教练晋升状态机已冻结：晋升条件（21 天打卡 / 直推满 8 人）经裁判终裁固化入 SystemConfig，跃迁全部服务端化，实现待派工。
- [x] 人工审核申请来源已澄清并指向 2.7（知悉事项第 10 条）。
- [x] 第七节 Backlog 已登记 `expires_at` 产品有效期（P1），仅记录不实现。
- [x] 全文对齐四轨制代号规范，无裸写版本号（历史 Hash 除外）。
- [x] 本文档不含任何 RPC SQL、迁移或前端实现代码。
