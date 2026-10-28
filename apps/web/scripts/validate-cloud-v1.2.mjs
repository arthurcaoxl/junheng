import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";

const origin = "https://rtrzqrxly4mlo.ok.kimi.link";
const output = new URL("../cloud-verify-v1.2/", import.meta.url).pathname;

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
  await page.getByText("网站版本 v1.2.0").waitFor();
  await page.locator(".body-metrics input").nth(0).fill("65.4");
  await page.locator(".body-metrics input").nth(1).fill("82");
  await page.getByRole("tab", { name: /第 7 天/ }).click();
  await page.locator(".body-metrics input").nth(0).fill("64.8");
  await page.locator(".body-metrics input").nth(1).fill("80.5");
  await page.reload({ waitUntil: "networkidle" });
  if (await page.getByRole("img", { name: "体重趋势图" }).count() !== 1) throw new Error(`${name}: cloud weight trend missing`);
  if (await page.getByRole("img", { name: "腰围趋势图" }).count() !== 1) throw new Error(`${name}: cloud waist trend missing`);
  await page.getByRole("button", { name: "导出记录海报" }).click();
  const poster = page.getByRole("img", { name: "7 天健康记录海报预览" });
  await poster.waitFor();
  if (await poster.evaluate((image) => image.naturalWidth) !== 1080) throw new Error(`${name}: invalid poster width`);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "下载 PNG 海报" }).click();
  const download = await downloadPromise;
  if (download.suggestedFilename() !== "菌衡有道-7天健康记录.png") throw new Error(`${name}: wrong download name`);
  const downloadPath = await download.path();
  const signature = await readFile(downloadPath);
  if (signature.subarray(1, 4).toString() !== "PNG") throw new Error(`${name}: download is not PNG`);
  const overflow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (overflow.scrollWidth > overflow.width + 1) throw new Error(`${name}: overflow ${JSON.stringify(overflow)}`);
  await page.locator("#check-in").screenshot({ path: `${output}/${name}-check-in.png` });
  if (errors.length) throw new Error(`${name}: ${errors.join("\n")}`);
  await context.close();
  return { name, version: "1.2.0", trends: "restored", poster: "1080px PNG", download: "downloaded", overflow, errors: 0 };
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
