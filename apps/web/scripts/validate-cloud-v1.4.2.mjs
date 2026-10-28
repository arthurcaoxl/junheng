import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const origin = "https://rtrzqrxly4mlo.ok.kimi.link";
const output = new URL("../cloud-verify-v1.4.2/", import.meta.url).pathname;

async function validate(browser, name, path, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  const failedResponses = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`); });
  await page.goto(`${origin}${path}?v=1.4.2`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const primary = page.locator(".hero h1 .hero-title-primary");
  const secondary = page.locator(".hero h1 span").nth(1);
  await primary.waitFor();
  if (await primary.textContent() !== "餐前伴侣助力脂代谢") throw new Error(`${name}: cloud primary headline mismatch`);
  if (await secondary.textContent() !== "健康体重管理") throw new Error(`${name}: cloud secondary headline mismatch`);
  const subtitle = page.locator(path === "/" ? ".hero-subtitle" : ".hero .subtitle");
  for (const text of ["23种菌菇精华", "优质蛋白", "复合维生素"]) {
    if (!(await subtitle.textContent()).includes(text)) throw new Error(`${name}: missing ${text}`);
  }
  if (path === "/") await page.getByText("网站版本 v1.4.2").waitFor();
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (dimensions.scrollWidth > dimensions.width + 1) throw new Error(`${name}: cloud overflow ${JSON.stringify(dimensions)}`);
  const image = page.locator(".hero-media img");
  await image.waitFor();
  const imageLoaded = await image.evaluate((element) => element.complete && element.naturalWidth > 0);
  if (!imageLoaded) throw new Error(`${name}: hero image did not load`);
  await page.locator(".hero").screenshot({ path: `${output}/${name}-hero.png` });
  if (errors.length || failedResponses.length) throw new Error(`${name}: ${JSON.stringify({ errors, failedResponses })}`);
  await context.close();
  return { name, path, viewport, dimensions, headline: "passed", image: "loaded", errors: 0, failedResponses: 0 };
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const results = [];
  results.push(await validate(browser, "desktop", "/", { width: 1440, height: 1000 }));
  results.push(await validate(browser, "mobile-390", "/", { width: 390, height: 844 }));
  results.push(await validate(browser, "mobile-320", "/", { width: 320, height: 720 }));
  results.push(await validate(browser, "h5-390", "/h5/index.html", { width: 390, height: 844 }));
  results.push(await validate(browser, "h5-320", "/h5/index.html", { width: 320, height: 720 }));
  const report = { status: "passed", version: "1.4.2", origin, results };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
