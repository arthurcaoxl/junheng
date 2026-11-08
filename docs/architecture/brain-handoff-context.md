# 架构语义接力锚点 (Brain Handoff Context)

## 当前字典版本
[BIZ-V1.3]

## 已完成的核心防线
1. 物理脱敏（SQL层剥离 height/weight/records）。
2. 一盒一码打卡防刷（行级锁、物理日幂等）。
3. 码池中枢（平台生成、教练分配、线下凭证、防超卖）。

## 暂缓的 Backlog
- checkin-quota-migration.test.ts:29 存在无效转义的 lint 错误待清理。
- 雷达灯号的复杂综合指标（BMI波动、计划达成）待 10.10 升级。

## 对下一个任务的核心提醒
- 任何涉及发放体验码、划拨库存的操作，必须严格校验管理员权限并写入 inventory_logs。
- 状态机流转必须严格遵守中枢字典定义。
