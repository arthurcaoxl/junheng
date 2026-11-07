# 菌衡计划 V7.1 · 经营沙盘核心算法与参数配置规范

版本：V1.1（含代码接口映射）

定位：本规范是系统研发、沙盘推演与日常经营复盘的底层基线。任何业务参数调整，必须先在 schema.ts 中修改默认值，再同步更新测试用例，最后在 UI 层放开。

# 目录

右键目录，选择"更新域"刷新页码。

# 模块一：产品与物理口径算法

【规则原则】 物理口径是底层基石，涉及报价与核心毛利，不可轻易改动。

| 参数配置项 | 基准值 | 业务算法规则 | 关联代码 / 接口映射 |
|---|---|---|---|
| 推演月数 | 24 | 预测两年期经营周期。 | schema.ts (horizonMonths)<br>html-generator.ts (INPUT_CONTROLS) |
| 盒价 / 成本 | 660 / 160 | 直营基础毛利 = boxPrice - unitCost | schema.ts (product.boxPrice/unitCost)<br>finance.ts (毛利计算逻辑) |
| 袋数换算 | 21袋/盒；30袋/月 | 每月复购盒数 = 30 ÷ 21 = 1.4286盒 | engine.ts (simulateUserMonth 月度消耗算法) |
| 首购营规格 | 3盒 / 1980元 | 首购营总消耗 63 袋（21天）。 | schema.ts (firstPurchaseBoxes)<br>engine.ts (首月购买与消耗) |
| 教练拿货价 | 462元/盒 | 教练7折拿货，单盒渠道毛利 = 462 - 160 = 302元 | schema.ts (coachPurchasePrice)<br>engine.ts (settleCoachOrder 结算接口) |

# 模块二：种子期漏斗与用户生命周期算法

【规则原则】 以真实交易和打卡过滤白嫖，根据 BMI 强制分流。

| 参数配置项 | 基准值 | 业务算法规则 | 关联代码 / 接口映射 |
|---|---|---|---|
| 种子1期漏斗 | 80% / 75% | 第1盒免费需打卡7天；第3盒需自费购买完成结营。 | schema.ts (seed.phase1.weekCompletionRate)<br>engine.ts (simulateUserMonth 转化逻辑) |
| 结营分流 (BMI) | 20% / 60% / 20% | 延伸（继续减脂）20%；维持（买月装）60%；流失 20%。 | schema.ts (users.extensionRate等)<br>engine.ts (用户生命周期切换引擎) |
| 月度维持留存率 | 90% | 本月维持期复购人数 = 上月维持人数 × 90% | schema.ts (users.monthlyRetention)<br>metrics.ts (computeChannelFinancials 计算留存收益) |

# 模块三：教练裂变与透明分润算法

【规则原则】 坚持单级直推，严卡准入，铁腕执行休眠托管。

| 参数配置项 | 基准值 | 业务算法规则 | 关联代码 / 接口映射 |
|---|---|---|---|
| 教练准入红线 | 18天/8人 | 自己打卡满18天 + 带8人完赛，解锁拿货特权。 | schema.ts (requiredRecordedDays等)<br>engine.ts (isCoachCohortActive 准入判定) |
| 休眠边界 | 4人/月 | 月新增付费 < 4人，强制休眠，平台托管名下用户。 | engine.ts (教练休眠判定与用户 referrer_id 转移) |
| 分润奖励率 | 差价198/数据66/裂变66 | 平台按真实拿货和完赛结果发放。 | schema.ts (dataRewardRate等)<br>economics.ts (settleCoachRewards 奖励核算) |
| 奖励抵扣比例 | 50% | 奖励的一半自动抵扣下次货款（减轻现金流压力）。 | schema.ts (rewardOffsetRate)<br>engine.ts (rewardOffsetUsed 现金抵扣逻辑) |
| 补货预警点 | 12盒 | 库存低于12盒触发补货预警。 | schema.ts (coaches.restockPoint)<br>metrics.ts (库存缺口预警计算) |

# 模块四：组织人效与财务平摊算法

【规则原则】 严守人效红线，固定与动态成本分离清算。

| 参数配置项 | 基准值 | 业务算法规则 | 关联代码 / 接口映射 |
|---|---|---|---|
| 人效扩张红线 | 1:5 教练 / 1:150 用户 | 需配置员工 = MAX(总教练/5, 总用户/150)，超标触发自动扩编。 | schema.ts (coachesPerStaff等)<br>engine.ts (自动扩编判定逻辑) |
| 员工薪酬计提 | 6000/10%/500 | 支出 = 人数 × 底薪 + 教练收益 × 10% + 新教练 × 500 | schema.ts (staff.monthlySalary)<br>engine.ts (staffPerformance/incubationReward 计提) |
| 动态平摊率 | 10% | 当月平摊费 = 平台总流水 × 10%，计入当月损益。 | schema.ts (finance.overheadRate)<br>engine.ts (月度平摊计算) |
| 一次性开办费/押金 | 20000 / 30000 | 只计首月现金。开办费扣首月利润；押金只扣现金。 | schema.ts (finance.setupFee/deposit)<br>engine.ts (oneTimeCosts 首月现金流扣减) |
| 抗风险算法 | — | 实时核算最大单月亏损、最大现金缺口与 Runway。 | metrics.ts (computeRunwayMetrics) |
| 动态保本点 | — | 实时核算平台达到收支平衡的销量/月份。 | metrics.ts (computeDynamicBEP) |


# 模块五：雷达灯号判定与打卡防刷（V1.0 降维版）

> **【规则原则】** V1.0 不做复杂综合指标，防止数据库全表扫描卡死；先以"未打卡时长"单维度定灯号，复杂指标（BMI 波动、计划达成度）后续在 10.9 写入 SQL 的 CASE WHEN。

## 5.1 雷达灯号 V1.0 固定算法

| 未打卡时长 | 灯号 | 教练动作（对齐 V7.1 第八章） |
|---|---|---|
| < 48 小时 | 绿灯 | 及时肯定，鼓励保持 |
| 48 ~ 72 小时 | 黄灯 | 询问原因，给出可执行支持 |
| > 72 小时 | 红灯 | 优先召回，必要时升级员工/平台客服 |

**技术边界：** 在 SQL/RPC 层，V1.0 的算法先固定为上表三档；物理脱敏只返回 5 个字段（包括 `alert_level`），不返回原始身高、体重等数据。

## 5.2 打卡扣次的幂等锁

- 打卡扣次数必须按"物理日"做幂等锁，一天只能扣 1 次，杜绝连点刷次数。
- 未通过人工审核的码（`pending_review` 状态）不能扣打卡次数。

## 5.3 Schema 预留字段（对齐模块一）

| 字段 | 默认值 | 用途 |
|---|---|---|
| `box_spec` | `'21_bags'` | 盒规格；出 30 袋装时直接生成 `'30_bags'`，不改代码 |
| `max_checkins` | `21` | 单码打卡额度上限 |

# 迭代修改纪律（研发与运营必看）

当业务侧提出参数调整（例如将"留存率"或"教练底线"调高/调低）时，严格按照以下四步走，绝不允许前端直接覆盖：

1. 修订规范　更新此文档，将基准值改为新数值并升版。

2. 修改 Schema　修改 tools/sandbox/src/schema.ts 中的默认值。

3. 补充测试红灯　在 tools/sandbox/test/ 对应模块的测试文件中，先修改期望值，跑出红灯。

4. 修正引擎并绿灯　修改 engine.ts 或 metrics.ts 的底层逻辑，直到测试全绿，然后 commit 并合并到 main。

预警是双向的（教练端 + 平台端），但在业务执行中，它首先是教练端的预警，其次才是平台的干预预警。

在真实的业务流和即将开发的打卡 App（子任务 10）中，这 12 盒的补货点是这样运作的：

### 1. 教练端预警（防流失与断货）

系统判定：系统实时扣减教练的云库存。当某教练名下用户的总消耗量即将让他跌破 12 盒时，系统在教练的“雷达页面”或小程序后台亮起红灯或弹窗。

业务动作：提醒教练：“您的库存仅剩 11 盒，按当前消耗速度将在 7 天后断货，请及时补货。”

目的：教练如果断货，终端用户就买不到产品，直接导致复购流失，教练自己的收益也会受损。

### 2. 平台端预警（防跑单与托管介入）

系统判定：平台管理员在后台看板上，能看到所有教练的库存水位线。

业务动作：运营人员看到某教练断货预警时，要跟进两件事：

如果教练活跃（还在努力卖货），赶紧催他打款补货（拿货 24 盒）。

如果教练已经“休眠”或服务很差，平台直接接管这批用户的发货（平台直接卖给终端用户，不再给这个教练算差价）。

### 💡 为什么在财务沙盘里要设这个参数？

在子任务 9 的宏观沙盘里，补货点 (12盒) 是一个财务推演参数。它决定了教练多久会进一次货。

如果补货点设得很低（如 2 盒），教练可能为了省事，等全卖光了才进 1 箱（24盒），导致期间用户流失，平台确认收入降低。

如果设在 12 盒（半箱），教练的现金流压力小，周转快，平台收入也更平滑。

### 🛠️ 在未来的打卡 App（子任务 10）中怎么实现？

需要写一个纯函数，根据教练的历史消耗速度动态计算预警：

```typescript
// 预计 10 号任务里要实现的逻辑

function checkRestockAlert(coachStock: number, restockPoint: number, dailyConsumptionRate: number): Alert | null {

if (coachStock <= restockPoint) {

const daysLeft = coachStock / dailyConsumptionRate;

return {

level: daysLeft <= 3 ? 'RED' : 'YELLOW',

message: `您的库存仅剩 ${coachStock} 盒，预计 ${Math.ceil(daysLeft)} 天后断货，请立即补货。`

};

}

return null; // 无需预警
}
```

**一句话总结**：补货预警是悬在教练头上的“紧箍咒”（提醒他赚钱），也是平台手里的“监控器”（防止业务断档）。