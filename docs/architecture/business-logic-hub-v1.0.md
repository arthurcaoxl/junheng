# 业务逻辑中枢字典 [BIZ-V1.3]（Logic Hub）

- 版本：**[BIZ-V1.3]**（2026-11-08 升版：TASK-10.8 云库存与流水落地核对）
- 四轨标识：**[BIZ-V1.3]**（本字典即 BIZ 轨业务规则载体）
- 基线：main @ d8666dc（[CORE] TASK-10.8 已闭环，测试基线 49 文件 / 368 项）
- 定位：打卡 App（10 号体系）后续所有子任务的**唯一业务事实源**。本字典只做契约提炼，不包含任何 RPC SQL、迁移或前端代码。
- 版本谱系与文件约定：v1.0（首版，ce1da76）→ v1.1（10.7 核对，c361a02）→ v1.2（裁判五条前瞻建议，2d2334c，曾短暂独立为 `business-logic-hub-v1.2.md`）→ **v1.3（本文档）**。**自 v1.3 起，字典固定维护在本路径 `business-logic-hub-v1.0.md`，版本号以内嵌 [BIZ-Vx.x] 标识为准**；`business-logic-hub-v1.2.md` 冻结为历史快照，不再维护。
- 事实来源：
  - `docs/business/operation-guide-v7.1.md`（V7.1 运营指南）
  - `docs/business/ceo-business-report.md`（CEO 经营驾驶舱解读）
  - `docs/business/ceo-sandbox-algo.md`（沙盘算法与参数规范 V1.1）
  - `docs/business/ceo-sandbox-dashboard.md`（沙盘面板解读）
  - 既有契约：`docs/contracts/box-code-activation-v1.md`、`docs/contracts/coach-radar-desensitized-v1.md`、`docs/contracts/coach-lifecycle-trusteeship-v1.md` 等 10.1 契约族

---

## 〇、总原则：配置与逻辑分离

> **🔥 最高指令：必须保留后期业务变更的便利性。**

1. 本字典中所有**业务参数**（打卡额度、盒规格、雷达阈值、补货点等）一律归入 `SystemConfig`，由配置驱动。
2. 前端组件、RPC、SQL 函数**严禁硬编码任何业务参数的字面值**；必须动态读取 `SystemConfig`。
3. 未来业务调整（如出 30 袋装、雷达时间窗变更、补货点调整）**只需修改配置值，严禁改动核心逻辑代码**。
4. 逻辑代码只描述"规则的形状"（如"未打卡时长超过黄灯阈值则亮黄灯"），不描述"阈值是几"（如 48 小时）。
5. 本字典与 `docs/business/` 文档冲突时，以裁判终裁的最新版业务文档为准，并按第四节"变更四步法"同步修订本字典。
6. 代号规范遵循 AGENTS.md 〇节四轨制：业务规则引用本字典写 `[BIZ-V1.3]`，核对基线写 `[CORE-<hash>]`，派工写 `[TASK-x.x]`，前端发布写 `[APP-Vx.x.x]`；严禁裸写无前缀版本号。

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

  /** 教练云库存补货预警点（盒）。库存低于该值触发预警，等于该值不触发。默认 12。✅ TASK-10.8 已播种并由 RPC 动态读取。 */
  coach_restock_point: 12;
}
```

**落地状态（v1.3 核对）：**

- ✅ 配置物理载体（10.7）：`system_configs` 表（RLS 锁死、客户端零权限）+ `system_config_audit` 审计表 + 变更触发器。
- ✅ 已播种：`max_checkins_per_box = 21`、`default_box_spec = '21_bags'`（10.7）；`coach_restock_point = 12`（10.8，`20261108120000_code_pool_inventory.sql`）。
- ✅ 配置消费端核对：`generate_platform_codes` 生成码时**显式从 `system_configs` 加锁读取并快照写入** `max_checkins` / `box_spec`（配置缺失即 `SYSTEM_CONFIG_MISSING` fail-closed，规格不匹配即 `BOX_SPEC_CONFIG_MISMATCH`）——v1.1 提出的"码生成不得依赖列默认值"衔接注意已被 10.8 完整落实；`get_my_code_inventory` 动态读取 `coach_restock_point` 计算 `needsRestock`。
- ⏳ `radar_yellow_hours` / `radar_red_hours` 仍未播种：雷达灯号（10.5 RPC）按 `coach-radar-desensitized-v1.md` 的自然日差语义计算（2 天黄、≥3 天红，与 48/72 小时口径等价）。如需参数化，按第四节变更四步法另行升版。

### 1.2 参数事实依据

| 配置项 | 默认值 | 业务出处 |
| --- | --- | --- |
| `max_checkins_per_box` | 21 | V7.1 指南 2.1：21 袋/盒、21 天首购营；4.1.1 预留字段 `max_checkins` 默认 21 |
| `default_box_spec` | `'21_bags'` | V7.1 指南 4.1.1：`box_spec` 默认 `'21_bags'`，出 30 袋装直接生成 `'30_bags'` 不改代码 |
| `radar_yellow_hours` | 48 | 沙盘算法规范模块五：未打卡 48~72 小时为黄灯 |
| `radar_red_hours` | 72 | 沙盘算法规范模块五：未打卡 > 72 小时为红灯 |
| `coach_restock_point` | 12 | 沙盘算法规范模块三：库存低于 12 盒触发补货预警；雷达契约 §6：`unusedCodesCount < 12` 触发 |

### 1.3 读取纪律

1. `SystemConfig` 是**运行期配置**，不是编译期常量。前端通过受控查询接口读取；RPC 在服务端读取。
2. 判断逻辑中只允许出现配置项的**引用**，不允许出现 `21`、`48`、`72`、`12` 等业务字面值。
3. 配置读取失败时必须 **fail-closed**（拒绝写入类操作并告警），严禁用兜底字面值静默降级。✅ 10.8 已落实（`SYSTEM_CONFIG_MISSING`）。
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

/** 库存归属。✅ TASK-10.8 已落库：平台池 / 教练云库存。 */
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

> 物理安全补记（10.8 落库）：码面以 `code_hash`（HMAC-SHA256）核验、`code_ciphertext`（pgp_sym_encrypt）存储，触发器强制密文不可变（`BOX_CODE_SECRET_IMMUTABLE`）；码面明文只在 `get_my_code_inventory` 中对持有教练本人解密返回。

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

**10.8 落库核对映射：**

| 契约要求 | 10.8 实现 | 结论 |
| --- | --- | --- |
| 云库存表 | `coach_inventory`（`available_count <= allocated_count` CHECK） | ✅ |
| 逐笔流水 | `inventory_logs` 三类事件 + append-only 触发器 | ✅ |
| 行级锁 | 划拨 `for update skip locked`（并发划拨不重叠）；激活先锁码行→激活行→关系行→库存行再扣减 | ✅ |
| 线下凭证号 | `generate_platform_codes` 缺凭证即 `OFFLINE_RECEIPT_REQUIRED`，CHECK 约束双保险 | ✅ |
| 权限白名单 | 生成/划拨 RPC 校验 `camp_admins` 中 `role='admin'` 且 `is_active`，否则 `FORBIDDEN`；全部 RPC 先 revoke 再按需 grant | ✅ |
| 箱规格 | `p_count % 24 = 0`，按箱生成并逐箱写流水 | ✅ |
| 配置驱动 | 生成时加锁读 `system_configs` 快照写入新码；`coach_restock_point` 动态读取 | ✅ |
| 码不变性守卫 | `guard_box_code_mutation` 触发器：身份字段不可变、状态机非法跃迁拒绝、version 强制 +1、库存迁移只许划拨 RPC | ✅ |
| 补货预警 | `needsRestock = availableCount < restockPoint`（11 触发、12 不触发），教练端 UI 提示 | ✅ |

### 2.3 码状态机（继承 10.1 契约，不可变更）✅ 已落库并由触发器强制

```text
unused ──提交申请──> pending_review ──审核通过──> active
  │                     │
  │                     └──审核拒绝──> revoked ──补发──> 新 code_id 的 unused
  │
unused / active ──授权撤销或作废──> revoked（终态，不可逆）
```

- 10.8 起状态跃迁由 `guard_box_code_mutation` 触发器白名单强制（非法跃迁 `BOX_CODE_STATE_CONFLICT`，删除 `BOX_CODE_HISTORY_IMMUTABLE`）。
- `pending_review` 状态下**不得**打卡、不得扣次、不得预写归属。
- `revoked` 为终态：不得恢复 `unused`、不得重新激活、不得换绑。
- 审核拒绝必须补发全新码，原码永不回库存。

### 2.4 任务边界（严禁越权开发）

| 子任务 | 唯一职责 | 明确禁止 |
| --- | --- | --- |
| **TASK-10.7** ✅ 已合并（5707c69） | **打卡防刷**：物理日幂等锁、行级锁防并发连点、超额拦截、`pending_review` 拦截 | 不碰云库存分配、不碰审核流、不改雷达逻辑 |
| **TASK-10.8** ✅ 已合并（d8666dc） | **云库存分配**：平台码池生成、教练划拨与激活扣减、补货预警（读 `coach_restock_point`）、库存台账流水、发码审计 | 不碰打卡扣次、不碰审核、不碰归属变更 |
| **TASK-10.9** ⏳ 待开工 | **人工审核流**：`pending_review → active / revoked` 的人工核验工单、发货与线下收款凭证核验、操作审计留痕（audit_logs）、托管转移的人工确认环节（见 5.5） | 不碰打卡扣次、不碰库存扣减、不设自动审核通过 |

- 越权判定：任何子任务在其边界外新增了写入路径或改变了其他模块的状态语义，即视为越权，直接打回。
- 跨模块协作只通过本字典与 10.1 契约族定义的接口和事件，不私开后门。

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

### 3.2 归属唯一性

1. **一人只属一教练**：一个 `camper_id` 在同一时间只能绑定一个 `coach_id`（或平台官方账号），以 `user_coach_relation` 当前有效区间为权威；10.8 起激活路径对该关系行使用咨询锁 + 行级锁（`pg_advisory_xact_lock` + `for update`）。
2. **一码归属唯一**：`box_code` 激活成功后归属即确定——**谁先输入并审核通过，额度就归谁**。
   - 两个用户同时提交同一码时，最多一个申请能占用该码，其余得到 `ACTIVATION_STATE_CONFLICT`，不得排队共享激活。
   - 归属确立只在激活原子流程中发生；`pending_review` 不预写归属。
3. **不开放自行解绑**：用户激活后原则上无自助解绑/换教练入口；仅休眠托管、平台审核确认或用户权益保护需要时启动变更，且必须新建关系区间、留存原因/审核人/时间，不得改写原始激活绑定事实。
4. **充值码不改绑**：已有当前归属时，充值码激活不得改绑发码教练；休眠托管后复购继续归平台，不回绑原教练。

---

## 四、业务演进与版本升级规范（Evolution Rule）

### 变更四步法

当业务参数发生变更（如出 30 袋装、雷达阈值调整、补货点调整、额度变更）时，严格按以下四步执行，**绝不允许跳过文档直接改代码**：

| 步骤 | 动作 | 产出物 |
| --- | --- | --- |
| **步骤 1** | 更新 `docs/business/` 下的 V7.1 运营指南，写明新参数值与业务依据 | 业务文档升版 |
| **步骤 2** | 更新本中枢字典的 `SystemConfig`（及受影响接口定义），升版本号 | 中枢字典升版（BIZ 轨升版） |
| **步骤 3** | 在对应测试文件中**先修改期望值，跑出红灯**，证明旧逻辑确实不满足新口径 | 红灯测试证据 |
| **步骤 4** | 修改底层 RPC / 引擎逻辑，直至测试**全绿**，然后 commit 合并 | 绿灯 + 真实 Hash |

### 演进纪律

1. 步骤 1、2 未完成并形成物理证据前，禁止进入步骤 3、4。
2. 纯参数变更（阈值、额度、规格取值）只允许改配置与测试期望值，不得改规则形状。
3. 规则形状变更（如雷达从单维度升级为多维综合指标）属于契约变更，必须重新评审并升版对应契约文档，不得混入参数变更。
4. 每次演进必须在本字典的修订记录中追加一行：日期、变更项、旧值 → 新值、依据文档版本、合并 Hash。

### 修订记录

| 日期 | 版本 | 变更 | 依据 | Hash |
| --- | --- | --- | --- | --- |
| 2026-11-07 | v1.0 | 首版落盘：SystemConfig、BoxCode 扩展接口、10.7/10.8/10.9 任务边界、阻断与并发契约、变更四步法 | V7.1 四份业务文档（main @ 0e1d51e） | ce1da76 |
| 2026-11-07 | v1.1 | 同步 10.7 落地核对；补充 10.8 衔接注意 | 迁移 `20261107120000_verify_checkin.sql` 核对（main @ 5707c69） | c361a02 |
| 2026-11-08 | v1.2 | 吸收裁判五条前瞻建议（第五节）；对齐四轨制 | 裁判批令 + AGENTS.md 〇节（main @ fb86715） | 2d2334c |
| 2026-11-08 | v1.3 | TASK-10.8 落地核对：`coach_inventory` / `inventory_logs` / 发码审计 / 并发锁纪律标记已实现并同步接口；`coach_restock_point` 已播种；字典固定回本路径；代号排查 P0（版本号单一事实源）随 10.8 一并闭环 | 迁移 `20261108120000_code_pool_inventory.sql` 与前端 `codePool.ts` 核对（main @ d8666dc，368 项测试） | 见提交记录 |

---

## 五、前瞻演进契约（裁判批令 v1.2 新增，v1.3 更新落地状态）

### 5.1 发码审计（Code Issuance Audit）✅ TASK-10.8 已实现（风控标红面板除外）

> 落库于迁移 `20261108120000_code_pool_inventory.sql`。核对映射：
>
> | 契约 | 10.8 实现 | 结论 |
> | --- | --- | --- |
> | 发码必留痕 | 每箱生成写 `inventory_logs(platform_generated, quantity=24, operator_id, offline_receipt_no)` | ✅ |
> | 划拨留痕 | `inventory_logs(coach_allocated)` 记教练、数量、操作者 | ✅ |
> | 激活核销留痕 | `inventory_logs(code_activated)` 记码 ID，云库存同事务 -1 | ✅ |
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

### 5.2 并发锁纪律（Concurrency Locking Discipline）✅ TASK-10.8 已落地执行

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

1. **落地证据**：激活路径按 `box_codes → code_activations → user_coach_relation（咨询锁+行锁）→ coach_inventory` 顺序加锁（源码注释显式声明遵循全局顺序）；划拨路径 `box_codes（skip locked）→ coach_inventory`；均单事务。
2. 幂等键与乐观版本继续强制；锁不替代幂等，幂等不替代锁。10.8 起 `box_codes` 的 version 恰好 +1 由触发器强制（`BOX_CODE_VERSION_CONFLICT`）。
3. 新增写路径必须在方案中声明加锁表清单与顺序，裁判审查时逐条核对 `LOCK_ORDER`。

### 5.3 防刷设备指纹（Device Fingerprint Anti-fraud）— 预留，落地另派任务

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

1. 落地点：`box_code_attempt_guards.scope_type` 扩展 `'device'`（现有表已支持 auth_user / ip 两维，10.4 落库）；激活申请与打卡请求均纳入三维限流。
2. 隐私红线：`device_hash` 不得出现在雷达返回、公共事件、普通日志与错误详情中；散列算法与盐属安全实现，不进仓库。
3. 本条为预留契约，当前均不实现；启用前须完成隐私与合规评审。

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

### 5.5 休眠托管（Dormancy Trusteeship）— 契约细则以 `coach-lifecycle-trusteeship-v1.md` 为准，本节为人机协同落点

1. **判定只读**：休眠判定（月新增付费 < 4 人）是只读统计，不产生任何写入。
2. **转移人工确认**：批量托管转移必须经人工审核确认（TASK-10.9 边界），禁止系统全自动转移。
3. **原子转移**：单教练名下用户的 `referrer_id` 批量转至平台官方账号必须单事务完成，按 5.2 `LOCK_ORDER` 加锁；不得出现部分转移。
4. **审计留痕**：每次转移逐条写 `audit_logs`——谁发起、谁审核、何时、哪些用户（不透明 ID）、从哪个教练到平台；与 V7.1 第七章"批量操作须可审计、可追责"对齐。
5. **转移后即时生效**：原 coach 及其 staff 立即失去这些用户的雷达访问（雷达契约 §1 已实现该语义）；未结工单复核后转平台责任队列；已激活权益继续有效；后续复购归平台，不回绑原教练（见 3.2 第 4 条）。
6. **用户权益不断档**：托管不得降低用户既有权益与服务连续性，平台接管须有人工客服承接记录。

---

## 六、裁判知悉事项（v1.3 核对中发现的非阻断观察）

1. **平台池标识方式**：10.1 契约设想平台官方库存使用 `PLATFORM_ID` 占位；10.8 实现改为以 `inventory_status = 'platform'` 标识平台池，`coach_id` 记录生成操作的管理员。结构等价且可追溯性更强，但字面与 10.1 契约不同——若裁判认可该实现，建议在下一轮契约升版时回写 10.1 契约表述，保持文档与物理一致。
2. **平台码激活不扣教练库存**：`activate_box_code` 仅对 `inventory_status = 'coach'` 的码扣减云库存，平台码激活不伪造教练库存——与字典"库存归谁扣谁"语义一致，无需处理。
3. **雷达阈值参数化**（`radar_yellow_hours` / `radar_red_hours` 播种）仍为开放项，按变更四步法另行升版，不阻塞 TASK-10.9。

---

## 附：本字典验收清单

- [x] 所有业务参数均收敛于 `SystemConfig`，无散落的字面值口径。
- [x] `BoxCode` 含 `max_checkins` / `used_checkins` / `box_spec` / `inventory_status` 字段（10.7/10.8 已落库）。
- [x] `CoachInventory` / `InventoryLog` 接口已同步进字典并与物理表一致。
- [x] `verify_checkin` 五闸门契约与 10.7 实现一致。
- [x] 云库存三事件流水、行级锁、线下凭证号、权限白名单与 10.8 实现一致。
- [x] 10.7 / 10.8 / 10.9 职责边界互不重迭，越权判定标准清晰。
- [x] 归属唯一性（一人一教练、一码一归属、先审先得、不开放自助解绑）有明确契约描述。
- [x] 变更四步法完整、可执行、有证据要求。
- [x] 前瞻演进五契约均有落地状态标注与边界归属。
- [x] 全文对齐四轨制代号规范，无裸写版本号（历史 Hash 除外）。
- [x] 本文档不含任何 RPC SQL、迁移或前端实现代码。
