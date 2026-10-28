import { spawn } from "node:child_process";
import process from "node:process";
import { chromium } from "playwright";
const port = 4175;
const origin = `http://127.0.0.1:${port}`;
const projectRoot = "/Users/mac/Documents/kimi/tasks/2026-10-24/18-57-01-664717ae/junheng-brand";
const server = spawn(process.execPath, [`${projectRoot}/node_modules/vite/bin/vite.js`, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: projectRoot, stdio: "ignore" });
const browser = await chromium.launch({ channel: "chrome" });
try {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(origin); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const el = document.querySelector(".medicinal-band"); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 70, behavior: "instant" }); });
  await page.waitForTimeout(900);
  await page.screenshot({ path: "validation-v1.5.0/medicinal.png" });
  console.log("ok");
} finally { await browser.close(); server.kill(); }
