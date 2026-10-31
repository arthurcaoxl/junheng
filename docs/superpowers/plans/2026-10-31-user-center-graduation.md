# 用户中心、品牌平台与结业证书 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变 storage-v3、代表体重算法和 Supabase 数据结构的前提下，落地完整用户中心、个人数字资产迁移、账号操作及新中式 21 天会员结业纪念证书。

**Architecture:** `loadState()` 是唯一本机数据入口，公共纯函数负责统计和证书资格，现有 `RecordTrends`、`createRecordPoster`、`SyncPanel` 与 Canvas 机制继续复用。用户中心只管理展示和导出状态；D3 留在打卡页，D7 随个人资产迁移。

**Tech Stack:** React 19、TypeScript、Vite、Vitest、Testing Library、Supabase Auth、Canvas 2D、现有 CSS。

## Global Constraints

- 不修改 `storage-v3` 字段、CSV 列、代表体重算法、营员代码或 Supabase 表结构。
- 空昵称证书落款固定为“脂代谢研究所会员”。
- 证书按 `Object.values(state.records).filter(hasContent).length >= 21` 解锁，文案只能写“累计”，不能写“连续”。
- 证书编号为 `FUNGIBLEND-${state.startDate.slice(0, 4)}-${state.userCode.replace(/^JH-/, "")}`。
- “研究员”仅为品牌会员称号，不代表科研或职业身份。
- 体重指标只能称“核心体重指标变化”，不能称“核心脂质指标变化”。
- 证书 PNG 必须包含品牌内部会员纪念及非学历、职业资格、科研身份、医疗证明的声明。
- 不引入 html2canvas、新字体下载或大型 UI 依赖。
- 每个任务独立提交；不合并、不推送、不发布。

---

### Task 1: 公共类型、体重变化与证书纯函数

**Files:**
- Create: `apps/web/src/types/checkin.ts`
- Create: `apps/web/src/utils/userCenter.ts`
- Create: `apps/web/src/utils/graduationCertificate.ts`
- Create: `apps/web/src/test/user-center-metrics.test.ts`
- Create: `apps/web/src/test/graduation-certificate.test.ts`
- Modify: `apps/web/src/utils/checkin.ts`
- Modify: `apps/web/src/components/RecordTrends.tsx`
- Modify: `apps/web/src/components/SevenDayCheckIn.tsx`
- Modify: `apps/web/src/utils/recordPoster.ts`

**Interfaces:**
- Produces: `DayRecord`、`getPeriodWeightChange(records): number | null`、`getCertificateNumber(state): string`、`canGraduate(state): boolean`。

- [ ] **Step 1: 写失败测试**

```ts
expect(getPeriodWeightChange([day("70"), day("69.4")])).toBeCloseTo(-0.6);
expect(getPeriodWeightChange([day("69.4"), day("70")])).toBeCloseTo(0.6);
expect(getPeriodWeightChange([day("70")])).toBeNull();
expect(getCertificateNumber(state)).toBe("FUNGIBLEND-2026-WQAKS");
expect(canGraduate(twentyDays)).toBe(false);
expect(canGraduate(twentyOneNonConsecutiveDays)).toBe(true);
```

- [ ] **Step 2: 验证测试因模块不存在而失败**

Run: `cd apps/web && npm test -- src/test/user-center-metrics.test.ts src/test/graduation-certificate.test.ts`

- [ ] **Step 3: 实现纯函数并移动 DayRecord 类型**

```ts
export function getPeriodWeightChange(records: DayRecord[]): number | null {
  const values = records.map((day) => Number(getRepresentativeWeight(day)))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length >= 2 ? values[values.length - 1] - values[0] : null;
}

export const canGraduate = (state: CheckInState) => Object.values(state.records).filter(hasContent).length >= 21;
export const getCertificateNumber = (state: CheckInState) =>
  `FUNGIBLEND-${state.startDate.slice(0, 4)}-${state.userCode.replace(/^JH-/, "")}`;
```

- [ ] **Step 4: 运行纯函数测试和全量类型相关回归**

Run: `cd apps/web && npm test -- src/test/user-center-metrics.test.ts src/test/graduation-certificate.test.ts src/test/weight.test.ts src/test/lifestyle.test.tsx`

- [ ] **Step 5: 提交**

`git commit -m "feat: add user center and graduation metrics"`

### Task 2: 用户中心档案与个人资产迁移

**Files:**
- Create: `apps/web/src/hooks/useUserCenterData.ts`
- Create: `apps/web/src/components/user-center/HealthStats.tsx`
- Create: `apps/web/src/components/user-center/PersonalAssets.tsx`
- Create: `apps/web/src/test/user-center-page.test.tsx`
- Modify: `apps/web/src/pages/UserCenter.tsx`
- Modify: `apps/web/src/components/SevenDayCheckIn.tsx`
- Modify: `apps/web/src/services/syncUi.ts`
- Modify: `apps/web/src/components/SyncModal.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/test/lifestyle.test.tsx`
- Modify: `apps/web/src/test/iteration-v1.4.test.tsx`
- Modify: `apps/web/src/test/sync-panel.test.tsx`

**Interfaces:**
- Consumes: `loadState()`、`getCampStats()`、`buildWindowRecords()`、`getPeriodWeightChange()`。
- Produces: 用户中心趋势、海报、CSV 和 D7 续作；打卡页仅保留 `/user-center` 资产入口。

- [ ] **Step 1: 写页面失败测试**

覆盖：标题“我的脂代谢追踪档案”、观察员/研究员称号及说明、数据样本天数、核心体重指标变化正负值、不足两条时“记录满 2 天即可计算变化”、趋势与海报只在用户中心、CSV 下载、D7 匿名拦截与绑定后续作、未配置 Supabase 本机资产可用。

- [ ] **Step 2: 验证新页面测试失败**

Run: `cd apps/web && npm test -- src/test/user-center-page.test.tsx`

- [ ] **Step 3: 实现页面与资产组件**

`useUserCenterData` 仅在挂载时调用 `loadState()` 并读取 `junheng-checkin-name-v1`；`PersonalAssets` 接收 `records`、`state`、`recordName` 和 D7 状态。海报调用保持：

```ts
createRecordPoster(buildWindowRecords(state), recordName, {
  userCode: state.userCode,
  startDate: state.startDate,
  endDate: getCampStats(state).endDate,
});
```

- [ ] **Step 4: 更新迁移后的旧测试并运行相关回归**

Run: `cd apps/web && npm test -- src/test/user-center-page.test.tsx src/test/lifestyle.test.tsx src/test/iteration-v1.4.test.tsx src/test/sync-panel.test.tsx src/test/routing.test.tsx`

- [ ] **Step 5: 提交**

`git commit -m "feat: move personal assets into user center"`

### Task 3: 修改邮箱与退出登录

**Files:**
- Create: `apps/web/src/components/user-center/AccountSecurity.tsx`
- Create: `apps/web/src/test/account-security.test.tsx`
- Modify: `apps/web/src/pages/UserCenter.tsx`
- Modify: `apps/web/src/services/syncUi.ts`
- Modify: `apps/web/src/components/SyncPanel.tsx`
- Modify: `apps/web/src/components/SyncModal.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `updateUser({ email })`、`verifyOtp({ type: "email_change" })`、`syncToCloud()`、`signOut()`。
- Produces: `SyncMode` 新增 `change-email`；成功广播新邮箱，退出广播空邮箱。

- [ ] **Step 1: 写失败测试**

覆盖：旧邮箱在验证前不变、失败后显示错误、成功同步后提示“邮箱修改成功，云端数据已同步”、营员代码不变、退出后本机 v3 不变并提示数据保留、未配置 Supabase 隐藏账号操作。

- [ ] **Step 2: 验证测试失败**

Run: `cd apps/web && npm test -- src/test/account-security.test.tsx`

- [ ] **Step 3: 扩展统一 SyncModal 与 AccountSecurity**

修改邮箱仍调用 `upgradeToPermanentAccount` 和 `confirmEmailUpgrade`；仅验证且 `syncToCloud()` 返回 `synced` 后广播成功。退出只有 `signOut()` 无错误才广播 `email: null`，不清理本地存储。

- [ ] **Step 4: 运行账号与同步回归**

Run: `cd apps/web && npm test -- src/test/account-security.test.tsx src/test/sync-panel.test.tsx src/test/user-center-page.test.tsx`

- [ ] **Step 5: 提交**

`git commit -m "feat: add account security controls"`

### Task 4: 新中式结业证书组件与 Canvas 导出

**Files:**
- Create: `apps/web/src/components/GraduationCert.tsx`
- Modify: `apps/web/src/utils/graduationCertificate.ts`
- Modify: `apps/web/src/components/user-center/PersonalAssets.tsx`
- Modify: `apps/web/src/components/SyncModal.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/test/graduation-certificate.test.ts`
- Modify: `apps/web/src/test/user-center-page.test.tsx`

**Interfaces:**
- Consumes: `canGraduate()`、`getCertificateNumber()`、D7 `onGate(action)`。
- Produces: `createGraduationCertificate(state, recordName): string` 和 PNG 预览/下载。

- [ ] **Step 1: 增加失败测试**

覆盖：20 天禁用且显示 X/21、21 天可生成、非连续累计可生成、空昵称为“脂代谢研究所会员”、编号稳定、Canvas `getContext()` 返回 null 时显示错误且页面不崩溃、免责声明写入 Canvas。

- [ ] **Step 2: 验证测试失败**

Run: `cd apps/web && npm test -- src/test/graduation-certificate.test.ts src/test/user-center-page.test.tsx`

- [ ] **Step 3: 实现 Canvas 与组件**

Canvas 使用米白纸底、低对比纹理、深墨绿/暗金细框、几何回纹、宋体标题、楷体姓名和仅含“会员纪念”的暗红方章。绘制标题、纪念语、编号和完整免责声明，不模拟官方印章。

- [ ] **Step 4: 运行证书和资产回归**

Run: `cd apps/web && npm test -- src/test/graduation-certificate.test.ts src/test/user-center-page.test.tsx src/test/sync-panel.test.tsx`

- [ ] **Step 5: 提交**

`git commit -m "feat: add 21 day graduation certificate"`

### Task 5: 全局品牌、三大原则、海报与全量验收

**Files:**
- Modify: `apps/web/src/config/site.ts`
- Modify: `apps/web/src/components/SiteHeader.tsx`
- Modify: `apps/web/src/components/SiteFooter.tsx`
- Modify: `apps/web/src/components/BrandPerspective.tsx`
- Modify: `apps/web/src/utils/recordPoster.ts`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/test/content-trust.test.tsx`
- Modify: `apps/web/src/test/app.test.tsx`
- Modify: `apps/web/src/test/site.test.ts`
- Create: `apps/web/src/test/record-poster.test.ts`

**Interfaces:**
- Produces: “菌衡计划 | 脂代谢研究所”、三项原则、全局升级免责声明、海报新顶部与底部文案。

- [ ] **Step 1: 写失败测试**

断言 Header、Footer、三项原则、合规“脂代谢调节”文案、海报顶部英文和底部“加入菌衡计划·脂代谢研究所，用真实记录陪伴长期健康管理。”；禁止“修复代谢迟缓”“激活线粒体”“重塑易瘦体质”“核心脂质指标变化”。

- [ ] **Step 2: 验证测试失败**

Run: `cd apps/web && npm test -- src/test/content-trust.test.tsx src/test/app.test.tsx src/test/site.test.ts src/test/record-poster.test.ts`

- [ ] **Step 3: 实现全局文案与响应式样式**

Header 主标题替换，空间不足隐藏英文；Footer 与用户中心底部使用完整升级版声明；原则卡片使用现有森林色、米白和荧光绿，不增加依赖。

- [ ] **Step 4: 全量验证**

Run: `cd apps/web && npm test && npm run lint && npm run build`

Expected: 原 137 项及新增测试全部通过，lint 无错误，build 与三个静态路由生成成功。

- [ ] **Step 5: 提交并复核**

`git commit -m "feat: align lipid metabolism platform branding"`，随后 `git diff --check && git status --short --branch`。
