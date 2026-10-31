import { copyFileSync, mkdirSync } from "node:fs";

// 静态托管平台没有 SPA fallback：为每个公开深链复制入口 HTML。
const routes = ["check-in", "user-center", "admin/check-in"];

for (const route of routes) {
  const directory = `dist/${route}`;
  mkdirSync(directory, { recursive: true });
  copyFileSync("dist/index.html", `${directory}/index.html`);
  console.log(`static route ready: /${route}/index.html`);
}
