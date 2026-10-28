import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";

const origin = "https://rtrzqrxly4mlo.ok.kimi.link";
const output = new URL("../cloud-verify-v1.4.1/", import.meta.url).pathname;

async function verify(browser, name, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce", acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.url().startsWith(origin) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#perspective-title").filter({ hasText: "吃对了，营养打底" }).waitFor();
  await page.locator("#difference-title").filter({ hasText: "活性菌物营养" }).waitFor();
  await page.locator("#mechanism-title").filter({ hasText: "代谢营养 × 活性菌物" }).waitFor();
  await page.locator("#movement-title").filter({ hasText: "配合运动更高效" }).waitFor();
  await page.getByRole("heading", { name: "一天 24 小时：体重的“真实时间轴”" }).waitFor();
  await page.getByRole("heading", { name: "碳水与盐分" }).waitFor();
  await page.getByText(/PDCAAS.*满分 1.0/).waitFor();
  await page.getByText("网站版本 v1.4.1").waitFor();
  const sectionOrder = await page.locator("main > section").evaluateAll((sections) => sections.map((section) => section.id).slice(-3));
  if (sectionOrder.join(",") !== "movement,research,check-in") throw new Error(`${name}: wrong section order ${sectionOrder.join(",")}`);
  if (await page.locator(".day-tabs [role=tab]").count() !== 21) throw new Error(`${name}: wrong day tab count`);

  const plateFrame = await page.locator(".plate-frame").evaluate((element) => {
    const style = getComputedStyle(element, "::after");
    return { content: style.content, position: style.position, inset: [style.top, style.right, style.bottom, style.left], radius: style.borderRadius, pointerEvents: style.pointerEvents };
  });
  if (plateFrame.content === "none" || plateFrame.position !== "absolute" || plateFrame.inset.some((value) => value !== "-7px") || plateFrame.radius !== "50%" || plateFrame.pointerEvents !== "none") throw new Error(`${name}: external plate ring ${JSON.stringify(plateFrame)}`);
  const plateClip = await page.locator(".plate-visual").evaluate((element) => {
    const style = getComputedStyle(element);
    return { overflow: style.overflow, padding: style.padding, radius: style.borderRadius, clipPath: style.clipPath };
  });
  if (plateClip.overflow !== "hidden" || plateClip.padding !== "0px" || plateClip.radius !== "50%" || plateClip.clipPath === "none") throw new Error(`${name}: plate clipping ${JSON.stringify(plateClip)}`);
  for (let index = 0; index < 3; index += 1) {
    await page.locator(`#plate-tab-${index}`).click();
    if (await page.locator(`#plate-tab-${index}`).getAttribute("aria-selected") !== "true") throw new Error(`${name}: plate tab ${index + 1} failed`);
    await page.locator(`#plate-tab-${index}`).filter({ hasText: "正在查看" }).waitFor();
  }
  await page.locator("#plate-guide").screenshot({ path: `${output}/${name}-plate.png` });

  await page.getByLabel("姓名或网名").fill("小菌");
  for (const day of [1, 2, 3, 4, 5, 6, 7, 21]) {
    await page.getByRole("tab", { name: new RegExp(`第 ${day} 天`) }).click();
    await page.locator(".body-metrics input").nth(0).fill((65.4 - (day - 1) * 0.03).toFixed(2));
    await page.locator(".body-metrics input").nth(1).fill((82 - (day - 1) * 0.05).toFixed(2));
  }
  await page.getByLabel("早餐前已饮用").check();
  await page.reload({ waitUntil: "networkidle" });
  if (await page.getByLabel("姓名或网名").inputValue() !== "小菌") throw new Error(`${name}: name not restored`);
  await page.getByRole("tab", { name: /第 21 天/ }).click();
  if (!(await page.getByLabel("早餐前已饮用").isChecked())) throw new Error(`${name}: meal record not restored`);
  const trendLayout = await page.locator(".trend-grid-stacked").evaluate((grid) => {
    const cards = [...grid.querySelectorAll(".trend-card")].map((card) => {
      const rect = card.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
    const charts = [...grid.querySelectorAll("svg.trend-chart")].map((chart) => chart.getAttribute("viewBox"));
    const values = [...grid.querySelectorAll(".trend-value")].map((label) => label.textContent);
    return { cards, charts, values };
  });
  if (trendLayout.cards.length !== 2 || trendLayout.cards[1].top <= trendLayout.cards[0].bottom) throw new Error(`${name}: trends not stacked`);
  if (trendLayout.charts.some((viewBox) => viewBox !== "0 0 1000 290")) throw new Error(`${name}: chart viewBox failed`);
  if (trendLayout.values.some((value) => /\d\.\d{3,}/.test(value ?? ""))) throw new Error(`${name}: excessive decimal precision`);
  let trendScroll = "not required";
  if (name === "mobile") {
    const scrollers = page.locator(".trend-chart-scroll");
    for (let index = 0; index < 2; index += 1) {
      const dimensions = await scrollers.nth(index).evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
      if (dimensions.scrollWidth <= dimensions.clientWidth) throw new Error(`${name}: trend ${index + 1} not scrollable`);
      await scrollers.nth(index).evaluate((element) => { element.scrollLeft = 120; });
      if (await scrollers.nth(index).evaluate((element) => element.scrollLeft) <= 0) throw new Error(`${name}: trend ${index + 1} cannot scroll`);
    }
    trendScroll = "two charts passed";
  }
  await page.locator(".record-trends").screenshot({ path: `${output}/${name}-trends.png` });

  await page.getByRole("button", { name: "导出记录海报" }).click();
  const poster = page.getByRole("img", { name: "21 天健康记录海报预览" });
  await poster.waitFor();
  const posterSize = await poster.evaluate((image) => ({ width: image.naturalWidth, height: image.naturalHeight }));
  if (posterSize.width !== 1080 || posterSize.height !== 1920) throw new Error(`${name}: invalid poster ${JSON.stringify(posterSize)}`);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "下载 PNG 海报" }).click();
  const download = await downloadPromise;
  if (download.suggestedFilename() !== "菌衡有道-21天健康记录.png") throw new Error(`${name}: wrong download name`);
  const downloadPath = `${output}/${name}-21-day-record.png`;
  await download.saveAs(downloadPath);
  const png = await readFile(downloadPath);
  if (png.subarray(1, 4).toString() !== "PNG" || png.readUInt32BE(16) !== 1080 || png.readUInt32BE(20) !== 1920) throw new Error(`${name}: invalid downloaded PNG`);
  const overflow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (overflow.scrollWidth > overflow.width + 1) throw new Error(`${name}: overflow ${JSON.stringify(overflow)}`);

  await page.evaluate(() => {
    const oldDay = { weight: "65.4", waist: "82", meals: [true, false, false], water: true, movement: false, sleep: true };
    window.localStorage.removeItem("junheng-checkin-v2");
    window.localStorage.setItem("junheng-seven-day-checkin-v1", JSON.stringify(Array.from({ length: 7 }, () => oldDay)));
  });
  await page.reload({ waitUntil: "networkidle" });
  const migrated = await page.evaluate(() => JSON.parse(window.localStorage.getItem("junheng-checkin-v2") ?? "[]"));
  if (migrated.length !== 21 || migrated[0]?.weight !== "65.4" || migrated[6]?.waist !== "82") throw new Error(`${name}: legacy migration failed`);
  if (errors.length) throw new Error(`${name}: ${errors.join("\n")}`);
  await context.close();
  return { name, version: "1.4.1", sectionOrder, dayTabs: 21, recordName: "restored", plateFrame, plateTabs: 3, trends: "stacked", trendScroll, migration: "passed", poster: "1080×1920 PNG", download: "downloaded", overflow, errors: 0 };
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const results = [
    await verify(browser, "desktop", { width: 1440, height: 1000 }),
    await verify(browser, "mobile", { width: 390, height: 844 }),
  ];
  console.log(JSON.stringify({ status: "passed", url: origin, results }, null, 2));
} finally {
  await browser.close();
}
