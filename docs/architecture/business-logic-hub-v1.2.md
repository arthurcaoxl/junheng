# 业务逻辑中枢字典 v1.2（Logic Hub）

> ❄️ **历史快照，不再维护。** 自 2026-11-08 起，字典固定维护在 `docs/architecture/business-logic-hub-v1.0.md`，当前版本为 **[BIZ-V1.3]**（版本号以内嵌标识为准）。本文件仅保留 v1.2 时刻内容供追溯。

- 版本：v1.2（2026-11-08 升版：吸收裁判 5 条前瞻建议；承接 v1.1 的 10.7 落地核对）
- 四轨标识：**[BIZ-V1.2]**（本字典即 BIZ 轨业务规则载体）
- 基线：main @ fb86715（[CORE] 四轨制落盘、TASK-10.8 已登记）
- 定位：打卡 App（10 号体系）后续所有子任务的**唯一业务事实源**。本字典只做契约提炼，不包含任何 RPC SQL、迁移或前端代码。
- 版本谱系：v1.0（首版，ce1da76）→ v1.1（10.7 落地核对，c361a02，分支 `feature-0.1-logic-hub-10.7-sync`）→ **v1.2（本文档）**。本文件落盘后取代 `business-logic-hub-v1.0.md`，旧文件作为历史版本保留、不再维护。
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
6. 代号规范遵循 AGENTS.md 〇节四轨制：业务规则引用本字典写 `[BIZ-V1.2]`，核对基线写 `[CORE-<hash>]`，派工写 `[TASK-x.x]`，前端发布写 `[APP-Vx.x.x]`；严禁裸写无前缀版本号。

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
  /** 单码打卡额度上限。默认 21（对应 21 袋/盒、21 天首购营）。 */
  max_checkins_per_box: 21;

  /** 默认盒规格。当前仅 '21_bags'；未来出 30 袋装时生成 '30_bags' 码即可，不改代码。 */
  default_box_spec: '21_bags' | '30_bags';

  /** 雷达黄灯阈值：超过此时长（小时）未打卡亮黄灯。默认 48。 */
  radar_yellow_hours: 48;

  /** 雷达红灯阈值：超过此时长（小时）未打卡亮红灯。默认 72。 */
  radar_red_hours: 72;

  /** 教练云库存补货预警点（盒）。库存低于该值触发预警，等于该值不触发。默认 12。 */
  coach_restock_point: 12;
}
```

**落地状态（v1.1 核对，v1.2 维持）：**

- ✅ **10.7 已实现配置物理载体**：`system_configs` 表（RLS 锁死、客户端零权限）+ `system_config_audit` 审计表 + 变更触发器（自动记录旧值/新值/操作者/时间），迁移 `20261107120000_verify_checkin.sql`。
- ✅ 已播种 `max_checkins_per_box = 21`、`default_box_spec = '21_bags'`。
- ⏳ `radar_yellow_hours` / `radar_red_hours` / `coach_restock_point` **尚未播种**：雷达灯号（10.5 已落库 RPC）当前按 `coach-radar-desensitized-v1.md` 的 Asia/Shanghai 自然日差语义计算（2 天黄、≥3 天红，与 48/72 小时口径等价），先于本字典存在；补货预警属 TASK-10.8 边界。**TASK-10.8 开工时须先播种 `coach_restock_point` 并由 RPC 动态读取**；雷达阈值如需参数化，按第四节变更四步法另行升版。

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
3. 配置读取失败时必须** fail-closed**（拒绝写入类操作并告警），严禁用兜底字面值静默降级。
4. 配置变更必须留审计记录（谁、何时、旧值、新值、依据的业务文档版本）——物理载体 `system_config_audit` 已落库。
5. 雷达灯号与自然日口径的**计算语义**（如 Asia/Shanghai 自然日差、结营未复购直接红）属于逻辑，留在 `coach-radar-desensitized-v1.md` 契约；只有**阈值数值**进 `SystemConfig`。

---

## 二、接口契约与状态机

### 2.1 BoxCode 接口（扩展版）

在 10.4 已落库的 `box_codes` 基础上，按 V7.1 指南 4.1.1 预留字段要求扩展：

```typescript
/** 盒规格。当前仅 21 袋装；30 袋装为预留演进值。 */
type BoxSpec = '21_bags' | '30_bags';

/** 码生命周期状态机（对齐 10.4 物理表 box_codes.state）。 */
type BoxCodeStatus = 'unused' | 'pending_review' | 'active' | 'revoked';

interface BoxCode {
  /** 不透明服务端 ID，公共事件与前端只引用此 ID，不暴露完整码面。 */
  code_id: string;

  /** 码类型：体验码 / 充值码，由服务端生成记录决定，客户端不得伪造。 */
  code_type: 'experience' | 'recharge';

  /** 生命周期状态（物理列：box_codes.state）。 */
  status: BoxCodeStatus;

  /** 盒规格，落码时从 SystemConfig.default_box_spec 快照。✅ 10.7 已落库。 */
  box_spec: BoxSpec;

  /** 单码打卡额度上限，落码时从 SystemConfig.max_checkins_per_box 快照。✅ 10.7 已落库。 */
  max_checkins: number;

  /** 该码已消耗的打卡次数，初值 0，只允许服务端按防刷契约递增。✅ 10.7 已落库。 */
  used_checkins: number;

  /** 码来源教练；平台官方库存为 PLATFORM_ID。 */
  coach_id: string;

  /** 所属箱 ID；每箱固定 24 个码。 */
  case_id: string;

  /** 激活后关联的唯一激活记录；一码一用，永不得改指向另一用户。 */
  activation_id: string | null;

  /** 并发控制版本号，所有写操作必须带 expectedVersion。 */
  version: number;
}
```

> 落地状态（v1.1 核对）：✅ **三个预留字段已由 10.7 落库**（迁移 `20261107120000_verify_checkin.sql`）：`box_codes` 新增 `max_checkins`（默认 21，非空）、`used_checkins`（默认 0，非空）、`box_spec`（默认 `'21_bags'`，非空），带 CHECK 约束（`used_checkins <= max_checkins`、`box_spec in ('21_bags','30_bags')`）；历史码按当前配置值回填。
>
> ⚠️ **TASK-10.8 衔接注意**：新列的数据库默认值（21 / `'21_bags'`）只是兜底。生成新码（尤其未来 30 袋装）时，生成路径必须**显式从 `system_configs` 读取并快照写入** `max_checkins` / `box_spec`，不得依赖列默认值——这是"配置驱动"纪律在码生成环节的落点。

### 2.2 码状态机（继承 10.1 契约，不可变更）✅ 已落库

> 10.4 已建表（`box_codes.state` CHECK 约束限定四态），10.7 的 `verify_checkin` 只对 `active` 态放行，与状态机一致。

```text
unused ──提交申请──> pending_review ──审核通过──> active
  │                     │
  │                     └──审核拒绝──> revoked ──补发──> 新 code_id 的 unused
  │
unused / active ──授权撤销或作废──> revoked（终态，不可逆）
```

- `pending_review` 状态下**不得**打卡、不得扣次、不得预写归属。
- `revoked` 为终态：不得恢复 `unused`、不得重新激活、不得换绑。
- 审核拒绝必须补发全新码，原码永不回库存。

### 2.3 任务边界（严禁越权开发）

| 子任务 | 唯一职责 | 明确禁止 |
| --- | --- | --- |
| **TASK-10.7** ✅ 已合并（5707c69） | **打卡防刷**：物理日幂等锁（一天只扣 1 次）、行级锁防并发连点、`used_checkins` 超额拦截、`pending_review` 拦截 | 不碰云库存分配、不碰审核流、不改雷达逻辑 |
| **TASK-10.8** ⏳ 待开工（字典前置已就绪，可凭 [BIZ-V1.2] 派工） | **云库存分配**：教练箱/码与云库存的扣减、补货预警（读 `coach_restock_point`）、库存台账流水（inventory_logs 逐笔出入库）、发码审计（见 5.1） | 不碰打卡扣次、不碰审核、不碰归属变更 |
| **TASK-10.9** | **人工审核流**：`pending_review → active / revoked` 的人工核验工单、发货与线下收款凭证核验、操作审计留痕（audit_logs）、托管转移的人工确认环节（见 5.5） | 不碰打卡扣次、不碰库存扣减、不设自动审核通过 |

- 越权判定：任何子任务在其边界外新增了写入路径或改变了其他模块的状态语义，即视为越权，直接打回。
- 跨模块协作只通过本字典与 10.1 契约族定义的接口和事件，不私开后门。

---

## 三、阻断与并发契约

### 3.1 RPC `verify_checkin` 拦截逻辑 ✅ TASK-10.7 已实现

> 落库于迁移 `20261107120000_verify_checkin.sql`。v1.1 已逐条核对实现与本契约一致，映射如下：
>
> | 闸门 | 10.7 实现 | 拒绝错误码 |
> | --- | --- | --- |
> | `status_active` | `v_code.state <> 'active'` 即拒绝（`unused` / `pending_review` / `revoked` 全覆盖） | `CHECKIN_NOT_ACTIVE` |
> | `quota_available` | `used_checkins >= max_checkins` 即拒绝 | `CHECKIN_QUOTA_EXHAUSTED` |
> | `physical_day_idempotent` | `checkin_daily_claims` 表主键 `(code_id, physical_day)`，物理日取 `Asia/Shanghai` 当日；同日重复打卡返回幂等结果（`idempotent: true`），不重复扣次 | —（幂等返回，非错误） |
> | `row_locked` | 码行 `select ... for update` 覆盖状态、幂等、额度、扣次全过程 | — |
> | `atomic` | 单函数事务；扣次、幂等记录、`CheckinVerified` 事件、快照保存同生共死，任一步失败整体回滚 | — |
>
> 附加防绕过：`checkin_sync` 表挂 `guard_checkin_sync_quota` 触发器，已激活用户未经 RPC 直接写云端打卡会被 `CHECKIN_RPC_REQUIRED` 拦截，与本契约"前端不得绕过闸门"一致。前端（`checkinQuota.ts`）只调 RPC 并做返回值结构校验，无额度字面值硬编码。

```typescript
/**
 * 打卡校验的拦截契约（逻辑描述，TASK-10.7 已实现）。
 *
 * 前置拦截（任一不满足即拒绝，fail-closed）：
 * 1. 码必须存在且 status === 'active'；
 *    unused / pending_review / revoked 一律拒绝。
 * 2. used_checkins < max_checkins；达到额度上限一律拒绝。
 * 3. 物理日幂等：同一码同一物理日（Asia/Shanghai）只允许扣 1 次，
 *    重复打卡返回幂等结果，不重复扣次。
 *
 * 并发纪律：
 * 4. 校验与扣次必须在同一事务内完成，对待打卡码行加行级锁，
 *    防止并发连点在额度边界上超额扣次。
 * 5. 扣次成功：used_checkins 恰加 1，并写幂等记录与审计事件；
 *    任一步失败整体回滚，不得出现"已扣次但无记录"或"有记录但未扣次"。
 */
type CheckinGate =
  | 'status_active'            // 状态拦截
  | 'quota_available'          // 额度拦截
  | 'physical_day_idempotent'  // 物理日幂等
  | 'row_locked'               // 行级锁
  | 'atomic';                  // 事务原子性

interface VerifyCheckinContract {
  /** 全部五道闸门必须通过；任何一道不通过即拒绝打卡。 */
  gates: CheckinGate[];
}
```

- `max_checkins` 取自该码自身字段（落码时从 `SystemConfig.max_checkins_per_box` 快照），不实时跟随配置回改历史码；新规格码（如 30 袋装）在生成时写入新额度。
- 限流与错误响应沿用 10.1 激活契约第 9 节：失败响应不得泄露有效码清单或码面近似信息。

### 3.2 归属唯一性

1. **一人只属一教练**：一个 `camper_id` 在同一时间只能绑定一个 `coach_id`（或平台官方账号 `PLATFORM_ID`），以 `user_coach_relation` 当前有效区间为权威。
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
| 2026-11-07 | v1.1 | 同步 10.7 落地：SystemConfig 物理载体、BoxCode 三字段、状态机、`verify_checkin` 五闸门逐条标记已实现；补充 10.8 衔接注意（码生成须从 `system_configs` 显式快照）；雷达阈值/补货点待播种说明 | 迁移 `20261107120000_verify_checkin.sql` 与前端 `checkinQuota.ts` 核对（main @ 5707c69） | c361a02 |
| 2026-11-08 | v1.2 | 吸收裁判 5 条前瞻建议（新增第五节：发码审计、并发锁纪律、防刷设备指纹、监控告警、休眠托管）；全面对齐四轨制代号规范；文件更名为 `business-logic-hub-v1.2.md` | 裁判前瞻建议批令 + AGENTS.md 〇节四轨制（main @ fb86715） | 见提交记录 |

---

## 五、前瞻演进契约（裁判批令 v1.2 新增）

> 本节 5 条为裁判批复的前瞻建议，均为**契约级约定**，为 TASK-10.8 / TASK-10.9 及后续任务划定落点。标注"预留"的条款不在当前任务边界内，落地须另行申请任务编号并走变更四步法。

### 5.1 发码审计（Code Issuance Audit）— 归属 TASK-10.8

```typescript
/** 发码审计事件：每次生成箱/码必须留痕，禁止无审计发码。 */
interface CodeIssuanceAudit {
  audit_id: string;
  case_id: string;
  coach_id: string;                       // 平台官方库存为 PLATFORM_ID
  code_type: 'experience' | 'recharge';
  issued_count: number;                   // 必须等于箱规格 24，部分生成即整体失败
  operator_id: string;                    // 操作者（审核人/系统账号）
  issued_at: string;                      // 服务端时间
}

/** 超卖风控不变量（对齐沙盘面板解读第五节的风控面板意见）。 */
interface OversellInvariant {
  /** 任一教练名下码总数（任意状态）不得超过其云库存总盒数。 */
  rule: 'total_codes_per_coach <= cloud_stock_boxes';
  /** 违反时在风控面板标红告警；不自动冻结，处置权归人工审核。 */
  on_violation: 'flag_red';
}
```

1. 创建箱与预生成 24 个码的原子操作（10.1 契约 §7）必须同事务写入发码审计记录。
2. 发码审计与库存台账（inventory_logs）勾稽：入库（教练打款拿货 +24）与发码（+24 码）必须可逐笔对账。
3. 审计与对账结果只含不透明 ID 与计数，不输出完整码面。

### 5.2 并发锁纪律（Concurrency Locking Discipline）— 约束全部写路径任务

```typescript
/**
 * 跨表写的全局锁顺序（防死锁）。
 * 任何涉及多表写入的 RPC / 事务，必须按此顺序加行级锁，禁止逆序。
 */
const LOCK_ORDER = [
  'box_codes',
  'code_activations',
  'user_coach_relation',
  'inventory_ledger',
] as const;
type LockOrder = typeof LOCK_ORDER;
```

1. 所有多步写（激活、打卡扣次、库存扣减、托管转移）必须单事务 + 行级锁；10.7 的 `verify_checkin`（`for update`）是参考实现。
2. 幂等键（`idempotencyKey`）与乐观版本（`expectedVersion`）继续强制；锁不替代幂等，幂等不替代锁。
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

1. 落地点：`box_code_attempt_guards.scope_type` 扩展 `'device'`；激活申请与打卡请求均纳入三维限流。
2. 隐私红线：`device_hash` 不得出现在雷达返回、公共事件、普通日志与错误详情中；散列算法与盐属安全实现，不进仓库。
3. 本条为预留契约，当前 10.7/10.8/10.9 均不实现；启用前须完成隐私与合规评审。

### 5.4 监控与告警（Ops Monitoring）— 预留，归属后续运维任务

```typescript
/**
 * 运营监控指标契约（预留）。聚合口径，不含个人级数据。
 * 监控读数是观测信号，不得成为业务状态的第二份权威副本
 * （对齐 module-boundaries 原则）。
 */
interface OpsMetrics {
  /** 打卡拒绝计数，按错误码分桶（CHECKIN_NOT_ACTIVE / CHECKIN_QUOTA_EXHAUSTED 等）。 */
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

### 5.5 休眠托管（Dormancy Trusteeship）— 契约细则以 `coach-lifecycle-trusteeship-v1.md` 为准，本节为人机协同落点

1. **判定只读**：休眠判定（月新增付费 < 4 人）是只读统计，不产生任何写入。
2. **转移人工确认**：批量托管转移必须经人工审核确认（TASK-10.9 边界），禁止系统全自动转移。
3. **原子转移**：单教练名下用户的 `referrer_id` 批量转至 `PLATFORM_ID` 必须单事务完成，按 5.2 `LOCK_ORDER` 加锁；不得出现部分转移。
4. **审计留痕**：每次转移逐条写 `audit_logs`——谁发起、谁审核、何时、哪些用户（不透明 ID）、从哪个教练到平台；与 V7.1 第七章"批量操作须可审计、可追责"对齐。
5. **转移后即时生效**：原 coach 及其 staff 立即失去这些用户的雷达访问（雷达契约 §1 已实现该语义）；未结工单复核后转平台责任队列；已激活权益继续有效；后续复购归平台，不回绑原教练（见 3.2 第 4 条）。
6. **用户权益不断档**：托管不得降低用户既有权益与服务连续性，平台接管须有人工客服承接记录。

---

## 附：本字典验收清单

- [x] 所有业务参数均收敛于 `SystemConfig`，无散落的字面值口径。
- [x] `BoxCode` 含 `max_checkins` / `used_checkins` / `box_spec` 三个预留字段（10.7 已落库）。
- [x] `verify_checkin` 拦截条件（`status === 'active'` 且 `used_checkins < max_checkins`、物理日幂等、行级锁）有明确契约描述且 10.7 已核对一致。
- [x] 10.7 / 10.8 / 10.9 职责边界互不重迭，越权判定标准清晰。
- [x] 归属唯一性（一人一教练、一码一归属、先审先得、不开放自助解绑）有明确契约描述。
- [x] 变更四步法完整、可执行、有证据要求。
- [x] 前瞻演进五契约（发码审计、并发锁、设备指纹、监控、托管）有落点与边界归属。
- [x] 全文对齐四轨制代号规范，无裸写版本号（历史 Hash 除外）。
- [x] 本文档不含任何 RPC SQL、迁移或前端实现代码。
