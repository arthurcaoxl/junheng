
# 【主脑接力契约】
handoff_snapshot:
  current_core_version: "CORE-v1.13.3"
  current_biz_version: "BIZ-V1.4"
  active_task: "TASK-10.10"
  task_status: "In Progress"
  last_merged_commit: "4959fa6"
  test_baseline: "53 文件 / 368 项全绿"
  handoff_notes: "TASK-10.10-PRE-BIZ-V1.5 派工单已备案，目标分支 docs/biz-v1.5；等待逻辑中枢 0 按变更四步法升版，当前仍为 BIZ-V1.4。"

# 项目接力工作日志 (WORKLOG)

## 纪律
1. 任何新任务开工前，必须先读此日志并核对本地/远端 Git 状态。
2. 主任务合并后，必须在此追加记录。

## 历史记录
- 10.4：一盒一码（RPC、HMAC、防爆破）
- 10.5：物理脱敏雷达（RPC、前端解除邮箱门禁），合并于 5b10509，测试基线 327 项。
- 10.6：前端 UI（雷达看板、激活回显），合并于 58d29c7，测试基线 342 项。
- 10.6-hotfix：建立物理契约（WORKLOG、pre-flight）与 Staging 清单，合并于 540ac32。
- Docs：全景架构与多模型协同规范，合并于 675bbf1。
- 10.6.1：弱化授权撤回入口（341项），合并于 64620d6。
- 10.6.4：优化打卡衣物与腰围测量提示（341项），合并于 bbb5b37。
- 10.6.5：用户中心布局优化与跨设备同步修复，合并于 61a303a；当前物理基线锁定为 61a303a。
- 10.6.6：优化用户中心数据视觉层级与文案，裁判通过本地物理补丁合并于 93598cf；当前物理基线锁定为 93598cf。
- 架构：五角架构规范与 Runbook 模式已生效，业务逻辑中枢字典 v1.0 合并于 80df14e；当前物理基线锁定为 80df14e。
- 10.7：一盒一码打卡防刷与并发拦截，合并于 cdedcc6；当前物理基线锁定为 cdedcc6，49 个测试文件／352 项测试全绿。
- 规范：四轨制代号规范生效；执行 [TASK-10.8] 云库存与流水登记为进行中；当前物理基线锁定为 main@5707c69。
- 0.2：中枢字典 v1.2 与旧代号排查报告合并于 ba1e263；当前物理基线锁定为 ba1e263。
- TASK-10.8：云库存与流水（含P0版本号修复），合并于 d8666dc，测试基线 368 项。
- 技术债：checkin-quota-migration.test.ts:29 存在无效转义的 lint 错误，留待后续微补丁清理。
- TASK-10.10-PRE-BIZ-V1.5：目标分支 docs/biz-v1.5，派工单已备案，等待逻辑中枢 0 按变更四步法将字典从 [BIZ-V1.4] 升版至 [BIZ-V1.5]；仅文档，未推送。
- TASK-10.10 技术债（P2）：限流测试为静态 SQL 契约测试；运行时第 31 次／第 4 次拒绝、共享 IP 多设备隔离、无受信 IP 边界、SystemConfig 改 1 后第 2 次拒绝均未自动化覆盖。项目引入 PG 测试基建（pgtap／testcontainers／supabase start）时首批补齐；归属独立测试基建任务，不并入 10.10。
  - 一次性人工冒烟：未执行及原因——本机无 Supabase CLI 与 psql，运行中的唯一 Docker 容器不是 Supabase；仓库未提供可核验且已应用 `20261108140000_activation_request_rate_limit.sql` 的本地／预发 Supabase SQL Editor 会话，因此无法真实执行四项 RPC 冒烟，未伪造输出。
  - 环境检查原始输出：
    ```text
    $ command -v supabase || true; command -v psql || true
    （无输出）
    $ docker info --format '{{.ServerVersion}}' 2>&1
    29.5.2
    $ docker ps --format '{{.Names}} {{.Image}} {{.Ports}}' 2>&1
    lifewavefield lifewavefield:v19 0.0.0.0:3000->3000/tcp, [::]:3000->3000/tcp
    ```
