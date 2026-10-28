import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url).pathname;
const output = `${root}wechat-preview`;
const port = 7101;
const base = `http://127.0.0.1:${port}`;
let server;
let browser;

async function waitForServer(url, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("Preview server did not become ready");
}

async function checkDevice(name, viewport, userAgent) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator("#hero-title").waitFor();
  const initial = await page.evaluate(() => ({
    title: document.title,
    heroTitle: document.querySelector("#hero-title")?.textContent,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    bootRemaining: Boolean(document.querySelector(".boot-screen")),
    viewport: document.querySelector('meta[name="viewport"]')?.getAttribute("content"),
    shareImage: document.querySelector('meta[property="og:image"]')?.getAttribute("content"),
    expertSerials: document.querySelectorAll(".expert-order").length,
  }));
  await page.screenshot({ path: `${output}/${name}-home.png` });
  await page.getByRole("button", { name: "打开导航" }).click();
  await page.locator("#mobile-navigation").waitFor({ state: "visible" });
  await page.screenshot({ path: `${output}/${name}-menu.png` });
  await page.locator('#mobile-navigation a[href="#metrics"]').click();
  await page.waitForURL(/#metrics$/);
  const menuClosed = await page.locator("#mobile-navigation").isHidden();
  const shareResponse = await context.request.get(`${base}/images/wechat-share.jpg`);
  const share = {
    ok: shareResponse.ok(),
    contentType: shareResponse.headers()["content-type"],
    bytes: (await shareResponse.body()).byteLength,
  };
  await context.close();
  return { ...initial, menuClosed, share, errors };
}

async function checkH5(name, viewport, userAgent) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/h5/index.html`, { waitUntil: "networkidle" });
  await page.locator("h1").waitFor();
  await page.screenshot({ path: `${output}/${name}-h5-home.png` });
  if (!await page.locator(".directory summary").count()) {
    console.error(JSON.stringify({ name, url: page.url(), title: await page.title(), h1: await page.locator("h1").allTextContents() }, null, 2));
    throw new Error("H5 directory was not rendered");
  }
  await page.locator(".directory summary").click();
  const directoryOpen = await page.locator(".directory").evaluate((element) => element.open);
  const result = await page.evaluate(() => ({
    title: document.title,
    heroTitle: document.querySelector("h1")?.textContent,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    viewport: document.querySelector('meta[name="viewport"]')?.getAttribute("content"),
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    experts: document.querySelectorAll(".expert").length,
    expertSerials: document.querySelectorAll(".expert-order").length,
    directoryItems: document.querySelectorAll(".directory li").length,
    scripts: document.scripts.length,
  }));
  await page.locator("#formula").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/${name}-h5-formula.png` });
  await context.close();
  return { ...result, directoryOpen, errors };
}

try {
  await mkdir(output, { recursive: true });
  server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
    cwd: `${root}dist`,
    detached: true,
    stdio: "ignore",
  });
  await waitForServer(base);
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const ios = await checkDevice(
    "ios-wechat",
    { width: 390, height: 844 },
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.54 NetType/WIFI Language/zh_CN",
  );
  const android = await checkDevice(
    "android-wechat",
    { width: 360, height: 740 },
    "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.54 NetType/WIFI Language/zh_CN",
  );
  const h5Ios = await checkH5(
    "ios-wechat",
    { width: 390, height: 844 },
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.54 NetType/WIFI Language/zh_CN",
  );
  const h5Android = await checkH5(
    "android-wechat",
    { width: 360, height: 740 },
    "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.54 NetType/WIFI Language/zh_CN",
  );
  const result = { ios, android, h5Ios, h5Android };
  console.log(JSON.stringify(result, null, 2));
  for (const item of [ios, android]) {
    if (item.overflow || item.bootRemaining || !item.menuClosed || !item.share.ok || item.expertSerials || item.errors.length) {
      process.exitCode = 1;
    }
  }
  for (const item of [h5Ios, h5Android]) {
    if (item.overflow || item.experts !== 6 || item.expertSerials || item.directoryItems !== 23 || !item.directoryOpen || item.scripts || !item.canonical?.endsWith("/h5/index.html") || item.errors.length) {
      process.exitCode = 1;
    }
  }
} finally {
  await browser?.close();
  if (server?.pid) {
    try { process.kill(-server.pid, "SIGTERM"); } catch {}
  }
}
