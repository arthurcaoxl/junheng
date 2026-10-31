# 2026-11-01 迭代备注

- 分支：`feature/content-trust-user-center` → 已快进合并入 `main`（`5ce7bb5..fdaec4f`，26 个 commit）
- 代码终点：`fdaec4f`（本备注提交前）；合并详情见 `ops/logs/2026-11-01-merge.md`
- 版本：未 bump，未创建发布标签
- 交付边界：**已合并 `main` 并推送 GitHub**；未发布线上

## 品牌文案与首页

1. 首页两处打卡入口主标题统一为「21 天，构建你的脂代谢稳态。」，副标题统一为「第 1 天建立基线，第 21 天回看趋势。记录体重、腰围与每餐执行情况。」
2. Hero 主标题改为双行排版「餐前精准膳食，/ 重塑脂代谢平衡。」（第一行稍小、第二行荧光绿最大视觉锤），沿用 `siteConfig.slogan / healthStatement` 配置驱动；副标题加入"科学融入"行动呼唤。
3. 页脚旧话术「21天减脂是阶段性的成果…」替换为脂代谢稳态口径；全站清除旧减脂表述与 `check-in-persistence` 残留样式。

## 入口与导航修复

1. 新增移动端 Hero 首屏「进入 21 天打卡 →」全宽 CTA（桌面端隐藏），修复移动端找不到打卡入口的问题。
2. 修复「点击打卡入口跳转后看到页脚」Bug：根因是全局 `scroll-behavior: smooth` 把路由切换后的回顶放大成长距离滚动动画。`ScrollToTop` 改为 `useLayoutEffect` + `behavior: "instant"` 瞬时回顶，并设置 `history.scrollRestoration = "manual"`。
3. 打卡页头部改用功能型文案「每日一分钟，记录你的身体数据」，与首页营销入口区做视觉区分，消除"点了没反应"的错觉。

## 邮箱换绑（三连修）

1. `upgradeToPermanentAccount` 错误分类：`email_exists` → 「该邮箱已被其他账号占用，无法直接换绑…」；其他失败输出脱敏诊断日志（status/code/emailDomain/message，不记录完整邮箱）。
2. 定位"假成功"根因：Supabase **Secure email change（双确认）**下，仅验证新邮箱 `verifyOtp` 不报错但服务端不变更，旧代码无脑广播成功。经业务决策：该产品为匿名升级场景，在 Supabase 后台**关闭 Secure email change**，改为单确认。
3. 严格校验模式：`confirmEmailUpgrade` 在 `verifyOtp` 成功后强制 `auth.getUser()` 核对服务端真实邮箱，不一致（含拿不到用户）即抛「换绑未生效，请重试或联系管理员」，杜绝假成功；清理双确认第二步骤死代码。
4. 实测通过：换绑 cnwine@163.com 一次收码、一次确认即生效，刷新后保持。

## 验证

- Vitest：29 个测试文件，174/174 项通过（今日新增 `auth-upgrade.test.ts` 8 项、账号安全"换绑未生效"UI 场景 1 项）。
- ESLint：通过。
- TypeScript + Vite build：通过。
- 静态路由：`/check-in`、`/user-center`、`/admin/check-in` 生成成功。
- `git diff --check`：通过。
- 浏览器实测：路由切换滚动全程为 0、页脚闪现消除；移动端/桌面端入口均正常。
