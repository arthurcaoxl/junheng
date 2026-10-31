# 官网内容信任展示阶段一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变产品功能和数据契约的前提下，完成职场文案、专业词常显解释、真实循证入口与打卡情绪安抚。

**Architecture:** 继续修改现有展示组件，不引入新框架。专业解释以常显小字融入现有组件，循证按钮直接链接仓库已有批件；所有行为先以 React Testing Library 写失败测试。

**Tech Stack:** React、TypeScript、Vite、Vitest、Testing Library、现有 CSS。

## Global Constraints

- 不修改 `storage-v3`、Supabase、CSV、打卡逻辑或用户中心。
- 不承诺固定减重、绝对安全、抗衰老或抗疲劳结果。
- 211 必须保留蔬菜、优质蛋白、主食三部分。
- 现有证据仅为科学性审查批件，不能写成正式临床研究报告。
- 每个任务独立提交；不合并、不推送、不发布。

---

### Task 1: 职场痛点与完整 211 文案

**Files:**
- Create: `apps/web/src/test/content-trust.test.tsx`
- Modify: `apps/web/src/components/MetabolismSignals.tsx`
- Modify: `apps/web/src/components/BrandPerspective.tsx`
- Modify: `apps/web/src/components/PlateGuide.tsx`

**Interfaces:**
- Consumes: 现有 `App`、`MemoryRouter` 和 `plateParts`。
- Produces: 新痛点标题、非承诺式减重说明、完整 211 应酬文案。

- [ ] **Step 1: 写失败测试**

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import App from "../App";

function renderHome() {
  return render(<MemoryRouter initialEntries={["/"]}><App /></MemoryRouter>);
}

describe("职场内容与信任展示", () => {
  it("使用非承诺式职场痛点文案并保留完整 211", () => {
    renderHome();
    expect(screen.getByRole("heading", { name: /为什么吃得少，体重还是难降/ })).toBeInTheDocument();
    expect(screen.getByText(/外卖高油高碳水、频繁应酬饮酒、久坐不动/)).toBeInTheDocument();
    expect(screen.getByText("科学管理体重，不靠极端节食，不追求脱水式减重。")).toBeInTheDocument();
    expect(screen.getByText(/不用算热量，记住 2 拳蔬菜、1 拳优质蛋白、1 拳主食/)).toBeInTheDocument();
    expect(screen.queryByText(/不拉肚子|拼命囤积脂肪/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 验证测试按预期失败**

Run: `cd apps/web && npm test -- src/test/content-trust.test.tsx`  
Expected: FAIL，找不到新标题与新文案。

- [ ] **Step 3: 最小修改三个组件**

`MetabolismSignals` 标题与导语：

```tsx
<h2 id="signals-title">为什么吃得少，体重还是难降？<br />吃得不均衡，长期坚持也会更难。</h2>
<p className="lead-copy">外卖高油高碳水、频繁应酬饮酒、久坐不动，让 30 岁后的体重管理越来越吃力。不是你不自律，而是忙碌的生活，正在挤占均衡营养和运动的空间。</p>
```

`BrandPerspective` 两段正文：

```tsx
<p className="lead">科学管理体重，不靠极端节食，不追求脱水式减重。</p>
<p>饭前一杯，配合正常三餐和规律记录；即使应酬较多，也能把饮食搭配和体重变化看得更清楚。</p>
```

`PlateGuide` 指导正文：

```tsx
<p>不用算热量，记住 2 拳蔬菜、1 拳优质蛋白、1 拳主食。哪怕在饭店应酬，也能照着搭配。餐前一杯是营养伴侣，正常吃饭仍然是主角。</p>
```

- [ ] **Step 4: 验证测试通过**

Run: `cd apps/web && npm test -- src/test/content-trust.test.tsx`  
Expected: 1 个测试文件、1 项测试通过。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/test/content-trust.test.tsx apps/web/src/components/MetabolismSignals.tsx apps/web/src/components/BrandPerspective.tsx apps/web/src/components/PlateGuide.tsx docs/superpowers/plans/2026-10-31-content-trust-stage-one.md
git commit -m "feat: refine workplace nutrition messaging"
```

### Task 2: 专业词常显解释与真实循证入口

**Files:**
- Modify: `apps/web/src/test/content-trust.test.tsx`
- Modify: `apps/web/src/test/iteration-v1.4.test.tsx`
- Modify: `apps/web/src/components/NutritionStory.tsx`
- Modify: `apps/web/src/components/CategoryDifference.tsx`
- Modify: `apps/web/src/data/nutrition.ts`
- Modify: `apps/web/src/components/Research.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `mechanismPaths` 的 `description` 字段和现有 `/images/clinical/ethics-approval.png`。
- Produces: 常显 `.plain-language-note` 与 `.research-evidence-button`，不改变数据类型。

- [ ] **Step 1: 增加失败测试并更新旧文案断言**

```tsx
it("常显专业名词解释并提供真实循证入口", () => {
  renderHome();
  expect(screen.getAllByText(/基础供能营养素（碳水、蛋白、脂肪）/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/经定向酶解处理的菌物营养成分/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/常见于抗氧化营养研究/).length).toBeGreaterThan(0);
  const evidence = screen.getByRole("link", { name: /查看循证依据/ });
  expect(evidence).toHaveAttribute("href", "/images/clinical/ethics-approval.png");
  expect(screen.getByText(/四川大学华西第四医院｜科学性审查批件 Hsy-2025043/)).toBeInTheDocument();
});
```

将 `iteration-v1.4.test.tsx` 对旧整句的断言改为：

```tsx
expect(screen.getByText(/定向酶解带来小分子菌糖肽/)).toBeInTheDocument();
expect(screen.getByText(/宏量营养之上，多一层菌物活性物质/)).toBeInTheDocument();
```

- [ ] **Step 2: 验证新测试失败**

Run: `cd apps/web && npm test -- src/test/content-trust.test.tsx src/test/iteration-v1.4.test.tsx`  
Expected: 新测试 FAIL，缺少常显解释和循证按钮。

- [ ] **Step 3: 实现常显解释与按钮**

`NutritionStory` 在原段落下增加：

```tsx
<p className="plain-language-note">宏量营养：基础供能营养素（碳水、蛋白、脂肪）。小分子菌糖肽：经定向酶解处理的菌物营养成分。麦角硫因：菌菇来源的特色营养成分，常见于抗氧化营养研究。</p>
```

`CategoryDifference` 标题下增加：

```tsx
<p className="plain-language-note">宏量营养＝基础供能营养素（碳水、蛋白、脂肪）。</p>
```

`data/nutrition.ts` 两条 `mechanismPaths.description` 分别改为：

```ts
description: "经定向酶解处理的菌物营养成分，关注营养释放与消化吸收过程。"
description: "菌菇来源的特色营养成分，常见于抗氧化营养研究；不替代充足睡眠和均衡饮食。"
```

`Research` 在现有批件图片链接前增加：

```tsx
<p className="research-evidence-label">四川大学华西第四医院｜科学性审查批件 Hsy-2025043</p>
<a className="research-evidence-button" href="/images/clinical/ethics-approval.png" target="_blank" rel="noreferrer">查看循证依据 <span aria-hidden="true">↗</span></a>
```

CSS 增加：

```css
.plain-language-note { margin-top: 14px; font-size: 12px; line-height: 1.8; opacity: .68; }
.research-evidence-label { margin-top: 22px; font-size: 13px; font-weight: 750; line-height: 1.8; }
.research-evidence-button { display: inline-flex; gap: 8px; margin-top: 14px; padding: 13px 20px; background: var(--forest); color: var(--paper); font-size: 14px; font-weight: 800; text-decoration: none; }
.plate-note, .water-note { font-size: 12px; line-height: 1.8; opacity: .68; }
```

- [ ] **Step 4: 验证相关测试通过**

Run: `cd apps/web && npm test -- src/test/content-trust.test.tsx src/test/iteration-v1.4.test.tsx src/test/app.test.tsx`  
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/test/content-trust.test.tsx apps/web/src/test/iteration-v1.4.test.tsx apps/web/src/components/NutritionStory.tsx apps/web/src/components/CategoryDifference.tsx apps/web/src/data/nutrition.ts apps/web/src/components/Research.tsx apps/web/src/styles.css
git commit -m "feat: clarify nutrition terms and evidence access"
```

### Task 3: 打卡情绪安抚与全量验证

**Files:**
- Modify: `apps/web/src/test/lifestyle.test.tsx`
- Modify: `apps/web/src/components/WaterFluctuation.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: 现有 `WaterFluctuation` 科普结构。
- Produces: 看趋势、不纠结单日数字的安抚文案，不改变折叠交互。

- [ ] **Step 1: 修改测试以要求新文案**

在 `lifestyle.test.tsx` 的水科普测试增加：

```tsx
expect(within(checkIn).getByText(/早晚相差约 2 kg 的情况可能出现，不必因单次读数焦虑/)).toBeInTheDocument();
expect(within(checkIn).getByText(/重点看 21 天的总体趋势/)).toBeInTheDocument();
```

- [ ] **Step 2: 验证测试失败**

Run: `cd apps/web && npm test -- src/test/lifestyle.test.tsx`  
Expected: FAIL，缺少新安抚文案。

- [ ] **Step 3: 修改科普导语**

```tsx
<div className="water-fluctuation-heading"><span>WATER & WEIGHT</span><h3 id="water-fluctuation-title">水分是体重波动的关键</h3><p>早晚相差约 2 kg 的情况可能出现，不必因单次读数焦虑。重点看 21 天的总体趋势，不纠结单日数字。</p></div>
```

保留原有个体差异、异常水肿和就医说明；`.water-note` 已在 Task 2 提升为 12 px。

- [ ] **Step 4: 运行全量验证**

Run: `cd apps/web && npm test && npm run lint && npm run build`  
Expected: 全部测试通过，lint 无错误，build 成功并生成现有静态路由。

- [ ] **Step 5: 提交并复核工作树**

```bash
git add apps/web/src/test/lifestyle.test.tsx apps/web/src/components/WaterFluctuation.tsx apps/web/src/styles.css
git commit -m "feat: reassure users about daily weight fluctuation"
git status --short --branch
```

Expected: 工作树干净，分支为 `feature/content-trust-user-center`。
