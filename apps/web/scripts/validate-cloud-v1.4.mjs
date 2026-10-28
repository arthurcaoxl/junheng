import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";

const origin = "https://rtrzqrxly4mlo.ok.kimi.link";
const output = new URL("../cloud-verify-v1.4/", import.meta.url).pathname;

async function verify(browser, name, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce", acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.url().startsWith(origin) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.locator("#perspective-title").filter({ hasText: "吃对了，营养打底" }).waitFor();
  await page.locator("#difference-title").filter({ hasText: "活性菌物营养" }).waitFor();
  await page.locator("#mechanism-title").filter({ hasText: "代谢营养 × 活性菌物" }).waitFor();
  await page.locator("#movement-title").filter({ hasText: "配合运动更高效" }).waitFor();
  await page.getByRole("heading", { name: "一天 24 小时：体重的“真实时间轴”" }).waitFor();
  await page.getByRole("heading", { name: "碳水与盐分" }).waitFor();
  await page.getByText(/PDCAAS.*满分 1.0/).waitFor();
  await page.getByText("网站版本 v1.4.0").waitFor();
  const sectionOrder = await page.locator("main > section").evaluateAll((sections) => sections.map((section) => section.id).slice(-3));
  if (sectionOrder.join(",") !== "movement,research,check-in") throw new Error(`${name}: wrong section order ${sectionOrder.join(",")}`);
  if (await page.locator(".day-tabs [role=tab]").count() !== 21) throw new Error(`${name}: wrong day tab count`);
  await page.getByText("点按餐盘分区，查看食物示例").waitFor();
  const plateClip = await page.locator(".plate-visual").evaluate((element) => {
    const style = getComputedStyle(element);
    return { overflow: style.overflow, padding: style.padding, radius: style.borderRadius, clipPath: style.clipPath };
  });
  if (plateClip.overflow !== "hidden" || plateClip.padding !== "0px" || plateClip.radius !== "50%" || plateClip.clipPath === "none") throw new Error(`${name}: plate clipping ${JSON.stringify(plateClip)}`);
  await page.locator("#plate-tab-1").click();
  await page.locator("#plate-tab-1").filter({ hasText: "正在查看" }).waitFor();
  await page.getByLabel("姓名或网名").fill("小菌");
  await page.locator(".body-metrics input").nth(0).fill("65.4");
  await page.locator(".body-metrics input").nth(1).fill("82");
  await page.getByLabel("早餐前已饮用").check();
  await page.getByRole("tab", { name: /第 21 天/ }).click();
  await page.locator(".body-metrics input").nth(0).fill("64.8");
  await page.locator(".body-metrics input").nth(1).fill("80.5");
  await page.reload({ waitUntil: "networkidle" });
  if (await page.getByLabel("姓名或网名").inputValue() !== "小菌") throw new Error(`${name}: name not restored`);
  if (await page.getByRole("img", { name: "体重趋势图" }).count() !== 1) throw new Error(`${name}: cloud weight trend missing`);
  if (await page.getByRole("img", { name: "腰围趋势图" }).count() !== 1) throw new Error(`${name}: cloud waist trend missing`);
  if (!(await page.getByLabel("早餐前已饮用").isChecked())) throw new Error(`${name}: meal record not restored`);
  await page.getByRole("button", { name: "导出记录海报" }).click();
  const poster = page.getByRole("img", { name: "21 天健康记录海报预览" });
  await poster.waitFor();
  if (await poster.evaluate((image) => image.naturalWidth) !== 1080) throw new Error(`${name}: invalid poster width`);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "下载 PNG 海报" }).click();
  const download = await downloadPromise;
  if (download.suggestedFilename() !== "菌衡有道-21天健康记录.png") throw new Error(`${name}: wrong download name`);
  const downloadPath = `${output}/${name}-21-day-record.png`;
  await download.saveAs(downloadPath);
  const png = await readFile(downloadPath);
  if (png.subarray(1, 4).toString() !== "PNG" || png.readUInt32BE(16) !== 1080 || png.readUInt32BE(20) !== 1440) throw new Error(`${name}: invalid downloaded PNG`);
  const overflow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (overflow.scrollWidth > overflow.width + 1) throw new Error(`${name}: overflow ${JSON.stringify(overflow)}`);
  await page.locator("#plate-guide").screenshot({ path: `${output}/${name}-plate.png` });
  await page.locator(".water-fluctuation").screenshot({ path: `${output}/${name}-water-science.png` });
  await page.locator("#check-in").screenshot({ path: `${output}/${name}-check-in.png` });
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
  return { name, version: "1.4.0", sectionOrder, dayTabs: 21, recordName: "restored", trends: "restored", migration: "passed", poster: "1080×1440 PNG", download: "downloaded", plateClip, overflow, errors: 0 };
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
