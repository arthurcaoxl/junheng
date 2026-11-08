# AI研发流水线操作手册与五角架构 Runbook (v1.1)

> **文档性质**：裁判（人类）操作手册 + AI 交接 Prompt 模板库 + 物理防线宪法
> **使用方式**：全文可直接复制执行，Prompt 模板建议存入剪贴板快捷键工具（如 Mac 的 Raycast / Paste）
> **核心原则**：只相信 Git 与终端的物理输出，绝不相信模型的对话记忆。主脑无手，裁判无脑，中枢无情，测试无情。

---

## 目录

- [AI研发流水线操作手册与五角架构 Runbook (v1.1)](#ai研发流水线操作手册与五角架构-runbook-v11)
  - [目录](#目录)
  - [第一部分：裁判初始化环境（只需做一次）](#第一部分裁判初始化环境只需做一次)
  - [第二部分：角色启动与交接 Prompt（直接复制使用）](#第二部分角色启动与交接-prompt直接复制使用)
    - [1. 启动【逻辑中枢（子任务 0）】](#1-启动逻辑中枢子任务-0)
    - [2. 唤醒【主任务（1104）】](#2-唤醒主任务1104)
    - [3. 切换【DeepSeek 跨对话主脑】](#3-切换deepseek-跨对话主脑)
    - [4. 派发【开发子任务】](#4-派发开发子任务)
  - [第三部分：裁判在 VS Code 的实操 SOP（全链路执行标准）](#第三部分裁判在-vs-code-的实操-sop全链路执行标准)
    - [阶段 A：准备与切分支](#阶段-a准备与切分支)
    - [阶段 B：审核方案与红灯](#阶段-b审核方案与红灯)
    - [阶段 C：合并落盘（收尾）](#阶段-c合并落盘收尾)
  - [第四部分：断网/断联紧急兜底指南](#第四部分断网断联紧急兜底指南)
  - [第五部分：AI 幻觉与撒谎的识别与治疗](#第五部分ai-幻觉与撒谎的识别与治疗)
  - [第六部分：核心工程铁律与避坑指南（血泪教训库）](#第六部分核心工程铁律与避坑指南血泪教训库)
  - [第七部分：上下文减负与主脑无损切换 (Offline Failover)](#第七部分上下文减负与主脑无损切换-offline-failover)
    - [7.5 主脑接力上下文资产化](#75-主脑接力上下文资产化)
    - [7.6 主脑无损切换 SOP](#76-主脑无损切换-sop)
  - [附录 A：WORKLOG 标准示例与接力升级版](#附录-aworklog-标准示例与接力升级版)
  - [附录 B：推荐目录与责任归属](#附录-b推荐目录与责任归属)

---

## 第一部分：裁判初始化环境（只需做一次）

在开始任何任务前，裁判（人类）必须在主工作区建立物理锚点。

```bash
# 1. 创建 WORKLOG 契约
cat > docs/WORKLOG.md << 'EOF'
current_baseline:
  milestone: "v1.13.3"
  head_commit: "当前最新的真实commit"
  test_files: 46
  test_cases: 342
  dictionary_version: "v1.0"
  status: "idle"
EOF

# 2. 创建 pre-flight 门禁脚本
cat > scripts/pre-flight.sh << 'EOF'
# (将上一章提供的 pre-flight.sh 代码粘贴到这里)
EOF

# 3. 赋予执行权限
chmod +x scripts/pre-flight.sh
```

---

## 第二部分：角色启动与交接 Prompt（直接复制使用）

### 1. 启动【逻辑中枢（子任务 0）】

适用场景：需要吞下长篇文档（如 V7.1 指南、商业模型），生成或更新《业务逻辑中枢字典》。

发给 Kimi 的 Prompt：

```text
【角色与任务】
你是项目的"逻辑中枢（Tech Lead）"。你不写业务代码，只负责将长文档提炼为结构化契约。
【动作】
1. 先运行 `bash scripts/pre-flight.sh`。
2. 阅读 `docs/architecture/` 下的商业文档。
3. 输出/更新 `docs/architecture/business-logic-hub-v1.0.md`。
【纪律】
必须使用 TypeScript Interface 定义核心状态机和脱敏接口。
如果有文档没写清的业务边界，直接标注[待确认]，严禁自己脑补。
```

### 2. 唤醒【主任务（1104）】

适用场景：有新任务（如 10.7）或补丁（如 10.6.7），需要项目经理分配编号。

发给 Kimi 1104 的 Prompt：

```text
【主任务统筹指令】
1. 运行 `bash scripts/pre-flight.sh`。
2. 为当前任务分配编号，在 AGENTS.md 登记表中登记分支名与简述（状态：进行中）。
3. 不要读取长篇商业文档，不要写代码。工单只需写明："目标分支 + 极简任务描述 + 强制阅读中枢字典"。
4. 同步更新 WORKLOG.md 中的 handoff_snapshot。
5. git commit 并 push 到 main。汇报真实 Hash 后，立刻休眠。
```

### 3. 切换【DeepSeek 跨对话主脑】

适用场景：开新窗口找 DeepSeek 审查红灯或方案。

发给 DeepSeek 的 Prompt：

```text
【主脑架构师恢复】
你是架构审查者（主脑），我是裁判。
【基线锁定】当前 main 最新 hash 为 [填 hash]，字典版本为 v1.0，测试基线 342 项。
【铁律】
- 物理脱敏在 SQL/RPC 层
- 严禁 git add .
- 静态推断不进根因
- 只审查不写实现
【接力动作】子任务即将开发 [编号]。
我现在把它的《技术方案》贴给你，请审查：
1. 方案是否包含物理脱敏
2. 是否防笛卡尔积
3. 判断是否允许进入红灯测试
若给通过意见，请附带下一步指令。
```

### 4. 派发【开发子任务】

适用场景：裁判铺好分支，将具体写代码的活派给 Kimi。

发给 Kimi 子任务的 Prompt：

```text
【第一步：强制物理契约核验】（不可跳过）
1. 执行 `bash scripts/pre-flight.sh`，必须通过 ✅。
2. 执行 `git fetch origin && git switch <分支名> origin/<分支名>`。
【第二步：阅读中枢字典】
请先阅读 `docs/architecture/business-logic-hub-v1.0.md` 中的 [指定模块]。
【第三步：任务目标】
- （一句话描述具体要改什么）
【第四步：执行纪律】
1. 方案先行：先出修改方案，等我（裁判）确认。
2. 测试先行：写红灯测试，跑出真实失败后再写实现。严禁用正则匹配 SQL 文本冒充行为测试。
3. 物理脱敏：不可在前端做敏感数据过滤。
4. 文件级提交：严禁 git add .，只 add 改动的文件。
5. 沙盒必须 commit：完成后必须在本地 commit，由裁判用 cherry-pick 吸代码。
请先输出【技术方案】。
```

---

## 第三部分：裁判在 VS Code 的实操 SOP（全链路执行标准）

这是每次任务在物理世界的标准流转动作。

### 阶段 A：准备与切分支

收到主任务的 Hash 后，在 VS Code 终端执行：

```bash
cd <主工作区绝对路径>
git pull origin main
bash scripts/pre-flight.sh
# 切分支并强制推送到远端
git switch -c <分支名>
git push -u origin <分支名>   # ⚠️ 必须做，否则云端 AI 找不到分支，会产生平行宇宙
```

### 阶段 B：审核方案与红灯

| 步骤 | 动作 |
|------|------|
| 1 | 将子任务的《技术方案》丢给 DeepSeek 审查 |
| 2 | 审核通过后，让子任务跑红灯测试 |
| 3 | 红灯日志贴给 DeepSeek，确认失败原因是否与业务缺失一致（防止伪实现）。裁判看代码时，使用 `git diff --cached -U0` 只取增删行，防 Token 爆炸。 |
| 4 | 绿灯通过后，让子任务执行 `git add <具体文件>` 并在沙盒 commit，汇报沙盒路径和 Commit Hash。 |

### 阶段 C：合并落盘（收尾）

裁判在本地主工作区执行：

```bash
# 1. 吸星大法（从子任务沙盒摘取代码）
git fetch <Kimi沙盒绝对路径> <分支名>
git cherry-pick <沙盒CommitHash>  # 或者 git merge --ff-only FETCH_HEAD

# 2. 跑测试验证基线
bash scripts/pre-flight.sh
npm test -- --run --reporter=dot  # 静默模式防刷屏，确保 100% 全绿

# 3. 推送到远端
git push origin main

# 4. 唤醒主任务更新台账
# 向 1104 发送："10.7 已合并，Hash 为 xxx。请更新 WORKLOG.md 和 AGENTS.md 台账，并 push。"
```

---

## 第四部分：断网/断联紧急兜底指南

当子任务 AI 提示"网络连接失败，无法推送"时，裁判必须立刻介入，严禁 AI 尝试任何越权操作（如调用 GitHub API 伪造提交）。

操作步骤：

1. 命令子任务："立刻停止操作，输出你的 git diff 或 git show。"
2. 裁判在 VS Code 中，进入该子任务对应的分支目录（如果是本地沙盒）。
3. 手动将 AI 生成的代码 Diff 应用到自己的 VS Code 工作区。
4. 裁判自己执行 git add 和 git commit。
5. 继续执行正常的审核与合并流程。

---

## 第五部分：AI 幻觉与撒谎的识别与治疗

如果大模型出现以下症状，请立刻使用红线法则：

| AI 幻觉症状 | 治疗方法（裁判执行） |
|------|------|
| 虚报合并/推送："我已经合并到 main 了。" | 裁判直接敲击 `git log --oneline -1 origin/main`。如果是旧的，立刻打回："远端没有你的提交，立刻重推或报告网络错误。" |
| 伪实现："我已删除了敏感字段。" | 要求 AI 贴出 TypeScript 的 Interface 定义和 SQL 的 SELECT 语句。如果它是用前端 `.filter()` 过滤的，直接判定不合格，打回重写。 |
| 假装测试通过："红灯测试通过了。" | 要求它贴出完整的 Terminal 控制台输出截图或纯文本。断言必须包含"期望抛出 xxx 错误，实际未抛出"。 |
| 暗箱重构：说删了 RPC，实际只删了一行。 | 审查 `git diff --stat` 中的 `-`（删除行数）。必须确认旧函数被 DROP，而不是新增了重载。 |

---

## 第六部分：核心工程铁律与避坑指南（血泪教训库）

1. **物理隔离**：绝对锁定绝对路径（/Users/mac/Documents/kimi/tasks/...），开工前必跑 `bash scripts/pre-flight.sh`。严禁跨目录操作。
2. **文件级暂存**：严禁 `git add .`，只能显式 `git add <file>`。绝对禁止夹带 `tools/sandbox/sandbox.html`。
3. **物理脱敏**：前端隐藏不算脱敏，必须在 SQL/RPC 层剥离敏感字段。
4. **配置与逻辑分离**：任何业务参数（限额、次数、有效期）必须从 SystemConfig 读取，缺失即 fail-closed，严禁在代码中硬编码。
5. **禁止"伪测试"**：红灯测试必须针对真实行为（运行时计数、并发），严禁仅用正则匹配 SQL 文本冒充行为测试。

| 事故现象 | 根因 | 裁判防御手段 |
|------|------|------|
| 平行宇宙：AI 在旧目录干活，主目录没变 | 绝对路径错乱 | 指令必带 `cd <绝对路径>`；子任务必须 commit，裁判用 cherry-pick 物理打通。 |
| 脏工作区合并：带入未跟踪的沙盘文件 | 惯性使用 `git add .` | 合并前后必跑 `git status --short`，校验文件变更列表。 |
| 台账恶性冲突：合并时 WORKLOG 满是冲突标记 | 多人并行改同一文档 | 绝不 Accept Both 污染 YAML。裁判手工解，保留双方记录。 |

---

## 第七部分：上下文减负与主脑无损切换 (Offline Failover)

大模型主脑在上下文严重超载时，接力信息不得依赖濒死的主脑自行总结，生成权由外部常驻角色接管。

### 7.5 主脑接力上下文资产化

- **物理侧（1104维护）**：在 `docs/WORKLOG.md` 顶部维护 `handoff_snapshot`（当前版本、活动任务、最后 Hash、测试基线、交接嘱托）。
- **语义侧（中枢0维护）**：在 `docs/architecture/brain-handoff-context.md` 中维护当前防线索引。

### 7.6 主脑无损切换 SOP

1. **冻结旧对话**：裁判停止向过载的主脑发送新任务。
2. **提取物理快照**：向 1104 发送指令："输出最新接力快照"。
3. **提取架构防线**：向中枢 0 发送指令："输出最新防线提醒"。
4. **唤醒新主脑**：新开 DeepSeek 对话，发送【主脑恢复与接力】模板，5秒满血复活。

---

## 附录 A：WORKLOG 标准示例与接力升级版

```yaml
current_baseline:
  schema_version: "1.0"
  milestone: "TASK-10.10"
  head_commit: "ffe37df"
  dictionary_version: "BIZ-V1.5"
  test_files: 56
  test_cases: 385
  status: "merged"

# 【主脑接力契约】
handoff_snapshot:
  current_core_version: "CORE-v1.13.3"
  current_biz_version: "BIZ-V1.5"
  active_task: "TASK-10.11"
  task_status: "In Progress"
  last_merged_commit: "ffe37df"
  test_baseline: "56 文件 / 385 项全绿"
  handoff_notes: "10.10 已闭环。下一步开发产品有效期 expires_at，必须读取 SystemConfig，严禁硬编码。"
```

---

## 附录 B：推荐目录与责任归属

```text
├── docs/
│   ├── WORKLOG.md # 机器可解析物理状态索引（含 handoff_snapshot）
│   ├── WORKLOG_ARCHIVE.md # 冷热分离，归档历史记录
│   ├── RUNBOOK.md # 本操作手册
│   ├── architecture/
│   │   ├── business-logic-hub-v1.0.md
│   │   ├── brain-handoff-context.md # 架构语义接力锚点（中枢维护）
│   │   └── logic-hub/ # 按业务域拆分的模块
│   └── evidence/ # 按任务编号保存的验收证据
```
