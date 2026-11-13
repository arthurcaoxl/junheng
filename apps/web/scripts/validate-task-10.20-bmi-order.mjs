import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(APP_ROOT, "../..");
const phaseArg = process.argv.find((argument) => argument.startsWith("--phase="));
const phase = phaseArg?.slice("--phase=".length) ?? "after";
assert(["before", "after", "postcommit"].includes(phase), "--phase 仅支持 before、after、postcommit。");
const evidenceDir = process.env.TASK_10_20_BMI_EVIDENCE_DIR;
assert(evidenceDir, "需要 TASK_10_20_BMI_EVIDENCE_DIR，且证据目录必须位于仓库外。 ");
const resolvedEvidence = path.resolve(evidenceDir);
assert(!resolvedEvidence.startsWith(`${REPO_ROOT}${path.sep}`), "证据目录必须在仓库外。 ");
const port = Number(process.env.TASK_10_20_BMI_PORT ?? 53120);
const frontendUrl = `http://127.0.0.1:${port}`;
const storageKey = "junheng-checkin-v3";
const expectedOrder = phase === "before"
  ? ["当前 BMI", "初始 BMI", "BMI 变化"]
  : ["初始 BMI", "当前 BMI", "BMI 变化"];
const expectedInfoCardIndex = phase === "before" ? 0 : 1;
const fixture = {
  schema: 3,
  userCode: "JH-BMI01",
  startDate: "2026-11-01",
  heightCm: "175",
  records: {
    "2026-11-01": { weight: "70", waist: "", meals: [false, false, false], water: false, movement: false, sleep: false },
    "2026-11-02": { weight: "68", waist: "", meals: [false, false, false], water: false, movement: false, sleep: false },
  },
};
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];

await mkdir(resolvedEvidence, { recursive: true });

async function saveJson(filename, value) {
  await writeFile(path.join(resolvedEvidence, filename), `${JSON.stringify(value, null, 2)}\n`);
}

async function captureViewport(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(({ key, state }) => {
    window.localStorage.setItem(key, JSON.stringify(state));
  }, { key: storageKey, state: fixture });
  const page = await context.newPage();
  const requests = [];
  const pageErrors = [];
  page.on("request", (request) => {
    requests.push({ method: request.method(), url: request.url() });
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto(`${frontendUrl}/user-center`, { waitUntil: "domcontentloaded" });
    const summaryCards = page.locator(".bmi-summary-cards");
    await summaryCards.waitFor({ state: "visible" });
    await summaryCards.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    const dom = await summaryCards.evaluate((container) => {
      const articles = Array.from(container.querySelectorAll("article"));
      const labels = articles.map((article) => article.querySelector(":scope > span")?.childNodes[0]?.textContent?.trim());
      const values = Object.fromEntries(["bmi-initial", "bmi-current", "bmi-change"].map((testId) => [
        testId,
        container.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim(),
      ]));
      const infoCardIndex = articles.findIndex((article) => article.querySelector('button[aria-label="BMI 适用性说明"]'));
      const rects = articles.map((article) => {
        const rect = article.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
      });
      return {
        labels,
        values,
        infoCardIndex,
        rects,
        viewportWidth: window.innerWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
      };
    });

    assert.deepEqual(dom.labels, expectedOrder);
    assert.deepEqual(dom.values, { "bmi-initial": "22.9", "bmi-current": "22.2", "bmi-change": "-0.7" });
    assert.equal(dom.infoCardIndex, expectedInfoCardIndex);
    assert.equal(dom.rects.length, 3);
    assert(dom.documentScrollWidth <= viewport.width, `页面横向溢出：${dom.documentScrollWidth} > ${viewport.width}`);
    for (const rect of dom.rects) {
      assert(rect.x >= -1 && rect.right <= viewport.width + 1, `卡片超出视口：${JSON.stringify(rect)}`);
      assert(rect.width > 0 && rect.height > 0, "卡片没有可见尺寸。 ");
    }
    for (let left = 0; left < dom.rects.length; left += 1) {
      for (let right = left + 1; right < dom.rects.length; right += 1) {
        const a = dom.rects[left];
        const b = dom.rects[right];
        const overlapWidth = Math.min(a.right, b.right) - Math.max(a.x, b.x);
        const overlapHeight = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
        assert(overlapWidth <= 1 || overlapHeight <= 1, `卡片 ${left + 1} 与 ${right + 1} 遮挡。`);
      }
    }

    const infoButton = summaryCards.locator("article").nth(expectedInfoCardIndex).getByRole("button", { name: "BMI 适用性说明" });
    await infoButton.click();
    const dialog = page.getByRole("dialog", { name: "BMI 适用性说明" });
    await dialog.waitFor({ state: "visible" });
    assert.match(await dialog.innerText(), /肌肉/);
    await dialog.getByRole("button", { name: "我知道了" }).click();
    await dialog.waitFor({ state: "hidden" });

    const businessRequests = requests.filter((request) => request.url.includes("/rest/v1/"));
    const businessWrites = businessRequests.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method));
    assert.deepEqual(businessRequests, [], "本地 fixture 验证不应产生业务 RPC。 ");
    assert.deepEqual(businessWrites, [], "本地 fixture 验证不应产生业务写入。 ");
    assert.deepEqual(pageErrors, []);

    const name = `${phase}-${viewport.name}`;
    const screenshot = `${name}.png`;
    await page.screenshot({ path: path.join(resolvedEvidence, screenshot), fullPage: true });
    const trackerText = await page.getByRole("region", { name: "BMI 动态追踪" }).innerText();
    await writeFile(path.join(resolvedEvidence, `${name}.txt`), [
      `PHASE: ${phase}`,
      `URL: ${page.url()}`,
      `VIEWPORT: ${viewport.width} x ${viewport.height}`,
      `SCREENSHOT: ${screenshot}`,
      `DOM ORDER: ${dom.labels.join(" / ")}`,
      `VALUES: 初始 ${dom.values["bmi-initial"]}；当前 ${dom.values["bmi-current"]}；变化 ${dom.values["bmi-change"]}`,
      `INFO BUTTON ARTICLE: ${dom.infoCardIndex + 1}`,
      "INFO DIALOG: 已实际点击打开，包含“肌肉”说明，并已关闭。",
      `HORIZONTAL OVERFLOW: ${dom.documentScrollWidth > viewport.width}`,
      "CARD OVERLAP: false",
      `BUSINESS REST REQUESTS: ${businessRequests.length}`,
      `BUSINESS WRITE REQUESTS: ${businessWrites.length}`,
      `PAGE ERRORS: ${pageErrors.length}`,
      "",
      "BMI TRACKER VISIBLE TEXT:",
      trackerText,
      "",
    ].join("\n"));

    return {
      name: viewport.name,
      viewport: { width: viewport.width, height: viewport.height },
      url: page.url(),
      screenshot,
      transcript: `${name}.txt`,
      order: dom.labels,
      values: dom.values,
      infoButtonArticle: dom.infoCardIndex + 1,
      infoDialogOpenedAndClosed: true,
      cardRects: dom.rects,
      horizontalOverflow: false,
      cardOverlap: false,
      businessRestRequests: businessRequests,
      businessWriteRequests: businessWrites,
      pageErrors,
    };
  } finally {
    await context.close();
  }
}

let vite;
let browser;
const viteLog = createWriteStream(path.join(resolvedEvidence, `${phase}-vite.log`));
try {
  vite = spawn(process.execPath, [
    "node_modules/vite/bin/vite.js",
    "--host", "127.0.0.1",
    "--port", String(port),
    "--strictPort",
  ], {
    cwd: APP_ROOT,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  vite.stdout.pipe(viteLog);
  vite.stderr.pipe(viteLog);
  let viteExit = null;
  vite.on("exit", (code, signal) => { viteExit = { code, signal }; });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (viteExit) throw new Error(`Vite 提前退出：${JSON.stringify(viteExit)}`);
    try {
      const response = await fetch(`${frontendUrl}/user-center`);
      if (response.ok) { ready = true; break; }
    } catch { /* 等待 Vite 监听。 */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert(ready, "Vite 未就绪。 ");

  browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of viewports) results.push(await captureViewport(browser, viewport));
  await browser.close();
  browser = null;

  const summary = {
    result: "PASS",
    phase,
    executedAt: new Date().toISOString(),
    frontend: `${frontendUrl}/user-center`,
    chromium: "real Playwright Chromium",
    fixture,
    expectedOrder,
    results,
    businessRpc: "不适用：纯 localStorage fixture，未 mock 网络，未产生 /rest/v1/ 请求。",
    productionDeployment: "不适用",
    databasePersistence: "不适用：未执行任何业务写入或落库。",
  };
  await saveJson(`${phase}-summary.json`, summary);
  if (phase === "postcommit") {
    const before = JSON.parse(await readFile(path.join(resolvedEvidence, "before-summary.json"), "utf8"));
    const after = JSON.parse(await readFile(path.join(resolvedEvidence, "after-summary.json"), "utf8"));
    await saveJson("summary.json", { result: "PASS", before, after, postcommit: summary });
  } else {
    await saveJson("summary.json", summary);
  }
  console.log(JSON.stringify({ result: "PASS", phase, viewports: results.map((result) => ({ name: result.name, order: result.order, values: result.values })) }, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (vite && vite.exitCode === null && vite.signalCode === null) {
    try { process.kill(-vite.pid, "SIGTERM"); } catch { /* 进程组已退出。 */ }
    await Promise.race([
      new Promise((resolve) => vite.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (vite.exitCode === null && vite.signalCode === null) {
      try { process.kill(-vite.pid, "SIGKILL"); } catch { /* 进程组已退出。 */ }
    }
  }
  let portClosed = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await fetch(frontendUrl);
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch {
      portClosed = true;
      break;
    }
  }
  viteLog.end();
  assert(portClosed, `Vite 端口 ${port} 仍在监听。`);
}
