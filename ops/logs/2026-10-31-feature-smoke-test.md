# 功能分支线上烟测记录

- 日期：2026-10-31
- 类型：临时线上烟测，不是正式发版
- 分支：`feature/content-trust-user-center`
- 代码提交：`b8efa30338a889b50cf9d79271f9d9af79bf17c6`
- 网站 ID：`1a170fd8-b362-873e-8000-0000c5bec604`
- 线上地址：https://rtrzqrxly4mlo.ok.kimi.link

## 发布前验证

- 干净安装：`npm ci` 成功。
- ESLint：通过，无告警。
- Vitest：28 个测试文件，164/164 项通过。
- TypeScript + Vite build：成功。
- 静态路由：`/check-in`、`/user-center`、`/admin/check-in` 均生成。
- 静态包：`kimix website validate static junheng-smoke-test.zip` 通过。
- Git 状态：工作区干净，分支与远程同步。

## 临时发布

- Published Version：`1a192737-c8a2-8f75-8000-00001ab77b78`
- 描述：`Temporary smoke test: feature/content-trust-user-center b8efa30 (2026-10-31)`
- 发布状态：`publish_state=2`
- 覆盖版本：v1.9.0 的线上版本 `1a18d244-a2e2-8aef-8000-00001ca6ce6f`

## 线上烟测结果

- `GET /` → 200
- `GET /check-in/index.html` → 200
- `GET /user-center/index.html` → 200
- `GET /admin/check-in/index.html` → 200
- 线上 JS 资源：`index-Dw06ZBjH.js`
- 线上 JS SHA-256：`8167f0f7b9060e1594a09395f539aafac355e335672e6ecc0cfc1902f95b27f5`
- 本地构建产物 SHA-256：`8167f0f7b9060e1594a09395f539aafac355e335672e6ecc0cfc1902f95b27f5`
- 线上与本地构建 JS 逐字节一致。

## 验证边界

- 本地自动化已覆盖打卡表单、多节点体重算法、登录拦截、用户中心、趋势图、海报、CSV、结业证书、后台统计和 Supabase 同步 Mock。
- 线上产物与已测试构建产物逐字节一致。
- 真实邮箱 OTP 收发、绑定升级及云端同步未由代理代替用户完成；需在人工真实设备流程中复验。
- 本次未合并 `main`，未 bump 版本，未创建 Git 标签，也未进行正式发版。

## 后续动作

- 人工确认线上烟测结果。
- 烟测通过后，从 `main` 完成正式合并、版本 v1.10.0、标签、发布和线上验证。
