# junheng 域名切换与发布记录

- 日期：2026-11-01
- 网站 ID：`1a170fd8-b362-873e-8000-0000c5bec604`
- 发布版本 ID：`1a193305-5ba2-82c3-8000-0000dad3b0b3`
- 新线上地址：`https://junheng.ok.kimi.link`
- 原线上地址：`https://rtrzqrxly4mlo.ok.kimi.link`
- 域名代码提交：`ae3c21c chore: 切换线上域名至 junheng.ok.kimi.link`
- UI 代码提交：`bd117d1 feat: 优化同步路径与健康 ID 文案`

## 发布前检查

- 全库未发现 `vercel.json`、`netlify.toml`、`kimi.json` 等托管平台域名配置文件。
- 当前 `main` 工作区完成 188 项 Vitest 测试、ESLint 和生产构建，全部通过。
- 发布内容仅取 `apps/web/dist`，重新打包为 ZIP 后通过 `kimix website validate static` 本地校验。
- 构建入口引用 `assets/index-Dvb1yCrc.js` 与 `assets/index-Bzf7CI1y.css`。

## 发布与域名绑定

1. 使用 `kimix website publish ... static ... --slug junheng --wait --json` 发布成功，取得上述发布版本 ID；返回的 `effective_slug` 仍暂时为旧值。
2. 随后使用 `kimix website slug 1a170fd8-b362-873e-8000-0000c5bec604 --slug junheng --json` 显式切换域名。
3. 平台返回 `custom_slug: junheng`、`effective_slug: junheng`、`display_url: https://junheng.ok.kimi.link`。
4. 再次查询网站状态，确认发布版本 ID 与新域名均已生效。

## 线上验收

以下地址均返回 HTTP 200：

- `https://junheng.ok.kimi.link/`
- `https://junheng.ok.kimi.link/images/wechat-share.jpg`
- `https://junheng.ok.kimi.link/check-in/index.html`
- `https://junheng.ok.kimi.link/user-center/index.html`
- `https://junheng.ok.kimi.link/admin/check-in/index.html`
- `https://junheng.ok.kimi.link/h5/index.html`

线上主页与 H5 的 `og:url`、`og:image`、`canonical` 均已指向新域名；主页资源哈希与本地已验证构建一致。

旧域名首页及 `/check-in/index.html` 仍返回 HTTP 200，过渡期老用户仍可回到旧地址处理本机数据绑定与备份。由于 `localStorage` 和 Supabase SDK 会话按 origin 隔离，新域名不会自动继承旧域名的本机数据或登录状态。

本次 CLI 操作只完成网站发布与平台 slug 绑定，未修改 Supabase Auth 的 Site URL 或 Redirect URLs。
