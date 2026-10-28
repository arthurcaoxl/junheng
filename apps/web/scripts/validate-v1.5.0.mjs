import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import process from "node:process";
import { chromium } from "playwright";

const port = 4173;
const origin = `http://127.0.0.1:${port}`;
const projectRoot = new URL("..", import.meta.url).pathname;
const output = new URL("../validation-v1.5.0/", import.meta.url).pathname;
const viteBin = new URL("../node_modules/vite/bin/vite.js", import.meta.url).pathname;
const server = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (c) => { serverLog += c.toString(); });
server.stderr.on("data", (c) => { serverLog += c.toString(); });

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(origin); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server not ready\n" + serverLog);
}

const browser = await chromium.launch({ channel: "chrome" });
try {
  await waitForServer();
  await mkdir(output, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const targets = [
    ["metabolism-signals", "signals"],
    ["body-standards", "standards"],
    ["research", "research"],
    ["knowledge", "knowledge"],
  ];
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  for (const [anchor, name] of targets) {
    await page.evaluate((a) => { const el = document.getElementById(a); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 60, behavior: "instant" }); }, anchor);
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${output}${name}.png` });
    console.log("shot", name);
  }
  // 移动端抽查
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.evaluate(() => { const el = document.getElementById("research"); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 60, behavior: "instant" }); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${output}research-mobile.png` });
  console.log("shot research-mobile");
  console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no console errors");
} finally {
  await browser.close();
  server.kill();
}
