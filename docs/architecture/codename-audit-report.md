# 全库旧代号影响面排查报告

- 任务性质：只读排查（本任务未修改任何代码与配置）
- 基线：main @ fb86715（[CORE] 四轨制落盘、TASK-10.8 已登记）
- 排查日期：2026-11-08
- 排查方法：全库正则检索（排除 `node_modules` / `.git` / `package-lock.json`），逐条人工定性
- 背景：仓库已启用四轨制代号规范——`[BIZ-Vx.x]` 业务规则、`[CORE-vx.x.x]` 工程主干、`[TASK-x.x]` 任务编号、`[APP-Vx.x]` 前端发布版本。本报告将历史裸写代号映射到四轨，并区分影响等级。

## 分类口径

- **A 类（文档注释）**：仅出现在文档、注释、历史记录、测试套件命名中，不影响运行时行为；改写成本低，但历史记录类严禁回改。
- **B 类（代码断言）**：出现在可执行代码、配置字段、测试断言中，直接参与渲染、构建产物或测试门禁；变更必须走变更四步法（文档 → 字典 → 红灯 → 绿灯）。

---

## 一、代号总览与四轨映射

| 旧代号 | 语义 | 四轨归属 | 分布概况 |
| --- | --- | --- | --- |
| `V7.1` / `V7.0` | 业务运营指南版本 | 业务文档谱系（BIZ 轨的输入） | 文档 6 处文件 + 沙盘代码/测试 5 处文件 |
| `v1.13.3` | 前端当前发布版本 | `[APP-V1.13.3]` | 文档多处 + `apps/web/package.json` |
| `v1.9.0` | 前端历史发布版本 | `[APP-V1.9.0]`（历史） | ⚠️ 仍存活在代码与测试断言中（见 B1/B2） |
| `沙盘 4.0` | 沙盘库存资金模型代称 | 历史任务代称 | 仅测试套件命名 1 处 |
| `junheng-checkin-v1/v2/v3` | 本地存储键版本 | 存储契约（storage-v3） | 代码常量，功能性保留 |
| 旧域名 `rtrzqrxly4mlo.ok.kimi.link` | 已废弃部署域名 | 历史部署 | 代码常量，功能性保留 |

---

## 二、B 类：代码断言（变更需走四步法）

### B1 ⚠️ 前端版本号失真（最高优先级）

| 位置 | 现状 | 影响 |
| --- | --- | --- |
| `apps/web/src/config/site.ts:13` | `version: "1.9.0"` | 唯一事实源字段落后于 `apps/web/package.json` 的 `1.13.3` |
| `apps/web/src/components/SiteFooter.tsx:12` | 渲染 `网站版本 v{siteConfig.version}` | **线上页脚用户可见 "v1.9.0"，与实际发布版本 v1.13.3 不一致** |

判定：真实失真，非历史保留。版本号存在两个事实源（`site.ts` 与 `package.json`），违反单一事实源原则。

处置建议（后续子任务执行，本任务不动代码）：

1. 以 `package.json` 为唯一事实源，`site.ts` 构建期注入或同步；
2. 按四步法先改 `lifestyle.test.tsx` 期望值跑出红灯，再改实现；
3. 文档侧表述迁移为 `[APP-Vx.x.x]` 四轨格式。

### B2 ⚠️ 测试断言锁定失真值

| 位置 | 现状 |
| --- | --- |
| `apps/web/src/test/lifestyle.test.tsx:247` | `expect(siteConfig.version).toBe("1.9.0")` |
| `apps/web/src/test/lifestyle.test.tsx:248` | `expect(screen.getByText("网站版本 v1.9.0")).toBeInTheDocument()` |

判定：断言把失真值锁成了"绿灯"，修复 B1 时必须同步翻转这两条断言（先红灯后绿灯）。

### B3 沙盘生成器硬编码业务版本号

| 位置 | 现状 |
| --- | --- |
| `tools/sandbox/src/html-generator.ts:529` | `<title>菌衡计划 V7.1 · CEO 经营驾驶舱</title>` |
| `tools/sandbox/src/html-generator.ts:534` | `<h1>菌衡计划 V7.1 · CEO 经营驾驶舱</h1>` |

影响：字面值直接写入生成产物 `tools/sandbox/sandbox.html`、`tools/sandbox/output/{report,final-report,diagnostic-dom}.html`。业务文档升版（V7.2+）后，沙盘产物标题不会自动跟随。

处置建议：标题中的版本号改为从沙盘 schema/配置注入，或按四轨制改为 `[BIZ-Vx.x]` 引用；产物 HTML 属生成物，随重新生成刷新，无需单独修。

### B4 沙盘测试套件命名耦合版本代号（轻量）

| 位置 | 现状 |
| --- | --- |
| `tools/sandbox/test/schema.test.ts:7` | `describe('V7.1 输入契约', ...)` |
| `tools/sandbox/test/generator.test.ts:7` | `describe('V7.1 CEO 驾驶舱', ...)` |
| `tools/sandbox/test/finance.test.ts:9` | `describe('沙盘 4.0 库存与资金联动 (纯函数外部注入)', ...)` |

判定：仅套件标签，不断言版本值；业务升版后标签语义会漂移。优先级低，可随下一次沙盘改动顺手更名。

### B5/B6/B7 功能性保留项（非污染，禁止顺手清理）

| 位置 | 内容 | 保留理由 |
| --- | --- | --- |
| `apps/web/src/utils/checkin.ts:5-7` | `junheng-checkin-v3` / `junheng-checkin-v2` / `junheng-seven-day-checkin-v1` 存储键 | 老用户本地数据迁移链路，删除即丢历史打卡数据；语义归 `docs/contracts/storage-v3.md` |
| `apps/web/src/services/checkinSync.ts:17` | `MERGED_DATA_VERSION = "junheng-checkin-v3-union-v1"` | 云端合并去重语义标记，改动需重审同步契约 |
| `apps/web/src/utils/domainRedirect.ts:1` | `LEGACY_DOMAIN_HOSTNAME = "rtrzqrxly4mlo.ok.kimi.link"` | 旧域名 301 跳转逻辑，旧域名下线前必须保留；`domain-redirect.test.ts` 有对应断言 |

---

## 三、A 类：文档注释（分"保留 / 失真待修"两档）

### A-保留档（历史记录与当前权威文档，禁止回改）

| 位置 | 内容 | 判定 |
| --- | --- | --- |
| `docs/business/*.md`（4 份） | V7.1 业务版本表述 | **当前权威业务版本**，是 BIZ 轨输入文档，保留 |
| `docs/contracts/*.md` | V7.1 引用、契约版本号（v1/v3） | 契约自身版本谱系，保留 |
| `docs/contracts/publish.md` | v1.9.0 → v1.13.3 发布记录表 | 发布史，保留 |
| `ops/logs/*.md` | 各版本发布与迭代日志 | 历史物理证据，严禁改写 |
| `ARCHITECTURE.md:5` | "现状更新（2026-10-30，v1.9.0）"快照说明 | 已自声明为历史快照，保留 |
| `docs/architecture/business-logic-hub-v1.0.md` | 字典 v1.0/v1.1 修订记录 | 被 v1.2 取代后作为历史版本保留 |

### A-失真档（文档与现状不符，建议择机修订）

| 位置 | 失真内容 | 真实现状 |
| --- | --- | --- |
| `README.md:3` | 徽章 `v1.9.0` | 当前 [APP-V1.13.3] |
| `docs/workflow.md:5` | "线上版本 v1.13.3，测试基线 291 项" | 10.7 闭环后基线为 49 文件 / 352 项 |
| `docs/workflow.md:23` | "AGENTS.md 版本号停在 v1.9.0" | AGENTS.md 已更新为 v1.13.3，该叙述已过时 |
| `AGENTS.md:7` | "测试基线：46 个文件 / 341 项" | 10.7 闭环后 49 文件 / 352 项 |
| `AGENTS.md:6`、`docs/RUNBOOK.md:41`、`docs/architecture/multi-agent-logic-hub-v1.0.md:41` | 裸写 `v1.13.3` | 建议按四轨制改写为 `[APP-V1.13.3]`（RUNBOOK/multi-agent 两处是 WORKLOG 模板，建议改为四轨占位符） |

---

## 四、处置优先级汇总（供主任务派工）

| 优先级 | 项 | 动作 | 边界 |
| --- | --- | --- | --- |
| P0 | B1 + B2 | 版本号单一事实源化 + 断言翻转（四步法） | 微型补丁（建议 10.6.x 系列） |
| P1 | A-失真档 | 文档表述修订 + 四轨制改写 | 文档任务，可并入下一次主任务登记 |
| P2 | B3 + B4 | 沙盘版本号注入化、测试套件更名 | 沙盘边界任务，勿与打卡 App 混改 |
| 禁止 | B5/B6/B7、A-保留档 | 不动 | — |

## 五、排查结论

1. 全库仅 **1 处真实用户可见失真**（B1：页脚 v1.9.0），其余旧代号或为历史记录、或为功能性保留、或为低优先级命名耦合。
2. 四轨制（AGENTS.md 〇节）已给出终态规范；本报告的所有 A 类失真修订均应借修订动作同步迁移为四轨表述，不再裸写版本号。
3. 本报告只读产出，未修改任何代码、配置或文档之外的内容；B 类修复须按变更四步法另行派工。
