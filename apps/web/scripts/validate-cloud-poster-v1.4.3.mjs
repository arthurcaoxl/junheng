import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";

const output = new URL("../cloud-verify-v1.4.3/", import.meta.url).pathname;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", acceptDownloads: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("https://rtrzqrxly4mlo.ok.kimi.link/?v=1.4.3#check-in", { waitUntil: "networkidle" });
  await page.getByText("网站版本 v1.4.3").waitFor();
  await page.getByLabel("姓名或网名").fill("小菌");
  await page.getByText("海报署名：小菌").waitFor();
  await page.getByRole("button", { name: "导出记录海报" }).click();
  const preview = page.getByRole("img", { name: "21 天健康记录海报预览" });
  await preview.waitFor();
  const dimensions = await preview.evaluate((image) => ({ width: image.naturalWidth, height: image.naturalHeight }));
  if (dimensions.width !== 1080 || dimensions.height !== 1920) throw new Error(`Bad dimensions: ${JSON.stringify(dimensions)}`);
  const event = page.waitForEvent("download");
  await page.getByRole("link", { name: "下载 PNG 海报" }).click();
  const download = await event;
  await download.saveAs(`${output}/named-poster.png`);
  const png = await readFile(`${output}/named-poster.png`);
  if (png.subarray(1, 4).toString() !== "PNG") throw new Error("Cloud poster is not a PNG");
  await page.locator(".record-identity").screenshot({ path: `${output}/name-field.png` });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(JSON.stringify({ status: "passed", version: "1.4.3", name: "小菌", dimensions, download: "passed", errors }, null, 2));
} finally {
  await browser.close();
}
