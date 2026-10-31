import type { CheckInState } from "./checkin";
import { hasContent } from "./checkin";

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

/** 新中式米白纸底会员纪念证书；不模拟官方印章或资质文件。 */
export function createGraduationCertificate(state: CheckInState, recordName = ""): string {
  if (!canGraduate(state)) throw new Error("累计有效记录不足 21 天");
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");

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
  context.font = "700 68px 'Songti SC', SimSun, serif";
  context.fillText("结业证书", WIDTH / 2, 425);
  context.fillStyle = GOLD;
  context.font = "24px 'Songti SC', SimSun, serif";
  context.fillText("会 员 成 长 纪 念", WIDTH / 2, 495);
  context.fillRect(400, 535, 400, 1);

  const displayName = (recordName.trim() || "脂代谢研究所会员").slice(0, 30);
  context.fillStyle = INK;
  context.font = `${displayName.length > 12 ? 38 : 54}px KaiTi, STKaiti, serif`;
  context.fillText(displayName, WIDTH / 2, 710);
  context.font = "28px 'Songti SC', SimSun, serif";
  context.fillText("该会员已累计完成 21 天真实健康记录，", WIDTH / 2, 830);
  context.fillText("以持续行动完成本期自我观察与成长。", WIDTH / 2, 880);
  context.fillText("特发此证，以作纪念。", WIDTH / 2, 950);

  context.fillStyle = GOLD;
  context.font = "20px sans-serif";
  context.fillText("证书编号", WIDTH / 2, 1050);
  context.fillStyle = INK;
  context.font = "26px monospace";
  context.fillText(getCertificateNumber(state), WIDTH / 2, 1100);
  context.font = "23px 'Songti SC', SimSun, serif";
  context.fillText(`累计有效记录：${getLifetimeRecordedDays(state)} 天`, WIDTH / 2, 1160);

  context.strokeStyle = RED;
  context.lineWidth = 4;
  context.strokeRect(890, 1185, 112, 112);
  context.fillStyle = RED;
  context.font = "24px 'Songti SC', SimSun, serif";
  context.fillText("会员纪念", 946, 1250);
  context.fillStyle = INK;
  context.font = "26px 'Songti SC', SimSun, serif";
  context.fillText("菌衡计划 · 脂代谢研究所", 500, 1260);

  context.fillStyle = "#665F52";
  context.font = "20px 'Songti SC', SimSun, serif";
  context.fillText("本证书为品牌内部会员成长纪念，不属于学历、职业资格、科研身份或医疗证明。", WIDTH / 2, 1400);
  context.fillText("记录仅用于个人健康管理，不构成医疗诊断或治疗依据。", WIDTH / 2, 1442);
  return canvas.toDataURL("image/png");
}
