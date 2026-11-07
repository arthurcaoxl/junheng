# 业务逻辑中枢字典 v1.1（Logic Hub）

- 版本：v1.1（2026-11-07 同步：10.7 打卡防刷已合并，核对实现一致性）
- 基线：main @ 5707c69（10.7 已闭环，测试基线 352 项）
- 定位：打卡 App（10 号体系）后续所有子任务的**唯一业务事实源**。本字典只做契约提炼，不包含任何 RPC SQL、迁移或前端代码。
- 事实来源：
  - `docs/business/operation-guide-v7.1.md`（V7.1 运营指南）
  - `docs/business/ceo-business-report.md`（CEO 经营驾驶舱解读）
  - `docs/business/ceo-sandbox-algo.md`（沙盘算法与参数规范 V1.1）
  - `docs/business/ceo-sandbox-dashboard.md`（沙盘面板解读）
  - 既有契约：`docs/contracts/box-code-activation-v1.md`、`docs/contracts/coach-radar-desensitized-v1.md` 等 10.1 契约族

---

## 〇、总原则：配置与逻辑分离

> **🔥 最高指令：必须保留后期业务变更的便利性。**

1. 本字典中所有**业务参数**（打卡额度、盒规格、雷达阈值、补货点等）一律归入 `SystemConfig`，由配置驱动。
2. 前端组件、RPC、SQL 函数**严禁硬编码任何业务参数的字面值**；必须动态读取 `SystemConfig`。
3. 未来业务调整（如出 30 袋装、雷达时间窗变更、补货点调整）**只需修改配置值，严禁改动核心逻辑代码**。
4. 逻辑代码只描述"规则的形状"（如"未打卡时长超过黄灯阈值则亮黄灯"），不描述"阈值是几"（如 48 小时）。
5. 本字典与 `docs/business/` 文档冲突时，以裁判终裁的最新版业务文档为准，并按第四节"变更四步法"同步修订本字典。

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

**落地状态（v1.1 核对）：**

- ✅ **10.7 已实现配置物理载体**：`system_configs` 表（RLS 锁死、客户端零权限）+ `system_config_audit` 审计表 + 变更触发器（自动记录旧值/新值/操作者/时间），迁移 `20261107120000_verify_checkin.sql`。
- ✅ 已播种 `max_checkins_per_box = 21`、`default_box_spec = '21_bags'`。
- ⏳ `radar_yellow_hours` / `radar_red_hours` / `coach_restock_point` **尚未播种**：雷达灯号（10.5 已落库 RPC）当前按 `coach-radar-desensitized-v1.md` 的 Asia/Shanghai 自然日差语义计算（2 天黄、≥3 天红，与 48/72 小时口径等价），先于本字典存在；补货预警属 10.8 边界。**10.8 开工时须先播种 `coach_restock_point` 并由 RPC 动态读取**；雷达阈值如需参数化，按第四节变更四步法另行升版。

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
4. 配置变更必须留审计记录（谁、何时、旧值、新值、依据的业务文档版本）。
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

  /** ⭐ 新增预留：盒规格，默认读取 SystemConfig.default_box_spec。 */
  box_spec: BoxSpec;

  /** ⭐ 新增预留：单码打卡额度上限，默认读取 SystemConfig.max_checkins_per_box。 */
  max_checkins: number;

  /** ⭐ 新增预留：该码已消耗的打卡次数，初值 0，只允许服务端按防刷契约递增。 */
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
> ⚠️ **10.8 衔接注意**：新列的数据库默认值（21 / `'21_bags'`）只是兜底。生成新码（尤其未来 30 袋装）时，生成路径必须**显式从 `system_configs` 读取并快照写入** `max_checkins` / `box_spec`，不得依赖列默认值——这是"配置驱动"纪律在码生成环节的落点。

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
| **10.7** ✅ 已合并（5707c69） | **打卡防刷**：物理日幂等锁（一天只扣 1 次）、行级锁防并发连点、`used_checkins` 超额拦截、`pending_review` 拦截 | 不碰云库存分配、不碰审核流、不改雷达逻辑 |
| **10.8** ⏳ 待开工 | **云库存分配**：教练箱/码与云库存的扣减、补货预警（读 `coach_restock_point`）、库存台账流水（inventory_logs 逐笔出入库） | 不碰打卡扣次、不碰审核、不碰归属变更 |
| **10.9** | **人工审核流**：`pending_review → active / revoked` 的人工核验工单、发货与线下收款凭证核验、操作审计留痕（audit_logs） | 不碰打卡扣次、不碰库存扣减、不设自动审核通过 |

- 越权判定：任何子任务在其边界外新增了写入路径或改变了其他模块的状态语义，即视为越权，直接打回。
- 跨模块协作只通过本字典与 10.1 契约族定义的接口和事件，不私开后门。

---

## 三、阻断与并发契约

### 3.1 RPC `verify_checkin` 拦截逻辑 ✅ 10.7 已实现

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
 * 打卡校验的拦截契约（逻辑描述，10.7 负责实现）。
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
| **步骤 2** | 更新本中枢字典的 `SystemConfig`（及受影响接口定义），升版本号 | 中枢字典升版 |
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
| 2026-11-07 | v1.1 | 同步 10.7 落地：SystemConfig 物理载体、BoxCode 三字段、状态机、`verify_checkin` 五闸门逐条标记已实现；补充 10.8 衔接注意（码生成须从 `system_configs` 显式快照）；雷达阈值/补货点待播种说明 | 迁移 `20261107120000_verify_checkin.sql` 与前端 `checkinQuota.ts` 核对（main @ 5707c69） | 见提交记录 |

---

## 附：本字典验收清单

- [ ] 所有业务参数均收敛于 `SystemConfig`，无散落的字面值口径。
- [ ] `BoxCode` 含 `max_checkins` / `used_checkins` / `box_spec` 三个预留字段。
- [ ] `verify_checkin` 拦截条件（`status === 'active'` 且 `used_checkins < max_checkins`、物理日幂等、行级锁）有明确契约描述。
- [ ] 10.7 / 10.8 / 10.9 职责边界互不重迭，越权判定标准清晰。
- [ ] 归属唯一性（一人一教练、一码一归属、先审先得、不开放自助解绑）有明确契约描述。
- [ ] 变更四步法完整、可执行、有证据要求。
- [ ] 本文档不含任何 RPC SQL、迁移或前端实现代码。
