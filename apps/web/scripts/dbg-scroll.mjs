import { spawn } from "node:child_process";
import process from "node:process";
import { chromium } from "playwright";
const port = 4174;
const origin = `http://127.0.0.1:${port}`;
const projectRoot = "/Users/mac/Documents/kimi/tasks/2026-10-24/18-57-01-664717ae/junheng-brand";
const viteBin = `${projectRoot}/node_modules/vite/bin/vite.js`;
const server = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: projectRoot, stdio: "ignore" });
const browser = await chromium.launch({ channel: "chrome" });
try {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(origin); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => {
    const el = document.getElementById("metabolism-signals");
    if (!el) return { found: false, ids: Array.from(document.querySelectorAll("section[id]")).map(s => s.id) };
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top - 60, behavior: "instant" });
    return { found: true, target: top, scrollY: window.scrollY, bodyH: document.body.scrollHeight };
  });
  console.log(JSON.stringify(info));
  await page.waitForTimeout(600);
  console.log("after wait scrollY =", await page.evaluate(() => window.scrollY));
  await page.screenshot({ path: "/tmp/dbg-signals.png" });
} finally { await browser.close(); server.kill(); }
