import type { DayRecord } from "../components/SevenDayCheckIn";
import { formatTrendValue, selectTrendLabelDays } from "./trend";

const WIDTH = 1080;
const HEIGHT = 1920;

function numericValues(records: DayRecord[], metric: "weight" | "waist") {
  return records.map((day, index) => ({ day: index + 1, value: Number(day[metric]) }))
    .filter((point) => Number.isFinite(point.value) && point.value > 0);
}

function drawTrend(context: CanvasRenderingContext2D, records: DayRecord[], metric: "weight" | "waist", left: number, top: number) {
  const points = numericValues(records, metric);
  const title = metric === "weight" ? "体重趋势 / kg" : "腰围趋势 / cm";
  context.textAlign = "left";
  context.fillStyle = "#C6FF36";
  context.font = "600 30px sans-serif";
  context.fillText(title, left, top);
  context.fillStyle = "#F3F1E8";
  context.font = "24px sans-serif";
  context.fillText(points.length ? `已记录 ${points.length} / 21 天` : "暂无身体数据记录", left, top + 52);
  if (!points.length) return;
  const labelDays = selectTrendLabelDays(points);
  const values = points.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = Math.max(maximum - minimum, 1);
  const x = (day: number) => left + 40 + ((day - 1) / Math.max(records.length - 1, 1)) * 860;
  const y = (value: number) => top + 290 - ((value - minimum) / spread) * 170;
  context.strokeStyle = "#284438";
  context.lineWidth = 2;
  [120, 205, 290].forEach((offset) => {
    context.beginPath();
    context.moveTo(left + 30, top + offset);
    context.lineTo(left + 910, top + offset);
    context.stroke();
  });
  context.strokeStyle = "#C6FF36";
  context.fillStyle = "#C6FF36";
  context.lineWidth = 5;
  points.forEach((point, index) => {
    if (index > 0 && point.day === points[index - 1].day + 1) {
      context.beginPath();
      context.moveTo(x(points[index - 1].day), y(points[index - 1].value));
      context.lineTo(x(point.day), y(point.value));
      context.stroke();
    }
    context.beginPath();
    context.arc(x(point.day), y(point.value), 7, 0, Math.PI * 2);
    context.fill();
    if (labelDays.has(point.day)) {
      context.fillStyle = "#F3F1E8";
      context.font = "22px sans-serif";
      context.textAlign = "center";
      context.fillText(formatTrendValue(point.value), x(point.day), Math.max(y(point.value) - 18, top + 96));
      context.fillStyle = "#C6FF36";
    }
  });
  context.fillStyle = "#93A299";
  context.font = "20px sans-serif";
  context.textAlign = "center";
  [1, 5, 10, 15, 21].forEach((day) => context.fillText(`D${day}`, x(day), top + 340));
  context.textAlign = "left";
}

export type CampInfo = { userCode: string; startDate: string; endDate: string };

export function createRecordPoster(records: DayRecord[], recordName = "", camp?: CampInfo) {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  context.fillStyle = "#071C14";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = "#C6FF36";
  context.fillRect(0, 0, WIDTH, 20);
  context.font = "600 28px sans-serif";
  context.fillText("菌衡有道×心脑健康减脂营", 70, 100);
  context.fillStyle = "#F3F1E8";
  context.font = "700 72px sans-serif";
  context.fillText("我的 21 天健康记录", 70, 210);
  context.font = "28px sans-serif";
  context.fillText("看见自己的节奏，不追赶固定数字。", 70, 270);
  context.fillStyle = "#C6FF36";
  context.font = "600 30px sans-serif";
  context.fillText(`记录人：${recordName.trim() || "健康营员"}`, 70, 318);
  if (camp) {
    context.font = "24px sans-serif";
    context.fillText(`营员代码：${camp.userCode}`, 560, 318);
    context.fillText(`周期：${camp.startDate} 至 ${camp.endDate}`, 70, 1605);
  }
  context.fillStyle = "#C6FF36";
  context.fillRect(70, 350, 940, 1);
  drawTrend(context, records, "weight", 70, 430);
  drawTrend(context, records, "waist", 70, 870);
  const mealCount = records.reduce((total, day) => total + day.meals.filter(Boolean).length, 0);
  const waterCount = records.filter((day) => day.water).length;
  const movementCount = records.filter((day) => day.movement).length;
  const sleepCount = records.filter((day) => day.sleep).length;
  const stats = [
    ["餐前饮用", `${mealCount} / 63 次`],
    ["适量饮水", `${waterCount} / 21 天`],
    ["适量运动", `${movementCount} / 21 天`],
    ["规律作息", `${sleepCount} / 21 天`],
  ];
  stats.forEach(([label, value], index) => {
    const x = 70 + (index % 2) * 500;
    const y = 1340 + Math.floor(index / 2) * 150;
    context.fillStyle = "#C6FF36";
    context.font = "600 25px sans-serif";
    context.fillText(label, x, y);
    context.fillStyle = "#F3F1E8";
    context.font = "700 46px sans-serif";
    context.fillText(value, x, y + 65);
  });
  context.fillStyle = "#C6FF36";
  context.fillRect(70, 1650, 940, 1);
  context.fillStyle = "#F3F1E8";
  context.font = "700 32px sans-serif";
  context.fillText("餐前伴侣，助力脂代谢", 70, 1725);
  context.font = "22px sans-serif";
  context.fillText("仅为个人健康记录，不代表固定减重目标或产品功效。", 70, 1790);
  context.fillText("本海报由本人主动生成，仅供个人健康管理参考。", 70, 1835);
  return canvas.toDataURL("image/png");
}
