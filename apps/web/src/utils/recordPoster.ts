import { siteConfig } from "../config/site";
import type { DayRecord } from "../types/checkin";
import { formatTrendValue } from "./trend";
import { getRepresentativeWeight } from "./weight";

const WIDTH = 1080;
const HEIGHT = 1920;

type TrendPoint = { day: number; value: number };

function numericValues(records: DayRecord[], metric: "weight" | "waist"): TrendPoint[] {
  return records.map((day, index) => ({
    day: index + 1,
    value: Number(metric === "weight" ? getRepresentativeWeight(day) : day.waist),
  }))
    .filter((point) => Number.isFinite(point.value) && point.value > 0);
}

function getExtremeLabelDays(points: TrendPoint[]) {
  const labelDays = new Set([points[0].day, points[points.length - 1].day]);
  let minIndex = 0;
  let maxIndex = 0;
  points.forEach((point, index) => {
    if (point.value < points[minIndex].value) minIndex = index;
    if (point.value > points[maxIndex].value) maxIndex = index;
  });
  labelDays.add(points[minIndex].day);
  labelDays.add(points[maxIndex].day);
  return labelDays;
}

function drawTrend(context: CanvasRenderingContext2D, records: DayRecord[], metric: "weight" | "waist", left: number, top: number) {
  const points = numericValues(records, metric);
  const title = metric === "weight" ? "体重趋势 / kg" : "腰围趋势 / cm";
  context.textAlign = "left";
  context.fillStyle = "#C6FF36";
  context.font = "600 28px sans-serif";
  context.fillText(title, left, top);
  context.fillStyle = "#F3F1E8";
  context.font = "22px sans-serif";
  context.fillText(points.length ? `已记录 ${points.length} / 21 天` : "暂无身体数据记录", left, top + 42);
  if (!points.length) return;
  const labelDays = getExtremeLabelDays(points);
  const values = points.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = Math.max(maximum - minimum, 1);
  const x = (day: number) => left + 40 + ((day - 1) / Math.max(records.length - 1, 1)) * 860;
  const y = (value: number) => top + 200 - ((value - minimum) / spread) * 120;
  context.strokeStyle = "#284438";
  context.lineWidth = 1.5;
  [80, 140, 200].forEach((offset) => {
    context.beginPath();
    context.moveTo(left + 30, top + offset);
    context.lineTo(left + 910, top + offset);
    context.stroke();
  });
  context.strokeStyle = "#C6FF36";
  context.fillStyle = "#C6FF36";
  context.lineWidth = 4;
  points.forEach((point, index) => {
    if (index > 0 && point.day === points[index - 1].day + 1) {
      context.beginPath();
      context.moveTo(x(points[index - 1].day), y(points[index - 1].value));
      context.lineTo(x(point.day), y(point.value));
      context.stroke();
    }
    context.beginPath();
    context.arc(x(point.day), y(point.value), 6, 0, Math.PI * 2);
    context.fill();
    if (labelDays.has(point.day)) {
      context.fillStyle = "#F3F1E8";
      context.font = "20px sans-serif";
      context.textAlign = "center";
      context.fillText(formatTrendValue(point.value), x(point.day), Math.max(y(point.value) - 16, top + 56));
      context.fillStyle = "#C6FF36";
    }
  });
  context.fillStyle = "#93A299";
  context.font = "18px sans-serif";
  context.textAlign = "center";
  [1, 7, 14, 21].forEach((day) => context.fillText(`D${day}`, x(day), top + 240));
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
  context.fillText("菌衡计划 | 脂代谢研究所 × 心脑健康营", 70, 100, 940);
  context.fillStyle = "#F3F1E8";
  context.font = "700 70px sans-serif";
  context.fillText("我的脂代谢健康记录", 70, 210, 940);
  context.font = "28px sans-serif";
  context.fillText("看见自己的节奏，不追赶固定数字。", 70, 270);
  context.fillStyle = "#C6FF36";
  context.font = "600 30px sans-serif";
  context.fillText(`记录人：${recordName.trim() || "健康体验官"}`, 70, 318);
  if (camp) {
    context.font = "24px sans-serif";
    context.fillText(`体验官代码：${camp.userCode}`, 560, 318);
  }
  context.fillStyle = "#C6FF36";
  context.fillRect(70, 350, 940, 1);

  drawTrend(context, records, "weight", 70, 450);
  drawTrend(context, records, "waist", 70, 790);

  const mealCount = records.reduce((total, day) => total + day.meals.filter(Boolean).length, 0);
  const waterCount = records.filter((day) => day.water).length;
  const movementCount = records.filter((day) => day.movement).length;
  const sleepCount = records.filter((day) => day.sleep).length;
  const habitSummary = `餐前饮用 ${mealCount}/63次 · 饮水 ${waterCount}/21天 · 运动 ${movementCount}/21天 · 作息 ${sleepCount}/21天`;
  context.fillStyle = "#F3F1E8";
  context.font = "24px sans-serif";
  context.fillText(habitSummary, 70, 1220, 940);
  if (camp) {
    context.fillStyle = "#C6FF36";
    context.fillText(`周期：${camp.startDate} 至 ${camp.endDate}`, 70, 1300);
  }

  context.fillStyle = "#C6FF36";
  context.fillRect(70, 1480, 940, 1);
  context.fillStyle = "#F3F1E8";
  context.font = "600 22px sans-serif";
  context.fillText(`加入${siteConfig.platform}，用真实记录陪伴长期健康管理。`, 70, 1680, 940);
  context.fillStyle = "#93A299";
  context.font = "20px sans-serif";
  context.fillText("本海报由本人主动生成，仅代表个人健康记录，不构成医疗诊断或产品功效承诺。", 70, 1740, 940);
  return canvas.toDataURL("image/png");
}
