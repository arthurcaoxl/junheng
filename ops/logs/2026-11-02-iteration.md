# 2026-11-02 迭代备注（收官）

- 主线：数据合规闭环（总授权 → 授权管理）+ 三轮 C 端体验修复
- 版本：v1.11.0 → v1.12.1，共 5 个版本全部发布（`publish.md` 记录表与 `ops/logs/` 追溯链已补全）
- 代码终点：`0e83ca5`（本备注提交前）；测试基线 278 项（41 文件）

## 数据合规闭环（本日主线的）

1. **v1.11.0 铺垫**：`checkin_sync` 加 `consent_granted/consent_at` 两列；首版授权弹窗（勾选 + 协议链接）；新增 `/terms`、`/privacy` 静态路由。
2. **v1.12.0 总授权**（里程碑）：
   - 入口门禁 `CheckInGateLink` 统一包裹 Hero/入口区链接，`useConsent` Hook 管理“查询 → 弹窗 → 写库 → 放行”状态机；
   - 判据为云端表态：`true/false` 永久放行（拒绝也放行，只打扰从未表态者一次），`null` 才弹窗；无会话/查询失败降级读本机留痕，老用户不被重复骚扰；
   - 表态落库“查行 → update / 无行 insert”分流（规避未知表约束下裸 upsert 的静默失败风险），云端+本机双留痕；
   - 合规兜底：建档 insert 默认 `consent_granted: false`，同步流程永不回写 consent 列，未授权数据绝不误入研究池；
   - 移除 v1.11.0 页面级旧弹窗与 `grantResearchConsent` 死代码。
3. **v1.12.1 授权管理**：用户中心“数据授权”行——已授权可“撤回授权”（个保法第十五条对称权利），未参与可“同意参与”（复用总授权弹窗）；明确拒绝与建档默认 false 统一一套文案，不区分来源。
4. **数据安全边界**：全程未触碰 storage-v3 契约、`merged_flag` 语义与 `userCode` 唯一性规则。

## C 端体验修复（v1.11.1 / v1.11.2）

- 登录/恢复成功后同步弹窗自动关闭；BMI 图表图例（实线=每日实际、虚线=7 日均线）；进度条未完成段对比度。
- 协议页 PC 端 `max-width: 800px` 居中 + 返回按钮。
- 打卡页日期时间轴 flex 横滑 + 渐隐遮罩（`last-child margin` 技巧规避尾部 padding 滚动坑）。
- 浅色 Header 胶囊按主题作用域切换深绿对比度（顺带修复 `.is-synced` 浅底隐形潜伏 bug）。
- Hero 矮视口遮挡修复（`align-items: start` + `margin-block: auto` 安全居中，根因是非安全居中溢出而非 padding 不足）。
- 文案：用户中心“继续打卡”→“继续记录今日体重与腰围”行动指令。
- 附带排查：右下角 Kimi 浮标确认为托管平台运行时注入，非项目代码，转平台后台处理。

## 验证与追溯

- 每个版本均 TDD（先红后绿）；全量 278 项测试、Lint、Build、5 静态路由逐版本通过。
- v1.11.0–v1.12.1 五份发布日志补齐，提交哈希（Git）、发布版本 ID（`kimix website versions` 平台侧）、资源指纹（发布包解包）三方交叉一致。
- 本地实机验收：总授权五项检查（拦截/放行/拒绝进入/不重复弹/URL 直达）由所有者亲验通过。

## 明日待续（纯 C 端方向，已达成一致的口径）

- 指标库 2 三纯函数（`calculateTargetProgress` / `calculate7DayMovingAverage` / `getSmartFeedback`）已于本日随 v1.11.0 上线，位于 `src/utils/metrics.ts`（测试 `src/test/metrics.test.ts` 13 项全绿），后续按“行为与趋势干预”方向继续迭代时直接在此基础上扩展，无需重建。
