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
const RED = "#8B3A32";
const REWARD_BACKGROUND = "#12362B";
const REWARD_INK = "#A3E635";

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

/** 21 天代谢重塑见证：正向变化使用深绿奖励牌，其余使用米白鼓励牌。 */
export function createGraduationCertificate(state: CheckInState, recordName = ""): string {
  if (!canGraduate(state)) throw new Error("累计有效记录不足 21 天");
  const variant = getWitnessVariant(state.records);
  const summary = buildWitnessSummary(state.records);
  if (!summary.hasMeasurements) throw new Error(WITNESS_NO_DATA_MESSAGE);

  const reward = variant === "reward";
  const palette = reward
    ? { background: REWARD_BACKGROUND, ink: REWARD_INK, accent: "#D8F99D", muted: "#D7E5DD", seal: REWARD_INK }
    : { background: PAPER, ink: INK, accent: GOLD, muted: "#665F52", seal: RED };

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法生成见证，请更换浏览器后重试。");

  context.fillStyle = palette.background;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.strokeStyle = reward ? "rgba(163, 230, 53, 0.08)" : "rgba(23, 60, 46, 0.055)";
  context.lineWidth = 1;
  for (let y = 24; y < HEIGHT; y += 28) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(WIDTH, y);
    context.stroke();
  }
  context.strokeStyle = palette.ink;
  context.lineWidth = 3;
  context.strokeRect(54, 54, WIDTH - 108, HEIGHT - 108);
  context.strokeStyle = palette.accent;
  context.lineWidth = 1.5;
  context.strokeRect(72, 72, WIDTH - 144, HEIGHT - 144);
  drawCorner(context, 94, 94, 1, 1);
  drawCorner(context, WIDTH - 94, 94, -1, 1);
  drawCorner(context, 94, HEIGHT - 94, 1, -1);
  drawCorner(context, WIDTH - 94, HEIGHT - 94, -1, -1);

  context.textAlign = "center";
  context.fillStyle = palette.accent;
  context.font = "20px sans-serif";
  context.fillText("FUNGIBLEND LIPID METABOLISM RESEARCH INSTITUTE", WIDTH / 2, 150);
  context.fillStyle = palette.ink;
  context.font = "30px 'Songti SC', SimSun, serif";
  context.fillText("菌衡计划 · 脂代谢研究所", WIDTH / 2, 215);
  context.font = "42px 'Songti SC', SimSun, serif";
  context.fillText("21 天 · 代谢重塑之旅", WIDTH / 2, 330);
  context.font = "700 68px 'Songti SC', SimSun, serif";
  context.fillText("21 天代谢重塑见证", WIDTH / 2, 425);
  context.fillStyle = palette.accent;
  context.font = "24px 'Songti SC', SimSun, serif";
  context.fillText(reward ? "自 律 有 迹 · 改 变 可 见" : "坚 持 记 录 · 身 体 自 有 答 案", WIDTH / 2, 495);
  context.fillRect(400, 535, 400, 1);

  const displayName = (recordName.trim() || "脂代谢研究所会员").slice(0, 30);
  context.fillStyle = palette.ink;
  context.font = `${displayName.length > 12 ? 38 : 54}px KaiTi, STKaiti, serif`;
  context.fillText(displayName, WIDTH / 2, 690);
  context.font = "28px 'Songti SC', SimSun, serif";
  if (reward) {
    context.fillText("你用持续记录，见证了身体的积极变化。", WIDTH / 2, 800);
    context.fillText("每一次如实记录，都让代谢趋势更加清晰。", WIDTH / 2, 850);
  } else {
    context.fillText("体重不是唯一的答案。", WIDTH / 2, 800);
    context.fillText("21 天全程记录，代谢的真实曲线已被你看见。", WIDTH / 2, 850);
  }

  const measurements = [
    reward && summary.weightDelta !== null && summary.weightDelta !== undefined
      ? `累计减重 ${summary.weightDelta.toFixed(1)} kg`
      : "",
    summary.waistDelta !== null ? `腰围缩减 ${summary.waistDelta.toFixed(1)} cm` : "",
  ].filter(Boolean).join(" · ");
  if (measurements) {
    context.fillStyle = palette.accent;
    context.font = "700 30px 'Songti SC', SimSun, serif";
    context.fillText(measurements, WIDTH / 2, 950);
  }

  context.fillStyle = palette.accent;
  context.font = "20px sans-serif";
  context.fillText("见证编号", WIDTH / 2, 1040);
  context.fillStyle = palette.ink;
  context.font = "26px monospace";
  context.fillText(getCertificateNumber(state), WIDTH / 2, 1090);
  context.font = "22px sans-serif";
  context.fillText(`体验官代码 ${state.userCode}`, WIDTH / 2, 1140);
  context.font = "23px 'Songti SC', SimSun, serif";
  context.fillText(`累计有效记录：${getLifetimeRecordedDays(state)} 天`, WIDTH / 2, 1190);

  context.strokeStyle = palette.seal;
  context.lineWidth = 4;
  context.strokeRect(890, 1185, 112, 112);
  context.fillStyle = palette.seal;
  context.font = "24px 'Songti SC', SimSun, serif";
  context.fillText(reward ? "减重达成" : "坚持达成", 946, 1250);
  context.fillStyle = palette.ink;
  context.font = "26px 'Songti SC', SimSun, serif";
  context.fillText("菌衡计划 · 脂代谢研究所", 500, 1260);

  context.fillStyle = palette.muted;
  context.font = "20px 'Songti SC', SimSun, serif";
  context.fillText("本见证仅纪念自我管理过程，不代表学历、职业资格、医疗或科研身份。", WIDTH / 2, 1400);
  context.fillText("记录仅用于个人健康管理，不构成医疗诊断或治疗依据。", WIDTH / 2, 1442);
  return canvas.toDataURL("image/png");
}
