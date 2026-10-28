import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { chromium } from "playwright";

const port = 4173;
const origin = `http://127.0.0.1:${port}`;
const root = new URL("..", import.meta.url).pathname;
const output = new URL("../validation-v1.4.3/", import.meta.url).pathname;
const vite = new URL("../node_modules/vite/bin/vite.js", import.meta.url).pathname;
const server = spawn(process.execPath, [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
server.stdout.on("data", (chunk) => { log += chunk.toString(); });
server.stderr.on("data", (chunk) => { log += chunk.toString(); });

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(origin)).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(log);
}

let browser;
try {
  await mkdir(output, { recursive: true });
  await waitForServer();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", acceptDownloads: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.getByLabel("姓名或网名").fill("小菌");
  await page.getByText("海报署名：小菌").waitFor();
  await page.getByRole("button", { name: "导出记录海报" }).click();
  const preview = page.getByRole("img", { name: "21 天健康记录海报预览" });
  await preview.waitFor();
  const size = await preview.evaluate((image) => ({ width: image.naturalWidth, height: image.naturalHeight }));
  if (size.width !== 1080 || size.height !== 1920) throw new Error(`Poster dimensions failed: ${JSON.stringify(size)}`);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "下载 PNG 海报" }).click();
  const download = await downloadEvent;
  const file = `${output}/named-poster.png`;
  await download.saveAs(file);
  const png = await readFile(file);
  if (png.subarray(1, 4).toString() !== "PNG" || png.readUInt32BE(16) !== 1080 || png.readUInt32BE(20) !== 1920) throw new Error("Downloaded PNG validation failed");
  await page.locator(".record-identity").screenshot({ path: `${output}/name-field.png` });
  await page.locator(".poster-export").screenshot({ path: `${output}/poster-export.png` });
  const overflow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (overflow.scrollWidth > overflow.width + 1) throw new Error(`Horizontal overflow: ${JSON.stringify(overflow)}`);
  if (errors.length) throw new Error(errors.join("\n"));
  const report = { status: "passed", version: "1.4.3", name: "小菌", size, download: "passed", overflow, errors };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
