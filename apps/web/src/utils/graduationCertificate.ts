import type { CheckInState } from "./checkin";
import { hasContent } from "./checkin";
import { buildWitnessSummary, getWitnessVariant } from "./witness";

export const GRADUATION_DAYS = 21;

/** 证书统计全部历史有效记录，允许非连续与跨期累计。 */
export function getLifetimeRecordedDays(state: CheckInState): number {
  return Object.values(state.records).filter(hasContent).length;
}

export function canGraduate(state: CheckInState): boolean {
  return getLifetimeRecordedDays(state) >= GRADUATION_DAYS;
}

export function getCertificateNumber(state: CheckInState): string {
  return `FUNGIBLEND-${state.startDate.slice(0, 4)}-${state.userCode.replace(/^JH-/, "").slice(-5)}`;
}

const WIDTH = 1200;
const HEIGHT = 1600;
const PAPER = "#F3EFE3";
const INK = "#173C2E";
const GOLD = "#A68A50";
const SEAL_RED = "#A63D2F";
export const WITNESS_NO_DATA_MESSAGE = "暂时没有可用于生成见证的体重或腰围记录，请先完成记录。";

function drawCorner(context: CanvasRenderingContext2D, x: number, y: number, xDirection: number, yDirection: number) {
  context.beginPath();
  context.moveTo(x + xDirection * 72, y);
  context.lineTo(x, y);
  context.lineTo(x, y + yDirection * 72);
  context.moveTo(x + xDirection * 44, y + yDirection * 14);
  context.lineTo(x + xDirection * 14, y + yDirection * 14);
  context.lineTo(x + xDirection * 14, y + yDirection * 44);
  context.stroke();
}

/**
 * 朱砂白文方章：实心印面 + 纸色内框 + 边缘做旧 + 轻微倾斜盖章。
 * 白文按传统读序右列先读（右上→右下→左上→左下）。
 */
function drawSeal(context: CanvasRenderingContext2D, x: number, y: number, size: number, text: string) {
  context.save();
  context.translate(x + size / 2, y + size / 2);
  context.rotate((Math.random() - 0.5) * 0.06);
  context.translate(-size / 2, -size / 2);

  context.fillStyle = SEAL_RED;
  context.fillRect(0, 0, size, size);

  // 印泥边缘做旧：少量不规则缺口，集中在磨损感而非均匀点缀
  context.fillStyle = PAPER;
  const chipCount = 16;
  for (let i = 0; i < chipCount; i += 1) {
    const side = Math.floor(Math.random() * 4);
    const pos = Math.random() * size;
    const speck = 2.5 + Math.random() * 3.5;
    const bite = 1 + Math.random() * 4;
    if (side === 0) context.fillRect(pos, 0, speck, speck + bite);
    else if (side === 1) context.fillRect(pos, size - speck - bite, speck, speck + bite);
    else if (side === 2) context.fillRect(0, pos, speck + bite, speck);
    else context.fillRect(size - speck - bite, pos, speck + bite, speck);
  }

  context.strokeStyle = PAPER;
  context.lineWidth = 2;
  context.strokeRect(7, 7, size - 14, size - 14);

  context.fillStyle = PAPER;
  context.font = "700 38px 'Songti SC', SimSun, serif";
  const cell = size / 2;
  const chars = [...text];
  context.fillText(chars[0], cell * 1.5, cell * 0.72);
  context.fillText(chars[1], cell * 1.5, cell * 1.7);
  context.fillText(chars[2], cell * 0.5, cell * 0.72);
  context.fillText(chars[3], cell * 0.5, cell * 1.7);
  context.restore();
}

/** 统一纸底见证：仅按 getWitnessVariant 切换正文、数据行与印章文字。 */
export function createGraduationCertificate(state: CheckInState, recordName = ""): string {
  if (!canGraduate(state)) throw new Error("累计有效记录不足 21 天");
  const variant = getWitnessVariant(state.records);
  const summary = buildWitnessSummary(state.records);
  if (!summary.hasMeasurements) throw new Error(WITNESS_NO_DATA_MESSAGE);

  const reward = variant === "reward";
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法生成见证，请更换浏览器后重试。");

  context.fillStyle = PAPER;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.strokeStyle = "rgba(23, 60, 46, 0.055)";
  context.lineWidth = 1;
  for (let y = 24; y < HEIGHT; y += 28) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(WIDTH, y);
    context.stroke();
  }
  context.strokeStyle = INK;
  context.lineWidth = 3;
  context.strokeRect(54, 54, WIDTH - 108, HEIGHT - 108);
  context.strokeStyle = GOLD;
  context.lineWidth = 1.5;
  context.strokeRect(72, 72, WIDTH - 144, HEIGHT - 144);
  drawCorner(context, 94, 94, 1, 1);
  drawCorner(context, WIDTH - 94, 94, -1, 1);
  drawCorner(context, 94, HEIGHT - 94, 1, -1);
  drawCorner(context, WIDTH - 94, HEIGHT - 94, -1, -1);

  context.textAlign = "center";
  context.fillStyle = GOLD;
  context.font = "20px sans-serif";
  context.fillText("FUNGIBLEND LIPID METABOLISM RESEARCH INSTITUTE", WIDTH / 2, 150);
  context.fillStyle = INK;
  context.font = "30px 'Songti SC', SimSun, serif";
  context.fillText("菌衡计划 · 脂代谢研究所", WIDTH / 2, 215);
  context.font = "42px 'Songti SC', SimSun, serif";
  context.fillText("21 天高阶脂代谢研究项目", WIDTH / 2, 330);
  context.font = "700 62px 'Songti SC', SimSun, serif";
  context.fillText("21天代谢重塑见证", WIDTH / 2, 425);
  context.fillStyle = GOLD;
  context.font = "20px sans-serif";
  context.fillText("WITNESSED · 21-DAY METABOLIC RESET", WIDTH / 2, 495);
  context.fillRect(400, 535, 400, 1);

  const displayName = (recordName.trim() || "脂代谢研究所会员").slice(0, 30);
  context.fillStyle = INK;
  context.font = `${displayName.length > 12 ? 38 : 54}px KaiTi, STKaiti, serif`;
  context.fillText(displayName, WIDTH / 2, 710);
  context.font = "27px 'Songti SC', SimSun, serif";
  context.fillText(
    reward
      ? "该会员已累计完成 21 天真实健康记录，代谢指标呈现积极向好趋势。特此见证。"
      : "体重不是唯一的答案。21 天全程记录，代谢的真实曲线已被你看见。特此见证。",
    WIDTH / 2,
    845,
  );

  context.fillStyle = GOLD;
  context.font = "20px sans-serif";
  context.fillText("见证编号", WIDTH / 2, 1040);
  context.fillStyle = INK;
  context.font = "26px monospace";
  context.fillText(getCertificateNumber(state), WIDTH / 2, 1090);
  context.font = "22px sans-serif";
  context.fillText(`体验官代码 ${state.userCode}`, WIDTH / 2, 1130);
  context.font = "24px 'Songti SC', SimSun, serif";
  const waistLine = summary.waistDelta !== null ? `腰围缩减 ${summary.waistDelta.toFixed(1)} cm` : "";
  const dataLine = reward
    ? [
        summary.weightDelta !== null && summary.weightDelta !== undefined
          ? `累计减重 ${summary.weightDelta.toFixed(1)} kg`
          : "",
        waistLine,
      ].filter(Boolean).join(" · ")
    : `累计有效记录：${getLifetimeRecordedDays(state)}天${waistLine ? ` · ${waistLine}` : ""}`;
  context.fillText(dataLine, WIDTH / 2, 1180);

  drawSeal(context, 878, 1176, 126, reward ? "减重达成" : "坚持达成");
  context.fillStyle = INK;
  context.font = "26px 'Songti SC', SimSun, serif";
  context.fillText("菌衡计划 · 脂代谢研究所", 500, 1260);

  context.fillStyle = "#665F52";
  context.font = "20px 'Songti SC', SimSun, serif";
  context.fillText("本见证仅纪念自我管理过程，不代表学历、职业资格、医疗或科研身份。", WIDTH / 2, 1400);
  context.fillText("记录仅用于个人健康管理，不构成医疗诊断或治疗依据。", WIDTH / 2, 1442);
  return canvas.toDataURL("image/png");
}
