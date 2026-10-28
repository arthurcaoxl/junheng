import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
// 播种 v2 旧数据验证迁移：21 天完整记录
await page.evaluate(() => {
  const records = Array.from({ length: 21 }, (_, i) => ({
    weight: String(66 - i * 0.1), waist: String(98 - i * 0.15),
    meals: [i % 2 === 0, false, false], water: i % 3 === 0, movement: false, sleep: true,
  }));
  localStorage.setItem("junheng-checkin-v2", JSON.stringify(records));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1800);
const migrated = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("junheng-checkin-v3"));
  return { schema: s.schema, code: s.userCode, start: s.startDate, days: Object.keys(s.records).length };
});
console.log("migration:", JSON.stringify(migrated));
// 设置开营日为 25 天前 → 结营状态 + 全部日期可点
await page.locator("#camp-start-date").fill(await page.evaluate(() => {
  const d = new Date(); d.setDate(d.getDate() - 25);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}));
await page.waitForTimeout(600);
await page.evaluate(() => document.getElementById("check-in").scrollIntoView({ behavior: "instant" }));
await page.waitForTimeout(800);
await page.screenshot({ path: "validation-v1.7.0/camp-complete.png" });
// 海报导出（含营员代码与周期）
await page.locator("#record-name").fill("小菌");
await page.getByRole("button", { name: "导出记录海报" }).click();
await page.waitForTimeout(800);
await page.evaluate(() => document.querySelector(".poster-export").scrollIntoView({ behavior: "instant" }));
await page.waitForTimeout(500);
await page.screenshot({ path: "validation-v1.7.0/poster.png" });
const posterSrc = await page.locator(".poster-preview img").getAttribute("src");
console.log("poster generated:", posterSrc?.startsWith("data:image/png"));
// 导出海报 PNG 供人工查看
const base64 = posterSrc.split(",")[1];
const { writeFileSync } = await import("node:fs");
writeFileSync("validation-v1.7.0/poster-full.png", Buffer.from(base64, "base64"));
// 移动端
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => document.getElementById("check-in").scrollIntoView({ behavior: "instant" }));
await page.waitForTimeout(700);
await page.screenshot({ path: "validation-v1.7.0/mobile.png" });
console.log("errors:", errors);
await browser.close();
