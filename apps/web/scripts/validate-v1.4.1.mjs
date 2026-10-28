import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import process from "node:process";
import { chromium } from "playwright";

const port = 4173;
const origin = `http://127.0.0.1:${port}`;
const projectRoot = new URL("..", import.meta.url).pathname;
const output = new URL("../validation-v1.4.1/", import.meta.url).pathname;
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

async function validateViewport(browser, name, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce", acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  for (const id of ["perspective", "difference", "plate-guide", "scene-guide", "movement", "research", "check-in"]) {
    await page.locator(`#${id}`).waitFor({ state: "visible" });
  }
  await page.locator("#perspective-title").filter({ hasText: "吃对了，营养打底" }).waitFor();
  await page.locator("#movement-title").filter({ hasText: "配合运动更高效" }).waitFor();
  await page.getByRole("heading", { name: "21 天，看见自己的节奏。" }).waitFor();
  await page.getByRole("heading", { name: "水分是体重波动的关键" }).waitFor();
  await page.getByRole("heading", { name: "一天 24 小时：体重的“真实时间轴”" }).waitFor();
  await page.getByRole("heading", { name: "碳水与盐分" }).waitFor();
  await page.getByText("网站版本 v1.4.1").waitFor();
  const sectionOrder = await page.locator("main > section").evaluateAll((sections) => sections.map((section) => section.id).slice(-3));
  if (sectionOrder.join(",") !== "movement,research,check-in") throw new Error(`${name} section order failed: ${sectionOrder.join(",")}`);
  if (await page.locator(".day-tabs [role=tab]").count() !== 21) throw new Error(`${name} day tab count failed`);
  const overflow = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (overflow.scrollWidth > overflow.width + 1) throw new Error(`${name} horizontal overflow: ${JSON.stringify(overflow)}`);

  await page.getByText("点按餐盘分区，查看食物示例").waitFor();
  const plateFrame = await page.locator(".plate-frame").evaluate((element) => {
    const style = getComputedStyle(element, "::after");
    return {
      content: style.content,
      position: style.position,
      top: style.top,
      right: style.right,
      bottom: style.bottom,
      left: style.left,
      radius: style.borderRadius,
      pointerEvents: style.pointerEvents,
    };
  });
  if (plateFrame.content === "none" || plateFrame.position !== "absolute" || plateFrame.top !== "-7px" || plateFrame.radius !== "50%" || plateFrame.pointerEvents !== "none") {
    throw new Error(`${name} external plate ring failed: ${JSON.stringify(plateFrame)}`);
  }
  const plateClip = await page.locator(".plate-visual").evaluate((element) => {
    const style = getComputedStyle(element);
    return { overflow: style.overflow, padding: style.padding, radius: style.borderRadius, clipPath: style.clipPath };
  });
  if (plateClip.overflow !== "hidden" || plateClip.padding !== "0px" || plateClip.radius !== "50%" || plateClip.clipPath === "none") throw new Error(`${name} plate clipping incomplete: ${JSON.stringify(plateClip)}`);
  for (let index = 0; index < 3; index += 1) {
    await page.locator(`#plate-tab-${index}`).click();
    if (await page.locator(`#plate-tab-${index}`).getAttribute("aria-selected") !== "true") throw new Error(`${name} plate tab ${index + 1} failed`);
    await page.locator(`#plate-tab-${index}`).filter({ hasText: "正在查看" }).waitFor();
  }
  await page.getByText("糙米、燕麦、杂粮、薯类等，也可以搭配适量米面。").waitFor();
  await page.locator("#plate-guide").screenshot({ path: `${output}/${name}-plate.png` });
  await page.locator("#scene-tab-1").click();
  await page.getByText("优先鸡蛋、牛奶、无糖豆浆，搭配一份蔬菜或番茄").waitFor();

  await page.getByLabel("姓名或网名").fill("小菌");
  for (const day of [1, 2, 3, 4, 5, 6, 7, 21]) {
    await page.getByRole("tab", { name: new RegExp(`第 ${day} 天`) }).click();
    await page.locator(".body-metrics input").nth(0).fill(String(65.4 - (day - 1) * 0.03));
    await page.locator(".body-metrics input").nth(1).fill(String(82 - (day - 1) * 0.05));
  }
  await page.getByLabel("早餐前已饮用").check();
  await page.reload({ waitUntil: "networkidle" });
  if (await page.getByLabel("姓名或网名").inputValue() !== "小菌") throw new Error(`${name} name persistence failed`);
  if (await page.getByRole("img", { name: "体重趋势图" }).count() !== 1) throw new Error(`${name} weight trend persistence failed`);
  if (await page.getByRole("img", { name: "腰围趋势图" }).count() !== 1) throw new Error(`${name} waist trend persistence failed`);
  await page.getByRole("tab", { name: /第 21 天/ }).click();
  if (!(await page.getByLabel("早餐前已饮用").isChecked())) throw new Error(`${name} meal persistence failed`);
  const trendLayout = await page.locator(".trend-grid-stacked").evaluate((grid) => {
    const cards = [...grid.querySelectorAll(".trend-card")].map((card) => {
      const rect = card.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width };
    });
    const charts = [...grid.querySelectorAll("svg.trend-chart")].map((chart) => chart.getAttribute("viewBox"));
    const axes = [...grid.querySelectorAll("svg.trend-chart")].map((chart) => [...chart.querySelectorAll(".trend-day")].map((day) => day.textContent));
    return { columns: getComputedStyle(grid).gridTemplateColumns, cards, charts, axes };
  });
  if (trendLayout.cards.length !== 2 || trendLayout.cards[1].top <= trendLayout.cards[0].bottom) throw new Error(`${name} trends are not stacked: ${JSON.stringify(trendLayout)}`);
  if (trendLayout.charts.some((viewBox) => viewBox !== "0 0 1000 290")) throw new Error(`${name} chart viewBox failed`);
  if (trendLayout.axes.some((axis) => axis.join(",") !== "D1,D5,D10,D15,D21")) throw new Error(`${name} chart axis failed`);
  let trendScroll = "not required";
  if (name === "mobile") {
    const scrollers = page.locator(".trend-chart-scroll");
    for (let index = 0; index < 2; index += 1) {
      const dimensions = await scrollers.nth(index).evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
      if (dimensions.scrollWidth <= dimensions.clientWidth) throw new Error(`${name} trend ${index + 1} is not independently scrollable`);
      await scrollers.nth(index).evaluate((element) => { element.scrollLeft = 120; });
      if (await scrollers.nth(index).evaluate((element) => element.scrollLeft) <= 0) throw new Error(`${name} trend ${index + 1} cannot scroll`);
      await scrollers.nth(index).evaluate((element) => { element.scrollLeft = 0; });
    }
    trendScroll = "two charts passed";
  }
  await page.locator(".record-trends").screenshot({ path: `${output}/${name}-trends.png` });

  await page.getByRole("button", { name: "导出记录海报" }).click();
  const poster = page.getByRole("img", { name: "21 天健康记录海报预览" });
  await poster.waitFor();
  const posterWidth = await poster.evaluate((image) => image.naturalWidth);
  const posterHeight = await poster.evaluate((image) => image.naturalHeight);
  if (posterWidth !== 1080 || posterHeight !== 1920) throw new Error(`${name} poster generation failed: ${posterWidth}×${posterHeight}`);
  const downloadLink = page.getByRole("link", { name: "下载 PNG 海报" });
  if (await downloadLink.getAttribute("download") !== "菌衡有道-21天健康记录.png") throw new Error(`${name} poster download missing`);
  const downloadEvent = page.waitForEvent("download");
  await downloadLink.click();
  const download = await downloadEvent;
  if (download.suggestedFilename() !== "菌衡有道-21天健康记录.png") throw new Error(`${name} poster filename failed: ${download.suggestedFilename()}`);
  const downloadPath = `${output}/${name}-21-day-record.png`;
  await download.saveAs(downloadPath);
  const png = await readFile(downloadPath);
  if (png.subarray(1, 4).toString() !== "PNG" || png.readUInt32BE(16) !== 1080 || png.readUInt32BE(20) !== 1920) throw new Error(`${name} downloaded PNG dimensions failed`);
  await page.locator("#difference").screenshot({ path: `${output}/${name}-difference.png` });
  await page.locator(".water-fluctuation").screenshot({ path: `${output}/${name}-water-science.png` });
  await page.locator(".poster-export").screenshot({ path: `${output}/${name}-poster.png` });
  const finalOverflow = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (finalOverflow.scrollWidth > finalOverflow.width + 1) throw new Error(`${name} poster horizontal overflow: ${JSON.stringify(finalOverflow)}`);

  await page.evaluate(() => {
    const oldDay = { weight: "65.4", waist: "82", meals: [true, false, false], water: true, movement: false, sleep: true };
    window.localStorage.removeItem("junheng-checkin-v2");
    window.localStorage.setItem("junheng-seven-day-checkin-v1", JSON.stringify(Array.from({ length: 7 }, () => oldDay)));
  });
  await page.reload({ waitUntil: "networkidle" });
  const migrated = await page.evaluate(() => JSON.parse(window.localStorage.getItem("junheng-checkin-v2") ?? "[]"));
  if (migrated.length !== 21 || migrated[0]?.weight !== "65.4" || migrated[6]?.waist !== "82") throw new Error(`${name} legacy migration failed`);
  if (errors.length) throw new Error(`${name} browser errors:\n${errors.join("\n")}`);
  await context.close();
  return { name, viewport, overflow, sectionOrder, dayTabs: 21, plateFrame, plateTabs: 3, trends: "stacked", trendScroll, migration: "passed", posterWidth, posterHeight, download: "passed", errors: 0 };
}

let browser;
try {
  await mkdir(output, { recursive: true });
  await waitForServer();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const results = [];
  results.push(await validateViewport(browser, "desktop", { width: 1440, height: 1000 }));
  results.push(await validateViewport(browser, "mobile", { width: 390, height: 844 }));
  console.log(JSON.stringify({ status: "passed", version: "1.4.1", results }, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
