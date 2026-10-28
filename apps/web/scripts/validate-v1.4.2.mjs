import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";
import { chromium } from "playwright";

const port = 4173;
const origin = `http://127.0.0.1:${port}`;
const projectRoot = new URL("..", import.meta.url).pathname;
const output = new URL("../validation-v1.4.2/", import.meta.url).pathname;
const viteBin = new URL("../node_modules/vite/bin/vite.js", import.meta.url).pathname;
const server = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: projectRoot,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch { /* Vite is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Development server did not start.\n${serverLog}`);
}

async function validate(browser, name, path, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${origin}${path}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const primary = page.locator(".hero h1 .hero-title-primary");
  const secondary = page.locator(".hero h1 span").nth(1);
  if (await primary.textContent() !== "餐前伴侣助力脂代谢") throw new Error(`${name}: primary headline mismatch`);
  if (await secondary.textContent() !== "健康体重管理") throw new Error(`${name}: secondary headline mismatch`);
  const subtitle = page.locator(path === "/" ? ".hero-subtitle" : ".hero .subtitle");
  if (!(await subtitle.textContent()).includes("23种菌菇精华")) throw new Error(`${name}: formula subtitle missing`);
  if (!(await subtitle.textContent()).includes("优质蛋白")) throw new Error(`${name}: protein subtitle missing`);
  if (!(await subtitle.textContent()).includes("复合维生素")) throw new Error(`${name}: vitamin subtitle missing`);

  const layout = await page.locator(".hero h1").evaluate((heading) => {
    const hero = heading.closest(".hero").getBoundingClientRect();
    const lines = [...heading.querySelectorAll("span")].map((line) => {
      const rect = line.getBoundingClientRect();
      return { text: line.textContent, left: rect.left, right: rect.right, width: rect.width, height: rect.height, fontSize: getComputedStyle(line).fontSize };
    });
    return {
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      hero: { left: hero.left, right: hero.right },
      lines,
    };
  });
  if (layout.scrollWidth > layout.viewportWidth + 1) throw new Error(`${name}: horizontal overflow ${JSON.stringify(layout)}`);
  for (const line of layout.lines) {
    if (line.left < layout.hero.left - 1 || line.right > layout.hero.right + 1) throw new Error(`${name}: headline outside hero ${JSON.stringify(layout)}`);
  }
  if (layout.lines[1].height <= 0 || layout.lines[0].height <= 0) throw new Error(`${name}: headline not rendered`);
  if (path === "/") await page.getByText("网站版本 v1.4.2").waitFor();
  await page.locator(".hero").screenshot({ path: `${output}/${name}-hero.png` });
  if (errors.length) throw new Error(`${name}: browser errors\n${errors.join("\n")}`);
  await context.close();
  return { name, path, viewport, layout, errors: 0 };
}

let browser;
try {
  await mkdir(output, { recursive: true });
  await waitForServer();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const results = [];
  results.push(await validate(browser, "desktop", "/", { width: 1440, height: 1000 }));
  results.push(await validate(browser, "mobile-390", "/", { width: 390, height: 844 }));
  results.push(await validate(browser, "mobile-320", "/", { width: 320, height: 720 }));
  results.push(await validate(browser, "h5-390", "/h5/index.html", { width: 390, height: 844 }));
  results.push(await validate(browser, "h5-320", "/h5/index.html", { width: 320, height: 720 }));
  const report = { status: "passed", version: "1.4.2", results };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
