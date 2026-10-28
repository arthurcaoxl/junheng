import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await page.evaluate(() => {
  const records = Array.from({ length: 21 }, (_, i) => ({
    weight: String(66 - i * 0.1), waist: String(98 - i * 0.15),
    meals: [i % 2 === 0, false, false], water: i % 3 === 0, movement: false, sleep: true,
  }));
  localStorage.setItem("junheng-checkin-v2", JSON.stringify(records));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const migrated = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("junheng-checkin-v3"));
  return { schema: s.schema, code: s.userCode, start: s.startDate, days: Object.keys(s.records).length };
});
console.log("migration:", JSON.stringify(migrated));
// 默认定位今天（第21天），结营横幅需把开营日再提前
await page.locator("#camp-start-date").fill(await page.evaluate(() => {
  const d = new Date(); d.setDate(d.getDate() - 25);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}));
await page.waitForTimeout(600);
await page.evaluate(() => document.querySelector(".camp-complete")?.scrollIntoView({ behavior: "instant", block: "center" }));
await page.waitForTimeout(500);
await page.screenshot({ path: "validation-v1.7.0/camp-complete.png" });
// 开营日调回 20 天前，让迁移数据落在窗口内，再出海报
await page.locator("#camp-start-date").fill(migrated.start);
await page.waitForTimeout(600);
await page.locator("#record-name").fill("小菌");
await page.getByRole("button", { name: "导出记录海报" }).click();
await page.waitForTimeout(700);
const posterSrc = await page.locator(".poster-preview img").getAttribute("src");
writeFileSync("validation-v1.7.0/poster-full.png", Buffer.from(posterSrc.split(",")[1], "base64"));
await page.evaluate(() => document.querySelector(".day-tabs").scrollIntoView({ behavior: "instant", block: "center" }));
await page.waitForTimeout(400);
await page.screenshot({ path: "validation-v1.7.0/day-tabs.png" });
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => document.querySelector(".record-identity").scrollIntoView({ behavior: "instant" }));
await page.waitForTimeout(500);
await page.screenshot({ path: "validation-v1.7.0/mobile.png" });
console.log("errors:", errors);
await browser.close();
